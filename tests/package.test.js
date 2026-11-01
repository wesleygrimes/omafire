// Package checks: the approved art is byte-identical, no symlinks, no
// machine paths in shipped code, a manifest the host registry accepts.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ROOT } = require("./lib/images");

const APPROVED_SHA256 = "365ebe7720cdb95261c54f002a56b78eeba98bfb5d68c456b3cf6c71b00e9c3f";

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === ".git" || (dir === ROOT && name === "tests")) continue;
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    out.push({ p, st });
    if (st.isDirectory()) walk(p, out);
  }
  return out;
}

test("approved campsite art is unchanged", () => {
  const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "assets", "campsite-approved.webp"))).digest("hex");
  assert.equal(sha, APPROVED_SHA256);
});

test("no symlinks in the plugin", () => {
  const links = walk(ROOT).filter(e => e.st.isSymbolicLink()).map(e => path.relative(ROOT, e.p));
  assert.deepEqual(links, []);
});

test("no absolute machine paths in shipped code", () => {
  const bad = [];
  for (const { p, st } of walk(path.join(ROOT, "ui"))) {
    if (!st.isFile()) continue;
    const text = fs.readFileSync(p, "utf8");
    if (/\/home\/|\/workspace\b|\/usr\/share\/omarchy/.test(text)) bad.push(path.relative(ROOT, p));
  }
  assert.deepEqual(bad, []);
});

test("manifest matches the host registry's rules", () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  // Mirrors PluginRegistry.validateManifest in Omarchy 4.0.
  assert.equal(m.schemaVersion, 1);
  for (const k of ["id", "name", "version", "kinds", "entryPoints"]) assert.ok(m[k] !== undefined, k);
  assert.equal(m.id, "wesleygrimes.omafire");
  assert.ok(!m.id.startsWith("omarchy."), "third-party ids avoid the omarchy namespace");
  assert.deepEqual(m.kinds, ["bar-widget"]);
  for (const [k, v] of Object.entries(m.entryPoints)) {
    assert.ok(typeof v === "string" && v && !v.startsWith("/") && !v.includes(".."), `entry point ${k}`);
    assert.ok(fs.existsSync(path.join(ROOT, v)), `${v} exists`);
  }
  assert.ok(["left", "centerBegin", "center", "centerEnd", "tray", "right"].includes(m.barWidget.defaultSection));
  assert.equal(m.barWidget.allowMultiple, false);
  assert.equal(m.name, "OmaFire");
  assert.equal(m.version, "0.2.0");
  assert.equal(m.license, "MIT");
  assert.ok(fs.existsSync(path.join(ROOT, "LICENSE")));
  assert.ok(fs.existsSync(path.join(ROOT, "preview.png")), "marketplace preview");
});

test("crackle loop is small, mono, and regenerates byte for byte", () => {
  const wav = fs.readFileSync(path.join(ROOT, "assets", "crackle.wav"));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 1, "mono");
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.ok(wav.length < 300 * 1024);
  const { execFileSync } = require("child_process");
  const tmp = path.join(ROOT, "tests", "out", "crackle-regen.wav");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  execFileSync("python3", [path.join(ROOT, "scripts", "gen-crackle.py"), tmp], { stdio: "ignore" });
  assert.ok(fs.readFileSync(tmp).equals(wav), "scripts/gen-crackle.py reproduces assets/crackle.wav");
  // Seamless: the last sample flows into the first like neighbouring samples do.
  const n = (wav.length - 44) / 2, s = i => wav.readInt16LE(44 + i * 2);
  let maxStep = 0;
  for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, Math.abs(s(i) - s(i - 1)));
  assert.ok(Math.abs(s(0) - s(n - 1)) <= maxStep, "loop seam is no bigger than any step inside the loop");
});

test("night calls are short, quiet, and regenerate byte for byte", () => {
  const { execFileSync } = require("child_process");
  const tmp = path.join(ROOT, "tests", "out", "night-regen");
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync("python3", [path.join(ROOT, "scripts", "gen-night.py"), tmp], { stdio: "ignore" });
  for (const name of ["cricket.wav", "peep.wav", "croak.wav"]) {
    const wav = fs.readFileSync(path.join(ROOT, "assets", name));
    assert.equal(wav.toString("ascii", 0, 4), "RIFF", name);
    assert.equal(wav.readUInt16LE(22), 1, `${name} mono`);
    assert.equal(wav.readUInt32LE(24), 22050, name);
    assert.equal(wav.readUInt16LE(34), 16, name);
    const samples = (wav.length - 44) / 2;
    assert.ok(samples / 22050 < 0.4, `${name} is one call, not a loop`);
    assert.ok(samples / 22050 > 0.08, `${name} is long enough to read as a call`);
    let peak = 0;
    for (let i = 0; i < samples; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(44 + i * 2)));
    assert.ok(peak > 1000 && peak < 16000, `${name} peak ${peak} stays soft in the file`);
    assert.equal(wav.readInt16LE(44 + (samples - 1) * 2), 0, `${name} ends in silence`);
    assert.ok(fs.readFileSync(path.join(tmp, name)).equals(wav), `scripts/gen-night.py reproduces assets/${name}`);
  }
});
