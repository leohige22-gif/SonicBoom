import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: true, workers: 2, timeout: 30000,
  expect: { timeout: 7000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5180', locale: 'en-US', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} },
  webServer: { command: 'npm run dev -- --port 5180', url: 'http://localhost:5180/@vite/client', reuseExistingServer: false },
});
