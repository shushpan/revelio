import { defineConfig, devices } from "@playwright/test";
import { cleanVerificationEnv } from "./scripts/clean-verification-env.mjs";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm preview --host 127.0.0.1",
    env: cleanVerificationEnv(),
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
