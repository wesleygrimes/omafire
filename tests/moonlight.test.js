"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadFire } = require("./lib/load-fire");
const { backgroundRGBA } = require("./lib/images");

const Fire = loadFire();
const src = backgroundRGBA();
const bg = Fire.prepareBackground(src.data, src.width, src.height);

test("moonlight shimmers on water while the island, pines and artwork stay intact", () => {
  const original = Uint8ClampedArray.from(bg);
  const a = Uint8ClampedArray.from(bg), b = Uint8ClampedArray.from(bg);
  Fire.drawMoonlight(a, bg, 0);
  Fire.drawMoonlight(b, bg, 1.25);
  let changed = 0, moving = 0, glints = 0;
  for (let y = 0; y < 240; y++) for (let x = 0; x < 360; x++) {
    const i = (y * 360 + x) * 4;
    const differs = [0, 1, 2].some(k => a[i + k] !== bg[i + k] || b[i + k] !== bg[i + k]);
    if (differs) {
      assert.ok(x >= 218 && x < 309 && y >= 90 && y < 143, `moonlight stays in the lake at ${x},${y}`);
      changed++;
    }
    if ([0, 1, 2].some(k => a[i + k] !== b[i + k])) moving++;
    if (a[i] - bg[i] > 30) glints++;
    assert.equal(a[i + 3], 255, "the scene stays opaque");
  }
  assert.ok(changed > 500, "the reflection has visible ripples");
  assert.ok(moving > 300, "the reflection changes with time");
  assert.ok(glints > 10, "brief glints brighten the water");
  for (const [x, y] of [[275, 104], [253, 103], [265, 130], [280, 135], [257, 140]]) {
    const i = (y * 360 + x) * 4;
    assert.deepEqual(a.slice(i, i + 4), bg.slice(i, i + 4), `island or pine at ${x},${y} occludes the light`);
    assert.deepEqual(b.slice(i, i + 4), bg.slice(i, i + 4));
  }
  assert.deepEqual(bg, original, "the approved background buffer is unchanged");
});

test("moonlight redraws deterministically without changing the fire simulation", () => {
  const state = Fire.createState();
  const before = JSON.stringify(state);
  const frame = Fire.createFrame(), fresh = Fire.createFrame();
  Fire.render(frame, state, bg);
  assert.equal(JSON.stringify(state), before, "rendering consumes no simulation randomness or state");
  state.elapsed = 1.25;
  Fire.render(frame, state, bg);
  Fire.render(fresh, state, bg);
  assert.deepEqual(frame, fresh, "the previous frame leaves no glint trails");
  Fire.render(frame, state, null);
  Fire.render(fresh, state, null);
  assert.deepEqual(frame, fresh, "the fallback clears the lake effect");
});
