import { context, propagation, trace } from '@opentelemetry/api';
import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  StackContextManager,
  TraceIdRatioBasedSampler,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import type { SpanExporter } from '@opentelemetry/sdk-trace';

/** Where the API relays browser traces to the collector (CON-petcare-001 tag `telemetry`). */
export const TRACE_RELAY_PATH = '/api/telemetry/v1/traces';

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** W3C Trace Context for `traceparent` only (no baggage, no tracestate). */
export const traceContextPropagator: TextMapPropagator = {
  inject(ctx: Context, carrier: unknown, setter: TextMapSetter) {
    const span = trace.getSpan(ctx)?.spanContext();
    if (!span || !trace.isSpanContextValid(span)) return;
    const flags = (span.traceFlags & 1).toString(16).padStart(2, '0');
    setter.set(carrier, 'traceparent', `00-${span.traceId}-${span.spanId}-${flags}`);
  },
  extract(ctx: Context, carrier: unknown, getter: TextMapGetter) {
    const header = getter.get(carrier, 'traceparent');
    const match = TRACEPARENT.exec(Array.isArray(header) ? (header[0] ?? '') : (header ?? ''));
    if (!match) return ctx;
    return trace.setSpanContext(ctx, {
      traceId: match[1] as string,
      spanId: match[2] as string,
      traceFlags: parseInt(match[3] as string, 16),
      isRemote: true,
    });
  },
  fields: () => ['traceparent'],
};

/** Drops batches while `blocked()` is true, so the demo (QA-03) never reaches the network. */
export function gateExporter(inner: SpanExporter, blocked: () => boolean): SpanExporter {
  return {
    export(spans, done) {
      if (blocked()) done({ code: 0 });
      else inner.export(spans, done);
    },
    shutdown: () => inner.shutdown(),
    forceFlush: () => inner.forceFlush?.() ?? Promise.resolve(),
  };
}

export interface BrowserTelemetryOptions {
  /** 0 to 1; the share of page loads that are traced. */
  sampleRatio: number;
  /** True while the on-device demo is open. */
  isDemo: () => boolean;
  /** Test seam: replaces the OTLP exporter. */
  exporter?: SpanExporter;
}

/**
 * Starts browser tracing (CAP-18): page load and fetch spans, a `traceparent` on same-origin
 * requests, and uncaught errors as spans. Batches go to the API relay, never to the collector.
 * Returns a function that flushes and stops it.
 */
export function startBrowserTelemetry(options: BrowserTelemetryOptions): () => Promise<void> {
  const exporter = gateExporter(
    options.exporter ?? new OTLPTraceExporter({ url: TRACE_RELAY_PATH }),
    options.isDemo,
  );
  const provider = new TracerProvider({
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(options.sampleRatio) }),
    spanProcessors: [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 5000 })],
  });
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new StackContextManager().enable());
  propagation.setGlobalPropagator(traceContextPropagator);

  // Same-origin fetches get a traceparent by default; the relay itself is never traced.
  new FetchInstrumentation({ ignoreUrls: [/\/api\/telemetry\//], clearTimingResources: true });
  new DocumentLoadInstrumentation();

  const tracer = trace.getTracer('petcare-web');
  const record = (name: string, error: unknown) => {
    const span = tracer.startSpan(name);
    span.recordException(error instanceof Error ? error : String(error));
    span.setStatus({ code: 2 });
    span.end();
  };
  const onError = (event: ErrorEvent) => record('uncaught-error', event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => record('unhandled-rejection', event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return async () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    await provider.shutdown();
  };
}
