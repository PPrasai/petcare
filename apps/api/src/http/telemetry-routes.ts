import type { FastifyInstance } from 'fastify';

export const TELEMETRY_BODY_LIMIT = 262_144;

export interface TelemetryRelayOptions {
  /** Base URL of the internal OTLP/HTTP collector, or null when telemetry is off. */
  collectorEndpoint: string | null;
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** Secret tokens in paths (emergency, calendar, invites) must never reach the trace store. */
const SECRET_PATH = /(\/(?:e|cal|api\/public\/emergency|join)\/)[A-Za-z0-9_-]{16,}(?:\.ics)?/g;
export const scrubSecrets = (text: string): string => text.replace(SECRET_PATH, '$1:token');

interface OtlpAttribute {
  key: string;
  value: { stringValue: string };
}
interface OtlpTraces {
  resourceSpans?: { resource?: { attributes?: OtlpAttribute[] } }[];
}

/** Marks every resource in a browser batch so the stores can tell it apart from API spans. */
function markAsBrowser(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const traces = payload as OtlpTraces;
  if (!Array.isArray(traces.resourceSpans)) return null;
  for (const entry of traces.resourceSpans) {
    const resource = (entry.resource ??= {});
    const attributes = (resource.attributes ??= []).filter((a) => a.key !== 'telemetry.source');
    attributes.push({ key: 'telemetry.source', value: { stringValue: 'browser' } });
    // The browser SDK sends no service name; give its spans their own.
    const named = attributes.find((a) => a.key === 'service.name');
    if (!named) attributes.push({ key: 'service.name', value: { stringValue: 'petcare-web' } });
    else if (named.value.stringValue.startsWith('unknown_service')) {
      named.value = { stringValue: 'petcare-web' };
    }
    resource.attributes = attributes;
  }
  return scrubSecrets(JSON.stringify(traces));
}

/**
 * relayBrowserTraces (CON-petcare-001 tag `telemetry`): receives OTLP/HTTP traces from the
 * browser and forwards them to the internal collector, so the collector is never public.
 * Always answers 202; when the collector is down or off the batch is dropped.
 */
export async function registerTelemetryRoutes(
  app: FastifyInstance,
  options: TelemetryRelayOptions,
): Promise<void> {
  const send = options.fetchImpl ?? fetch;
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-protobuf',
      { parseAs: 'buffer', bodyLimit: TELEMETRY_BODY_LIMIT },
      (_request, body, done) => done(null, body),
    );

    scope.post(
      '/api/telemetry/v1/traces',
      {
        bodyLimit: TELEMETRY_BODY_LIMIT,
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      },
      async (request, reply) => {
        const endpoint = options.collectorEndpoint;
        if (endpoint !== null) {
          const isProtobuf = Buffer.isBuffer(request.body);
          // A protobuf batch cannot be edited here; it is forwarded as sent.
          const json = isProtobuf ? null : markAsBrowser(request.body);
          if (isProtobuf || json !== null) {
            try {
              await send(`${endpoint.replace(/\/$/, '')}/v1/traces`, {
                method: 'POST',
                headers: {
                  'content-type': isProtobuf ? 'application/x-protobuf' : 'application/json',
                },
                body: isProtobuf ? (request.body as Buffer) : (json as string),
                signal: AbortSignal.timeout(3000),
              });
            } catch {
              // Collector down: drop the batch. The product is unaffected.
            }
          }
        }
        return reply.code(202).send();
      },
    );
  });
}
