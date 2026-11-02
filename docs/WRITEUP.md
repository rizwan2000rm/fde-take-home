# Implementation notes

## Dropoff definition and correction

The initial dashboard counted sessions without a successful checkout immediately,
including shoppers still browsing. A minimal local Loki reproduction containing
one product-view event from 20 seconds earlier returned 100% dropoff. The missing
inactivity condition was in the dashboard query; changing Faro persistence would
not correct it.

Dropoff now waits for a configurable period without new recorded session events. The
dashboard defaults to 60 seconds for the demo and offers 15 minutes for normal
use. This is a business classification threshold; Faro's own 15-minute inactivity
timeout and four-hour maximum session lifetime remain unchanged.

Purchase intent requires a successful `shop.cart_add` in the same Faro session;
browsing-only sessions and failed cart additions are excluded from both counts.
At each chart point, eligible sessions have their last event plus the inactivity
threshold within the preceding 1-minute bucket. Sessions with activity
inside the threshold are excluded from both counts. Dropoff is the percentage
of eligible inactive sessions with no successful checkout in that Faro session.
Cart-add and purchase lookup includes four hours before the eligible activity
window so that earlier cart additions still qualify and earlier purchases still
prevent a false dropoff.
Sessions with retries and an eventual success count as converted. Empty cohorts
show a gap; fully converted cohorts show 0%.

Accepted scope tradeoff: Faro sessions group shopping journeys. A successful
checkout converts that whole session, including any later abandoned cart in the
same session. A separate journey identifier would resolve that ambiguity; it is
deferred. A failed checkout qualifies as a dropoff only after inactivity and only
when the session has a successful cart addition and no successful checkout.

Browser/tab closure cannot reliably emit a final event, so closed sessions use
the same inactivity rule. We deliberately avoid treating page unload or a hidden
tab as confirmed abandonment: navigation and tab switching can cause both.
Event silence is inferred from captured Faro events; quiet browsing or form filling
without events can still qualify. Adding throttled, value-free interaction
signals would improve that estimate. Session IDs and browser signals are best
effort, not unique people or an authoritative order ledger. This correction
changes only dashboard queries and documentation, preserving product behavior.

Earlier validation used a temporary local Loki 3.6.0 instance and the exported
LogQL query. All 14 scenarios passed: 20-second and 59-second shoppers stay
active, 61-second demo and 901-second normal inactivity qualify, recent activity
resets eligibility, active shoppers do not dilute the denominator, older purchases
and successful retries prevent dropoff, repeated events do not multiply sessions,
empty/out-of-window cohorts show gaps, and longer dashboard ranges parse correctly.
`npm run lint` and `npm run typecheck` passed. All 11 app tests passed with
`PW_CHANNEL= E2E_MODE=prod npm test`; Chromium was used because Chrome was absent,
and production mode avoided conflicting with the running development server.
That correction was initially validated locally before the Cloud update below.

## One-minute dashboard buckets

Sessions, checkout attempts, checkout error rate, and inactivity-qualified dropoff
use 1-minute windows with an explicit Loki `step` of `1m`, so increasing the visible
range does not turn a minute into a rolling whole-range calculation. Sessions use
time-series bars labeled Active Sessions per Minute; the same session can appear
in several minutes, so those bars must not be summed into a distinct total.
Product rankings retain selected-range totals because their axis compares products.
All six panels use tooltip mode All, so hovering shows every series at that point.
Dropoff's configurable inactivity threshold remains separate from bucket size,
and successful purchases are checked over four hours plus the cohort minute.

Updated the existing Grafana Cloud dashboard through its JSON editor and reloaded
the saved version. All six panels rendered over Last 30 minutes at a verified
1920 x 1080 responsive viewport. JSON checks confirmed explicit 1-minute windows
and steps on all four time charts, with selected-range queries for product rankings.
Lint and typecheck passed, along with all 11 app tests using
`PW_CHANNEL= E2E_MODE=prod npm test` on a separate server from the running simulation.

## Purchase intent qualification

The next refinement excludes browsing-only sessions. The previous query returned
100% for one inactive product-view-only session; the corrected query returns an
empty cohort. All 20 local Loki scenarios passed, covering successful versus
failed cart additions, both inactivity thresholds, cart additions before the
visible minute, inactive qualified denominators, retries, and older purchases.
Lint, typecheck, and all 11 production-mode app tests passed. Updated Grafana Cloud
through its JSON editor, reloaded, and verified the saved query matches the tested
export while all five other panels remain unchanged. The dashboard rendered at
1920 x 1080 in responsive mode; the inactivity selector still defaults to Demo
(60s) and retains Normal (15m).

The canonical rule is: a session has a successful add-to-cart, no successful
checkout, and no new recorded session events for the selected timeout. The
existing tested LogQL already implements this; wording now explicitly describes
event silence and removes a separate termination branch from the decision notes.
The selector is labeled Dropoff timeout. We retain 60 seconds for the simulator
demo: ordinary pauses are 0.4-1.5 seconds, form/retry pauses reach 2.5 seconds,
slow payments take 3-5 seconds, checkout-result waits allow 15 seconds, and the
final flush pause is 3-4 seconds. This leaves headroom for navigation and delivery;
it is an assumption from script timings, not a measured ingestion bound. Normal
use retains 15 minutes. No query logic or product behavior changes were needed.
