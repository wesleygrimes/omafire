.pragma library
// OmaFire core: simulation and a software framebuffer renderer ported from the
// approved browser reference (reference/animation.js in the handoff). Plain
// JavaScript with no QML or DOM dependencies, so the shell loads it as a
// library and node loads it in tests (tests/lib/load-fire.js).
//
// Every number, colour, and the order of random draws match the reference.
// Native additions are marked "native:".

var W = 360, H = 240, BASE_X = 181, BASE_Y = 187;
var SEED = 5919;
var DT_CAP = 0.08;
var FUEL_DECAY = 0.00125, BOOST_DECAY = 0.45, HEAT_RATE = 0.75, FUEL_FLOOR = 0.015;
var LOG_FUEL = 0.25, FLIGHT_SECONDS = 0.7, TOAST_SECONDS = 2.2;
// native: bounds for rapid input; not part of the reference.
var SPARK_CAP = 160, SMOKE_CAP = 40;
// native: a wall-clock gap longer than this is applied analytically once.
var GAP_SECONDS = 1.0;
// native: absences longer than this restore straight to Resting.
var LONG_ABSENCE_SECONDS = 6 * 3600;

var MESSAGES = {
    addLog: "Fresh wood. Give it a moment.",
    addLogFull: "A good, roaring fire.",
    drop: "That’ll keep it going.",
    stoke: "The coals come alive.",
    poke: "A little shower of sparks.",
    stokeEmpty: "Add a log to get it going.",
    soundUnavailable: "Sound unavailable."
};
var HINT = "Drag wood onto the fire · Tap coals for sparks";

function hex(c) {
    return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
}
var C = {
    star: hex("#a6c3de"), smoke: hex("#b6aeb3"),
    f0: hex("#fff0a7"), f1: hex("#ffd36e"), f2: hex("#ffae3c"), f3: hex("#f37828"), f4: hex("#d5471d"), f5: hex("#91341f"),
    e0: hex("#ffc05b"), e1: hex("#db6328"), e2: hex("#733021"),
    sparkHot: hex("#ffe39a"), sparkCool: hex("#d67c32"),
    drop: hex("#e6b568"), light: [255, 118, 24], empty: hex("#0b1522"),
    log0: hex("#211a13"), log1: hex("#74472b"), log2: hex("#a46e3b"), log3: hex("#3e2c21"),
    log4: hex("#503323"), log5: hex("#bc8a52"), log6: hex("#5e3c27")
};
// drawLog's rectangles, in order: [x, y, w, h, colour]
var LOG_RECTS = [
    [-19, -5, 36, 11, C.log0], [-19, -5, 34, 3, C.log1], [-18, -5, 33, 1, C.log2], [-17, 0, 30, 2, C.log3],
    [-15, 4, 28, 2, C.log4], [14, -4, 6, 9, C.log5], [16, -2, 2, 5, C.log6]
];

// ---------------------------------------------------------------- randomness

function rand(s) {
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
    return s.seed / 4294967296;
}

