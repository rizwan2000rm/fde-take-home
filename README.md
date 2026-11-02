# Observable Outfitters

A small e-commerce store used for the FDE take-home exercise. It works, but it has
**no observability at all**. Adding that is your job: see the [PDF brief](docs/FDE%20Take-Home%20-%20Observable%20Outfitters.pdf).

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
$ npm test           # end-to-end tests against `next dev` (starts its own server on :3100)
$ npm run test:prod  # same tests against a production build
$ npm run lint
$ npm run typecheck
```

Keep these passing as you add instrumentation. Set `PW_CHANNEL=` (empty) to run the
tests with Playwright's Chromium instead of Chrome.

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
