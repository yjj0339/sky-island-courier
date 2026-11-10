// 飞机：加载本地 GLB 模型 + 街机飞行模型
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { WORLD_R } from './world.js';

export const CRUISE = 30;
export const BOOST = 56;
export const DASH = 72;
const MAXP = 0.62;
const YAW = 1.28;
export const FLOOR_Y = 20;
export const CEIL_Y = 250;

export async function loadPlaneModel(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => { if (e.total && onProgress) onProgress(e.loaded / e.total); });
  const model = gltf.scene;
  const cache = {};
  model.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const key = src.name || src.uuid;
    if (!cache[key]) {
      const c = src.color.clone();
      const m = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
      if (key === 'glass') {
        m.transparent = true; m.opacity = 0.5; m.depthWrite = false;
        m.emissive = c.clone().multiplyScalar(0.35);
      } else if (key === 'coral' || key === 'coral_d' || key === 'cream' || key === 'teal' || key === 'gold') {
        m.emissive = c.clone().multiplyScalar(0.16);
      }
      cache[key] = m;
    }
    o.material = cache[key];
    o.castShadow = false; o.receiveShadow = false;
  });
  const prop = model.getObjectByName('Propeller');
  const parcel = model.getObjectByName('Parcel');
  if (prop) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.38, 28),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.position.z = -0.02;
    prop.add(disc);
  }
  const box = new THREE.Box3().setFromObject(model);
  const root = new THREE.Group();
  root.add(model);
  return { root, prop, parcel, box };
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class Flight {
  constructor() {
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.reset(new THREE.Vector3(0, 90, 0), 0);
  }

  reset(pos, yaw) {
    this.pos.copy(pos); this.prev.copy(pos);
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.speed = CRUISE; this.energy = 100; this.boostLock = false; this.ringBoost = 0;
    this.turnS = 0; this.climbS = 0; this.boosting = false;
    this.outside = false; this.t = 0;
    this._dirs();
  }

  _dirs() {
    const cp = Math.cos(this.pitch);
    this.fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  ringHit() { this.ringBoost = 1.9; this.energy = Math.min(100, this.energy + 22); this.boostLock = false; }
  bump() { this.speed *= 0.55; this.ringBoost = 0; }

  update(dt, inp, opt = {}) {
    this.t += dt;
    const inv = opt.invert ? -1 : 1;
    const k6 = 1 - Math.exp(-dt * 6.5);
    this.turnS += (inp.turn - this.turnS) * k6;
    this.climbS += (inp.climb * inv - this.climbS) * k6;

    if (this.energy <= 0.5) this.boostLock = true;
    if (this.energy > 24) this.boostLock = false;
    this.boosting = !!inp.boost && !this.boostLock && this.energy > 0 && opt.canBoost !== false;
    if (this.boosting) this.energy = Math.max(0, this.energy - 28 * dt);
    else if (this.ringBoost <= 0) this.energy = Math.min(100, this.energy + 12 * dt);
    this.ringBoost = Math.max(0, this.ringBoost - dt);

    let target = CRUISE;
    if (this.boosting) target = BOOST;
    if (this.ringBoost > 0) target = Math.max(target, DASH);
    target += -Math.sin(this.pitch) * 14;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (target > this.speed ? 2.6 : 1.2)));

    const agile = 1 - 0.2 * THREE.MathUtils.clamp((this.speed - CRUISE) / (BOOST - CRUISE), 0, 1.4);
    this.yaw += this.turnS * YAW * agile * dt;

    // 世界边界：温柔地掉头
    const dist = Math.hypot(this.pos.x, this.pos.z);
    this.outside = dist > WORLD_R;
    if (this.outside) {
      const toC = Math.atan2(this.pos.x, this.pos.z);
      const want = toC; // 朝向原点的 yaw: f=(-sin,-cos) 指向 -pos => yaw = atan2(pos.x, pos.z)
      const d = angDiff(want, this.yaw);
      this.yaw += THREE.MathUtils.clamp(d, -1, 1) * dt * (1.4 + Math.min(2.5, (dist - WORLD_R) / 40));
    }

    const pt = this.climbS * MAXP;
    this.pitch += (pt - this.pitch) * (1 - Math.exp(-dt * 3.4));
    if (this.pos.y > CEIL_Y - 10) this.pitch = Math.min(this.pitch, -0.12 * (this.pos.y - (CEIL_Y - 10)) / 10);
    if (this.pos.y < FLOOR_Y + 8) this.pitch = Math.max(this.pitch, 0.05 + 0.2 * (FLOOR_Y + 8 - this.pos.y) / 8);

    const rt = this.turnS * 0.95;
    this.roll += (rt - this.roll) * (1 - Math.exp(-dt * 5));
    this._dirs();
    this.prev.copy(this.pos);
    this.pos.addScaledVector(this.fwd, this.speed * dt);
    if (this.pos.y < FLOOR_Y) { this.pos.y = FLOOR_Y; this.pitch = Math.max(this.pitch, 0.1); }
    if (this.pos.y > CEIL_Y) this.pos.y = CEIL_Y;
  }

  apply(group, prop, dt, time) {
    group.position.copy(this.pos);
    const wob = Math.sin(time * 1.7) * 0.025;
    group.rotation.set(this.pitch + Math.sin(time * 1.3) * 0.012, this.yaw, this.roll + wob, 'YXZ');
    if (prop) prop.rotation.z += dt * (38 + this.speed * 1.1);
  }
}
