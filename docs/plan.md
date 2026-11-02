Session Start (Trace)
- [ ] Catalog (span)
- [ ] Product view (span)
- [ ] Cart: Add, Remove (span)
- [ ] Checkout: Success / Fail (span)
Session End

Instrumentation as custom traces+spans to behave like RUM.
Open questions:
- [] Do I use a RUM SDK that does session management for me out of the box? Or use otel traces exporter and do it DIY?

Dashboard [Use a sensible default like Last 5 mins]
- [ ] Total Sessions (Bar Chart): explains total visitors on the app
- [ ] Dropoffs Percentage (Line Chart): explain visitors that dropped off without a successful checkout
- [ ] Views by Product (Horizontal Bar Chart): explains top viewed products
- [ ] Checkouts (Stacked Bar Chart): explains total checkout attempts with success/fail stacked bars 
- [ ] Checkouts by Product (Horizontal Bar Chart): explains top purchased products (only successful)
- [ ] Checkout Error Rate (Line Chart): explains failed checkouts relative to total checkouts  

A dashboard answering the core business impact leaning more towards business than debugging. I am pretty sure we can easily adapt the instrumentation to do a debugging dashboard focused more towards dev

Aiden workflows
TBD
