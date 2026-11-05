import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(dir, p), 'utf8');
const records = JSON.parse(read('records.schema.json'));
const openapi = parse(read('openapi.yaml'));
const con2 = JSON.parse(read('samples/CON-petcare-002.samples.json'));
const con1 = JSON.parse(read('samples/CON-petcare-001.samples.json'));

function makeAjv() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(records);
  return ajv;
}

describe('CON-petcare-002 samples (I-09)', () => {
  const ajv = makeAjv();
  const validate = ajv.compile({ $ref: `${records.$id}#/$defs/Record` });
  it('has valid and invalid groups', () => {
    expect(Array.isArray(con2.valid)).toBe(true);
    expect(Array.isArray(con2.invalid)).toBe(true);
  });
  for (const [i, s] of (con2.valid ?? []).entries()) {
    it(`valid sample ${i} is accepted`, () => {
      expect(validate(s.record ?? s), JSON.stringify(validate.errors)).toBe(true);
    });
  }
  for (const [i, s] of (con2.invalid ?? []).entries()) {
    it(`invalid sample ${i} is rejected`, () => {
      expect(validate(s.record ?? s)).toBe(false);
    });
  }
});

describe('CON-petcare-001 samples', () => {
  const ajv = makeAjv();
  ajv.addSchema({
    $id: 'https://petcare.pprasai.io/contracts/openapi-components',
    components: openapi.components,
  });
  for (const [name, samples] of Object.entries(con1) as [string, unknown[]][]) {
    it(`${name} exists in components and all samples validate`, () => {
      expect(openapi.components.schemas[name]).toBeDefined();
      const v = ajv.compile({
        $ref: `https://petcare.pprasai.io/contracts/openapi-components#/components/schemas/${name}`,
      });
      for (const sample of samples) expect(v(sample), JSON.stringify(v.errors)).toBe(true);
    });
  }
});
