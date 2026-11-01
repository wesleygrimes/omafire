// Integration under real Quickshell: runs tests/integration/shell.qml (the
// real OmaFireBar + FireSession + FileView + IPC, with stand-ins for the
// host's qs.Ui and qs.Commons) and drives it with `qs ipc`, once against
// Omarchy 4.5's host API and once against 4.0.x's (no ShellIpc, no
// KeyboardPanel content slot, no Style.reduceMotion). Needs a Wayland
// session; skips without qs or WAYLAND_DISPLAY. Quickshell is always stopped
// (harness quit, then the timeout wrapper).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { ROOT, OUT } = require("./lib/images");

// Each host's stand-ins and the IPC route OmaFire should pick on it.
const HOSTS = [
  { name: "omarchy-4.5", route: "shell" },
  { name: "omarchy-4.0", route: "qs" },
];

let DIR, CONFIG, STATE;

// Quickshell resolves imports only inside its config directory, so assemble
// one: the harness, one host's stand-ins, and copies of ui/ and assets/.
function assemble(host) {
  DIR = path.join(OUT, "integration", host);
  CONFIG = path.join(DIR, "config");
  STATE = path.join(DIR, "state.json");
  fs.rmSync(CONFIG, { recursive: true, force: true });
  fs.mkdirSync(CONFIG, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "tests", "integration", "shell.qml"), path.join(CONFIG, "shell.qml"));
  fs.cpSync(path.join(ROOT, "tests", "integration", "hosts", host), CONFIG, { recursive: true });
  fs.cpSync(path.join(ROOT, "ui"), path.join(CONFIG, "ui"), { recursive: true });
  fs.cpSync(path.join(ROOT, "assets"), path.join(CONFIG, "assets"), { recursive: true });
}

function has(bin) { try { execFileSync("which", [bin], { stdio: "ignore" }); return true; } catch (e) { return false; } }
const skip = !has("qs") ? "quickshell not installed" : !process.env.WAYLAND_DISPLAY ? "no Wayland session" : false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ipc(target, fn, ...args) {
  return execFileSync("timeout", ["10", "qs", "ipc", "-p", CONFIG, "call", target, fn, ...args.map(String)],
    { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

async function launch(log) {
  const child = spawn("timeout", ["90", "qs", "-p", CONFIG], {
    env: { ...process.env, OMAFIRE_STATE: STATE }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", d => { output += d; });
  child.stderr.on("data", d => { output += d; });
  const exited = new Promise(r => child.on("exit", r));
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    try { if (ipc("omafire-harness", "widgets") === "2") break; } catch (e) { /* not up yet */ }
  }
  return {
    output: () => output,
    async stop() {
      try { ipc("omafire-harness", "quit"); } catch (e) { child.kill("SIGTERM"); }
      await Promise.race([exited, sleep(5000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
      fs.writeFileSync(path.join(DIR, log), output);
    },
  };
}

function qmlProblems(output) {
  return output.split("\n").filter(l => /\b(WARN|ERROR)\b/.test(l) && /qml|\.qml|omafire/i.test(l));
}

for (const host of HOSTS) test(`bar, session, persistence and IPC under Quickshell on ${host.name}`, { skip, timeout: 120000 }, async () => {
  assemble(host.name);
  // A save from 100 s ago at full fuel.
  const savedAt = Date.now() - 100000;
  fs.writeFileSync(STATE, JSON.stringify({ version: 1, fuel: 1, heat: 0.9, savedAt }));

  let qs = await launch("run1.log");
  try {
    assert.equal(ipc("omafire-harness", "widgets"), "2", "two bars registered");
    assert.equal(ipc("omafire-harness", "sameFire"), "true", "one fire shared by both bars");
    assert.equal(ipc("omafire-harness", "ipcRoute"), host.route, `IPC through the ${host.route} route on ${host.name}`);
    assert.equal(ipc("omafire-harness", "popupBuilt"), "false", "popup not built until first open");

    let st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.ok(Math.abs(st.fuel - (1 - 100 * 0.00125)) < 0.01, `restored fuel advanced by the 100 s away (${st.fuel})`);
    assert.equal(st.open, false);
    assert.equal(st.sound, false, "sound starts off");

    // Toggle from a bar button, then through IPC; only one popup at a time.
    ipc("omafire-harness", "press", 0);
    assert.equal(ipc("omafire-harness", "openOn"), "A");
    assert.equal(ipc("omafire-harness", "rendering"), "true", "scene runs while open");
    assert.equal(ipc("omafire-harness", "popupSize"), "390x381", "popup fills the panel card");
    ipc("omafire-harness", "press", 1);
    assert.equal(ipc("omafire-harness", "openOn"), "B", "opening on another monitor moves the popup");
    ipc("wesleygrimes.omafire", "close");
    assert.equal(ipc("omafire-harness", "openOn"), "");
    assert.equal(ipc("omafire-harness", "rendering"), "false", "scene stops when closed");
    ipc("wesleygrimes.omafire", "toggle");
    assert.notEqual(ipc("omafire-harness", "openOn"), "");
    st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.equal(st.open, true);
    ipc("wesleygrimes.omafire", "toggle");
    assert.equal(ipc("omafire-harness", "openOn"), "");

    // Actions through IPC.
    ipc("wesleygrimes.omafire", "stoke");
    st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.equal(st.status, "Stoking the fire");
    assert.ok(Math.abs(st.boost - 1.1) < 0.01);
    ipc("wesleygrimes.omafire", "poke");
    ipc("wesleygrimes.omafire", "addLog");
    st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.ok(st.fuel > 0.99, "add log caps at 1");

    await sleep(800); // debounced save
    const saved = JSON.parse(fs.readFileSync(STATE, "utf8"));
    assert.equal(saved.version, 1);
    assert.ok(Math.abs(saved.fuel - st.fuel) < 0.01, "actions are saved");
    assert.ok(Math.abs(saved.savedAt - Date.now()) < 5000);
  } finally {
    await qs.stop();
  }
  assert.deepEqual(qmlProblems(qs.output()), [], "no QML warnings or errors");

  // Corrupt state falls back to the default fire.
  fs.writeFileSync(STATE, "{ not json");
  qs = await launch("run2.log");
  try {
    const st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.equal(st.fuel, 0.68);
    assert.equal(st.status, "Burning steadily");
  } finally {
    await qs.stop();
  }
  assert.deepEqual(qmlProblems(qs.output()), []);

  // A week away: Resting.
  fs.writeFileSync(STATE, JSON.stringify({ version: 1, fuel: 1, heat: 1, savedAt: Date.now() - 7 * 86400e3 }));
  qs = await launch("run3.log");
  try {
    const st = JSON.parse(ipc("wesleygrimes.omafire", "status"));
    assert.equal(st.status, "Resting");
    assert.equal(st.fuel, 0);
  } finally {
    await qs.stop();
  }
});
