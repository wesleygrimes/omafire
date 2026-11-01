// Render and simulation parity: the original reference script (run in node on
// the MiniContext canvas emulator) versus ui/fire.js, driven by the same frame
// clock and the same inputs. Every drawn frame is compared pixel by pixel
// outside the native lake animation, which has its own coverage tests.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { loadFire } = require("./lib/load-fire");
const { createReference } = require("./lib/reference-runner");
const { backgroundRGBA, writePNG, OUT, compare } = require("./lib/images");

const Fire = loadFire();
const bgSrc = backgroundRGBA();
// Fixed independently of the renderer so this cannot hide changes elsewhere.
const outsideLake = (x, y) => !(x >= 218 && x < 309 && y >= 90 && y < 143);

// Mirrors the reference loop(now): dt from the frame clock (first frame
// 0.016, then capped at 0.08), update every frame, draw when 50 ms passed.
function ours() {
  const s = Fire.createState();
  const fb = Fire.createFrame();
  const bg = Fire.prepareBackground(bgSrc.data, bgSrc.width, bgSrc.height);
  const rects = Fire.createRects();
  let previous = 0, lastDraw = 0;
  return {
    s, fb,
    frame(now) {
      const dt = previous ? Math.min(0.08, (now - previous) / 1000) : 0.016;
      previous = now;
      Fire.update(s, dt);
      if (now - lastDraw > 50) {
        Fire.render(fb, s, bg, rects);
        lastDraw = now;
        // The dirty rectangles must cover every pixel that differs from the art.
        const covered = new Uint8Array(360 * 240);
        for (let k = 0; k < rects.n; k++) {
          const [x0, y0, x1, y1] = rects.r.subarray(k * 4, k * 4 + 4);
          for (let y = y0; y < y1; y++) covered.fill(1, y * 360 + x0, y * 360 + x1);
        }
        for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
          const i = (y * 360 + x) * 4;
          if (covered[y * 360 + x]) continue;
          if (fb[i] !== bg[i] || fb[i + 1] !== bg[i + 1] || fb[i + 2] !== bg[i + 2])
            assert.fail(`pixel ${x},${y} changed outside the dirty rectangles`);
        }
        return true;
      }
      return false;
    },
  };
}

function inputs(frame, ref, mine) {
  const both = (fnRef, fnMine) => { fnRef(); fnMine(); };
  const p = (type, x, y) => {
    ref.pointer(type, x, y);
    if (type === "pointerdown") Fire.pointerDown(mine.s, x, y);
    else if (type === "pointermove") Fire.pointerMove(mine.s, x, y);
    else if (type === "pointerup") Fire.pointerUp(mine.s, x, y);
  };
  switch (frame) {
    case 40: both(() => ref.click("of-add"), () => Fire.addLog(mine.s)); break;
    case 90: both(() => ref.click("of-stoke"), () => Fire.stoke(mine.s)); break;
    case 150: p("pointerdown", 40, 170); break;
    case 200: p("pointerup", 176, 178); break;
    case 260: p("pointerdown", 181, 176); break; // poke the coals
    case 300: p("pointerdown", 30, 200); break;
    case 340: p("pointerup", 300, 40); break; // invalid drop
    case 400: both(() => ref.click("of-add"), () => Fire.addLog(mine.s)); break;
    case 401: both(() => ref.click("of-add"), () => Fire.addLog(mine.s)); break;
    default:
      if (frame > 150 && frame < 200) p("pointermove", 40 + (frame - 150) * 2.7, 170 + (frame - 150) * 0.16);
      if (frame > 300 && frame < 340) p("pointermove", 30 + (frame - 300) * 6, 200 - (frame - 300) * 4);
  }
}

test("fire.js matches the reference outside the lake frame by frame (pixels, state, status, toast)", () => {
  const ref = createReference(bgSrc);
  const mine = ours();
  let now = 1000, draws = 0, worst = { frame: -1, meanAbs: 0, withinTol: 1, maxDiff: 0 };
  const snapshots = [60, 175, 210, 270, 330, 420];
  for (let frame = 0; frame < 480; frame++) {
    inputs(frame, ref, mine);
    // A slightly irregular clock so the 0.08 cap and the draw gate both bite.
    now += frame === 120 ? 140 : frame % 7 === 0 ? 21 : 16.6;
    ref.frame(now);
    const drew = mine.frame(now);
    assert.equal(Fire.status(mine.s).text, ref.status(), `status at frame ${frame}`);
    const rt = ref.toast();
    assert.equal(mine.s.toastShown, rt.visible, `toast visibility at frame ${frame}`);
    if (rt.visible) assert.equal(mine.s.toastText, rt.text);
    if (!drew) continue;
    draws++;
    const c = compare(ref.ctx.data, mine.fb, 360, 240, 2, outsideLake);
    if (c.meanAbs > worst.meanAbs || c.withinTol < worst.withinTol) worst = { frame, ...c };
    if ((snapshots.length && frame >= snapshots[0]) || c.withinTol < 0.999) {
      const tag = snapshots.length && frame >= snapshots[0] ? snapshots.shift() : frame;
      writePNG(path.join(OUT, "parity", `ref-${tag}.png`), ref.ctx.data, 360, 240);
      writePNG(path.join(OUT, "parity", `ours-${tag}.png`), mine.fb, 360, 240);
    }
    assert.ok(c.withinTol >= 0.999, `frame ${frame}: ${(c.withinTol * 100).toFixed(3)}% of pixels within 2 levels (mean ${c.meanAbs.toFixed(4)})`);
    assert.ok(c.meanAbs < 0.05, `frame ${frame}: mean abs diff ${c.meanAbs}`);
  }
  assert.ok(draws > 100, "drew enough frames");
  console.log(`# parity: ${draws} frames compared; worst frame ${worst.frame}: mean abs ${worst.meanAbs.toFixed(4)}, ` +
    `${(worst.withinTol * 100).toFixed(3)}% within 2 levels, max ${worst.maxDiff}`);
});

test("initial seeded state matches the reference globals", () => {
  const s = Fire.createState();
  assert.equal(s.stars.length, 16);
  assert.equal(s.embers.length, 75);
  assert.equal(s.fuel, 0.68);
  assert.equal(s.heat, 0.68);
  assert.equal(s.boost, 0);
  // First star from seed 5919, computed independently.
  let seed = 5919;
  const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  assert.equal(s.stars[0].x, 50 + r() * 260);
  assert.equal(s.stars[0].y, 5 + r() * 45);
});
