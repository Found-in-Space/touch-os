import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    deviceScaleFactor: 1,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    viewport: {
      width: 1280,
      height: 720
    }
  },
  webServer: {
    command: "npm run example:e2e -- --port 4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:4173"
  }
});
