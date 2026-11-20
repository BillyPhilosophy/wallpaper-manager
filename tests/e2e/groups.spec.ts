import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('library filters ungrouped wallpapers and assigns a soft group', async ({ page }) => {
  const groupId = '11111111-1111-4111-8111-111111111111';
  const group = { id: groupId, name: '场景组', color: '#4f8cff', sortOrder: 0, itemCount: 0, playableCount: 0, updatedAt: new Date().toISOString() };
  const wallpaper = { workshopId: '123', title: 'Grouped scene', description: null, type: 'scene', contentRating: 'everyone', subscribed: false, favorited: false, officialPreviewUrl: null, metadataJson: {}, localRelativePath: '123', status: 'downloaded', fileSizeBytes: '1024', lastErrorCode: null, lastErrorMessage: null, downloadedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), groupIds: [] };
  let assigned = '';
  const groupRequests: Array<string | null> = [];
  await page.route('**/api/groups', (route) => route.fulfill({ json: { items: [group] } }));
  await page.route('**/api/wallpapers?**', (route) => {
    const url = new URL(route.request().url());
    groupRequests.push(url.searchParams.get('groupId'));
    return route.fulfill({ json: { items: [wallpaper], page: 1, pageSize: 24, total: 1 } });
  });
  await page.route('**/api/wallpapers/123/groups', (route) => {
    assigned = route.request().postData() || '';
    return route.fulfill({ json: { workshopId: '123', groupIds: [groupId] } });
  });
  await page.goto('/library', { waitUntil: 'domcontentloaded' });
  await page.locator('.group-filter-menu .menu-trigger').click();
  await page.getByRole('button', { name: '未分组', exact: true }).click();
  await expect.poll(() => groupRequests[groupRequests.length - 1]).toBe('none');
  await page.getByRole('button', { name: '批量分组', exact: true }).click();
  await page.getByLabel('选择 Grouped scene', { exact: true }).check();
  await page.getByLabel('目标分组', { exact: true }).selectOption(groupId);
  await page.getByRole('button', { name: '加入分组', exact: true }).click();
  await expect.poll(() => assigned).toBe(JSON.stringify({ groupIds: [groupId] }));
});

test('group manager creates groups and stores the default library view', async ({ page }) => {
  const groupId = '11111111-1111-4111-8111-111111111111';
  const group = { id: groupId, name: '场景组', color: '#4f8cff', sortOrder: 0, itemCount: 2, playableCount: 2, updatedAt: new Date().toISOString() };
  let created = '';
  await page.route('**/api/groups', (route) => {
    if (route.request().method() === 'POST') {
      created = route.request().postData() || '';
      return route.fulfill({ json: group });
    }
    return route.fulfill({ json: { items: [group] } });
  });
  await page.goto('/groups', { waitUntil: 'domcontentloaded' });
  await page.locator('.default-group-setting select').selectOption(groupId);
  expect(await page.evaluate(() => localStorage.getItem('wallpaper-library-default-group'))).toBe(groupId);
  await page.getByPlaceholder('例如：夜景、动漫、常用').fill('新分组');
  await page.getByRole('button', { name: '创建分组', exact: true }).click();
  await expect.poll(() => created).toContain('新分组');
});
