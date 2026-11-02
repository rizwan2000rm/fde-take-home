# Dashboard queries

Source: [dashboard JSON](observable-outfitters-dashboard.json). All queries use Faro events for `observable-outfitters`, filtered by `$environment` and parsed with `logfmt`.

Custom event fields appear in Loki as `event_data_*` (e.g. `quantity` → `event_data_quantity`).

| Panel | What the query measures | Window |
| --- | --- | --- |
| Active Sessions per Minute | Count distinct `session_id` values with recorded events. | 1 minute |
| Dropoffs Percentage | Inactive cart sessions without a purchase ÷ all eligible cart sessions × 100. | 1-minute eligibility bucket |
| Views by Product | Count `shop.product_view` events per product; repeats count. | Selected range |
| Checkouts | Count `shop.checkout` attempts, grouped by success/fail. | 1 minute |
| Checkouts by Product | Sum `quantity` from `shop.product_purchased` per product. | Selected range |
| Checkout Error Rate | Failed `shop.checkout` attempts ÷ all completed attempts × 100. | 1 minute |

Dropoff eligibility requires a successful cart addition and no recorded events for the selected timeout (60s demo / 15m normal). Cart additions and purchases use four hours of session history plus the cohort minute; any successful checkout converts the session.

Empty percentage denominators show a gap; eligible sessions/attempts with no dropoffs/errors show 0%. Active sessions shows 0 when empty. Time charts use a 1-minute query step.
