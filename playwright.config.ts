import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 90000,
  reporter: [
    ['list'],
    [
      'monocart-reporter',
      {
        name: 'Finance App E2E Test & Coverage Report',
        outputFile: './coverage-reports/monocart.html',
        coverage: {
          entryFilter: (entry: { url?: string }) => {
            return !!entry.url && entry.url.includes('entry.bundle');
          },
          sourceFilter: (sourcePath: string) => {
            return sourcePath.includes('src/') && !sourcePath.includes('node_modules');
          },
          all: './src',
          reports: [
            'console-summary',
            'v8',
            'lcovonly',
          ],
          outputDir: './coverage-reports',
        },
      },
    ],
  ],
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
