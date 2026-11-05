import { trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { DestinationStream, Logger } from 'pino';

export type { Logger };

/**
 * Paths whose values are never written to logs (AS section 6).
 * Request bodies are never logged at all; `body` is listed as a second line of defence.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'headers.cookie',
  'headers.authorization',
  '*.password',
  '*.token',
  '*.secret',
  '*.newPassword',
  '*.currentPassword',
  'password',
  'token',
  'secret',
  'body',
  '*.body',
];

/** pino JSON logger with trace_id and span_id from the active span. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      mixin() {
        const ctx = trace.getActiveSpan()?.spanContext();
        return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
      },
    },
    destination,
  );
}
