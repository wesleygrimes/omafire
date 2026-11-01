// How the fire layers follow heat and boost.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOUND_JS = path.join(__dirname, "..", "ui", "fire", "sound.js");

function loadSound() {
  const source = fs.readFileSync(SOUND_JS, "utf8").replace(/^\.pragma library\s*$/m, "");
  const module = { exports: {} };
  vm.runInContext(source, vm.createContext({ module, Math }), { filename: SOUND_JS });
  return module.exports;
}

const Sound = loadSound();

test("a dead fire is silent", () => {
  assert.equal(Sound.embersGain(0), 0);
  assert.equal(Sound.crackleGain(0), 0);
  assert.equal(Sound.roarGain(0, 0), 0);
  assert.equal(Sound.roarGain(0, 1.1), 0, "stoking a cold hearth doesn't roar");
});

test("a low fire is mostly embers", () => {
  const h = 0.12;
  assert.ok(Sound.embersGain(h) > 0.95);
  assert.ok(Sound.crackleGain(h) < 0.1);
  assert.equal(Sound.roarGain(h, 0), 0);
});

test("the fire grows from embers to crackle to roar as heat rises", () => {
  let lastC = -1, lastR = -1;
  for (let h = 0; h <= 1.0001; h += 0.05) {
    const c = Sound.crackleGain(h), r = Sound.roarGain(h, 0);
    assert.ok(c >= lastC && r >= lastR, `monotone at heat ${h.toFixed(2)}`);
    for (const g of [Sound.embersGain(h), c, r]) assert.ok(g >= 0 && g <= 1);
    lastC = c; lastR = r;
  }
  assert.equal(Sound.crackleGain(0.68), 1, "the default fire crackles fully");
  assert.ok(Sound.roarGain(0.68, 0) < 0.2, "the default fire barely roars");
  assert.equal(Sound.roarGain(1, 0), 1);
  assert.ok(Sound.embersGain(1) >= 0.7, "embers stay under a hot fire");
});

test("a stoke brings the roar in, and it fades with the boost", () => {
  const h = 0.4;
  assert.equal(Sound.roarGain(h, 1.1), 1);
  assert.ok(Sound.roarGain(h, 0.5) > Sound.roarGain(h, 0.2));
  assert.equal(Sound.roarGain(h, 0), 0);
});
