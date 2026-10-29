"""Original quiet23s sound bed. Standard-library synthesis; no samples or providers."""
import math, random, wave, array, subprocess, os
from pathlib import Path
info=subprocess.run(['diskutil','info','/Volumes/T9'],capture_output=True,text=True,check=True).stdout
if 'FileVault:                 Yes' not in info or 'Mount Point:               /Volumes/T9' not in info: raise RuntimeError('Expected encrypted T9 must be mounted')
rate=48000; duration=23; rng=random.Random(1028)
notes=[(146.832,220,261.626),(130.813,195.998,246.942),(116.541,174.614,220),(146.832,220,261.626)]
values=array.array('h'); previous=0.0
for i in range(rate*duration):
 t=i/rate; gain=min(1,t/.5,(duration-t)/1.3); chord=notes[min(3,int(t/6))]
 pad=sum(math.sin(2*math.pi*f*t+0.006*math.sin(2*math.pi*.2*t))*0.022 for f in chord)
 # Warm, short low-frequency pulses. No chimes or notification-like tones.
 beat=t%(60/104); bass=math.sin(2*math.pi*chord[0]/2*t)*math.exp(-beat*9)*.055
 n=rng.uniform(-1,1); previous=.92*previous+.08*n
 brush=previous*math.exp(-((beat-.29)/.035)**2)*.026
 transition=sum(math.exp(-((t-x)/.23)**2) for x in [2.8,10.8,18.0])*previous*.055
 value=max(-.95,min(.95,(pad+bass+brush+transition)*gain))
 # A tiny stereo width, without moving the central pulse.
 values.extend([int(value*32767),int((value*.96+math.sin(2*math.pi*chord[1]*t)*.002*gain)*32767)])
out=Path('/Volumes/T9/Developer/Builds/recipefix-product-cinema-20261028/scratch/sound-authored.wav')
with wave.open(str(out),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes(values.tobytes())
final=out.parent.parent/'assets/sound.wav'
subprocess.run(['ffmpeg','-v','error','-i',str(out),'-af','loudnorm=I=-20:TP=-2:LRA=7','-ar','48000','-c:a','pcm_s16le','-y',str(final)],check=True)
print(final)