function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function noise(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ---------------------------------------------------------------- state

function createState() {
    var s = {
        seed: SEED, fuel: 0.68, heat: 0.68, boost: 0, elapsed: 0,
        stars: [], embers: [], sparks: [], smoke: [],
        flight: null, drag: null,
        toastText: "", toastUntil: 0, toastShown: false
    };
    var i;
    for (i = 0; i < 16; i++) {
        var sx = 50 + rand(s) * 260, sy = 5 + rand(s) * 45, sp = rand(s) * 9;
        s.stars.push({ x: sx, y: sy, p: sp });
    }
    for (i = 0; i < 75; i++) {
        var ex = BASE_X + (rand(s) - 0.5) * 52, ey = BASE_Y - 2 + rand(s) * 7, ep = rand(s) * 7, es = rand(s) > 0.8 ? 2 : 1;
        s.embers.push({ x: ex, y: ey, p: ep, s: es });
    }
    return s;
}

function toast(s, text) {
    s.toastText = text;
    s.toastUntil = s.elapsed + TOAST_SECONDS;
    s.toastShown = true;
}

function capList(list, cap) {
    if (list.length > cap) list.splice(0, list.length - cap);
}

function burst(s, n, power) {
    if (power === undefined) power = 1;
    for (var i = 0; i < n; i++) {
        var x = BASE_X + (rand(s) - 0.5) * 35, y = BASE_Y - 5 - rand(s) * 9;
        var vx = (rand(s) - 0.5) * 21 * power, vy = -(17 + rand(s) * 41) * power;
        var life = 1 + rand(s) * 2, size = rand(s) > 0.8 ? 2 : 1;
        s.sparks.push({ x: x, y: y, vx: vx, vy: vy, life: life, age: 0, s: size });
    }
    capList(s.sparks, SPARK_CAP);
}

function addLog(s) {
    s.fuel = Math.min(1, s.fuel + LOG_FUEL);
    s.boost = Math.max(s.boost, 0.35);
    s.flight = { age: 0, fromX: 36, fromY: 177 };
    burst(s, 24);
    var text = s.fuel > 0.95 ? MESSAGES.addLogFull : MESSAGES.addLog;
    toast(s, text);
    return text;
}

function stoke(s) {
    if (s.fuel < FUEL_FLOOR) {
        toast(s, MESSAGES.stokeEmpty);
        return MESSAGES.stokeEmpty;
    }
    s.boost = 1.1;
    s.heat = Math.min(1, s.heat + 0.15);
    burst(s, 48, 1.5);
    toast(s, MESSAGES.stoke);
    return MESSAGES.stoke;
}

function poke(s) {
    burst(s, 32, 1.2);
    s.boost = Math.max(s.boost, 0.22);
    toast(s, MESSAGES.poke);
    return MESSAGES.poke;
}

// ---------------------------------------------------------------- pointer

function inWoodpile(x, y) { return x < 88 && y > 142; }
function onCoals(x, y) { return Math.hypot(x - BASE_X, y - (BASE_Y - 6)) < 59; }
function inHearth(x, y) { return Math.hypot(x - BASE_X, y - (BASE_Y - 6)) < 65; }

// Returns "drag", "poke", or "" like the reference pointerdown handler.
function pointerDown(s, x, y) {
    if (inWoodpile(x, y)) { s.drag = { x: x, y: y }; return "drag"; }
    if (onCoals(x, y)) { poke(s); return "poke"; }
    return "";
}

function pointerMove(s, x, y) {
    if (!s.drag) return false;
    s.drag.x = x; s.drag.y = y;
    return true;
}

// Returns true when the log landed in the hearth.
function pointerUp(s, x, y) {
    if (!s.drag) return false;
    var landed = inHearth(x, y);
    if (landed) {
        s.fuel = Math.min(1, s.fuel + LOG_FUEL);
        s.boost = 0.45;
        burst(s, 40);
        toast(s, MESSAGES.drop);
        s.flight = { age: 0.48, fromX: x, fromY: y };
    }
    s.drag = null;
    return landed;
}

function pointerCancel(s) { s.drag = null; }

function cursorFor(s, x, y) {
    if (s.drag) return "grabbing";
    return inWoodpile(x, y) ? "grab" : "default";
}

// ---------------------------------------------------------------- time

// The reference update(dt), minus the accelerated preview mode.
function update(s, dt) {
    s.elapsed += dt;
    s.boost = Math.max(0, s.boost - dt * BOOST_DECAY);
    s.fuel = Math.max(0, s.fuel - dt * FUEL_DECAY);
    s.heat += (Math.max(0, s.fuel - FUEL_FLOOR) - s.heat) * Math.min(1, dt * HEAT_RATE);
    if (s.heat > 0.03 && rand(s) < dt * 14 * s.heat) burst(s, 1);
    if (s.heat > 0.03 && rand(s) < dt * 4) {
        var x = BASE_X + (rand(s) - 0.5) * 14, life = 4 + rand(s) * 2, p = rand(s) * 5;
        s.smoke.push({ x: x, y: BASE_Y - 18, age: 0, life: life, p: p });
        capList(s.smoke, SMOKE_CAP);
    }
    var i, p2, keep = [];
    for (i = 0; i < s.sparks.length; i++) {
        p2 = s.sparks[i];
        p2.age += dt;
        p2.x += p2.vx * dt + Math.sin(p2.age * 4) * dt * 5;
        p2.y += p2.vy * dt;
        p2.vy += dt * 3;
        if (p2.age < p2.life) keep.push(p2);
    }
    s.sparks = keep;
    keep = [];
    for (i = 0; i < s.smoke.length; i++) {
        p2 = s.smoke[i];
        p2.age += dt;
        p2.y -= dt * 14;
        p2.x += Math.sin(p2.age * 2 + p2.p) * dt * 7;
        if (p2.age < p2.life) keep.push(p2);
    }
    s.smoke = keep;
    if (s.flight) { s.flight.age += dt; if (s.flight.age > FLIGHT_SECONDS) s.flight = null; }
    if (s.elapsed > s.toastUntil) s.toastShown = false;
}

// native: closed-form fuel/heat/boost over `seconds` with no particles. The
// heat step heat += (target - heat) * dt * 0.75 is Euler for
// h' = 0.75 (target - h); with target falling linearly this solves exactly.
function advanceAnalytic(s, seconds, keepClock) {
    if (!(seconds > 0)) return;
    var k = FUEL_DECAY, c = HEAT_RATE;
    var f0 = s.fuel, h = s.heat;
    var t1 = f0 > FUEL_FLOOR ? Math.min(seconds, (f0 - FUEL_FLOOR) / k) : 0;
    if (t1 > 0) {
        var g0 = f0 - FUEL_FLOOR, g1 = g0 - k * t1;
        h = g1 + k / c + (h - g0 - k / c) * Math.exp(-c * t1);
    }
    var t2 = seconds - t1;
    if (t2 > 0) h = h * Math.exp(-c * t2);
    s.fuel = Math.max(0, f0 - k * seconds);
    s.heat = Math.min(1, Math.max(0, h));
    s.boost = Math.max(0, s.boost - seconds * BOOST_DECAY);
    if (!keepClock) s.elapsed += seconds;
    // Particles do not catch up; anything older than its life is gone.
    var i, keep = [];
    for (i = 0; i < s.sparks.length; i++) if (s.sparks[i].age + seconds < s.sparks[i].life) keep.push(s.sparks[i]);
    if (seconds > 0.25) keep = [];
    s.sparks = keep;
    if (seconds > 0.25) s.smoke = [];
    if (s.flight && s.flight.age + seconds > FLIGHT_SECONDS) s.flight = null;
    if (s.elapsed > s.toastUntil) s.toastShown = false;
}

// native: advance by a measured wall-clock delta. Particles step with the
// reference cap of 0.08 s; any remainder (a slow frame, a closed popup, a
// suspend) is applied analytically so fuel follows the wall clock.
function tick(s, wallSeconds, particles) {
    if (!(wallSeconds > 0)) return;
    if (!particles || wallSeconds > GAP_SECONDS) {
        advanceAnalytic(s, wallSeconds);
        return;
    }
    var dt = Math.min(DT_CAP, wallSeconds);
    update(s, dt);
    if (wallSeconds > dt) advanceAnalytic(s, wallSeconds - dt);
}

// ---------------------------------------------------------------- status

var STATUS = [
    { key: "stoking", label: "Stoking the fire" },
    { key: "roaring", label: "Roaring warmly" },
    { key: "steady", label: "Burning steadily" },
    { key: "settling", label: "Settling into coals" },
    { key: "embers", label: "Glowing embers" },
    { key: "resting", label: "Resting" }
];

function statusIndex(s) {
    return s.boost > 0.5 ? 0 : s.heat > 0.78 ? 1 : s.heat > 0.3 ? 2 : s.heat > 0.08 ? 3 : s.fuel > 0.01 ? 4 : 5;
}

function status(s) {
    var st = STATUS[statusIndex(s)];
    var filled = st.key !== "resting";
    return { key: st.key, label: st.label, filled: filled, text: (filled ? "● " : "○ ") + st.label };
}

// ---------------------------------------------------------------- persistence

function serialize(s, nowMs) {
    return JSON.stringify({ version: 1, fuel: s.fuel, heat: s.heat, savedAt: Math.round(nowMs) });
}

function unit(v) { return typeof v === "number" && isFinite(v) && v >= 0 && v <= 1; }

// Returns { state, restored, reason, away }. Anything unreadable starts the
// default fire; a clock that ran backwards counts as no time away.
function restore(text, nowMs) {
    var s = createState();
    var o = null;
    try { o = JSON.parse(text); } catch (e) { return { state: s, restored: false, reason: "corrupt", away: 0 }; }
    if (!o || typeof o !== "object" || !unit(o.fuel) || !unit(o.heat)
        || typeof o.savedAt !== "number" || !isFinite(o.savedAt))
        return { state: s, restored: false, reason: "invalid", away: 0 };
    var away = Math.max(0, (nowMs - o.savedAt) / 1000);
    s.fuel = o.fuel;
    s.heat = o.heat;
    if (away > LONG_ABSENCE_SECONDS) {
        s.fuel = 0; s.heat = 0;
    } else {
        advanceAnalytic(s, away, true);
    }
    return { state: s, restored: true, reason: "", away: away };
}

// ---------------------------------------------------------------- framebuffer
//
// RGBA, 360 x 240, opaque. Blending follows canvas 2D: source-over with the
// fill alpha times globalAlpha, and the separable 'screen' blend for the light
// pool.

function createFrame() { return new Uint8ClampedArray(W * H * 4); }

// Nearest sampling of an RGBA source onto 360 x 240, like drawImage with
// imageSmoothingEnabled = false (sample at destination pixel centres).
function prepareBackground(src, sw, sh) {
    var out = new Uint8ClampedArray(W * H * 4);
    for (var y = 0; y < H; y++) {
        var sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / H));
        for (var x = 0; x < W; x++) {
            var sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / W));
            var si = (sy * sw + sx) * 4, di = (y * W + x) * 4;
            out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = 255;
        }
    }
    return out;
}

