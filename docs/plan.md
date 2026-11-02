Session (Faro-managed; events and traces grouped by `session_id`)
- [x] Catalog (view event)
- [x] Product view (view event)
- [x] Cart: Add, Remove (separate trace per action)
- [x] Checkout: Success / Fail (separate trace per attempt)

Using Grafana Faro for ease of browser session management and tracing. A session groups view events and operation traces rather than being one long trace.

Dashboard [Use a sensible default like Last 5 mins]
- [x] Active Sessions per Minute (Bar Chart): distinct sessions with recorded activity in each 1-minute bucket
- [x] Dropoffs Percentage (Line Chart): a Faro session is a dropoff if it has at least one successful add-to-cart, no successful checkout, and no new recorded session events for the configured timeout. Divide by all qualified sessions reaching that timeout in the same minute. Browsing-only sessions, failed cart additions, and sessions with more recent events are excluded. Default 60s for the simulator demo; 15m normal option. There is no separate session-termination condition. Accepted tradeoff: one successful checkout converts the entire Faro session rather than tracking separate shopping journeys.
- [x] Views by Product (Horizontal Bar Chart): explains top viewed products
- [x] Checkouts (Stacked Bar Chart): checkout attempts in 1-minute buckets with success/fail stacked bars
- [x] Checkouts by Product (Horizontal Bar Chart): explains top purchased products (only successful)
- [x] Checkout Error Rate (Line Chart): explains failed checkouts relative to total checkouts

A dashboard answering the core business impact leaning more towards business than debugging. I am sure we can easily adapt to do a debugging dashboard

Aiden workflows
- [ ] TBD
- [ ] TBD
