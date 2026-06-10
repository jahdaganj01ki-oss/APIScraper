// Generates media/icon.png (128x128) without external deps.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIZE = 128;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Pixel art: dark background, teal "node-graph" mark.
function pixel(x, y) {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const bg = [13, 17, 23, 255];
  const teal = [34, 211, 188, 255];
  const blue = [56, 139, 253, 255];

  // three nodes connected: center, top, bottom-right
  const nodes = [
    [cx, cy, blue],
    [cx, cy - 34, teal],
    [cx + 32, cy + 30, teal]
  ];
  for (const [nx, ny, color] of nodes) {
    const d = Math.hypot(x - nx, y - ny);
    if (d < 13) {
      return color;
    }
  }
  // edges
  const onLine = (ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    return Math.hypot(x - px, y - py) < 3.5;
  };
  if (onLine(cx, cy, cx, cy - 34) || onLine(cx, cy, cx + 32, cy + 30)) {
    return [88, 166, 255, 255];
  }
  return bg;
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0; // filter type
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y);
    raw[o++] = r;
    raw[o++] = g;
    raw[o++] = b;
    raw[o++] = a;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0))
]);

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, "..", "media");
mkdirSync(mediaDir, { recursive: true });
writeFileSync(join(mediaDir, "icon.png"), png);
console.log("Wrote media/icon.png", png.length, "bytes");
