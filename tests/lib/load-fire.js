// Loads ui/fire.js (a QML `.pragma library` file) into node.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FIRE_JS = path.join(__dirname, "..", "..", "ui", "fire.js");

function loadFire() {
  const source = fs.readFileSync(FIRE_JS, "utf8").replace(/^\.pragma library\s*$/m, "");
  const module = { exports: {} };
  const context = vm.createContext({ module, Math, JSON, Uint8ClampedArray, isFinite, parseInt });
  vm.runInContext(source, context, { filename: FIRE_JS });
  return module.exports;
}

module.exports = { loadFire, FIRE_JS };
