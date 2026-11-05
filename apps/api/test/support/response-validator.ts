import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

/**
 * QA-10 / CON-petcare-001 I-01: every response from a non-`x-owner` operation must validate
 * against packages/contracts/openapi.yaml.
 */
const contracts = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts');
const BASE = 'https://petcare.pprasai.io/contracts/';

interface Operation {
  'x-owner'?: string;
  responses: Record<string, ResponseObject>;
}
interface ResponseObject {
  $ref?: string;
  content?: Record<string, unknown>;
}
interface OpenApi {
  paths: Record<string, Record<string, Operation>>;
}

const doc = parse(readFileSync(join(contracts, 'openapi.yaml'), 'utf8')) as OpenApi;
const records = JSON.parse(readFileSync(join(contracts, 'records.schema.json'), 'utf8'));

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(records);
ajv.addSchema({ ...doc, $id: `${BASE}openapi.json` });

/** Status codes the contract applies to every operation, with the Problem.code they carry. */
const CROSS_CUTTING: Record<number, string> = {
  403: 'badOrigin',
  413: 'tooLarge',
  429: 'rateLimited',
  500: 'internal',
};

const escape = (s: string) => encodeURIComponent(s.replaceAll('~', '~0').replaceAll('/', '~1'));
const cache = new Map<string, ValidateFunction>();

export interface ResponseCheck {
  method: string;
  /** Fastify route template, e.g. /api/households/:householdId */
  routeUrl: string;
  status: number;
  contentType: string;
  body: unknown;
}

/** Failures collected during a test; setup.ts fails the test if any remain. */
export const responseFailures: string[] = [];

export function toOpenApiPath(routeUrl: string): string {
  return routeUrl.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/** Returns an error message, or null when the response matches the contract. */
export function checkResponse(r: ResponseCheck): string | null {
  const path = toOpenApiPath(r.routeUrl);
  const operation = doc.paths[path]?.[r.method.toLowerCase()];
  const label = `${r.method} ${path} -> ${r.status}`;
  if (!operation) return `${label}: not in openapi.yaml`;
  if (operation['x-owner']) return null;

  const key = String(r.status);
  const entry = operation.responses[key] ?? operation.responses.default;
  if (!entry) {
    // CON-petcare-001 section 1 and 2.1 define these for every operation in prose, without
    // repeating them per operation: the problem code must match and the body must be a Problem.
    const crossCutting = CROSS_CUTTING[r.status];
    if (crossCutting && (r.body as { code?: string } | null)?.code === crossCutting) {
      return checkComponent('Problem', r.body) === null
        ? null
        : `${label}: cross-cutting body is not a Problem`;
    }
    return `${label}: status not documented`;
  }
  const responseKey = operation.responses[key] ? key : 'default';
  const base = `${BASE}openapi.json#/paths/${escape(path)}/${r.method.toLowerCase()}/responses/${responseKey}`;
  const pointer = entry.$ref ? `${BASE}openapi.json#/${entry.$ref.replace(/^#\//, '')}` : base;
  const resolved = entry.$ref ? resolveResponse(entry.$ref) : entry;

  const mediaType = r.contentType.split(';')[0]?.trim() ?? '';
  const media = resolved?.content?.[mediaType];
  if (!resolved?.content) return null; // documented with no body
  if (!media) return `${label}: content-type ${mediaType} not documented`;

  const schemaRef = `${pointer}/content/${escape(mediaType)}/schema`;
  let validate = cache.get(schemaRef);
  if (!validate) {
    validate = ajv.compile({ $ref: schemaRef });
    cache.set(schemaRef, validate);
  }
  return validate(r.body)
    ? null
    : `${label}: body does not match openapi.yaml: ${ajv.errorsText(validate.errors)}`;
}

function resolveResponse(ref: string): ResponseObject | undefined {
  const name = ref.split('/').pop() ?? '';
  const components = (
    doc as unknown as { components: { responses: Record<string, ResponseObject> } }
  ).components;
  return components.responses[name];
}

/** Validates a value against a named schema in openapi.yaml components (for unmatched routes). */
export function checkComponent(name: string, value: unknown): string | null {
  const ref = `${BASE}openapi.json#/components/schemas/${name}`;
  let validate = cache.get(ref);
  if (!validate) {
    validate = ajv.compile({ $ref: ref });
    cache.set(ref, validate);
  }
  return validate(value) ? null : ajv.errorsText(validate.errors);
}
