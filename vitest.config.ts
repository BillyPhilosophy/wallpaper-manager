import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['packages/**/*.test.ts', 'apps/*/test/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'], environment: 'node', testTimeout: 15000 },
  resolve: { alias: {
    '@wallpaper-manager/contracts': new URL('./packages/contracts/src/index.ts', import.meta.url).pathname,
    '@wallpaper-manager/config': new URL('./packages/config/src/index.ts', import.meta.url).pathname,
    '@wallpaper-manager/database': new URL('./packages/database/src/index.ts', import.meta.url).pathname,
    '@wallpaper-manager/wallpaper-files': new URL('./packages/wallpaper-files/src/index.ts', import.meta.url).pathname,
  } },
});
