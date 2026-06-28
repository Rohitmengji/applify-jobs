// Generates the extension icons (solid indigo rounded tile with a white "1").
// Pure Node (zlib only) PNG encoder — no image deps. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
const SIZES = [16, 32, 48, 128];

// Brand palette
const BG = [79, 70, 229, 255]; // indigo-600
const FG = [255, 255, 255, 255]; // white glyph

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Draw a rounded tile with a centered vertical bar (a minimalist "1"/cursor mark).
function render(size) {
  const px = (x, y) => {
    const r = size * 0.18; // corner radius
    // rounded-rect mask
    const inCorner = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 > r ** 2;
    if (x < r && y < r && inCorner(r, r)) return null;
    if (x > size - r && y < r && inCorner(size - r, r)) return null;
    if (x < r && y > size - r && inCorner(r, size - r)) return null;
    if (x > size - r && y > size - r && inCorner(size - r, size - r)) return null;
    // glyph: vertical bar centered
    const barW = Math.max(2, Math.round(size * 0.12));
    const barX0 = (size - barW) / 2;
    const padY = size * 0.26;
    if (x >= barX0 && x < barX0 + barW && y >= padY && y <= size - padY) return FG;
    return BG;
  };

  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = px(x + 0.5, y + 0.5);
      if (c) {
        raw[o++] = c[0];
        raw[o++] = c[1];
        raw[o++] = c[2];
        raw[o++] = c[3];
      } else {
        raw[o++] = 0;
        raw[o++] = 0;
        raw[o++] = 0;
        raw[o++] = 0; // transparent
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(OUT, `${size}.png`), render(size));
  console.log(`wrote public/icon/${size}.png`);
}
