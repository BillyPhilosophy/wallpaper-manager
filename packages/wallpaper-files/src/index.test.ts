import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertWorkshopId, workshopRoot, safeRelativePath, inspectWallpaper, resolveResourcePath, previewDescriptor, sanitizeError, WallpaperFileError } from './index';
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'wm-files-')); });
afterEach(async () => { rm(root, { recursive: true, force: true }); });
describe('paths', () => {
  it('validates IDs and derives the frozen path', () => { expect(workshopRoot('/steam')).toBe(path.join('/steam', 'steamapps/workshop/content/431960')); expect(() => assertWorkshopId('../1')).toThrow(); });
  it.each(['../secret', '/etc/passwd', '..%2fsecret', '%2e%2e/secret', 'a//b', 'a\\b'])('rejects %s', (value) => expect(() => safeRelativePath(value)).toThrow(WallpaperFileError));
});
describe('project parsing', () => {
  it('recognizes scene and web entries', async () => {
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ type: 'scene' })); await writeFile(path.join(root, 'scene.pkg'), 'fixture');
    expect((await inspectWallpaper(root)).entry).toBe('scene.pkg');
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ type: 'web', file: 'index.html' })); await writeFile(path.join(root, 'index.html'), '<html>');
    expect((await inspectWallpaper(root)).type).toBe('web');
  });
  it('locates nested and case-insensitive scene packages while honoring declared entries', async () => {
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ type: 'scene' }));
    await writeFile(path.join(root, 'nested', 'Scene.PKG'), 'fixture');
    expect((await inspectWallpaper(root)).entry).toBe('nested/Scene.PKG');
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ type: 'scene', file: 'NESTED/SCENE.PKG' }));
    expect((await inspectWallpaper(root)).entry).toBe('nested/Scene.PKG');
    await writeFile(path.join(root, 'scene.pkg'), 'other');
    expect((await inspectWallpaper(root)).entry).toBe('nested/Scene.PKG');
  });
  it('reads content rating and validates image entries', async () => {
    await writeFile(path.join(root, 'project.json'), JSON.stringify({ type: 'image', file: 'wallpaper.png', contentrating: 'PG13' })); await writeFile(path.join(root, 'wallpaper.png'), 'fixture');
    const info = await inspectWallpaper(root);
    expect(info.type).toBe('image'); expect(info.contentRating).toBe('pg13');
  });
  it('rejects missing project and application', async () => { await expect(inspectWallpaper(root)).rejects.toMatchObject({ code: 'INVALID_PROJECT' }); await writeFile(path.join(root, 'project.json'), '{"type":"application"}'); await expect(inspectWallpaper(root)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' }); });
});
describe('resource security', () => {
  it('blocks traversal and symlink escape', async () => {
    const dir = path.join(workshopRoot(root), '123'); await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, 'ok.txt'), 'ok'); await writeFile(path.join(root, 'secret'), 'no');
    expect(await resolveResourcePath(root, '123', 'ok.txt')).toContain('ok.txt');
    await expect(resolveResourcePath(root, '123', '../../secret')).rejects.toMatchObject({ code: 'PATH_UNSAFE' });
    try { await symlink(path.join(root, 'secret'), path.join(dir, 'escape')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM' && process.platform === 'win32') return; throw error; }
    await expect(resolveResourcePath(root, '123', 'escape')).rejects.toMatchObject({ code: 'PATH_UNSAFE' });
  });
});
it('creates supported and degraded descriptors', () => { expect(previewDescriptor('1', 'scene', 'scene.pkg', null, true).mode).toBe('webwallgl'); expect(previewDescriptor('1', 'application', null, null, true).degraded).toBe(true); });
it('redacts secrets', () => { expect(sanitizeError(new WallpaperFileError('INVALID_PROJECT', 'password=hunter2')).message).not.toContain('hunter2'); });
