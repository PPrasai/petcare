import { NetworkError } from '../../application/ports/remote-api';

export interface HttpResult {
  status: number;
  /** Parsed JSON body, or null when there is none. */
  body: unknown;
}

/**
 * A same-origin JSON request with the session cookie. A request that cannot complete, or a
 * 502/503/504 from a proxy in front of a stopped API, is a NetworkError: the caller retries.
 */
export async function http(method: string, path: string, body?: unknown): Promise<HttpResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new NetworkError();
  }
  if ([502, 503, 504].includes(response.status)) throw new NetworkError(`HTTP ${response.status}`);
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  return { status: response.status, body: parsed };
}

/** The `code` of a problem+json body, if there is one. */
export function problemCode(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const code = (body as { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'error';
}
