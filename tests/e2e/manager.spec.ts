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
test('device confirmation does not require a verification code', async ({ page }) => {
  await page.route('**/api/steam/auth/status', (route) => route.fulfill({ json: { status: 'confirmation_required', message: '请在 Steam 手机 App 中确认本次登录', accountName: 'test', steamId: null, updatedAt: new Date().toISOString() } }));
  await page.route('**/api/steam/auth/qr', (route) => route.fulfill({ json: { status: 'confirmation_required', qrCode: null, updatedAt: null } }));
  await page.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.0' } }));
  await page.route('**/api/workshop/subscriptions/sync', (route) => route.fulfill({ json: { status: 'idle', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() } }));
  await page.goto('/settings');
  await expect(page.getByText('等待手机确认', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提交验证码' })).toHaveCount(0);
});
test('known SteamID64 can synchronize subscriptions without Steam login', async ({ page }) => {
  let requestBody = '';
  await page.route('**/api/steam/auth/status', (route) => route.fulfill({ json: { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt: new Date().toISOString() } }));
  await page.route('**/api/steam/auth/qr', (route) => route.fulfill({ json: { status: 'auth_required', qrCode: null, updatedAt: null } }));
  await page.route('**/api/system/capabilities', (route) => route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.0' } }));
  await page.route('**/api/workshop/subscriptions/sync', (route) => {
    const running = route.request().method() === 'POST';
    if (running) requestBody = route.request().postData() || '';
    return route.fulfill({ json: { status: running ? 'running' : 'idle', total: 0, synced: 0, message: null, updatedAt: new Date().toISOString() } });
  });
  await page.goto('/settings');
  await page.getByLabel('SteamID64', { exact: true }).fill('76561197960265851');
  await page.getByRole('button', { name: '同步订阅列表', exact: true }).click();
  await expect.poll(() => requestBody).toBe('{"steamId":"76561197960265851"}');
});
test('download center displays upstream progress and rate', async ({ page }) => {
  const progress = { downloadedBytes: '50000000', totalBytes: '100000000', networkBytes: '25000000', bytesPerSecond: '1000000', percent: 50, updatedAt: new Date().toISOString() };
  await page.route('**/api/downloads?**', (route) => route.fulfill({ json: { items: [{ id: '6f67e62b-8a27-4d2b-a77f-e42c67538e45', workshopId: '123', status: 'downloading', attempt: 1, errorCode: null, errorMessage: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, progress }], page: 1, pageSize: 50, total: 1 } }));
  await page.goto('/downloads');
  await expect(page.getByText('50.0%', { exact: true })).toBeVisible();
  await expect(page.getByText('1.0 MB/s', { exact: true })).toBeVisible();
  await expect(page.getByText('50.0 MB / 100.0 MB', { exact: true })).toBeVisible();
});
test('failed download records can be removed individually and cleared', async ({ page }) => {
  const first = { id: '6f67e62b-8a27-4d2b-a77f-e42c67538e45', workshopId: '123', status: 'failed', attempt: 1, errorCode: 'STEAM_DOWNLOAD_FAILED', errorMessage: '下载失败', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null };
  const second = { ...first, id: 'b80e570f-9df2-4c44-9df2-8316dbac15f5', workshopId: '456' };
  let jobs = [first, second];
  await page.route('**/api/downloads?**', (route) => route.fulfill({ json: { items: jobs, page: 1, pageSize: 50, total: jobs.length } }));
  await page.route(`**/api/downloads/${first.id}`, (route) => { jobs = jobs.filter((job) => job.id !== first.id); return route.fulfill({ json: { deleted: 1 } }); });
  await page.route('**/api/downloads/failed', (route) => { jobs = []; return route.fulfill({ json: { deleted: 1 } }); });
  await page.goto('/downloads');
  await page.getByRole('button', { name: '删除记录', exact: true }).first().click();
  await expect(page.getByRole('link', { name: '工坊 123' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '工坊 456' })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '清空失败记录', exact: true }).click();
  await expect(page.getByText('暂无下载任务。去工坊搜索一张喜欢的壁纸吧。')).toBeVisible();
});
test('downloaded video supports local playback and fullscreen preview', async ({ page }) => {
  const video = { ...item, type: 'video', title: 'Local video', localStatus: 'downloaded' };
  const local = { ...video, status: 'downloaded', subscribed: true, contentRating: 'everyone', localRelativePath: '123', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: video }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: local }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'local-video', type: 'video', resourceBaseUrl: '/api/wallpapers/123/resources', entry: 'video.mp4', fallbackPreviewUrl: null, degraded: false, message: null } }));
  await page.goto('/wallpaper/123');
  await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
  const player = page.getByLabel('本地视频实时预览');
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute('src', '/api/wallpapers/123/resources/video.mp4');
  await page.getByRole('button', { name: '全屏预览', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.fullscreenElement || document.querySelector('.preview-immersive')))).toBe(true);
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await expect(page.getByRole('button', { name: '全屏预览', exact: true })).toBeVisible();
});
test('downloaded unsupported type shows official fallback', async ({ page }) => {
  const local = { ...item, localStatus: 'downloaded', status: 'downloaded', metadataJson: {}, localRelativePath: '123', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'application' };
  await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...item, type: 'application', localStatus: 'downloaded' } }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'official-preview', type: 'application', fallbackPreviewUrl: null, degraded: true, message: '该类型不支持浏览器实时预览' } }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: local }));
  await page.goto('/wallpaper/123'); await page.getByRole('button', { name: '启动实时预览' }).click();
  await expect(page.getByText('该类型不支持浏览器实时预览')).toBeVisible(); await expect(page.getByText('暂无官方预览')).toBeVisible();
});
