#!/usr/bin/env python3
"""Synthesises the soundtrack for the MyPixelGuard launch video.

Writes public/audio/music.wav (84 s, 120 BPM, A minor, tension intro ->
drop at the logo reveal) and public/audio/sfx/*.wav (UI and transition
effects). Everything is generated from scratch, so it is royalty-free.

Run:  python3 scripts/make_audio.py
"""
import os
import wave

import numpy as np
from scipy import signal

SR = 44100
BPM = 120
BEAT = 60 / BPM          # 0.5 s
BAR = BEAT * 4           # 2 s  (= 60 frames at 30 fps)
BARS = 44                # 88 s

# Song sections (bar numbers) — keep in sync with the scene starts in src/theme.ts
SILENCE = 12   # "Not anymore."  (24 s)
REVEAL = 13    # logo reveal / drop (26 s)
GROOVE = 16    # product hero onwards (32 s)
BREATH = 39    # one bar of air before the CTA
OUTRO = 40     # CTA (80 s)
RNG = np.random.default_rng(7)

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")


# ---------------------------------------------------------------- helpers
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def note_hz(name):
    """'A4' -> 440.0"""
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3,
             "G": -2, "G#": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}
    n, octv = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + (octv - 4) * 12) / 12)


def lp(x, hz, order=2):
    b, a = signal.butter(order, min(hz, SR / 2 - 100) / (SR / 2), "low")
    return signal.lfilter(b, a, x)


def hp(x, hz, order=2):
    b, a = signal.butter(order, hz / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], "band")
    return signal.lfilter(b, a, x)


def sweep_filter(x, f0, f1, q=4.0, block=256):
    """Time-varying band-pass (block-wise state-variable filter)."""
    y = np.zeros_like(x)
    low = band = 0.0
    n = len(x)
    for i in range(0, n, block):
        frac = i / max(n - 1, 1)
        f = f0 * (f1 / f0) ** frac
        F = 2 * np.sin(np.pi * f / SR)
        damp = 1 / q
        for j in range(i, min(i + block, n)):
            high = x[j] - low - damp * band
            band += F * high
            low += F * band
            y[j] = band
    return y


