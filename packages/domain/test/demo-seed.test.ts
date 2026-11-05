import { describe, expect, it } from 'vitest';
import { DEMO_SEED, resolveDemoRecords } from '../src/demo-seed';
import { dueOccurrences } from '../src/due';
import { entities, getEntity } from '../src/registry';

const TODAY = new Date('2026-06-10T12:00:00Z');
const records = resolveDemoRecords(TODAY);

describe('demo seed', () => {
  it('has at least two records of every type', () => {
    for (const entity of entities) {
      expect(
        records.filter((r) => r.type === entity.type).length,
        entity.type,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('is valid against every entity schema, with unique ids', () => {
    for (const record of records) {
      const parsed = getEntity(record.type).schema.safeParse(record.data);
      expect(
        parsed.success,
        `${record.type} ${record.id}: ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true);
    }
    expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
  });

  it('only points at records and files that exist', () => {
    const ids = new Set(records.map((r) => r.id));
    const files = new Set(DEMO_SEED.files.map((f) => f.id));
    for (const record of records) {
      const entity = getEntity(record.type);
      for (const field of Object.keys(entity.refs)) {
        const value = record.data[field];
        if (typeof value === 'string') expect(ids.has(value), `${record.type}.${field}`).toBe(true);
      }
      for (const field of entity.fileRefs) {
        const value = record.data[field];
        if (typeof value === 'string')
          expect(files.has(value), `${record.type}.${field}`).toBe(true);
      }
    }
  });

  it('keeps dates relative to the day it is opened', () => {
    const later = resolveDemoRecords(new Date('2026-07-10T12:00:00Z'));
    const rabies = (list: typeof records) => list.find((r) => r.data.vaccineName === 'Rabies');
    expect(rabies(records)?.data.nextDueOn).toBe('2026-06-25');
    expect(rabies(later)?.data.nextDueOn).toBe('2026-07-25');
  });

  it('has overdue, due-today and upcoming items', () => {
    const sources = records.filter((r) =>
      ['vaccination', 'medication', 'careRoutine', 'reminder'].includes(r.type),
    );
    const now = TODAY.getTime();
    const due = dueOccurrences(
      sources,
      { from: new Date(now - 40 * 86_400_000), to: new Date(now + 20 * 86_400_000) },
      'UTC',
    );
    expect(due.some((o) => new Date(o.occurrenceAt).getTime() < now)).toBe(true);
    expect(due.some((o) => new Date(o.occurrenceAt).getTime() > now)).toBe(true);
  });
});
