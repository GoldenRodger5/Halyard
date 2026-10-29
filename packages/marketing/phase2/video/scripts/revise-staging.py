"""Single bounded v2 correction to the original film: clear tray/pot staging, continuous pieces over the rim. No material changes."""
import bpy,pathlib,math,os,subprocess,re
from mathutils import Vector
D=subprocess.check_output(['diskutil','info','/Volumes/T9'],text=True);assert 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' in D and re.search(r'FileVault:\s+Yes',D)
root=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch');old=root/'full-v1';out=root/'full-v2';out.mkdir(exist_ok=True)
for i in range(1,515):
 p=out/f'frame-{i:04}.png'
 if not p.exists():os.link(old/f'frame-{i:04}.png',p)
bpy.ops.wm.open_mainfile(filepath=str(old/'full-scene.blend'));S=bpy.context.scene;A=bpy.data.objects['A'];cam=S.camera
# Exact original camera at the join; no cut at the first revised frame.
S.frame_set(515);cam.keyframe_insert('location',frame=515);cam.keyframe_insert('rotation_euler',frame=515);cam.data.keyframe_insert('lens',frame=515)
cam.location=(-.5,-9.7,9.5);cam.rotation_euler=(Vector((-4.5,-2.6,.7))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=41;cam.keyframe_insert('location',frame=565);cam.keyframe_insert('rotation_euler',frame=565);cam.data.keyframe_insert('lens',frame=565)
def k(o,f,loc):o.location=loc;o.keyframe_insert('location',frame=f)
# Clear existing late position keys only; preserve all earlier geometry/material/actions.
for f in[515,550,690]:A.keyframe_delete('location',frame=f)
k(A,515,(0,-1,0));k(A,525,(0,-1,1.05));k(A,545,(-5.4,-4.1,1.05));k(A,550,(-5.4,-4.1,.15));k(A,690,(-5.4,-4.1,.15))
foods=sorted([o for o in bpy.data.objects if o.name.startswith('Illustrated marinated cut ')],key=lambda o:int(o.name.rsplit(' ',1)[1]))
for i,o in enumerate(foods[:9]):
 for f in[515,550,588,690]:o.keyframe_delete('location',frame=f)
 x=(i%3-1)*1.13;y=(i//3-1)*.75
 k(o,515,(x,y-1,.4));k(o,525,(x,y-1,1.45));k(o,545,(x-5.4,y-4.1,1.45));k(o,550,(x-5.4,y-4.1,.55))
 a=i*2.399;dest=(-4+math.cos(a)*.65,-1+math.sin(a)*.6,.62)
 k(o,554+i,(x-5.4,y-4.1,.55));k(o,562+i,(x-5.4,y-4.1,1.55));k(o,579+i,(dest[0],dest[1],1.55));k(o,595+i,dest);k(o,690,dest)
S.frame_start=515;S.frame_end=690;S.render.filepath=str(out/'frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'full-scene.blend'));bpy.ops.render.render(animation=True)
