// Simulates realistic user sessions against the running app with Playwright,
// so the funnel and session dashboards have drop-off to show.
//
//   npm run simulate -- [sessions=12] [baseUrl=http://localhost:3000]
//
// Uses the locally installed Google Chrome, falling back to Playwright's
// Chromium (`npx playwright install chromium`).
// Each session gets a fresh browser context, i.e. a new user session.
import { chromium } from "@playwright/test";

const SESSIONS = Number(process.argv[2] ?? 12);
const BASE = process.argv[3] ?? "http://localhost:3000";

const pause = (min = 400, max = 1500) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
const pick = (items) => items[Math.floor(Math.random() * items.length)];

// Weighted personas: how far into the checkout journey the user gets.
const PERSONAS = [
  ["bounce", 15],
  ["browse_products", 15],
  ["add_and_leave", 12],
  ["abandon_cart", 10],
  ["abandon_checkout", 10],
  ["declined_gives_up", 8],
  ["declined_then_buys", 8],
  ["out_of_stock", 5],
  ["purchase", 17],
];

function choosePersona() {
  const total = PERSONAS.reduce((n, [, w]) => n + w, 0);
  let roll = Math.random() * total;
  for (const [name, weight] of PERSONAS) if ((roll -= weight) < 0) return name;
  return "purchase";
}

async function browse(page) {
  await page.goto(BASE);
  await pause();
  if (Math.random() < 0.4) {
    await page.locator(".filters .chip").nth(1 + Math.floor(Math.random() * 3)).click();
    await pause();
  }
}

async function viewProduct(page) {
  await pick(await page.locator(".card a").all()).click();
  await page.waitForURL(/\/products\//);
  await pause();
}

async function addToCart(page, quantity = 1) {
  await page.locator(".add-to-cart input").fill(String(quantity));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.locator(".add-to-cart .ok, .add-to-cart .err").waitFor();
  await pause();
}

async function openCart(page) {
  await page.getByRole("link", { name: /Cart/ }).click();
  await page.waitForURL(/\/cart$/);
  await page.locator(".cart-table, main p").first().waitFor();
  await pause();
}

async function beginCheckout(page) {
  await page.getByRole("link", { name: "Proceed to checkout" }).click();
  await page.waitForURL(/\/checkout$/);
  await page.locator("form.checkout-form").waitFor();
  await pause(800, 2500); // filling in the form
}

// Returns "ordered" or the error text shown to the user.
async function placeOrder(page, card) {
  await page.locator('input[name="name"]').fill("Sim User");
  await page.locator('input[name="email"]').fill("sim@example.com");
  await page.locator('textarea[name="address"]').fill("1 Simulation Way");
  await page.locator('input[name="cardNumber"]').fill(card);
  await page.locator('button[type="submit"]').click();
  const result = await Promise.race([
    page.waitForURL(/\/orders\//, { timeout: 15_000 }).then(() => "ordered"),
    page.locator(".checkout-form .err").waitFor({ timeout: 15_000 }).then(() => "error"),
  ]);
  if (result === "error") return (await page.locator(".checkout-form .err").textContent())?.trim();
  await page.getByRole("heading", { name: /Thank you/ }).waitFor();
  await pause();
  return "ordered";
}

const GOOD_CARD = "4242 4242 4242 4242";
const DECLINE_CARD = "4000 0000 0000 0002";

async function runSession(page, persona) {
  await browse(page);
  if (persona === "bounce") return "left on catalog";

  await viewProduct(page);
  if (persona === "browse_products") {
    await page.goBack();
    await pause();
    await viewProduct(page);
    return "browsed products";
  }

  if (persona === "out_of_stock") {
    await addToCart(page, 6);
    await openCart(page);
    await beginCheckout(page);
    return `out of stock: ${await placeOrder(page, GOOD_CARD)}`;
  }

  await addToCart(page, 1 + Math.floor(Math.random() * 2));
  if (Math.random() < 0.3) {
    await page.goto(BASE);
    await pause();
    await viewProduct(page);
    await addToCart(page);
  }
  if (persona === "add_and_leave") return "added to cart, left";

  await openCart(page);
  if (persona === "abandon_cart") return "abandoned cart";

  await beginCheckout(page);
  if (persona === "abandon_checkout") return "abandoned checkout";

  if (persona.startsWith("declined")) {
    const declined = await placeOrder(page, DECLINE_CARD);
    if (persona === "declined_gives_up") return `declined, gave up (${declined})`;
    await pause(1000, 2500);
  }

  // A good card can still fail at random (PAYMENT_FAILURE_RATE); retry once.
  let result = await placeOrder(page, GOOD_CARD);
  if (result !== "ordered") {
    await pause(800, 1500);
    result = `retried after "${result}" -> ${await placeOrder(page, GOOD_CARD)}`;
  }
  return result;
}

const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
const tally = {};
for (let i = 1; i <= SESSIONS; i++) {
  const persona = choosePersona();
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  let outcome;
  try {
    outcome = await runSession(page, persona);
  } catch (err) {
    outcome = `ERROR: ${err.message.split("\n")[0]}`;
  }
  await pause(3000, 4000); // give client-side telemetry time to flush before the session ends
  await context.close();
  tally[persona] = (tally[persona] ?? 0) + 1;
  console.log(`${String(i).padStart(2)}. ${persona.padEnd(19)} ${outcome}`);
}
await browser.close();
console.log("\npersonas:", tally);
