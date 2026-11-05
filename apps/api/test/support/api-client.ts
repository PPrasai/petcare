import type { LightMyRequestResponse } from 'fastify';
import type { TestApp } from './test-app';

export const ORIGIN = 'http://localhost:5173';
let nextIp = 1;

/** A tiny cookie-keeping HTTP client over `app.inject`, with its own client IP. */
export class ApiClient {
  readonly ip: string;
  private cookies = new Map<string, string>();

  constructor(
    private readonly api: TestApp,
    private readonly origin: string = ORIGIN,
    ip?: string,
  ) {
    this.ip = ip ?? `198.51.100.${nextIp++ % 250}`;
  }

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await this.api.app.inject({
      method,
      url,
      remoteAddress: '127.0.0.1',
      headers: {
        origin: this.origin,
        'x-forwarded-for': this.ip,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
    for (const header of [res.headers['set-cookie']].flat()) {
      if (!header) continue;
      const [pair = '', ...attrs] = header.split(';');
      const [name = '', ...value] = pair.split('=');
      const expired = attrs.some((a) => /max-age=0/i.test(a));
      if (expired || value.join('=') === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value.join('='));
    }
    return res;
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request('POST', url, body ?? {}, headers);
  }
  put(url: string, body: unknown) {
    return this.request('PUT', url, body);
  }

  signUp(email: string, name = 'Test User', password = 'correct-horse-battery') {
    return this.post('/api/auth/sign-up/email', { email, name, password });
  }
  signIn(email: string, password = 'correct-horse-battery') {
    return this.post('/api/auth/sign-in/email', { email, password });
  }
}

let counter = 0;
export const uniqueEmail = (label = 'user') => `${label}-${Date.now()}-${counter++}@example.test`;
