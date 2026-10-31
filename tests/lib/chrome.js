// Drives the approved reference fragment in headless Chromium with a stubbed
// requestAnimationFrame, so frames are deterministic and comparable with
// ui/fire.js at the same simulated time.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, OUT } = require("./images");

function chromium() {
  for (const bin of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try { execFileSync("which", [bin], { stdio: "ignore" }); return bin; } catch (e) { /* next */ }
  }
  return null;
}

// Frame script shared with tests/parity.test.js: [frame, action, x, y].
const SCRIPT = [
  [40, "click", "of-add"],
  [90, "click", "of-stoke"],
  [150, "pointerdown", 40, 170],
];
for (let f = 151; f < 200; f++) SCRIPT.push([f, "pointermove", 40 + (f - 150) * 2.7, 170 + (f - 150) * 0.16]);
SCRIPT.push([200, "pointerup", 176, 178]);

function clockStep(frame) { return frame === 120 ? 140 : frame % 7 === 0 ? 21 : 16.6; }

// Builds the harness page. `captureFrames` lists frames whose canvas pixels are
// dumped into the DOM; `stopFrame` freezes the animation for screenshots.
function harness({ captureFrames = [], stopFrame = 60, scriptUntil = Infinity } = {}) {
  const webp = fs.readFileSync(path.join(ROOT, "assets", "campsite-approved.webp")).toString("base64");
  const fragment = fs.readFileSync(path.join(ROOT, "tests", "reference", "omafire-fragment.html"), "utf8")
    .replace("DATA_URL", "data:image/webp;base64," + webp);
  const script = SCRIPT.filter(s => s[0] <= scriptUntil);
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#181818}</style>
<script>
window.__raf = null;
window.requestAnimationFrame = fn => { window.__raf = fn; return 1; };
</script></head><body>${fragment}
<pre id="omafire-dump"></pre>
<script>
window.addEventListener('load', () => {
  const canvas = document.getElementById('of-scene');
  const ctx = canvas.getContext('2d');
  const script = ${JSON.stringify(script)};
  const capture = ${JSON.stringify(captureFrames)};
  const out = {};
  let now = 1000;
  const send = (type, x, y) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, { clientX: r.left + x * r.width / 360, clientY: r.top + y * r.height / 240, pointerId: 1, bubbles: true }));
  };
  for (let frame = 0; frame <= ${stopFrame}; frame++) {
    for (const s of script) if (s[0] === frame) {
      if (s[1] === 'click') document.getElementById(s[2]).click(); else send(s[1], s[2], s[3]);
    }
    now += (frame === 120 ? 140 : frame % 7 === 0 ? 21 : 16.6); // keep in sync with clockStep()
    const fn = window.__raf; window.__raf = null; if (fn) fn(now);
    if (capture.includes(frame)) out[frame] = Array.from(ctx.getImageData(0, 0, 360, 240).data, v => v.toString(16).padStart(2, '0')).join('');
  }
  const shell = document.getElementById('of-window').getBoundingClientRect();
  out.shell = { x: shell.x, y: shell.y, width: shell.width, height: shell.height };
  out.status = document.getElementById('of-state').textContent;
  out.toast = document.getElementById('of-message').textContent;
  document.getElementById('omafire-dump').textContent = JSON.stringify(out);
});
</script></body></html>`;
}

function writeHarness(name, opts) {
  const dir = path.join(OUT, "chrome");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + ".html");
  fs.writeFileSync(file, harness(opts));
  return file;
}

const FLAGS = ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb",
  "--disable-lcd-text", "--font-render-hinting=none", "--no-first-run", "--disable-extensions",
  "--allow-file-access-from-files", "--virtual-time-budget=4000"];

function dump(bin, file) {
  const html = execFileSync("timeout", ["90", bin, ...FLAGS, "--dump-dom", "file://" + file],
    { maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const m = /<pre id="omafire-dump">([^<]*)<\/pre>/.exec(html);
  if (!m) throw new Error("chromium produced no dump");
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}

// Same viewport for dump() and screenshot() so the popup box lines up.
const VIEWPORT = "--window-size=800,600";
FLAGS.push(VIEWPORT);

function screenshot(bin, file, png, scale) {
  execFileSync("timeout", ["90", bin, ...FLAGS, `--force-device-scale-factor=${scale}`,
    `--screenshot=${png}`, "file://" + file], { stdio: "ignore" });
  return png;
}

function hexToRGBA(hex) {
  const a = new Uint8ClampedArray(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
}

module.exports = { chromium, SCRIPT, clockStep, writeHarness, dump, screenshot, hexToRGBA };
