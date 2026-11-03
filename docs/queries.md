# Dashboard queries

Expand a panel below for its full queries, matching the [dashboard JSON](observable-outfitters-dashboard.json).

| Panel | Calculation |
| --- | --- |
| Active Sessions per Minute | Distinct frontend `session_id`s with recorded events in `[1m]`. |
| Cart Dropoff Rate | `100 * $DroppedSessions / $EligibleSessions` |
| Views by Product | Count frontend `shop.product_view` events by product over `$__range`, including repeats. |
| Units Purchased by Product | Sum backend `shop.product_purchased` quantities by product over `$__range`. |
| Checkout Error Rate | `100 * $FailedAttempts / $CompletedAttempts` |

## Queries

<details>
<summary>Active Sessions per Minute</summary>

```logql
# Count distinct active sessions in each minute; show 0 when empty.
count(
  sum by (session_id) (
    count_over_time(
      {service_name="observable-outfitters", kind="event", deployment_environment=~"$environment"}
        | logfmt
        | __error__=""
        | session_id!=""
        [1m]
    )
  )
)
or vector(0)
```

</details>

<details>
<summary>Cart Dropoff Rate</summary>

### EligibleSessions

```logql
# Sessions reaching inactivity after a confirmed cart addition.
count(
  sum by (session_id) (
    count_over_time(
      {service_name=~"observable-outfitters(-api)?"}
        | logfmt
        | __error__=""
        | kind="event"
        | label_format environment=`{{or .deployment_environment_name .deployment_environment}}`
        | environment=~"$environment"
        | session_id!=""
      [1m] offset ${idle_timeout_seconds}s
    )
  )
  unless
  sum by (session_id) (
    count_over_time(
      {service_name=~"observable-outfitters(-api)?"}
        | logfmt
        | __error__=""
        | kind="event"
        | label_format environment=`{{or .deployment_environment_name .deployment_environment}}`
        | environment=~"$environment"
        | session_id!=""
      [${idle_timeout_seconds}s]
    )
  )
  and
  sum by (session_id) (
    count_over_time(
      {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.cart_add"
      | event_data_outcome="success"
      | session_id!=""
      [4h1m] offset ${idle_timeout_seconds}s
    )
  )
)
or vector(0)
```

### DroppedSessions

```logql
# Eligible sessions without a server-confirmed checkout.
count(
  sum by (session_id) (
    count_over_time(
      {service_name=~"observable-outfitters(-api)?"}
        | logfmt
        | __error__=""
        | kind="event"
        | label_format environment=`{{or .deployment_environment_name .deployment_environment}}`
        | environment=~"$environment"
        | session_id!=""
      [1m] offset ${idle_timeout_seconds}s
    )
  )
  unless
  sum by (session_id) (
    count_over_time(
      {service_name=~"observable-outfitters(-api)?"}
        | logfmt
        | __error__=""
        | kind="event"
        | label_format environment=`{{or .deployment_environment_name .deployment_environment}}`
        | environment=~"$environment"
        | session_id!=""
      [${idle_timeout_seconds}s]
    )
  )
  and
  sum by (session_id) (
    count_over_time(
      {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.cart_add"
      | event_data_outcome="success"
      | session_id!=""
      [4h1m] offset ${idle_timeout_seconds}s
    )
  )
  unless
  sum by (session_id) (
    count_over_time(
      {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.checkout"
      | event_data_outcome="success"
      | session_id!=""
      [4h1m] offset ${idle_timeout_seconds}s
    )
  )
)
or vector(0)
```

### DropoffPercentage

```text
100 * $DroppedSessions / $EligibleSessions
```

</details>

<details>
<summary>Views by Product</summary>

```logql
# Count product views over the selected dashboard range, including repeat views.
sum by (event_data_product_id) (
  count_over_time(
    {service_name="observable-outfitters", kind="event", deployment_environment=~"$environment"}
      | logfmt
      | event_name="shop.product_view"
      [$__range]
  )
)
```

</details>

<details>
<summary>Units Purchased by Product</summary>

```logql
# Sum server-recorded order quantities; browser confirmation is not required.
sum by (event_data_product_id) (
  sum_over_time(
    {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.product_purchased"
      | unwrap event_data_quantity
      | __error__=""
      [$__range]
  )
)
```

</details>

<details>
<summary>Checkout Error Rate</summary>

### CompletedAttempts

```logql
# Completed attempts per minute; zero when absent.
sum(
  count_over_time(
    {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.checkout"
      [1m]
  )
)
or vector(0)
```

### FailedAttempts

```logql
# Failed checkout requests per minute; zero when absent.
sum(
  count_over_time(
    {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.checkout"
      | event_data_outcome="fail"
      [1m]
  )
)
or vector(0)
```

### CheckoutFailurePercentage

```text
100 * $FailedAttempts / $CompletedAttempts
```

</details>

## Rate definitions

- `EligibleSessions`: sessions reaching the inactivity timeout in the current minute, with a backend-confirmed cart addition.
- `DroppedSessions`: eligible sessions without a backend-accepted order. Cart additions and orders use a `4h1m` lookback ending at the start of the inactivity window; any accepted order in that history converts the whole session.
- `CompletedAttempts`: backend `shop.checkout` events in `[1m]`, one per completed API request.
- `FailedAttempts`: completed attempts with `event_data_outcome="fail"` (HTTP ≥400), including declines, validation/stock rejections, provider errors, and API exceptions. Browser failures and requests without a recorded API completion are excluded.

## Query conventions

- Frontend: `service_name="observable-outfitters"`, environment field `deployment_environment`. Backend: `service_name="observable-outfitters-api"`, environment field `deployment_environment_name`. Both filter by `$environment`.
- Dropoff joins frontend/backend activity by Faro `session_id` propagated via W3C baggage. Inactivity: `${idle_timeout_seconds}` (60s demo; 900s normal). Requests without a session ID affect checkout counts but cannot enter dropoff counts.
- Loki fields use underscores: `session_id`, `event_name`, `event_data_*`; product grouping uses `event_data_product_id`, quantities use `event_data_quantity`.
- Empty rate counts become zero; `0 / 0` leaves a gap. Time charts use a 1-minute interval.
- Backend counts begin when log export is enabled. Telemetry is best effort; ingestion delays can distort dropoff.
