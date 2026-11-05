/** Budgets from the architecture spec (QA-01). */
export const BUDGET = { readP95Ms: 300, pushP95Ms: 500, rssMb: 512 } as const;

export interface Sample {
  kind: 'read' | 'push';
  path: string;
  ms: number;
  ok: boolean;
}

export interface Stats {
  count: number;
  failures: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface PerfReport {
  date: string;
  virtualUsers: number;
  /** Mean pause between a virtual user's requests. */
  thinkMs: number;
  requestsPerSecond: number;
  reads: Stats;
  push: Stats;
  /** p95 per endpoint, to show where the time goes. */
  byPath: Record<string, Stats>;
  rssPeakMb: number;
  budget: typeof BUDGET;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function stats(samples: Sample[]): Stats {
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  return {
    count: samples.length,
    failures: samples.filter((s) => !s.ok).length,
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted.at(-1) ?? 0),
  };
}

export function summarize(input: {
  samples: Sample[];
  rssPeakMb: number;
  virtualUsers: number;
  thinkMs: number;
  measuredSeconds: number;
}): PerfReport {
  return {
    date: new Date().toISOString(),
    virtualUsers: input.virtualUsers,
    thinkMs: input.thinkMs,
    requestsPerSecond: round(input.samples.length / input.measuredSeconds),
    reads: stats(input.samples.filter((s) => s.kind === 'read')),
    push: stats(input.samples.filter((s) => s.kind === 'push')),
    byPath: Object.fromEntries(
      [...new Set(input.samples.map((s) => s.path))]
        .sort()
        .map((path) => [path, stats(input.samples.filter((s) => s.path === path))]),
    ),
    rssPeakMb: round(input.rssPeakMb),
    budget: BUDGET,
  };
}

/** The ways a report breaks the budget; empty when it is met. */
export function verdict(report: PerfReport): string[] {
  const breaches: string[] = [];
  if (report.reads.count === 0 || report.push.count === 0) breaches.push('no samples were taken');
  if (report.reads.p95Ms > BUDGET.readP95Ms) {
    breaches.push(`reads p95 ${report.reads.p95Ms} ms > ${BUDGET.readP95Ms} ms`);
  }
  if (report.push.p95Ms > BUDGET.pushP95Ms) {
    breaches.push(`push p95 ${report.push.p95Ms} ms > ${BUDGET.pushP95Ms} ms`);
  }
  if (report.rssPeakMb > BUDGET.rssMb) {
    breaches.push(`API RSS ${report.rssPeakMb} MB > ${BUDGET.rssMb} MB`);
  }
  const failed = report.reads.failures + report.push.failures;
  if (failed > 0) breaches.push(`${failed} requests failed`);
  return breaches;
}
