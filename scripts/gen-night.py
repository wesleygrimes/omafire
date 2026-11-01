#!/usr/bin/env python3
"""Generate the distant cricket and frog calls, assets/cricket.wav,
assets/peep.wav, and assets/croak.wav.

Each file is one call, mono 16-bit at 22.05 kHz, the same format as the fire
loops so Qt's media player resamples them the same way. They are played
quietly, one at a time, on the schedule in ui/fire/night.js.

Each call sits in a small outdoor room (a Schroeder reverb: four damped
combs and two allpasses), so it sounds off in the trees rather than in your
ear. The cricket is four short syllables near 4.4 kHz, falling slightly. The
peeper is a soft up-slur near 2.7-3.1 kHz. The croak is a green frog's low
"gunk", twice: a jittered pulse train through throat resonances (210, 480,
1050 Hz) instead of a sine. Fixed seeds, so the files regenerate byte for
byte.

    python3 scripts/gen-night.py [directory]
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050


def biquad(samples, kind, f, q=0.7071, rate=RATE):
    w0 = 2 * math.pi * f / rate
    alpha = math.sin(w0) / (2 * q)
    c = math.cos(w0)
    if kind == "lp":
        b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    elif kind == "hp":
        b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    else:  # band-pass, 0 dB peak
        b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * c, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    out = [0.0] * len(samples)
    x1 = x2 = y1 = y2 = 0.0
    for i, x in enumerate(samples):
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out[i] = y
    return out


def reverb(dry, wet=0.3, size=1.0, damp=3200, tail=0.6):
    """Small Schroeder room: open air, a few trees. Returns dry + wet."""
    n = len(dry) + int(RATE * tail)
    x = dry + [0.0] * (n - len(dry))
    acc = [0.0] * n
    lp_a = math.exp(-2 * math.pi * damp / RATE)
    for ms, fb in ((29.7, 0.77), (37.1, 0.75), (41.1, 0.73), (43.7, 0.71)):
        d = int(RATE * ms * size / 1000)
        buf = [0.0] * n
        lp = 0.0
        for i in range(n):
            back = buf[i - d] if i >= d else 0.0
            lp = (1 - lp_a) * back + lp_a * lp
            buf[i] = x[i] + lp * fb
            acc[i] += back
    for ms, g in ((5.0, 0.7), (1.7, 0.7)):
        d = int(RATE * ms / 1000)
        out = [0.0] * n
        for i in range(n):
            xd = acc[i - d] if i >= d else 0.0
            yd = out[i - d] if i >= d else 0.0
            out[i] = -g * acc[i] + xd + g * yd
        acc = out
    acc = biquad(acc, "lp", damp)
    return [x[i] + acc[i] * wet * 0.25 for i in range(n)]


def normalize(buf, peak):
    m = max(abs(s) for s in buf) or 1.0
    return [s * peak / m for s in buf]


def fade(buf, a, b):
    n = len(buf)
    for i in range(min(a, n)):
        buf[i] *= i / a
    for i in range(min(b, n)):
        buf[n - 1 - i] *= i / b
    return buf


def cricket(seed=1):
    rng = random.Random(seed)
    buf = [0.0] * int(RATE * 0.16)
    start = int(RATE * 0.01)
    for syl in range(4):
        dur = int(RATE * 0.017)
        f0, f1 = 4450 - syl * 15, 4300 - syl * 15
        ph = 0.0
        for k in range(dur):
            x = k / dur
            env = math.sin(math.pi * x ** 0.8) ** 2
            f = f0 + (f1 - f0) * x
            ph += 2 * math.pi * f / RATE
            s = (math.sin(ph) + 0.06 * math.sin(2 * ph)) * env
            buf[start + k] += s * (0.85 + 0.15 * rng.random())
        start += int(RATE * 0.031)
    buf = biquad(buf, "lp", 6500)
    buf = reverb(buf, wet=0.55, size=1.1, damp=4200, tail=0.45)
    return normalize(fade(buf, 40, 400), 0.42)


def peep(seed=2):
    n = int(RATE * 0.13)
    buf = [0.0] * int(RATE * 0.02)
    ph = 0.0
    for i in range(n):
        x = i / n
        f = 2650 + 420 * (1 - (1 - x) ** 2)
        ph += 2 * math.pi * f / RATE
        env = (min(1, x / 0.35) ** 1.5) * (1 - max(0, (x - 0.7) / 0.3)) ** 1.2
        buf.append(math.sin(ph) * env)
    buf = biquad(buf, "lp", 5000)
    buf = reverb(buf, wet=0.6, size=1.2, damp=3800, tail=0.5)
    return normalize(fade(buf, 40, 500), 0.40)


def croak(seed=3):
    """A green frog's low 'gunk', twice: a jittered pulse train through
    throat resonances, not a sine."""
    rng = random.Random(seed)
    buf = [0.0] * int(RATE * 0.5)

    def syllable(start, dur, f0, f1, amp):
        n = int(RATE * dur)
        src = [0.0] * n
        t = 0.0
        while True:
            i = int(t * RATE)
            if i >= n:
                break
            x = i / n
            env = min(1, x / 0.12) * (1 - x) ** 1.6
            src[i] += env * (0.8 + 0.4 * rng.random())
            f = f0 + (f1 - f0) * x
            t += (1 / f) * (1 + rng.uniform(-0.04, 0.04))
        voiced = [0.0] * n
        for f, q, g in ((210, 3.0, 1.0), (480, 4.0, 0.55), (1050, 5.0, 0.18)):
            r = biquad(src, "bp", f, q)
            for i in range(n):
                voiced[i] += r[i] * g
        for i in range(n):
            j = start + i
            if j < len(buf):
                buf[j] += voiced[i] * amp

    syllable(int(RATE * 0.02), 0.16, 118, 104, 1.0)
    syllable(int(RATE * 0.24), 0.12, 108, 96, 0.7)
    buf = biquad(buf, "lp", 1800)
    buf = reverb(buf, wet=0.5, size=1.3, damp=1600, tail=0.6)
    return normalize(fade(buf, 60, 900), 0.40)


def write(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, round(s * 32767)))) for s in samples
        )
        w.writeframes(frames)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "assets"
    if out.suffix == ".wav":
        raise SystemExit("pass a directory; this writes cricket.wav, peep.wav, and croak.wav")
    calls = [("cricket.wav", cricket()), ("peep.wav", peep()), ("croak.wav", croak())]
    for name, samples in calls:
        dest = out / name
        write(dest, samples)
        peak = max(abs(s) for s in samples)
        print(f"{dest}: {len(samples)} samples, {len(samples) / RATE:.3f} s, peak {peak:.3f}")


if __name__ == "__main__":
    main()
