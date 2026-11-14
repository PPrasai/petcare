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
    '2aea535dff90636f97111668acac73f5e8d933b5667bd9844194051a632a351c',
  'packages/contracts/schema.sql':
    '270af748dc3a60bda1784ea36ffe7f4890efda45b7739ee79a0899cefae609f5',
  'packages/contracts/samples/CON-petcare-002.samples.json':
    '8d1def51425110fa62de86b5b92f700f3d3cbe029bfd4817406f573f8e1a7d98',
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
