"""Original23s music/foley sketch, no samples, voices, downloads or claimed field recording."""
import math,random,wave,struct,pathlib,subprocess,json
SR=48000;D=23;root=pathlib.Path(__file__).resolve().parents[1];scratch=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch');disk=subprocess.check_output(['diskutil','info','/Volumes/T9'],text=True);assert 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' in disk and 'FileVault' in disk;scratch.mkdir(parents=True,exist_ok=True)
r=random.Random(2829);L=[0.]*(SR*D);R=[0.]*(SR*D)
def put(t,values,amp=1,pan=0):
 start=int(t*SR);lg=math.sqrt((1-pan)/2);rg=math.sqrt((1+pan)/2)
 for j,v in enumerate(values):
  k=start+j
  if 0<=k<len(L):L[k]+=v*amp*lg;R[k]+=v*amp*rg

def pluck(hz,length=1.4):
 out=[]
 for j in range(int(SR*length)):
  t=j/SR;attack=min(1,t/.004);v=math.sin(2*math.pi*hz*t)*math.exp(-t*4)+.28*math.sin(2*math.pi*hz*2.01*t)*math.exp(-t*12)+.10*math.sin(2*math.pi*hz*3.98*t)*math.exp(-t*25);out.append(v*attack)
 return out
chords=[[146.83,174.61,220,329.63],[116.54,174.61,220,293.66],[130.81,174.61,220,261.63],[130.81,196,293.66,329.63]]
# Small original harmonic progression, deliberately not a copied production track.
for beat in range(36):
 t=beat*.625;c=chords[min(3,int(t/5.75))];gate=.38 if 7.35<t<8.9 else 1;put(t,pluck(c[(beat*3)%4]),.023*gate,(-.18 if beat%2 else .18));
 if beat%2==0:put(t,pluck(c[0]/2,2),.021*gate,0)
# Dry hand-percussion pulse gains momentum during the crowding beat, resolves after the second batch.
for beat in range(36):
 t=beat*.625
 vals=[]
 for j in range(4700):
  u=j/SR;vals.append((math.sin(2*math.pi*(90-220*u)*u)*.8+(r.random()*2-1)*.22)*math.exp(-u*43)*min(1,u/.002))
 put(t,vals,.035 if t<19.5 else .018,0)
# Place settings: bright finite clinks, not a generic notification sting.
for t,pan in[(1.5,-.3),(2.48,.3)]:
 vals=[]
 for j in range(int(.55*SR)):
  u=j/SR;vals.append((math.sin(2*math.pi*1550*u)*math.exp(-u*16)+.45*math.sin(2*math.pi*2417*u)*math.exp(-u*22))*.65)
 put(t,vals,.05,pan)
for t in[3.48,3.7,3.92,4.17,4.43,4.7,5.05,5.45]:
 put(t,[((r.random()*2-1)*.55+math.sin(2*math.pi*180*j/SR)*.45)*math.exp(-j/SR*36)for j in range(7200)],.045,0)
# Real captured selection is paired only with authored taps.
for t in[7.58,8.05,8.42]:put(t,[math.sin(2*math.pi*720*j/SR)*math.exp(-j/SR*70)for j in range(3600)],.035,.28)
# Finite cloth/foil/sheet movements and low oven-latch accents follow the actual visual events.
for t,pan,length in[(10,-.25,.8),(11.5,.25,.7),(13.5,0,.5),(16.4,-.2,.45),(17.4,-.4,.65),(18.4,.2,.7),(20.4,0,.5)]:
 vals=[];last=0
 for j in range(int(length*SR)):
  u=j/(length*SR);n=r.random()*2-1;last=.72*last+.28*n;vals.append(last*math.sin(math.pi*u)**2)
 put(t,vals,.10,pan)
for t in[14.05,17.1,20.45]:put(t,pluck(93,.5),.065,0)
# An authored soft pouring texture resolves the first transfer into sauce.
last=0;vals=[]
for j in range(int(1.1*SR)):
 u=j/SR;last=.85*last+.15*(r.random()*2-1);vals.append(last*math.sin(math.pi*u/1.1)**2)
put(18.65,vals,.10,-.35)
put(21.2,pluck(174.61,1.7),.030,-.12);put(21.2,pluck(261.63,1.7),.024,.12)
# Smooth beginning/end and avoid any premature sonic claim from signal validation.
raw=scratch/'score-raw.wav'
with wave.open(str(raw),'w')as w:
 w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);data=[]
 for i,(a,b)in enumerate(zip(L,R)):
  fade=min(1,i/(SR*.025),(len(L)-1-i)/(SR*.4));data.append(struct.pack('<hh',int(max(-1,min(1,a*fade))*32767),int(max(-1,min(1,b*fade))*32767)))
 w.writeframes(b''.join(data))
# Two-pass normalization is measured rather than assumed.
cmd=['ffmpeg','-hide_banner','-i',str(raw),'-af','loudnorm=I=-19:TP=-2:LRA=7:print_format=json','-f','null','-'];p=subprocess.run(cmd,stderr=subprocess.PIPE,text=True,check=True);j=p.stderr[p.stderr.rfind('{'):];m=json.JSONDecoder().raw_decode(j)[0];flt='loudnorm=I=-19:TP=-2:LRA=7:measured_I='+m['input_i']+':measured_TP='+m['input_tp']+':measured_LRA='+m['input_lra']+':measured_thresh='+m['input_thresh']+':offset='+m['target_offset']+':linear=true';subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',flt,'-ar','48000','-ac','2',str(root/'assets/score.wav')],check=True);(scratch/'sound-normalization.json').write_text(json.dumps(m,indent=2));print('Original score created; no auditory quality verdict.')
