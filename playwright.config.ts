import { defineConfig } from "@playwright/test";

// E2E tests run against `next dev` by default (that's what candidates run),
// or against a production build with E2E_MODE=prod. Random payment failures
// and slowness are disabled so results are deterministic.
const PORT = 3100;
const prod = process.env.E2E_MODE === "prod";

const webServer = {
  command: prod ? `npm run build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
  url: `http://localhost:${PORT}`,
  timeout: 180_000,
  reuseExistingServer: false,
  env: {
    PAYMENT_FAILURE_RATE: "0",
    SLOW_PAYMENT_RATE: "0",
    NEXT_PUBLIC_FARO_URL: "http://localhost:3100/collect",
    NEXT_PUBLIC_APP_ENVIRONMENT: "test",
  },
};

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Prefer the local Chrome; set PW_CHANNEL= (empty) to use Playwright's Chromium.
    channel: process.env.PW_CHANNEL ?? "chrome",
    viewport: { width: 1920, height: 1080 },
  },
  webServer,
});
