import { describe, expect, it } from 'vitest';
import { entities } from '@petcare/domain';
import type { ZodObject } from 'zod';
import {
  canonicalJson,
  columnsOf,
  recordTables,
  sameStoredValue,
  typesWithPetId,
} from '../src/repositories/sync-registry';

// Adding a record type touches the domain registry, a table and this registry. These checks
// fail if the three disagree.
describe('sync registry matches the domain registry', () => {
  it('has a table for every record type and nothing else', () => {
    expect(Object.keys(recordTables).sort()).toEqual(entities.map((e) => e.type).sort());
  });

  for (const entity of entities) {
    it(`${entity.type}: data keys and table columns are the same set`, () => {
      const keys = Object.keys((entity.schema as ZodObject).shape).sort();
      expect(Object.keys(columnsOf(entity.type).data).sort()).toEqual(keys);
    });

    it(`${entity.type}: every reference field is a data key`, () => {
      const keys = Object.keys((entity.schema as ZodObject).shape);
      for (const field of [...Object.keys(entity.refs), ...entity.fileRefs]) {
        expect(keys).toContain(field);
      }
    });
  }

  it('cascades a pet delete to every type with a petId column', () => {
    const expected = entities
      .filter((e) => e.type !== 'pet' && 'petId' in (e.schema as ZodObject).shape)
      .map((e) => e.type)
      .sort();
    expect([...typesWithPetId].sort()).toEqual(expected);
  });
});

function columnNamed(type: 'measurement' | 'medication', name: string) {
  const found = columnsOf(type).data[name];
  if (!found) throw new Error(`${type}.${name} is not a column`);
  return found;
}
const measuredAtColumn = () => columnNamed('measurement', 'measuredAt');
const scheduleColumn = () => columnNamed('medication', 'schedule');

describe('value comparison', () => {
  const column = measuredAtColumn();
  const json = scheduleColumn();

  it('treats the same instant written two ways as equal', () => {
    expect(
      sameStoredValue(column, new Date('2026-06-01T09:00:00Z'), '2026-06-01T09:00:00.000Z'),
    ).toBe(true);
    expect(sameStoredValue(column, new Date('2026-06-01T09:00:00Z'), '2026-06-01T09:00:01Z')).toBe(
      false,
    );
  });

  it('ignores object key order in JSON values', () => {
    expect(sameStoredValue(json, { b: 1, a: { d: 2, c: 3 } }, { a: { c: 3, d: 2 }, b: 1 })).toBe(
      true,
    );
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });

  it('null and absent are different from a value', () => {
    expect(sameStoredValue(column, null, '2026-06-01T09:00:00Z')).toBe(false);
    expect(sameStoredValue(column, null, null)).toBe(true);
  });
});
