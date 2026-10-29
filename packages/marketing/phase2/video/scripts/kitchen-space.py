import bpy,math,random,pathlib,os
from mathutils import Vector
R=random.Random(616);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.render.engine='BLENDER_EEVEE';S.render.resolution_x=1080;S.render.resolution_y=1920;S.render.resolution_percentage=60;S.render.fps=24;S.frame_start=1;S.frame_end=120;S.world.color=(.08,.06,.05);S.view_settings.view_transform='AgX'
if hasattr(S.eevee,'taa_render_samples'):S.eevee.taa_render_samples=24
out=pathlib.Path('/Volumes/T9/Developer/Builds/recipefix-phase2-20261029/video/scratch/space-hero-v2');out.mkdir(parents=True,exist_ok=True)
def mat(n,c,metal=0,rough=.4):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
copper=mat('Copper kiln walls',(.22,.052,.026),.55,.3);floor=mat('Deep petrol kitchen stage',(.018,.075,.09),.25,.32);steel=mat('Folded charcoal steel',(.13,.17,.18),.85,.25);foil=mat('Crinkled foil',(.61,.64,.66),1,.28);gold=mat('Warm plates',(.85,.56,.2),.25,.24)
# One original textured marinade material, not copied from a cooked-result photograph.
food=mat('Illustrated marinated chicken',(.46,.065,.009),0,.30);nodes=food.node_tree.nodes;links=food.node_tree.links;noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;noise.inputs['Detail'].default_value=4;ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.27;ramp.color_ramp.elements[0].color=(.12,.009,.002,1);ramp.color_ramp.elements[1].position=.75;ramp.color_ramp.elements[1].color=(.72,.11,.012,1);links.new(noise.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);fine=nodes.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=48;bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.32;bump.inputs['Distance'].default_value=.04;links.new(fine.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal']);nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.10
pepper=nodes.new('ShaderNodeTexNoise');pepper.inputs['Scale'].default_value=66;pepper.inputs['Detail'].default_value=2;pepperr=nodes.new('ShaderNodeValToRGB');pepperr.color_ramp.elements[0].position=.38;pepperr.color_ramp.elements[0].color=(.08,.025,.008,1);pepperr.color_ramp.elements[1].position=.46;pepperr.color_ramp.elements[1].color=(1,.8,.55,1);links.new(pepper.outputs['Fac'],pepperr.inputs['Fac']);mul=nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=.54;links.new(ramp.outputs['Color'],mul.inputs[1]);links.new(pepperr.outputs['Color'],mul.inputs[2]);links.new(mul.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);nodes.get('Principled BSDF').inputs['Specular IOR Level'].default_value=.28
herb=mat('Cilantro flecks',(.055,.13,.018),0,.55)
def cube(n,loc,dim,m,bevel=.06):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel:mod=o.modifiers.new('Actual rounded edges','BEVEL');mod.width=bevel;mod.segments=4;o.modifiers.new('Normals','WEIGHTED_NORMAL')
 return o
cube('Stage',(0,1,-.25),(22,24,.35),floor,.1)
# A single physical broiler space frames the upper stage; no appliance-detection claim.
cube('Copper wall',(0,4.1,1.9),(6.3,.25,4.2),copper,.12)
for x in[-3.15,3.15]:cube('broiler side',(x,2.35,1.5),(.2,3.5,3.5),copper,.1)
for x in[-2.35,-1.2,0,1.2,2.35]:
 o=cube('One glowing overhead element',(x,2.4,3.3),(.045,2.7,.045),gold,.02)
 m=mat('element glow'+str(x),(1,.19,.015),0,.25);m.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.11,.005,1);m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=4;o.data.materials.clear();o.data.materials.append(m)
def tray(n):
 p=bpy.data.objects.new(n,None);S.collection.objects.link(p)
 for loc,d in [((0,0,.08),(4.75,2.5,.12)),((0,-1.28,.19),(4.85,.08,.24)),((0,1.28,.19),(4.85,.08,.24)),((-2.4,0,.19),(.08,2.6,.24)),((2.4,0,.19),(.08,2.6,.24))]:o=cube(n+' steel rim',loc,d,steel,.06);o.parent=p
 # Folded foil surface: actual displacement, subdued reflections.
 vs=[];fs=[];nx=50;ny=30
 for j in range(ny):
  for i in range(nx):
   x=-2.32+i/(nx-1)*4.64;y=-1.2+j/(ny-1)*2.4;z=.152+.014*math.sin(x*29+math.sin(y*11))+.009*math.sin(y*37+x*5);vs.append((x,y,z))
 for j in range(ny-1):
  for i in range(nx-1):a=j*nx+i;fs.append((a,a+1,a+nx+1,a+nx))
 mesh=bpy.data.meshes.new(n+' foil');mesh.from_pydata(vs,[],fs);mesh.update();o=bpy.data.objects.new(n+' foil',mesh);S.collection.objects.link(o);o.data.materials.append(foil);o.parent=p
 for poly in mesh.polygons:poly.use_smooth=True
 return p
