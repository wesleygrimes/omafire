#!/usr/bin/env node
// Measures OmaFire's CPU and memory in a running Quickshell: the popup open
// (20 fps scene) and closed (bar icon only). Opens two small windows in the
// current Wayland session for about a minute, then quits.
//
//   node scripts/measure.js [seconds-per-phase]
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "tests", "out", "perf", "config");
const SECONDS = Number(process.argv[2] || 20);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TICK = 100; // USER_HZ on Linux

function assemble() {
  fs.rmSync(CONFIG, { recursive: true, force: true });
  fs.mkdirSync(CONFIG, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "tests", "perf", "shell.qml"), path.join(CONFIG, "shell.qml"));
  fs.cpSync(path.join(ROOT, "ui"), path.join(CONFIG, "ui"), { recursive: true });
  fs.cpSync(path.join(ROOT, "assets"), path.join(CONFIG, "assets"), { recursive: true });
}

function ipc(fn) {
  return execFileSync("timeout", ["10", "qs", "ipc", "-p", CONFIG, "call", "omafire-perf", fn], { stdio: ["ignore", "pipe", "ignore"] }).toString();
}

function childOf(pid) {
  try {
    const kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim().split(/\s+/).filter(Boolean);
    return kids.length ? Number(kids[0]) : null;
  } catch (e) { return null; }
}

function sample(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const cpu = Number(f[11]) + Number(f[12]);
  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
  const rss = Number(/VmRSS:\s+(\d+)/.exec(status)[1]);
  return { cpu, rss, at: process.hrtime.bigint() };
}

async function phase(pid, name) {
  await sleep(3000);
  const a = sample(pid);
  await sleep(SECONDS * 1000);
  const b = sample(pid);
  const wall = Number(b.at - a.at) / 1e9;
  const pct = ((b.cpu - a.cpu) / TICK) / wall * 100;
  console.log(`${name}: ${pct.toFixed(1)}% of one core over ${wall.toFixed(0)} s, RSS ${(b.rss / 1024).toFixed(0)} MiB`);
  return { name, cpuPercent: pct, rssMiB: b.rss / 1024 };
}

(async () => {
  assemble();
  const t = spawn("timeout", [String(SECONDS * 2 + 40), "qs", "-p", CONFIG], { stdio: process.argv.includes("--log") ? "inherit" : "ignore" });
  let pid = null;
  for (let i = 0; i < 50 && !pid; i++) { await sleep(100); pid = childOf(t.pid); }
  if (!pid) throw new Error("quickshell did not start");
  for (let i = 0; i < 50; i++) { await sleep(100); try { ipc("open"); break; } catch (e) { /* starting */ } }
  const results = [];
  results.push(await phase(pid, "popup open (scene at 20 fps)"));
  ipc("close");
  results.push(await phase(pid, "popup closed (bar icon only)"));
  try { ipc("quit"); } catch (e) { t.kill(); }
  console.log(`cpu: ${os.cpus()[0].model}, ${os.cpus().length} threads`);
  fs.writeFileSync(path.join(ROOT, "tests", "out", "perf", "results.json"), JSON.stringify({ results, cpu: os.cpus()[0].model }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