function blend(fb, i, c, a) {
    if (a >= 1) { fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2]; return; }
    var ia = 1 - a;
    fb[i] = c[0] * a + fb[i] * ia;
    fb[i + 1] = c[1] * a + fb[i + 1] * ia;
    fb[i + 2] = c[2] * a + fb[i + 2] * ia;
}

function fillRect(fb, x, y, w, h, c, a) {
    if (a <= 0) return;
    var x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
    for (var yy = y0; yy < y1; yy++) for (var xx = x0; xx < x1; xx++) blend(fb, (yy * W + xx) * 4, c, a);
}

// Fractional axis-aligned rectangle with per-pixel area coverage.
function fillRectAA(fb, x0, y0, x1, y1, c, a) {
    var px0 = Math.max(0, Math.floor(x0)), py0 = Math.max(0, Math.floor(y0));
    var px1 = Math.min(W, Math.ceil(x1)), py1 = Math.min(H, Math.ceil(y1));
    for (var y = py0; y < py1; y++) {
        var cy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (cy <= 0) continue;
        for (var x = px0; x < px1; x++) {
            var cx = Math.min(x + 1, x1) - Math.max(x, x0);
            if (cx > 0) blend(fb, (y * W + x) * 4, c, a * cx * cy);
        }
    }
}

