import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';

test('browser cache is opt-in, versioned, range-aware, and clearable', async ({ page }) => {
  let updatedAt = '2026-01-01T00:00:00.000Z';
  let content = 'video-content-v1';
  let networkRequests = 0;
  const server = createServer((request, response) => {
    if (request.url !== '/api/wallpapers/123/resources/video.mp4') {
      response.writeHead(404).end();
      return;
    }
    networkRequests += 1;
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(Buffer.byteLength(content)), 'Accept-Ranges': 'bytes' }).end(content);
  });
  await new Promise<void>((resolve) => server.listen(3000, '127.0.0.1', resolve));
  try {
    const wallpaper = {
      workshopId: '123', title: 'Cached video', description: null, type: 'video', contentRating: 'everyone', subscribed: false, favorited: false,
      officialPreviewUrl: null, metadataJson: {}, localRelativePath: '123', status: 'downloaded', fileSizeBytes: '1024',
      lastErrorCode: null, lastErrorMessage: null, downloadedAt: updatedAt, createdAt: updatedAt, updatedAt,
    };
    await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...wallpaper, localStatus: 'downloaded', previewContentType: null } }));
    await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: { ...wallpaper, updatedAt } }));
    await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'local-video', type: 'video', resourceBaseUrl: '/api/wallpapers/123/resources', entry: 'video.mp4', fallbackPreviewUrl: null, degraded: false, message: null } }));
    await page.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.2' } }));
    await page.route('**/api/steam/auth/status', (route) => route.fulfill({ json: { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt } }));
    await page.route('**/api/steam/auth/qr', (route) => route.fulfill({ json: { status: 'auth_required', qrCode: null, updatedAt: null } }));
    await page.route('**/api/wallpapers?**', (route) => route.fulfill({ json: { items: [wallpaper], page: 1, pageSize: 100, total: 1 } }));

    await page.goto('/settings');
    const toggle = page.getByRole('switch', { name: '在此浏览器中缓存壁纸资源', exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.check();

    await page.goto('/wallpaper/123');
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });
    const load = async (range?: string) => page.evaluate(async ({ range }) => {
      const response = await fetch('/api/wallpapers/123/resources/video.mp4', range ? { headers: { Range: range } } : undefined);
      return { status: response.status, cache: response.headers.get('x-wallpaper-cache'), contentRange: response.headers.get('content-range'), body: await response.text() };
    }, { range });

    expect(await load()).toMatchObject({ status: 200, cache: 'MISS', body: 'video-content-v1' });
    expect(await load()).toMatchObject({ status: 200, cache: 'HIT', body: 'video-content-v1' });
    expect(await load('bytes=0-4')).toMatchObject({ status: 206, cache: 'HIT', contentRange: 'bytes 0-4/16', body: 'video' });
    expect(networkRequests).toBe(1);

    updatedAt = '2026-01-02T00:00:00.000Z';
    content = 'video-content-v2';
    await page.reload();
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });
    expect(await load()).toMatchObject({ status: 200, cache: 'MISS', body: 'video-content-v2' });
    expect(await load()).toMatchObject({ status: 200, cache: 'HIT', body: 'video-content-v2' });
    expect(networkRequests).toBe(2);

    await page.goto('/settings');
    await expect(page.getByText('16 B · 1 个文件', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清除浏览器缓存', exact: true }).click();
    await expect(page.getByText('0 B · 0 个文件', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '清除浏览器缓存', exact: true })).toBeEnabled();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function cacheState(page: Page, key: string) {
  return page.evaluate(async (key) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wallpaper-browser-cache-v1', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction('state', 'readonly').objectStore('state').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value ?? null;
  }, key);
}

async function cachedEntries(page: Page) {
  return page.evaluate(async () => {
    let entries = 0;
    for (const name of await caches.keys()) {
      if (!name.startsWith('wallpaper-resources-')) continue;
      entries += (await (await caches.open(name)).keys()).length;
    }
    return entries;
  });
}

async function fetchResource(page: Page, url: string) {
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, cache: response.headers.get('x-wallpaper-cache'), body: await response.text() };
  }, url);
}

