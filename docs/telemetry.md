# Telemetry

## FE events

Cart/checkout operations emit a root span and a correlated Faro event with `outcome`, `error_code`, and `duration_ms`. These describe browser-observed outcomes; dashboard order counts use backend records.

| Signal | Capture intent | Captured fields | Code |
| --- | --- | --- | --- |
| `session_start` (Faro event) | Count new shopping sessions. | Session metadata | [SDK setup](../src/lib/telemetry.ts) |
| `session_resume` (Faro event) | Recognize a resumed session after reload. | Session metadata | [SDK setup](../src/lib/telemetry.ts) |
| `session_extend` (Faro event) | Link a renewed session to its predecessor. | Session metadata, `previousSession` | [SDK setup](../src/lib/telemetry.ts) |
| `view_changed` (Faro event) | Track transitions between named views. | `fromView`, `toView` | [View tracking](../src/lib/telemetry.ts) |
| `shop.catalog_view` (event) | Measure catalog visits by category. | `category` | [StoreView](../src/components/StoreView.tsx#L17) |
| `shop.product_view` (event) | Measure product interest. | `product_id`, `category` | [StoreView](../src/components/StoreView.tsx#L17) |
| `shop.cart_view` (event) | Distinguish visiting the cart from leaving after an addition. | Session/view/page metadata; no custom fields | [Cart page](../src/app/cart/page.tsx#L16) |
| `shop.checkout_view` (event) | Capture checkout visits before submission. | Session/view/page metadata; no custom fields | [Checkout page](../src/app/checkout/page.tsx) |
| `shop.order_confirmation_view` (event) | Confirm arrival at the receipt page; count visits, not purchases. | Session/view/page metadata; no order ID or custom fields | [Order page](../src/app/orders/[id]/page.tsx#L14) |
| `shop.cart_add` (event + span) | Measure add-to-cart success, failures, and latency. | `product_id`, `quantity`, operation fields above | [CartProvider](../src/components/CartProvider.tsx#L46) |
| `shop.cart_remove` (event + span) | Measure removals and request failures. | `product_id`, `quantity=0`, operation fields above | [CartProvider](../src/components/CartProvider.tsx#L57) |
| `shop.cart_update` (event + span) | Measure quantity changes and request failures. | `product_id`, `quantity`, operation fields above | [CartProvider](../src/components/CartProvider.tsx#L57) |
| `shop.checkout` (event + span) | Measure checkout conversion, failure reasons, and latency per attempt. | `item_count`, `total_cents`, operation fields above; `http_status` when a response is parsed | [Checkout](../src/app/checkout/page.tsx) |
| `shop.checkout_ui_failure` (event) | UI failure after order acceptance; linked to the checkout trace. | `error_code=post_checkout_refresh_failed` | [Checkout](../src/app/checkout/page.tsx) |
| `GET /api/cart`, `POST /api/cart`, `PATCH /api/cart`, `POST /api/checkout` (CLIENT spans) | Separate HTTP latency/failures from the shopper action; propagate trace context. | Method, URL, status; `error.type` on HTTP/network failure | [requestApi](../src/lib/telemetry.ts) |
| `exception` (CLIENT span event) | Identify network failures without exporting raw errors. | Fixed type/message; span `error.type=network_error` | [requestApi](../src/lib/telemetry.ts) |

## BE events

Business events use the existing OTLP endpoint and credentials with `traces:write` + `logs:write`. Copy `.env.example` to `.env.local`, set the server endpoint/auth header, then restart `npm run dev`. Keep credentials server-only. Native OTLP log attributes become Loki structured metadata; session IDs are not index labels.

The browser forwards only the anonymous Faro `session.id` in W3C baggage. Backend spans and logs retain that session plus standard trace/span IDs. Missing or invalid session IDs are omitted; direct API requests still contribute to checkout totals. Log export remains independent of trace sampling.

| Business event | Shows | Fields |
| --- | --- | --- |
| `shop.cart_add` | Successful server cart additions. | `outcome`, `product_id`, numeric `quantity` |
| `shop.checkout` | One completed API checkout request. | `outcome`, `result=accepted/rejected/error`, `failure_kind`, `error_code`, `payment_error_code`, `http_status` |
| `shop.product_purchased` | Quantities in saved orders, including lost browser responses. | `product_id`, numeric `quantity` from the server cart |

`event.name` becomes `event_name`; `event.data.*` becomes `event_data_*` in Loki. `session.id` becomes `session_id`. Validation and card declines are rejections; `processor_error` and uncaught API exceptions are service errors. Purchase records follow `saveOrder`; payment approval alone does not count as an order. Shipping, card details, order IDs, and unrelated baggage are excluded.

Each API call emits a SERVER span with duration, `http.request.method`, `http.route`, `http.response.status_code`, and `shop.outcome`. HTTP 5xx marks the span as an error; expected 4xx leaves span status unset. Shared implementation: [traceApiRoute](../src/lib/server-telemetry.ts).

| Signal | Capture intent | Code |
| --- | --- | --- |
| `GET /api/products` (span) | Measure catalog API latency and availability. | [Products API](../src/app/api/products/route.ts#L5) |
| `GET /api/products/[id]` (span) | Measure product lookup latency and missing-product responses. | [Product API](../src/app/api/products/[id]/route.ts#L4) |
| `GET /api/cart` (span) | Measure cart load/refresh latency and failures. | [Cart API](../src/app/api/cart/route.ts) |
| `POST /api/cart` (span) | Measure add-item requests and rejected products. | [Cart API](../src/app/api/cart/route.ts) |
| `PATCH /api/cart` (span) | Measure quantity-update/removal requests. | [Cart API](../src/app/api/cart/route.ts) |
| `DELETE /api/cart` (span) | Measure explicit cart-clearing requests. | [Cart API](../src/app/api/cart/route.ts) |
| `POST /api/checkout` (span) | Measure server checkout latency/outcome; `shop.error_code` distinguishes missing shipping, empty cart, stock rejection, and payment decline. | [Checkout API](../src/app/api/checkout/route.ts) |
| `exception` (SERVER span event) | Expose uncaught handler failures; record sanitized type, fixed message, and stack frames, with span `error.type`. | [recordException](../src/lib/server-telemetry.ts) |

## Payment Provider events

The provider is an in-process simulation; its charge uses an INTERNAL span.

| Signal | Capture intent | Captured fields | Code |
| --- | --- | --- | --- |
| `payment.charge` (span) | Isolate provider latency and distinguish successful charges from declines/errors. | Duration, `shop.payment.provider=simulated`, `shop.payment.amount_cents`, `shop.outcome`; `shop.error_code` on decline: `invalid_card_number`, `invalid_amount`, `card_declined`, or `processor_error`; `error.type` on failure | [chargeCard](../src/lib/payments.ts#L22) |
| `exception` (INTERNAL span event) | Diagnose payment failures; mark the charge span as an error. | Sanitized type, fixed message, stack frames | [recordException](../src/lib/server-telemetry.ts) |

Checkout trace: `shop.checkout → POST /api/checkout (CLIENT) → POST /api/checkout (SERVER) → payment.charge (INTERNAL)`. Each attempt/retry starts a new trace; direct API calls without trace context start their own.

Shipping/card values are excluded; telemetry failures cannot block shopping. Backend export requires [server-only OTLP configuration](../src/lib/server-telemetry-init.ts#L9).
