import { createServer } from "node:http";
import { parse } from "protobufjs";

// Wire-compatible subset of the public OTLP trace schema. Decode the actual
// protobuf export rather than mocking the SDK or inspecting application state.
const schema = parse(`
  syntax = "proto3";
  message AnyValue { string stringValue = 1; bool boolValue = 2; int64 intValue = 3; double doubleValue = 4; }
  message KeyValue { string key = 1; AnyValue value = 2; }
  message Resource { repeated KeyValue attributes = 1; }
  message Status { string message = 2; int32 code = 3; }
  message Event { fixed64 timeUnixNano = 1; string name = 2; repeated KeyValue attributes = 3; }
  message Span {
    bytes traceId = 1; bytes spanId = 2; string traceState = 3; bytes parentSpanId = 4;
    string name = 5; int32 kind = 6; repeated KeyValue attributes = 9;
    repeated Event events = 11; Status status = 15;
  }
  message ScopeSpans { repeated Span spans = 2; }
  message ResourceSpans { Resource resource = 1; repeated ScopeSpans scopeSpans = 2; }
  message ExportTraceServiceRequest { repeated ResourceSpans resourceSpans = 1; }
  message LogRecord {
    fixed64 timeUnixNano = 1; int32 severityNumber = 2; AnyValue body = 5;
    repeated KeyValue attributes = 6; bytes traceId = 9; bytes spanId = 10; string eventName = 12;
  }
  message ScopeLogs { repeated LogRecord logRecords = 2; }
  message ResourceLogs { Resource resource = 1; repeated ScopeLogs scopeLogs = 2; }
  message ExportLogsServiceRequest { repeated ResourceLogs resourceLogs = 1; }
`).root;
const exportType = schema.lookupType("ExportTraceServiceRequest");
const logsType = schema.lookupType("ExportLogsServiceRequest");

type Attribute = { key: string; value: Record<string, string | number | boolean> };
type WireSpan = {
  traceId: Buffer;
  spanId: Buffer;
  parentSpanId?: Buffer;
  traceState?: string;
  name: string;
  kind: number;
  attributes?: Attribute[];
  events?: { name: string; attributes?: Attribute[] }[];
  status?: { code?: number };
};
export type BackendSpan = Omit<WireSpan, "traceId" | "spanId" | "parentSpanId" | "attributes" | "events"> & {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  attributes: Record<string, string | number | boolean>;
  resource: Record<string, string | number | boolean>;
  events: { name: string; attributes: Record<string, string | number | boolean> }[];
};
export type BackendLog = {
  eventName: string;
  traceId: string;
  spanId: string;
  severityNumber: number;
  attributes: Record<string, string | number | boolean>;
  resource: Record<string, string | number | boolean>;
};

function attributes(entries: Attribute[] = []) {
  return Object.fromEntries(entries.map(({ key, value }) => [
    key, "intValue" in value ? Number(value.intValue) : Object.values(value)[0],
  ]));
}

export async function startCollector() {
  const collector = { spans: [] as BackendSpan[], logs: [] as BackendLog[], rejectExports: false, rejectedExports: 0 };
  const server = createServer(async (request, response) => {
    if (request.url !== "/v1/traces" && request.url !== "/v1/logs") { response.writeHead(404).end(); return; }
    if (collector.rejectExports) {
      collector.rejectedExports++;
      request.resume();
      response.writeHead(503).end();
      return;
    }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.url === "/v1/logs") {
        const payload = logsType.toObject(logsType.decode(Buffer.concat(chunks)), { longs: String }) as {
          resourceLogs?: { resource?: { attributes?: Attribute[] }; scopeLogs?: { logRecords?: {
            eventName: string; traceId?: Buffer; spanId?: Buffer; severityNumber: number; attributes?: Attribute[];
          }[] }[] }[];
        };
        for (const resource of payload.resourceLogs ?? []) {
          for (const scope of resource.scopeLogs ?? []) {
            collector.logs.push(...(scope.logRecords ?? []).map((record) => ({
              eventName: record.eventName,
              traceId: Buffer.from(record.traceId ?? []).toString("hex"),
              spanId: Buffer.from(record.spanId ?? []).toString("hex"),
              severityNumber: record.severityNumber,
              attributes: attributes(record.attributes),
              resource: attributes(resource.resource?.attributes),
            })));
          }
        }
        response.writeHead(200, { "Content-Type": "application/x-protobuf" }).end();
        return;
      }
      const payload = exportType.toObject(exportType.decode(Buffer.concat(chunks)), { longs: String }) as {
        resourceSpans?: { resource?: { attributes?: Attribute[] }; scopeSpans?: { spans?: WireSpan[] }[] }[];
      };
      for (const resource of payload.resourceSpans ?? []) {
        for (const scope of resource.scopeSpans ?? []) {
          collector.spans.push(...(scope.spans ?? []).map((span) => ({
            ...span,
            traceId: Buffer.from(span.traceId).toString("hex"),
            spanId: Buffer.from(span.spanId).toString("hex"),
            parentSpanId: span.parentSpanId?.length ? Buffer.from(span.parentSpanId).toString("hex") : undefined,
            attributes: attributes(span.attributes),
            resource: attributes(resource.resource?.attributes),
            events: (span.events ?? []).map((event) => ({ ...event, attributes: attributes(event.attributes) })),
          })));
        }
      }
      response.writeHead(200, { "Content-Type": "application/x-protobuf" }).end();
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3218, "127.0.0.1", resolve);
  });
  return {
    ...collector,
    // Keep toggles on the object used by the request handler.
    get rejectExports() { return collector.rejectExports; },
    set rejectExports(value: boolean) { collector.rejectExports = value; },
    get rejectedExports() { return collector.rejectedExports; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
