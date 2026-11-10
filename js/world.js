// 世界：天空、云、浮空岛（低多边形，顶点色 + 平面着色，每座岛合并为一个网格）
import * as THREE from '../lib/three.module.js';
import { mergeGeometries } from '../lib/BufferGeometryUtils.js';
import { t as tr } from './i18n.js';

export const WORLD_R = 690;
const SPREAD = 1.25; // 岛间距放大系数
export const SUN_DIR = new THREE.Vector3(0.5, 0.62, -0.6).normalize();
export const HORIZON = new THREE.Color('#bfe6ff');

// ---------- 随机 ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = mulberry32(1);
const seed = (n) => { R = mulberry32(n); };
const rr = (a, b) => a + (b - a) * R();
const pick = (arr) => arr[(R() * arr.length) | 0];

const COLS = {};
const C = (hex) => COLS[hex] || (COLS[hex] = new THREE.Color(hex));

// ---------- 几何工具 ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);

function G(geo, color, o = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.deleteAttribute('uv');
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
  _q.setFromEuler(_e);
  _m4.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  g.applyMatrix4(_m4);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = typeof color === 'string' ? C(color) : color;
  const j = o.j ?? 0.06;
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (R() - 0.5) * 2 * j;
    for (let v = 0; v < 3; v++) { const idx = (i + v) * 3; col[idx] = c.r * k; col[idx + 1] = c.g * k; col[idx + 2] = c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
const cone = (r, h, seg = 8) => cyl(0, r, h, seg);
const UB = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const UROOF = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0); // 底面半边长 0.707
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

// ---------- 配色 ----------
const PAL = {
  meadow: { top: '#7bdc4e', top2: '#68cc48', rim: '#a4ec68', soil: '#cd8d55', rock: ['#c2a486', '#ab8f74', '#96806a', '#7f6c5f'] },
  autumn: { top: '#c9de4a', top2: '#b9d044', rim: '#e6ee72', soil: '#c98250', rock: ['#c2a486', '#ab8f74', '#96806a', '#7f6c5f'] },
  mint: { top: '#6fe0b0', top2: '#5bd0a4', rim: '#a8f2cf', soil: '#c99a68', rock: ['#b9b4c8', '#a39fb8', '#8e8aa8', '#7a7699'] },
  post: { top: '#7bdc4e', top2: '#68cc48', rim: '#a4ec68', soil: '#cd8d55', rock: ['#c9a888', '#b39478', '#9d826c', '#86715f'] },
  wind: { top: '#86dc4a', top2: '#72cc44', rim: '#b4f070', soil: '#cd8d55', rock: ['#c2a486', '#ab8f74', '#96806a', '#7f6c5f'] },
  light: { top: '#78dc58', top2: '#66cc50', rim: '#f6e3a1', soil: '#d8a96a', rock: ['#a9b8cc', '#94a5bc', '#8093ae', '#6d7f9c'] },
  blossom: { top: '#98ea70', top2: '#84dc68', rim: '#ffc6df', soil: '#cc8c58', rock: ['#c7a68f', '#b09078', '#9a7f6c', '#836e61'] },
  snow: { top: '#f3fbff', top2: '#dcefff', rim: '#ffffff', soil: '#b9c6da', rock: ['#a9b9d2', '#93a6c4', '#8095b6', '#6e84a6'] },
  candy: { top: '#ffb8dc', top2: '#ff9fd0', rim: '#fff2c6', soil: '#ffdca6', rock: ['#f6b9da', '#e9a2cb', '#d98cba', '#c779a8'] },
  rock: { top: '#86d65e', top2: '#74c85a', rim: '#a2e478', soil: '#b99072', rock: ['#b4aea8', '#9d978f', '#88827b', '#736d68'] },
  pine: { top: '#6fd05a', top2: '#5ec054', rim: '#92e070', soil: '#c08658', rock: ['#bd9f82', '#a68a70', '#917763', '#7b6a5c'] },
};
const TREE_G = ['#4cc54f', '#3fb24a', '#62d65c', '#34a548'];

export const ISLANDS = [
  { id: 'home', theme: 'post', x: 0, y: 60, z: 0, r: 36, order: 0 },
  { id: 'wind', theme: 'wind', x: -190, y: 84, z: -250, r: 32, order: 1 },
  { id: 'light', theme: 'light', x: 230, y: 52, z: -330, r: 26, order: 2 },
  { id: 'blossom', theme: 'blossom', x: 330, y: 112, z: 30, r: 30, order: 3 },
  { id: 'snow', theme: 'snow', x: 80, y: 160, z: 340, r: 32, order: 4 },
  { id: 'candy', theme: 'candy', x: -300, y: 76, z: 190, r: 30, order: 5 },
  { id: 'd1', theme: 'meadow', x: -60, y: 102, z: -130, r: 15 },
  { id: 'd2', theme: 'pine', x: 120, y: 92, z: -150, r: 13 },
  { id: 'd3', theme: 'rock', x: -270, y: 48, z: -70, r: 18 },
  { id: 'd4', theme: 'meadow', pal: 'autumn', x: 190, y: 70, z: 190, r: 16 },
  { id: 'd5', theme: 'pine', x: -150, y: 150, z: 310, r: 14 },
  { id: 'd6', theme: 'meadow', pal: 'mint', x: 360, y: 150, z: -170, r: 14 },
  { id: 'd7', theme: 'rock', x: -20, y: 40, z: -340, r: 15 },
  { id: 'd8', theme: 'meadow', pal: 'autumn', x: -410, y: 115, z: -190, r: 16 },
  { id: 'd9', theme: 'pine', x: 440, y: 80, z: 200, r: 14 },
  { id: 'd10', theme: 'meadow', x: 70, y: 112, z: 150, r: 11 },
  { id: 'd11', theme: 'rock', x: -90, y: 175, z: 70, r: 12 },
  { id: 'd12', theme: 'meadow', pal: 'mint', x: 250, y: 195, z: 240, r: 13 },
].map((d, i) => Object.assign(d, { x: d.id === 'home' ? d.x : d.x * SPREAD, z: d.id === 'home' ? d.z : d.z * SPREAD, seed: 100 + i * 17, Dp: d.r * 1.15, pad: { x: 0, z: 0 }, pillars: [], groundH: 0.9 }));

export const ORDER_ISLANDS = ISLANDS.filter((d) => d.order > 0).sort((a, b) => a.order - b.order);

// ---------- 岛体 ----------
function bodyProfile(d) {
  return [[0, 1.0], [2.4, 0.965], [0.3 * d.Dp, 0.8], [0.62 * d.Dp, 0.54], [0.88 * d.Dp, 0.24], [d.Dp, 0]];
}
export function bodyRadius(d, depth) {
  const pr = bodyProfile(d);
  if (depth <= 0) return d.r;
  for (let i = 1; i < pr.length; i++) {
    if (depth <= pr[i][0]) {
      const k = (depth - pr[i - 1][0]) / (pr[i][0] - pr[i - 1][0]);
      return d.r * (pr[i - 1][1] + (pr[i][1] - pr[i - 1][1]) * k);
    }
  }
  return 0;
}

function islandBody(d, pal) {
  const N = 18, Rr = d.r, Dp = d.Dp;
  const out = Array.from({ length: N }, () => 0.9 + R() * 0.2);
  const sm = out.map((v, i) => (v + out[(i + 1) % N] + out[(i + N - 1) % N]) / 3);
  const ph1 = R() * 6.28, ph2 = R() * 6.28;
  const flat = d.order > 0 || d.id === 'home' ? 0.42 * Rr : 0;
  d.hf = (x, z) => {
    const dist = Math.hypot(x, z);
    const e = Math.max(0, 1 - (dist / Rr) * (dist / Rr));
    const k = THREE.MathUtils.smoothstep(dist, flat, flat + Rr * 0.3);
    return (Math.sin(x * 0.19 + ph1) * Math.cos(z * 0.16 + ph2) * 0.5 + Math.sin((x + z) * 0.11 + ph2) * 0.35) * 1.0 * e * k + 0.0;
  };
  const spec = [
    { f: 0.36, y: null }, { f: 0.7, y: null }, { f: 1.0, y: null },
    { f: 0.965, y: -2.4 }, { f: 0.8, y: -0.3 * Dp }, { f: 0.54, y: -0.62 * Dp }, { f: 0.24, y: -0.88 * Dp },
  ];
  const rings = spec.map((s, k) => {
    const ring = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const jr = k >= 3 ? 1 + (R() - 0.5) * 0.14 : 1;
      const rad = s.f * Rr * sm[i] * jr;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      let y = s.y === null ? d.hf(x, z) : s.y * (1 + (R() - 0.5) * 0.07);
      ring.push(new THREE.Vector3(x, y, z));
    }
    return ring;
  });
  const center = new THREE.Vector3(0, d.hf(0, 0), 0);
  const apex = new THREE.Vector3((R() - 0.5) * Rr * 0.12, -Dp, (R() - 0.5) * Rr * 0.12);
  const P0 = new THREE.Vector3(0, -0.35 * Dp, 0);
  const pos = [], col = [];
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nn = new THREE.Vector3(), cc = new THREE.Vector3();
  const tri = (a, b, c, color, j = 0.06) => {
    ab.subVectors(b, a); ac.subVectors(c, a); nn.crossVectors(ab, ac);
    cc.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(P0);
    if (nn.dot(cc) < 0) { const t = b; b = c; c = t; }
    const k = 1 + (R() - 0.5) * 2 * j;
    for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(color.r * k, color.g * k, color.b * k); }
  };
  const band = (A, B, color, j) => {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      if (i & 1) { tri(A[i], A[i2], B[i2], color, j); tri(A[i], B[i2], B[i], color, j); }
      else { tri(A[i], A[i2], B[i], color, j); tri(A[i2], B[i2], B[i], color, j); }
    }
  };
  for (let i = 0; i < N; i++) tri(center, rings[0][(i + 1) % N], rings[0][i], C(pal.top), 0.04);
  band(rings[0], rings[1], C(pal.top2), 0.07);
  band(rings[1], rings[2], C(pal.rim), 0.07);
  band(rings[2], rings[3], C(pal.soil), 0.08);
  band(rings[3], rings[4], C(pal.rock[0]), 0.09);
  band(rings[4], rings[5], C(pal.rock[1]), 0.09);
  band(rings[5], rings[6], C(pal.rock[2]), 0.09);
  for (let i = 0; i < N; i++) tri(rings[6][i], rings[6][(i + 1) % N], apex, C(pal.rock[3]), 0.08);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- 通用道具 ----------
