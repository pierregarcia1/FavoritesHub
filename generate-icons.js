// Generates icon16.png, icon48.png, icon128.png for the browser extension.
// No extra packages needed — uses only Node's built-in zlib module.
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 (required by PNG spec) ──────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return c ^ -1;
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(4 + 4 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  tb.copy(out, 4);
  data.copy(out, 8);
  out.writeInt32BE(crc32(Buffer.concat([tb, data])), 8 + data.length);
  return out;
}

// ── Check whether a pixel is inside a rounded rectangle ───────
function inRoundedRect(x, y, size, cr) {
  const hw = size / 2;
  const ax = Math.abs(x - hw + 0.5);
  const ay = Math.abs(y - hw + 0.5);
  if (ax > hw || ay > hw) return false;
  const inner = hw - cr;
  if (ax <= inner || ay <= inner) return true;
  return Math.hypot(ax - inner, ay - inner) <= cr;
}

// ── Heart equation: ≤ 0 means inside the heart ────────────────
function inHeart(x, y, cx, cy, scale) {
  const nx = (x - cx) / scale;
  const ny = (y - cy) / scale;
  return Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * Math.pow(ny, 3) <= 0;
}

// ── Build one PNG buffer ───────────────────────────────────────
function makePNG(size) {
  const cr    = size * 0.22;          // corner radius
  const hcx   = size * 0.5;           // heart center X
  const hcy   = size * 0.52;          // heart center Y (slightly lower)
  const hscale = size * 0.38;         // heart size

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // PNG filter byte (None)
    for (let x = 0; x < size; x++) {
      if (!inRoundedRect(x, y, size, cr)) {
        row.push(0, 0, 0, 0);         // transparent corner
      } else if (inHeart(x, y, hcx, hcy, hscale)) {
        row.push(255, 255, 255, 255); // white heart
      } else {
        // Purple → pink gradient background
        const t  = x / size;
        const r  = Math.round(99  + t * (244 - 99));
        const g  = Math.round(102 + t * (114 - 102));
        const b  = Math.round(241 + t * (182 - 241));
        row.push(r, g, b, 255);
      }
    }
    rows.push(Buffer.from(row));
  }

  const raw  = Buffer.concat(rows);
  const idat = zlib.deflateSync(raw);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // RGBA
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Write the three sizes ─────────────────────────────────────
const outDir = path.join(__dirname, 'extension', 'icons');
[16, 48, 128].forEach(size => {
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, makePNG(size));
  console.log(`✓  icon${size}.png`);
});
console.log('\nDone! Icons saved to extension/icons/');
