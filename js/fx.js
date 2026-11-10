// 特效：粒子、风环、投递光柱、降落伞包裹
import * as THREE from '../lib/three.module.js';

// ---------- 粒子 ----------
export class Particles {
  constructor(scene, max = 700) {
    this.max = max;
    this.i = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(99);
    this.life = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; varying vec4 vC; uniform float uScale;
        void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
      fragmentShader: `varying vec4 vC;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb, vC.a * a);
        #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.base = new Float32Array(max * 3);
  }

  setViewport(h, dpr) { this.mat.uniforms.uScale.value = h * dpr * 0.62; }

  emit(x, y, z, vx, vy, vz, c, size, life, drag = 0, grav = 0, alpha = 1) {
    const k = this.i; this.i = (this.i + 1) % this.max;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.base[k * 3] = c.r; this.base[k * 3 + 1] = c.g; this.base[k * 3 + 2] = c.b;
    this.col[k * 4 + 3] = alpha; this.a0[k] = alpha;
    this.size0[k] = size; this.life[k] = life; this.age[k] = 0; this.drag[k] = drag; this.grav[k] = grav;
  }

  burst(p, c, n, speed, size = 1.4, life = 0.9) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u);
      const v = speed * (0.35 + Math.random() * 0.75);
      this.emit(p.x, p.y, p.z, s * Math.cos(a) * v, u * v, s * Math.sin(a) * v, c, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), 1.6, 3);
    }
  }

  update(dt) {
    for (let k = 0; k < this.max; k++) {
      const a = this.age[k];
      if (a >= this.life[k]) { if (this.size[k] !== 0) { this.size[k] = 0; } continue; }
      this.age[k] = a + dt;
      const f = Math.max(0, 1 - this.drag[k] * dt);
      this.vel[k * 3] *= f; this.vel[k * 3 + 1] = this.vel[k * 3 + 1] * f - this.grav[k] * dt; this.vel[k * 3 + 2] *= f;
      this.pos[k * 3] += this.vel[k * 3] * dt; this.pos[k * 3 + 1] += this.vel[k * 3 + 1] * dt; this.pos[k * 3 + 2] += this.vel[k * 3 + 2] * dt;
      const t = (a + dt) / this.life[k];
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      this.col[k * 4] = this.base[k * 3]; this.col[k * 4 + 1] = this.base[k * 3 + 1]; this.col[k * 4 + 2] = this.base[k * 3 + 2];
      this.col[k * 4 + 3] = Math.max(0, fade) * this.a0[k];
      this.size[k] = this.size0[k] * (0.55 + 0.45 * (1 - t));
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

// ---------- 风环 ----------
const torusCache = new Map();
function torus(radius, tube) {
  const k = radius + '_' + tube;
  if (!torusCache.has(k)) torusCache.set(k, new THREE.TorusGeometry(radius, tube, 6, 28));
  return torusCache.get(k);
}
const discCache = new Map();
function disc(radius) {
  if (!discCache.has(radius)) discCache.set(radius, new THREE.CircleGeometry(radius, 28));
  return discCache.get(radius);
}
const GOLD = new THREE.Color('#ffc21a');
const GOLD2 = new THREE.Color('#fff0a8');

export function makeRing(radius, big = false) {
  const g = new THREE.Group();
  const tube = big ? 1.05 : 0.85;
  const outer = new THREE.Mesh(torus(radius, tube), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true }));
  const inner = new THREE.Mesh(torus(radius - tube * 1.9, tube * 0.28), new THREE.MeshBasicMaterial({ color: GOLD2, transparent: true, opacity: 0.85 }));
  const glow = new THREE.Mesh(disc(radius - tube), new THREE.MeshBasicMaterial({ color: big ? '#ffe28a' : '#ffd24a', transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  g.add(outer, inner, glow);
  // 四个小箭头提示穿行方向 (朝 -z / +z 都可穿，仅作装饰)
  if (big) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), new THREE.MeshBasicMaterial({ color: '#ff5a36' }));
      m.position.set(Math.cos(a) * (radius + 2.6), Math.sin(a) * (radius + 2.6), 0);
      m.rotation.z = a - Math.PI / 2;
      g.add(m);
    }
  }
  g.userData = { outer, inner, glow, radius, big };
  return g;
}

export function setRingState(g, state, t) {
  const u = g.userData;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  if (state === 'next') {
    u.outer.material.opacity = 1; u.outer.material.color.copy(GOLD);
    u.glow.material.opacity = 0.06 + pulse * 0.07;
    const s = 1 + pulse * 0.045; g.scale.setScalar(s);
  } else if (state === 'wait') {
    u.outer.material.opacity = 0.75; u.glow.material.opacity = 0.03; g.scale.setScalar(1);
  }
}

// ---------- 投递目标：光柱 + 地面光圈 ----------
export function makeBeacon() {
  const g = new THREE.Group();
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { c: { value: new THREE.Color('#ffd45c') }, t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 c; uniform float t;
      void main(){ float a = pow(1.0 - vUv.y, 1.5) * 0.5 * (0.82 + 0.18 * sin(t * 3.0 + vUv.y * 12.0)); gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
      }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 3.2, 160, 14, 1, true).translate(0, 80, 0), beamMat);
  const padMat = new THREE.MeshBasicMaterial({ color: '#ffd45c', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const pad = new THREE.Mesh(new THREE.RingGeometry(5.6, 7.8, 36).rotateX(-Math.PI / 2), padMat);
  pad.position.y = 0.5;
  g.add(beam, pad);
  g.userData = { beamMat, pad, padMat };
  return g;
}

// ---------- 降落伞包裹 ----------
export function makeParcelDrop() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: '#d9a066', flatShading: true }));
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.14, 1.44), new THREE.MeshLambertMaterial({ color: '#e8483a' }));
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.14, 0.22), new THREE.MeshLambertMaterial({ color: '#e8483a' }));
  g.add(box, r1, r2);
  const chute = new THREE.Group();
  const cols = ['#ff5a36', '#ffffff'];
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed(), new THREE.MeshBasicMaterial({ color: '#ff5a36', side: THREE.DoubleSide }));
  const pos = dome.geometry.attributes.position, col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(cols[0]), c2 = new THREE.Color(cols[1]);
  for (let i = 0; i < pos.count; i += 3) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i)) + Math.PI;
    const c = Math.floor((a / (Math.PI * 2)) * 10) % 2 ? c2 : c1;
    for (let v = 0; v < 3; v++) { col[(i + v) * 3] = c.r; col[(i + v) * 3 + 1] = c.g; col[(i + v) * 3 + 2] = c.b; }
  }
  dome.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  dome.material.vertexColors = true;
  dome.position.y = 4.4;
  chute.add(dome);
  const lg = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; pts.push(0, 0.5, 0, Math.cos(a) * 3.0, 4.5, Math.sin(a) * 3.0); }
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  chute.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff' })));
  g.add(chute);
  g.userData.chute = chute;
  return g;
}

// ---------- 速度线 ----------
export function makeStreaks(camera, n = 46) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 6);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 11;
  camera.add(lines);
  const st = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, l: 0, v: 0 }));
  const reset = (s, far) => {
    const a = Math.random() * 6.283, r = 3 + Math.random() * 9;
    s.x = Math.cos(a) * r * 1.5; s.y = Math.sin(a) * r * 0.9; s.z = -(far ? 5 + Math.random() * 45 : 50);
    s.l = 2 + Math.random() * 4; s.v = 0.8 + Math.random() * 0.6;
  };
  st.forEach((s) => reset(s, true));
  return {
    lines,
    update(dt, speed, k) {
      mat.opacity = Math.min(0.5, k * 0.55);
      lines.visible = k > 0.02;
      if (!lines.visible) return;
      for (let i = 0; i < n; i++) {
        const s = st[i];
        s.z += speed * s.v * dt * 1.4;
        if (s.z > -1.5) reset(s, false);
        arr[i * 6] = s.x; arr[i * 6 + 1] = s.y; arr[i * 6 + 2] = s.z;
        arr[i * 6 + 3] = s.x; arr[i * 6 + 4] = s.y; arr[i * 6 + 5] = s.z - s.l * (0.6 + k);
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
