import { describe, expect, it } from 'vitest';
import { localSnapshot, serverSnapshot } from './support/compare';
import { useSystemWorld } from './support/harness';

// QA-05 / I-02..I-04: two clients, same household, both offline, conflicting edits.
const world = useSystemWorld();

const schedule = { tz: 'UTC', kind: 'daily', startOn: '2026-01-01' };
const OCCURRENCE = '2026-06-01T09:00:00Z';

describe('two offline clients converge without silently losing a value', () => {
  it('handles overlapping and disjoint field edits, update-after-delete, and double doses', async () => {
    const a = await world.newDevice('alice');
    const b = await world.newDevice('bob');
    const householdId = await world.shareHousehold(a, [b]);

    // Shared starting point, synced to both.
    const pet = await a.store.create('pet', householdId, {
      name: 'Momo',
      species: 'dog',
      breed: 'Terrier',
    });
    const contact = await a.store.create('contact', householdId, { name: 'Dr. Vet', role: 'vet' });
    const medication = await a.store.create('medication', householdId, {
      petId: pet.id,
      name: 'Pill',
      schedule,
    });
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.db.records('pet').get(pet.id)).toMatchObject({ version: 1 });

    // Both go offline and edit.
    a.remote.offline = true;
    b.remote.offline = true;
    await a.store.update('pet', pet.id, { name: 'Momo (Alice)', breed: 'Alice breed' });
    await b.store.update('pet', pet.id, { name: 'Momo (Bob)', diet: 'Bob diet' });
    await a.store.remove('contact', contact.id);
    await b.store.update('contact', contact.id, { note: 'open late' });
    const dose = (who: string) => ({
      medicationId: medication.id,
      petId: pet.id,
      occurrenceAt: OCCURRENCE,
      givenAt: OCCURRENCE,
      skipped: false,
      note: who,
    });
    await a.store.create('medicationDose', householdId, dose('alice'));
    await b.store.create('medicationDose', householdId, dose('bob'));
    expect(await a.engine.sync().then((s) => s.online)).toBe(false);
    expect(a.engine.getStatus().pendingCount).toBe(3);

    // Alice reaches the server first, then Bob; then everyone catches up.
    a.remote.offline = false;
    b.remote.offline = false;
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();

    const server = await serverSnapshot(a);
    expect(await localSnapshot(a)).toEqual(server);
    expect(await localSnapshot(b)).toEqual(server);
    expect(await a.db.outbox.count()).toBe(0);
    expect(await b.db.outbox.count()).toBe(0);

    // Disjoint fields both survive; the overlapping one keeps the later writer (Bob).
    const merged = server.find((r) => r.id === pet.id);
    expect(merged?.data).toMatchObject({
      name: 'Momo (Bob)',
      breed: 'Alice breed',
      diet: 'Bob diet',
    });

    // I-03: the replaced value is in conflicts, and only for the overlapping field.
    const conflicts = await world.query<{
      field: string | null;
      replaced_value: unknown;
      kept_value: unknown;
      reason: string;
      record_id: string;
    }>(
      'SELECT field, replaced_value, kept_value, reason, record_id FROM conflicts WHERE household_id = $1',
      [householdId],
    );
    const forPet = conflicts.filter((c) => c.record_id === pet.id);
    expect(forPet).toHaveLength(1);
    expect(forPet[0]).toMatchObject({
      field: 'name',
      replaced_value: 'Momo (Alice)',
      kept_value: 'Momo (Bob)',
      reason: 'concurrentFieldEdit',
    });

    // The update that arrived after the delete is kept as a conflict, and the record is deleted.
    const forContact = conflicts.filter((c) => c.record_id === contact.id);
    expect(forContact).toHaveLength(1);
    expect(forContact[0]).toMatchObject({ field: null, reason: 'updateAfterDelete' });
    expect(server.find((r) => r.id === contact.id)?.deletedAt).not.toBeNull();
    expect(await b.db.records('contact').get(contact.id)).toMatchObject({ _pending: false });
    expect(conflicts).toHaveLength(2);

    // I-04: both doses for the same occurrence are kept.
    const doses = server.filter((r) => r.type === 'medicationDose' && r.deletedAt === null);
    expect(doses).toHaveLength(2);
    expect(new Set(doses.map((d) => d.data.note))).toEqual(new Set(['alice', 'bob']));

    // Bob also sees the conflicts locally (for the Sync activity screen).
    expect((await b.db.conflicts.toArray()).length).toBeGreaterThanOrEqual(2);
  });

  it('a pet created and deleted offline never reaches the server', async () => {
    const a = await world.newDevice('carol');
    const householdId = (await a.session.request('GET', '/api/me')).json().households[0]
      .id as string;
    a.remote.offline = true;
    const pet = await a.store.create('pet', householdId, { name: 'Ghost', species: 'cat' });
    await a.store.update('pet', pet.id, { name: 'Ghost II' });
    await a.store.remove('pet', pet.id);
    expect(await a.db.outbox.count()).toBe(0);
    expect(await a.db.records('pet').count()).toBe(0);
    a.remote.offline = false;
    await a.engine.sync();
    expect(a.remote.pushes).toHaveLength(0);
    const rows = await world.query('SELECT 1 FROM pets WHERE id = $1', [pet.id]);
    expect(rows).toHaveLength(0);
  });

  it('a device that lost membership drops that household and its records on the next pull', async () => {
    const a = await world.newDevice('dana');
    const b = await world.newDevice('eli');
    const householdId = await world.shareHousehold(a, [b]);
    await a.store.create('pet', householdId, { name: 'Shared', species: 'dog' });
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.db.records('pet').count()).toBe(1);

    await world.query('DELETE FROM memberships WHERE household_id = $1 AND user_id = $2', [
      householdId,
      b.userId,
    ]);
    // Membership is cached for a short while; a fresh sign-in is the realistic trigger.
    await b.engine.sync();
    await b.engine.sync();
    expect(await b.db.records('pet').count()).toBe(0);
  });
});
