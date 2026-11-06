import { test, expect } from '@playwright/test';
const item = { workshopId: '123', title: 'Aurora Landscape', description: 'Fixture scene', type: 'scene', officialPreviewUrl: null, previewContentType: null, metadataJson: { title: 'Aurora Landscape' }, localStatus: 'not_downloaded' };
test('search, enqueue and download-center journey', async ({ page }) => {
  await page.route('**/api/workshop/search**', (route) => route.fulfill({ json: { items: [item], cursor: null, total: 1 } }));
  await page.route('**/api/wallpapers/123/download', (route) => route.fulfill({ json: { job: { id: crypto.randomUUID(), workshopId: '123', status: 'queued', attempt: 1 } } }));
  await page.route('**/api/downloads?**', (route) => route.fulfill({ json: { items: [{ id: '6f67e62b-8a27-4d2b-a77f-e42c67538e45', workshopId: '123', status: 'queued', attempt: 1, errorCode: null, errorMessage: null, createdAt: new Date().toISOString(), startedAt: null, finishedAt: null }], page: 1, pageSize: 50, total: 1 } }));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '发现下一张壁纸' })).toBeVisible(); await expect(page.getByText('Aurora Landscape')).toBeVisible(); await page.getByRole('button', { name: '下载', exact: true }).click();
  await page.getByRole('link', { name: '下载中心' }).click(); await expect(page.getByText('等待 Worker 领取')).toBeVisible(); await expect(page.getByRole('button', { name: '取消' })).toBeVisible();
});
test('downloaded unsupported type shows official fallback', async ({ page }) => {
  const local = { ...item, localStatus: 'downloaded', status: 'downloaded', metadataJson: {}, localRelativePath: '123', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), type: 'application' };
  await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: { ...item, type: 'application', localStatus: 'downloaded' } }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'official-preview', type: 'application', fallbackPreviewUrl: null, degraded: true, message: '该类型不支持浏览器实时预览' } }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: local }));
  await page.goto('/wallpaper/123'); await page.getByRole('button', { name: '启动实时预览' }).click();
  await expect(page.getByText('该类型不支持浏览器实时预览')).toBeVisible(); await expect(page.getByText('暂无官方预览')).toBeVisible();
});