// Rectangle under a rotation about (tx, ty), with 4 x 4 supersampled coverage
// standing in for the canvas's antialiased edges.
function fillRectRotated(fb, tx, ty, cos, sin, rx, ry, rw, rh, c, a) {
    var xs = [rx, rx + rw, rx + rw, rx], ys = [ry, ry, ry + rh, ry + rh];
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, i;
    for (i = 0; i < 4; i++) {
        var px = tx + xs[i] * cos - ys[i] * sin, py = ty + xs[i] * sin + ys[i] * cos;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    var x0 = Math.max(0, Math.floor(minX)), x1 = Math.min(W, Math.ceil(maxX));
    var y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H, Math.ceil(maxY));
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
        var hits = 0;
        for (var sy = 0; sy < 4; sy++) for (var sx = 0; sx < 4; sx++) {
            var dx = x + (sx + 0.5) / 4 - tx, dy = y + (sy + 0.5) / 4 - ty;
            var lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
            if (lx >= rx && lx < rx + rw && ly >= ry && ly < ry + rh) hits++;
        }
        if (hits) blend(fb, (y * W + x) * 4, c, a * hits / 16);
    }
}

function drawLog(fb, x, y, angle) {
    var tx = Math.round(x), ty = Math.round(y);
    var cos = Math.cos(angle || 0), sin = Math.sin(angle || 0);
    for (var i = 0; i < LOG_RECTS.length; i++) {
        var r = LOG_RECTS[i];
        if (!angle) fillRect(fb, tx + r[0], ty + r[1], r[2], r[3], r[4], 1);
        else fillRectRotated(fb, tx, ty, cos, sin, r[0], r[1], r[2], r[3], r[4], 1);
    }
}

