#!/usr/bin/env python3
"""Generate assets/crackle.wav, OmaFire's quiet fire loop.

Derived from the browser reference's toggleSound(): brown noise
(brown = (brown + white * 0.035) / 1.02, scaled by 4) through a 950 Hz
lowpass biquad, plus sparse crackles (a burst starts with probability 0.00015
per sample, lasts 90-790 samples, white noise under a (1 - k/n)^5 envelope at
0.65). The two layers are mixed at the reference gains for heat 0.68
(noise 0.1 + 0.68 * 0.55, crackle 0.1 + 0.68 * 0.65); the master level (0.22)
and the heat scaling are applied at playback (ui/FireAudio.qml).

The reference used Math.random and a live sample rate. Here the seed is fixed
(5919, the scene's seed) so the file is reproducible, and the loop is
crossfaded so it repeats without a click.

    python3 scripts/gen-crackle.py [output.wav]
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 22050
SECONDS = 5.0
FADE_SECONDS = 0.25
SEED = 5919


def lowpass(samples, cutoff, rate, q=math.sqrt(0.5)):
    # RBJ cookbook lowpass, the Web Audio BiquadFilterNode 'lowpass' shape.
    w0 = 2 * math.pi * cutoff / rate
    alpha = math.sin(w0) / (2 * q)
    cos = math.cos(w0)
    b0, b1, b2 = (1 - cos) / 2, 1 - cos, (1 - cos) / 2
    a0, a1, a2 = 1 + alpha, -2 * cos, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    out, x1, x2, y1, y2 = [], 0.0, 0.0, 0.0, 0.0
    for x in samples:
        y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x, y1, y
        out.append(y)
    return out


def generate():
    rng = random.Random(SEED)
    n = int(RATE * SECONDS)
    fade = int(RATE * FADE_SECONDS)
    total = n + fade

    brown, noise = 0.0, []
    for _ in range(total):
        brown = (brown + (rng.random() * 2 - 1) * 0.035) / 1.02
        noise.append(brown * 4)
    noise = lowpass(noise, 950, RATE)

    crackle = [0.0] * total
    for i in range(total):
        if rng.random() < 0.00015:
            duration = int(90 + rng.random() * 700)
            for k in range(min(duration, total - i)):
                crackle[i + k] += (rng.random() * 2 - 1) * math.pow(1 - k / duration, 5) * 0.65

    heat = 0.68
    g_noise, g_crackle = 0.1 + heat * 0.55, 0.1 + heat * 0.65
    mix = [noise[i] * g_noise + crackle[i] * g_crackle for i in range(total)]

    # Seamless loop: the extra tail fades into the head (equal power), so the
    # sample after the last one is, in effect, the first.
    loop = mix[:n]
    for i in range(fade):
        t = i / fade
        loop[i] = mix[i] * math.sin(t * math.pi / 2) + mix[n + i] * math.cos(t * math.pi / 2)
    return loop


def write(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, round(s * 32767)))) for s in samples))


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "assets" / "crackle.wav"
    samples = generate()
    write(out, samples)
    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    print(f"{out}: {len(samples)} samples, {RATE} Hz mono 16-bit, peak {peak:.3f}, rms {rms:.3f}")
