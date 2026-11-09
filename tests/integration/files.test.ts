import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm, lstat } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectWallpaper, moveToTrash, publishDirectory, stagingWorkshopDirectory, wallpaperDirectory } from '../../packages/wallpaper-files/src';
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'wm-integration-')); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
async function staging(job: string, id = '123') { const source = stagingWorkshopDirectory(path.join(root, 'staging'), job, id); await mkdir(source, { recursive: true }); await copyFile(path.resolve('tests/fixtures/scene-project.json'), path.join(source, 'project.json')); await writeFile(path.join(source, 'scene.pkg'), 'scene-fixture'); return source; }
describe('publication integration', () => {
  it('publishes a valid original Scene atomically', async () => { const id = randomUUID(); const source = await staging(id); const destination = await publishDirectory(source, path.join(root, 'steam-data'), '123'); expect(JSON.parse(await readFile(path.join(destination, 'project.json'), 'utf8')).type).toBe('scene'); await expect(lstat(source)).rejects.toThrow(); });
  it('rejects missing project and Application without publishing', async () => { const id = randomUUID(); const source = await staging(id); await rm(path.join(source, 'project.json')); await expect(inspectWallpaper(source)).rejects.toMatchObject({ code: 'INVALID_PROJECT' }); await copyFile(path.resolve('tests/fixtures/application-project.json'), path.join(source, 'project.json')); await expect(inspectWallpaper(source)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' }); await expect(lstat(wallpaperDirectory(path.join(root, 'steam-data'), '123'))).rejects.toThrow(); });
  it('moves deletion to trash without a half-deleted destination', async () => { const id = randomUUID(); await publishDirectory(await staging(id), path.join(root, 'steam-data'), '123'); const trash = await moveToTrash(path.join(root, 'steam-data'), path.join(root, 'trash'), '123', id); expect(await readFile(path.join(trash, 'project.json'), 'utf8')).toContain('Fixture Scene'); await expect(lstat(wallpaperDirectory(path.join(root, 'steam-data'), '123'))).rejects.toThrow(); });
  it('publishes across a device boundary by copying when rename reports EXDEV', async () => {
    const id = randomUUID();
    const source = await staging(id);
    // 模拟 staging 与 steam-data 跨文件系统（steam-data 挂移动硬盘）：rename 抛 EXDEV，应退化为 copy+删除。
    const spy = vi.spyOn(fsPromises, 'rename').mockRejectedValueOnce(Object.assign(new Error('EXDEV'), { code: 'EXDEV' }));
    const destination = await publishDirectory(source, path.join(root, 'steam-data'), '123');
    expect(spy).toHaveBeenCalled();
    expect(JSON.parse(await readFile(path.join(destination, 'project.json'), 'utf8')).type).toBe('scene');
    expect(await readFile(path.join(destination, 'scene.pkg'), 'utf8')).toBe('scene-fixture');
    await expect(lstat(source)).rejects.toThrow();
  });
});
