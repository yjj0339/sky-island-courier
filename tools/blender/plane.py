# plane.py — 珊瑚橙卡通低多边形小飞机 → GLB
# 用法: blender -b -P plane.py -- <out.glb>
# 坐标约定(game): x=机身右侧, y=上, 机头朝 -z。写入 Blender 时映射为 (x, -z, y)，glTF 导出后回到 (x, y, z)。
import bpy, bmesh, math, os, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'plane.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)

COL = dict(
    coral=(1.0, 0.36, 0.22),      # 珊瑚橙 机身
    coral_d=(0.86, 0.24, 0.13),   # 深一点的橙 (机翼下/尾翼)
    cream=(1.0, 0.95, 0.82),      # 奶白 条纹/旋翼罩
    teal=(0.10, 0.72, 0.78),      # 青色点缀
    glass=(0.45, 0.85, 1.0),      # 座舱玻璃
    dark=(0.12, 0.13, 0.18),      # 轮胎/镜框
    gold=(1.0, 0.78, 0.18),       # 金色
    kraft=(0.86, 0.62, 0.36),     # 包裹纸箱
    red=(0.9, 0.12, 0.18),        # 包裹丝带
    skin=(1.0, 0.78, 0.62),
)
MATS = {}
for n, c in COL.items():
    m = bpy.data.materials.new(n)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*c, 1)
    b.inputs['Roughness'].default_value = 0.55
    if 'Metallic' in b.inputs:
        b.inputs['Metallic'].default_value = 0.0
    if n == 'glass':
        b.inputs['Roughness'].default_value = 0.15
        if 'Emission Color' in b.inputs:
            b.inputs['Emission Color'].default_value = (*c, 1)
            b.inputs['Emission Strength'].default_value = 0.25
    m.diffuse_color = (*c, 1)
    MATS[n] = m


def G(v):  # game -> blender
    return Vector((v[0], -v[2], v[1]))


def finish(obj, mat, name, origin=None):
    me = obj.data
    me.materials.clear()
    me.materials.append(MATS[mat])
    for p in me.polygons:
        p.use_smooth = False
    obj.name = name
    me.name = name
    if origin is not None:
        # 把对象原点移动到 origin (game 坐标)，网格保持世界位置不动
        o = G(origin)
        me.transform(__import__('mathutils').Matrix.Translation(-o))
        obj.location = o
    bpy.context.scene.collection.objects.link(obj) if obj.name not in bpy.context.scene.collection.objects else None
    return obj


def mesh_obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    return ob


def hull(points, mat, name, origin=None):
    bm = bmesh.new()
    vs = [bm.verts.new(G(p)) for p in points]
    bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(mesh_obj(bm, name), mat, name, origin)


def loft(sections, mat, name, n=10, caps=(True, True), origin=None):
    # sections: [(z, rx, ry, cy)]  沿 z 放样的椭圆截面
    bm = bmesh.new()
    rings = []
    for (z, rx, ry, cy) in sections:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n + math.pi / n
            ring.append(bm.verts.new(G((rx * math.cos(a), cy + ry * math.sin(a), z))))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if caps[0]:
        bm.faces.new(rings[0][::-1])
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(mesh_obj(bm, name), mat, name, origin)


def prim(kind, loc, scale, mat, name, rot=(0, 0, 0), seg=8, origin=None):
    # 轴对齐基础体 (game 坐标): loc/scale 均为 game 轴向
    if kind == 'sphere':
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=max(3, seg // 2), radius=1)
    elif kind == 'cyl':  # 沿 game y 轴
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=1, depth=2)
    elif kind == 'cone':
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=1, radius2=0, depth=2)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2)
    ob = bpy.context.active_object
    me = ob.data
    # 先在 game 坐标里缩放+旋转，再映射到 blender
    bm = bmesh.new()
    bm.from_mesh(me)
    # blender 原生 z 向上 → 视作 game 的 y 向上，所以先把 blender (x,y,z) 直接当成 game (x,z,-y)?? 为简单起见：
    # 直接在 blender 空间里按 game 轴构造：blender.x=game.x, blender.y=-game.z, blender.z=game.y
    sx, sy, sz = scale  # game 轴尺度
    for v in bm.verts:
        # 原始基础体在 blender 轴: x, y, z。 令基础体 z 轴 = game y 轴
        v.co = Vector((v.co.x * sx, v.co.y * sz, v.co.z * sy))
    rx, ry, rz = rot  # 绕 game x/y/z 旋转(弧度)
    from mathutils import Matrix, Euler
    # game 旋转 → blender 旋转: 轴映射 (x→x, y→z, z→-y)
    Rg = Matrix.Rotation(ry, 3, 'Z') @ Matrix.Rotation(-rz, 3, 'Y') @ Matrix.Rotation(rx, 3, 'X')
    for v in bm.verts:
        v.co = Rg @ v.co + G(loc)
    bm.to_mesh(me)
    bm.free()
    bpy.data.objects.remove(ob, do_unlink=True)
    nob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(nob)
    return finish(nob, mat, name, origin)


