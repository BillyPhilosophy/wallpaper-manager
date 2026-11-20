import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';

test('video cache is preview-only and supports hits, ranges, and clearing', async ({ page }) => {
  const counts = new Map<string, number>();
  const server = createServer((request, response) => {
    const url = new URL(request.url || '', 'http://127.0.0.1');
    if (url.pathname !== '/api/wallpapers/123/resources/video.mp4') { response.writeHead(404).end(); return; }
    const key = url.search || '';
    counts.set(key, (counts.get(key) || 0) + 1);
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '16', 'Accept-Ranges': 'bytes' }).end('video-content-v1');
  });
  await new Promise<void>((resolve) => server.listen(3000, '127.0.0.1', resolve));
  try {
    const updatedAt = '2026-01-01T00:00:00.000Z';
    const wallpaper = { workshopId: '123', title: 'Cached video', description: null, type: 'video', contentRating: 'everyone', subscribed: false, favorited: false, officialPreviewUrl: null, metadataJson: {}, localRelativePath: '123', status: 'downloaded', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: updatedAt, createdAt: updatedAt, updatedAt };
    await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...wallpaper, localStatus: 'downloaded', previewContentType: null } }));
    await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: wallpaper }));
    await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'local-video', type: 'video', resourceBaseUrl: '/api/wallpapers/123/resources', entry: 'video.mp4', fallbackPreviewUrl: null, degraded: false, message: null } }));
    await page.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.2' } }));
    await page.route('**/api/steam/auth/status', (route) => route.fulfill({ json: { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt } }));
    await page.route('**/api/steam/auth/qr', (route) => route.fulfill({ json: { status: 'auth_required', qrCode: null, updatedAt: null } }));
    await page.route('**/api/wallpapers?**', (route) => route.fulfill({ json: { items: [wallpaper], page: 1, pageSize: 100, total: 1 } }));

    await page.goto('/settings');
    await page.getByRole('switch', { name: '仅视频离线缓存', exact: true }).check();
    await page.goto('/wallpaper/123');
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });

    const cachedUrl = '/api/wallpapers/123/resources/video.mp4?wm-video-cache=1';
    const load = async (url: string, range?: string) => page.evaluate(async ({ url, range }) => {
      const response = await fetch(url, range ? { headers: { Range: range } } : undefined);
      return { status: response.status, cache: response.headers.get('x-wallpaper-cache'), body: await response.text() };
    }, { url, range });
    expect(await load(cachedUrl)).toMatchObject({ status: 200, cache: 'MISS', body: 'video-content-v1' });
    expect(await load(cachedUrl)).toMatchObject({ status: 200, cache: 'HIT', body: 'video-content-v1' });
    expect(await load(cachedUrl, 'bytes=0-4')).toMatchObject({ status: 206, cache: 'HIT', body: 'video' });
    expect(counts.get('?wm-video-cache=1')).toBe(1);

    expect(await load('/api/wallpapers/123/resources/video.mp4')).toMatchObject({ status: 200, cache: null, body: 'video-content-v1' });
    expect(counts.get('')).toBe(1);

    await page.goto('/settings');
    await page.getByRole('button', { name: '清除浏览器缓存', exact: true }).click();
    await expect(page.getByText('0 B · 0 个文件', { exact: true })).toBeVisible();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
