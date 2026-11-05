import { trace } from '@opentelemetry/api';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../services/app-error';
import type { FieldProblem, ProblemCode } from '../services/app-error';

const TITLES: Record<ProblemCode, string> = {
  invalid: 'Invalid request',
  unauthenticated: 'Sign in required',
  forbidden: 'Not allowed',
  badOrigin: 'Request origin not allowed',
  notFound: 'Not found',
  conflict: 'Conflict',
  soleOwner: 'You are the only owner',
  lastOwner: 'The last owner cannot leave',
  quotaExceeded: 'Storage quota exceeded',
  unsupportedType: 'Unsupported file type',
  tooLarge: 'Request too large',
  rateLimited: 'Too many requests',
  cursorExpired: 'Cursor expired',
  internal: 'Internal error',
};

interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail?: string;
  traceId?: string;
  errors?: FieldProblem[];
}

const ZERO_TRACE = /^0+$/;

function traceId(): string | undefined {
  const id = trace.getActiveSpan()?.spanContext().traceId;
  return id && !ZERO_TRACE.test(id) ? id : undefined;
}

function problem(
  code: ProblemCode,
  status: number,
  detail?: string,
  errors?: FieldProblem[],
): Problem {
  const id = traceId();
  return {
    type: `https://petcare.pprasai.io/problems/${code}`,
    title: TITLES[code],
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
    ...(id === undefined ? {} : { traceId: id }),
    ...(errors === undefined ? {} : { errors }),
  };
}

function pointer(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '' : '/' + path.map(String).join('/');
}

/** Maps any thrown error to a problem+json body. Unknown errors are 500 with the detail hidden. */
function toProblem(error: FastifyError | Error): Problem {
  if (error instanceof AppError) {
    return problem(error.code, error.status, error.detail, error.errors);
  }
  if (error instanceof ZodError) {
    const errors = error.issues.map((i) => ({ path: pointer(i.path), message: i.message }));
    return problem('invalid', 400, undefined, errors);
  }
  const e = error as FastifyError;
  if (e.validation) {
    const errors = e.validation.map((v) => ({
      path: v.instancePath,
      message: v.message ?? 'invalid',
    }));
    return problem('invalid', 400, undefined, errors);
  }
  if (e.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || e.statusCode === 413)
    return problem('tooLarge', 413);
  if (e.statusCode === 429) return problem('rateLimited', 429);
  if (e.statusCode === 415) return problem('unsupportedType', 415);
  if (e.statusCode === 400) return problem('invalid', 400);
  return problem('internal', 500);
}

function send(reply: FastifyReply, body: Problem): FastifyReply {
  return reply.code(body.status).type('application/problem+json').send(body);
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request: FastifyRequest, reply) =>
    send(reply, problem('notFound', 404)),
  );
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const body = toProblem(error);
    if (body.status >= 500) request.log.error({ err: error }, 'unhandled error');
    return send(reply, body);
  });
}
