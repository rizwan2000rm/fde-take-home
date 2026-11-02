Session (Faro-managed; events and traces grouped by `session_id`)
- [x] Catalog (view event)
- [x] Product view (view event)
- [x] Cart: Add, Remove (separate trace per action)
- [x] Checkout: Success / Fail (separate trace per attempt)

Using Grafana Faro for ease of browser session management and tracing. A session groups view events and operation traces rather than being one long trace.

Dashboard [Use a sensible default like Last 5 mins]
- [x] Active Sessions per Minute (Bar Chart): distinct sessions with recorded activity in each 1-minute bucket
- [x] Cart Dropoff Rate (Line Chart): inactive sessions with a backend-confirmed cart addition and no accepted order, divided by eligible sessions in the same minute. Frontend and backend activity share the Faro session ID through W3C baggage. Default timeout: 60s demo / 15m normal. One accepted order converts the whole session.
- [x] Views by Product (Horizontal Bar Chart): explains top viewed products
- [x] Checkout Attempts (Stacked Bar Chart): completed API requests per minute, split into success and failure
- [x] Units Purchased by Product (Horizontal Bar Chart): quantities from saved backend orders over the selected range
- [x] Checkout Failure Rate (Line Chart): failed requests divided by completed API requests; request count in the tooltip

A dashboard answering the core business impact leaning more towards business than debugging. I am sure we can easily adapt to do a debugging dashboard

Aiden workflows
- [ ] TBD
- [ ] TBD
