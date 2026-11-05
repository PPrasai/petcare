import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/** CAP-18: dashboards and alert rules are files in the repo (AS section 6). */
const DIR = join(__dirname, '..', '..', '..', 'deploy', 'observability');

interface Dashboard {
  uid: string;
  title: string;
  panels: { title: string; targets: { expr: string }[] }[];
}
interface AlertRule {
  uid: string;
  title: string;
  for: string;
  data: {
    refId: string;
    model: { expr?: string; conditions?: { evaluator: { params: number[] } }[] };
  }[];
}

const dashboards = readdirSync(join(DIR, 'dashboards')).map(
  (name) => JSON.parse(readFileSync(join(DIR, 'dashboards', name), 'utf8')) as Dashboard,
);
const alerts = parse(readFileSync(join(DIR, 'petcare-alerts.yaml'), 'utf8')) as {
  groups: { rules: AlertRule[] }[];
};
const rules = alerts.groups.flatMap((g) => g.rules);

describe('dashboards', () => {
  it('cover the API, sync, notifications and auth', () => {
    expect(dashboards.map((d) => d.uid).sort()).toEqual([
      'petcare-api',
      'petcare-auth',
      'petcare-notifications',
      'petcare-sync',
    ]);
  });

  it('have panels with queries, and unique uids', () => {
    for (const d of dashboards) {
      expect(d.panels.length, d.title).toBeGreaterThan(0);
      for (const p of d.panels)
        expect(
          p.targets.every((t) => t.expr.length > 0),
          p.title,
        ).toBe(true);
    }
    expect(new Set(dashboards.map((d) => d.uid)).size).toBe(dashboards.length);
  });

  it('chart every custom metric of AS section 6', () => {
    const text = JSON.stringify(dashboards);
    for (const metric of [
      'petcare_sync_mutations_total',
      'petcare_sync_conflicts_total',
      'petcare_notifications_sent_total',
      'petcare_notification_dispatch_lag_seconds',
      'petcare_auth_signins_total',
      'petcare_upload_bytes_total',
      'petcare_cache_requests_total',
      'http_server_request_duration_seconds',
    ]) {
      expect(text, metric).toContain(metric);
    }
  });
});

describe('alert rules', () => {
  const threshold = (rule: AlertRule) =>
    rule.data.find((d) => d.refId === 'C')?.model.conditions?.[0]?.evaluator.params[0];

  it('define the five alerts of AS section 6 with their thresholds', () => {
    const byUid = new Map(rules.map((r) => [r.uid, r]));
    expect([...byUid.keys()].sort()).toEqual([
      'petcare-5xx-rate',
      'petcare-api-down',
      'petcare-disk-usage',
      'petcare-dispatch-lag',
      'petcare-p95-latency',
    ]);
    expect(threshold(byUid.get('petcare-5xx-rate') as AlertRule)).toBe(0.05);
    expect(byUid.get('petcare-5xx-rate')?.for).toBe('5m');
    expect(threshold(byUid.get('petcare-p95-latency') as AlertRule)).toBe(1);
    expect(byUid.get('petcare-p95-latency')?.for).toBe('10m');
    expect(threshold(byUid.get('petcare-dispatch-lag') as AlertRule)).toBe(300);
    expect(threshold(byUid.get('petcare-disk-usage') as AlertRule)).toBe(0.8);
    const down = byUid.get('petcare-api-down') as AlertRule;
    expect(down.data[0]?.model.expr).toContain('absent_over_time');
    expect(down.data[0]?.model.expr).toContain('[5m]');
  });
});

describe('collector config', () => {
  it('collects host CPU, memory, disk and filesystem metrics', () => {
    const config = parse(readFileSync(join(DIR, 'otelcol-config.yaml'), 'utf8')) as {
      receivers: { hostmetrics: { scrapers: Record<string, unknown> } };
      service: { pipelines: { metrics: { receivers: string[] } } };
    };
    expect(Object.keys(config.receivers.hostmetrics.scrapers)).toEqual(
      expect.arrayContaining(['cpu', 'memory', 'disk', 'filesystem']),
    );
    expect(config.service.pipelines.metrics.receivers).toContain('hostmetrics');
  });
});
