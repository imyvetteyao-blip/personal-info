import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  outputDir: "../output/playwright",
  webServer: process.env.LAB_BASE_URL
    ? undefined
    : {
        cwd: new URL("..", import.meta.url).pathname,
        command: "python3 -m http.server 4182 --bind 127.0.0.1 --directory ../docs",
        url: "http://127.0.0.1:4182/",
        reuseExistingServer: true,
        timeout: 20000,
        stdout: "ignore",
        stderr: "ignore",
      },
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: process.env.LAB_BASE_URL || "http://127.0.0.1:4182/",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: process.env.LAB_CHROMIUM_PATH
      ? {
          executablePath: process.env.LAB_CHROMIUM_PATH,
          args: ["--no-sandbox"],
        }
      : {},
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
