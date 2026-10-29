import runpy,os,pathlib,math,bpy,subprocess
disk=subprocess.check_output(['diskutil','info','/Volumes/T9'],text=True)
assert 'B1ADFFB0-BCCF-441A-8086-365120C88DB7' in disk and __import__('re').search(r'FileVault:\s+Yes',disk), 'Verified encrypted T9 required'
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
os.environ['BUILD_ONLY']='1';here=pathlib.Path(__file__).resolve().parent;g=runpy.run_path(str(here/'kitchen-space.py'));os.environ.pop('BUILD_ONLY')
S=bpy.context.scene;S.render.fps=30;S.frame_end=690;S.render.resolution_percentage=100
out=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/full-v1');out.mkdir(parents=True,exist_ok=True);S.render.filepath=str(out/'frame-')
mat=g['mat'];cube=g['cube'];k=g['k'];A=g['A'];B=g['B'];cam=S.camera
# Remove prototype animation while retaining the single approved illustrative material vocabulary.
for o in bpy.data.objects:
 if o.animation_data:o.animation_data_clear()
 if o.name.startswith('herb fleck'):o.hide_render=True
cam.data.animation_data_clear()
# Six place settings establish a real visual headcount before moving into the kitchen.
ceramic=mat('Warm pale ceramic',(.77,.70,.53),0,.25);linen=mat('Clay linen',(.41,.11,.055),0,.72);wood=mat('Smoked walnut',(.065,.032,.019),0,.45)
cube('Dinner table',(0,-8.4,.65),(5.8,6.5,.25),wood,.15)
for x in[-2.35,2.35]:
 for y in[-5.7,-11.1]:cube('Table leg',(x,y,.18),(.18,.18,1.0),wood,.07)
for i in range(6):
 x=-1.35 if i%2==0 else 1.35;y=-6.3-(i//2)*2.05
 p=bpy.data.objects.new('Place setting '+str(i+1),None);S.collection.objects.link(p)
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.58,depth=.055,location=(0,0,.865));o=bpy.context.object;o.data.materials.append(ceramic);o.parent=p
 bevel=o.modifiers.new('plate rim','BEVEL');bevel.width=.035;bevel.segments=3;o.modifiers.new('Normals','WEIGHTED_NORMAL')
 bpy.ops.mesh.primitive_torus_add(major_radius=.56,minor_radius=.052,major_segments=64,minor_segments=12,location=(0,0,.90));o=bpy.context.object;o.data.materials.append(ceramic);o.parent=p
 nap=cube('Folded napkin',(0,0,.94),(.40,.72,.045),linen,.025);nap.parent=p
 for sx in[-.78,.78]:
  o=cube('Silver cutlery',(sx,0,.91),(.045,.91,.025),g['steel'],.02);o.parent=p
  if sx<0:
   for j in range(4):o=cube('Fork tine',(sx+(j-1.5)*.035,.47,.91),(.022,.24,.022),g['steel'],.01);o.parent=p
  else:
   bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=1,location=(sx,.47,.91));o=bpy.context.object;o.scale=(.10,.16,.016);o.data.materials.append(g['steel']);o.parent=p
 if i<4:k(p,1,(x,y,0));k(p,690,(x,y,0))
 else:k(p,1,((-7 if x<0 else 7),y,.3));k(p,36,((-7 if x<0 else 7),y,.3));k(p,74+(i-4)*12,(x,y,0));k(p,690,(x,y,0))
