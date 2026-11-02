import {
  initializeFaro,
  SessionInstrumentation,
  ViewInstrumentation,
  type Faro,
} from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

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

export function trackEvent(name: string, attributes: Record<string, string> = {}) {
  safely(() => faro?.api.pushEvent(name, attributes, "shop", { skipDedupe: true }));
}

export function trackView(view: "catalog" | "product", attributes: Record<string, string>) {
  safely(() => faro?.api.setView({ name: view }));
  trackEvent(`shop.${view}_view`, attributes);
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
