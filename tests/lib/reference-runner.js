// Runs the original browser reference (tests/reference/animation.js, the
// approved prototype's script with its inline image data removed) in node
// against mocked DOM elements and the MiniContext canvas emulator.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { MiniContext } = require("./mini-canvas");

const SOURCE = path.join(__dirname, "..", "reference", "animation.js");

function element(id) {
  const listeners = {};
  const classes = new Set();
  const attrs = {};
  return {
    id, textContent: "", style: {}, listeners,
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
    },
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: k => (k in attrs ? attrs[k] : null),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatch(type, ev) { for (const fn of listeners[type] || []) fn(ev || {}); },
  };
}

// Returns a controller: frame(nowMs) runs one animation frame, click(id),
// pointer(type, x, y) send input, ctx is the emulated canvas.
function createReference(background) {
  const ctx = new MiniContext(360, 240);
  const els = {};
  for (const id of ["of-scene", "of-message", "of-state", "of-add", "of-stoke", "of-sound", "of-toggle", "of-window", "of-cycle", "of-speed"]) els[id] = element(id);
  els["of-toggle"].setAttribute("aria-expanded", "true");
  const canvas = els["of-scene"];
  canvas.getContext = () => ctx;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 240 });
  canvas.setPointerCapture = () => {};
  const root = { isConnected: true, querySelector: sel => els[sel.replace(/^#/, "")] };
  let pending = null;
  class Image {
    constructor() {
      this.complete = !!background;
      this.naturalWidth = background ? background.width : 0;
      this.naturalHeight = background ? background.height : 0;
      this.pixels = background ? background.data : null;
    }
  }
  const sandbox = {
    document: { getElementById: () => root, hidden: false },
    window: { matchMedia: () => ({ matches: false }) },
    requestAnimationFrame: fn => { pending = fn; },
    Image, Math, String, Array, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SOURCE, "utf8"), sandbox, { filename: SOURCE });
  return {
    ctx, els,
    frame(now) { const fn = pending; pending = null; fn(now); },
    click(id) { els[id].dispatch("click"); },
    pointer(type, x, y) { canvas.dispatch(type, { clientX: x, clientY: y, pointerId: 1 }); },
    status: () => els["of-state"].textContent,
    toast: () => ({ text: els["of-message"].textContent, visible: els["of-message"].classList.contains("of-visible") }),
  };
}

module.exports = { createReference };
