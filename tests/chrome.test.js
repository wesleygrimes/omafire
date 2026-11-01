// Same-time comparison with the real browser: the approved fragment runs in
// headless Chromium (real canvas 2D, real 'screen' blending, real antialiased
// rotated logs) with a stubbed frame clock; fire.js runs the same frames.
// Skips when no Chromium is installed.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { loadFire } = require("./lib/load-fire");
const { backgroundRGBA, writePNG, OUT, compare } = require("./lib/images");
const { chromium, SCRIPT, clockStep, writeHarness, dump, hexToRGBA } = require("./lib/chrome");

const Fire = loadFire();
const BIN = chromium();
const CAPTURE = [60, 130, 175, 230];
// The native lake animation is tested separately; keep reference coverage
// everywhere else, with bounds independent of the renderer.
const outsideLake = (x, y) => !(x >= 218 && x < 309 && y >= 90 && y < 143);

function runOurs(lastFrame) {
  const src = backgroundRGBA();
  const bg = Fire.prepareBackground(src.data, src.width, src.height);
  const s = Fire.createState();
  const frames = {};
  let now = 1000, previous = 0, lastDraw = 0;
  const fb = Fire.createFrame();
  for (let frame = 0; frame <= lastFrame; frame++) {
    for (const a of SCRIPT) if (a[0] === frame) {
      if (a[1] === "click") (a[2] === "of-add" ? Fire.addLog : Fire.stoke)(s);
      else if (a[1] === "pointerdown") Fire.pointerDown(s, a[2], a[3]);
      else if (a[1] === "pointermove") Fire.pointerMove(s, a[2], a[3]);
      else if (a[1] === "pointerup") Fire.pointerUp(s, a[2], a[3]);
    }
    now += clockStep(frame);
    const dt = previous ? Math.min(0.08, (now - previous) / 1000) : 0.016;
    previous = now;
    Fire.update(s, dt);
    if (now - lastDraw > 50) { Fire.render(fb, s, bg); lastDraw = now; }
    if (CAPTURE.includes(frame)) frames[frame] = Uint8ClampedArray.from(fb);
  }
  return { frames, s };
}

test("fire.js matches the reference outside the lake rendered by Chromium at the same frames", { skip: !BIN && "chromium not installed" }, () => {
  const file = writeHarness("same-time", { captureFrames: CAPTURE, stopFrame: Math.max(...CAPTURE) });
  const chrome = dump(BIN, file);
  const ours = runOurs(Math.max(...CAPTURE));
  const fireArea = (x, y) => x > 100 && x < 262 && y > 80 && y < 225 && outsideLake(x, y);
  for (const frame of CAPTURE) {
    const ref = hexToRGBA(chrome[frame]);
    writePNG(path.join(OUT, "chrome", `chrome-${frame}.png`), ref, 360, 240);
    writePNG(path.join(OUT, "chrome", `ours-${frame}.png`), ours.frames[frame], 360, 240);
    const all = compare(ref, ours.frames[frame], 360, 240, 8, outsideLake);
    const fire = compare(ref, ours.frames[frame], 360, 240, 8, fireArea);
    console.log(`# chrome frame ${frame}: whole scene mean abs ${all.meanAbs.toFixed(3)}, ${(all.withinTol * 100).toFixed(2)}% within 8; ` +
      `fire area mean abs ${fire.meanAbs.toFixed(3)}, ${(fire.withinTol * 100).toFixed(2)}% within 8, max ${all.maxDiff}`);
    assert.ok(all.withinTol > 0.999, `frame ${frame} whole scene`);
    assert.ok(fire.withinTol > 0.995, `frame ${frame} fire area`);
    assert.ok(all.meanAbs < 0.1, `frame ${frame} mean abs`);
  }
  assert.equal(chrome.status, Fire.status(ours.s).text);
});
