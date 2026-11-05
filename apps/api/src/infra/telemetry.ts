import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import type { Config } from '../config/env';

const SECRET_PATHS = /^\/(cal\/|api\/public\/emergency\/)/;

/**
 * Starts the OpenTelemetry SDK (traces + metrics over OTLP/HTTP to the internal collector).
 * Must run before fastify, pg and ioredis are imported so they get instrumented.
 * Returns a shutdown function. A down collector drops batches; the product is unaffected.
 */
export function startTelemetry(config: Config): () => Promise<void> {
  if (config.otel.disabled) return async () => undefined;
  process.env.OTEL_SERVICE_NAME ??= config.otel.serviceName;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= config.otel.endpoint;
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        // File-system spans are noise for this API.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Paths that carry secret tokens never become spans (CON-petcare-001 section 2.2).
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => SECRET_PATHS.test(req.url ?? ''),
        },
      }),
    ],
  });
  sdk.start();
  return () => sdk.shutdown().catch(() => undefined);
}
