import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: process.env.CI ? "100%" : undefined,
  reporter: "html",
  // Small tolerance so sub-pixel rasterisation differences across chromium
  // versions / machines don't fail the visual-regression snapshots.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: "http://localhost:1313",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
  // Serves the static export built by `npm run build` into out/.
  webServer: {
    command: "npx serve out -l 1313 --no-clipboard",
    url: "http://localhost:1313",
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
