// Runs tests/qml/tst_popup.qml offscreen with qmltestrunner at device scale 1
// and 2, fails on any warning that isn't the test machine's audio setup, and
// checks the grabbed popup sizes. Also runs `omarchy plugin validate`.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { ROOT, OUT, readRGBA, backgroundRGBA } = require("./lib/images");
const { loadFire } = require("./lib/load-fire");
const Fire = loadFire();

function findRunner() {
  for (const p of ["/usr/lib/qt6/bin/qmltestrunner", "/usr/lib/qt/bin/qmltestrunner", "/usr/bin/qmltestrunner6", "/usr/bin/qmltestrunner"]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const RUNNER = findRunner();

// Lines a machine without a usable audio sink prints from QtMultimedia; they
// say nothing about OmaFire (which then shows "Sound unavailable.").
const AUDIO_ENV = [/qt\.multimedia\./, /No audio device detected/, /VDPAU/, /^\[\w+ @ 0x[0-9a-f]+\]/, /analyzeduration/, /^Input #0, wav/, /^\s+(Duration|Stream #0)/];

function size(file) {
  return execFileSync("magick", ["identify", "-format", "%w %h", file]).toString().trim().split(" ").map(Number);
}

for (const scale of [1, 2]) {
  test(`popup smoke test at ${scale}x`, { skip: !RUNNER && "qmltestrunner not installed", timeout: 120000 }, () => {
    fs.mkdirSync(OUT, { recursive: true });
    const r = spawnSync("timeout", ["100", RUNNER, "-input", path.join(ROOT, "tests", "qml")], {
      env: { ...process.env, QT_QPA_PLATFORM: "offscreen", QT_SCALE_FACTOR: String(scale), QT_ENABLE_HIGHDPI_SCALING: "1" },
      encoding: "utf8",
    });
    const output = (r.stdout || "") + (r.stderr || "");
    fs.writeFileSync(path.join(OUT, `qml-${scale}x.log`), output);
    assert.equal(r.status, 0, output);
    assert.match(output, /Totals: \d+ passed, 0 failed/);
    assert.match(output, /PASS\s+: focus::test_tab_after_click_shows_ring\(\)/, "tst_focus.qml ran");
    const problems = output.split("\n").filter(l =>
      (/^(QWARN|QCRITICAL|QFATAL)/.test(l) || /\.qml:\d+/.test(l) || /^\s*(Warning|Error)/i.test(l)) && !AUDIO_ENV.some(re => re.test(l)));
    assert.deepEqual(problems, [], "no QML warnings or errors");
    const [w, h] = size(path.join(OUT, `popup-${scale}x.png`));
    assert.equal(w, 390 * scale);
    assert.equal(h, 381 * scale);

    // The scene in the grab, sampled back at canvas pixel centres, must be
    // the approved art exactly where nothing animates (rows 60-140 of the
    // left 100 columns): proves the background decode and the canvas scaling
    // are right at this device scale.
    const grab = readRGBA(path.join(OUT, `popup-${scale}x.png`));
    const src = backgroundRGBA();
    const bg = Fire.prepareBackground(src.data, src.width, src.height);
    let same = 0, n = 0;
    for (let cy = 60; cy < 140; cy++) for (let cx = 0; cx < 100; cx++) {
      const gx = Math.floor((1 + (cx + 0.5) * 388 / 360) * scale), gy = Math.floor((38 + (cy + 0.5) * 259 / 240) * scale);
      const gi = (gy * grab.width + gx) * 4, bi = (cy * 360 + cx) * 4;
      n++;
      if (Math.abs(grab.data[gi] - bg[bi]) <= 1 && Math.abs(grab.data[gi + 1] - bg[bi + 1]) <= 1 && Math.abs(grab.data[gi + 2] - bg[bi + 2]) <= 1) same++;
    }
    console.log(`# ${scale}x scene background: ${(100 * same / n).toFixed(2)}% of sampled pixels match fire.js`);
    assert.ok(same / n > 0.999, "scene shows the approved art at canvas resolution");

    // The capture is a deterministic state (238 steps of 1/60 s from the
    // seed, see test_2_capture), so render it here and compare the whole
    // scene: covers the incremental tile copy, not just the background.
    const s = Fire.createState();
    for (let i = 0; i < 238; i++) Fire.update(s, 1 / 60);
    const fb = Fire.createFrame();
    Fire.render(fb, s, bg);
    same = 0; n = 0;
    for (let cy = 0; cy < 240; cy++) for (let cx = 0; cx < 360; cx++) {
      const gx = Math.floor((1 + (cx + 0.5) * 388 / 360) * scale), gy = Math.floor((38 + (cy + 0.5) * 259 / 240) * scale);
      const gi = (gy * grab.width + gx) * 4, bi = (cy * 360 + cx) * 4;
      n++;
      if (Math.abs(grab.data[gi] - fb[bi]) <= 1 && Math.abs(grab.data[gi + 1] - fb[bi + 1]) <= 1 && Math.abs(grab.data[gi + 2] - fb[bi + 2]) <= 1) same++;
    }
    console.log(`# ${scale}x whole scene: ${(100 * same / n).toFixed(2)}% of canvas pixels match fire.js at the same state`);
    assert.ok(same / n > 0.999, "the native scene shows exactly the fire.js frame");

    // tst_lifecycle.qml: after the window hides and shows, the scene moves
    // window, or the canvas is rebuilt around the same fire, every pixel of
    // the scene must still be the fire.js frame (not just the parts that
    // animate). Grabs are of the scene item alone.
    const cases = [["first", 238], ["reshow", 250], ["reshow2", 262], ["moved", 274], ["rebuilt", 286], ["redecoded", 292], ["rebuilt-hidden", 298], ["released", 310]];
    for (const [name, steps] of cases) {
      const shot = readRGBA(path.join(OUT, `life-${name}-${scale}x.png`));
      assert.equal(shot.width, 388 * scale, `life-${name} width`);
      const st = Fire.createState();
      for (let i = 0; i < steps; i++) Fire.update(st, 1 / 60);
      Fire.render(fb, st, bg);
      let ok = 0, total = 0, worst = 0;
      for (let cy = 0; cy < 240; cy++) for (let cx = 0; cx < 360; cx++) {
        const gx = Math.floor((cx + 0.5) * 388 / 360 * scale), gy = Math.floor((cy + 0.5) * 259 / 240 * scale);
        const gi = (gy * shot.width + gx) * 4, bi = (cy * 360 + cx) * 4;
        const d = Math.max(Math.abs(shot.data[gi] - fb[bi]), Math.abs(shot.data[gi + 1] - fb[bi + 1]), Math.abs(shot.data[gi + 2] - fb[bi + 2]));
        total++;
        if (d <= 1) ok++;
        if (d > worst) worst = d;
      }
      console.log(`# ${scale}x lifecycle ${name}: ${(100 * ok / total).toFixed(2)}% of canvas pixels match fire.js (worst ${worst})`);
      assert.ok(ok / total > 0.999, `scene after "${name}" shows the whole fire.js frame`);
    }
  });
}

function has(bin) { try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch (e) { return false; } }

test("omarchy plugin validate", { skip: !has("omarchy") && "omarchy not installed" }, () => {
  const r = spawnSync("omarchy", ["plugin", "validate", ROOT], { encoding: "utf8" });
  assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
});
