# icon.py — 用 GLB 飞机渲染 App 图标 (apple-touch-icon / PWA)
# 用法: blender -b -P icon.py -- <plane.glb> <outdir>
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
scene = bpy.context.scene

# 载入后把飞机略微放大居中
objs = [o for o in scene.objects]
for o in objs:
    if o.type == 'MESH':
        for m in o.data.materials:
            if m and m.use_nodes:
                b = m.node_tree.nodes.get('Principled BSDF')
                if b and 'Roughness' in b.inputs:
                    b.inputs['Roughness'].default_value = 0.45

# ---- 天空渐变世界 ----
w = bpy.data.worlds.new('sky')
scene.world = w
w.use_nodes = True
nt = w.node_tree
nt.nodes.clear()
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB')
bg = nt.nodes.new('ShaderNodeBackground')
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(tc.outputs['Window'], sep.inputs['Vector'])
nt.links.new(sep.outputs['Y'], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.72, 0.9, 1.0, 1)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (0.10, 0.38, 1.0, 1)
bg.inputs['Strength'].default_value = 0.85

# ---- 云 (自发光白球) ----
cm = bpy.data.materials.new('cloud')
cm.use_nodes = True
cb = cm.node_tree.nodes.get('Principled BSDF')
cb.inputs['Base Color'].default_value = (1, 1, 1, 1)
if 'Emission Color' in cb.inputs:
    cb.inputs['Emission Color'].default_value = (1, 1, 1, 1)
    cb.inputs['Emission Strength'].default_value = 0.9
for (x, y, z, r) in [(-4.5, 2.5, -4.2, 2.1), (-2.2, 3.5, -4.6, 2.6), (0.4, 3.0, -4.8, 2.3), (3.2, 2.0, -4.4, 2.5), (5.4, 1.0, -4.0, 1.8), (-6.2, 0.5, -3.8, 1.5)]:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
    o = bpy.context.active_object
    o.scale = (1.0, 1.0, 0.62)
    o.data.materials.append(cm)
    for p in o.data.polygons:
        p.use_smooth = False

# ---- 光 ----
sun = bpy.data.lights.new('sun', 'SUN')
sun.energy = 2.3
sun.color = (1.0, 0.96, 0.88)
so = bpy.data.objects.new('sun', sun)
scene.collection.objects.link(so)
so.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))

# ---- 相机 ----
cam = bpy.data.cameras.new('cam')
cam.lens = 42
co = bpy.data.objects.new('cam', cam)
scene.collection.objects.link(co)
scene.camera = co
tgt = bpy.data.objects.new('tgt', None)
scene.collection.objects.link(tgt)
tgt.location = (-0.3, 0.2, -0.1)
co.location = (-7.6, 7.4, 3.4)
con = co.constraints.new('TRACK_TO')
con.target = tgt
con.track_axis = 'TRACK_NEGATIVE_Z'
con.up_axis = 'UP_Y'

# ---- 渲染 ----
try:
    scene.render.engine = 'BLENDER_EEVEE'
except Exception:
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.render.resolution_percentage = 100
for name, size in (('icon-512', 512), ('icon-192', 192), ('apple-touch-icon', 180)):
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('rendered', scene.render.filepath)
# 可遮罩图标: 与 512 相同
import shutil
shutil.copyfile(os.path.join(OUT, 'icon-512.png'), os.path.join(OUT, 'icon-maskable-512.png'))
