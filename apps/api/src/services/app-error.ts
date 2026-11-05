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
  ) {
    super(detail ?? code);
  }
}
