import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/**
 * R-2 guard (SPEC-petcare-002 slice P5, deleted in P6): no UI may emit a CON-003-only shape
 * before the slices that are allowed to. `signUp` installs it on every page of the suite.
 * A violating push is aborted and logged to a file that the global teardown turns into a failure.
 */
export const VIOLATION_LOG = join(process.cwd(), 'test-results', 'v2-write-violations.log');

type Mutation = { type?: unknown; fields?: Record<string, unknown> };

/** The CON-003-only shapes found in a push body, as short descriptions. */
export function findV2Shapes(body: unknown): string[] {
  const found: string[] = [];
  const mutations = (body as { mutations?: Mutation[] } | null)?.mutations;
  if (!Array.isArray(mutations)) return found;
  for (const m of mutations) {
    const fields = m?.fields ?? {};
    if (m?.type === 'careLog' || m?.type === 'mealPreset') found.push(`type ${String(m.type)}`);
    if (m?.type === 'reminder' && 'category' in fields) found.push('reminder.category');
    if ('audienceUserId' in fields) found.push('audienceUserId');
    const schedule = fields.schedule as Record<string, unknown> | undefined;
    if (schedule && typeof schedule === 'object') {
      if (schedule.kind === 'yearly') found.push('schedule.kind yearly');
      if ('notBefore' in schedule) found.push('schedule.notBefore');
    }
  }
  return found;
}

export interface GuardOptions {
  /** Where a violation goes. The default writes VIOLATION_LOG. */
  report?: (found: string[]) => void;
}

const toLog = (found: string[]): void => {
  mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
  appendFileSync(VIOLATION_LOG, `${found.join(', ')}\n`);
};

/** Watches the page's sync pushes. Returns a counter of the pushes it has seen. */
export async function guardV2Writes(
  page: Page,
  options: GuardOptions = {},
): Promise<{ pushes: () => number }> {
  let seen = 0;
  await page.route('**/api/sync/push', async (route) => {
    seen += 1;
    const body = (() => {
      try {
        return route.request().postDataJSON() as unknown;
      } catch {
        return null;
      }
    })();
    const found = findV2Shapes(body);
    if (found.length === 0) return route.continue();
    (options.report ?? toLog)(found);
    return route.abort('failed');
  });
  return { pushes: () => seen };
}
