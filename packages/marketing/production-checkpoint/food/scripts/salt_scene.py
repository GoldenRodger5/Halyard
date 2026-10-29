"""Original local studio illustration, not real measured utensils or brand photography."""
import bpy, math, random, os, subprocess, plistlib, re
from pathlib import Path
volume=plistlib.loads(subprocess.check_output(["diskutil","info","-plist","/Volumes/T9"]))
if volume.get("VolumeUUID")!="B1ADFFB0-BCCF-441A-8086-365120C88DB7" or not volume.get("FileVault"):
 raise RuntimeError("Expected encrypted T9 is not mounted")
tag=os.environ.get("FOOD_STILL_TAG","rebuild")
if not re.fullmatch(r"[A-Za-z0-9_-]+",tag): raise ValueError("Invalid FOOD_STILL_TAG")
base=Path("/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/food")
output=base/"renders"/f"salt-material-{tag}.png"
blend=base/"scratch"/f"salt-scene-{tag}.blend"
if output.exists() or blend.exists(): raise FileExistsError("Preserving existing source render; choose a new FOOD_STILL_TAG")
from mathutils import Vector
random.seed(1029)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, color, metal=0, rough=.3):
 m=bpy.data.materials.new(name);m.use_nodes=True
 n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 return m
steel=material('brushed stainless steel',(.42,.46,.47),.94,.22)
salt=material('translucent white salt',(.93,.94,.87),0,.22)
salt.node_tree.nodes['Principled BSDF'].inputs['Transmission Weight'].default_value=.23
salt.node_tree.nodes['Principled BSDF'].inputs['IOR'].default_value=1.54
salt.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.025
slate=material('charcoal slate',(.026,.036,.036),0,.8)
nodes=slate.node_tree.nodes;links=slate.node_tree.links
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=220;noise.inputs['Detail'].default_value=3
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24;bump.inputs['Distance'].default_value=.035;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(slate)

def spoon(x):
 verts=[(x,-1.3,.07)];faces=[];rings=14;segments=96
 for k in range(1,rings+1):
  r=k/rings
  for i in range(segments):
   a=i*math.tau/segments;verts.append((x+math.cos(a)*.9*r,-1.3+math.sin(a)*1.2*r,.07+.36*r*r))
 for i in range(segments):faces.append((0,1+i,1+(i+1)%segments))
 for k in range(rings-1):
  a=1+k*segments;b=a+segments
  for i in range(segments):j=(i+1)%segments;faces.append((a+i,b+i,b+j,a+j))
 mesh=bpy.data.meshes.new('formed tablespoon');mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new('illustrated tablespoon bowl',mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(steel)
 for p in mesh.polygons:p.use_smooth=True
 mod=obj.modifiers.new('thin metal','SOLIDIFY');mod.thickness=.035
 bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=16,location=(x,1.18,.37));h=bpy.context.object;h.name='rounded spoon handle';h.scale=(.19,1.6,.048);h.data.materials.append(steel)
 for p in h.data.polygons:p.use_smooth=True

def flake_mesh(hollow):
 if hollow:
  verts=[(-.12,-.12,0),(.12,-.12,0),(.12,.12,0),(-.12,.12,0),(0,0,.16),(0,0,.11)]
  faces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)]
 else:
  verts=[(-.1,-.08,0),(.09,-.11,0),(.12,.07,0),(-.07,.11,0),(-.1,-.08,.04),(.09,-.11,.04),(.12,.07,.04),(-.07,.11,.04)]
  faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
 m=bpy.data.meshes.new('hollow pyramid' if hollow else 'flat irregular flake');m.from_pydata(verts,[],faces);m.materials.append(salt);return m
forms=[flake_mesh(True),flake_mesh(False)]
for side,x in enumerate([-1.5,1.5]):
 spoon(x)
 for i in range(125 if side==0 else 220):
  a=random.random()*math.tau;r=math.sqrt(random.random())*.9
  px=x+math.cos(a)*r*.8;py=-1.3+math.sin(a)*r*1.03;z=.18+.2*(1-r)+random.random()*.1
  o=bpy.data.objects.new('illustrative salt crystal',forms[side]);bpy.context.collection.objects.link(o);o.location=(px,py,z);o.rotation_euler=(random.uniform(-.5,.5),random.uniform(-.5,.5),random.random()*math.tau);s=random.uniform(.58,1.05);o.scale=(s,s,s)
 for i in range(12):
  o=bpy.data.objects.new('scattered illustrative salt',forms[side]);bpy.context.collection.objects.link(o);o.location=(x+random.uniform(-1.2,1.2),-3+random.uniform(-.5,.3),.035);o.rotation_euler=(0,0,random.random()*math.tau);o.scale=(.6,.6,.6)

def area(name,loc,power,size,color):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color;obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,-1,0))-obj.location).to_track_quat('-Z','Y').to_euler()
area('large window',(-4,-1,6),1150,5,(1,.94,.85));area('long softbox',(3,3,5),900,3,(.84,.93,1));area('rim',(0,-4,3),350,3,(1,.88,.74))
world=bpy.data.worlds.new('studio ambience');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.32,.33,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35;bpy.context.scene.world=world
bpy.ops.object.camera_add(location=(0,-3.8,10));cam=bpy.context.object;target=Vector((0,.35,0));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=8.3;bpy.context.scene.camera=cam
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.render.resolution_x=1200;s.render.resolution_y=1400;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(output);s.view_settings.view_transform='AgX';s.render.film_transparent=False
bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.render.render(write_still=True)
