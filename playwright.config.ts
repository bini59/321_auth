import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/api/test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['dot'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://127.0.0.1', trace: 'retain-on-failure' },
});