test('concurrent downloads and controls cannot resurrect stale cache', async ({ page, context }) => {
  test.setTimeout(90000);
  let updatedAt = '2026-01-01T00:00:00.000Z';
  let content = 'video-content-v1';
  const counts = new Map<string, number>();
  const gates = new Map<string, Promise<void>>();
  const started = new Map<string, () => void>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '', 'http://127.0.0.1');
    if (url.pathname !== '/api/wallpapers/123/resources/video.mp4') {
      response.writeHead(404).end();
      return;
    }
    const name = url.searchParams.get('case') || '';
    counts.set(name, (counts.get(name) || 0) + 1);
    started.get(name)?.();
    if (gates.has(name)) await gates.get(name);
    if (name === 'abort' && counts.get(name) === 1) {
      response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(Buffer.byteLength(content)) });
      response.write(content.slice(0, 5));
      setTimeout(() => response.destroy(), 20);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(Buffer.byteLength(content)), 'Accept-Ranges': 'bytes' }).end(content);
  });
  await new Promise<void>((resolve) => server.listen(3000, '127.0.0.1', resolve));
  const other = await context.newPage();
  try {
    const wallpaper = {
      workshopId: '123', title: 'Concurrent video', description: null, type: 'video', contentRating: 'everyone', subscribed: false, favorited: false,
      officialPreviewUrl: null, metadataJson: {}, localRelativePath: '123', status: 'downloaded', fileSizeBytes: '1024',
      lastErrorCode: null, lastErrorMessage: null, downloadedAt: updatedAt, createdAt: updatedAt, updatedAt,
    };
    await context.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...wallpaper, localStatus: 'downloaded', previewContentType: null } }));
    await context.route('**/api/wallpapers/123', (route) => route.fulfill({ json: { ...wallpaper, updatedAt } }));
    await context.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'local-video', type: 'video', resourceBaseUrl: '/api/wallpapers/123/resources', entry: 'video.mp4', fallbackPreviewUrl: null, degraded: false, message: null } }));
    await context.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.2' } }));
    await context.route('**/api/steam/auth/status', (route) => route.fulfill({ json: { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt } }));
    await context.route('**/api/steam/auth/qr', (route) => route.fulfill({ json: { status: 'auth_required', qrCode: null, updatedAt: null } }));
    await context.route('**/api/wallpapers?**', (route) => route.fulfill({ json: { items: [wallpaper], page: 1, pageSize: 100, total: 1 } }));

    await page.goto('/settings');
    await page.getByRole('switch', { name: '在此浏览器中缓存壁纸资源', exact: true }).check();
    await page.goto('/wallpaper/123');
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });

    const dedupUrl = '/api/wallpapers/123/resources/video.mp4?case=dedup';
    const dedup = await Promise.all([fetchResource(page, dedupUrl), fetchResource(page, dedupUrl)]);
    expect(dedup.every((item) => item.cache === 'MISS' && item.body === 'video-content-v1')).toBe(true);
    expect(counts.get('dedup')).toBe(1);

    let releaseClear!: () => void;
    gates.set('clear', new Promise<void>((resolve) => { releaseClear = resolve; }));
    const clearStarted = new Promise<void>((resolve) => started.set('clear', resolve));
    const clearDownload = fetchResource(page, '/api/wallpapers/123/resources/video.mp4?case=clear');
    await clearStarted;
    await other.goto('/settings');
    await other.getByRole('button', { name: '清除浏览器缓存', exact: true }).click();
    await expect(other.getByText('0 B · 0 个文件', { exact: true })).toBeVisible();
    releaseClear();
    expect((await clearDownload).body).toBe('video-content-v1');
    expect(await cachedEntries(page)).toBe(0);

    let releaseDisable!: () => void;
    gates.set('disable', new Promise<void>((resolve) => { releaseDisable = resolve; }));
    const disableStarted = new Promise<void>((resolve) => started.set('disable', resolve));
    const disableDownload = fetchResource(page, '/api/wallpapers/123/resources/video.mp4?case=disable');
    await disableStarted;
    await other.getByRole('switch', { name: '在此浏览器中缓存壁纸资源', exact: true }).uncheck();
    await expect.poll(() => cacheState(other, 'enabled')).toBe(false);
    releaseDisable();
    expect((await disableDownload).body).toBe('video-content-v1');
    expect(await cachedEntries(page)).toBe(0);

    await other.getByRole('switch', { name: '在此浏览器中缓存壁纸资源', exact: true }).check();
    await expect.poll(() => cacheState(other, 'enabled')).toBe(true);
    updatedAt = '2026-01-02T00:00:00.000Z';
    content = 'video-content-v2';
    await page.reload();
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });
    expect(await fetchResource(page, '/api/wallpapers/123/resources/video.mp4?case=version')).toMatchObject({ cache: 'MISS', body: 'video-content-v2' });

    updatedAt = '2026-01-01T00:00:00.000Z';
    content = 'video-content-v1';
    await page.reload();
    await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
    await expect(page.getByLabel('本地视频实时预览')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => cacheState(page, 'version:123')).toBe('2026-01-02T00:00:00.000Z');
    expect(await fetchResource(page, '/api/wallpapers/123/resources/video.mp4?case=version')).toMatchObject({ cache: 'HIT', body: 'video-content-v2' });
    expect(counts.get('version')).toBe(1);

    const abortUrl = '/api/wallpapers/123/resources/video.mp4?case=abort';
    expect(await fetchResource(page, abortUrl)).toMatchObject({ cache: 'MISS', body: 'video-content-v1' });
    expect(await fetchResource(page, abortUrl)).toMatchObject({ cache: 'HIT', body: 'video-content-v1' });
    expect(counts.get('abort')).toBe(2);
  } finally {
    await other.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

