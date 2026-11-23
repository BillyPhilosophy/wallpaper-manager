import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const item = {
  workshopId: '123', title: 'Aurora Landscape', description: 'Fixture scene', type: 'scene',
  officialPreviewUrl: null, previewContentType: null, contentRating: 'everyone', subscribed: false,
  favorited: false, metadataJson: { subscriptions: 12345, favorited: 678 }, localStatus: 'not_downloaded',
};

async function mockApi(page: Page) {
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/workshop/search') return route.fulfill({ json: { items: [item], cursor: null, total: 1 } });
    if (path === '/api/workshop/items/123') return route.fulfill({ json: item });
    if (path === '/api/wallpapers/123') return route.fulfill({ json: { ...item, status: 'not_downloaded', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
    if (path === '/api/wallpapers/123/preview-descriptor') return route.fulfill({ json: { workshopId: '123', mode: 'official-preview', type: 'scene', fallbackPreviewUrl: null, degraded: true, message: '测试预览模式' } });
    if (path === '/api/system/capabilities') return route.fulfill({ json: { workerReady: true, steamAuthenticated: false, steamApiKeyConfigured: true, livePreviewTypes: ['scene', 'web'], webwallglVersion: '3.0.2' } });
    if (path === '/api/steam/auth/status') return route.fulfill({ json: { status: 'auth_required', message: null, accountName: null, steamId: null, updatedAt: new Date().toISOString() } });
    if (path === '/api/steam/auth/qr') return route.fulfill({ json: { status: 'auth_required', qrCode: null, updatedAt: null } });
    return route.fulfill({ json: { items: [], page: 1, pageSize: 100, total: 0 } });
  });
}

test.beforeEach(async ({ page }) => { await mockApi(page); });

test('main effects are exclusive, settings persist, and off disables every canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /关闭 仅保留磨玻璃/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);

  await page.getByRole('button', { name: /Glass 折射玻璃透镜/ }).click();
  await expect(page.getByRole('button', { name: /Glass 折射玻璃透镜/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-canvas-effect="glass"]')).toHaveCount(1);
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(1);
  await page.getByRole('switch', { name: /叠加液态流光/ }).check();
  await expect(page.locator('[data-canvas-effect="liquid"]')).toHaveCount(1);

  await page.getByRole('button', { name: /Liquid 流体波纹扭曲/ }).click();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(1);
  await expect(page.locator('[data-canvas-effect="liquid"]')).toHaveCount(1);
  await expect(page.getByRole('switch', { name: /叠加液态流光/ })).toBeDisabled();

  await page.getByRole('button', { name: /Shatter 3D 玻璃碎片/ }).click();
  await expect(page.locator('[data-canvas-effect="shatter"]')).toHaveCount(1);
  await expect(page.locator('[data-canvas-effect="liquid"]')).toHaveCount(1);
  await page.getByRole('button', { name: /Blaze 底部火星热浪/ }).click();
  await expect(page.locator('[data-canvas-effect="blaze"]')).toHaveCount(1);
  await page.getByRole('switch', { name: /叠加液态流光/ }).uncheck();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(1);

  await page.getByLabel('效果强度', { exact: true }).focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').effectIntensity)).toBe(30);
  await page.reload();
  await expect(page.getByRole('button', { name: /Blaze 底部火星热浪/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('效果强度', { exact: true })).toHaveValue('30');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').liquidTrail)).toBe(false);

  await page.getByRole('button', { name: /关闭 仅保留磨玻璃/ }).click();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /叠加液态流光/ })).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wallpaper-appearance-v1') || '{}').canvasEffect)).toBe('off');
  expect(errors).toEqual([]);
});

test('mobile and reduced-motion preferences retain usable static DOM', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /Glass 折射玻璃透镜/ })).toBeDisabled();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('移动端与触屏设备');
  await page.getByRole('link', { name: '工坊搜索', exact: true }).click();
  await page.getByLabel('搜索工坊').fill('Aurora');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByText('Aurora Landscape', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Steam 设置', exact: true }).click();
  await expect(page.getByRole('button', { name: /Glass 折射玻璃透镜/ })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('减弱动态效果');
});

test('real-time preview route never mounts canvas effects', async ({ page }) => {
  await page.route('**/api/wallpapers/123', (route) => route.fulfill({ json: { ...item, status: 'downloaded', localRelativePath: '123', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }));
  await page.goto('/wallpaper/123');
  await expect(page.getByRole('button', { name: '启动实时预览', exact: true })).toBeVisible();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);
  await page.getByRole('button', { name: '启动实时预览', exact: true }).click();
  await expect(page.getByText('测试预览模式', { exact: true })).toBeVisible();
  await expect(page.locator('[data-canvas-effect]')).toHaveCount(0);
});
