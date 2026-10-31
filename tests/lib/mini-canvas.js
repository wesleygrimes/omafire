// A small, independent canvas 2D emulator: just enough of the API that the
// reference animation.js uses (fillRect, strokeRect + setLineDash, drawImage,
// save/restore/translate/rotate, globalAlpha, 'screen' composite). It records
// every call and rasterizes into an RGBA buffer, so the original browser code
// can run in node and be compared with ui/fire.js.
"use strict";

function parseColor(style) {
  let m = /^#([0-9a-f]{6})$/i.exec(style);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([-\d.e]+)\s*\)$/i.exec(style);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  throw new Error("mini-canvas: unsupported colour " + style);
}

class MiniContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.ops = [];
    this.record = false;
    this._stack = [];
    this._reset();
  }
  _reset() {
    this.fillStyle = "#000000";
    this.strokeStyle = "#000000";
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
    this.imageSmoothingEnabled = true;
    this._dash = [];
    this._m = [1, 0, 0, 1, 0, 0]; // a b c d e f
  }
  save() {
    this._stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation, dash: this._dash.slice(), m: this._m.slice() });
  }
  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle; this.globalAlpha = s.globalAlpha;
    this.globalCompositeOperation = s.globalCompositeOperation; this._dash = s.dash; this._m = s.m;
  }
  translate(x, y) {
    const m = this._m;
    m[4] += m[0] * x + m[2] * y;
    m[5] += m[1] * x + m[3] * y;
  }
  rotate(t) {
    const m = this._m, c = Math.cos(t), s = Math.sin(t);
    const a = m[0] * c + m[2] * s, b = m[1] * c + m[3] * s, cc = m[0] * -s + m[2] * c, d = m[1] * -s + m[3] * c;
    m[0] = a; m[1] = b; m[2] = cc; m[3] = d;
  }
  setLineDash(d) { this._dash = d.slice(); }

  _px(i, col, a) {
    const D = this.data;
    if (this.globalCompositeOperation === "screen") {
      D[i] = D[i] + a * col.r * (255 - D[i]) / 255;
      D[i + 1] = D[i + 1] + a * col.g * (255 - D[i + 1]) / 255;
      D[i + 2] = D[i + 2] + a * col.b * (255 - D[i + 2]) / 255;
      return;
    }
    if (a >= 1) { D[i] = col.r; D[i + 1] = col.g; D[i + 2] = col.b; D[i + 3] = 255; return; }
    const ia = 1 - a;
    D[i] = col.r * a + D[i] * ia;
    D[i + 1] = col.g * a + D[i + 1] * ia;
    D[i + 2] = col.b * a + D[i + 2] * ia;
  }

  fillRect(x, y, w, h) {
    const col = parseColor(this.fillStyle), alpha = col.a * this.globalAlpha;
    if (this.record) this.ops.push(["fillRect", x, y, w, h, this.fillStyle, this.globalAlpha, this.globalCompositeOperation]);
    if (alpha <= 0) return;
    const m = this._m;
    const axisAligned = m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1;
    if (axisAligned) {
      const X = x + m[4], Y = y + m[5];
      const x0 = Math.max(0, X), y0 = Math.max(0, Y), x1 = Math.min(this.width, X + w), y1 = Math.min(this.height, Y + h);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this._px((yy * this.width + xx) * 4, col, alpha);
      return;
    }
    // General transform: 4 x 4 supersampled coverage through the inverse matrix.
    const det = m[0] * m[3] - m[1] * m[2];
    const inv = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([u, v]) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]);
    const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
    const bx0 = Math.max(0, Math.floor(Math.min(...xs))), bx1 = Math.min(this.width, Math.ceil(Math.max(...xs)));
    const by0 = Math.max(0, Math.floor(Math.min(...ys))), by1 = Math.min(this.height, Math.ceil(Math.max(...ys)));
    for (let py = by0; py < by1; py++) for (let px = bx0; px < bx1; px++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dx = px + (sx + 0.5) / 4 - m[4], dy = py + (sy + 0.5) / 4 - m[5];
        const u = inv[0] * dx + inv[2] * dy, v = inv[1] * dx + inv[3] * dy;
        if (u >= x && u < x + w && v >= y && v < y + h) hits++;
      }
      if (hits) this._px((py * this.width + px) * 4, col, alpha * hits / 16);
    }
  }

  // lineWidth 1, butt caps, axis-aligned only (what the reference uses).
  strokeRect(x, y, w, h) {
    const col = parseColor(this.strokeStyle), alpha = col.a * this.globalAlpha;
    if (this.record) this.ops.push(["strokeRect", x, y, w, h, this.strokeStyle, this.globalAlpha, this._dash.join(",")]);
    const X = x + this._m[4], Y = y + this._m[5];
    const dash = this._dash.length ? this._dash : [Infinity, 0];
    const period = dash.reduce((p, q) => p + q, 0);
    const pts = [[X, Y], [X + w, Y], [X + w, Y + h], [X, Y + h], [X, Y]];
    let dist = 0;
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = pts[e], [bx, by] = pts[e + 1];
      const len = Math.abs(bx - ax) + Math.abs(by - ay), ux = Math.sign(bx - ax), uy = Math.sign(by - ay);
      // Walk the edge in unit steps; each unit is either inside a dash or not.
      for (let s = 0; s < len; s++) {
        const ph = (dist + s) % period;
        if (!(ph < dash[0])) continue;
        const sx = ax + ux * s, sy = ay + uy * s, ex = sx + ux, ey = sy + uy;
        if (uy === 0) this._areaRect(Math.min(sx, ex), sy - 0.5, Math.max(sx, ex), sy + 0.5, col, alpha);
        else this._areaRect(sx - 0.5, Math.min(sy, ey), sx + 0.5, Math.max(sy, ey), col, alpha);
      }
      dist += len;
    }
  }
  _areaRect(x0, y0, x1, y1, col, alpha) {
    for (let py = Math.max(0, Math.floor(y0)); py < Math.min(this.height, Math.ceil(y1)); py++) {
      const cy = Math.min(py + 1, y1) - Math.max(py, y0);
      for (let px = Math.max(0, Math.floor(x0)); px < Math.min(this.width, Math.ceil(x1)); px++) {
        const cx = Math.min(px + 1, x1) - Math.max(px, x0);
        if (cx > 0 && cy > 0) this._px((py * this.width + px) * 4, col, alpha * cx * cy);
      }
    }
  }

  drawImage(img, dx, dy, dw, dh) {
    if (this.record) this.ops.push(["drawImage", dx, dy, dw, dh, this.imageSmoothingEnabled]);
    if (this.imageSmoothingEnabled) throw new Error("mini-canvas: only nearest drawImage is emulated");
    const src = img.pixels, sw = img.naturalWidth, sh = img.naturalHeight;
    // Pixel centres; exact ties go to the lower source pixel (Chromium).
    const pick = (i, s, d) => Math.max(0, Math.min(s - 1, Math.ceil((i + 0.5) * s / d - 1)));
    for (let y = 0; y < dh; y++) {
      const sy = pick(y, sh, dh);
      for (let x = 0; x < dw; x++) {
        const sx = pick(x, sw, dw);
        const si = (sy * sw + sx) * 4, di = ((y + dy) * this.width + x + dx) * 4;
        this.data[di] = src[si]; this.data[di + 1] = src[si + 1]; this.data[di + 2] = src[si + 2]; this.data[di + 3] = 255;
      }
    }
  }
}

module.exports = { MiniContext, parseColor };
