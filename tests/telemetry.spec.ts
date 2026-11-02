import type { Page } from "@playwright/test";
import type { TransportBody } from "@grafana/faro-web-sdk";
import { randomBytes } from "node:crypto";
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

test("checkout retries link browser, HTTP, API and payment spans without form values", async ({ page, backendTelemetry }) => {
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
  expect(capture.events("shop.product_purchased")).toHaveLength(0);
  const traces = capture.spans().filter((span) => span.name === "shop.checkout");
  expect(new Set(traces.map((span) => span.traceId)).size).toBe(2);
  expect(traces.map((span) => span.status?.code)).toEqual([2, 1]);
  const sessionId = capture.bodies.find((body) => body.meta.session?.id)?.meta.session?.id;
  for (const [index, operation] of traces.entries()) {
    const client = capture.spans().find((span) => span.name === "POST /api/checkout" && span.parentSpanId === operation.spanId)!;
    expect(client.traceId).toBe(operation.traceId);
    expect(client.kind).toBe(3); // OTLP CLIENT
    expect(traceparents[index]).toBe(`00-${client.traceId}-${client.spanId}-01`);
    await expect.poll(() => backendTelemetry.spans.filter((span) => span.traceId === operation.traceId).length).toBe(2);
    const backend = backendTelemetry.spans.filter((span) => span.traceId === operation.traceId);
    const api = backend.find((span) => span.name === "POST /api/checkout")!;
    const payment = backend.find((span) => span.name === "payment.charge")!;
    expect(api.parentSpanId).toBe(client.spanId);
    expect(api.kind).toBe(2); // OTLP SERVER
    expect(api.attributes["http.response.status_code"]).toBe(index === 0 ? 402 : 201);
    expect(api.status?.code ?? 0).toBe(0); // Expected 4xx is not a server exception.
    expect(api.resource["service.name"]).toBe("observable-outfitters-api");
    expect(api.attributes["session.id"]).toBe(sessionId);
    expect(payment.parentSpanId).toBe(api.spanId);
    expect(payment.kind).toBe(1); // Simulated provider runs in-process: INTERNAL.
    expect(payment.status?.code ?? 0).toBe(index === 0 ? 2 : 0);
    expect(payment.attributes["shop.outcome"]).toBe(index === 0 ? "fail" : "success");
    expect(payment.attributes["session.id"]).toBe(sessionId);
    await expect.poll(() => backendTelemetry.logs.filter((log) => log.traceId === operation.traceId && log.eventName === "shop.checkout").length).toBe(1);
    const checkout = backendTelemetry.logs.find((log) => log.traceId === operation.traceId && log.eventName === "shop.checkout")!;
    expect(checkout.spanId).toBe(api.spanId);
    expect(checkout.attributes["session.id"]).toBe(sessionId);
    expect(checkout.attributes["event.data.result"]).toBe(index === 0 ? "rejected" : "accepted");
    expect(checkout.attributes["event.data.failure_kind"]).toBe(index === 0 ? "declined" : "none");
    expect(checkout.attributes["event.data.payment_error_code"]).toBe(index === 0 ? "card_declined" : "none");
    await expect.poll(() => backendTelemetry.logs.filter((log) => log.traceId === operation.traceId && log.eventName === "shop.product_purchased").length).toBe(index);
    if (index === 1) {
      const purchase = backendTelemetry.logs.find((log) => log.traceId === operation.traceId && log.eventName === "shop.product_purchased")!;
      expect(purchase.attributes["event.data.product_id"]).toBe("trace-tee");
      expect(purchase.attributes["event.data.quantity"]).toBe(2);
      expect(purchase.spanId).toBe(api.spanId);
    }
  }
  const serialized = JSON.stringify([capture.bodies, backendTelemetry.spans, backendTelemetry.logs.filter((log) => traces.some((t) => t.traceId === log.traceId))]);
  const orderId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(serialized).not.toContain(orderId);
  for (const value of ["Private Shopper", "private-shopper@example.com", "123 Private Street", "4242 4242", "4000 0000"]) {
    expect(serialized).not.toContain(value);
  }
});

test("unexpected API and payment exceptions are traced without changing 500 responses or leaking input", async ({ request, backendTelemetry }) => {
  await request.post("/api/cart", { data: { productId: "trace-tee" } });
  const paymentTrace = randomBytes(16).toString("hex");
  const parserTrace = randomBytes(16).toString("hex");
  const parentId = randomBytes(8).toString("hex");
  const paymentResponse = await request.post("/api/checkout", {
    headers: { traceparent: `00-${paymentTrace}-${parentId}-01` },
    data: {
      shipping: { name: "Secret Shopper", email: "secret@example.com", address: "Secret Street" },
      cardNumber: { secret: "Secret Card" }, // Existing .replace() TypeError; do not fix product behavior.
    },
  });
  expect(paymentResponse.status()).toBe(500);
  const parserResponse = await request.post("/api/cart", {
    headers: { traceparent: `00-${parserTrace}-${parentId}-01`, "Content-Type": "application/json" },
    data: Buffer.from('{"secret":"Secret Body",'),
  });
  expect(parserResponse.status()).toBe(500);
  await expect.poll(() => backendTelemetry.spans.filter((span) => [paymentTrace, parserTrace].includes(span.traceId)).length).toBe(3);
  const spans = backendTelemetry.spans.filter((span) => [paymentTrace, parserTrace].includes(span.traceId));
  for (const span of spans) {
    expect(span.status?.code).toBe(2);
    expect(span.events.some((event) => event.name === "exception")).toBe(true);
    if (span.kind === 2) {
      expect(span.parentSpanId).toBe(parentId);
      expect(span.attributes["http.response.status_code"]).toBe(500);
    }
  }
  const payment = spans.find((span) => span.name === "payment.charge")!;
  const checkout = spans.find((span) => span.name === "POST /api/checkout")!;
  expect(payment.parentSpanId).toBe(checkout.spanId);
  await expect.poll(() => backendTelemetry.logs.find((log) => log.traceId === paymentTrace && log.eventName === "shop.checkout")).toBeTruthy();
  expect(backendTelemetry.logs.find((log) => log.traceId === paymentTrace && log.eventName === "shop.checkout")?.attributes["event.data.result"]).toBe("error");
  for (const value of ["Secret Shopper", "secret@example.com", "Secret Street", "Secret Card", "Secret Body"]) {
    expect(JSON.stringify(spans)).not.toContain(value);
  }
});

