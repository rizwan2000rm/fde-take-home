import { test as base } from "@playwright/test";
import { startCollector } from "./otel-collector";

export { expect } from "@playwright/test";

export const test = base.extend<object, { backendTelemetry: Awaited<ReturnType<typeof startCollector>> }>({
  backendTelemetry: [async ({}, runTests) => {
    const collector = await startCollector();
    try { await runTests(collector); } finally { await collector.close(); }
  }, { scope: "worker", auto: true }],
  page: async ({ page }, runTest) => {
    // Faro stays enabled for every browser test. Tests can override this route
    // to inspect payloads or simulate a collector outage.
    await page.route("**/collect", (route) => route.fulfill({ status: 202, body: "" }));
    await runTest(page);
  },
});
