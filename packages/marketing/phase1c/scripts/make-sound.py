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

ROOT = Path('/Volumes/T9/Developer/Builds/recipefix-acquisition-pilot-20261029/audio')
info = subprocess.check_output(['diskutil', 'info', '/Volumes/T9'], text=True)
if 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' not in info or 'FileVault:                 Yes' not in info:
    raise SystemExit('Expected encrypted T9 required')
ROOT.mkdir(parents=True, exist_ok=True)
SR = 48000


def make(name, seconds, events, texture=None):
    rng = random.Random(1029)
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


events=[]
for i in range(31):
    at=.12+i*.48
    if 8.9<at<10.2: continue
    events.append((at,.26,[130.81,196,164.81,146.83][i%4],.10,'wood',(-.3 if i%2 else .3)))
for at,freq,pan in [(.35,110,-.4),(.75,130,.3),(1.15,105,0),(2.4,145,0),(4.2,180,0),(4.8,190,-.3),(5.6,175,.3),(7.1,150,0),(10.3,125,0),(11.2,155,-.4),(12.6,155,.3),(13.4,155,-.3),(15.2,130,0)]:
    events.append((at,.3,freq,.27,'wood',pan))
for at in [10,11.2,12.5,13.1]: events.append((at,.5,90,.08,'swoop',0))
for i,freq in enumerate([130.81,196,261.63,329.63]): events.append((17.3+i*.12,2.1,freq,.1,'pluck',(i-1.5)*.2))
events=[((at-1.2 if at>=9 else at),duration,freq,amp,kind,pan) for at,duration,freq,amp,kind,pan in events]
make('score',18.1,events)
print('Original18.1s score rendered to',ROOT)
