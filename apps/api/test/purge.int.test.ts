import { describe, expect, it } from 'vitest';
import { pngOfSize } from './support/multipart';
import { mutation, pull, pushOne } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// AS 4.8 / SPEC 5.6: the nightly purge. Old history and tombstones go, live records stay
// reachable by a full re-pull, and only unreferenced files older than 24 h are removed.
const world = useSyncWorld();
const png = pngOfSize();

describe('purge job', () => {
  it('removes old history, sent notifications and unreferenced files, and keeps the rest', async () => {
    const { owner } = world.people();
    const { householdId } = await world.household();
    const upload = async (name: string) =>
      (await owner.client.upload({ householdId }, { name, type: 'image/png', bytes: png })).json()
        .id as string;
    const keptFile = await upload('kept.png');
    const orphanFile = await upload('orphan.png');
    const freshOrphan = await upload('fresh.png');

    const pet = mutation(householdId, 'pet', 'create', { name: 'Momo', species: 'dog' });
    await pushOne(owner.client, pet);
    const vaccination = mutation(householdId, 'vaccination', 'create', {
      petId: pet.id,
      vaccineName: 'Rabies',
      givenOn: '2025-01-15',
      nextDueOn: '2030-01-15',
      certificateFileId: keptFile,
    });
    await pushOne(owner.client, vaccination);
    const doomed = mutation(householdId, 'measurement', 'create', {
      petId: pet.id,
      kind: 'weight',
      value: 5,
      measuredAt: '2025-01-01T00:00:00Z',
    });
    await pushOne(owner.client, doomed);
    await pushOne(
      owner.client,
      mutation(householdId, 'measurement', 'delete', {}, { id: doomed.id, baseVersion: 1 }),
    );

    // Age everything by 100 days, except one file that is only an hour old.
    await world.query("UPDATE change_log SET at = now() - interval '100 days'");
    await world.query("UPDATE measurements SET deleted_at = now() - interval '100 days'");
    await world.query("UPDATE file_objects SET created_at = now() - interval '2 days'");
    await world.query(
      "UPDATE file_objects SET created_at = now() - interval '1 hour' WHERE id = $1",
      [freshOrphan],
    );
    // One sent notification 40 days ago, one 1 day ago.
    const copied = await world.query<{ n: string }>(
      `INSERT INTO scheduled_notifications
         (id, household_id, user_id, source_type, source_id, occurrence_at, fire_at, title, body, sent_at)
       SELECT gen_random_uuid(), household_id, user_id, source_type, source_id,
              occurrence_at + interval '400 days', fire_at, title, body, now() - interval '40 days'
         FROM scheduled_notifications LIMIT 1 RETURNING 1 AS n`,
    );
    expect(copied).toHaveLength(1);
    await world.query(
      `INSERT INTO scheduled_notifications
         (id, household_id, user_id, source_type, source_id, occurrence_at, fire_at, title, body, sent_at)
       SELECT gen_random_uuid(), household_id, user_id, source_type, source_id,
              occurrence_at + interval '401 days', fire_at, title, body, now() - interval '1 day'
         FROM scheduled_notifications LIMIT 1`,
    );

    const result = await world.api().app.notifications.purge();
    expect(result).toMatchObject({ tombstones: 1, notifications: 1 });
    expect(result.files).toBeGreaterThanOrEqual(1);

    const count = async (query: string, params: unknown[] = []) =>
      Number((await world.query<{ n: string }>(query, params))[0]?.n);
    expect(
      await count("SELECT count(*) AS n FROM change_log WHERE at < now() - interval '90 days'"),
    ).toBe(0);
    expect(await count('SELECT count(*) AS n FROM measurements')).toBe(0);
    expect(
      await count(
        "SELECT count(*) AS n FROM scheduled_notifications WHERE sent_at < now() - interval '30 days'",
      ),
    ).toBe(0);
    expect(
      await count('SELECT count(*) AS n FROM scheduled_notifications WHERE sent_at IS NOT NULL'),
    ).toBe(1);

    // Files: the referenced one and the fresh orphan stay; the old orphan is gone, blob too.
    expect((await owner.client.get(`/api/files/${keptFile}`)).statusCode).toBe(200);
    expect((await owner.client.get(`/api/files/${freshOrphan}`)).statusCode).toBe(200);
    expect((await owner.client.get(`/api/files/${orphanFile}`)).statusCode).toBe(404);
    expect(await count('SELECT count(*) AS n FROM file_objects WHERE id = $1', [orphanFile])).toBe(
      0,
    );

    // A full re-pull still returns every live record of the household.
    const { body } = await pull(owner.client, undefined, 1000);
    const ids = (body.changes as { id: string; deletedAt: string | null }[])
      .filter((c) => c.deletedAt === null)
      .map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([pet.id, vaccination.id]));
    expect(ids).not.toContain(doomed.id);
  });
});
