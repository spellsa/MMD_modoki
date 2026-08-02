import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
