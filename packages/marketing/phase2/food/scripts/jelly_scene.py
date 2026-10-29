"""Original stylized gelatin studio illustration; not cooked or measured evidence."""
import bpy, math, os, subprocess, plistlib, random, re
from pathlib import Path
from mathutils import Vector
v=plistlib.loads(subprocess.check_output(['diskutil','info','-plist','/Volumes/T9']))
if v.get('VolumeUUID')!='B1ADFFB0-BCCF-441A-8086-365120C88DB7' or not v.get('FileVault'):raise RuntimeError('Encrypted T9 required')
base=Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/food')
tag=os.environ.get('FOOD_SCENE_TAG','v1')
if not re.fullmatch(r'[a-z0-9-]+',tag):raise ValueError('Invalid scene tag')
out=base/'renders'/f'jelly-studio-{tag}.png'
if out.exists():raise FileExistsError(out)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,rough=.2,trans=0,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Transmission Weight'].default_value=trans;n.inputs['IOR'].default_value=1.38;n.inputs['Metallic'].default_value=metal;return m
jelly=mat('raspberry gelatin illustration',(1,.008,.11),.095,.62);jelly.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.38
plate=mat('glossy lilac porcelain',(.5,.34,.75),.17);floor=mat('warm yellow studio',(.95,.55,.015),.5)
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(floor)
# One continuous scalloped moulded-gel mesh, with real surface curvature.
verts=[];faces=[];nr=42;ns=192
for k in range(nr):
 t=k/(nr-1);z=.2+t*1.45
 r=1.52-.35*t-.18*(t**7)
 if k==0:r=1.43
 for i in range(ns):
  a=math.tau*i/ns;wave=(.075+.035*(1-t))*math.cos(16*a);rr=r+wave
  verts.append((rr*math.cos(a),rr*math.sin(a),z))
for k in range(nr-1):
 for i in range(ns):j=(i+1)%ns;faces.append((k*ns+i,k*ns+j,(k+1)*ns+j,(k+1)*ns+i))
faces.append(tuple((nr-1)*ns+i for i in range(ns)));faces.append(tuple(reversed(range(ns))))
m=bpy.data.meshes.new('scalloped gel mould');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('illustrated raspberry gelatin',m);bpy.context.collection.objects.link(o);o.data.materials.append(jelly)
for p in m.polygons:p.use_smooth=True
bev=o.modifiers.new('soft mould edges','BEVEL');bev.width=.09;bev.segments=3
bpy.ops.mesh.primitive_cylinder_add(vertices=160,radius=2.04,depth=.1,location=(0,0,.12));o=bpy.context.object;o.data.materials.append(plate);bev=o.modifiers.new('rounded porcelain rim','BEVEL');bev.width=.1;bev.segments=5
for p in o.data.polygons:p.use_smooth=True
# Tiny specular droplets, not fruit chunks or measured experimental inputs.
random.seed(2)
for i in range(7):
 a=random.random()*math.tau;r=1.7+random.random()*.15
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.045,location=(math.cos(a)*r,math.sin(a)*r,.21));bpy.context.object.scale.z=.35;bpy.context.object.data.materials.append(jelly)
def area(name,loc,power,size,col):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=col;o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
area('big softbox',(-3,-4,6),850,4,(1,.9,.76));area('pink glass rim',(4,1,5),1100,3,(1,.9,.96));area('topbox',(0,4,5),600,3,(.75,.85,1))
w=bpy.data.worlds.new('gold studio ambient');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.8,.65,.35,1);w.node_tree.nodes['Background'].inputs[1].default_value=.35;bpy.context.scene.world=w
bpy.ops.object.camera_add(location=(4.2,-6.5,4.2));c=bpy.context.object;c.rotation_euler=(Vector((0,0,.7))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=5.3;bpy.context.scene.camera=c
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.render.resolution_x=1080;s.render.resolution_y=1080;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(out);s.view_settings.view_transform='AgX';bpy.ops.wm.save_as_mainfile(filepath=str(base/'scratch'/f'jelly-studio-{tag}.blend'));bpy.ops.render.render(write_still=True)
