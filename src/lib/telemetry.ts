import {
  initializeFaro,
  SessionInstrumentation,
  ViewInstrumentation,
  type Faro,
} from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";
import { propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import { W3CBaggagePropagator } from "@opentelemetry/core";

let faro: Faro | undefined;

// Observability must never change a product result or make a request wait.
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

export function initializeTelemetry() {
  const url = process.env.NEXT_PUBLIC_FARO_URL;
  if (!url || faro) return;
  safely(() => {
    faro = initializeFaro({
      url,
      app: {
        name: "observable-outfitters",
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
        environment: process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "development",
      },
      sessionTracking: { enabled: true, persistent: false, samplingRate: 1 },
      // Only explicit business signals: no console, form, replay, or automatic
      // network capture (checkout requests contain payment/shipping details).
      instrumentations: [
        new SessionInstrumentation(),
        new ViewInstrumentation(),
        new TracingInstrumentation({ instrumentations: [] }),
      ],
      beforeSend(item) {
        // Never ship URL queries, fragments, or order identifiers in page meta.
        if (item.meta.page) {
          const path = window.location.pathname.replace(/^\/orders\/[^/]+$/, "/orders/[id]");
          item.meta = { ...item.meta, page: { ...item.meta.page, id: path, url: `${window.location.origin}${path}` } };
        }
        return item;
      },
    });
  });
}

export function trackEvent(name: string, attributes: Record<string, string> = {}, span?: Span) {
  safely(() => faro?.api.pushEvent(name, attributes, "shop", { skipDedupe: true, spanContext: span?.spanContext() }));
}

export type ShopView = "catalog" | "product" | "cart" | "checkout" | "order_confirmation";

export function trackView(view: ShopView, attributes: Record<string, string>) {
  safely(() => faro?.api.setView({ name: view }));
  trackEvent(`shop.${view}_view`, attributes);
}

export async function requestApi(path: "/api/cart" | "/api/checkout", init: RequestInit = {}, parentSpan?: Span) {
  const otel = safely(() => faro?.api.getOTEL());
  const method = init.method ?? "GET";
  const parent = otel && parentSpan ? otel.trace.setSpan(ROOT_CONTEXT, parentSpan) : ROOT_CONTEXT;
  const span = safely(() => otel?.trace.getTracer("observable-outfitters").startSpan(`${method} ${path}`, {
    kind: SpanKind.CLIENT,
    attributes: { "http.request.method": method, "url.full": `${window.location.origin}${path}` },
  }, parent));
  const headers = new Headers(init.headers);
  safely(() => {
    const session = faro?.api.getSession()?.id;
    if (session && /^[a-zA-Z0-9_-]{1,128}$/.test(session)) {
      const baggage = propagation.createBaggage({ "session.id": { value: session } });
      new W3CBaggagePropagator().inject(propagation.setBaggage(parent, baggage), headers, {
        set: (carrier, key, value) => carrier.set(key, value),
      });
      span?.setAttribute("session.id", session);
    }
    if (otel && span) propagation.inject(otel.trace.setSpan(parent, span), headers, {
      set: (carrier, key, value) => carrier.set(key, value),
    });
  });
  try {
    const response = await fetch(path, { ...init, headers });
    safely(() => {
      span?.setAttribute("http.response.status_code", response.status);
      if (response.status >= 400) {
        span?.setAttribute("error.type", String(response.status));
        span?.setStatus({ code: SpanStatusCode.ERROR });
      }
    });
    return response;
  } catch (error) {
    safely(() => {
      span?.recordException({ name: "Error", message: "API request failed" });
      span?.setAttribute("error.type", "network_error");
      span?.setStatus({ code: SpanStatusCode.ERROR });
    });
    throw error;
  } finally {
    safely(() => span?.end());
  }
}

export function startOperation(name: string, attributes: Record<string, string> = {}) {
  const started = performance.now();
  const span = safely(() => {
    const otel = faro?.api.getOTEL();
    return otel?.trace.getTracer("observable-outfitters").startSpan(
      name,
      { attributes },
      // Each shopper action is a new root, even when another action is active.
      otel.trace.deleteSpan(otel.context.active()),
    );
  });
  let finished = false;

  return {
    fetch: (path: "/api/cart" | "/api/checkout", init?: RequestInit) => requestApi(path, init, span),
    trackEvent: (event: string, fields: Record<string, string>) => trackEvent(event, fields, span),
    finish(outcome: "success" | "fail", errorCode = "none", extra: Record<string, string> = {}) {
      if (finished) return;
      finished = true;
      const result = {
        ...attributes,
        ...extra,
        outcome,
        error_code: errorCode,
        duration_ms: String(Math.round(performance.now() - started)),
      };
      safely(() => {
        faro?.api.pushEvent(name, result, "shop", {
          skipDedupe: true,
          spanContext: span?.spanContext(),
        });
      });
      // Finish the span even if event transport failed.
      safely(() => {
        span?.setAttributes(result);
        span?.setStatus({ code: outcome === "success" ? 1 : 2 });
        span?.end();
      });
    },
  };
}
