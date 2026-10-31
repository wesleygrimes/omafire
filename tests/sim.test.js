// Simulation behaviour from BUILD_SPEC sections 4 and 5, plus the native
// lifecycle additions (wall-clock ticks, caps, persistence).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadFire } = require("./lib/load-fire");

const Fire = loadFire();
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b} ± ${tol}, got ${a}`);

function runFor(s, seconds, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) Fire.update(s, dt);
}

function burnOutTime(fuel) {
  const s = Fire.createState();
  s.fuel = fuel;
  let t = 0;
  while (s.fuel > 0 && t < 2000) { Fire.update(s, 0.05); t += 0.05; }
  return t;
}

test("initial state", () => {
  const s = Fire.createState();
  assert.equal(s.fuel, 0.68);
  assert.equal(s.heat, 0.68);
  assert.equal(s.boost, 0);
  assert.equal(Fire.status(s).text, "● Burning steadily");
});

test("decay timing: full load ~800 s, initial 0.68 ~544 s, one log ~200 s", () => {
  close(burnOutTime(1), 800, 1, "full load");
  close(burnOutTime(0.68), 544, 1, "initial fuel");
  close(burnOutTime(0.25), 200, 1, "one log");
});

test("add log: +0.25 capped at 1, boost >= 0.35, 24 sparks, 0.7 s flight from (36,177), messages", () => {
  const s = Fire.createState();
  assert.equal(Fire.addLog(s), "Fresh wood. Give it a moment.");
  close(s.fuel, 0.93, 1e-12);
  assert.equal(s.boost, 0.35);
  assert.equal(s.sparks.length, 24);
  assert.deepEqual({ ...s.flight }, { age: 0, fromX: 36, fromY: 177 });
  assert.equal(Fire.addLog(s), "A good, roaring fire.");
  assert.equal(s.fuel, 1);
  Fire.addLog(s);
  assert.equal(s.fuel, 1, "capped");
  s.boost = 0.9; Fire.addLog(s);
  assert.equal(s.boost, 0.9, "boost only raised");
  runFor(s, 0.71);
  assert.equal(s.flight, null, "flight ends after 0.7 s");
});

test("stoke: boost 1.1, heat +0.15, 48 sparks, no fuel; empty fire only shows a message", () => {
  const s = Fire.createState();
  assert.equal(Fire.stoke(s), "The coals come alive.");
  assert.equal(s.boost, 1.1);
  close(s.heat, 0.83, 1e-12);
  assert.equal(s.fuel, 0.68);
  assert.equal(s.sparks.length, 48);
  assert.equal(Fire.status(s).label, "Stoking the fire");

  const e = Fire.createState();
  e.fuel = 0.01; e.heat = 0.2;
  assert.equal(Fire.stoke(e), "Add a log to get it going.");
  assert.equal(e.fuel, 0.01);
  assert.equal(e.boost, 0);
  assert.equal(e.heat, 0.2);
  assert.equal(e.sparks.length, 0);
  assert.equal(e.toastText, "Add a log to get it going.");
});

test("poke: 32 sparks at power 1.2, boost >= 0.22, never adds fuel or rekindles", () => {
  const s = Fire.createState();
  s.fuel = 0; s.heat = 0;
  assert.equal(Fire.pointerDown(s, 181, 176), "poke");
  assert.equal(s.sparks.length, 32);
  assert.equal(s.boost, 0.22);
  assert.equal(s.toastText, "A little shower of sparks.");
  for (let i = 0; i < 20; i++) { Fire.poke(s); runFor(s, 0.5); }
  assert.equal(s.fuel, 0);
  assert.ok(s.heat < 1e-9);
  assert.equal(Fire.status(s).label, "Resting");
  Fire.addLog(s);
  runFor(s, 4);
  assert.ok(s.heat > 0.08, "wood rekindles an exhausted fire");
});

test("hit tests: woodpile, coals, hearth", () => {
  assert.ok(Fire.inWoodpile(87.9, 142.1));
  assert.ok(!Fire.inWoodpile(88, 150));
  assert.ok(!Fire.inWoodpile(40, 142));
  assert.ok(Fire.onCoals(181, 181 + 58.9));
  assert.ok(!Fire.onCoals(181, 181 + 59));
  assert.ok(Fire.inHearth(181 + 64.9, 181));
  assert.ok(!Fire.inHearth(181 + 65, 181));
  const s = Fire.createState();
  assert.equal(Fire.pointerDown(s, 300, 30), "", "sky does nothing");
  assert.equal(Fire.cursorFor(s, 40, 170), "grab");
  assert.equal(Fire.cursorFor(s, 200, 50), "default");
});

test("drag and drop: valid drop adds fuel, boost 0.45, 40 sparks, flight at 0.48; invalid drop changes nothing", () => {
  const s = Fire.createState();
  assert.equal(Fire.pointerDown(s, 40, 170), "drag");
  assert.equal(Fire.cursorFor(s, 40, 170), "grabbing");
  Fire.pointerMove(s, 120, 175);
  assert.deepEqual({ ...s.drag }, { x: 120, y: 175 });
  assert.equal(Fire.pointerUp(s, 176, 178), true);
  close(s.fuel, 0.93, 1e-12);
  assert.equal(s.boost, 0.45);
  assert.equal(s.sparks.length, 40);
  assert.deepEqual({ ...s.flight }, { age: 0.48, fromX: 176, fromY: 178 });
  assert.equal(s.toastText, "That’ll keep it going.");
  assert.equal(s.drag, null);

  const t = Fire.createState();
  Fire.pointerDown(t, 30, 200);
  const before = JSON.stringify({ fuel: t.fuel, heat: t.heat, boost: t.boost, sparks: t.sparks.length });
  assert.equal(Fire.pointerUp(t, 300, 40), false);
  assert.equal(JSON.stringify({ fuel: t.fuel, heat: t.heat, boost: t.boost, sparks: t.sparks.length }), before);
  assert.equal(t.drag, null);
  Fire.pointerDown(t, 30, 200);
  Fire.pointerCancel(t);
  assert.equal(t.drag, null);
  assert.equal(Fire.pointerUp(t, 181, 181), false, "no drag, no drop");
});

test("status precedence and dot", () => {
  const cases = [
    [{ boost: 0.51, heat: 0, fuel: 0 }, "● Stoking the fire"],
    [{ boost: 0.5, heat: 0.79, fuel: 0 }, "● Roaring warmly"],
    [{ boost: 0, heat: 0.78, fuel: 1 }, "● Burning steadily"],
    [{ boost: 0, heat: 0.31, fuel: 1 }, "● Burning steadily"],
    [{ boost: 0, heat: 0.3, fuel: 1 }, "● Settling into coals"],
    [{ boost: 0, heat: 0.081, fuel: 0 }, "● Settling into coals"],
    [{ boost: 0, heat: 0.08, fuel: 0.011 }, "● Glowing embers"],
    [{ boost: 0, heat: 0.08, fuel: 0.01 }, "○ Resting"],
    [{ boost: 0, heat: 0, fuel: 0 }, "○ Resting"],
  ];
  for (const [s, text] of cases) assert.equal(Fire.status(s).text, text, JSON.stringify(s));
  assert.equal(Fire.status({ boost: 0, heat: 0, fuel: 0 }).filled, false);
});

test("toast lasts 2.2 s", () => {
  const s = Fire.createState();
  Fire.addLog(s);
  runFor(s, 2.1);
  assert.ok(s.toastShown);
  runFor(s, 0.2);
  assert.ok(!s.toastShown);
});

test("tick: particles step with the 0.08 s cap; the rest of a long frame is analytic", () => {
  const a = Fire.createState(), b = Fire.createState();
  Fire.tick(a, 0.5, true);
  Fire.update(b, 0.08);
  Fire.advanceAnalytic(b, 0.42);
  assert.equal(a.fuel, b.fuel);
  close(a.elapsed, 0.5, 1e-12, "wall clock kept");
  // A huge gap (suspend) is applied once, analytically, with no particle loop.
  const c = Fire.createState();
  Fire.burst(c, 30);
  Fire.tick(c, 3600, true);
  assert.equal(c.sparks.length, 0);
  assert.equal(c.fuel, 0);
  assert.equal(Fire.status(c).label, "Resting");
});

test("analytic advance tracks the stepped simulation", () => {
  for (const [fuel, heat, secs] of [[0.68, 0.68, 30], [1, 0.4, 120], [0.3, 0.9, 300], [0.68, 0.68, 600], [0.05, 0.05, 90]]) {
    const a = Fire.createState(), b = Fire.createState();
    a.fuel = b.fuel = fuel; a.heat = b.heat = heat;
    runFor(a, secs, 1 / 60);
    Fire.advanceAnalytic(b, secs);
    close(b.fuel, a.fuel, 1e-6, `fuel after ${secs}s`);
    close(b.heat, a.heat, 0.003, `heat after ${secs}s from ${fuel}/${heat}`);
  }
});

test("particle caps under rapid input", () => {
  const s = Fire.createState();
  for (let i = 0; i < 200; i++) {
    Fire.stoke(s); Fire.addLog(s); Fire.poke(s);
    Fire.pointerDown(s, 40, 170); Fire.pointerUp(s, 181, 181);
    Fire.update(s, 0.016);
    assert.ok(s.sparks.length <= Fire.SPARK_CAP);
    assert.ok(s.smoke.length <= Fire.SMOKE_CAP);
  }
  for (let i = 0; i < 2000; i++) { s.fuel = 1; s.heat = 1; Fire.update(s, 0.08); }
  assert.ok(s.smoke.length <= 40);
  assert.ok(s.sparks.length <= 160);
});

test("persistence: serialize, restore with elapsed time, long absence, corrupt input, clock skew", () => {
  const s = Fire.createState();
  s.fuel = 0.9; s.heat = 0.7;
  const now = 1_700_000_000_000;
  const text = Fire.serialize(s, now);
  assert.deepEqual(JSON.parse(text), { version: 1, fuel: 0.9, heat: 0.7, savedAt: now });

  let r = Fire.restore(text, now + 120_000);
  assert.equal(r.restored, true);
  close(r.state.fuel, 0.9 - 120 * 0.00125, 1e-9);
  assert.equal(r.state.elapsed, 0, "the scene clock restarts");
  assert.equal(r.state.sparks.length, 0, "no particle catch-up");

  r = Fire.restore(text, now + 900_000);
  assert.equal(Fire.status(r.state).label, "Resting", "15 minutes burns 0.9 fuel out");

  r = Fire.restore(text, now + 30 * 86400e3);
  assert.equal(r.state.fuel, 0);
  assert.equal(r.state.heat, 0);
  assert.equal(Fire.status(r.state).label, "Resting");

  for (const bad of ["", "{", "null", "[]", '{"fuel":"x","heat":0.5,"savedAt":1}', '{"fuel":2,"heat":0.5,"savedAt":1}', '{"fuel":0.5,"heat":0.5}']) {
    r = Fire.restore(bad, now);
    assert.equal(r.restored, false, bad);
    assert.equal(r.state.fuel, 0.68);
    assert.equal(r.state.heat, 0.68);
  }

  r = Fire.restore(text, now - 3_600_000);
  assert.equal(r.away, 0, "a clock that ran backwards counts as no time");
  assert.equal(r.state.fuel, 0.9);
});

test("bar icon cells follow the fire", () => {
  const lit = Fire.iconCells(0.68, 0, 0.68, 1.3);
  const flame = lit.filter(c => c >= 1 && c <= 6).length;
  assert.equal(lit.length, Fire.ICON_SIZE * Fire.ICON_SIZE);
  assert.ok(flame >= 8, `lit icon has a flame (${flame})`);
  const roaring = Fire.iconCells(1, 1.1, 1, 1.3).filter(c => c >= 1 && c <= 6).length;
  assert.ok(roaring > flame, "stoked icon is bigger");
  const resting = Fire.iconCells(0, 0, 0, 1.3);
  assert.equal(resting.filter(c => c >= 1 && c <= 9).length, 0, "resting icon has no flame or coals");
  assert.ok(resting.some(c => c === 10), "resting icon keeps its log");
  const embers = Fire.iconCells(0.05, 0, 0.02, 1.3);
  assert.equal(embers.filter(c => c >= 1 && c <= 6).length, 0);
  assert.ok(embers.some(c => c >= 7 && c <= 9), "embers glow");
});
