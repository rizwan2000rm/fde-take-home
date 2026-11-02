# Observable Outfitters

A small e-commerce store used for the FDE take-home exercise, with Grafana Faro
session tracking, business events, action traces, and a business impact dashboard.
See the [PDF brief](docs/FDE%20Take-Home%20-%20Observable%20Outfitters.pdf) and
[implementation notes](docs/WRITEUP.md).

**Tech stack**

- Next.js 16 (App Router) + React 19 + TypeScript
- In-memory backend (cart, orders, fake payment provider) via Next.js Route Handlers.
  State resets when the server restarts.

> Next.js 16 differs from older versions in places. If you use an AI assistant,
> point it at `AGENTS.md` and `node_modules/next/dist/docs/`.

## Run it

Run all commands below from the app root (the directory containing `package.json`).

```
$ npm install
$ npm run dev        # http://localhost:3000
```

## Generate traffic

With the app running, in another terminal:

```
$ npm run simulate -- 20                          # 20 sessions against http://localhost:3000
$ npm run simulate -- 50 http://localhost:4000    # custom count / URL
```

Each session is a fresh headless browser that acts like a real shopper: some
bounce, some abandon their cart, some get declined, some buy. It uses your local
Google Chrome, or Playwright's Chromium (`npx playwright install chromium`) if
Chrome isn't installed.

## Tests

```
$ npm test           # all shopping and telemetry tests; starts `next dev` on :3100
$ npm run test:telemetry # optional shortcut for the telemetry tests only
$ npm run test:prod  # same tests against a production build
$ npm run lint
$ npm run typecheck
```

Keep these passing as you add instrumentation. Set `PW_CHANNEL=` (empty) to run the
tests with Playwright's Chromium instead of Chrome.

```
$ npx playwright install chromium
$ PW_CHANNEL= npm test
```

Stop a running `npm run dev` before running tests: Next.js permits one dev server
per checkout. One Playwright config runs every test with Faro enabled. A shared
fixture intercepts the local collector URL, so test payloads stay local. Telemetry
tests inspect those payloads and simulate collector failures using the same config.

## Grafana Cloud setup

1. In your own Grafana Cloud stack, open **Observability → Frontend → Start observing**.
   Create an application named `observable-outfitters`. Allow your exact app origin
   (`http://localhost:3000` for local development); add other origins only as needed.
2. Use 100% session sampling and standard sessions. Session Replay is unnecessary.
   Copy the public collector URL from the generated SDK snippet.
3. Configure the app and restart the dev server (or rebuild for production):

   ```sh
   cp .env.example .env.local
   # Set NEXT_PUBLIC_FARO_URL to your application's collector URL in .env.local.
   npm run dev
   ```

4. In **Dashboards → New → Import dashboard**, upload
   [docs/observable-outfitters-dashboard.json](docs/observable-outfitters-dashboard.json).
   Select your Faro Loki data source in the **Loki** selector and the matching
   **Environment**. The dashboard defaults to Last 5 minutes and refreshes every 15s.
   **Dropoff timeout** defaults to **Demo (60s)**; select **Normal (15m)** for
   a 15-minute gap without recorded session events. This dashboard setting does not change
   Faro's session lifetime or inactivity timeout.
5. Browse the app or run `npm run simulate -- 20`. Allow a few seconds for ingestion,
   then refresh. Use a longer time range to inspect older traffic.

| Environment variable | Default | Effect |
| --- | --- | --- |
| `NEXT_PUBLIC_FARO_URL` | unset | Public browser collector endpoint; unset disables telemetry |
| `NEXT_PUBLIC_APP_ENVIRONMENT` | `development` | Faro app environment and dashboard filter |
| `NEXT_PUBLIC_APP_VERSION` | `0.1.0` | Release identifier attached to telemetry |

`NEXT_PUBLIC_*` values ship in browser code and are fixed at build time. Never put
a Grafana API token, access-policy token, or password in them. No private Grafana
credentials are needed by this app. Keep `.env.local` untracked; the committed
example contains placeholders only. Grafana collector failures do not block shopping.

