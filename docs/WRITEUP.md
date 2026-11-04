# Observable Outfitters: observability write-up

## Architecture

```
Browser (Faro SDK + Faro tracing) --> Faro collector --> Grafana Cloud
                                                          ├─ Loki: events/logs
                                                          └─ Tempo: traces
```

```
Next.js API + simulated payment
--> OpenTelemetry NodeSDK
    ├─ Traces → BatchSpanProcessor → OTLPTraceExporter
    └─ Logs   → BatchLogRecordProcessor → OTLPLogExporter
--> Grafana Cloud
    ├─ Loki: business event logs
    └─ Tempo: traces
```

Server-side OpenTelemetry traces API handlers and payment processing, and emits
business events for cart additions, checkout results and purchased quantities.
Trace context connects a browser action to its API and payment spans; the Faro
session ID connects activity across separate actions. Server credentials stay on
the server. Both exporters run asynchronously; telemetry failures do not block
shopping.

## Decisions and trade-offs

- Use Faro for browser RUM and session management; OpenTelemetry Node libraries for backend instrumentation.
- Use persistent: false: sessions survive same-tab navigation/reloads but generally remain independent across tabs.
- Propagate Faro session IDs via W3C baggage to link frontend and backend events.

- Dropoff Tracking
  - intent: include sessions with at least one cart addition
  - no recorded activity for x mins without a success order; configurable (demo: 60s / default: 15m) [delayed telemetry can cause false dropoffs]
  - An accepted order converts the whole session, including checkout → add another product → leave.

- left out all performance related stuff, console/global errors etc. purely focused on business tracking side
  with some failure metrics like error rate on checkout that directly impacts business

- Checkout errors include card declines, validation/stock rejections, payment-provider errors, and API exceptions. Frontend failures are excluded.

## What the data told me about the product

- out of stock is not checked during CRUD but on final checkout
- accepted order can still feel like a failed purchase. BE accepts an order but FE redirects to a failure

## Aiden Workflow Ideas

- [ ] webhook trigger when error rate exceeds a condition (a dynamic threshold calculated from baseline or absolute threshold) trigger the aiden workflow. Find the root cause of excessive failure, suggest fixes & preventive steps.
- [ ] weekly/daily diagnosis of where are the most users dropping off? understand friction, bugs etc

## How I used AI

The most important part for me was to think
1. what to instrument
2. what are the most imp questions a business dashboard should answer.
Some of this AI helped but not much. Implementation wise everything from instrumentation, to creating grafana dashboard, coming up with queries etc was done by AI

Big Failures: did not instrument the API and connected FE with BE for cross service relations. It went and just made up queries with FE events :( caught when manually checking the instrumentation and traces.

## With another week

1. track performance issues & errors: api latencies, lighthouse metrics along with all global errors -- ran into CORs at time could have been caught in RUM :)
2. add alerts: 4xx, 5xx errors on imp api
3. Also two aiden workflows obv -- blocked due to them not being available anymore in the community edition :)

**Demo recording:** [Watch the demo recording](demo-recording.mov).
