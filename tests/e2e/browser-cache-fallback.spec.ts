import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('dynamic background renders from its descriptor when version lookup fails', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('wallpaper-appearance-v1', JSON.stringify({ backgroundId: '123', backgroundMode: 'dynamic', audioEnabled: true })));
  await page.route('**/api/workshop/search**', (route) => route.fulfill({ json: { items: [], cursor: null, total: 0 } }));
  await page.route('**/api/wallpapers/123/preview-descriptor', (route) => route.fulfill({ json: { workshopId: '123', mode: 'local-video', type: 'video', resourceBaseUrl: '/api/wallpapers/123/resources', entry: 'video.mp4', fallbackPreviewUrl: null, degraded: false, message: null } }));
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'version unavailable' } }));
  await page.route('**/api/wallpapers/123/resources/video.mp4', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    await route.fulfill({ contentType: 'video/mp4', body: 'video-content' });
  });
  await page.goto('/');
  await expect(page.locator('.dynamic-background video')).toBeVisible();
});