function makeBuilder(d, P) {
  const hf = (x, z) => d.hf(x, z) - 0.12;
  const add = (geo, col, o) => P.push(G(geo, col, o));
  const asm = (x, y, z, ry = 0, s = 1) => {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(_Y, ry), new THREE.Vector3(s, s, s));
    return (geo, col, o = {}) => { const g = G(geo, col, o); g.applyMatrix4(M); P.push(g); };
  };
  const occ = [];
  const reserve = (x, z, r) => occ.push({ x, z, r });
  const free = (minF, maxF, clear, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const a = R() * 6.283, rad = d.r * (minF + (maxF - minF) * Math.sqrt(R()));
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (occ.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + clear)) return { x, z };
    }
    return null;
  };

  const B = {
    hf, add, asm, reserve, free,
    roundTree(x, z, s = 1, cols = TREE_G) {
      const a = asm(x, hf(x, z), z);
      a(cyl(0.3 * s, 0.42 * s, 2.0 * s, 5), '#a9744a');
      const c = pick(cols);
      a(ico(1.75 * s, 0), c, { y: 3.1 * s, sy: 0.92 });
      a(ico(1.15 * s, 0), c, { y: 4.3 * s, x: 0.25 * s, sy: 0.9 });
      reserve(x, z, 1.8 * s);
    },
    pine(x, z, s = 1, snow = false) {
      const a = asm(x, hf(x, z), z);
      a(cyl(0.28 * s, 0.4 * s, 1.5 * s, 5), '#9a6a45');
      const g1 = pick(['#2f9a58', '#38ab60', '#2a8f55']);
      a(cone(2.3 * s, 2.8 * s, 7), g1, { y: 1.1 * s });
      a(cone(1.85 * s, 2.5 * s, 7), snow ? '#cfeee0' : g1, { y: 2.7 * s });
      a(cone(1.3 * s, 2.3 * s, 7), snow ? '#ffffff' : pick(['#3ab463', '#43c06c']), { y: 4.2 * s });
      reserve(x, z, 2.1 * s);
    },
    blossomTree(x, z, s = 1) {
      const a = asm(x, hf(x, z), z);
      a(cyl(0.3 * s, 0.45 * s, 2.2 * s, 5), '#8d5e43');
      const c = pick(['#ff9ec7', '#ffb7d5', '#ff86b8', '#ffc4de']);
      a(ico(1.9 * s, 0), c, { y: 3.3 * s, sy: 0.9 });
      a(ico(1.3 * s, 0), pick(['#ffb7d5', '#ffd0e4']), { y: 4.5 * s, x: -0.3 * s });
      a(ico(1.0 * s, 0), c, { y: 3.4 * s, x: 1.3 * s, z: 0.4 * s });
      reserve(x, z, 2.2 * s);
    },
    house(x, z, o = {}) {
      const w = o.w || 5, dd = o.d || 4, h = o.h || 3, s = o.s || 1;
      const a = asm(x, hf(x, z), z, o.ry || 0, s);
      a(UB, o.wall || '#fff1d6', { sx: w, sy: h, sz: dd });
      a(UROOF, o.roof || '#e8503a', { y: h, sx: (w * 1.2) / 1.414, sy: h * 0.75, sz: (dd * 1.2) / 1.414 });
      a(UB, '#a9744a', { x: 0, y: 0, z: dd / 2 + 0.02, sx: 0.95, sy: 1.8, sz: 0.2 });
      a(UB, '#9fe0ff', { x: -w * 0.3, y: h * 0.5, z: dd / 2 + 0.02, sx: 0.9, sy: 0.9, sz: 0.2 });
      a(UB, '#9fe0ff', { x: w * 0.3, y: h * 0.5, z: dd / 2 + 0.02, sx: 0.9, sy: 0.9, sz: 0.2 });
      a(UB, '#d9d2c4', { x: w * 0.25, y: h + h * 0.4, z: -dd * 0.15, sx: 0.8, sy: h * 0.6, sz: 0.8 });
      reserve(x, z, Math.max(w, dd) * 0.8 * s);
    },
    rock(x, z, s = 1, col = '#b4aea8') {
      const y = hf(x, z);
      add(ico(1.3 * s, 0), col, { x, y: y + 0.4 * s, z, sx: 1.2, sy: 0.8, sz: 1, ry: R() * 3 });
      reserve(x, z, 1.4 * s);
    },
    flower(x, z, col) {
      const y = hf(x, z);
      add(cyl(0.05, 0.05, 0.5, 4), '#3fa34a', { x, y, z });
      add(ico(0.22, 0), col, { x, y: y + 0.55, z });
    },
  };
  return B;
}

