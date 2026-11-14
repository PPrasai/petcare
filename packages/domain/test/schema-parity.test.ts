import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { entities, isValidRecord, RECORD_TYPES } from '../src';

// I-10: the domain Zod schemas accept exactly what records.schema.json accepts.
const contracts = join(dirname(fileURLToPath(import.meta.url)), '../../contracts');
const records = JSON.parse(readFileSync(join(contracts, 'records.schema.json'), 'utf8'));
const samples = JSON.parse(
  readFileSync(join(contracts, 'samples/CON-petcare-002.samples.json'), 'utf8'),
);

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(records);
const jsonValid = ajv.compile({ $ref: `${records.$id}#/$defs/Record` });

type Rec = { type: string; data: Record<string, unknown> };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('samples (I-10)', () => {
  for (const [i, record] of (samples.valid as Rec[]).entries()) {
    it(`valid sample ${i} (${record.type}) is accepted by both`, () => {
      expect(jsonValid(record)).toBe(true);
      expect(isValidRecord(record)).toBe(true);
    });
  }
  for (const [i, sample] of (samples.invalid as { why: string; record: Rec }[]).entries()) {
    it(`invalid sample ${i} (${sample.why}) is rejected by both`, () => {
      expect(jsonValid(sample.record)).toBe(false);
      expect(isValidRecord(sample.record)).toBe(false);
    });
  }
});

describe('mutations of every valid sample get the same verdict from both', () => {
  const wrongValues: unknown[] = [null, 12345, -1, '', 'x', true, [], {}, 'not-a-date'];
  for (const record of samples.valid as Rec[]) {
    it(`${record.type}: extra key, missing keys, wrong values`, () => {
      const cases: { label: string; value: Rec }[] = [];
      const extra = clone(record);
      extra.data.unknownField = 1;
      cases.push({ label: 'extra key', value: extra });
      for (const key of Object.keys(record.data)) {
        const missing = clone(record);
        missing.data = Object.fromEntries(Object.entries(missing.data).filter(([k]) => k !== key));
        cases.push({ label: `missing ${key}`, value: missing });
        for (const wrong of wrongValues) {
          const changed = clone(record);
          changed.data[key] = wrong;
          cases.push({ label: `${key} = ${JSON.stringify(wrong)}`, value: changed });
        }
      }
      for (const c of cases) {
        expect(isValidRecord(c.value), `${record.type}: ${c.label}`).toBe(jsonValid(c.value));
      }
    });
  }
});

describe('registry', () => {
  it('defines all 19 record types exactly once', () => {
    expect(entities.map((e) => e.type).sort()).toEqual([...RECORD_TYPES].sort());
  });
  it('marks the five event types append-only and the rest mergeable (CON-002 2.2)', () => {
    const appendOnly = entities
      .filter((e) => e.kind === 'appendOnly')
      .map((e) => e.type)
      .sort();
    expect(appendOnly).toEqual([
      'careCompletion',
      'careLog',
      'medicationDose',
      'reminderCompletion',
      'reminderSnooze',
    ]);
  });
});
