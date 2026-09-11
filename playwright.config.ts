import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // WebKit is the engine the desktop and mobile apps actually run: WebKitGTK on Linux,
    // WKWebView on macOS and iOS. Every screenshot and check this project had until now
    // ran in Chromium, which is why a year view that stretched itself apart on hover
    // shipped in 1.1.0 on 2026-03-18 and was found by a person on 2026-09-09.
    //
    // Only the tests tagged @webkit run here. The rest would be the same assertions
    // twice over, and this browser is the slow one to install.
    {
      name: 'webkit',
      testMatch: /.*\.spec\.ts/,
      grep: /@webkit/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
})
