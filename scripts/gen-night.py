#!/usr/bin/env python3
"""Generate the distant cricket and frog calls, assets/cricket.wav,
assets/peep.wav, and assets/croak.wav.

Each file is one call, mono 16-bit at 22.05 kHz, the same format as
assets/crackle.wav so Qt's media player resamples it the same way. They are
meant to be played quietly, one at a time, on the schedule in ui/fire/night.js.

Distance is mostly the spectrum, not just the gain. A cricket up close is a
bright 4-5 kHz trill. From across a lake the air takes the top off, so this
chirp is a short run of damped pulses around 2.4 kHz with a dull reflection
a few dozen milliseconds later. The peeper is a soft rising whistle. The
croak is a low double syllable. Seed 5919, so the files regenerate byte for
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
SEED = 5919


def lowpass(samples, cutoff, rate, q=math.sqrt(0.5)):
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


def silence(n):
    return [0.0] * n


def add_at(buf, start, samples, gain):
    for i, s in enumerate(samples):
        j = start + i
        if 0 <= j < len(buf):
            buf[j] += s * gain


def reflect(buf, delay_s, gain, cutoff):
    # A dull copy of the call, as if it bounced off the far trees.
    delayed = silence(len(buf))
    shift = int(RATE * delay_s)
    for i, s in enumerate(buf):
        j = i + shift
        if j < len(delayed):
            delayed[j] = s
    delayed = lowpass(delayed, cutoff, RATE)
    for i in range(len(buf)):
        buf[i] += delayed[i] * gain


def fade_ends(buf, fade_in, fade_out):
    n = len(buf)
    for i in range(min(fade_in, n)):
        buf[i] *= i / fade_in
    for i in range(min(fade_out, n)):
        buf[n - 1 - i] *= i / fade_out


def normalize(buf, peak):
    m = max(abs(s) for s in buf) or 1.0
    g = peak / m
    for i in range(len(buf)):
        buf[i] *= g


def cricket():
    # Four tooth-strikes. Each is a damped sine that falls a little in pitch,
    # the way a real chirp does as the wing slows.
    pulses = []
    spacing = int(RATE * 0.016)
    pulse_n = int(RATE * 0.014)
    for p in range(4):
        f0 = 2480 - p * 40
        for i in range(pulse_n):
            t = i / RATE
            env = math.exp(-t * 160) * (1 - math.exp(-t * 900))
            pulses.append(math.sin(2 * math.pi * f0 * t) * env)
        if p < 3:
            pulses.extend(silence(spacing - pulse_n))
    pulses = lowpass(pulses, 2100, RATE)
    buf = silence(int(RATE * 0.16))
    add_at(buf, int(RATE * 0.008), pulses, 1)
    reflect(buf, 0.046, 0.22, 1200)
    fade_ends(buf, int(RATE * 0.004), int(RATE * 0.012))
    normalize(buf, 0.42)
    return buf


def peep():
    # A spring peeper across the water: one rising whistle, no rasp.
    n = int(RATE * 0.15)
    buf = []
    phase = 0.0
    for i in range(n):
        t = i / n
        f = 1500 + 900 * t
        phase += 2 * math.pi * f / RATE
        env = math.sin(math.pi * t) ** 1.35
        buf.append(math.sin(phase) * env)
    buf = lowpass(buf, 1900, RATE)
    buf = silence(int(RATE * 0.02)) + buf + silence(int(RATE * 0.06))
    reflect(buf, 0.055, 0.2, 1100)
    fade_ends(buf, int(RATE * 0.006), int(RATE * 0.015))
    normalize(buf, 0.40)
    return buf


def croak():
    # A low two-note croak. The second syllable is shorter and lower.
    rng = random.Random(SEED)
    buf = silence(int(RATE * 0.28))

    def syllable(start, dur, f_low, f_body):
        n = int(RATE * dur)
        phase_l = 0.0
        phase_b = 0.0
        for i in range(n):
            t = i / n
            env = math.sin(math.pi * min(1, t / 0.35)) * math.exp(-t * 3.2)
            phase_l += 2 * math.pi * f_low / RATE
            phase_b += 2 * math.pi * f_body / RATE
            rasp = (rng.random() * 2 - 1) * 0.08 * env
            s = (math.sin(phase_l) * 0.65 + math.sin(phase_b) * 0.35) * env + rasp
            j = start + i
            if j < len(buf):
                buf[j] += s

    syllable(int(RATE * 0.02), 0.09, 165, 520)
    syllable(int(RATE * 0.12), 0.07, 140, 440)
    smoothed = lowpass(buf, 780, RATE)
    reflect(smoothed, 0.062, 0.28, 500)
    fade_ends(smoothed, int(RATE * 0.005), int(RATE * 0.02))
    normalize(smoothed, 0.40)
    return smoothed


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