test("direct API requests retain W3C context, sampling and route templates", async ({ request, backendTelemetry }) => {
  const sampled = randomBytes(16).toString("hex");
  const unsampled = randomBytes(16).toString("hex");
  const parentId = randomBytes(8).toString("hex");
  expect((await request.get("/api/products/trace-tee", {
    headers: { traceparent: `00-${unsampled}-${parentId}-00` },
  })).status()).toBe(200);
  expect((await request.post("/api/checkout", {
    headers: { traceparent: `00-${unsampled}-${parentId}-00`, baggage: "session.id=session_unsampled,private.email=hidden%40example.com" },
    data: {},
  })).status()).toBe(400);
  expect((await request.get("/api/products/private-product?secret=private-query", {
    headers: { traceparent: `00-${sampled}-${parentId}-01`, tracestate: "vendor=value" },
  })).status()).toBe(404);
  await expect.poll(() => backendTelemetry.spans.find((span) => span.traceId === sampled)).toBeTruthy();
  const span = backendTelemetry.spans.find((span) => span.traceId === sampled)!;
  expect(span.parentSpanId).toBe(parentId);
  expect(span.traceState).toBe("vendor=value");
  expect(span.name).toBe("GET /api/products/[id]");
  expect(span.attributes["http.route"]).toBe("/api/products/[id]");
  expect(span.attributes["http.response.status_code"]).toBe(404);
  expect(span.status?.code ?? 0).toBe(0);
  expect(backendTelemetry.spans.some((span) => span.traceId === unsampled)).toBe(false);
  await expect.poll(() => backendTelemetry.logs.find((log) => log.traceId === unsampled)).toBeTruthy();
  const record = backendTelemetry.logs.find((log) => log.traceId === unsampled)!;
  expect(record.eventName).toBe("shop.checkout");
  expect(record.attributes["session.id"]).toBe("session_unsampled");
  expect(record.attributes["event.data.result"]).toBe("rejected");
  expect(record.attributes["event.data.failure_kind"]).toBe("validation");
  expect(JSON.stringify(record)).not.toContain("hidden");
  expect(JSON.stringify(span)).not.toContain("private-product");
  expect(JSON.stringify(span)).not.toContain("private-query");
});

test("a failed backend exporter never prevents a purchase", async ({ page, backendTelemetry }) => {
  const rejectedBefore = backendTelemetry.rejectedExports;
  backendTelemetry.rejectExports = true;
  try {
    await add(page);
    await openCheckout(page);
    await page.getByRole("button", { name: /^Pay/ }).click();
    await expect(page).toHaveURL(/\/orders\/ord_/);
    await expect.poll(() => backendTelemetry.rejectedExports).toBeGreaterThan(rejectedBefore);
  } finally {
    backendTelemetry.rejectExports = false;
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
  expect(capture.events("shop.checkout_ui_failure")[0].trace).toEqual(capture.events("shop.checkout")[0].trace);
});

test("a lost checkout response retains server purchases and session correlation", async ({ page, backendTelemetry }) => {
  const capture = await collect(page);
  await add(page, 2);
  await page.goto("/products/incident-mug");
  await page.getByRole("spinbutton").fill("3");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await expect(page.getByText("Added to cart ✓")).toBeVisible();
  await openCheckout(page);
  await page.route("**/api/checkout", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort();
  });
  await page.getByRole("button", { name: /^Pay/ }).click();
  await expect(page.locator(".checkout-form .err")).toContainText("Network error");
  await expect.poll(() => capture.events("shop.checkout").length).toBe(1);
  const event = capture.events("shop.checkout")[0];
  expect(event.attributes?.outcome).toBe("fail");
  const traceId = event.trace!.trace_id;
  await expect.poll(() => backendTelemetry.logs.filter((log) => log.traceId === traceId).length).toBe(3);
  const records = backendTelemetry.logs.filter((log) => log.traceId === traceId);
  const checkout = records.find((log) => log.eventName === "shop.checkout")!;
  expect(checkout.attributes["event.data.result"]).toBe("accepted");
  expect(checkout.attributes["event.data.outcome"]).toBe("success");
  const session = capture.bodies.find((body) => body.meta.session?.id)?.meta.session?.id;
  expect(records.every((log) => log.attributes["session.id"] === session && log.spanId === checkout.spanId)).toBe(true);
  expect(records.filter((log) => log.eventName === "shop.product_purchased").map((log) => [
    log.attributes["event.data.product_id"], log.attributes["event.data.quantity"],
  ]).sort()).toEqual([["incident-mug", 3], ["trace-tee", 2]]);
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