The configured stack's [business dashboard](https://jumbolentil581.grafana.net/d/observable-outfitters-business)
and [Faro application](https://jumbolentil581.grafana.net/a/grafana-kowalski-app/apps/2447/overview)
can be viewed when signed into that stack. Other teams should import the JSON into
their own stack using the setup above.

### Signals and dashboard definitions

Faro manages an anonymous browser session across page loads. Catalog and product
views emit `shop.catalog_view` and `shop.product_view`. Each `shop.cart_add`,
`shop.cart_remove`, `shop.cart_update`, and `shop.checkout` action gets its own
root trace and a correlated outcome event. Checkout retries count separately.
Successful checkout responses emit one `shop.product_purchased` event per cart
line with the purchased quantity. Shipping fields and card values are never
passed to instrumentation; automatic network/form/console capture is disabled.

| Panel | Definition |
| --- | --- |
| Active Sessions per Minute | Distinct Faro session IDs with an event in each 1-minute bucket |
| Dropoffs Percentage | Sessions with a successful add-to-cart, no successful checkout, and no new recorded events for the selected timeout / all qualified sessions reaching that timeout in the same minute |
| Views by Product | Product view events, including repeat views |
| Checkouts | Completed attempts per minute, stacked by success/fail |
| Checkouts by Product | Units in successful purchases, summed per product |
| Checkout Error Rate | Failed attempts / all completed attempts in each minute |

Time charts use 1-minute aggregation windows and an explicit 1-minute query step.
The dashboard time selector controls how many minutes are displayed. Product
rankings aggregate over the selected range. A session can be active in multiple
minutes, so adding the session bars does not produce a distinct session total.
A session is a dropoff if it has at least one successful add-to-cart, has no
successful checkout, and has produced no new recorded session events for the
configured timeout. This rule uses Faro event records in Loki; it does not test
for a separate session-termination signal or infer every human interaction.

For dropoff, purchase intent requires at least one successful `shop.cart_add`
event in the Faro session. Browsing-only sessions and failed cart additions are
excluded from both numerator and denominator. A qualified session becomes eligible
only after **Dropoff timeout** has elapsed since its last recorded event.
At each point, the cohort contains qualified sessions
whose last event plus that threshold falls within the preceding minute.
Sessions with more recent activity are excluded from both numerator and
denominator. A successful checkout anywhere in the same Faro session excludes it
from dropoffs, including a purchase before the displayed time range; the query
reads an extra four hours of both cart-add and purchase history to cover Faro's
maximum session lifetime. Failed checkout attempts followed by success count as
converted. Faro sessions remain the unit rather than individual shopping journeys:
one purchase converts the entire session, even if a later cart is abandoned.

Closing a tab/browser does not reliably send a termination event to Grafana, so
those sessions use the same recorded-event timeout. Quiet browsing, form filling,
and missing or delayed events can cause false classification. No eligible
qualified sessions produces a gap; all eligible sessions converted shows 0%
dropoffs. No checkout attempts produces a gap; successful attempts with no
failures show 0% errors. Browser
telemetry is best effort and is not a revenue ledger. Panel descriptions explain
these definitions in Grafana too.

The 60-second demo default is based on the simulator's short pauses (normally
0.4-1.5 seconds, up to 2.5 seconds for form filling/retries), 3-5-second slow
payments, 15-second checkout-result waits, and 3-4-second final telemetry-flush
pause. These are script timings, not measured Cloud ingestion guarantees; the
extra headroom reduces premature classification while keeping demo feedback
reasonably quick. Normal use should select 15 minutes.

## The shopping journey

| Step | Page | Backend call |
| --- | --- | --- |
| 1. Browse catalog | `/` (optional `?category=`) | server render |
| 2. View product | `/products/[id]` | server render |
| 3. Add to cart | `/products/[id]` | `POST /api/cart` |
| 4. Review cart | `/cart` | `GET`/`PATCH /api/cart` |
| 5. Enter checkout details | `/checkout` | – |
| 6. Place order | `/checkout` | `POST /api/checkout` |
| 7. Order confirmation | `/orders/[id]` | server render |

## Configuration

| Env var | Default | Effect |
| --- | --- | --- |
| `PAYMENT_FAILURE_RATE` | `0.1` | Share of payments the provider rejects at random |
| `SLOW_PAYMENT_RATE` | `0.1` | Share of payments that take noticeably longer |

```
$ PAYMENT_FAILURE_RATE=0.3 SLOW_PAYMENT_RATE=0.2 npm run dev
```