// strokeRect with lineWidth 1, setLineDash([3, 3]), butt caps: the dash
// pattern runs continuously around the perimeter from the top-left corner.
function strokeDashedRect(fb, x, y, w, h, c, a) {
    var edges = [[x, y, 1, 0, w], [x + w, y, 0, 1, h], [x + w, y + h, -1, 0, w], [x, y + h, 0, -1, h]];
    var offset = 0;
    for (var e = 0; e < 4; e++) {
        var ed = edges[e], len = ed[4];
        for (var d = 0; d < len; d++) {
            var phase = (offset + d) % 6;
            if (phase >= 3) continue;
            var sx = ed[0] + ed[2] * d, sy = ed[1] + ed[3] * d;
            var ex = sx + ed[2], ey = sy + ed[3];
            var ax0 = Math.min(sx, ex), ax1 = Math.max(sx, ex), ay0 = Math.min(sy, ey), ay1 = Math.max(sy, ey);
            if (ed[3] === 0) fillRectAA(fb, ax0, ay0 - 0.5, ax1, ay0 + 0.5, c, a);
            else fillRectAA(fb, ax0 - 0.5, ay0, ax0 + 0.5, ay1, c, a);
        }
        offset += len;
    }
}

function drawFire(fb, s, t) {
    var heat = s.heat, boost = s.boost;
    var alive = Math.min(1, heat * 1.6);
    var flameH = (24 + heat * 46 + boost * 20) * alive, flameW = (17 + heat * 12 + boost * 5) * alive;
    var flick = 0.86 + Math.sin(t * 9) * 0.07 + Math.sin(t * 16.2) * 0.04;
    var x, y, i;
    // Warm light pool, 'screen' composite.
    var L = C.light;
    for (y = BASE_Y - 22; y < BASE_Y + 34; y += 3) for (x = BASE_X - 73; x < BASE_X + 74; x += 3) {
        var dx = (x - BASE_X) / 76, dy = (y - BASE_Y - 1) / 30;
        var d = dx * dx + dy * dy;
        var m = Math.max(0, 1 - d);
        var a = m * m * 0.19 * flick * alive;
        if (a > 0.004) {
            for (var yy = y; yy < y + 3 && yy < H; yy++) for (var xx = x; xx < x + 3 && xx < W; xx++) {
                i = (yy * W + xx) * 4;
                fb[i] = fb[i] + a * L[0] * (255 - fb[i]) / 255;
                fb[i + 1] = fb[i + 1] + a * L[1] * (255 - fb[i + 1]) / 255;
                fb[i + 2] = fb[i + 2] + a * L[2] * (255 - fb[i + 2]) / 255;
            }
        }
    }
    // Embers.
    var hotness = Math.min(1, heat * 3);
    for (i = 0; i < s.embers.length; i++) {
        var e = s.embers[i];
        var glow = (0.4 + 0.6 * Math.max(0, Math.sin(t * 1.4 + e.p))) * hotness;
        var col = glow > 0.6 ? C.e0 : glow > 0.3 ? C.e1 : C.e2;
        fillRect(fb, Math.floor(e.x), Math.floor(e.y), e.s, e.s, col, Math.min(1, 0.3 + glow));
    }
    if (flameH < 3) return;
    // Flame field.
    var yStart = Math.floor(BASE_Y - flameH);
    var xStart = Math.floor(BASE_X - flameW - 11), xEnd = BASE_X + flameW + 11;
    var t03 = t * 0.3, t33 = t * 3.3, t05 = t * 0.5, t58 = t * 5.8, t31 = t * 3.1, t2 = t * 2;
    for (y = yStart; y < BASE_Y + 1; y++) {
        var v = (BASE_Y - y) / flameH;
        if (v > 1) continue;
        var sway = Math.sin(v * 7 - t31) * v * 7 + Math.sin(v * 12 + t2) * v * 3;
        var taper = Math.pow(Math.max(0, 1 - v), 0.8);
        var ny1 = y * 0.12 + t33, ny2 = y * 0.31 + t58;
        if (y < 0 || y >= H) continue;
        for (x = xStart; x <= xEnd; x++) {
            var nx = (x - BASE_X - sway) / flameW;
            var n = noise(x * 0.19 + t03, ny1) * 0.65 + noise(x * 0.43 - t05, ny2) * 0.35;
            var edge = taper - Math.abs(nx) + (n - 0.5) * 0.85;
            if (edge <= 0.025) continue;
            var core = edge * 0.85 + (1 - v) * 0.28;
            var fc = core > 0.98 ? C.f0 : core > 0.78 ? C.f1 : core > 0.53 ? C.f2 : core > 0.31 ? C.f3 : core > 0.14 ? C.f4 : C.f5;
            if (x < 0 || x >= W) continue;
            blend(fb, (y * W + x) * 4, fc, edge < 0.09 ? 0.75 : 1);
        }
    }
    if (s.drag) strokeDashedRect(fb, BASE_X - 39, BASE_Y - 38, 78, 54, C.drop, 0.75);
}