// ---------- 各主题 ----------
function themeProps(d, B, anim, isl) {
  const { add, asm, hf, reserve, free } = B;
  const Rr = d.r;
  const padR = 8.2;
  const makePad = () => {
    const y = d.hf(0, 0);
    add(cyl(7.6, 7.6, 0.34, 20), '#ffffff', { y: y + 0.02, j: 0 });
    add(cyl(6.9, 6.9, 0.4, 20), '#5f7088', { y: y + 0.02, j: 0.02 });
    add(cyl(5.2, 5.2, 0.44, 20), '#6d7e96', { y: y + 0.02, j: 0.02 });
    add(UB, '#ffd34a', { sx: 5.6, sy: 0.46, sz: 0.7, y: y + 0.02, j: 0 });
    add(UB, '#ffd34a', { sx: 0.7, sy: 0.46, sz: 5.6, y: y + 0.02, j: 0 });
    reserve(0, 0, padR);
  };
  const scatter = (n, fn, minF = 0.3, maxF = 0.9, clear = 1.2) => {
    for (let i = 0; i < n; i++) { const p = free(minF, maxF, clear); if (p) fn(p.x, p.z, i); }
  };
  const addPillar = (x, z, r0, r1, h) => d.pillars.push({ x: d.x + x, z: d.z + z, r0, r1, h, base: d.y });

  switch (d.theme) {
    case 'post': {
      makePad();
      // 邮局主楼
      const bx = 0, bz = -19;
      const a = asm(bx, d.hf(bx, bz) - 0.1, bz, 0);
      a(UB, '#fff0cc', { sx: 17, sy: 6.4, sz: 9.5 });
      a(UROOF, '#e8483a', { y: 6.4, sx: 21 / 1.414, sy: 4.8, sz: 12.4 / 1.414 });
      a(UB, '#d83a30', { y: 5.9, z: 4.9, sx: 17.4, sy: 0.7, sz: 0.5, j: 0 });
      a(UB, '#a9744a', { x: 0, z: 4.78, sx: 2.4, sy: 3.4, sz: 0.3 });
      a(UB, '#ffd34a', { x: 0, y: 3.6, z: 4.8, sx: 2.8, sy: 0.35, sz: 0.4, j: 0 });
      for (const x of [-6, -3, 3, 6]) a(UB, '#9fe0ff', { x, y: 2.1, z: 4.78, sx: 1.7, sy: 1.9, sz: 0.3 });
      a(UB, '#ffffff', { x: 0, y: 4.5, z: 4.9, sx: 7, sy: 1.3, sz: 0.3, j: 0 });
      a(UB, '#d83a30', { x: 0, y: 4.65, z: 5.05, sx: 5.6, sy: 0.9, sz: 0.2, j: 0 });
      // 钟楼
      const t = asm(-11.5, d.hf(-11.5, -17) - 0.1, -17, 0);
      t(UB, '#fff0cc', { sx: 4.2, sy: 11, sz: 4.2 });
      t(UROOF, '#e8483a', { y: 11, sx: 5.6 / 1.414, sy: 4, sz: 5.6 / 1.414 });
      t(cyl(1.5, 1.5, 0.3, 14), '#ffffff', { y: 8.3, z: 2.2, rx: Math.PI / 2, j: 0 });
      t(UB, '#334', { y: 8.9, z: 2.4, sx: 0.18, sy: 0.9, sz: 0.1, j: 0 });
      t(UB, '#334', { y: 8.9, z: 2.4, sx: 0.8, sy: 0.18, sz: 0.1, j: 0 });
      addPillar(-11.5, -17, 3.2, 2.8, 12);
      reserve(bx, bz, 12); reserve(-11.5, -17, 4);
      // 旗杆
      const f = asm(14, d.hf(14, 8) - 0.1, 8);
      f(cyl(0.18, 0.22, 10, 6), '#ffffff');
      f(UB, '#e8483a', { x: 1.4, y: 8, sx: 2.8, sy: 1.6, sz: 0.12 });
      reserve(14, 8, 1.5);
      // 邮筒 & 包裹堆
      for (const [x, z] of [[11, 3], [-12, 6]]) {
        const m = asm(x, d.hf(x, z) - 0.1, z, 0.4);
        m(UB, '#e8483a', { sx: 1.3, sy: 1.6, sz: 1.0 }); m(cyl(0.65, 0.65, 1.0, 8), '#e8483a', { y: 1.6, rz: Math.PI / 2, x: -0.5, sx: 1, j: 0 }); m(UB, '#ffd34a', { sx: 1.0, sy: 0.15, sz: 0.1, y: 1.1, z: 0.52, j: 0 });
        reserve(x, z, 1.4);
      }
      const pk = asm(-9, d.hf(-9, -5) - 0.1, -5, 0.3);
      pk(UB, '#d9a066', { sx: 1.6, sy: 1.2, sz: 1.4 }); pk(UB, '#c58a52', { x: 1.5, sx: 1.2, sy: 0.9, sz: 1.2 }); pk(UB, '#e6b27a', { x: 0.5, y: 1.2, sx: 1.0, sy: 0.8, sz: 1.0 });
      reserve(-9, -5, 2.2);
      scatter(11, (x, z) => B.roundTree(x, z, rr(0.9, 1.3)), 0.62, 0.93);
      scatter(5, (x, z) => B.rock(x, z, rr(0.6, 1.2)), 0.55, 0.95);
      break;
    }
    case 'wind': {
      makePad();
      const wx = -12, wz = -10;
      const y0 = d.hf(wx, wz) - 0.1;
      const a = asm(wx, y0, wz, 0);
      a(cyl(2.1, 3.2, 10, 8), '#fff4dc');
      a(cone(2.9, 3.4, 8), '#e8483a', { y: 10 });
      a(UB, '#a9744a', { z: 3.0, sx: 1.2, sy: 2.2, sz: 0.3 });
      for (const yy of [4, 6.6]) a(UB, '#9fe0ff', { y: yy, z: 2.55, sx: 0.8, sy: 0.9, sz: 0.3 });
      // 风车叶片 (动画)
      const blades = [];
      for (let k = 0; k < 4; k++) {
        const rz = (k * Math.PI) / 2;
        blades.push(G(UB, '#e8483a', { sx: 0.35, sy: 7.6, sz: 0.2, y: 0.4, rz, z: 0.15 }));
        blades.push(G(UB, '#fff4dc', { sx: 1.5, sy: 5.6, sz: 0.12, y: 1.4, rz, x: 0, z: 0.02, j: 0.02 }).applyMatrix4(new THREE.Matrix4().makeTranslation(Math.cos(rz) * 0.85, Math.sin(rz) * 0.85, 0)));
      }
      blades.push(G(ico(0.8, 0), '#e8483a', { z: 0.2 }));
      const bm = new THREE.Mesh(mergeGeometries(blades), isl.mat);
      bm.position.set(wx, y0 + 8.4, wz + 3.3);
      isl.group.add(bm);
      anim.push((dt) => { bm.rotation.z -= dt * 0.9; });
      addPillar(wx, wz, 3.4, 2.4, 12);
      reserve(wx, wz, 6.5);
      B.house(11, -8, { w: 6, d: 5, h: 3.6, wall: '#e8503a', roof: '#a8362c', ry: -0.5 }); // 红谷仓
      // 麦田
      for (let i = 0; i < 4; i++) {
        const x = 8 + (i % 2) * 7.2 - 4, z = 9 + Math.floor(i / 2) * 3.4;
        add(UB, i % 2 ? '#f3cd4c' : '#e8b83a', { x, y: d.hf(x, z) - 0.1, z, sx: 6.6, sy: 0.5, sz: 2.8, ry: 0.15 });
        reserve(x, z, 3.4);
      }
      // 草垛
      scatter(3, (x, z) => { add(cyl(0.9, 0.9, 1.3, 9), '#e8c24a', { x, y: d.hf(x, z) - 0.1, z, rz: Math.PI / 2 }); }, 0.45, 0.8);
      scatter(10, (x, z) => B.roundTree(x, z, rr(0.9, 1.2)), 0.6, 0.93);
      scatter(10, (x, z) => B.flower(x, z, pick(['#ffffff', '#ffd34a', '#ff7aa8'])), 0.4, 0.9, 0.6);
      break;
    }
    case 'light': {
      makePad();
      const lx = -10, lz = -7;
      const y0 = d.hf(lx, lz) - 0.1;
      const a = asm(lx, y0, lz, 0);
      let yy = 0;
      for (let i = 0; i < 4; i++) {
        const rb = 3.3 - i * 0.35, rt = 3.3 - (i + 1) * 0.35;
        a(cyl(rt, rb, 4.2, 10), i % 2 ? '#ffffff' : '#ff4a3a');
        yy += 4.2;
      }
      a(cyl(2.7, 2.7, 0.55, 10), '#34435e', { y: yy, j: 0.02 });
      a(cyl(1.55, 1.7, 2.4, 10), '#fff3a8', { y: yy + 0.5, j: 0 });
      a(cone(2.3, 2.6, 10), '#ff4a3a', { y: yy + 2.9 });
      a(ico(0.35, 0), '#ffffff', { y: yy + 5.6 });
      const bcy = y0 + yy + 1.7;
      const beamGeo = new THREE.ConeGeometry(7, 70, 14, 1, true).translate(0, -35, 0).rotateZ(-Math.PI / 2);
      const bg = new THREE.Group();
      const bmat = new THREE.MeshBasicMaterial({ color: '#fff4b0', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m1 = new THREE.Mesh(beamGeo, bmat); const m2 = m1.clone(); m2.rotation.y = Math.PI;
      bg.add(m1, m2);
      bg.position.set(lx, bcy, lz);
      isl.group.add(bg);
      anim.push((dt) => { bg.rotation.y += dt * 1.1; });
      addPillar(lx, lz, 3.4, 1.9, yy + 5);
      reserve(lx, lz, 5.5);
      B.house(9, -9, { w: 5, d: 4, h: 3, wall: '#fff1d6', roof: '#2e8fe0', ry: -0.4 });
      scatter(6, (x, z) => B.rock(x, z, rr(0.9, 1.8), '#a9b8cc'), 0.6, 1.0);
      scatter(7, (x, z) => B.pine(x, z, rr(0.8, 1.1)), 0.5, 0.88);
      scatter(3, (x, z) => B.roundTree(x, z, rr(0.8, 1.1)), 0.5, 0.88);
      break;
    }
    case 'blossom': {
      makePad();
      // 池塘
      add(cyl(6.2, 6.2, 0.1, 14), '#5fd8ff', { x: -12, y: d.hf(-12, 8) + 0.05, z: 8, j: 0.03 });
      add(cyl(6.9, 6.9, 0.06, 14), '#f7e0b0', { x: -12, y: d.hf(-12, 8) - 0.01, z: 8, j: 0.03 });
      reserve(-12, 8, 7.2);
      // 凉亭
      const px = 11, pz = -9;
      const a = asm(px, d.hf(px, pz) - 0.1, pz, 0.3);
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) a(cyl(0.22, 0.22, 3.6, 6), '#d8433a', { x, z });
      a(UB, '#a9744a', { y: 3.5, sx: 5.4, sy: 0.35, sz: 5.4 });
      a(UROOF, '#d8433a', { y: 3.85, sx: 8.2 / 1.414, sy: 2.6, sz: 8.2 / 1.414 });
      a(UB, '#f1d9a4', { y: 0, sx: 5.4, sy: 0.35, sz: 5.4 });
      reserve(px, pz, 5.5);
      scatter(13, (x, z) => B.blossomTree(x, z, rr(0.95, 1.4)), 0.45, 0.92, 0.8);
      scatter(18, (x, z) => B.flower(x, z, pick(['#ffffff', '#ffd0e4', '#ffe36a'])), 0.35, 0.95, 0.5);
      // 花瓣
      scatter(22, (x, z) => add(cyl(0.22, 0.22, 0.04, 5), pick(['#ffc4de', '#ffa6cc']), { x, y: d.hf(x, z) + 0.05, z, j: 0.1 }), 0.3, 0.95, 0.2);
      break;
    }
    case 'snow': {
      makePad();
      const mt = (x, z, r, h, s) => {
        const a = asm(x, d.hf(x, z) - 0.2, z, R() * 3);
        a(cone(r, h, 7), '#8fa6c6', { j: 0.07 });
        a(cone(r * 0.58, h * 0.46, 7), '#ffffff', { y: h * 0.54, j: 0.03 });
        addPillar(x, z, r * 0.96, 0.4, h);
        reserve(x, z, r * 0.9);
      };
      mt(-11, -10, 11, 25);
      mt(11, -12, 7, 15);
      mt(-17, 6, 5.5, 9);
      scatter(10, (x, z) => B.pine(x, z, rr(0.8, 1.2), true), 0.45, 0.92);
      // 小木屋
      B.house(11, 7, { w: 5, d: 4, h: 3, wall: '#9a6a45', roof: '#ffffff', ry: -0.6 });
      // 雪人
      const sx = 5, sz = 12; const s = asm(sx, d.hf(sx, sz) - 0.1, sz, 0.4);
      s(ico(1.1, 1), '#ffffff', { y: 1.0 }); s(ico(0.8, 1), '#ffffff', { y: 2.45 }); s(cone(0.14, 0.7, 5), '#ff8a1f', { y: 2.45, z: 0.7, rx: Math.PI / 2, j: 0 });
      s(ico(0.1, 0), '#223', { y: 2.7, x: -0.25, z: 0.65, j: 0 }); s(ico(0.1, 0), '#223', { y: 2.7, x: 0.25, z: 0.65, j: 0 });
      s(cyl(0.45, 0.45, 0.5, 8), '#e8483a', { y: 3.1, j: 0 });
      reserve(sx, sz, 1.6);
      scatter(6, (x, z) => B.rock(x, z, rr(0.6, 1.2), '#c9d6e8'), 0.5, 0.95);
      break;
    }
    case 'candy': {
      makePad();
      const lolli = (x, z) => {
        const a = asm(x, d.hf(x, z) - 0.1, z, R() * 3);
        a(cyl(0.16, 0.16, 3.8, 6), '#ffffff', { j: 0 });
        const c1 = pick(['#ff4f8b', '#ff9a1f', '#35c6e8', '#8a5cf0', '#41d68a']);
        a(cyl(1.7, 1.7, 0.55, 14), c1, { y: 4.6, rx: Math.PI / 2, z: 0.1, j: 0.03 });
        a(cyl(1.15, 1.15, 0.6, 14), '#ffffff', { y: 4.6, rx: Math.PI / 2, z: 0.1, j: 0.03 });
        a(cyl(0.65, 0.65, 0.65, 12), c1, { y: 4.6, rx: Math.PI / 2, z: 0.1, j: 0.03 });
        reserve(x, z, 1.8);
      };
      const cane = (x, z) => {
        const a = asm(x, d.hf(x, z) - 0.1, z, R() * 3);
        for (let i = 0; i < 6; i++) a(cyl(0.34, 0.34, 0.8, 7), i % 2 ? '#ffffff' : '#ff3f5f', { y: i * 0.8, j: 0 });
        a(cyl(0.34, 0.34, 0.9, 7), '#ff3f5f', { y: 4.8, x: 0.45, rz: Math.PI / 2 + 0.0, j: 0 });
        a(ico(0.38, 0), '#ff3f5f', { y: 4.8, j: 0 });
        reserve(x, z, 1.1);
      };
      const cup = (x, z, s) => {
        const a = asm(x, d.hf(x, z) - 0.1, z, R() * 3, s);
        a(cyl(1.7, 2.1, 2.6, 10), '#e8a56a');
        a(cyl(2.3, 2.3, 0.35, 10), '#ffe9c4', { y: 2.5 });
        a(cone(2.6, 2.6, 10), pick(['#ff9fd0', '#8ff0d0', '#c8a6ff']), { y: 2.85 });
        a(ico(0.45, 0), '#ff2d55', { y: 5.7, j: 0 });
        a(UB, '#a9744a', { z: 2.0, sx: 0.9, sy: 1.5, sz: 0.2 });
        reserve(x, z, 3 * s);
      };
      cup(-11, -9, 1.15); cup(11, -10, 1.0); cup(12, 8, 0.85);
      // 甜甜圈
      const dn = asm(-12, d.hf(-12, 9) + 0.9, 9, 0.5);
      dn(new THREE.TorusGeometry(2.0, 0.95, 6, 14), '#f2b46e', { rx: Math.PI / 2 - 0.5, j: 0.04 });
      dn(new THREE.TorusGeometry(2.0, 0.78, 6, 14), '#ff7ab6', { rx: Math.PI / 2 - 0.5, y: 0.18, j: 0.05 });
      reserve(-12, 9, 3.2);
      scatter(9, (x, z) => lolli(x, z), 0.45, 0.92, 0.8);
      scatter(6, (x, z) => cane(x, z), 0.4, 0.95, 0.6);
      scatter(14, (x, z) => add(ico(0.7, 0), pick(['#ff4f8b', '#ff9a1f', '#35c6e8', '#8a5cf0', '#41d68a', '#ffd34a']), { x, y: d.hf(x, z) + 0.05, z, sy: 0.7 }), 0.3, 0.95, 0.3);
      break;
    }
    case 'meadow': {
      const autumn = d.pal === 'autumn', mint = d.pal === 'mint';
      const cols = autumn ? ['#ff9a3c', '#f5b73f', '#e8683a', '#ffc94a'] : mint ? ['#7be8c5', '#58d6b2', '#9ff0d8'] : TREE_G;
      const n = Math.max(3, Math.round(d.r / 3));
      scatter(n, (x, z) => B.roundTree(x, z, rr(0.8, 1.2), cols), 0.15, 0.85, 0.6);
      if (d.r > 12) B.house(R() * 4 - 2, R() * 4 - 2, { w: 4, d: 3.4, h: 2.6, wall: pick(['#fff1d6', '#ffe0e6', '#e0f4ff']), roof: pick(['#e8503a', '#2e8fe0', '#ff9a1f']), ry: R() * 6 });
      scatter(4, (x, z) => B.rock(x, z, rr(0.6, 1.1)), 0.3, 0.9);
      scatter(10, (x, z) => B.flower(x, z, pick(['#ffffff', '#ffd34a', '#ff7aa8'])), 0.2, 0.9, 0.5);
      break;
    }
    case 'pine': {
      const n = Math.max(5, Math.round(d.r * 0.7));
      scatter(n, (x, z) => B.pine(x, z, rr(0.8, 1.3)), 0.1, 0.85, 0.5);
      scatter(3, (x, z) => B.rock(x, z, rr(0.6, 1.0)), 0.3, 0.9);
      break;
    }
    case 'rock': {
      // 岩柱
      for (let i = 0; i < 4; i++) {
        const p = free(0.0, 0.6, 1.5); if (!p) continue;
        const h = rr(5, 12), r = rr(1.8, 3.2);
        add(cone(r, h, 6), pick(['#a39d96', '#b4aea8', '#8f8982']), { x: p.x, y: d.hf(p.x, p.z) - 0.3, z: p.z, ry: R() * 3 });
        reserve(p.x, p.z, r);
        if (h > 7) addPillar(p.x, p.z, r * 0.9, 0.3, h);
      }
      scatter(3, (x, z) => B.roundTree(x, z, rr(0.8, 1.1)), 0.4, 0.85, 0.8);
      scatter(3, (x, z) => B.rock(x, z, rr(0.6, 1.0)), 0.3, 0.95);
      break;
    }
    default: break;
  }
}

function addUnderside(d, P) {
  const n = Math.round(d.r / 4) + 2;
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, depth = rr(0.28, 0.82) * d.Dp;
    const rad = bodyRadius(d, depth) * 0.97;
    const len = rr(2.4, 5.4) * (d.r / 24 + 0.5);
    const col = pick(['#69f0ff', '#8ee8ff', '#a592ff', '#7bf5d6']);
    P.push(G(cone(len * 0.28, len, 5), col, { x: Math.cos(a) * rad, y: -depth + len * 0.2, z: Math.sin(a) * rad, rx: Math.PI, rz: (R() - 0.5) * 0.7, ry: R() * 3, j: 0.1 }));
  }
  // 漂浮碎石
  for (let i = 0; i < 3; i++) {
    const a = R() * 6.283, rad = d.r * rr(1.15, 1.55);
    P.push(G(ico(rr(0.8, 2.2), 0), pick(['#b4aea8', '#a39d96', '#c2a486']), { x: Math.cos(a) * rad, y: -rr(0.5, 0.45 * d.Dp), z: Math.sin(a) * rad, sy: 0.8, ry: R() * 3 }));
  }
}

