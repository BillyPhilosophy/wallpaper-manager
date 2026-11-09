import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { wallpaperDirectory } from '@wallpaper-manager/wallpaper-files';
import { WallpapersController } from '../src/wallpapers/wallpapers.controller';
import { extractWebShim, injectWebShim, readWebShim } from '../src/wallpapers/web-shim';

describe('Web wallpaper shim', () => {
  it('extracts and cooks the pinned WebWallGL shim bundle', async () => {
    expect(extractWebShim('const shimSource = `window.__we = "line\\n";`;')).toBe('window.__we = "line\n";');
    expect(extractWebShim('const shimSource = `window.__we = "${value}";`;')).toBe('');
    expect(await readWebShim()).toContain('wallpaperPropertyListener');
  });

  it('injects the site root and shim before author scripts only once', () => {
    const html = '<html><head><script>window.author = true;</script></head></html>';
    const result = injectWebShim(html, 'window.__we = true;</script><script>window.bad = true;</script>', '/api/wallpapers/123/resources/');
    expect(result).toContain('window.__weSiteRoot="/api/wallpapers/123/resources/"');
    expect(result).toContain('<\\/script><script>window.bad = true;<\\/script>');
    expect(result.indexOf('data-wm-we-shim')).toBeLessThan(result.indexOf('window.author'));
    expect(injectWebShim(result, 'window.__we = true;', '/api/wallpapers/123/resources/')).toBe(result);
  });

  it('serves a real wallpaper HTML entry with the shim', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'wm-web-shim-'));
    const previousRoot = process.env.STEAM_ROOT;
    try {
      const directory = wallpaperDirectory(root, '123');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'index.html'), '<html><head></head><body>wallpaper</body></html>');
      process.env.STEAM_ROOT = root;
      const response = { setHeader: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), send: vi.fn(), end: vi.fn() };
      const request = { params: { resourcePath: ['index.html'] }, headers: {}, method: 'GET' };
      await new WallpapersController({} as any).resource('123', request as any, response as any);
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.send.mock.calls[0][0]).toContain('wallpaperPropertyListener');
      expect(response.send.mock.calls[0][0]).toContain('window.__weSiteRoot="/api/wallpapers/123/resources/"');
    } finally {
      if (previousRoot === undefined) delete process.env.STEAM_ROOT; else process.env.STEAM_ROOT = previousRoot;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
