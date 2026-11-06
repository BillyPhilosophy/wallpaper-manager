import { test, expect } from '@playwright/test';
const item = { workshopId: '123', title: 'Aurora Landscape', description: 'Fixture scene', type: 'scene', officialPreviewUrl: null, previewContentType: null, metadataJson: { title: 'Aurora Landscape' }, localStatus: 'not_downloaded' };
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
});
test('search, enqueue and download-center journey', async ({ page }) => {
  await page.route('**/api/workshop/search**', (route) => route.fulfill({ json: { items: [item], cursor: null, total: 1 } }));
  await page.route('**/api/wallpapers/123/download', (route) => route.fulfill({ json: { job: { id: crypto.randomUUID(), workshopId: '123', status: 'queued', attempt: 1 } } }));
  await page.route('**/api/downloads?**', (route) => route.fulfill({ json: { items: [{ id: '6f67e62b-8a27-4d2b-a77f-e42c67538e45', workshopId: '123', status: 'queued', attempt: 1, errorCode: null, errorMessage: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null }], page: 1, pageSize: 50, total: 1 } }));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '发现下一张壁纸' })).toBeVisible(); await expect(page.getByText('Aurora Landscape')).toBeVisible(); await page.getByRole('button', { name: '下载', exact: true }).click();
  await page.getByRole('link', { name: '下载中心' }).click(); await expect(page.getByText('等待 Worker 领取')).toBeVisible(); await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
});
test('QR login is the default Steam sign-in action', async ({ page }) => {
  let started = false;
  const authState = { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt: new Date().toISOString() };
  await page.route('**/api/steam/auth/status', (route) => route.fulfill({ json: started ? { ...authState, status: 'qr_required' } : authState }));
  await page.route('**/api/steam/auth/qr', (route) => {
    if (route.request().method() === 'POST') started = true;
    return route.fulfill({ json: { status: 'qr_required', qrCode: '██  ██  \n  ████  \n██  ██  \n', updatedAt: new Date().toISOString() } });
  });
  await page.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.0' } }));
  await page.route('**/api/workshop/subscriptions/sync', (route) => route.fulfill({ json: { status: 'idle', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() } }));
  await page.goto('/settings');
  await page.getByRole('button', { name: '扫码登录', exact: true }).click();
  const qr = page.getByLabel('Steam 登录二维码');
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(0);
  await expect(page.getByText('等待手机扫码')).toBeVisible();
});
test('downloaded unsupported type shows official fallback', async ({ page }) => {
  const local = { ...item, localStatus: 'downloaded', status: 'downloaded', metadataJson: {}, localRelativePath: '123', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'application' };
  await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...item, type: 'application', localStatus: 'downloaded' } }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'official-preview', type: 'application', fallbackPreviewUrl: null, degraded: true, message: '该类型不支持浏览器实时预览' } }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: local }));
  await page.goto('/wallpaper/123'); await page.getByRole('button', { name: '启动实时预览' }).click();
  await expect(page.getByText('该类型不支持浏览器实时预览')).toBeVisible(); await expect(page.getByText('暂无官方预览')).toBeVisible();
});
