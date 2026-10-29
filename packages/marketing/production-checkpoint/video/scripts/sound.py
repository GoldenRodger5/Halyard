import wave,struct,random,math,pathlib,subprocess
R=48000;D=16;final=pathlib.Path(__file__).resolve().parents[1]/'assets/foley.wav';out=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/video/scratch/foley-raw.wav');disk=subprocess.check_output(['diskutil','info','/Volumes/T9'],text=True);assert 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' in disk and 'FileVault:                 Yes' in disk;out.parent.mkdir(parents=True,exist_ok=True);r=random.Random(191);a=[0.0]*(R*D);z=0
for i in range(len(a)):
 t=i/R;n=r.random()*2-1;z=z*.86+n*.14
 # restrained cooking texture and edit punctuation, entirely authored, no samples
 env=.013 if t<2.8 or 5.1<t<7.2 or 9.5<t<13 else .003
 a[i]+=z*env+math.sin(2*math.pi*110*t)*.002
for t in [0,.63,1.35,2.8,5.1,7.2,9.5,10.95,13,14.4]:
 for j in range(int(.14*R)):
  x=j/R;a[int(t*R)+j]+=(r.random()*2-1)*math.exp(-x*43)*.09+math.sin(2*math.pi*(170-90*x)*x)*math.exp(-x*35)*.11
for t in [2.65,5.0,7.1,9.35,10.8,12.85]:
 for j in range(int(.22*R)):
  x=j/R;env=math.sin(math.pi*x/.22)**2;a[int(t*R)+j]+=(r.random()*2-1)*env*.022
with wave.open(str(out),'w')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(R);w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x))*32767))for x in a))

subprocess.run(['ffmpeg','-v','error','-y','-i',str(out),'-af','loudnorm=I=-20:TP=-2:LRA=7','-ar','48000','-ac','2',str(final)],check=True)
