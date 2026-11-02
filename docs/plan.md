Session (Faro-managed; events and traces grouped by `session_id`)
- [x] Catalog (view event)
- [x] Product view (view event)
- [x] Cart: Add, Remove (separate trace per action)
- [x] Checkout: Success / Fail (separate trace per attempt)

Using Grafana Faro for ease of browser session management and tracing. A session groups view events and operation traces rather than being one long trace.

Dashboard [Use a sensible default like Last 5 mins]
- [x] Total Sessions (Bar Chart): explains total visitors on the app
- [x] Dropoffs Percentage (Line Chart): explain visitors that dropped off without a successful checkout
- [x] Views by Product (Horizontal Bar Chart): explains top viewed products
- [x] Checkouts (Stacked Bar Chart): explains total checkout attempts with success/fail stacked bars
- [x] Checkouts by Product (Horizontal Bar Chart): explains top purchased products (only successful)
- [x] Checkout Error Rate (Line Chart): explains failed checkouts relative to total checkouts

A dashboard answering the core business impact leaning more towards business than debugging. I am sure we can easily adapt to do a debugging dashboard

Aiden workflows
- [ ] TBD
- [ ] TBD
