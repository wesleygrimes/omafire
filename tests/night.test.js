// Cricket and frog pacing.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const NIGHT_JS = path.join(__dirname, "..", "ui", "fire", "night.js");

function loadNight() {
  const source = fs.readFileSync(NIGHT_JS, "utf8").replace(/^\.pragma library\s*$/m, "");
  const module = { exports: {} };
  vm.runInContext(source, vm.createContext({ module, Math }), { filename: NIGHT_JS });
  return module.exports;
}

const Night = loadNight();

function runAmbience(seed, seconds, dt = 0.1) {
  const a = Night.createAmbience(seed);
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    for (const ev of Night.advanceAmbience(a, dt)) events.push({ t: t + dt, ...ev });
  }
  return events;
}

function gaps(times) {
  const g = [];
  for (let i = 1; i < times.length; i++) g.push(times[i] - times[i - 1]);
  return g;
}

test("crickets phrase and rest, frogs stay rare and out of the way", () => {
  for (const seed of [5919, 1, 2, 7, 99]) {
    const ev = runAmbience(seed, 15 * 60);
    const crickets = ev.filter(e => e.kind === "cricket");
    const primaries = crickets.filter(e => !e.answer);
    const answers = crickets.filter(e => e.answer);
    const frogs = ev.filter(e => e.kind === "peep" || e.kind === "croak");
    const frogPrimaries = frogs.filter(e => !e.echo);
    assert.ok(primaries.length > 40, `seed ${seed}: a night of cricket phrases`);
    assert.ok(frogs.length > 4, `seed ${seed}: frogs do call`);
    assert.ok(primaries.length > frogs.length * 3, `seed ${seed}: frogs are much rarer than crickets`);
    assert.ok(primaries[0].t >= 6 && primaries[0].t <= 10, `seed ${seed}: first chirp lets the fire speak first`);
    assert.ok(frogPrimaries[0].t >= 22 && frogPrimaries[0].t <= 40, `seed ${seed}: first frog is later`);

    const pg = gaps(primaries.map(e => e.t));
    for (const gap of pg) {
      // Recorded on a 0.1 s clock, so a phrase step of 0.86 to 1.10 s
      // lands in a slightly wider bucket.
      const phrase = gap >= 0.75 && gap <= 1.25;
      const rest = gap >= 14;
      assert.ok(phrase || rest, `seed ${seed}: cricket gap ${gap.toFixed(3)} is a phrase step or a rest`);
    }
    // Phrases are several chirps, not a metronome that never stops.
    assert.ok(pg.some(g => g >= 14), `seed ${seed}: the cricket rests between phrases`);
    assert.ok(pg.filter(g => g >= 0.84 && g <= 1.15).length > pg.filter(g => g >= 14).length, `seed ${seed}: chirps come in phrases`);

    for (const ans of answers) {
      const before = primaries.filter(p => ans.t - p.t > 0.2 && ans.t - p.t < 0.5);
      assert.equal(before.length, 1, `seed ${seed}: an answer follows one chirp`);
      assert.ok(ans.gain < 0.65, "the answering cricket is farther off");
    }

    const fg = gaps(frogPrimaries.map(e => e.t));
    for (const gap of fg) assert.ok(gap >= 22, `seed ${seed}: frogs wait ${gap.toFixed(1)}s`);
    for (const echo of frogs.filter(e => e.echo)) {
      const before = frogPrimaries.filter(p => p.kind === echo.kind && echo.t - p.t >= 0.9 && echo.t - p.t <= 2.1);
      assert.ok(before.length >= 1, `seed ${seed}: a doubled call follows its own kind`);
    }

    // No two calls begin in the same tenth of a second.
    const times = ev.map(e => e.t).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i] - times[i - 1] >= 0.1, `seed ${seed}: calls stacked at ${times[i].toFixed(2)} (gap ${(times[i] - times[i - 1]).toFixed(2)})`);
    }
  }
});
