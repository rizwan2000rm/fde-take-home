import {
  context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace,
  type Context, type Span, type SpanOptions,
} from "@opentelemetry/api";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const propagator = new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] });
const businessFields = new WeakMap<Span, Record<string, string | number>>();

function sessionId(parent: Context) {
  const value = propagation.getBaggage(parent)?.getEntry("session.id")?.value;
  return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

function safely<T>(action: () => T): T | undefined {
  try { return action(); } catch { return undefined; }
}

function recordException(span: Span | undefined, error: unknown) {
  safely(() => {
    const type = error instanceof Error && ["Error", "TypeError", "SyntaxError", "PaymentDeclinedError"].includes(error.name)
      ? error.name : "Error";
    // JSON parsing errors can embed request bodies in their messages. Keep only
    // stack frames and a fixed message; never export raw errors or form values.
    const stack = error instanceof Error ? error.stack?.split("\n")
      .filter((line) => /^\s+at /.test(line)).slice(0, 20).join("\n") : undefined;
    span?.recordException({ name: type, message: "Operation failed", stack });
    span?.setAttribute("error.type", type);
    span?.setAttribute("shop.outcome", "fail");
    span?.setStatus({ code: SpanStatusCode.ERROR });
  });
}

export async function inServerSpan<T>(
  name: string,
  options: SpanOptions,
  action: (span: Span | undefined) => Promise<T>,
  parent: Context = context.active(),
): Promise<T> {
  const span = safely(() => {
    const session = sessionId(parent);
    const created = trace.getTracer("observable-outfitters").startSpan(name, {
      ...options,
      attributes: { ...options.attributes, ...(session ? { "session.id": session } : {}) },
    }, parent);
    businessFields.set(created, {});
    return created;
  });
  const run = async () => {
    try {
      return await action(span);
    } catch (error) {
      recordException(span, error);
      throw error;
    } finally {
      safely(() => span?.end());
    }
  };
  return context.with(span ? trace.setSpan(parent, span) : parent, run);
}

export function setServerAttributes(attributes: Record<string, string | number>) {
  safely(() => {
    const span = trace.getActiveSpan();
    if (!span) return;
    Object.assign(businessFields.get(span) ?? {}, attributes);
    span.setAttributes(attributes);
  });
}

// Business records are independent of trace sampling and carry the active
// trace/span context. No request bodies, order IDs, or raw errors are accepted.
export function recordServerEvent(name: "shop.cart_add" | "shop.checkout" | "shop.product_purchased", fields: Record<string, string | number>) {
  safely(() => {
    const parent = context.active();
    const session = sessionId(parent);
    const failure = fields.result === "error";
    logs.getLogger("observable-outfitters").emit({
      eventName: name,
      body: `event_name="${name}"`,
      context: parent,
      severityNumber: failure ? SeverityNumber.ERROR : fields.outcome === "fail" ? SeverityNumber.WARN : SeverityNumber.INFO,
      attributes: {
        "event.name": name,
        kind: "event",
        ...(session ? { "session.id": session } : {}),
        ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`event.data.${key}`, value])),
      },
    });
  });
}

function recordCheckoutResult(status: number) {
  safely(() => {
    const span = trace.getActiveSpan();
    const attributes = span && businessFields.get(span);
    const kind = attributes?.["shop.failure.kind"] ?? (status >= 500 ? "server" : status >= 400 ? "validation" : "none");
    recordServerEvent("shop.checkout", {
      outcome: status >= 400 ? "fail" : "success",
      result: status < 400 ? "accepted" : kind === "server" || kind === "provider" ? "error" : "rejected",
      failure_kind: kind,
      error_code: attributes?.["shop.error_code"] ?? (status >= 500 ? "server_error" : "none"),
      payment_error_code: attributes?.["shop.payment.error_code"] ?? "none",
      http_status: status,
    });
  });
}

export function traceApiRoute<Args extends [Request, ...unknown[]]>(
  route: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    const request = args[0];
    const parent = safely(() => propagator.extract(ROOT_CONTEXT, request.headers, {
      keys: (headers) => [...headers.keys()],
      get: (headers, key) => headers.get(key) ?? undefined,
    })) ?? ROOT_CONTEXT;
    return inServerSpan(`${request.method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: { "http.request.method": request.method, "http.route": route },
    }, async (span) => {
      try {
        const response = await handler(...args);
        safely(() => {
          span?.setAttributes({
            "http.response.status_code": response.status,
            "shop.outcome": response.status >= 400 ? "fail" : "success",
          });
          // OTel HTTP conventions leave SERVER status unset for expected 4xx.
          if (response.status >= 500) {
            span?.setAttribute("error.type", String(response.status));
            span?.setStatus({ code: SpanStatusCode.ERROR });
          }
        });
        if (route === "/api/checkout" && request.method === "POST") recordCheckoutResult(response.status);
        return response;
      } catch (error) {
        safely(() => span?.setAttribute("http.response.status_code", 500));
        if (route === "/api/checkout" && request.method === "POST") recordCheckoutResult(500);
        throw error;
      }
    }, parent);
  };
}
