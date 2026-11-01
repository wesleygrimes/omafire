#!/usr/bin/env python3
"""Generate OmaFire's fire sound: three loops that FireAudio mixes by heat,
and two one-shots for adding a log and stoking.

    assets/fire-embers.wav   low flame flutter and a few quiet snaps (6.1 s)
    assets/fire-crackle.wav  the steady fire: snaps, short runs, rare pops (9.1 s)
    assets/fire-roar.wav     a hot fire: deeper rumble, flame whoosh, more snaps (11.7 s)
    assets/fire-log.wav      a log lands: a dull knock, then it catches (2.6 s)
    assets/fire-stoke.wav    a stoke: a rising whoosh and a few sparks (2.2 s)

The loops have different lengths so the mix doesn't repeat audibly. A snap
is a soft-onset noise burst through two broad, woody bands (no pitch, no
electrical click), and the crackles come in flurries with calm between them
rather than at a steady rate. Everything is darkened at 5 kHz.

Mono 16-bit at 22.05 kHz. Fixed seeds, so the files regenerate byte for byte.

    python3 scripts/gen-fire.py [directory]
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050
DARKEN = 5000


def onepole(buf, f, high):
    a = math.exp(-2 * math.pi * f / RATE)
    out, y = [0.0] * len(buf), 0.0
    for k, x in enumerate(buf):
        y = (1 - a) * x + a * y
        out[k] = x - y if high else y
    return out


def biquad_lp(samples, f, q=0.7071):
    w0 = 2 * math.pi * f / RATE
    alpha = math.sin(w0) / (2 * q)
    c = math.cos(w0)
    b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    a0, a1, a2 = 1 + alpha, -2 * c, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    out = [0.0] * len(samples)
    x1 = x2 = y1 = y2 = 0.0
    for i, x in enumerate(samples):
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out[i] = y
    return out


def slow_curve(rng, n, step_s, lo, hi):
    step = max(1, int(RATE * step_s))
    pts = [lo + (hi - lo) * rng.random() for _ in range(n // step + 3)]
    out = [0.0] * n
    for i in range(n):
        k, f = divmod(i, step)
        t = (1 - math.cos(math.pi * f / step)) / 2
        out[i] = pts[k] * (1 - t) + pts[k + 1] * t
    return out


def bandpass(samples, f, q):
    w0 = 2 * math.pi * f / RATE
    alpha = math.sin(w0) / (2 * q)
    c = math.cos(w0)
    a0 = 1 + alpha
    b0, b2, a1, a2 = alpha / a0, -alpha / a0, -2 * c / a0, (1 - alpha) / a0
    out = [0.0] * len(samples)
    x1 = x2 = y1 = y2 = 0.0
    for i, x in enumerate(samples):
        y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out[i] = y
    return out


def snap(rng, mix, at, amp, size):
    """One wood snap. size 0..1: small ones are short and higher, big ones
    ring longer, lower, with a little knock under them. A soft onset and a
    5-25 ms decay through two broad woody bands, so it reads as wood, not
    as an electrical click."""
    decay = 0.005 + 0.018 * size * rng.uniform(0.7, 1.3)
    m = int(RATE * decay * 5)
    src = [0.0] * m
    att = RATE * 0.0012
    for k in range(m):
        env = min(1.0, k / att) * math.exp(-k / (RATE * decay))
        src[k] = (rng.random() * 2 - 1) * env
    f1 = rng.uniform(900, 1900) * (1 - 0.4 * size)
    f2 = rng.uniform(2000, 3200) * (1 - 0.3 * size)
    out = bandpass(src, f1, 1.3)
    hi = bandpass(src, f2, 1.6)
    knock = bandpass(src, rng.uniform(260, 480), 1.2) if size > 0.45 else None
    for k in range(m):
        s = out[k] * 1.0 + hi[k] * 0.25
        if knock:
            s += knock[k] * 1.4 * size
        j = at + k
        if j < len(mix):
            mix[j] += s * amp * 2.2


def cluster(rng, mix, at, amp, dur_ms, density, lp=None, hp=None):
    """A crackle event: one snap, or a short run of separate snaps."""
    size = min(1.0, amp * rng.uniform(0.6, 1.1))
    snap(rng, mix, at, amp, size)
    if dur_ms > 3:
        t = rng.uniform(0.008, 0.03)
        while t < dur_ms / 1000:
            x = t / (dur_ms / 1000)
            snap(rng, mix, at + int(t * RATE), amp * (1 - x) * rng.uniform(0.3, 0.9), size * rng.uniform(0.3, 0.8))
            t += rng.uniform(0.01, 0.04)


def crackle_events(rng, mix, rate_lo, rate_hi, amp_scale, mix_kinds, pops_every=None, step=1.6, burst_pow=4):
    total = len(mix)
    activity = slow_curve(rng, total, step, 0.0, 1.0)
    t = 0.0
    while True:
        i = min(total - 1, int(t * RATE))
        t += rng.expovariate(rate_lo + (rate_hi - rate_lo) * activity[i] ** burst_pow)
        i = int(t * RATE)
        if i >= total:
            break
        amp = min(0.6, 0.09 * rng.random() ** -0.45) * amp_scale
        lp, hp = rng.uniform(3500, 10000), rng.uniform(250, 1400)
        r = rng.random()
        tick, crrk = mix_kinds
        if r < tick:
            cluster(rng, mix, i, amp, rng.uniform(0, 2), 2000, lp, hp)
        elif r < tick + crrk:
            cluster(rng, mix, i, amp, rng.uniform(10, 70), rng.uniform(350, 1100), lp, hp)
        else:
            cluster(rng, mix, i, amp * 0.3, rng.uniform(80, 220), 0)
    if pops_every:
        t = rng.uniform(0.5, pops_every[0])
        while t < total / RATE - 0.3:
            i = int(t * RATE)
            pop(rng, mix, i, amp_scale)
            t += rng.uniform(*pops_every)


def texture(rng, mix, rate, amp):
    """The quiet bed of tiny, dark snaps a burning log makes all the time,
    so the bigger ones sit inside it instead of popping out of silence."""
    total = len(mix)
    t = 0.0
    while True:
        t += rng.expovariate(rate)
        i = int(t * RATE)
        if i >= total:
            break
        snap(rng, mix, i, amp * rng.uniform(0.3, 1.0), rng.uniform(0.0, 0.25))


def pop(rng, mix, i, scale=1.0):
    snap(rng, mix, i, 0.6 * scale, 1.0)
    cluster(rng, mix, i + int(RATE * rng.uniform(0.02, 0.06)), 0.45 * scale, rng.uniform(40, 120), 0)


def noise_bed(rng, n, lp, flicker_step, flicker_lo, gain):
    brown, out = 0.0, [0.0] * n
    for i in range(n):
        brown = (brown + (rng.random() * 2 - 1) * 0.02) / 1.01
        out[i] = brown
    out = biquad_lp(out, lp)
    fl = slow_curve(rng, n, flicker_step, flicker_lo, 1.0)
    return [out[i] * fl[i] * gain for i in range(n)]


def make_loop(mix, n):
    fn = len(mix) - n
    loop = mix[:n]
    for i in range(fn):
        x = i / fn
        loop[i] = mix[i] * math.sin(x * math.pi / 2) + mix[n + i] * math.cos(x * math.pi / 2)
    return loop


def soft(buf, k=1.3):
    return [math.tanh(s * k) / k for s in buf]


def rms(buf):
    return math.sqrt(sum(s * s for s in buf) / len(buf))


def scaled(buf, target_rms):
    r = rms(buf) or 1
    return [s * target_rms / r for s in buf]


# ---------------------------------------------------------------- layers
def embers(seconds=6.1, seed=11):
    rng = random.Random(seed)
    n = int(RATE * seconds)
    total = n + int(RATE * 0.8)
    mix = noise_bed(rng, total, 220, 0.12, 0.7, 1.4)
    crackle_events(rng, mix, 0.1, 0.5, 0.35, (0.9, 0.1))
    texture(rng, mix, 1.5, 0.06)
    return scaled(make_loop(biquad_lp(soft(mix), DARKEN), n), 0.05)


def crackle(seconds=9.1, seed=22):
    rng = random.Random(seed)
    n = int(RATE * seconds)
    total = n + int(RATE * 0.8)
    mix = noise_bed(rng, total, 500, 0.08, 0.75, 0.5)
    crackle_events(rng, mix, 0.4, 2.0, 0.55, (0.8, 0.2), pops_every=(15, 25))
    texture(rng, mix, 3, 0.07)
    return scaled(make_loop(biquad_lp(soft(mix), DARKEN), n), 0.07)


def roar(seconds=11.7, seed=33):
    rng = random.Random(seed)
    n = int(RATE * seconds)
    total = n + int(RATE * 0.8)
    mix = noise_bed(rng, total, 380, 0.06, 0.6, 2.4)
    # A soft upper whoosh of flame, flickering fast.
    hiss = noise_bed(rng, total, 1600, 0.05, 0.5, 0.35)
    hp = onepole(hiss, 300, True)
    mix = [mix[i] + hp[i] for i in range(total)]
    crackle_events(rng, mix, 0.8, 3.5, 0.6, (0.75, 0.25), pops_every=(12, 20))
    texture(rng, mix, 5, 0.08)
    return scaled(make_loop(biquad_lp(soft(mix), DARKEN), n), 0.09)


def log_drop(seed=44):
    rng = random.Random(seed)
    n = int(RATE * 2.6)
    mix = [0.0] * n
    # Thunk: a heavy, dull knock with a little wood ring.
    knock = [0.0] * int(RATE * 0.25)
    for k in range(len(knock)):
        t = k / RATE
        knock[k] = (math.sin(2 * math.pi * 95 * t) * 0.8 + math.sin(2 * math.pi * 210 * t) * 0.35) * math.exp(-t * 28) \
            + (rng.random() * 2 - 1) * math.exp(-t * 90) * 0.6
    knock = biquad_lp(knock, 900)
    for k, s in enumerate(knock):
        mix[int(RATE * 0.02) + k] += s * 0.9
    # Embers shift: a scatter of small crackles.
    cluster(rng, mix, int(RATE * 0.03), 0.6, 120, 500, 6000, 400)
    # Then it catches: crackles thicken over two seconds.
    t = 0.25
    while t < 2.4:
        x = (t - 0.25) / 2.15
        amp = min(1, 0.1 * rng.random() ** -0.6) * (0.5 + 0.5 * math.sin(math.pi * x))
        cluster(rng, mix, int(t * RATE), amp, rng.uniform(5, 60), rng.uniform(400, 1100),
                rng.uniform(3500, 9000), rng.uniform(300, 1200))
        t += rng.expovariate(2 + 5 * math.sin(math.pi * x))
    mix = biquad_lp(soft(mix), DARKEN)
    for i in range(int(RATE * 0.3)):
        mix[n - 1 - i] *= i / (RATE * 0.3)
    return mix


def stoke(seed=55):
    rng = random.Random(seed)
    n = int(RATE * 2.2)
    # Whoosh: noise swelling up through a rising filter, then easing off.
    brown, src = 0.0, [0.0] * n
    for i in range(n):
        brown = (brown + (rng.random() * 2 - 1) * 0.05) / 1.01
        src[i] = brown
    out = [0.0] * n
    a_y = 0.0
    for i in range(n):
        t = i / RATE
        env = (min(1, t / 0.35) ** 1.5) * math.exp(-max(0, t - 0.35) * 1.8)
        cut = 300 + 1500 * env
        a = math.exp(-2 * math.pi * cut / RATE)
        a_y = (1 - a) * src[i] + a * a_y
        out[i] = a_y * env * 2.2
    # Sparks: a quick flurry of bright snaps.
    t = 0.12
    while t < 1.6:
        amp = min(1, 0.12 * rng.random() ** -0.55) * math.exp(-(t - 0.12) * 1.4)
        cluster(rng, out, int(t * RATE), amp, rng.uniform(0, 30), 1500, rng.uniform(6000, 10000), rng.uniform(800, 2000))
        t += rng.expovariate(5)
    out = biquad_lp(soft(out), DARKEN)
    for i in range(int(RATE * 0.3)):
        out[n - 1 - i] *= i / (RATE * 0.3)
    return out


def write(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, round(s * 32767)))) for s in samples))


FILES = [
    ("fire-embers.wav", embers),
    ("fire-crackle.wav", crackle),
    ("fire-roar.wav", roar),
    ("fire-log.wav", log_drop),
    ("fire-stoke.wav", stoke),
]


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "assets"
    if out.suffix == ".wav":
        raise SystemExit("pass a directory; this writes " + ", ".join(name for name, _ in FILES))
    for name, make in FILES:
        samples = make()
        write(out / name, samples)
        peak = max(abs(s) for s in samples)
        print(f"{out / name}: {len(samples) / RATE:.1f} s, peak {peak:.3f}, rms {rms(samples):.3f}")


if __name__ == "__main__":
    main()