def env_exp(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def adsr(n, a, d, s, r):
    e = np.ones(n) * s
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    A = min(A, n)
    e[:A] = np.linspace(0, 1, A, endpoint=False)
    D2 = min(D, n - A)
    e[A:A + D2] = np.linspace(1, s, D2, endpoint=False)
    if R and n > R:
        e[-R:] *= np.linspace(1, 0, R)
    return e


def saw(freq, t, phase=0.0):
    p = (freq * t + phase) % 1.0
    return 2 * p - 1


def supersaw(freq, dur, voices=7, detune=0.012):
    t = t_axis(dur)
    out = np.zeros((2, len(t)))
    for v in range(voices):
        d = 1 + detune * (v - voices // 2) / (voices // 2)
        s = saw(freq * d, t, RNG.random())
        pan = (v / (voices - 1))
        out[0] += s * (1 - pan)
        out[1] += s * pan
    return out / voices


def reverb(x, seconds=2.2, mix=0.25, predelay=0.02):
    """Stereo convolution reverb with a decaying-noise impulse."""
    n = int(seconds * SR)
    pd = int(predelay * SR)
    ir = []
    for _ in range(2):
        r = RNG.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 6.9))
        r = lp(r, 6000)
        ir.append(np.concatenate([np.zeros(pd), r]) / np.sqrt(np.sum(r ** 2)))
    if x.ndim == 1:
        x = np.vstack([x, x])
    wet = np.vstack([signal.fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x * (1 - mix) + wet * mix * 2.0


def stereo(x, width=0.0):
    return np.vstack([x * (1 - width), x * (1 + width)]) if x.ndim == 1 else x


def place(track, clip, start_s, gain=1.0):
    clip = stereo(clip)
    i = int(start_s * SR)
    if i >= track.shape[1]:
        return
    j = min(track.shape[1], i + clip.shape[1])
    track[:, i:j] += clip[:, : j - i] * gain


def write_wav(path, x, peak_db=-1.0):
    x = stereo(x)
    peak = np.max(np.abs(x)) or 1
    x = x / peak * 10 ** (peak_db / 20)
    data = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ------------------------------------------------------------ instruments
def kick(dur=0.45):
    t = t_axis(dur)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(len(t), 0.16)
    click = hp(RNG.standard_normal(len(t)), 3000) * env_exp(len(t), 0.004) * 0.35
    return np.tanh(1.6 * (body + click))


def clap(dur=0.35):
    n = int(dur * SR)
    x = np.zeros(n)
    nz = bp(RNG.standard_normal(n), 900, 3200)
    for k, off in enumerate([0, 0.011, 0.022]):
        i = int(off * SR)
        x[i:] += nz[: n - i] * env_exp(n - i, 0.008 if k < 2 else 0.09)
    return x * 0.8


def hat(open_=False):
    dur = 0.25 if open_ else 0.06
    n = int(dur * SR)
    x = hp(RNG.standard_normal(n), 7500, 4)
    return x * env_exp(n, 0.07 if open_ else 0.014) * (0.5 if open_ else 0.4)


def snare_roll_hit():
    n = int(0.12 * SR)
    return bp(RNG.standard_normal(n), 1500, 6000) * env_exp(n, 0.03)


def fm_pluck(freq, dur=0.35, bright=3.0, decay=0.18):
    t = t_axis(dur)
    idx = bright * np.exp(-t / (decay * 0.5))
    mod = np.sin(2 * np.pi * freq * 2 * t) * idx
    car = np.sin(2 * np.pi * freq * t + mod)
    return car * env_exp(len(t), decay) * adsr(len(t), 0.002, 0, 1, 0.02)


def bell(freq, dur=1.6):
    t = t_axis(dur)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 2.2 * np.exp(-t / 0.25)
    return np.sin(2 * np.pi * freq * t + mod) * env_exp(len(t), 0.5) * adsr(len(t), 0.002, 0, 1, 0.05)


def pad_chord(notes, dur, cutoff=1400, attack=0.4):
    x = np.zeros((2, int(dur * SR)))
    for n in notes:
        x += supersaw(note_hz(n), dur)
    x = np.vstack([lp(x[0], cutoff), lp(x[1], cutoff)])
    return x * adsr(x.shape[1], attack, 0.3, 0.85, 0.35) / len(notes)


def sub(freq, dur, drive=1.5):
    t = t_axis(dur)
    s = np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2 * t)
    return np.tanh(drive * s) * adsr(len(t), 0.005, 0.05, 0.9, 0.04)


def pluck_bass(freq, dur):
    t = t_axis(dur)
    s = saw(freq, t) + saw(freq * 1.005, t)
    cut = 300 + 1600 * np.exp(-t / 0.06)
    # crude envelope filter: blend two fixed low-passes by cutoff envelope
    a, b = lp(s, 300), lp(s, 1900)
    mix = (cut - 300) / 1600
    return (a * (1 - mix) + b * mix) * adsr(len(t), 0.003, 0.08, 0.7, 0.03) * 0.5


# -------------------------------------------------------------- the track
PROG = [  # one chord per bar (A minor: i - VI - III - VII)
    ("A", ["A3", "C4", "E4", "A4"], ["A4", "E5", "A5", "C6", "E5", "A5", "C6", "E6"]),
    ("F", ["F3", "A3", "C4", "F4"], ["F4", "C5", "F5", "A5", "C5", "F5", "A5", "C6"]),
    ("C", ["C4", "E4", "G4", "C5"], ["C5", "G5", "C6", "E6", "G5", "C6", "E6", "G6"]),
    ("G", ["G3", "B3", "D4", "G4"], ["G4", "D5", "G5", "B5", "D5", "G5", "B5", "D6"]),
]
ROOT = {"A": "A1", "F": "F1", "C": "C2", "G": "G1"}
HOOK = {"A": ["E5", "C5"], "F": ["A5", "F5"], "C": ["G5", "E5"], "G": ["D5", "B4"]}


def make_music():
    total = BARS * BAR + 3
    N = int(total * SR)
    drums = np.zeros((2, N))
    bass = np.zeros((2, N))
    pads = np.zeros((2, N))
    keys = np.zeros((2, N))
    fx = np.zeros((2, N))
    duck = np.ones(N)          # sidechain envelope driven by kicks

    K, C, CH, OH = kick(), clap(), hat(), hat(True)

    def add_kick(t0, g=1.0):
        place(drums, K, t0, g)
        i = int(t0 * SR)
        n = int(0.35 * SR)
        j = min(N, i + n)
        duck[i:j] = np.minimum(duck[i:j], 1 - 0.65 * np.exp(-np.arange(j - i) / SR / 0.11))

    for bar in range(BARS):
        b0 = bar * BAR
        name, chord, arp = PROG[bar % 4]
        intro = bar < SILENCE
        silence = bar == SILENCE
        reveal = REVEAL <= bar < GROOVE
        groove = GROOVE <= bar < BREATH
        breath = bar == BREATH
        outro = bar >= OUTRO

        # --- pads
        if intro:
            # dark, filtered, alternating Am / F every 2 bars
            ch = PROG[0][1] if (bar // 2) % 2 == 0 else PROG[1][1]
            if bar % 2 == 0:
                place(pads, pad_chord([n[:-1] + str(int(n[-1]) - 1) for n in ch], BAR * 2, 650, 1.0), b0, 0.55)
        elif reveal or groove or breath or outro:
            cut = 1100 if reveal else (1700 if groove else 900)
            place(pads, pad_chord(chord, BAR, cut, 0.08 if groove else 0.25), b0, 0.42)

        # --- bass
        if intro and bar >= 2:
            for s in range(8):  # pulsing 8ths
                place(bass, pluck_bass(note_hz("A1"), BEAT / 2 * 0.9), b0 + s * BEAT / 2, 0.55 if s % 2 else 0.8)
        elif reveal:
            place(bass, sub(note_hz(ROOT[name]), BAR * 0.98), b0, 0.6)
        elif groove or (outro and bar <= OUTRO + 1):
            for s in range(4):  # off-beat sub + pluck
                t0 = b0 + s * BEAT + BEAT / 2
                place(bass, sub(note_hz(ROOT[name]), BEAT * 0.45), t0, 0.75)
                place(bass, pluck_bass(note_hz(ROOT[name]) * 2, BEAT * 0.4), t0, 0.35)

        # --- drums
        if intro:
            if bar >= 4:  # heartbeat
                add_kick(b0, 0.7)
                add_kick(b0 + 0.28, 0.45)
            for s in range(16):  # ticking clock hats
                if bar >= 2:
                    place(drums, CH, b0 + s * BEAT / 4, 0.18 if s % 4 else 0.3)
            if bar >= SILENCE - 3:
                place(drums, C, b0 + BEAT * 3, 0.35)
        if bar == GROOVE - 1:  # build into the drop
            for s in range(16):
                g = 0.15 + 0.5 * s / 16
                place(drums, snare_roll_hit(), b0 + s * BEAT / 4, g)
            for s in range(8, 16):
                place(drums, snare_roll_hit(), b0 + s * BEAT / 4 + BEAT / 8, 0.15 + 0.4 * s / 16)
        if groove or (outro and bar <= OUTRO + 1):
            for s in range(4):
                add_kick(b0 + s * BEAT)
                place(drums, OH, b0 + s * BEAT + BEAT / 2, 0.5)
            if bar >= GROOVE + 1 or outro:
                place(drums, C, b0 + BEAT, 0.7)
                place(drums, C, b0 + BEAT * 3, 0.7)
            for s in range(16):
                place(drums, CH, b0 + s * BEAT / 4, 0.28 if s % 2 else 0.18)
            if bar % 4 == 3 and not outro:  # little fill every 4 bars
                for s in range(12, 16):
                    place(drums, snare_roll_hit(), b0 + s * BEAT / 4, 0.25 + 0.05 * (s - 12))

        # --- keys: arp + hook
        if (intro and bar >= 6) or reveal or groove or outro or breath:
            for s in range(16):
                note = arp[s % 8]
                f = note_hz(note)
                if intro:
                    f /= 2
                g = 0.16 if intro else 0.22
                if outro and bar >= BARS - 2:
                    g *= 1 - (bar - (BARS - 2) + s / 16) / 2
                place(keys, fm_pluck(f, 0.3, 2.2 if intro else 3.2, 0.12), b0 + s * BEAT / 4, g)
        if groove and bar >= GROOVE + 3:
            h = HOOK[name]
            place(keys, bell(note_hz(h[0])), b0, 0.22)
            place(keys, bell(note_hz(h[1])), b0 + BEAT * 1.5, 0.18)
            place(keys, bell(note_hz(h[0])), b0 + BEAT * 3, 0.12)

    # --- transitions baked into the music
    # riser into "Not anymore" and the reveal (bars 9-11)
    place(fx, riser(BAR * 2.0), (SILENCE - 2) * BAR, 0.45)
    place(fx, reverse_swell(1.4), REVEAL * BAR - 1.4, 0.6)
    place(fx, impact(), REVEAL * BAR, 1.0)
    place(fx, riser(BAR), (GROOVE - 1) * BAR, 0.35)
    place(fx, impact(0.6), GROOVE * BAR, 0.6)
    place(fx, riser(BAR), BREATH * BAR, 0.35)
    place(fx, impact(), OUTRO * BAR, 0.8)

    pads = pads * duck
    bass = bass * duck
    keys_wet = reverb(keys, 1.8, 0.35)
    pads_wet = reverb(pads, 2.5, 0.3)
    mix = drums * 0.9 + bass * 0.9 + pads_wet * 0.8 + keys_wet * 0.8 + reverb(fx, 2.5, 0.25) * 0.8

    # silence the gap before the reveal ("Not anymore.")
    s0, s1 = int(SILENCE * BAR * SR), int(REVEAL * BAR * SR)
    gate = np.ones(N)
    gate[s0:s1] = np.linspace(0.25, 0.0, s1 - s0) ** 2
    mix[:, s0:s1] = mix[:, s0:s1] * gate[s0:s1]
    place(mix, reverse_swell(1.4) * 0.6, REVEAL * BAR - 1.4)

    # final fade
    end = int(BARS * BAR * SR)
    fade_start = int((BARS - 2) * BAR * SR)
    mix[:, fade_start:end] *= np.linspace(1, 0.35, end - fade_start)
    mix[:, end:] *= np.linspace(0.35, 0, N - end)

    # glue: gentle low-cut, soft clip
    mix = np.vstack([hp(mix[0], 30), hp(mix[1], 30)])
    mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4)
    write_wav(os.path.join(OUT, "music.wav"), mix[:, : int(BARS * BAR * SR)], -1.0)


# ------------------------------------------------------------------- sfx
def whoosh(dur=0.7, f0=250, f1=3500, f2=500):
    n = int(dur * SR)
    nz = RNG.standard_normal(n)
    half = n // 2
    y = np.concatenate([sweep_filter(nz[:half], f0, f1, 2.5), sweep_filter(nz[half:], f1, f2, 2.5)])
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    l, r = y * e, np.roll(y * e, 180)
    pan = np.linspace(0.2, 0.8, n)
    return np.vstack([l * (1 - pan), r * pan]) * 2


def riser(dur=3.0):
    n = int(dur * SR)
    t = t_axis(dur)
    nz = sweep_filter(RNG.standard_normal(n), 200, 8000, 3)
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (3 * t / dur)) / SR) * 0.25
    e = (t / dur) ** 2
    return (nz + tone) * e


