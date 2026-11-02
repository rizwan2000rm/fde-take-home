import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor, type SpanProcessor } from "@opentelemetry/sdk-trace-base";

const state = globalThis as typeof globalThis & { __shopTelemetry?: NodeSDK };

export function initializeServerTelemetry() {
  if (state.__shopTelemetry || process.env.OTEL_SDK_DISABLED === "true") return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT && !process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return;

  const batch = new BatchSpanProcessor(new OTLPTraceExporter({ timeoutMillis: 3_000 }), {
    scheduledDelayMillis: 1_000,
    exportTimeoutMillis: 4_000,
    maxQueueSize: 1_024,
    maxExportBatchSize: 128,
  });
  // Export only our explicit, sanitized spans. Next's automatic spans can carry
  // raw URLs and exception messages. API spans explicitly extract the remote
  // parent, so filtering framework spans cannot leave gaps in our span tree.
  const processor: SpanProcessor = {
    onStart() {},
    onEnd(span) {
      if (span.instrumentationScope.name === "observable-outfitters") batch.onEnd(span);
    },
    forceFlush: () => batch.forceFlush(),
    shutdown: () => batch.shutdown(),
  };
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME || "observable-outfitters-api",
      "service.version": process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0",
      "deployment.environment.name": process.env.NEXT_PUBLIC_APP_ENVIRONMENT || "development",
    }),
    textMapPropagator: new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
    spanProcessors: [processor],
    logRecordProcessors: [new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({ timeoutMillis: 3_000 }),
      scheduledDelayMillis: 1_000,
      exportTimeoutMillis: 4_000,
      maxQueueSize: 1_024,
      maxExportBatchSize: 128,
    })],
    metricReaders: [],
    instrumentations: [],
  });
  sdk.start();
  state.__shopTelemetry = sdk;
  process.once("beforeExit", () => { void sdk.shutdown().catch(() => {}); });
}