A=tray('A');B=tray('B')
def k(o,f,loc,rot=0):o.location=loc;o.rotation_euler.z=rot;o.keyframe_insert('location',frame=f);o.keyframe_insert('rotation_euler',frame=f)
k(A,1,(0,0,0));k(A,48,(0,0,0));k(A,70,(0,2.4,0));k(A,90,(0,2.4,0));k(A,104,(-6,2.4,0));k(A,120,(-6,2.4,0));k(B,1,(0,-.1,-.2));k(B,44,(0,-.1,-.2));k(B,65,(0,-3.1,0));k(B,100,(0,-3.1,0));k(B,120,(0,2.4,0))
# Irregular high-detail pieces have thickness, marinade valleys and herb flecks.
for i in range(18):
 bpy.ops.mesh.primitive_cube_add(size=1);o=bpy.context.object;o.name='Illustrated marinated cut '+str(i);o.dimensions=(.76+R.random()*.21,.53+R.random()*.19,.31+R.random()*.08);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bevel=o.modifiers.new('Cut edge softness','BEVEL');bevel.width=.105+R.random()*.025;bevel.segments=5;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name)
 sub=o.modifiers.new('Organic cut surface','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
 for v in o.data.vertices:
  q=v.co;q.x+=.026*math.sin(q.y*12+i)+.014*math.cos(q.z*15+i);q.y+=.025*math.cos(q.x*11+i);q.z+=.025*math.sin(q.x*8+q.y*13+i)
 o.data.materials.append(food)
 for poly in o.data.polygons:poly.use_smooth=True
 # First12 occupy a reasonable sheet;6arrive and crowd it. Later all18redistribute9+9.
 base=((i%6-2.5)*.71,(i//6-1)*.65,.40)
 if i<12:start=base
 else:start=(base[0],-4.2,.65)
 k(o,1,start,R.random()*3);k(o,22,base,R.random()*3);k(o,45,base,R.random()*3)
 target=(((i%9)%3-1)*1.13,((i%9)//3-1)*.75,.40)
 if i<9:
  k(o,65,(target[0],target[1],target[2]));k(o,70,(target[0],target[1]+2.4,target[2]));k(o,90,(target[0],target[1]+2.4,target[2]));k(o,104,(target[0]-6,target[1]+2.4,target[2]));k(o,120,(target[0]-6,target[1]+2.4,target[2]))
 else:
  k(o,65,(target[0],target[1]-3.1,target[2]));k(o,100,(target[0],target[1]-3.1,target[2]));k(o,120,(target[0],target[1]+2.4,target[2]))
 # Fine green herb detail is geometric and follows each piece through its parenting.
 for j in range(3):
  leaf=cube('herb fleck',(.1*math.sin(j+i),.1*math.cos(j+i),.8),(.06,.12,.013),herb,.02);leaf.parent=o;leaf.location=(R.uniform(-.22,.22),R.uniform(-.15,.15),.19+R.random()*.025);leaf.rotation_euler.z=R.random()*6
# Cinematic moving camera: tangible macro opening then rise to reveal two sheets/one chamber.
bpy.ops.object.camera_add(location=(5,-6,5));cam=bpy.context.object;cam.data.lens=45;S.camera=cam
for f,loc,target,lens in [(1,(4.6,-4.8,4.2),(0,-.4,.45),48),(30,(4.3,-5.3,5.7),(0,0,.35),43),(65,(5.9,-9.5,10.5),(0,-.3,.5),42),(95,(5.4,-9.0,9.2),(0,.0,.6),42),(120,(4.8,-7.0,7.8),(0,1.0,.7),42)]:
 cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=lens;cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_euler',frame=f);cam.data.keyframe_insert('lens',frame=f)
for loc,power,size,col in [((-3,-2,8),650,4,(1,.80,.59)),((5,0,8),750,3,(.74,.88,1)),((0,4,5),440,2.5,(1,.32,.07))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=col;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
S.render.image_settings.file_format='PNG';S.render.filepath=str(out/'frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'space.blend'))
if os.environ.get('BUILD_ONLY'):
 pass
elif os.environ.get('STILL'):
 S.frame_set(int(os.environ['STILL']));S.render.filepath=str(out/'still.png');bpy.ops.render.render(write_still=True)
else:bpy.ops.render.render(animation=True)
