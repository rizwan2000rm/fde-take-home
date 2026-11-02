import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const GOOD_CARD = "4242 4242 4242 4242";
const DECLINE_CARD = "4000 0000 0000 0002";

async function addProductToCart(page: Page, productId: string, quantity = 1) {
  await page.goto(`/products/${productId}`);
  await page.locator(".add-to-cart input").fill(String(quantity));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.locator(".add-to-cart .ok")).toBeVisible();
}

async function checkout(page: Page, card: string) {
  await page.getByRole("link", { name: /Cart/ }).click();
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.locator('input[name="name"]').fill("Test User");
  await page.locator('input[name="email"]').fill("test@example.com");
  await page.locator('textarea[name="address"]').fill("1 Test Street");
  await page.locator('input[name="cardNumber"]').fill(card);
  await page.locator('button[type="submit"]').click();
}

test("catalog lists products and filters by category", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(8);
  await page.locator(".filters .chip", { hasText: "electronics" }).click();
  await expect(page).toHaveURL(/category=electronics/);
  await expect(page.locator(".card")).toHaveCount(3);
});

test("dev server does not reload the page on its own", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  // Count full document loads (framenavigated also fires for the router's
  // history.replaceState on hydration, which is not a reload).
  let documentLoads = 0;
  page.on("request", (req) => req.isNavigationRequest() && req.frame() === page.mainFrame() && documentLoads++);

  await page.goto("/");
  await page.waitForTimeout(8_000);

  expect(documentLoads).toBe(1);
  expect(errors).toEqual([]);
});

test("happy path: browse → cart → checkout → confirmation", async ({ page }) => {
  await addProductToCart(page, "trace-tee", 2);
  await expect(page.locator(".badge")).toHaveText("2");

  await checkout(page, GOOD_CARD);
  await expect(page).toHaveURL(/\/orders\/ord_/);
  await expect(page.getByRole("heading", { name: /Thank you, Test User/ })).toBeVisible();
  await expect(page.getByText("Paid $48.00 with card ending 4242")).toBeVisible();
  await expect(page.locator(".badge")).toHaveText("0");
});

test("cart quantity can be changed and items removed", async ({ page }) => {
  await addProductToCart(page, "span-cap");
  await page.goto("/cart");
  await page.locator(".cart-table input").fill("3");
  await expect(page.locator(".cart-summary .price")).toHaveText("Total: $57.00");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
});

test("declined card shows an error and keeps the cart", async ({ page }) => {
  await addProductToCart(page, "incident-mug");
  await checkout(page, DECLINE_CARD);
  await expect(page.locator(".checkout-form .err")).toHaveText(/payment was declined/);
  await expect(page.locator(".badge")).toHaveText("1");
});

test("more than 5 of an item is rejected as out of stock", async ({ page }) => {
  await addProductToCart(page, "alert-lamp", 6);
  await checkout(page, GOOD_CARD);
  await expect(page.locator(".checkout-form .err")).toHaveText(/out of stock/);
});

test("API rejects bad input", async ({ request }) => {
  expect((await request.post("/api/cart", { data: { productId: "nope" } })).status()).toBe(400);
  expect((await request.get("/api/products/nope")).status()).toBe(404);
  const checkoutRes = await request.post("/api/checkout", {
    data: { shipping: { name: "a", email: "a@b.c", address: "x" }, cardNumber: GOOD_CARD },
  });
  expect(checkoutRes.status()).toBe(400);
  expect(await checkoutRes.json()).toEqual({ error: "empty_cart" });
});