def reverse_swell(dur=1.5):
    n = int(dur * SR)
    x = hp(RNG.standard_normal(n), 3000) * env_exp(n, dur / 3)
    x = reverb(x, 1.5, 0.6)
    return x[:, ::-1]


def impact(scale=1.0):
    dur = 2.8
    t = t_axis(dur)
    f = 38 + 70 * np.exp(-t / 0.08)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.7)
    crack = lp(RNG.standard_normal(len(t)), 4000) * env_exp(len(t), 0.05) * 0.6
    tail = lp(RNG.standard_normal(len(t)), 900) * env_exp(len(t), 0.6) * 0.15
    return np.tanh(1.3 * (boom + crack + tail)) * scale


def pop():
    t = t_axis(0.12)
    f = 300 + 900 * np.exp(-t / 0.015)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.03)


def click():
    n = int(0.06 * SR)
    a = bp(RNG.standard_normal(n), 1500, 7000) * env_exp(n, 0.002)
    b = np.zeros(n)
    i = int(0.035 * SR)
    b[i:] = bp(RNG.standard_normal(n - i), 1200, 5000) * env_exp(n - i, 0.002) * 0.6
    return (a + b) * 1.2


def tick():
    t = t_axis(0.04)
    return np.sin(2 * np.pi * 2400 * t) * env_exp(len(t), 0.006)