// ---------- 云 ----------
function makeCloudGeo(seedN) {
  seed(seedN);
  const parts = [];
  const n = 4 + ((R() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const r = rr(5, 9.5);
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3((i - (n - 1) / 2) * 6.2 + rr(-1.5, 1.5), rr(0, 2.5) + (i % 2 ? 1.6 : 0), rr(-3, 3)),
      new THREE.Quaternion(), new THREE.Vector3(1, 0.7, 1),
    ));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const top = C('#ffffff'), bot = C('#bcd8ff');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp((pos.getY(i) + 3) / 9, 0, 1);
    tmp.copy(bot).lerp(top, k);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------- 文字标签 ----------
function labelTexture(text, accent) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = '800 54px ui-rounded, "SF Pro Rounded", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
  const w = Math.min(480, c.measureText(text).width + 100);
  const x = (512 - w) / 2;
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.beginPath();
  if (c.roundRect) c.roundRect(x, 18, w, 92, 46);
  else { const r = 46, y = 18, h = 92; c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  c.fill();
  c.fillStyle = accent; c.beginPath(); c.arc(x + 44, 64, 15, 0, 7); c.fill();
  c.fillStyle = '#14305c'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.fillText(text, x + 72, 67);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 世界 ----------
export function createWorld(scene, opts = {}) {
  const lite = !!opts.lite;
  const anim = [];
  const islandMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const world = { islands: ISLANDS, anim, labels: [], clouds: [], balloons: [], mat: islandMat };

  // 岛
  for (const d of ISLANDS) {
    seed(d.seed);
    const pal = PAL[d.pal || d.theme] || PAL.meadow;
    const P = [];
    const body = islandBody(d, pal);
    P.push(body);
    const group = new THREE.Group();
    group.position.set(d.x, d.y, d.z);
    d.group = group;
    const isl = { group, mat: islandMat };
    const B = makeBuilder(d, P);
    themeProps(d, B, anim, isl);
    addUnderside(d, P);
    const merged = mergeGeometries(P);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, islandMat);
    group.add(mesh);
    scene.add(group);
    d.gate = new THREE.Vector3(d.x + d.pad.x, d.y + 15, d.z + d.pad.z);
  }

  // 云：三种造型 × 多朵
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const cg = [makeCloudGeo(11), makeCloudGeo(23), makeCloudGeo(37)];
  seed(777);
  const nCloud = lite ? 38 : 64;
  for (let i = 0; i < nCloud; i++) {
    const m = new THREE.Mesh(cg[i % 3], cloudMat);
    let x, y, z, tries = 0;
    do {
      const a = R() * 6.283, rad = 80 + Math.sqrt(R()) * 860;
      x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = rr(30, 260); tries++;
    } while (tries < 20 && Math.hypot(x, z) < 90 && y > 30 && y < 140);
    m.position.set(x, y, z);
    const s = rr(1.1, 2.6);
    m.scale.set(s * rr(1, 1.5), s * 0.9, s);
    m.rotation.y = R() * 6.28;
    m.userData.v = rr(1.2, 3.4);
    scene.add(m);
    world.clouds.push(m);
  }
  // 云海 (脚下)
  const nSea = lite ? 40 : 70;
  for (let i = 0; i < nSea; i++) {
    const m = new THREE.Mesh(cg[i % 3], cloudMat);
    const a = R() * 6.283, rad = Math.sqrt(R()) * 1150;
    m.position.set(Math.cos(a) * rad, rr(-34, -14), Math.sin(a) * rad);
    const s = rr(3.2, 5.6);
    m.scale.set(s * 1.3, s * 0.55, s);
    m.rotation.y = R() * 6.28;
    scene.add(m);
  }

  // 热气球
  seed(4242);
  const balloonGeo = (() => {
    const pts = [];
    const cols = ['#ff5a36', '#ffffff', '#ffc21f', '#12b6c6'];
    const sph = new THREE.SphereGeometry(5, 12, 8).toNonIndexed();
    sph.scale(1, 1.15, 1);
    sph.translate(0, 9, 0);
    sph.deleteAttribute('uv');
    sph.computeVertexNormals();
    const pos = sph.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 3) {
      const ang = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
      const c = C(cols[Math.floor((ang / (Math.PI * 2)) * 12) % 4]);
      for (let v = 0; v < 3; v++) { col[(i + v) * 3] = c.r; col[(i + v) * 3 + 1] = c.g; col[(i + v) * 3 + 2] = c.b; }
    }
    sph.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const basket = G(UB, '#a9744a', { sx: 2.2, sy: 1.6, sz: 2.2, y: 0, j: 0.03 });
    const rope = G(cyl(2.4, 0.2, 2.2, 6), '#e0d6c4', { y: 1.5, j: 0 });
    return mergeGeometries([sph, basket, rope]);
  })();
  const bal = [
    { c: [-190, 150, -75], r: 60, s: 0.05 }, { c: [225, 130, 100], r: 80, s: -0.04 },
    { c: [-50, 200, 250], r: 70, s: 0.045 }, { c: [375, 110, -290], r: 55, s: -0.05 },
  ];
  for (const b of bal) {
    const m = new THREE.Mesh(balloonGeo, islandMat);
    m.scale.setScalar(1.15);
    m.userData = { ...b, a: R() * 6.28 };
    scene.add(m);
    world.balloons.push(m);
  }

  // 天空球
  const skyGeo = new THREE.SphereGeometry(1800, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#0f50ff') }, mid: { value: new THREE.Color('#2a9aff') },
      hor: { value: HORIZON.clone() }, low: { value: new THREE.Color('#d8edff') },
      sun: { value: SUN_DIR.clone() },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 top,mid,hor,low,sun;
      void main(){
        float h = vD.y;
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.85, h));
        c = mix(c, low, smoothstep(0.0, -0.25, h));
        float s = max(dot(normalize(vD), sun), 0.0);
        c += vec3(1.0,0.93,0.75) * (pow(s, 600.0) * 2.0 + pow(s, 16.0) * 0.22 + pow(s, 5.0) * 0.10);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  world.sky = sky;

  // 名称标签
  const labelDefs = ISLANDS.filter((d) => d.order >= 0 && d.order <= 5);
  for (const d of labelDefs) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
    sp.position.set(d.x, d.y + (d.id === 'snow' ? 40 : d.id === 'light' ? 42 : 30), d.z);
    sp.renderOrder = 5;
    scene.add(sp);
    world.labels.push({ sp, d });
  }
  world.setLang = () => {
    for (const l of world.labels) {
      const key = l.d.order === 0 ? 'home_name' : 'o' + l.d.order + '_name';
      if (l.sp.material.map) l.sp.material.map.dispose();
      l.sp.material.map = labelTexture(tr(key), l.d.order === 0 ? '#ff5a36' : '#ffc21f');
      l.sp.material.needsUpdate = true;
    }
  };
  world.setLang();

  world.update = (dt, time, cam, showLabels = true) => {
    for (const f of anim) f(dt);
    for (const c of world.clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 920) c.position.x = -920;
    }
    for (const b of world.balloons) {
      const u = b.userData;
      u.a += u.s * dt;
      b.position.set(u.c[0] + Math.cos(u.a) * u.r, u.c[1] + Math.sin(time * 0.6 + u.r) * 3, u.c[2] + Math.sin(u.a) * u.r);
      b.rotation.y = -u.a;
    }
    sky.position.copy(cam);
    for (const l of world.labels) {
      const dist = l.sp.position.distanceTo(cam);
      const s = THREE.MathUtils.clamp(dist * 0.075, 12, 48);
      l.sp.scale.set(s * 4, s, 1);
      l.sp.material.opacity = showLabels ? THREE.MathUtils.clamp((dist - 50) / 60, 0, 0.95) : 0;
      l.sp.visible = showLabels && dist > 50 && l.d !== world.hideTarget;
    }
  };
  return world;
}

