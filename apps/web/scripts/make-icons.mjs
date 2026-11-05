// Generates the app icons (a paw on a teal square) as PNG files. Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [13, 124, 118];
const FG = [255, 255, 255];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// Circles of the paw in a 100x100 box: [cx, cy, r]
const paw = [
  [50, 66, 17],
  [26, 46, 8.5],
  [41, 30, 9],
  [59, 30, 9],
  [74, 46, 8.5],
];

function render(size, scale) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      // Map pixel to the 100-unit box, shrunk by `scale` around the centre.
      const u = (((x + 0.5) / size - 0.5) / scale) * 100 + 50;
      const v = (((y + 0.5) / size - 0.5) / scale) * 100 + 50;
      const inside = paw.some(([cx, cy, r]) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r);
      const [r, g, b] = inside ? FG : BG;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', render(192, 0.8));
writeFileSync('public/icon-512.png', render(512, 0.8));
// Maskable icons keep the artwork inside the central 80% safe zone.
writeFileSync('public/icon-maskable-512.png', render(512, 0.6));
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#0d7c76"/><g fill="#fff"><circle cx="50" cy="66" r="17"/><circle cx="26" cy="46" r="8.5"/><circle cx="41" cy="30" r="9"/><circle cx="59" cy="30" r="9"/><circle cx="74" cy="46" r="8.5"/></g></svg>\n`,
);
