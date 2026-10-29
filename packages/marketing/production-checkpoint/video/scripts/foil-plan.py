# Bounded original foil-only insert. No food simulation or cooked-result claim.
import bpy,math,random,pathlib,os
from mathutils import Vector
r=random.Random(44);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.render.engine='BLENDER_EEVEE'
if hasattr(S.eevee,'taa_render_samples'):S.eevee.taa_render_samples=16
S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=100;S.render.fps=30;S.frame_start=1;S.frame_end=96
S.world.color=(.45,.45,.45);S.view_settings.view_transform='AgX'
def material(name,color,metal=0,rough=.4):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
foil=material('Actual-metal-like original foil shader',(.64,.68,.7),1,.23)
n=foil.node_tree.nodes;links=foil.node_tree.links;noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8;noise.inputs['Detail'].default_value=3.4;bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.12;bump.inputs['Distance'].default_value=.012;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
metal=material('Brushed steel rim',(.28,.31,.33),.95,.21);counter=material('Warm limestone',(.54,.48,.37),0,.7)
def cube(name,loc,scale,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:m=o.modifiers.new('rounded working edges','BEVEL');m.width=bevel;m.segments=4;o.modifiers.new('Normals','WEIGHTED_NORMAL')
 return o
cube('stone cooking-plan stage',(0,0,-.26),(30,30,.3),counter,.04)
def tray(name):
 parent=bpy.data.objects.new(name,None);S.collection.objects.link(parent)
 for loc,size in [((0,0,0),(3.35,2.2,.08)),((0,-1.15,.11),(3.56,.12,.27)),((0,1.15,.11),(3.56,.12,.27)),((-1.72,0,.11),(.12,2.35,.27)),((1.72,0,.11),(.12,2.35,.27))]:
  o=cube(name+' steel',loc,size,metal,.09);o.parent=parent
 verts=[];faces=[];nx=65;ny=45
 for j in range(ny):
  y=-1.08+j/(ny-1)*2.16
  for i in range(nx):
   x=-1.64+i/(nx-1)*3.28;z=.065+.012*math.sin(x*25+math.sin(y*19)*2)+.008*math.sin(y*35+x*11)+r.random()*.007;verts.append((x,y,z))
 for j in range(ny-1):
  for i in range(nx-1):a=j*nx+i;faces.append((a,a+1,a+nx+1,a+nx))
 mesh=bpy.data.meshes.new(name+' crumpled foil');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name+' foil lining',mesh);S.collection.objects.link(o);o.data.materials.append(foil);o.parent=parent
 for p in mesh.polygons:p.use_smooth=True
 return parent
A=tray('sheet one');B=tray('sheet two')
def key(o,f,loc,rot=0):o.location=loc;o.rotation_euler=(0,0,rot);o.keyframe_insert('location',frame=f);o.keyframe_insert('rotation_euler',frame=f)
key(A,1,(0,0,0),-.06);key(A,24,(0,1.55,0),-.06);key(A,47,(0,1.55,0),-.06);key(A,68,(-5,1.55,.08),-.06);key(A,96,(-5,1.55,.08),-.06)
key(B,1,(0,0,-.16),-.06);key(B,24,(0,-1.55,.01),.06);key(B,64,(0,-1.55,.01),.06);key(B,96,(0,1.55,.01),-.06)
for o in [A,B]:
 for fc in o.animation_data.action.fcurves if hasattr(o.animation_data.action,'fcurves')else[]:
  for k in fc.keyframe_points:k.interpolation='BEZIER'

active=material('One active warm lane',(.46,.21,.095),.1,.4)
cube('one active heat lane',(0,1.55,-.09),(3.8,2.65,.035),active,.18)
bpy.ops.object.light_add(type='AREA',location=(0,1.55,4));hot=bpy.context.object;hot.data.energy=400;hot.data.color=(1,.42,.16);hot.data.shape='RECTANGLE';hot.data.size=3.6;hot.data.size_y=2.4

# Three softboxes create real specular movement across foil wrinkles.
for loc,power,size,col in [((-3,-2,7),1700,5,(1,.87,.68)),((4,1,6),2100,4,(.75,.84,1)),((0,5,5),1600,3,(1,.64,.34))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.65,-5.2,12));cam=bpy.context.object;cam.rotation_euler=(Vector((0,.05,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=9.1;S.camera=cam
out=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-social-team-20261029/video/scratch/foil-native-v2');out.mkdir(parents=True,exist_ok=True);S.render.image_settings.file_format='PNG';S.render.filepath=str(out/'frame-');S.render.film_transparent=False
# Original source scene + snapshots and a short deterministic image sequence.
bpy.ops.wm.save_as_mainfile(filepath=str(out/'foil-plan.blend'))
if os.environ.get('FOIL_STILL'):
 S.frame_set(int(os.environ['FOIL_STILL']));S.render.filepath=str(out/'still.png');bpy.ops.render.render(write_still=True)
else:bpy.ops.render.render(animation=True)
