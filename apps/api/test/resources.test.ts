import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { wallpaperDirectory } from '@wallpaper-manager/wallpaper-files';
import { WallpapersController } from '../src/wallpapers/wallpapers.controller';

function responseRecorder() {
  const headers = new Map<string, string>();
  const chunks: Buffer[] = [];
  let statusCode = 200;
  const response = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } }) as any;
  response.setHeader = (name: string, value: string) => { headers.set(name.toLowerCase(), value); return response; };
  response.status = (value: number) => { statusCode = value; return response; };
  return {
    response,
    headers,
    body: () => Buffer.concat(chunks).toString(),
    status: () => statusCode,
    finished: () => new Promise<void>((resolve) => response.once('finish', resolve)),
  };
}

describe('wallpaper resource HTTP caching', () => {
  it('supports ETag revalidation, ranges, and If-Range fallback', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'wm-resource-cache-'));
    const previousRoot = process.env.STEAM_ROOT;
    try {
      const directory = wallpaperDirectory(root, '123');
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'video.mp4'), '0123456789');
      process.env.STEAM_ROOT = root;
      const controller = new WallpapersController({} as any);
      const request = (headers: Record<string, string> = {}) => ({ params: { resourcePath: ['video.mp4'] }, headers, method: 'GET' }) as any;

      const first = responseRecorder();
      const finished = first.finished();
      await controller.resource('123', request(), first.response);
      await finished;
      expect(first.status()).toBe(200);
      expect(first.headers.get('cache-control')).toBe('private, max-age=600');
      expect(first.headers.get('etag')).toBeTruthy();
      expect(first.body()).toBe('0123456789');

      const cached = responseRecorder();
      await controller.resource('123', request({ 'if-none-match': first.headers.get('etag')! }), cached.response);
      expect(cached.status()).toBe(304);
      expect(cached.body()).toBe('');

      const staleRange = responseRecorder();
      const staleFinished = staleRange.finished();
      await controller.resource('123', request({ range: 'bytes=0-3', 'if-range': '"stale"' }), staleRange.response);
      await staleFinished;
      expect(staleRange.status()).toBe(200);
      expect(staleRange.body()).toBe('0123456789');

      const range = responseRecorder();
      const rangeFinished = range.finished();
      await controller.resource('123', request({ range: 'bytes=2-5' }), range.response);
      await rangeFinished;
      expect(range.status()).toBe(206);
      expect(range.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(range.body()).toBe('2345');
    } finally {
      if (previousRoot === undefined) delete process.env.STEAM_ROOT; else process.env.STEAM_ROOT = previousRoot;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
