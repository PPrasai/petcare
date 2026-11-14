import { describe, expect, it } from 'vitest';
import { DEMO_SEED, resolveDemoRecords } from '../src/demo-seed';
import { dueOccurrences } from '../src/due';
import { entities, getEntity } from '../src/registry';

const TODAY = new Date('2026-06-10T12:00:00Z');
const records = resolveDemoRecords(TODAY);

describe('demo seed', () => {
  // careLog and mealPreset join the seed in slice P7 (SPEC-002), when the UI first writes them.
  it('has at least two records of every type', () => {
    for (const entity of entities.filter((e) => !['careLog', 'mealPreset'].includes(e.type))) {
      expect(
        records.filter((r) => r.type === entity.type).length,
        entity.type,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('has one yearly reminder and one for just the demo user (P6)', () => {
    const reminders = records.filter((r) => r.type === 'reminder');
    expect(reminders.some((r) => (r.data.schedule as { kind: string }).kind === 'yearly')).toBe(
      true,
    );
    expect(reminders.filter((r) => r.data.audienceUserId === DEMO_SEED.user.id)).toHaveLength(1);
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

  it('has four pets and one photo: a small JPEG on one of them', () => {
    const pets = records.filter((r) => r.type === 'pet');
    expect(pets).toHaveLength(4);
    const withPhoto = pets.filter((p) => typeof p.data.photoFileId === 'string');
    expect(withPhoto).toHaveLength(1);
    const file = DEMO_SEED.files.find((f) => f.id === withPhoto[0]?.data.photoFileId);
    expect(file?.mimeType).toBe('image/jpeg');
    const bytes = Buffer.from(file?.base64 ?? '', 'base64');
    expect(bytes.length).toBeLessThanOrEqual(30 * 1024);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });
});
