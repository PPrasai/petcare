import { FastifyOtelInstrumentation } from '@fastify/otel';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node';

export type SpanProcessor = NonNullable<NodeSDKConfiguration['spanProcessors']>[number];
import type { Config } from '../config/env';

/** Paths whose URL is itself a secret (CON-petcare-001 section 2.2). They never become spans. */
const SECRET_PATHS = /^\/(cal\/|api\/public\/emergency\/)/;

export interface TelemetryOptions {
  /** Test seam: extra processors, e.g. an in-memory exporter. */
  spanProcessors?: SpanProcessor[];
}

/**
 * Starts the OpenTelemetry SDK (traces + metrics over OTLP/HTTP to the internal collector).
 * Must run before fastify, pg and ioredis are imported so they get instrumented.
 * Returns a shutdown function. A down collector drops batches; the product is unaffected.
 */
export function startTelemetry(
  config: Config,
  options: TelemetryOptions = {},
): () => Promise<void> {
  if (config.otel.disabled) return async () => undefined;
  process.env.OTEL_SERVICE_NAME ??= config.otel.serviceName;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= config.otel.endpoint;
  const sdk = new NodeSDK({
    ...(options.spanProcessors ? { spanProcessors: options.spanProcessors } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        // File-system spans are noise for this API.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => SECRET_PATHS.test(req.url ?? ''),
        },
      }),
      // Route spans (the route template names them, so path tokens never appear).
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: (request) => SECRET_PATHS.test(request.url),
        requestHook: (span, request) =>
          span.updateName(`${request.method} ${request.routeOptions.url ?? 'unmatched'}`),
      }),
    ],
  });
  sdk.start();
  return () => sdk.shutdown().catch(() => undefined);
}
