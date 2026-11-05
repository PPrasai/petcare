import type { FastifyRequest } from 'fastify';
import { notFound } from '../services/app-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A path parameter that must be a UUID. A malformed one cannot match anything, so it is the
 * same 404 as a missing record (and never reaches Postgres as a bad uuid cast).
 */
export function uuidParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string | undefined>)[name];
  if (!value || !UUID.test(value)) throw notFound();
  return value;
}

export function textParam(request: FastifyRequest, name: string): string {
  const value = (request.params as Record<string, string | undefined>)[name];
  if (!value || value.length > 64) throw notFound();
  return value;
}