objs = []

# ---------- 机身 (放样) ----------
# z 向前为负: 机头 z=-3.0, 机尾 z=+3.6
fus = loft([
    (-3.05, 0.10, 0.10, 0.02),
    (-2.80, 0.46, 0.44, 0.02),
    (-2.30, 0.78, 0.74, 0.02),
    (-1.40, 0.92, 0.86, 0.04),
    (-0.20, 0.88, 0.86, 0.06),
    (1.00, 0.70, 0.70, 0.12),
    (2.20, 0.44, 0.46, 0.20),
    (3.10, 0.24, 0.28, 0.30),
    (3.55, 0.12, 0.16, 0.34),
], 'coral', 'Fuselage', n=10)
objs.append(fus)

# 机身下半的奶白腹部条 (略大一点点的下半截面太复杂 → 用一条奶白腰线)
band = loft([
    (-0.55, 0.935, 0.89, 0.04),
    (0.55, 0.86, 0.855, 0.09),
], 'cream', 'Belt', n=10, caps=(False, False))
objs.append(band)

# 整流罩 / 螺旋桨罩(奶白) + 桨毂
cowl = loft([
    (-3.16, 0.20, 0.20, 0.02),
    (-2.96, 0.52, 0.50, 0.02),
    (-2.62, 0.74, 0.71, 0.02),
], 'cream', 'Cowl', n=10, caps=(True, False))
objs.append(cowl)
spinner = prim('cone', (0, 0.02, -3.38), (0.34, 0.36, 0.34), 'gold', 'Spinner', rot=(-math.pi / 2, 0, 0), seg=8)
objs.append(spinner)

# ---------- 机翼 (上单翼 + 微上反角) ----------
def wing(sign, nm, mat):
    # 翼根在 x=±0.7, 翼尖在 ±3.3; 前缘略后掠
    pts = [
        (sign * 0.55, 0.50, -1.55), (sign * 0.55, 0.40, -1.55), (sign * 0.55, 0.50, 0.55), (sign * 0.55, 0.40, 0.55),
        (sign * 3.35, 0.82, -0.95), (sign * 3.35, 0.74, -0.95), (sign * 3.35, 0.82, 0.10), (sign * 3.35, 0.74, 0.10),
    ]
    return hull(pts, mat, nm)

for s, nm in ((1, 'WingR'), (-1, 'WingL')):
    objs.append(wing(s, nm, 'coral'))
    # 翼尖奶白
    pts = [
        (s * 2.50, 0.77, -1.08), (s * 2.50, 0.69, -1.08), (s * 2.50, 0.77, 0.16), (s * 2.50, 0.69, 0.16),
        (s * 3.40, 0.83, -0.96), (s * 3.40, 0.73, -0.96), (s * 3.40, 0.83, 0.11), (s * 3.40, 0.73, 0.11),
    ]
    objs.append(hull(pts, 'cream', 'WingTip' + ('R' if s > 0 else 'L')))
    # 机翼青色条纹
    pts = [
        (s * 1.4, 0.652, -1.29), (s * 1.4, 0.55, -1.29), (s * 1.4, 0.652, -0.78), (s * 1.4, 0.55, -0.78),
        (s * 2.45, 0.77, -1.09), (s * 2.45, 0.67, -1.09), (s * 2.45, 0.77, -0.62), (s * 2.45, 0.67, -0.62),
    ]
    objs.append(hull(pts, 'teal', 'WingStripe' + ('R' if s > 0 else 'L')))
    # 翼撑杆
    pts = [(s * 0.9, 0.0, -0.4), (s * 0.97, 0.0, -0.3), (s * 2.25, 0.70, -0.5), (s * 2.32, 0.70, -0.4)]
    objs.append(hull(pts, 'cream', 'Strut' + ('R' if s > 0 else 'L')))

