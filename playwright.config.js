import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: process.env.CI ? "100%" : undefined,
  reporter: "html",
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
