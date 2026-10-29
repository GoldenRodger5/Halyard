"""Original deterministic stereo sound design. No downloaded loops, samples or models.

Tracks are event compositions, not evidence that an agent heard musical quality.
Raw WAVs go to verified T9; ffmpeg loudness normalization is a separate step.
"""
import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path('/Volumes/T9/Developer/Builds/recipefix-creative-breakthrough-20261029/audio')
info = subprocess.check_output(['diskutil', 'info', '/Volumes/T9'], text=True)
if 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' not in info or 'FileVault:                 Yes' not in info:
    raise SystemExit('Expected encrypted T9 required')
ROOT.mkdir(parents=True, exist_ok=True)
SR = 48000


def make(name, seconds, events, texture=None):
    rng = random.Random(1029)
    # Freeze the already-reviewed popcorn noise stream independently of egg edits.
    # Its first render followed three 0.65s/48kHz swooshes (93,600 RNG draws).
    # Per-track state prevents a later game cue from changing the story's sound.
    if name == 'popcorn':
        for _ in range(93600):
            rng.random()
    left, right = [0.] * int(seconds * SR), [0.] * int(seconds * SR)
    for at, duration, frequency, amplitude, kind, pan in events:
        start = int(at * SR)
        for j in range(int(duration * SR)):
            i = start + j
            if i >= len(left):
                break
            t = j / SR
            p = t / duration
            env = (1 - math.exp(-t * 120)) * math.exp(-p * (7 if kind == 'wood' else 4)) * min(1., (1 - p) * 30)
            if kind == 'wood':
                v = math.sin(2 * math.pi * frequency * t) + .27 * math.sin(2 * math.pi * frequency * 2.73 * t)
            elif kind == 'swoop':
                v = math.sin(2 * math.pi * (frequency * t + 70 * t * t)) * .5 + rng.uniform(-.2, .2)
            elif kind == 'pop':
                v = math.sin(2 * math.pi * frequency * t * math.exp(-t * 8)) + rng.uniform(-.5, .5) * math.exp(-t * 12)
            else:
                v = math.sin(2 * math.pi * frequency * t) + .16 * math.sin(4 * math.pi * frequency * t)
            v *= amplitude * env
            left[i] += v * math.sqrt((1 - pan) / 2)
            right[i] += v * math.sqrt((1 + pan) / 2)
    if texture:
        smooth = 0
        for i in range(len(left)):
            t = i / SR
            amount = texture(t)
            smooth = .92 * smooth + .08 * rng.uniform(-1, 1)
            v = smooth * amount
            left[i] += v
            right[i] += v * .87
    peak = max(max(map(abs, left)), max(map(abs, right)), .001)
    with wave.open(str(ROOT / (name + '-raw.wav')), 'wb') as w:
        w.setparams((2, 2, SR, len(left), 'NONE', 'not compressed'))
        frames = bytearray()
        for l, r in zip(left, right):
            frames += struct.pack('<hh', int(l / peak * 25000), int(r / peak * 25000))
        w.writeframes(frames)


egg = []
# Warm low plucked ostinato; rhythm stops before the answer rather than looping a pad.
for i in range(20):
    at = .2 + i * .435
    egg.append((at, .25, [130.81, 164.81, 196, 164.81][i % 4], .12, 'wood', (-.3 if i % 2 else .3)))
for at, freq, pan in [(1.97, 140, 0), (2.7, 190, -.65), (3.9, 170, 0), (4.35, 215, .65), (5.8, 145, -.65), (6.0, 260, 0), (6.88, 105, .2), (7.6, 200, .5), (8.75, 145, 0), (10.1, 185, .6), (10.55, 185, -.6), (11.15, 110, 0), (13.85, 140, 0), (14.15, 185, .5)]:
    egg.append((at, .32, freq, .35, 'wood', pan))
for at in [2.7, 4.35, 7.6]:
    egg.append((at, .65, 100, .09, 'swoop', 0))
egg.append((12.4, 1.2, 130, .11, 'swoop', .5))
for i, f in enumerate([261.63, 329.63, 392, 523.25]):
    egg.append((11.4 + i * .11, 1.3, f, .12, 'pluck', (i - 1.5) * .2))
make('egg', 15, egg)

# Initial pressure design; kept below the discrete shell rupture and resolving tail.
corn = [(0, .6, 80, .14, 'wood', 0), (34 / 30, .35, 300, .12, 'pluck', -.3)]
for i in range(9):
    corn.append((111 / 30 + i * .32, .22, 80 + i * 12, .07 + i * .008, 'wood', math.sin(i) * .4))
corn.extend([(215 / 30, .16, 170, .15, 'wood', -.3), (221 / 30, .16, 190, .15, 'wood', .3), (227 / 30, .16, 160, .15, 'wood', 0), (250 / 30, .65, 80, .75, 'pop', 0), (8.55, .3, 210, .12, 'wood', -.4), (8.7, .3, 280, .12, 'wood', .4)])
for i, f in enumerate([130.81, 196, 261.63, 329.63]):
    corn.append((294 / 30 + i * .08, 3.4, f, .07, 'pluck', (i - 1.5) * .3))
make('popcorn', 13.5, corn, lambda t: (.015 + max(0, min(1, (t - 2.5) / 5.4)) ** 2 * .3) if t < 239 / 30 else (.25 * math.exp(-(t - 250 / 30) * 7) if t >= 250 / 30 else 0))
print('Original sound-design WAVs:', ROOT)