# ---------- 尾翼 ----------
fin = hull([
    (-0.06, 0.40, 2.10), (0.06, 0.40, 2.10), (-0.06, 0.40, 3.55), (0.06, 0.40, 3.55),
    (-0.05, 1.75, 3.15), (0.05, 1.75, 3.15), (-0.05, 1.75, 3.55), (0.05, 1.75, 3.55),
], 'coral', 'Fin')
objs.append(fin)
fin_top = hull([
    (-0.065, 1.20, 2.95), (0.065, 1.20, 2.95), (-0.065, 1.20, 3.55), (0.065, 1.20, 3.55),
    (-0.055, 1.77, 3.18), (0.055, 1.77, 3.18), (-0.055, 1.77, 3.56), (0.055, 1.77, 3.56),
], 'cream', 'FinTop')
objs.append(fin_top)
for s, nm in ((1, 'StabR'), (-1, 'StabL')):
    objs.append(hull([
        (s * 0.15, 0.50, 2.35), (s * 0.15, 0.40, 2.35), (s * 0.15, 0.50, 3.55), (s * 0.15, 0.40, 3.55),
        (s * 1.55, 0.54, 3.00), (s * 1.55, 0.46, 3.00), (s * 1.55, 0.54, 3.50), (s * 1.55, 0.46, 3.50),
    ], 'coral_d', nm))

# ---------- 座舱 ----------
canopy = prim('sphere', (0, 0.88, -0.35), (0.62, 0.62, 1.05), 'glass', 'Canopy', seg=10)
objs.append(canopy)
frame = prim('cyl', (0, 0.62, -0.35), (0.70, 0.07, 1.12), 'dark', 'CanopyRim', seg=10)
# 把座舱圈压扁成一圈薄环: cyl 的 depth 沿 game y
objs.append(frame)
# 飞行员 (头 + 护目镜 + 围巾)
head = prim('sphere', (0, 0.95, -0.42), (0.30, 0.30, 0.30), 'skin', 'PilotHead', seg=8)
goggle = prim('cyl', (0, 1.00, -0.62), (0.31, 0.10, 0.12), 'dark', 'Goggles', rot=(math.pi / 2, 0, 0), seg=8)
scarf = prim('cyl', (0, 0.72, -0.30), (0.34, 0.12, 0.34), 'red', 'Scarf', seg=8)
objs += [head, goggle, scarf]

# ---------- 起落架 ----------
for s, nm in ((1, 'R'), (-1, 'L')):
    objs.append(hull([(s * 0.55, -0.55, -1.05), (s * 0.65, -0.55, -0.95), (s * 0.95, -1.35, -1.1), (s * 1.03, -1.35, -1.0)], 'dark', 'Gear' + nm))
    w = prim('cyl', (s * 1.02, -1.42, -1.05), (0.42, 0.20, 0.42), 'dark', 'Wheel' + nm, rot=(0, 0, math.pi / 2), seg=10)
    hub = prim('cyl', (s * 1.14, -1.42, -1.05), (0.20, 0.04, 0.20), 'cream', 'Hub' + nm, rot=(0, 0, math.pi / 2), seg=8)
    objs += [w, hub]
tail_wheel = prim('sphere', (0, -0.15, 3.30), (0.15, 0.15, 0.15), 'dark', 'TailWheel', seg=6)
objs.append(tail_wheel)

# ---------- 机身条纹 / 徽记 ----------
for s, nm in ((1, 'R'), (-1, 'L')):
    objs.append(hull([
        (s * 0.60, 0.10, 0.8), (s * 0.60, 0.40, 0.8), (s * 0.96, 0.10, 0.85), (s * 0.96, 0.40, 0.85),
        (s * 0.60, 0.10, 1.4), (s * 0.60, 0.40, 1.4), (s * 0.95, 0.10, 1.35), (s * 0.95, 0.40, 1.35),
    ], 'teal', 'Badge' + nm))