# One countertop action: crowd -> split -> sequential chamber -> sauce.
k(A,1,(0,0,0));k(A,278,(0,0,0));k(A,384,(0,0,0));k(A,420,(0,2.4,0));k(A,486,(0,2.4,0));k(A,515,(0,-1.0,0));k(A,550,(-4.0,-1.0,.15));k(A,690,(-4.0,-1.0,.15))
k(B,1,(0,-.1,-.2));k(B,278,(0,-.1,-.2));k(B,384,(0,-3.1,0));k(B,550,(0,-3.1,0));k(B,614,(0,2.4,0));k(B,690,(0,2.4,0))
foods=sorted([o for o in bpy.data.objects if o.name.startswith('Illustrated marinated cut ')],key=lambda o:int(o.name.rsplit(' ',1)[1]))
for i,o in enumerate(foods):
 base=((i%6-2.5)*.71,(i//6-1)*.65,.40);rot=(i*.73)%2.3-.9
 if i<12:k(o,1,base,rot);k(o,278,base,rot)
 else:
  start=(base[0],-4.5,.7);o.hide_render=True;o.keyframe_insert('hide_render',frame=1);o.hide_render=False;o.keyframe_insert('hide_render',frame=98);k(o,1,start,rot);k(o,100+(i-12)*3,start,rot);k(o,168+(i-12)*3,base,rot);k(o,278,base,rot)
 target=(((i%9)%3-1)*1.13,((i%9)//3-1)*.75,.40)
 if i<9:
  k(o,384,target,rot);k(o,420,(target[0],target[1]+2.4,target[2]),rot);k(o,486,(target[0],target[1]+2.4,target[2]),rot);k(o,515,(target[0],target[1]-1.0,target[2]),rot);k(o,550,(target[0]-4.0,target[1]-1.0,target[2]+.15),rot)
  # Same illustrative pieces leave the sheet into the sauce; no cooked color/result transformation.
  a=i*2.399;k(o,588,(-4.0+math.cos(a)*.65,-1.0+math.sin(a)*.6,.62),rot);k(o,690,(-4.0+math.cos(a)*.65,-1.0+math.sin(a)*.6,.62),rot)
 else:k(o,384,(target[0],target[1]-3.1,target[2]),rot);k(o,550,(target[0],target[1]-3.1,target[2]),rot);k(o,614,(target[0],target[1]+2.4,target[2]),rot);k(o,690,(target[0],target[1]+2.4,target[2]),rot)
# A solid, clearly illustrative sauce pot, never a plate of fabricated outcome evidence.
potmat=mat('Blue enamel',(.022,.07,.11),.5,.22);saucemat=mat('Illustrated tomato sauce',(.37,.07,.012),0,.22);saucemat.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.25
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.2,depth=.60,location=(-4,-1,.15));pot=bpy.context.object;pot.data.materials.append(potmat);be=pot.modifiers.new('pot rim softness','BEVEL');be.width=.12;be.segments=4;pot.modifiers.new('Normals','WEIGHTED_NORMAL')
bpy.ops.mesh.primitive_torus_add(major_radius=1.18,minor_radius=.075,major_segments=64,minor_segments=16,location=(-4,-1,.48));bpy.context.object.data.materials.append(g['steel'])
bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=1.1,depth=.04,location=(-4,-1,.45));bpy.context.object.data.materials.append(saucemat)
for x in[-5.45,-2.55]:cube('pot handle',(x,-1,.23),(.48,.24,.14),potmat,.06)
# The actual UI lives on a physical screen in the scene; sequence is bounded before any nutrition/result screen.
phone=Vector((3.05,-.85,1.35));cube('RecipeFix physical phone',phone,(1.16,.15,2.48),g['steel'],.11)
bpy.ops.mesh.primitive_plane_add(size=1,location=(phone.x,phone.y-.082,phone.z));screen=bpy.context.object;screen.name='Genuine recorded RecipeFix UI';screen.rotation_euler.x=math.pi/2;screen.scale=(1.04,2.24,1)
ui=bpy.data.materials.new('Actual UI pixels');ui.use_nodes=True;n=ui.node_tree.nodes;links=ui.node_tree.links;n.clear();tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/ui-0001.png');tex.image.source='SEQUENCE';tex.image_user.frame_duration=45;tex.image_user.frame_start=226;tex.image_user.use_auto_refresh=True;emit=n.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=.9;links.new(tex.outputs['Color'],emit.inputs['Color']);outn=n.new('ShaderNodeOutputMaterial');links.new(emit.outputs['Emission'],outn.inputs['Surface']);screen.data.materials.append(ui)
cube('Phone stand',(3.05,-.85,.22),(1.15,.8,.22),g['steel'],.08)
# Sequence pixels are visible only during their real bounded range. Static endpoint captures prevent missing-texture pink outside it.
screen.hide_render=True;screen.keyframe_insert('hide_render',frame=1);screen.hide_render=False;screen.keyframe_insert('hide_render',frame=226);screen.hide_render=True;screen.keyframe_insert('hide_render',frame=271)
for label,framefile,before in [('before','ui-0001.png',True),('after','ui-0045.png',False)]:
 clone=screen.copy();clone.data=screen.data.copy();S.collection.objects.link(clone);clone.animation_data_clear();m=ui.copy();clone.data.materials.clear();clone.data.materials.append(m);m.node_tree.nodes.get('Image Texture').image=bpy.data.images.load('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/'+framefile);m.node_tree.nodes.get('Image Texture').image.source='FILE';clone.hide_render=not before;clone.keyframe_insert('hide_render',frame=1);clone.hide_render=before;clone.keyframe_insert('hide_render',frame=226 if before else 271)
# Soft dinner-table light keeps all six settings readable from frame one.
bpy.ops.object.light_add(type='AREA',location=(-1.5,-8,7));light=bpy.context.object;light.data.energy=850;light.data.shape='DISK';light.data.size=5;light.data.color=(1,.79,.57);light.rotation_euler=(Vector((0,-8,.7))-light.location).to_track_quat('-Z','Y').to_euler()
# A continuous journey replaces static screens and isolated math cards.
keys=[(1,(5.3,-14.1,9.6),(0,-8.4,.8),40),(96,(5.0,-13.6,9.6),(0,-8.4,.8),40),(150,(4.6,-4.8,4.5),(0,0,.4),46),(204,(5.7,-5.8,5.6),(0,0,.55),43),(235,(5.2,-3.8,3.0),(2.95,-.85,1.3),47),(270,(5.1,-4.1,3.4),(2.95,-.85,1.3),43),(330,(6.4,-8.7,9.5),(0,-.7,.65),42),(415,(5.8,-7.9,9.0),(0,.0,.65),42),(490,(5.0,-7.0,8.2),(0,.8,.8),42),(565,(-.8,-7.2,7.2),(-3.2,-.5,.6),42),(625,(1.5,-6.4,7.4),(-1.3,.0,.65),40),(690,(4.7,-8.5,9.2),(0,.15,.65),42)]
for f,loc,target,lens in keys:cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_euler',frame=f);cam.data.keyframe_insert('lens',frame=f)
# Keep interpolation deterministic with no stateful simulation.
S.render.image_settings.file_format='PNG';bpy.ops.wm.save_as_mainfile(filepath=str(out/'full-scene.blend'))
if os.environ.get('KEYFRAMES'):
 for f in[1,74,168,245,350,440,550,625,689]:S.frame_set(f);S.render.filepath=str(out/('key-'+str(f)+'.png'));bpy.ops.render.render(write_still=True)
else:bpy.ops.render.render(animation=True)
