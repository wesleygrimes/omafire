// fire.js's renderer is tuned for the QML engine (dirty rectangles, hoisted
// arithmetic, per-row flame bounds). This scenario locks the frames including
// the native moonlight animation; the dirty rectangles must cover every pixel
// that differs from the art. Legacy fire pixels are checked against the
// original renderer independently in parity.test.js.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { loadFire } = require("./lib/load-fire");
const { backgroundRGBA } = require("./lib/images");

const Fire = loadFire();
const src = backgroundRGBA();
const bg = Fire.prepareBackground(src.data, src.width, src.height);

const DIGEST = "7c7da9dbc7572cba66be92f480a89003915e154b85c5cc6a3b93e540e931f67d";

function scenario(onFrame) {
  const s = Fire.createState();
  const fb = Fire.createFrame();
  const hash = crypto.createHash("sha256");
  for (let f = 0; f < 900; f++) {
    if (f === 40) Fire.addLog(s);
    if (f === 90) Fire.stoke(s);
    if (f === 150) Fire.pointerDown(s, 40, 170);
    if (f > 150 && f < 200) Fire.pointerMove(s, 40 + (f - 150) * 2.7, 170 + (f - 150) * 0.16);
    if (f === 200) Fire.pointerUp(s, 176, 178);
    if (f === 260) Fire.pointerDown(s, 181, 176);
    if (f === 300) Fire.pointerDown(s, 30, 200);
    if (f > 300 && f < 340) Fire.pointerMove(s, 30 + (f - 300) * 6, 200 - (f - 300) * 4);
    if (f === 340) Fire.pointerUp(s, 300, 40);
    if (f === 400 || f === 401) Fire.addLog(s);
    if (f === 420) for (let k = 0; k < 8; k++) Fire.poke(s);
    // Let it burn down to embers and rest, then rekindle.
    if (f === 600) { s.fuel = 0.05; s.heat = 0.2; }
    if (f === 700) { s.fuel = 0; s.heat = 0.01; }
    if (f === 800) Fire.addLog(s);
    Fire.update(s, f % 11 === 0 ? 0.08 : 1 / 60);
    if (f % 3 === 0) {
      const rects = onFrame ? onFrame.rects : undefined;
      Fire.render(fb, s, f === 500 ? null : bg, rects);
      hash.update(fb);
      if (onFrame) onFrame(fb, s, f);
    }
  }
  return hash.digest("hex");
}

test("renderer output matches the approved moonlight frames", () => {
  const d = scenario();
  console.log(`# render digest ${d}`);
  assert.equal(d, DIGEST);
});

test("roundByte rounds exactly like a Uint8ClampedArray store", () => {
  const u8 = new Uint8ClampedArray(1);
  const f64 = new Float64Array(1), bits = new BigInt64Array(f64.buffer);
  const near = (x, steps) => { f64[0] = x; bits[0] += BigInt(steps); return f64[0]; };
  const values = [0, 255];
  for (let k = 0; k < 255; k++) for (const x of [k + 0.5, k + 0.25, k + 0.75]) for (let d = -3; d <= 3; d++) values.push(near(x, d));
  let seed = 7;
  for (let i = 0; i < 200000; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; values.push(seed / 4294967296 * 255); }
  for (const x of values) {
    if (x < 0 || x > 255) continue;
    u8[0] = x;
    if (Fire.roundByte(x) !== u8[0]) assert.fail(`roundByte(${x}) = ${Fire.roundByte(x)}, store gives ${u8[0]}`);
  }
});

test("dirty rectangles cover every pixel that differs from the art", { skip: typeof Fire.createRects !== "function" && "no rects" }, () => {
  const rects = Fire.createRects();
  let checked = 0, maxRects = 0, area = 0;
  const cb = (fb, s, f) => {
    if (f === 500) return; // no art: the fallback fill
    const covered = new Uint8Array(360 * 240);
    maxRects = Math.max(maxRects, rects.n);
    for (let k = 0; k < rects.n; k++) {
      const x0 = rects.r[k * 4], y0 = rects.r[k * 4 + 1], x1 = rects.r[k * 4 + 2], y1 = rects.r[k * 4 + 3];
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 360 && y1 <= 240 && x1 > x0 && y1 > y0, `rect ${x0},${y0},${x1},${y1} in bounds`);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) covered[y * 360 + x] = 1;
    }
    for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
      const i = (y * 360 + x) * 4;
      if (covered[y * 360 + x]) { area++; continue; }
      if (fb[i] !== bg[i] || fb[i + 1] !== bg[i + 1] || fb[i + 2] !== bg[i + 2])
        assert.fail(`frame ${f}: pixel ${x},${y} changed outside the dirty rectangles`);
    }
    checked++;
  };
  cb.rects = rects;
  scenario(cb);
  console.log(`# ${checked} frames: at most ${maxRects} rects, ${(area / checked / 864).toFixed(1)}% of the frame dirty on average`);
  assert.ok(checked > 250);
});
