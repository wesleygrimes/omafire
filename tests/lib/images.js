// Image helpers for tests: a tiny PNG encoder (zlib from node) and raw RGBA
// decoding through ImageMagick, which the target system ships.
"use strict";
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(ROOT, "tests", "out");

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePNG(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writePNG(file, rgba, width, height) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(rgba, width, height));
  return file;
}

// Any image ImageMagick reads -> { width, height, data: Uint8ClampedArray RGBA }.
function readRGBA(file) {
  const dims = execFileSync("magick", ["identify", "-format", "%w %h", file + "[0]"]).toString().trim().split(" ").map(Number);
  const buf = execFileSync("magick", [file + "[0]", "-depth", "8", "rgba:-"], { maxBuffer: 64 << 20 });
  return { width: dims[0], height: dims[1], data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length) };
}

function backgroundRGBA() {
  return readRGBA(path.join(ROOT, "assets", "campsite-approved.webp"));
}

// Mean absolute channel difference and the share of pixels whose max channel
// difference is within `tol`, optionally only where mask(x, y) is true.
function compare(a, b, width, height, tol = 8, mask = null) {
  let sum = 0, n = 0, within = 0, maxd = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (mask && !mask(x, y)) continue;
    const i = (y * width + x) * 4;
    const d0 = Math.abs(a[i] - b[i]), d1 = Math.abs(a[i + 1] - b[i + 1]), d2 = Math.abs(a[i + 2] - b[i + 2]);
    sum += d0 + d1 + d2;
    const m = Math.max(d0, d1, d2);
    if (m > maxd) maxd = m;
    if (m <= tol) within++;
    n++;
  }
  return { meanAbs: sum / (n * 3), withinTol: within / n, maxDiff: maxd, pixels: n };
}

module.exports = { ROOT, OUT, encodePNG, writePNG, readRGBA, backgroundRGBA, compare };
