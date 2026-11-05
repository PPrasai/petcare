// Verifies the copied contract files are byte-identical to the frozen versions (SPEC 6).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const expected = {
  'packages/contracts/openapi.yaml':
    'a021a9cee8253744629f1959fd3c50f2843c4361a696d7da80b0cc42d2e6f4ad',
  'packages/contracts/redocly.yaml':
    'b91ca1ba8a2e95bf92bdc7b307911f234474c27d3a18f9e028365eb3486f2a25',
  'packages/contracts/samples/CON-petcare-001.samples.json':
    '5c2c945764184997d801bb47ce39d7727fa13f1a769060b5d5516d9700e75681',
  'packages/contracts/records.schema.json':
    'e237cfad244b50e0650754cedcbf6a6ae744a2916af30685847c1e60700eaa5e',
  'packages/contracts/schema.sql':
    '31e95fe01218db72f41d619b1e4855a8eb85ec261c0a7a8dc6581eb11b007b04',
  'packages/contracts/samples/CON-petcare-002.samples.json':
    '3a17c50d2ca7e5b2ad3308d644e1838611ddb00d844a1d5ce2ebda18b649b303',
};

let bad = 0;
for (const [file, hash] of Object.entries(expected)) {
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== hash) {
    console.error(`HASH MISMATCH ${file}\n  expected ${hash}\n  actual   ${actual}`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`contract hashes ok (${Object.keys(expected).length} files)`);