def blip():
    x = np.zeros(int(0.18 * SR))
    for k, f in enumerate([1320, 1980]):
        t = t_axis(0.06)
        s = np.sign(np.sin(2 * np.pi * f * t)) * env_exp(len(t), 0.02) * 0.4
        s = lp(s, 5000)
        i = int(k * 0.07 * SR)
        x[i:i + len(s)] += s
    return x


def ding():
    x = np.zeros(int(1.6 * SR))
    for k, n in enumerate(["E6", "B6"]):
        b = bell(note_hz(n), 1.4)
        i = int(k * 0.09 * SR)
        x[i:i + len(b)] += b * (0.8 if k else 1)
    return reverb(x, 1.6, 0.3)


def error_buzz():
    x = np.zeros(int(0.5 * SR))
    for k in range(2):
        t = t_axis(0.16)
        s = saw(110, t) + saw(116, t)
        s = bp(s, 200, 2500) * adsr(len(t), 0.005, 0, 1, 0.02)
        i = int(k * 0.2 * SR)
        x[i:i + len(s)] += s
    return x


def glitch(dur=0.5):
    n = int(dur * SR)
    x = np.zeros(n)
    i = 0
    while i < n:
        seg = int(RNG.uniform(0.008, 0.05) * SR)
        kind = RNG.integers(3)
        t = np.arange(seg) / SR
        if kind == 0:
            s = RNG.standard_normal(seg) * 0.5
        elif kind == 1:
            s = np.sign(np.sin(2 * np.pi * RNG.uniform(200, 3000) * t)) * 0.4
        else:
            s = np.zeros(seg)
        x[i:i + seg] = s[: n - i]
        i += seg
    step = 6  # bit-crush / sample-hold
    x = np.repeat(x[::step], step)[:n]
    return np.round(x * 8) / 8