// ---------- 碰撞 ----------
// 返回 0: 无; 1: 擦过岛面(被托起); 2: 撞到岛体(被推开)
export function collide(pos, rad) {
  let res = 0;
  for (const d of ISLANDS) {
    const dx = pos.x - d.x, dz = pos.z - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist > d.r + 40) continue;
    const ty = d.y + d.groundH;
    const depth = ty - pos.y;
    for (const p of d.pillars) {
      const px = pos.x - p.x, pz = pos.z - p.z;
      const pd = Math.hypot(px, pz);
      if (pos.y > p.base - 3 && pos.y < p.base + p.h + rad) {
        const k = THREE.MathUtils.clamp((pos.y - p.base) / p.h, 0, 1);
        const r = p.r0 + (p.r1 - p.r0) * k + rad;
        if (pd < r) {
          const nd = pd < 0.001 ? 1 : pd;
          pos.x = p.x + (px / nd) * r; pos.z = p.z + (pz / nd) * r;
          res = 2;
        }
      }
    }
    if (pos.y < ty + rad && depth < d.Dp + rad) {
      const br = bodyRadius(d, Math.max(0, depth));
      if (dist < br + rad) {
        if (depth < 2.0) {
          if (pos.y < ty + rad) { pos.y = ty + rad; res = Math.max(res, 1); }
        } else {
          const nd = dist < 0.001 ? 1 : dist, tr_ = br + rad;
          pos.x = d.x + (dx / nd) * tr_; pos.z = d.z + (dz / nd) * tr_;
          res = 2;
        }
      }
    }
  }
  return res;
}

const _probe = new THREE.Vector3();
export function blocked(p, rad) {
  _probe.copy(p);
  return collide(_probe, rad) > 0;
}
