"""Bounded original gel-shape animation, not a physical cooking experiment."""
import bpy,math,subprocess,plistlib,os,re
from pathlib import Path
from mathutils import Vector
v=plistlib.loads(subprocess.check_output(['diskutil','info','-plist','/Volumes/T9']))
if v.get('VolumeUUID')!='B1ADFFB0-BCCF-441A-8086-365120C88DB7' or not v.get('FileVault'):raise RuntimeError('Encrypted T9 required')
tag=os.environ.get('FOOD_SCENE_TAG','v1')
if not re.fullmatch(r'[a-z0-9-]+',tag):raise ValueError('Invalid scene tag')
base=Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/food');out=base/'renders'/f'gel-motion-{tag}'
if out.exists():raise FileExistsError(out)
out.mkdir()
bpy.ops.wm.open_mainfile(filepath=str(base/'scratch'/f'jelly-studio-{tag}.blend'))
s=bpy.context.scene
# Retain the original material/light treatment; remove the camera-visible floor.
for o in s.objects:
 if o.type=='MESH' and any(m and m.name=='warm yellow studio' for m in o.data.materials):o.visible_camera=False
s.render.film_transparent=True;s.render.resolution_x=640;s.render.resolution_y=640;s.cycles.samples=12;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.fps=30
obj=s.objects['illustrated raspberry gelatin'];coords=[v.co.copy() for v in obj.data.vertices];cam=s.camera
for f in range(60):
 t=f/30;wave=math.sin(t*math.tau*1.65);bounce=math.cos(t*math.tau*1.65);damp=.85+.15*math.cos(t*math.pi)
 for vert,co in zip(obj.data.vertices,coords):
  h=max(0,min(1,(co.z-.2)/1.45));bend=.14*wave*h*h*damp
  vert.co.x=co.x*(1-.035*bounce*h)+bend;vert.co.y=co.y*(1+.02*bounce*h)+.045*math.sin(t*math.tau*1.65+.7)*h*h;vert.co.z=.2+(co.z-.2)*(1+.045*bounce*damp)
 obj.data.update()
 angle=.035*math.sin(t*math.pi);cam.location=(4.2*math.cos(angle)+6.5*math.sin(angle),4.2*math.sin(angle)-6.5*math.cos(angle),4.2);cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler()
 s.render.filepath=str(out/f'{f:03d}.png');bpy.ops.render.render(write_still=True)
