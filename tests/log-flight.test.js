// The flying log stays opaque when the fractional-scale stamp copies the frame.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadFire } = require("./lib/load-fire");
const { backgroundRGBA } = require("./lib/images");

const Fire = loadFire();
const W = Fire.W, H = Fire.H;
const bg = Fire.prepareBackground(backgroundRGBA().data, 720, 480);
const LOG = [[0x21, 0x1a, 0x13], [0x74, 0x47, 0x2b], [0xa4, 0x6e, 0x3b], [0x3e, 0x2c, 0x21], [0x50, 0x33, 0x23], [0xbc, 0x8a, 0x52], [0x5e, 0x3c, 0x27]];

function frameAt(age) {
  const s = Fire.createState();
  Fire.addLog(s);
  s.flight.age = age;
  const fb = Fire.createFrame();
  Fire.render(fb, s, bg);
  return { s, fb };
}

test("an unrotated throw is already solid, and solidifyLog does not change it", () => {
  const { s, fb } = frameAt(0);
  const before = Uint8ClampedArray.from(fb);
  Fire.solidifyLog(fb, s);
  assert.deepEqual(fb, before);
});

test("a rotated flying log becomes exact log colours", () => {
  const { s, fb } = frameAt(0.35);
  const flown = Uint8ClampedArray.from(fb);
  s.flight = null;
  const bare = Fire.createFrame();
  Fire.render(bare, s, bg);
  let blended = 0;
  for (let i = 0; i < W * H * 4; i += 4) {
    if (flown[i] === bare[i] && flown[i + 1] === bare[i + 1] && flown[i + 2] === bare[i + 2]) continue;
    if (!LOG.some((c) => c[0] === flown[i] && c[1] === flown[i + 1] && c[2] === flown[i + 2])) blended++;
  }
  assert.ok(blended > 100, "the coverage blend is the see-through edge");
  s.flight = { age: 0.35, fromX: 36, fromY: 177 };
  Fire.solidifyLog(flown, s);
  let left = 0, solid = 0;
  for (let i = 0; i < W * H * 4; i += 4) {
    if (flown[i] === bare[i] && flown[i + 1] === bare[i + 1] && flown[i + 2] === bare[i + 2]) continue;
    if (!Fire.isSolidLog(flown[i], flown[i + 1], flown[i + 2])) left++;
    else solid++;
  }
  assert.ok(left < blended / 4, `fringe ${left} of ${blended}`);
  assert.ok(solid > 300);
});

test("solidifyLog with no log in the air changes nothing", () => {
  const s = Fire.createState();
  const fb = Fire.createFrame();
  Fire.render(fb, s, bg);
  const before = Uint8ClampedArray.from(fb);
  Fire.solidifyLog(fb, s);
  assert.deepEqual(fb, before);
});

test("the cover stamp stores a dark log pixel and a bright one on the same scale", () => {
  const art = new Uint8ClampedArray(W * H * 4);
  const fb = new Uint8ClampedArray(W * H * 4);
  art.fill(0); fb.fill(0);
  for (let i = 3; i < art.length; i += 4) { art[i] = 255; fb[i] = 255; }
  // Dark body on a near-black tree, and a bright end on the sky. Both are
  // replacements, so both are stored back by the cover. Leaving the dark
  // body on its own pixel is what split the log.
  const dark = [30, 24, 18];
  const body = [0x21, 0x1a, 0x13];
  const dx = 40, dy = 160, di = (dy * W + dx) * 4;
  art[di] = dark[0]; art[di + 1] = dark[1]; art[di + 2] = dark[2];
  fb[di] = body[0]; fb[di + 1] = body[1]; fb[di + 2] = body[2];
  const sky = [170, 190, 210];
  const cap = [0xbc, 0x8a, 0x52];
  const bx = 180, by = 140, bi = (by * W + bx) * 4;
  art[bi] = sky[0]; art[bi + 1] = sky[1]; art[bi + 2] = sky[2];
  fb[bi] = cap[0]; fb[bi + 1] = cap[1]; fb[bi + 2] = cap[2];
  const cover = 1.25;
  const dst = Uint8ClampedArray.from(art);
  Fire.stampSolidLogs(dst, fb, art, cover);
  const bodyAt = (coverIndex(dy, cover, H) * W + coverIndex(dx, cover, W)) * 4;
  const capAt = (coverIndex(by, cover, H) * W + coverIndex(bx, cover, W)) * 4;
  assert.notEqual(bodyAt, di);
  assert.notEqual(capAt, bi);
  assert.equal(dst[di], dark[0], "the dark source stays the art");
  assert.equal(dst[di + 1], dark[1]);
  assert.equal(dst[bi], sky[0], "the bright source stays the art");
  assert.equal(dst[bodyAt], body[0]);
  assert.equal(dst[bodyAt + 1], body[1]);
  assert.equal(dst[bodyAt + 2], body[2]);
  assert.equal(dst[capAt], cap[0]);
  assert.equal(dst[capAt + 1], cap[1]);
  assert.equal(dst[capAt + 2], cap[2]);
  let bodies = 0, caps = 0;
  for (let i = 0; i < dst.length; i += 4) {
    if (dst[i] === body[0] && dst[i + 1] === body[1] && dst[i + 2] === body[2]) bodies++;
    if (dst[i] === cap[0] && dst[i + 1] === cap[1] && dst[i + 2] === cap[2]) caps++;
  }
  assert.equal(bodies, 1);
  assert.equal(caps, 1);
});

