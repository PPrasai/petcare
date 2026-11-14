import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// CON-petcare-003 I-20: the v2 migration only adds.
const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');
const file = readdirSync(dir).find((f) => /^0002_.*\.sql$/.test(f));

describe('the v2 migration is expand-only (I-20)', () => {
  const sql = file ? readFileSync(join(dir, file), 'utf8') : '';
  it('exists', () => expect(file).toBeDefined());
  it('has no DROP, ALTER ... TYPE, SET NOT NULL, UPDATE or DELETE', () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN[^;]*\bTYPE\b/i);
    expect(sql).not.toMatch(/SET\s+NOT\s+NULL/i);
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE|INSERT)\b/im);
  });
  it('adds the two reminder columns as nullable, with no default', () => {
    expect(sql).toMatch(/ALTER TABLE "reminders" ADD COLUMN "category" text;/);
    expect(sql).toMatch(/ALTER TABLE "reminders" ADD COLUMN "audience_user_id" text;/);
  });
});