def thud():
    t = t_axis(0.6)
    f = 55 + 60 * np.exp(-t / 0.04)
    return np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(len(t), 0.18))


def negative():
    x = np.zeros(int(0.4 * SR))
    for k, f in enumerate([520, 390]):
        t = t_axis(0.14)
        s = (np.sin(2 * np.pi * f * t) + 0.3 * np.sign(np.sin(2 * np.pi * f * t))) * env_exp(len(t), 0.06)
        i = int(k * 0.12 * SR)
        x[i:i + len(s)] += lp(s, 3000)
    return x


def shimmer():
    x = np.zeros(int(2.0 * SR))
    for k, n in enumerate(["A5", "C6", "E6", "A6", "C7", "E7"]):
        b = bell(note_hz(n), 1.2) * (1 - k * 0.1)
        i = int(k * 0.06 * SR)
        x[i:i + len(b)] += b
    return reverb(x, 2.0, 0.45)


def scan():
    t = t_axis(1.0)
    f = 300 * 2 ** (3 * t)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t) ** 2 * 0.4
    nz = hp(RNG.standard_normal(len(t)), 5000) * np.sin(np.pi * t) ** 2 * 0.15
    return reverb(s + nz, 1.0, 0.3)


def typing(count=10, gap=0.055):
    x = np.zeros(int((count * gap + 0.1) * SR))
    for k in range(count):
        c = tick() * RNG.uniform(0.6, 1.0)
        i = int((k * gap + RNG.uniform(0, 0.01)) * SR)
        x[i:i + len(c)] += c
    return x


def upload():
    x = np.zeros(int(1.4 * SR))
    for k in range(10):
        p = fm_pluck(note_hz("A4") * 2 ** (k * 2 / 12), 0.2, 1.5, 0.06)
        i = int(k * 0.11 * SR)
        x[i:i + len(p)] += p * 0.5
    return x


def drone(dur=12.0):
    t = t_axis(dur)
    s = sum(np.sin(2 * np.pi * f * t + RNG.random() * 6) for f in [55, 55.4, 82.4, 110.3])
    s = lp(s + 0.2 * RNG.standard_normal(len(t)), 400)
    e = adsr(len(t), 2.0, 0, 1, 3.0)
    return reverb(s * e, 3.0, 0.4)


def make_sfx():
    d = os.path.join(OUT, "sfx")
    items = {
        "whoosh": whoosh(), "whoosh_long": whoosh(1.2, 150, 2500, 300),
        "swoosh_up": whoosh(0.5, 600, 6000, 4000), "riser": riser(2.0),
        "reverse": reverse_swell(1.4), "impact": impact(), "pop": pop(),
        "click": click(), "tick": tick(), "blip": blip(), "ding": ding(),
        "error": error_buzz(), "glitch": glitch(), "thud": thud(),
        "negative": negative(), "shimmer": shimmer(), "scan": scan(),
        "typing": typing(), "upload": upload(), "drone": drone(),
    }
    for name, x in items.items():
        write_wav(os.path.join(d, f"{name}.wav"), x, -1.0)
        print("sfx", name)


if __name__ == "__main__":
    make_sfx()
    make_music()
    print("music done")
