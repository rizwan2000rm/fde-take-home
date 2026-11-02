import type { Page } from "@playwright/test";
import type { TransportBody } from "@grafana/faro-web-sdk";
import { expect, test } from "./fixtures";

async function collect(page: Page) {
  const bodies: TransportBody[] = [];
  await page.route("**/collect", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, body: "" });
  });
  return {
    bodies,
    events: (name: string) => bodies.flatMap((body) => body.events ?? []).filter((event) => event.name === name),
    spans: () => bodies.flatMap((body) => body.traces?.resourceSpans ?? [])
      .flatMap((resource) => resource.scopeSpans ?? []).flatMap((scope) => scope.spans ?? []),
  };
}

async function add(page: Page, quantity = 1) {
  await page.goto("/products/trace-tee");
  await page.getByRole("spinbutton").fill(String(quantity));
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByText("Added to cart ✓")).toBeVisible();
}

async function openCheckout(page: Page) {
  await page.getByRole("link", { name: /Cart/ }).click();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.getByPlaceholder("Full name").fill("Private Shopper");
  await page.getByPlaceholder("Email").fill("private-shopper@example.com");
  await page.getByPlaceholder("Shipping address").fill("123 Private Street");
}

test("views survive navigation in one Faro session; cart actions have independent traces", async ({ page }) => {
  const capture = await collect(page);
  await page.goto("/");
  await expect.poll(() => capture.events("shop.catalog_view").length).toBe(1);
  await add(page);
  await page.getByRole("link", { name: /Cart/ }).click();
  await expect.poll(() => capture.events("shop.cart_view").length).toBe(1);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect.poll(() => capture.spans().filter((span) => span.name.startsWith("shop.cart_")).length).toBe(2);
  expect(capture.events("shop.cart_view")).toHaveLength(1);
  await page.goto("/"); // A full document load must resume the session.
  await expect.poll(() => capture.events("shop.catalog_view").length).toBe(2);
  const spans = capture.spans().filter((span) => span.name.startsWith("shop.cart_"));
  expect(new Set(spans.map((span) => span.traceId)).size).toBe(2);
  expect(spans.every((span) => !span.parentSpanId)).toBe(true);
  expect(spans.map((span) => span.name).sort()).toEqual(["shop.cart_add", "shop.cart_remove"]);
  const sessions = capture.bodies.map((body) => body.meta.session?.id).filter(Boolean);
  expect(new Set(sessions).size).toBe(1);
  expect(capture.events("shop.product_view")).toHaveLength(1);
  expect(capture.events("shop.cart_remove")[0].trace?.trace_id).toBe(spans.find((s) => s.name === "shop.cart_remove")?.traceId);
});

test("checkout retries link browser actions and HTTP spans without form values", async ({ page }) => {
  const capture = await collect(page);
  const traceparents: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/checkout")) {
      traceparents.push(request.headers()["traceparent"]);
    }
  });
  await add(page, 2);
  await openCheckout(page);
  await expect.poll(() => capture.events("shop.cart_view").length).toBe(1);
  await expect.poll(() => capture.events("shop.checkout_view").length).toBe(1);
  expect(capture.events("shop.checkout")).toHaveLength(0);
  await page.getByPlaceholder("Card number").fill("4000 0000 0000 0002");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.locator(".checkout-form .err")).toContainText("payment was declined");
  await page.getByPlaceholder("Card number").fill("4242 4242 4242 4242");
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page).toHaveURL(/\/orders\/ord_/);
  await expect.poll(() => capture.events("shop.order_confirmation_view").length).toBe(1);
  expect(capture.events("shop.cart_view")).toHaveLength(1);
  expect(capture.events("shop.checkout_view")).toHaveLength(1);
  await expect.poll(() => capture.events("shop.checkout").length).toBe(2);
  await expect.poll(() => capture.spans().filter((s) => s.name === "shop.checkout").length).toBe(2);
  expect(capture.events("shop.checkout").map((event) => event.attributes?.outcome)).toEqual(["fail", "success"]);
  expect(capture.events("shop.checkout")[0].attributes?.error_code).toBe("payment_declined");
  expect(capture.events("shop.product_purchased").map((event) => event.attributes)).toEqual([{ product_id: "trace-tee", quantity: "2" }]);
  const traces = capture.spans().filter((span) => span.name === "shop.checkout");
  expect(new Set(traces.map((span) => span.traceId)).size).toBe(2);
  expect(traces.map((span) => span.status?.code)).toEqual([2, 1]);
  for (const [index, operation] of traces.entries()) {
    const client = capture.spans().find((span) => span.name === "POST /api/checkout" && span.parentSpanId === operation.spanId)!;
    expect(client.traceId).toBe(operation.traceId);
    expect(client.kind).toBe(3); // OTLP CLIENT
    expect(traceparents[index]).toBe(`00-${client.traceId}-${client.spanId}-01`);
  }
  const serialized = JSON.stringify(capture.bodies);
  const orderId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(serialized).not.toContain(orderId);
  for (const value of ["Private Shopper", "private-shopper@example.com", "123 Private Street", "4242 4242", "4000 0000"]) {
    expect(serialized).not.toContain(value);
  }
});

test("an accepted checkout remains successful when the existing cart refresh fails", async ({ page }) => {
  const capture = await collect(page);
  await add(page);
  await openCheckout(page);
  await page.route("**/api/cart", (route) => route.request().method() === "GET"
    ? route.abort() : route.continue());
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.locator(".checkout-form .err")).toContainText("Network error");
  await expect.poll(() => capture.events("shop.checkout_ui_failure").length).toBe(1);
  expect(capture.events("shop.checkout").map((event) => event.attributes?.outcome)).toEqual(["success"]);
});

test("a failed telemetry collector never prevents a purchase", async ({ page }) => {
  let attempts = 0;
  await page.route("**/collect", (route) => { attempts++; return route.abort(); });
  await add(page);
  await openCheckout(page);
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page).toHaveURL(/\/orders\/ord_/);
  await expect(page.getByRole("heading", { name: "Thank you, Private Shopper!" })).toBeVisible();
  await expect.poll(() => attempts).toBeGreaterThan(0);
});
