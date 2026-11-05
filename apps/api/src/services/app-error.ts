/** Stable error codes (CON-petcare-001 Problem.code). */
export type ProblemCode =
  | 'invalid'
  | 'unauthenticated'
  | 'forbidden'
  | 'badOrigin'
  | 'notFound'
  | 'conflict'
  | 'soleOwner'
  | 'lastOwner'
  | 'quotaExceeded'
  | 'unsupportedType'
  | 'tooLarge'
  | 'rateLimited'
  | 'cursorExpired'
  | 'internal';

export interface FieldProblem {
  path: string;
  message: string;
}

/** Services throw this. One Fastify error handler turns it into problem+json. */
export class AppError extends Error {
  constructor(
    readonly code: ProblemCode,
    readonly status: number,
    readonly detail?: string,
    readonly errors?: FieldProblem[],
    /** Sent as the Retry-After header (429 responses). */
    readonly retryAfterSeconds?: number,
  ) {
    super(detail ?? code);
  }
}

export const notFound = (): AppError => new AppError('notFound', 404);
export const forbidden = (): AppError => new AppError('forbidden', 403);
export const invalid = (detail: string, path = ''): AppError =>
  new AppError('invalid', 400, undefined, [{ path, message: detail }]);
