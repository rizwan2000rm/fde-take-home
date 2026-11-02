# Dashboard queries

Source: [dashboard JSON](observable-outfitters-dashboard.json). Six panels; all queries below match the JSON.

| Panel | Data source | Shows |
| --- | --- | --- |
| Active Sessions per Minute | Frontend events | Distinct sessions with recorded events per minute. |
| Cart Dropoff Rate | Frontend + backend events | Percentage of inactive cart sessions without an accepted order. |
| Views by Product | Frontend events | Views per product over the selected range, including repeats. |
| Checkout Attempts | Backend events | Successful and failed checkouts per minute. |
| Units Purchased by Product | Backend events | Units per product in saved orders over the selected range. |
| Checkout Failure Rate | Backend events | Failed checkouts as a percentage of completed checkouts. |

Backend events are OTel logs from `observable-outfitters-api`, correlated with API/payment spans. Native OTLP fields use underscores in Loki, including `session_id`, `event_name`, and `event_data_*`. Backend queries filter `deployment_environment_name`; Faro uses `deployment_environment`.

Dropoff joins both sources by the anonymous Faro session ID propagated in W3C baggage. Successful cart additions and orders come from the backend; activity includes recorded frontend and backend events. A session qualifies after 60s (demo) or 15m (normal) of inactivity. The history is 4h1m; one accepted order converts the whole session. Direct API calls without a Faro session count toward checkout totals but not session dropoff.

Percentage panels use named counts and Grafana Math. Empty counts are zero; `0 / 0` leaves a gap. Checkout tooltip includes completed request count. Failures include all unsuccessful completed requests, regardless of cause. Failure reasons remain in telemetry. Leaving before submission is measured by cart dropoff. Thresholds are omitted until a baseline exists. Time charts use a 1-minute interval.

Backend counts start when log export is enabled; earlier frontend events are not substituted. Exports are best effort, not an order ledger.

## Active Sessions per Minute

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

## Cart Dropoff Rate

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

## Views by Product

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

## Checkout Attempts

```logql
# Count each completed API checkout once.
sum by (event_data_outcome) (
  count_over_time(
    {service_name="observable-outfitters-api"}
      | deployment_environment_name=~"$environment"
      | event_name="shop.checkout"
      [1m]
  )
)
```

## Units Purchased by Product

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

## Checkout Failure Rate

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
