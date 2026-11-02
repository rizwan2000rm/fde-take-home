import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, runTest) => {
    // Faro stays enabled for every browser test. Tests can override this route
    // to inspect payloads or simulate a collector outage.
    await page.route("**/collect", (route) => route.fulfill({ status: 202, body: "" }));
    await runTest(page);
  },
});
