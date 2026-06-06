import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const braveExecutablePath =
  process.env.BRAVE_EXECUTABLE_PATH ??
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const braveProject = existsSync(braveExecutablePath)
  ? [{
      name: 'brave',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: braveExecutablePath },
      },
    }]
  : [];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...braveProject,
  ],
});
