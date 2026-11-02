# Observability plan

## Telemetry

- [x] Track Faro sessions and catalog, product, cart, checkout, and order-confirmation views.
- [x] Start a separate trace for each cart change and checkout attempt.
- [x] Link browser, API, and payment spans; pass the session ID in W3C baggage.
- [x] Export backend cart additions, checkout outcomes, and purchased units as OTel logs.
- [x] Exclude shipping/card details and keep shopping working during telemetry outages.

## Business dashboard

Default range: last 5 minutes. Refresh: 15 seconds.

- [x] Active Sessions per Minute: distinct sessions with recorded events per minute.
- [x] Cart Dropoff Rate: inactive cart sessions without an accepted order (%).
- [x] Views by Product: views over the selected range, including repeats.
- [x] Checkout Attempts: successful and failed API checkout requests per minute.
- [x] Units Purchased by Product: units in saved orders over the selected range.
- [x] Checkout Failure Rate: failed / completed API checkout requests (%).

Dropoff uses backend-confirmed cart additions and orders, linked to session activity. Timeout: 60s demo / 15m normal. One accepted order converts the whole session.

Checkout panels show only Successful/Failed. Failure reasons remain in telemetry.

## Pending

- [ ] Document the two Aiden workflows.

Details: [telemetry](telemetry.md), [queries](queries.md), [decisions](decisions.md).
