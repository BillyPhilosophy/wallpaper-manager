import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('author page opens from wallpaper details and downloads into the manager queue', async ({ page }) => {
  const steamId = '76561197960265851';
  const workshop = { workshopId: '123', title: 'Author scene', description: null, type: 'scene', contentRating: 'everyone', subscribed: false, favorited: false, officialPreviewUrl: null, previewContentType: null, metadataJson: { creator: steamId }, localStatus: 'not_downloaded' };
  const local = { ...workshop, status: 'not_downloaded', localRelativePath: null, fileSizeBytes: null, lastErrorCode: null, lastErrorMessage: null, downloadedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let downloads = 0;
  await page.route('**/api/workshop/items/123', (route) => route.fulfill({ json: workshop }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: local }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'official-preview', type: 'scene', fallbackPreviewUrl: null, degraded: false, message: null } }));
  await page.route('**/api/workshop/authors/*/files**', (route) => route.fulfill({ json: { author: { steamId, name: 'Author name', avatarUrl: null, profileUrl: `https://steamcommunity.com/profiles/${steamId}` }, items: [workshop], page: 1, pageSize: 20, total: 1 } }));
  await page.route('**/api/wallpapers/123/download', (route) => { downloads += 1; return route.fulfill({ json: { job: { id: 'job-1', workshopId: '123', status: 'queued', attempt: 1 } } }); });
  await page.goto('/wallpaper/123', { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: '作者主页', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Author name', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Author scene', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await expect.poll(() => downloads).toBe(1);
});
