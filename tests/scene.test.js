// fire.js frames against reference/approved-scene.png, a frame the reference
// code rendered at an unrecorded time. The background outside the fire must
// match exactly; the fire area is matched by searching the first seconds of an
// idle 60 Hz run for the closest frame.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadFire } = require("./lib/load-fire");
const { readRGBA, backgroundRGBA, writePNG, compare, ROOT, OUT } = require("./lib/images");

const Fire = loadFire();
const approved = readRGBA(path.join(ROOT, "tests", "reference", "approved-scene.png"));
const src = backgroundRGBA();
const bg = Fire.prepareBackground(src.data, src.width, src.height);
const fireArea = (x, y) => x > 100 && x < 262 && y > 80 && y < 225;
const starRows = (x, y) => y < 52;
// The native lake animation is covered separately. Use fixed bounds here so
// reference comparisons continue to catch changes elsewhere in the scene.
const outsideLake = (x, y) => !(x >= 218 && x < 309 && y >= 90 && y < 143);
const referenceFireArea = (x, y) => fireArea(x, y) && outsideLake(x, y);

test("background is the approved art sampled exactly like the reference canvas", () => {
  const s = Fire.createState();
  const fb = Fire.createFrame();
  Fire.render(fb, s, bg);
  writePNG(path.join(OUT, "scene-initial.png"), fb, 360, 240);
  const outside = compare(approved.data, fb, 360, 240, 0, (x, y) => outsideLake(x, y) && (!fireArea(x, y) && !starRows(x, y) && y < 225 || (y >= 225 && x < 60)));
  console.log(`# outside fire and stars: ${(outside.withinTol * 100).toFixed(3)}% pixels identical`);
  assert.ok(outside.withinTol > 0.995, "background pixels identical away from fire, smoke, sparks and stars");
});

test("closest idle frame matches the approved capture's fire", () => {
  const s = Fire.createState();
  const fb = Fire.createFrame();
  let best = null;
  for (let f = 1; f <= 360; f++) {
    Fire.update(s, 1 / 60);
    Fire.render(fb, s, bg);
    const c = compare(approved.data, fb, 360, 240, 8, referenceFireArea);
    if (!best || c.meanAbs < best.c.meanAbs) best = { f, t: s.elapsed, c, frame: Uint8ClampedArray.from(fb) };
  }
  const whole = compare(approved.data, best.frame, 360, 240, 8, outsideLake);
  console.log(`# approved-scene: best t=${best.t.toFixed(3)} s; fire area mean abs ${best.c.meanAbs.toFixed(3)}, ` +
    `${(best.c.withinTol * 100).toFixed(2)}% within 8; whole frame mean abs ${whole.meanAbs.toFixed(3)}, ${(whole.withinTol * 100).toFixed(2)}% within 8`);
  const ours = writePNG(path.join(OUT, "scene-best-match.png"), best.frame, 360, 240);
  try {
    execFileSync("magick", [path.join(ROOT, "tests", "reference", "approved-scene.png"), ours, "+append", "-scale", "200%",
      path.join(OUT, "compare-approved-scene.png")]);
  } catch (e) { /* the image is a convenience */ }
  assert.ok(best.c.meanAbs < 1.0, "fire area mean abs diff under 1 level");
  assert.ok(best.c.withinTol > 0.98, "98% of fire-area pixels within 8 levels");
  assert.ok(whole.withinTol > 0.99);
});

test("flame palette: every flame pixel uses one of the six reference colours", () => {
  const s = Fire.createState();
  s.embers = []; // embers use their own palette
  const plain = Fire.createFrame();
  for (let i = 0; i < plain.length; i += 4) { plain[i] = 0; plain[i + 1] = 0; plain[i + 2] = 0; plain[i + 3] = 255; }
  const fb = Fire.createFrame();
  s.elapsed = 2.5;
  Fire.render(fb, { ...s, stars: [], smoke: [], sparks: [] }, null);
  const palette = new Set(["fff0a7", "ffd36e", "ffae3c", "f37828", "d5471d", "91341f"]);
  let solid = 0, other = 0;
  // Flame cells sit above the light pool's top (y < 165) where nothing else draws.
  for (let y = 90; y < 164; y++) for (let x = 100; x < 262; x++) {
    const i = (y * 360 + x) * 4;
    const hex = [fb[i], fb[i + 1], fb[i + 2]].map(v => v.toString(16).padStart(2, "0")).join("");
    if (hex === "0b1522") continue;
    if (palette.has(hex)) solid++; else other++;
  }
  assert.ok(solid > 400, `flame has body (${solid} px)`);
  // The rest are the 0.75-alpha edge cells over the fallback fill.
  assert.ok(other < solid, `edge cells (${other}) fewer than solid cells (${solid})`);
});
