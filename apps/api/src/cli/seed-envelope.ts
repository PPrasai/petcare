import pg from 'pg';

/** The prototype envelope (SPEC QA-01): 1,000 users and 20,000 records in each of 10 households. */
export interface EnvelopeOptions {
  users: number;
  households: number;
  recordsPerHousehold: number;
}
export const ENVELOPE: EnvelopeOptions = {
  users: 1000,
  households: 10,
  recordsPerHousehold: 20000,
};

const PETS_PER_HOUSEHOLD = 20;
const VACCINATIONS_PER_HOUSEHOLD = 2000;

export interface SeededEnvelope {
  householdIds: string[];
  userIds: string[];
}

const userId = (n: number) => `envelope-user-${String(n).padStart(4, '0')}`;

/**
 * Fills an empty, migrated database with the envelope: pets, measurements and vaccinations (the
 * bulk of real data) in each household, one change-log row per record, and the users spread
 * evenly across the households (the first of each household is the owner). The data is created
 * with set-based SQL, so the full envelope takes seconds, not minutes.
 */
export async function seedEnvelope(
  databaseUrl: string,
  options: EnvelopeOptions = ENVELOPE,
): Promise<SeededEnvelope> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: string }>('SELECT count(*) AS n FROM households');
    if (Number(rows[0]?.n) > 0) {
      throw new Error('seed-envelope needs an empty database (households already exist)');
    }
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO "user" (id, name, email)
       SELECT 'envelope-user-' || lpad(n::text, 4, '0'), 'Envelope user ' || n,
              'envelope-' || n || '@example.test'
         FROM generate_series(1, $1::int) AS n`,
      [options.users],
    );

    const perHousehold = Math.floor(options.users / options.households);
    const measurements =
      options.recordsPerHousehold - PETS_PER_HOUSEHOLD - VACCINATIONS_PER_HOUSEHOLD;
    const householdIds: string[] = [];
    for (let h = 0; h < options.households; h++) {
      const first = h * perHousehold + 1;
      const owner = userId(first);
      const {
        rows: [created],
      } = await client.query<{ id: string }>(
        `INSERT INTO households (id, name, created_by)
         VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
        [`Envelope household ${h + 1}`, owner],
      );
      const id = created?.id ?? '';
      householdIds.push(id);
      await client.query(
        `INSERT INTO memberships (household_id, user_id, role)
         SELECT $1, 'envelope-user-' || lpad(n::text, 4, '0'),
                CASE WHEN n = $2 THEN 'owner' ELSE 'caretaker' END
           FROM generate_series($2::int, $2::int + $3::int - 1) AS n`,
        [id, first, perHousehold],
      );
      await seedRecords(client, id, owner, measurements);
    }
    await client.query('COMMIT');
    await client.query('ANALYZE');
    return {
      householdIds,
      userIds: Array.from({ length: options.users }, (_, n) => userId(n + 1)),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function seedRecords(
  client: pg.Client,
  householdId: string,
  owner: string,
  measurements: number,
): Promise<void> {
  await client.query(
    `CREATE TEMP TABLE seeded_pets AS
     SELECT gen_random_uuid() AS id, n FROM generate_series(1, $1::int) AS n`,
    [PETS_PER_HOUSEHOLD],
  );
  const common = `1, now(), $2, now(), $2`;
  await client.query(
    `INSERT INTO pets (id, household_id, version, created_at, created_by, updated_at, updated_by,
                       name, species)
     SELECT id, $1, ${common}, 'Pet ' || n, CASE WHEN n % 2 = 0 THEN 'cat' ELSE 'dog' END
       FROM seeded_pets`,
    [householdId, owner],
  );
  await client.query(
    `CREATE TEMP TABLE seeded_records AS
     SELECT gen_random_uuid() AS id, n, 'measurement' AS type
       FROM generate_series(1, $1::int) AS n
     UNION ALL
     SELECT gen_random_uuid(), n, 'vaccination' FROM generate_series(1, $2::int) AS n`,
    [measurements, VACCINATIONS_PER_HOUSEHOLD],
  );
  const petOf = `(SELECT id FROM seeded_pets WHERE seeded_pets.n = 1 + (r.n % ${PETS_PER_HOUSEHOLD}))`;
  await client.query(
    `INSERT INTO measurements (id, household_id, version, created_at, created_by, updated_at,
                               updated_by, pet_id, kind, value, measured_at)
     SELECT r.id, $1, ${common}, ${petOf}, 'weight', 5 + (r.n % 200) / 10.0,
            now() - (r.n || ' hours')::interval
       FROM seeded_records r WHERE r.type = 'measurement'`,
    [householdId, owner],
  );
  await client.query(
    `INSERT INTO vaccinations (id, household_id, version, created_at, created_by, updated_at,
                               updated_by, pet_id, vaccine_name, given_on)
     SELECT r.id, $1, ${common}, ${petOf}, 'Vaccine ' || (r.n % 12),
            (current_date - (r.n % 700))
       FROM seeded_records r WHERE r.type = 'vaccination'`,
    [householdId, owner],
  );
  await client.query(
    `INSERT INTO change_log (household_id, record_type, record_id, version, op, changed_fields, actor)
     SELECT $1::uuid, 'pet', id, 1, 'create', ARRAY['name','species'], $2 FROM seeded_pets
     UNION ALL
     SELECT $1::uuid, type, id, 1, 'create', ARRAY['petId'], $2 FROM seeded_records`,
    [householdId, owner],
  );
  await client.query('DROP TABLE seeded_pets, seeded_records');
}
