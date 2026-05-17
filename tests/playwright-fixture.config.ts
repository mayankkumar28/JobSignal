import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/fixture",
  timeout: 30_000,
  retries: 2,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
