import { describe, expect, it } from 'vitest';
import type { RecordType } from '@petcare/domain';
import { validData } from './support/record-fixtures';
import { mutation, pushOne } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// Editing an existing record from the app: the client sends an update that carries only the
// changed fields, and `null` for a field the form emptied. Every type with an edit form is covered.
const world = useSyncWorld();

/** Per type: an optional field to give the record first, a changed field, and the field to clear. */
const CASES: {
  type: RecordType;
  extra: Record<string, unknown>;
  change: Record<string, unknown>;
  clear: string;
}[] = [
  {
    type: 'vaccination',
    extra: { batchNumber: 'B-1' },
    change: { vaccineName: 'Rabies booster' },
    clear: 'batchNumber',
  },
  {
    type: 'medication',
    extra: { dose: 5, doseUnit: 'mg' },
    change: { name: 'Pill 2' },
    clear: 'doseUnit',
  },
  {
    type: 'vetVisit',
    extra: { diagnosis: 'ear' },
    change: { reason: 'recheck' },
    clear: 'diagnosis',
  },
  { type: 'measurement', extra: { note: 'after lunch' }, change: { value: 6.1 }, clear: 'note' },
  {
    type: 'symptomEntry',
    extra: { severity: 'mild' },
    change: { description: 'limping less' },
    clear: 'severity',
  },
  { type: 'condition', extra: { note: 'mild' }, change: { name: 'Beef' }, clear: 'note' },
  { type: 'expense', extra: { note: 'receipt' }, change: { amountMinor: 5200 }, clear: 'note' },
  { type: 'contact', extra: { phone: '555-0101' }, change: { name: 'Dr. Lee' }, clear: 'phone' },
  { type: 'document', extra: {}, change: { title: 'Renamed', category: 'labResult' }, clear: '' },
];

describe('editing records through sync', () => {
  for (const c of CASES) {
    it(`${c.type}: a changed value and a cleared field are applied and read back`, async () => {
      const { householdId, refs } = await world.household();
      const owner = world.people().owner.client;
      const created = await pushOne(
        owner,
        mutation(householdId, c.type, 'create', { ...validData(c.type, refs), ...c.extra }),
      );
      expect(created.status).toBe('applied');
      const id = created.record?.id ?? '';
      // The app sends null where the schema allows it and an empty string for a note.
      const cleared = c.clear === 'note' ? '' : null;
      const fields = { ...c.change, ...(c.clear ? { [c.clear]: cleared } : {}) };
      const edited = await pushOne(
        owner,
        mutation(householdId, c.type, 'update', fields, { id, baseVersion: 1 }),
      );
      expect(edited.status).toBe('applied');
      expect(edited.record?.version).toBe(2);
      expect(edited.record?.data).toMatchObject(c.change);
      if (c.clear) expect(edited.record?.data[c.clear] ?? cleared).toBe(cleared);
    });

    it(`${c.type}: a caretaker may edit a record someone else made, a viewer may not`, async () => {
      const { householdId, refs } = await world.household();
      const { owner, caretaker, viewer } = world.people();
      const created = await pushOne(
        owner.client,
        mutation(householdId, c.type, 'create', validData(c.type, refs)),
      );
      const id = created.record?.id ?? '';
      const byCaretaker = await pushOne(
        caretaker.client,
        mutation(householdId, c.type, 'update', c.change, { id, baseVersion: 1 }),
      );
      expect(byCaretaker.status).toBe('applied');
      const byViewer = await pushOne(
        viewer.client,
        mutation(householdId, c.type, 'update', c.change, { id, baseVersion: 2 }),
      );
      expect(byViewer.status).toBe('rejected');
      expect(byViewer.error?.code).toBe('forbidden');
    });
  }

  it('an offline edit made on an older version merges field by field with a later edit', async () => {
    const { householdId, refs } = await world.household();
    const { owner, caretaker } = world.people();
    const created = await pushOne(
      owner.client,
      mutation(householdId, 'contact', 'create', validData('contact', refs)),
    );
    const id = created.record?.id ?? '';
    // Both edit version 1 while offline; different fields, so both survive.
    await pushOne(
      owner.client,
      mutation(householdId, 'contact', 'update', { phone: '555-0101' }, { id, baseVersion: 1 }),
    );
    const late = await pushOne(
      caretaker.client,
      mutation(
        householdId,
        'contact',
        'update',
        { email: 'vet@example.com' },
        { id, baseVersion: 1 },
      ),
    );
    expect(late.status).toBe('applied');
    expect(late.record?.data).toMatchObject({ phone: '555-0101', email: 'vet@example.com' });
  });
});