function coverIndex(p, cover, limit) {
  const n = Math.round(p / cover);
  for (let k = n - 2; k <= n + 2; k++) {
    if (k >= 0 && k < limit && ((k * cover + 0.5) | 0) === p) return k;
  }
  return -1;
}

const BODY = [0x21, 0x1a, 0x13];
const CAP = [0xbc, 0x8a, 0x52];

function same(buf, i, c) {
  return buf[i] === c[0] && buf[i + 1] === c[1] && buf[i + 2] === c[2];
}

function differs(a, i, b) {
  return a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
}

// Hearth stamp, then the log stamp, matching putAll when cover is not 1.
// A stored pixel is shown at bufferSlot * cover.
function stampedFlight(age) {
  const cover = 1.25;
  const { s, fb } = frameAt(age);
  Fire.solidifyLog(fb, s);
  const dst = Uint8ClampedArray.from(bg);
  const x0 = 70, x1 = 300, y0 = 90;
  for (let dy = y0; dy < H; dy++) {
    const sy = (dy * cover + 0.5) | 0;
    if (sy < 0 || sy >= H) continue;
    for (let dx = x0; dx < x1; dx++) {
      const sx = (dx * cover + 0.5) | 0;
      if (sx < x0 || sx >= x1) continue;
      const i = (sy * W + sx) * 4;
      let dr = fb[i] - bg[i]; if (dr < 0) dr = -dr;
      let dg = fb[i + 1] - bg[i + 1]; if (dg < 0) dg = -dg;
      let db = fb[i + 2] - bg[i + 2]; if (db < 0) db = -db;
      if (dr + dg + db < 96) continue;
      const j = (dy * W + dx) * 4;
      dst[j] = fb[i]; dst[j + 1] = fb[i + 1]; dst[j + 2] = fb[i + 2];
    }
  }
  Fire.stampSolidLogs(dst, fb, bg, cover);
  return { fb, dst, cover };
}

function centroid(points) {
  let x = 0, y = 0;
  for (const p of points) { x += p.x; y += p.y; }
  return { x: x / points.length, y: y / points.length };
}

test("the stamped flying log stays one piece on one scale", () => {
  for (const age of [0.15, 0.35, 0.55]) {
    const { fb, dst, cover } = stampedFlight(age);
    const slots = new Map();
    let log = 0, shown = 0;
    const srcBody = [], srcCap = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!Fire.isSolidLog(fb[i], fb[i + 1], fb[i + 2]) || !differs(fb, i, bg)) continue;
      log++;
      if (same(fb, i, BODY)) srcBody.push({ x, y });
      if (same(fb, i, CAP)) srcCap.push({ x, y });
      const dx = coverIndex(x, cover, W), dy = coverIndex(y, cover, H);
      if (dx < 0 || dy < 0) continue;
      slots.set(`${dx},${dy}`, [fb[i], fb[i + 1], fb[i + 2]]);
      const j = (dy * W + dx) * 4;
      if (dst[j] === fb[i] && dst[j + 1] === fb[i + 1] && dst[j + 2] === fb[i + 2]) shown++;
    }
    assert.ok(log > 300);
    assert.ok(shown / log >= 0.55, `age ${age}: shown ${shown} of ${log}`);
    const dispBody = [], dispCap = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!Fire.isSolidLog(dst[i], dst[i + 1], dst[i + 2]) || !differs(dst, i, bg)) continue;
      const placed = slots.get(`${x},${y}`);
      assert.ok(placed, `age ${age}: log colour left at ${x},${y} off the cover lattice`);
      assert.deepEqual(placed, [dst[i], dst[i + 1], dst[i + 2]]);
      if (same(dst, i, BODY)) dispBody.push({ x: x * cover, y: y * cover });
      if (same(dst, i, CAP)) dispCap.push({ x: x * cover, y: y * cover });
    }
    assert.ok(srcBody.length > 50 && srcCap.length > 5);
    assert.ok(dispBody.length > 30 && dispCap.length > 3);
    const src = centroid(srcCap);
    const body = centroid(srcBody);
    const shownCap = centroid(dispCap);
    const shownBody = centroid(dispBody);
    const sdx = src.x - body.x, sdy = src.y - body.y;
    const ddx = shownCap.x - shownBody.x, ddy = shownCap.y - shownBody.y;
    assert.ok(Math.abs(ddx - sdx) < 2, `age ${age}: x gap ${ddx} vs source ${sdx}`);
    assert.ok(Math.abs(ddy - sdy) < 2, `age ${age}: y gap ${ddy} vs source ${sdy}`);
  }
});
