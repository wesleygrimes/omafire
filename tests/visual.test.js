// Popup chrome against the reference: screenshot the approved fragment in
// headless Chromium at device scale 1 and 2, crop to the popup, compare the
// header and footer with the native grabs from tests/qml.test.js (which runs
// first), and write side-by-sides to tests/out/compare-{1,2}x.png.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { OUT, readRGBA, compare } = require("./lib/images");
const { chromium, writeHarness, dump, screenshot } = require("./lib/chrome");

const BIN = chromium();

test("popup chrome matches the reference at 1x and 2x", { skip: !BIN && "chromium not installed" }, () => {
  // Frame 238 is about 4 s in, like the native capture.
  const file = writeHarness("popup", { stopFrame: 238, scriptUntil: -1 });
  const info = dump(BIN, file);
  console.log(`# reference popup box: ${JSON.stringify(info.shell)}`);
  assert.equal(info.shell.width, 390);
  assert.ok(Math.abs(info.shell.height - 381) < 1, "reference popup is about 381 px tall");
  for (const scale of [1, 2]) {
    const shot = screenshot(BIN, file, path.join(OUT, "chrome", `page-${scale}x.png`), scale);
    const crop = path.join(OUT, `reference-popup-${scale}x.png`);
    const W = 390 * scale, H = 381 * scale;
    execFileSync("magick", [shot, "-crop", `${W}x${H}+${Math.round(info.shell.x * scale)}+${Math.round(info.shell.y * scale)}`, "+repage", crop]);
    const ours = path.join(OUT, `popup-${scale}x.png`);
    if (!fs.existsSync(ours)) { console.log(`# ${ours} missing; run tests/qml.test.js`); continue; }
    execFileSync("magick", [crop, "-size", `${12 * scale}x${H}`, "xc:#181818", ours, "+append", path.join(OUT, `compare-${scale}x.png`)]);
    const a = readRGBA(crop), b = readRGBA(ours);
    const header = compare(a.data, b.data, W, H, 24, (x, y) => y < 38 * scale);
    const footer = compare(a.data, b.data, W, H, 24, (x, y) => y >= 298 * scale);
    console.log(`# ${scale}x header: mean abs ${header.meanAbs.toFixed(2)}, ${(header.withinTol * 100).toFixed(2)}% within 24; ` +
      `footer: mean abs ${footer.meanAbs.toFixed(2)}, ${(footer.withinTol * 100).toFixed(2)}% within 24`);
    // Remaining differences: glyph antialiasing (Chromium vs Qt text), and the
    // reference's fractional scene height (258.67 px, here 259) which moves
    // its footer text by a fraction of a pixel.
    assert.ok(header.meanAbs < 4 && header.withinTol > 0.95, `${scale}x header`);
    assert.ok(footer.meanAbs < 4 && footer.withinTol > 0.94, `${scale}x footer`);
  }
});