# ---------- 快递包裹 (挂在机腹, 可单独隐藏/克隆) ----------
parcel = hull([(-0.55, -0.68, -0.55), (0.55, -0.68, -0.55), (-0.55, -1.28, -0.55), (0.55, -1.28, -0.55),
               (-0.55, -0.68, 0.55), (0.55, -0.68, 0.55), (-0.55, -1.28, 0.55), (0.55, -1.28, 0.55)], 'kraft', 'Parcel', origin=(0, -0.98, 0))
ribbon_a = hull([(-0.08, -0.66, -0.57), (0.08, -0.66, -0.57), (-0.08, -1.30, -0.57), (0.08, -1.30, -0.57),
                 (-0.08, -0.66, 0.57), (0.08, -0.66, 0.57), (-0.08, -1.30, 0.57), (0.08, -1.30, 0.57)], 'red', 'ParcelRibbonA', origin=(0, -0.98, 0))
ribbon_b = hull([(-0.57, -0.66, -0.08), (0.57, -0.66, -0.08), (-0.57, -1.30, -0.08), (0.57, -1.30, -0.08),
                 (-0.57, -0.66, 0.08), (0.57, -0.66, 0.08), (-0.57, -1.30, 0.08), (0.57, -1.30, 0.08)], 'red', 'ParcelRibbonB', origin=(0, -0.98, 0))
# 把丝带挂到包裹下 (父子), 这样隐藏 Parcel 即整体隐藏
for r in (ribbon_a, ribbon_b):
    r.parent = parcel
    r.matrix_parent_inverse = __import__('mathutils').Matrix.Translation(parcel.location).inverted()
objs += [parcel, ribbon_a, ribbon_b]

# ---------- 螺旋桨 (独立对象, 原点在桨毂, 绕 game z 旋转) ----------
hub_o = (0, 0.02, -3.52)
b1 = hull([(-0.14, 0.05, -3.52), (0.14, 0.05, -3.52), (-0.10, 1.35, -3.52), (0.10, 1.35, -3.52),
           (-0.14, 0.05, -3.46), (0.14, 0.05, -3.46), (-0.10, 1.35, -3.50), (0.10, 1.35, -3.50)], 'cream', 'PropBladeA', origin=hub_o)
b2 = hull([(-0.14, -0.01, -3.52), (0.14, -0.01, -3.52), (-0.10, -1.31, -3.52), (0.10, -1.31, -3.52),
           (-0.14, -0.01, -3.46), (0.14, -0.01, -3.46), (-0.10, -1.31, -3.50), (0.10, -1.31, -3.50)], 'cream', 'PropBladeB', origin=hub_o)
tip1 = hull([(-0.11, 1.0, -3.53), (0.11, 1.0, -3.53), (-0.10, 1.35, -3.53), (0.10, 1.35, -3.53),
             (-0.11, 1.0, -3.47), (0.11, 1.0, -3.47), (-0.10, 1.35, -3.51), (0.10, 1.35, -3.51)], 'coral', 'PropTipA', origin=hub_o)
tip2 = hull([(-0.11, -1.0, -3.53), (0.11, -1.0, -3.53), (-0.10, -1.31, -3.53), (0.10, -1.31, -3.53),
             (-0.11, -1.0, -3.47), (0.11, -1.0, -3.47), (-0.10, -1.31, -3.51), (0.10, -1.31, -3.51)], 'coral', 'PropTipB', origin=hub_o)
prop = bpy.data.objects.new('Propeller', None)
prop.empty_display_type = 'PLAIN_AXES'
bpy.context.scene.collection.objects.link(prop)
prop.location = G(hub_o)
for b in (b1, b2, tip1, tip2):
    b.parent = prop
    b.matrix_parent_inverse = __import__('mathutils').Matrix.Translation(prop.location).inverted()
objs += [b1, b2, tip1, tip2, prop]

# ---------- 导出 ----------
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_image_format='NONE')
tris = sum(len(o.data.polygons) for o in objs if o.type == 'MESH')
print('exported', OUT, os.path.getsize(OUT) // 1024, 'KB', 'polys', tris)
