import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm, lstat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectWallpaper, moveToTrash, publishDirectory, stagingWorkshopDirectory, wallpaperDirectory } from '../../packages/wallpaper-files/src';
let root: string;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'wm-integration-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
async function staging(job: string, id = '123') { const source = stagingWorkshopDirectory(path.join(root, 'staging'), job, id); await mkdir(source, { recursive: true }); await copyFile(path.resolve('tests/fixtures/scene-project.json'), path.join(source, 'project.json')); await writeFile(path.join(source, 'scene.pkg'), 'scene-fixture'); return source; }
describe('publication integration', () => {
  it('publishes a valid original Scene atomically', async () => { const id = randomUUID(); const source = await staging(id); const destination = await publishDirectory(source, path.join(root, 'steam-data'), '123'); expect(JSON.parse(await readFile(path.join(destination, 'project.json'), 'utf8')).type).toBe('scene'); await expect(lstat(source)).rejects.toThrow(); });
  it('rejects missing project and Application without publishing', async () => { const id = randomUUID(); const source = await staging(id); await rm(path.join(source, 'project.json')); await expect(inspectWallpaper(source)).rejects.toMatchObject({ code: 'INVALID_PROJECT' }); await copyFile(path.resolve('tests/fixtures/application-project.json'), path.join(source, 'project.json')); await expect(inspectWallpaper(source)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' }); await expect(lstat(wallpaperDirectory(path.join(root, 'steam-data'), '123'))).rejects.toThrow(); });
  it('moves deletion to trash without a half-deleted destination', async () => { const id = randomUUID(); await publishDirectory(await staging(id), path.join(root, 'steam-data'), '123'); const trash = await moveToTrash(path.join(root, 'steam-data'), path.join(root, 'trash'), '123', id); expect(await readFile(path.join(trash, 'project.json'), 'utf8')).toContain('Fixture Scene'); await expect(lstat(wallpaperDirectory(path.join(root, 'steam-data'), '123'))).rejects.toThrow(); });
});