// The reference draw(), into fb. bg is a prepared 360 x 240 RGBA buffer or
// null for the reference's fallback fill.
function render(fb, s, bg) {
    var i, p;
    if (bg) fb.set(bg);
    else fillRect(fb, 0, 0, W, H, C.empty, 1);
    var t = s.elapsed;
    for (i = 0; i < s.stars.length; i++) {
        var st = s.stars[i], sn = Math.sin(t * 0.7 + st.p);
        fillRect(fb, Math.floor(st.x), Math.floor(st.y), 1, 1, C.star, 0.25 + 0.4 * sn * sn);
    }
    for (i = 0; i < s.smoke.length; i++) {
        p = s.smoke[i];
        var r = 2 + p.age * 1.3;
        fillRect(fb, Math.floor(p.x), Math.floor(p.y), Math.round(r), Math.round(r * 1.8), C.smoke, 0.04 * Math.sin(Math.PI * p.age / p.life));
    }
    drawFire(fb, s, t);
    for (i = 0; i < s.sparks.length; i++) {
        p = s.sparks[i];
        fillRect(fb, Math.round(p.x), Math.round(p.y), p.s, p.s, p.age < 0.5 ? C.sparkHot : C.sparkCool, Math.max(0, 1 - p.age / p.life));
    }
    if (s.flight) {
        var pr = Math.min(1, s.flight.age / FLIGHT_SECONDS), ease = 1 - (1 - pr) * (1 - pr);
        drawLog(fb, s.flight.fromX + (BASE_X - s.flight.fromX) * ease,
            s.flight.fromY + (BASE_Y - s.flight.fromY) * ease - Math.sin(pr * Math.PI) * 45, pr * 0.4);
    }
    if (s.drag) drawLog(fb, s.drag.x, s.drag.y, -0.22);
}

