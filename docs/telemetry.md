# Telemetry in code

Coverage is currently browser-only. API routes and the payment provider have no server telemetry. Checkout failures reach Grafana through browser events; server exception details and direct API calls are not captured.

Faro starts in [instrumentation-client.ts](../src/instrumentation-client.ts); helpers live in [telemetry.ts](../src/lib/telemetry.ts).

| Signal | When emitted | Main fields | Source |
| --- | --- | --- | --- |
| Faro session / view events | Automatic session lifecycle and explicit catalog/product view changes. | Session ID, view, app version/environment | [Telemetry setup](../src/lib/telemetry.ts) |
| `shop.catalog_view` | Catalog or category viewed. | `category` | [StoreView](../src/components/StoreView.tsx) |
| `shop.product_view` | Product viewed. | `product_id`, `category` | [StoreView](../src/components/StoreView.tsx) |
| `shop.cart_add` | Add-to-cart attempt completes. | `product_id`, `quantity` | [CartProvider](../src/components/CartProvider.tsx) |
| `shop.cart_remove` | Removal attempt completes (`quantity=0`). | `product_id`, `quantity` | [CartProvider](../src/components/CartProvider.tsx) |
| `shop.cart_update` | Quantity-change attempt completes (`quantity>0`). | `product_id`, `quantity` | [CartProvider](../src/components/CartProvider.tsx) |
| `shop.checkout` | Checkout attempt completes; retries count separately. | `item_count`, `total_cents`, `http_status` when available | [Checkout](../src/app/checkout/page.tsx) |
| `shop.product_purchased` | Successful checkout; one event per cart line. | `product_id`, `quantity` | [Checkout](../src/app/checkout/page.tsx) |
| `shop.checkout_ui_failure` | Checkout accepted, then cart refresh/navigation throws. | `error_code=post_checkout_refresh_failed` | [Checkout](../src/app/checkout/page.tsx) |

Cart actions and checkout emit an independent root span plus a correlated event with `outcome`, `error_code`, and `duration_ms`. All custom attributes are strings.

Sessions use 100% sampling and survive same-tab reloads. Shipping/card values are excluded; URLs are scrubbed. Automatic console, form, and network capture is disabled. Telemetry is best effort and cannot block shopping.