// ---------------------------------------------------------------- bar icon
//
// native: a 12 x 12 pixel flame for the bar, using the same palette, the same
// noise, and the same status thresholds. Returns 144 entries of a palette
// index (0 = empty, 1..6 flame hot to cool, 7..9 embers, 10 log).
var ICON_SIZE = 12;
var ICON_COLORS = [null, "#fff0a7", "#ffd36e", "#ffae3c", "#f37828", "#d5471d", "#91341f", "#ffc05b", "#db6328", "#733021", "#74472b"];

function iconCells(heat, boost, fuel, t) {
    var N = ICON_SIZE, out = [], x, y;
    for (x = 0; x < N * N; x++) out.push(0);
    // Two short logs.
    for (x = 2; x < 10; x++) { out[11 * N + x] = 10; }
    var hot = Math.min(1, heat * 3);
    // Coals along the log.
    for (x = 3; x < 9; x++) {
        var g = (0.4 + 0.6 * Math.max(0, Math.sin(t * 1.4 + x * 1.7))) * hot;
        if (fuel > 0.01 || heat > 0.02) out[10 * N + x] = g > 0.6 ? 7 : g > 0.3 ? 8 : 9;
    }
    var alive = Math.min(1, heat * 1.6);
    var fh = (3 + heat * 5 + boost * 2) * alive, fw = (2.2 + heat * 1.6 + boost * 0.5) * alive;
    if (fh < 1.2) return out;
    var cx = 5.5, base = 10;
    for (y = 0; y < base; y++) {
        var v = (base - y) / fh;
        if (v > 1) continue;
        var sway = Math.sin(v * 5 - t * 3.1) * v * 0.9;
        for (x = 0; x < N; x++) {
            var nx = (x - cx - sway) / fw;
            var n = noise(x * 0.9 + t * 0.6, y * 0.7 + t * 3.3);
            var edge = Math.pow(Math.max(0, 1 - v), 0.8) - Math.abs(nx) + (n - 0.5) * 0.6;
            if (edge <= 0.05) continue;
            var core = edge * 0.85 + (1 - v) * 0.28;
            out[y * N + x] = core > 0.98 ? 1 : core > 0.78 ? 2 : core > 0.53 ? 3 : core > 0.31 ? 4 : core > 0.14 ? 5 : 6;
        }
    }
    return out;
}

// node: expose for tests (QML ignores this).
if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        W: W, H: H, BASE_X: BASE_X, BASE_Y: BASE_Y, SEED: SEED, DT_CAP: DT_CAP, SPARK_CAP: SPARK_CAP, SMOKE_CAP: SMOKE_CAP,
        GAP_SECONDS: GAP_SECONDS, LONG_ABSENCE_SECONDS: LONG_ABSENCE_SECONDS, MESSAGES: MESSAGES, HINT: HINT,
        rand: rand, hash: hash, noise: noise, createState: createState, burst: burst, addLog: addLog, stoke: stoke, poke: poke,
        inWoodpile: inWoodpile, onCoals: onCoals, inHearth: inHearth,
        pointerDown: pointerDown, pointerMove: pointerMove, pointerUp: pointerUp, pointerCancel: pointerCancel, cursorFor: cursorFor,
        update: update, advanceAnalytic: advanceAnalytic, tick: tick, status: status, statusIndex: statusIndex,
        serialize: serialize, restore: restore,
        createFrame: createFrame, prepareBackground: prepareBackground, render: render, drawLog: drawLog,
        iconCells: iconCells, ICON_SIZE: ICON_SIZE, ICON_COLORS: ICON_COLORS
    };
}
