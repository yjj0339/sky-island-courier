import * as THREE from '../lib/three.module.js';
import { t, apply as applyI18n, onLang, toggleLang, getLang } from './i18n.js';
import { Sfx } from './audio.js';
import { createWorld, ISLANDS, ORDER_ISLANDS, collide, blocked, HORIZON, SUN_DIR, WORLD_R } from './world.js';
import { loadPlaneModel, Flight, CRUISE, BOOST, DASH } from './plane.js';
import { Particles, makeRing, setRingState, makeBeacon, makeParcelDrop, makeStreaks } from './fx.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const rr = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

// ---------- 本地存储 ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('sic.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('sic.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
  },
};

const S = {
  sound: store.get('sound', true),
  invert: store.get('invert', false),
  lite: store.get('lite', false),
  view: store.get('view', 0),
  best: Object.assign({ orders: 0, dash: 0, free: 0 }, store.get('best', {})),
  tipClosed: store.get('tipClosed', false),
};

const G = {
  state: 'loading', // loading | menu | playing | paused | result
  mode: 'orders', menuMode: store.get('mode', 'orders'),
  score: 0, dispScore: 0, combo: 0, bestCombo: 0, ringsPassed: 0, delivered: 0,
  orderIdx: 0, orderT: 0, elapsed: 0, timeLeft: 90, dist: 0,
  rings: [], gate: null, beacon: null, target: null, drops: [], fading: [],
  pars: [], parTotal: 0, ended: false, endTimer: 0,
};

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

// ---------- 渲染器 / 场景 ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(HORIZON);
let dpr = 1;
const maxDpr = () => (S.lite ? 1 : Math.min(window.devicePixelRatio || 1, 2));
dpr = maxDpr();
renderer.setPixelRatio(dpr);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 340, 1700);
const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);
scene.add(camera);
const hemi = new THREE.HemisphereLight('#ffffff', '#a9cdfa', 1.75);
const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
sun.position.copy(SUN_DIR).multiplyScalar(100);
scene.add(hemi, sun);

const shadow = new THREE.Mesh(
  new THREE.CircleGeometry(3, 20).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#0b2a55', transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
);
shadow.visible = false;
scene.add(shadow);
function updateShadow() {
  let best = null;
  for (const d of ISLANDS) {
    const dx = flight.pos.x - d.x, dz = flight.pos.z - d.z;
    if (dx * dx + dz * dz < d.r * d.r * 0.9) {
      const top = d.y + 0.7;
      if (flight.pos.y > top && (!best || top > best.top)) best = { top, d };
    }
  }
  if (!best) { shadow.visible = false; return; }
  const h = flight.pos.y - best.top;
  shadow.visible = h < 90;
  shadow.position.set(flight.pos.x, best.top + 0.05, flight.pos.z);
  shadow.scale.setScalar(1 + h * 0.012);
  shadow.material.opacity = 0.32 * Math.max(0, 1 - h / 90);
  shadow.rotation.y = flight.yaw;
}
const sfx = new Sfx();
sfx.on = S.sound;
const particles = new Particles(scene, 800);
const streaks = makeStreaks(camera);
const flight = new Flight();
const planeGroup = new THREE.Group();
scene.add(planeGroup);
let world, planeParts;

const input = new Input({
  anyKey: () => { sfx.unlock(); if (!sfx.musicTimer && S.sound) sfx.startMusic(); },
  pause: () => { if (G.state === 'playing') setPaused(true); else if (G.state === 'paused') setPaused(false); },
  mute: () => toggleSound(),
  cam: () => cycleView(),
  lang: () => toggleLang(),
  full: () => toggleFull(),
  confirm: () => { if (G.state === 'menu') startGame(G.menuMode); },
});

// ---------- 尺寸 / 方向 ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  particles.setViewport(h, dpr);
  input.layout();
  const portrait = h > w * 1.02;
  const show = portrait && (document.body.classList.contains('touch') || w < 700);
  $('rotate').hidden = !show;
  if (show && G.state === 'playing') setPaused(true);
}
function resizeSoon() { [0, 120, 350, 800].forEach((d) => setTimeout(resize, d)); }
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resizeSoon);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.brief, .card')) e.preventDefault(); }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') setPaused(true); if (!document.hidden) { last = performance.now(); } });

// ---------- Toast / UI 工具 ----------
function toast(text, cls = '') {
  const box = $('toast');
  const el = document.createElement('div');
  el.className = 't ' + cls;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.remove(), 1750);
}
function setIcon(btn, id) { const u = btn.querySelector('use'); if (u) u.setAttribute('href', id); }
function refreshSoundUI() {
  ['bSound', 'mSound'].forEach((id) => { const b = $(id); setIcon(b, S.sound ? '#i-sound' : '#i-mute'); b.classList.toggle('off', !S.sound); });
  $('tSound').classList.toggle('on', S.sound);
}
function toggleSound() {
  S.sound = !S.sound; store.set('sound', S.sound);
  sfx.unlock(); sfx.setOn(S.sound);
  if (S.sound && !sfx.musicTimer) sfx.startMusic();
  refreshSoundUI(); sfx.click();
}
function cycleView() {
  S.view = (S.view + 1) % VIEWS.length; store.set('view', S.view);
  toast(t(S.view === 0 ? 'view_near' : 'view_far'), 'info');
  sfx.click();
}
function toggleFull() {
  const d = document, el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape'); } catch (e) { /* ignore */ } }).catch(() => {});
    }
  } catch (e) { /* ignore */ }
}
const canFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
if (canFull) { $('bFull').hidden = false; $('mFull').hidden = false; }

// ---------- 菜单 ----------
function renderBrief() {
  const el = $('brief'), m = G.menuMode;
  if (m === 'orders') {
    let li = '';
    for (let i = 1; i <= 5; i++) li += `<li><span class="n">${i}</span><span class="t"><b>${t('o' + i + '_name')}</b><small>${t('o' + i + '_note')}</small></span></li>`;
    el.innerHTML = `<h3><svg class="ic"><use href="#i-box"/></svg>${t('brief_orders')}</h3><p>${t('brief_orders_p')}</p><ul class="olist">${li}</ul>`;
  } else {
    const k = m === 'dash' ? 'dash' : 'free';
    el.innerHTML = `<h3><svg class="ic"><use href="#i-${m === 'dash' ? 'ring' : 'free'}"/></svg>${t('brief_' + k + '_t')}</h3><p>${t('brief_' + k + '_p')}</p><ul class="tips"><li>${t('brief_' + k + '_1')}</li><li>${t('brief_' + k + '_2')}</li><li>${t('brief_' + k + '_3')}</li></ul>`;
  }
}
function renderBests() {
  document.querySelectorAll('.mode').forEach((b) => {
    const m = b.dataset.mode;
    b.classList.toggle('sel', m === G.menuMode);
    b.querySelector('.m-best').innerHTML = `${t('best')}<b>${S.best[m] || 0}</b>`;
  });
}
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
  G.menuMode = b.dataset.mode; store.set('mode', G.menuMode);
  sfx.unlock(); sfx.click(); renderBrief(); renderBests();
}));
$('btnStart').addEventListener('click', () => { sfx.unlock(); startGame(G.menuMode); });
['mSound', 'bSound'].forEach((id) => $(id).addEventListener('click', toggleSound));
['mLang', 'bLang'].forEach((id) => $(id).addEventListener('click', () => { sfx.unlock(); sfx.click(); toggleLang(); }));
['mFull', 'bFull'].forEach((id) => $(id).addEventListener('click', toggleFull));
$('bCam').addEventListener('click', cycleView);
$('bPause').addEventListener('click', () => { sfx.unlock(); setPaused(true); });
$('pResume').addEventListener('click', () => setPaused(false));
$('pRestart').addEventListener('click', () => { setPaused(false); startGame(G.mode); });
$('pHome').addEventListener('click', () => goHome());
$('rAgain').addEventListener('click', () => startGame(G.mode));
$('rHome').addEventListener('click', () => goHome());
$('tSound').addEventListener('click', toggleSound);
$('tInvert').addEventListener('click', () => { S.invert = !S.invert; store.set('invert', S.invert); $('tInvert').classList.toggle('on', S.invert); sfx.click(); });
$('tLite').addEventListener('click', () => { S.lite = !S.lite; store.set('lite', S.lite); $('tLite').classList.toggle('on', S.lite); dpr = maxDpr(); resize(); sfx.click(); });
$('tLang').addEventListener('click', () => { toggleLang(); sfx.click(); });
$('installClose').addEventListener('click', () => { $('installTip').hidden = true; S.tipClosed = true; store.set('tipClosed', true); });

function showScreen(id, on) { $(id).hidden = !on; }

function setPaused(p) {
  if (p && G.state === 'playing') {
    G.state = 'paused'; showScreen('pause', true); sfx.setPaused(true); input.clear();
    $('tSound').classList.toggle('on', S.sound); $('tInvert').classList.toggle('on', S.invert); $('tLite').classList.toggle('on', S.lite);
  } else if (!p && G.state === 'paused') {
    if (!$('rotate').hidden) return;
    G.state = 'playing'; showScreen('pause', false); sfx.setPaused(false); last = performance.now();
  }
}

function recordFree() {
  if (G.mode === 'free' && G.score > (S.best.free || 0)) { S.best.free = G.score; store.set('best', S.best); }
}
const parcelVis = (v) => { if (planeParts && planeParts.parcel) planeParts.parcel.visible = v; };

function goHome() {
  shadow.visible = false;
  if (G.state === 'paused' || G.state === 'playing') recordFree();
  clearRound();
  G.state = 'menu';
  ['pause', 'result'].forEach((s) => showScreen(s, false));
  $('hud').hidden = true; showScreen('menu', true);
  sfx.setPaused(false); sfx.engine(0, false, false);
  renderBests();
  $('installTip').hidden = !(isIOS && !isStandalone && !S.tipClosed);
  parcelVis(true);
}

// ---------- 对局：环 / 订单 ----------
const VIEWS = [{ dist: 13.5, h: 4.6, look: 9 }, { dist: 24, h: 9.5, look: 12 }];
const camState = { yaw: 0, pitch: 0, shake: 0 };
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
const GOLD = new THREE.Color('#ffd24a');
const WHITE = new THREE.Color('#ffffff');
const RING_R = 8;

function clearRound() {
  for (const r of G.rings) scene.remove(r.g);
  G.rings.length = 0;
  for (const f of G.fading) scene.remove(f.g);
  G.fading.length = 0;
  for (const d of G.drops) scene.remove(d.g);
  G.drops.length = 0;
  if (G.gate) { scene.remove(G.gate.g); G.gate = null; }
  if (G.beacon) { scene.remove(G.beacon); G.beacon = null; }
  G.target = null;
  $('marker').hidden = true;
}

function spawnRing(pos, dir, r = RING_R) {
  const g = makeRing(r, false);
  g.position.copy(pos);
  g.lookAt(V.a.copy(pos).add(dir));
  scene.add(g);
  const ring = { g, pos: pos.clone(), nrm: dir.clone().normalize(), r, state: 'wait' };
  G.rings.push(ring);
  return ring;
}

function freeSpot(p, rad = 14) {
  // 若落在岛体里：尝试上移/下移
  if (!blocked(p, rad)) return true;
  for (const dy of [30, 55, -30, 80]) {
    const q = V.d.copy(p); q.y += dy;
    if (q.y > 60 && q.y < 215 && !blocked(q, rad)) { p.y = q.y; return true; }
  }
  return false;
}

function nextChainRing(fromPos, fromDir) {
  const yaw = Math.atan2(-fromDir.x, -fromDir.z);
  const pitch = Math.asin(clamp(fromDir.y, -1, 1));
  let best = null;
  for (let i = 0; i < 14; i++) {
    let ny = yaw + rr(-0.7, 0.7);
    const np = clamp(pitch * 0.4 + rr(-0.18, 0.2), -0.3, 0.3);
    const dist = Math.hypot(fromPos.x, fromPos.z);
    if (dist > 450) { const toC = Math.atan2(fromPos.x, fromPos.z); ny += angDiff(toC, ny) * clamp((dist - 450) / 160, 0.25, 0.95); }
    const d = new THREE.Vector3(-Math.sin(ny) * Math.cos(np), Math.sin(np), -Math.cos(ny) * Math.cos(np));
    const p = fromPos.clone().addScaledVector(d, rr(78, 118));
    p.y = clamp(p.y, 48, 205);
    const mid = fromPos.clone().lerp(p, 0.5);
    if (!blocked(p, 13) && !blocked(mid, 9)) { best = { p, d: p.clone().sub(fromPos).normalize() }; break; }
    if (!best) best = { p, d: p.clone().sub(fromPos).normalize() };
  }
  freeSpot(best.p, 13);
  return best;
}

function fillChain() {
  let from, dir;
  if (G.rings.length) { const l = G.rings[G.rings.length - 1]; from = l.pos; dir = l.nrm; }
  else { from = V.b.copy(flight.pos).addScaledVector(flight.fwd, 40).clone(); dir = flight.fwd.clone(); dir.y *= 0.3; dir.normalize(); }
  while (G.rings.length < 4) {
    const n = nextChainRing(from, dir);
    spawnRing(n.p, n.d);
    from = n.p; dir = n.d;
  }
  markNext();
}
function markNext() { G.rings.forEach((r, i) => { r.state = i === 0 ? 'next' : 'wait'; }); }

function reseedChain() {
  for (const r of G.rings) scene.remove(r.g);
  G.rings.length = 0;
  fillChain();
}

function setupOrder(i) {
  G.orderIdx = i; G.orderT = 0;
  const isl = ORDER_ISLANDS[i];
  G.target = isl;
  for (const r of G.rings) scene.remove(r.g);
  G.rings.length = 0;
  if (G.gate) scene.remove(G.gate.g);
  if (G.beacon) scene.remove(G.beacon);

  const start = flight.pos.clone();
  const gp = isl.gate.clone();
  const dirH = new THREE.Vector3(gp.x - start.x, 0, gp.z - start.z).normalize();
  const gg = makeRing(10, true);
  gg.position.copy(gp);
  gg.lookAt(V.a.copy(gp).add(dirH));
  scene.add(gg);
  G.gate = { g: gg, pos: gp, nrm: dirH.clone(), r: 10 };
  const bc = makeBeacon();
  bc.position.set(isl.x + isl.pad.x, isl.y + 0.2, isl.z + isl.pad.z);
  scene.add(bc);
  G.beacon = bc;

  const total = start.distanceTo(gp);
  const count = clamp(Math.round(total / 95) - 1, 2, 5);
  const perp = new THREE.Vector3(-dirH.z, 0, dirH.x);
  const side = Math.random() < 0.5 ? 1 : -1;
  const pts = [start];
  for (let j = 1; j <= count; j++) {
    const k = j / (count + 1);
    const p = start.clone().lerp(gp, k);
    p.addScaledVector(perp, Math.sin(k * Math.PI) * 55 * side * (j % 2 ? 1 : 0.4));
    p.y += Math.sin(k * Math.PI) * rr(-8, 20);
    p.y = clamp(p.y, 50, 205);
    freeSpot(p, 14);
    pts.push(p);
  }
  pts.push(gp);
  for (let j = 1; j <= count; j++) {
    const d = pts[j + 1].clone().sub(pts[j - 1]).normalize();
    spawnRing(pts[j], d);
  }
  markNext();
  const par = total / 36 + 9;
  G.pars[i] = par;
  G.parTotal = G.pars.reduce((a, b) => a + (b || 0), 0);
  updateOrderCard(true);
  updateDots();
}

function updateOrderCard(flash) {
  if (G.mode !== 'orders') return;
  const i = G.orderIdx + 1;
  $('orderIdx').textContent = Math.min(i, 5) + '/5';
  $('orderName').textContent = t('o' + Math.min(i, 5) + '_name');
  $('orderNote').textContent = t('o' + Math.min(i, 5) + '_note');
  if (flash) { const c = $('orderCard'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
}
function updateDots() {
  const box = $('routeDots');
  if (box.children.length !== 5) { box.innerHTML = '<i></i><i></i><i></i><i></i><i></i>'; }
  [...box.children].forEach((d, k) => { d.className = G.mode !== 'orders' ? '' : k < G.delivered ? 'done' : k === G.orderIdx && !G.ended ? 'cur' : ''; });
}

function startGame(mode) {
  sfx.unlock(); if (S.sound && !sfx.musicTimer) sfx.startMusic();
  clearRound();
  G.mode = mode; G.state = 'playing'; G.ended = false; G.endTimer = 0;
  G.score = 0; G.dispScore = 0; G.combo = 0; G.bestCombo = 0; G.ringsPassed = 0; G.delivered = 0;
  G.orderIdx = 0; G.orderT = 0; G.elapsed = 0; G.timeLeft = 90; G.dist = 0; G.pars = []; G.parTotal = 0;
  showScreen('menu', false); showScreen('result', false); showScreen('pause', false);
  $('hud').hidden = false;
  $('orderCard').hidden = mode !== 'orders';
  $('timerPill').hidden = mode !== 'dash';
  $('combo').hidden = true;
  $('timerPill').classList.remove('low');
  $('toast').innerHTML = '';
  $('bestHud').textContent = S.best[mode] || 0;
  const home = ISLANDS[0];
  const start = new THREE.Vector3(home.x, home.y + 26, home.z + 6);
  let yaw0 = 0.35;
  if (mode === 'orders') {
    const g = ORDER_ISLANDS[0].gate;
    yaw0 = Math.atan2(-(g.x - start.x), -(g.z - start.z));
  }
  flight.reset(start, yaw0);
  camState.yaw = yaw0; camState.pitch = 0; camState.shake = 0;
  parcelVis(true);
  if (mode === 'orders') setupOrder(0); else fillChain();
  updateDots();
  input.clear();
  last = performance.now();
  toast(t('go'), 'big');
  if (mode === 'dash') toast(t('dash_hint'), 'info');
  if (mode === 'free') toast(t('free_hint'), 'info');
  sfx.tick(true);
}

function addScore(n) { G.score += n; const el = $('score'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

function onRingPass(idx) {
  // 越过的前序环视为错过
  if (idx > 0) { missRings(idx, false); }
  const r = G.rings.shift();
  G.combo++; G.ringsPassed++; G.bestCombo = Math.max(G.bestCombo, G.combo);
  const pts = 100 + Math.min(G.combo - 1, 10) * 20;
  addScore(pts);
  flight.ringHit();
  sfx.ring(G.combo - 1);
  particles.burst(r.pos, GOLD, 26, 22, 1.6, 0.9);
  particles.burst(r.pos, WHITE, 10, 14, 1.0, 0.6);
  G.fading.push({ g: r.g, t: 0 });
  camState.shake = Math.max(camState.shake, 0.35);
  toast(`+${pts}`, G.combo >= 3 ? '' : 'ok');
  if (G.combo >= 2) { const c = $('combo'); c.hidden = false; $('comboVal').textContent = G.combo; c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
  if (G.mode !== 'orders') fillChain(); else markNext();
}

function missRings(n, reseed) {
  for (let i = 0; i < n && G.rings.length; i++) { const r = G.rings.shift(); scene.remove(r.g); }
  if (G.combo > 1 || G.mode === 'dash') toast(t('miss'), 'info');
  G.combo = 0; $('combo').hidden = true;
  if (G.mode !== 'orders') { if (reseed) reseedChain(); else fillChain(); } else markNext();
}

function segCross(pos, nrm, p0, p1) {
  const s0 = V.a.subVectors(p0, pos).dot(nrm), s1 = V.b.subVectors(p1, pos).dot(nrm);
  if (s0 === s1 || (s0 > 0 && s1 > 0) || (s0 < 0 && s1 < 0)) return -1;
  const k = s0 / (s0 - s1);
  V.c.copy(p0).lerp(p1, k);
  return V.c.distanceTo(pos);
}

function deliver() {
  const isl = G.target;
  const bonus = Math.max(0, Math.round((G.pars[G.orderIdx] - G.orderT) * 10));
  const pts = 500 + bonus;
  addScore(pts);
  G.delivered++;
  sfx.deliver();
  particles.burst(G.gate.pos, GOLD, 50, 30, 2.0, 1.2);
  particles.burst(G.gate.pos, WHITE, 24, 20, 1.2, 0.9);
  toast(t('delivered') + ` +${pts}`, 'ok big');
  if (bonus > 30) toast(t('bonus_speed') + ` +${bonus}`, 'info');
  camState.shake = 0.6;
  // 包裹空投
  const drop = makeParcelDrop();
  drop.position.copy(flight.pos).add(V.a.set(0, -1.2, 0));
  scene.add(drop);
  G.drops.push({ g: drop, from: flight.pos.clone(), to: new THREE.Vector3(isl.x + isl.pad.x + rr(-2, 2), isl.y + 0.9, isl.z + isl.pad.z + rr(-2, 2)), t: 0, dur: 2.6, landed: false });
  parcelVis(false);
  // 清理目标
  const g = G.gate; G.fading.push({ g: g.g, t: 0 }); G.gate = null;
  if (G.beacon) { const b = G.beacon; G.fading.push({ g: b, t: 0, beacon: true }); G.beacon = null; }
  for (const r of G.rings) scene.remove(r.g);
  G.rings.length = 0;
  $('marker').hidden = true;
  updateDots();
  if (G.delivered >= 5) { G.ended = true; G.endTimer = 2.8; }
  else { G.nextOrderIn = 1.8; }
}

function finish(win) {
  if (G.state !== 'playing') return;
  G.state = 'result';
  sfx.finish(win);
  const m = G.mode;
  const isNew = G.score > (S.best[m] || 0);
  if (isNew) { S.best[m] = G.score; store.set('best', S.best); }
  let title = t('res_done'), stars = 3;
  const grid = [];
  const fmt = (s) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  if (m === 'orders') {
    const ratio = G.elapsed / Math.max(1, G.parTotal);
    stars = ratio <= 0.85 ? 3 : ratio <= 1.15 ? 2 : 1;
    grid.push([t('st_time'), fmt(G.elapsed)], [t('st_delivered'), G.delivered + '/5'], [t('st_rings'), G.ringsPassed]);
    grid.push([t('st_combo'), 'x' + G.bestCombo], [t('st_dist'), Math.round(G.dist) + ' ' + t('meter')], [t('best'), S.best[m]]);
  } else {
    title = m === 'dash' ? t('res_time') : t('res_free');
    stars = G.score >= 4000 ? 3 : G.score >= 2400 ? 2 : G.score >= 1000 ? 1 : 0;
    grid.push([t('st_rings'), G.ringsPassed], [t('st_combo'), 'x' + G.bestCombo], [t('st_dist'), Math.round(G.dist) + ' ' + t('meter')]);
  }
  $('resTitle').textContent = title;
  $('resScore').textContent = G.score;
  $('resNew').hidden = !isNew || G.score === 0;
  $('resGrid').innerHTML = grid.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  $('resStars').innerHTML = [0, 1, 2].map((i) => `<svg class="ic ${i < stars ? 'on' : ''}" style="--d:${0.15 + i * 0.2}s"><use href="#i-star"/></svg>`).join('');
  showScreen('result', true);
  renderBests();
}

// ---------- 每帧逻辑 ----------
let T = 0, last = performance.now(), bumpCd = 0, trailT = 0, wasBoost = false, markerPos = new THREE.Vector3(), markerName = '', markerOn = false;
const tip = new THREE.Vector3();

function stepGame(dt, live) {
  const inp = live ? input.poll() : { turn: 0, climb: 0, boost: false };
  flight.update(dt, inp, { invert: S.invert, canBoost: live });
  if (live) G.dist += flight.speed * dt;
  bumpCd -= dt;
  const c = collide(flight.pos, 1.7);
  if (c === 2 && bumpCd <= 0) {
    flight.bump(); sfx.bump(); camState.shake = 1; bumpCd = 0.7;
    if (live) { toast(t('bump'), 'info'); G.combo = 0; $('combo').hidden = true; }
    particles.burst(flight.pos, WHITE, 18, 14, 1.8, 0.6);
  } else if (c === 1) {
    flight.pitch = Math.max(flight.pitch, 0.05);
    if (Math.random() < 0.4) particles.emit(flight.pos.x, flight.pos.y - 1, flight.pos.z, rr(-2, 2), rr(1, 3), rr(-2, 2), WHITE, 1.4, 0.6, 1, 0, 0.5);
  }
  flight.apply(planeGroup, planeParts.prop, dt, T);
  planeGroup.updateMatrixWorld(true);
  updateShadow();

  // 音效 / 速度特效
  const spd01 = clamp((flight.speed - 18) / 60, 0, 1);
  sfx.engine(spd01, flight.boosting, live);
  if (flight.boosting && !wasBoost) sfx.boostStart();
  wasBoost = flight.boosting;
  const fx = clamp((flight.speed - CRUISE - 4) / (DASH - CRUISE), 0, 1);
  $('speedfx').style.setProperty('--b', (fx * 0.85).toFixed(3));
  streaks.update(dt, flight.speed, fx);
  // 翼尖气流
  trailT -= dt;
  if (trailT <= 0 && (flight.boosting || flight.ringBoost > 0 || fx > 0.12)) {
    trailT = 0.022;
    for (const sx of [-3.3, 3.3]) {
      tip.set(sx, 0.78, 0.2).applyMatrix4(planeGroup.matrixWorld);
      particles.emit(tip.x, tip.y, tip.z, 0, 0, 0, flight.ringBoost > 0 ? GOLD : WHITE, 0.55 + fx * 0.5, 0.55, 0, 0, 0.55);
    }
  }
  if (!live) return;

  // 计时
  G.elapsed += dt; G.orderT += dt;
  if (G.mode === 'dash') {
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; finish(false); return; }
    const tp = $('timerPill'); tp.classList.toggle('low', G.timeLeft <= 10);
    if (Math.ceil(G.timeLeft) !== G._tl) { G._tl = Math.ceil(G.timeLeft); $('timerVal').textContent = G._tl; if (G._tl <= 5) sfx.tick(false); }
  }
  // 风环检测
  const p0 = flight.prev, p1 = flight.pos;
  for (let i = 0; i < G.rings.length; i++) {
    const r = G.rings[i];
    const lat = segCross(r.pos, r.nrm, p0, p1);
    if (lat >= 0) {
      if (lat <= r.r * 1.12) { onRingPass(i); break; }
      if (i === 0 && G.mode !== 'free') { missRings(1, G.mode === 'dash'); break; }
      if (i === 0 && G.mode === 'free') { missRings(1, true); break; }
    }
  }
  // 太远没穿的环 → 重新铺环
  if (G.mode !== 'orders' && G.rings[0]) {
    const r0 = G.rings[0];
    if (V.a.subVectors(flight.pos, r0.pos).length() > 200) reseedChain();
  }
  // 投递
  if (G.mode === 'orders' && G.gate) {
    const lat = segCross(G.gate.pos, G.gate.nrm, p0, p1);
    if ((lat >= 0 && lat <= G.gate.r * 1.12) || flight.pos.distanceTo(G.gate.pos) < G.gate.r * 1.2) deliver();
  }
  if (G.nextOrderIn > 0) {
    G.nextOrderIn -= dt;
    if (G.nextOrderIn <= 0) { G.nextOrderIn = 0; parcelVis(true); setupOrder(G.delivered); toast(t('order_next'), 'info'); }
  }
  if (G.ended) { G.endTimer -= dt; if (G.endTimer <= 0) { G.ended = false; finish(true); } }
}

function updateFx(dt) {
  // 环动画
  for (const r of G.rings) setRingState(r.g, r.state, T + r.pos.x * 0.01);
  if (G.gate) { G.gate.g.rotation.z += dt * 0.6; setRingState(G.gate.g, 'next', T); }
  if (G.beacon) { const u = G.beacon.userData; u.beamMat.uniforms.t.value = T; const s = 1 + Math.sin(T * 3) * 0.08; u.pad.scale.set(s, 1, s); }
  for (let i = G.fading.length - 1; i >= 0; i--) {
    const f = G.fading[i]; f.t += dt;
    const k = f.t / 0.55;
    if (k >= 1) { scene.remove(f.g); G.fading.splice(i, 1); continue; }
    if (f.beacon) { f.g.scale.set(1 - k * 0.6, 1, 1 - k * 0.6); }
    else {
      f.g.scale.setScalar(1 + k * 1.4);
      f.g.traverse((o) => { if (o.material && o.material.opacity !== undefined) o.material.opacity *= 0.88; });
    }
  }
  // 包裹降落
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i];
    d.t += dt / d.dur;
    const k = Math.min(1, d.t);
    const e = 1 - Math.pow(1 - k, 2.2);
    d.g.position.lerpVectors(d.from, d.to, e);
    d.g.position.y = d.from.y + (d.to.y - d.from.y) * (1 - Math.pow(1 - k, 1.6)) + Math.sin(k * Math.PI) * 4;
    d.g.rotation.z = Math.sin(T * 3) * 0.08;
    if (k >= 1 && !d.landed) {
      d.landed = true; d.g.userData.chute.visible = false;
      particles.burst(d.to, GOLD, 30, 12, 1.6, 1.0);
      particles.burst(d.to, WHITE, 14, 8, 1.0, 0.8);
      d.t = 1; d.hold = 1.6;
    }
    if (d.landed) { d.hold -= dt; if (d.hold <= 0) { scene.remove(d.g); G.drops.splice(i, 1); } }
  }
}

// ---------- 摄像机 ----------
function updateCamera(dt) {
  if (G.state === 'menu' || G.state === 'loading') {
    const home = ISLANDS[0];
    const a = T * 0.2 + 0.6;
    const cx = home.x + 6, cy = home.y + 31 + Math.sin(T * 0.9) * 0.6, cz = home.z + 10;
    planeGroup.position.set(cx, cy, cz);
    planeGroup.rotation.set(0.06, 0.45 + Math.sin(T * 0.5) * 0.2, 0.14 + Math.sin(T * 0.8) * 0.05, 'YXZ');
    if (planeParts && planeParts.prop) planeParts.prop.rotation.z += dt * 40;
    const r = 17;
    V.a.set(cx + Math.cos(a) * r, cy + 3.2 + Math.sin(T * 0.4) * 1.2, cz + Math.sin(a) * r);
    camera.position.lerp(V.a, 1 - Math.exp(-dt * 6));
    camera.lookAt(cx, cy + 0.6, cz);
    camera.fov += (50 - camera.fov) * (1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
    return;
  }
  const v = VIEWS[S.view] || VIEWS[0];
  camState.yaw += angDiff(flight.yaw, camState.yaw) * (1 - Math.exp(-dt * 5.2));
  camState.pitch += (flight.pitch * 0.5 - camState.pitch) * (1 - Math.exp(-dt * 3.4));
  const cp = Math.cos(camState.pitch);
  V.a.set(-Math.sin(camState.yaw) * cp, Math.sin(camState.pitch), -Math.cos(camState.yaw) * cp); // 视线方向
  const k = clamp((flight.speed - CRUISE) / (DASH - CRUISE), 0, 1);
  const dist = v.dist + k * 3.4;
  V.b.copy(flight.pos).addScaledVector(V.a, -dist);
  V.b.y += v.h - camState.pitch * 4;
  camera.position.lerp(V.b, 1 - Math.exp(-dt * 10));
  collide(camera.position, 1.6);
  V.c.copy(flight.pos).addScaledVector(V.a, v.look);
  V.c.y += 1.2;
  camera.lookAt(V.c);
  camera.rotateZ(flight.roll * 0.28);
  camState.shake = Math.max(0, camState.shake - dt * 2.4);
  if (camState.shake > 0) camera.position.add(V.d.set(rr(-1, 1), rr(-1, 1), rr(-1, 1)).multiplyScalar(camState.shake * 0.45));
  const fov = 60 + k * 17 + (flight.boosting ? 4 : 0);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 6));
  camera.updateProjectionMatrix();
}

// ---------- HUD ----------
const radar = $('radar'), rctx = radar.getContext('2d');
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }

function updateHud(dt) {
  G.dispScore += (G.score - G.dispScore) * Math.min(1, dt * 9);
  setText('score', Math.round(G.dispScore));
  if (G.score > (S.best[G.mode] || 0)) setText('bestHud', G.score); else setText('bestHud', S.best[G.mode] || 0);
  setText('spd', Math.round(flight.speed * 3.4));
  setText('alt', Math.round(flight.pos.y));
  const e = flight.energy / 100;
  $('boostFill').style.transform = `scaleX(${e.toFixed(3)})`;
  $('boostFill').classList.toggle('low', flight.boostLock);
  $('boostArc').style.strokeDashoffset = ((1 - e) * 100).toFixed(1);
  $('boostBtn').classList.toggle('empty', flight.boostLock);
  const w = $('warn');
  if (flight.outside) { w.hidden = false; w.textContent = t('back_route'); } else w.hidden = true;

  // 指示目标
  markerOn = false;
  if (G.mode === 'orders' && G.gate && G.target) { markerPos.copy(G.gate.pos); markerName = t('o' + (G.orderIdx + 1) + '_name'); markerOn = true; }
  else if (G.mode === 'dash' && G.rings[0]) { markerPos.copy(G.rings[0].pos); markerName = t('ringlabel'); markerOn = true; }
  const mk = $('marker');
  if (markerOn && !(G.mode === 'dash' && flight.pos.distanceTo(markerPos) < 40)) {
    const d = flight.pos.distanceTo(markerPos);
    mk.hidden = false;
    setText('markerName', markerName);
    setText('markerDist', Math.round(d) + ' ' + t('meter'));
    if (G.mode === 'orders') setText('orderDist', Math.round(d));
    const Wd = window.innerWidth, Hd = window.innerHeight;
    V.d.copy(markerPos).project(camera);
    const behind = V.d.z > 1;
    let x = V.d.x, y = V.d.y;
    if (behind) { x = -x; y = -y; }
    let on = !behind && Math.abs(x) < 0.8 && y < 0.5 && y > -0.62;
    if (!on) { const m = Math.max(Math.abs(x) / 0.78, y > 0 ? y / 0.46 : -y / 0.62, 0.001); x /= m; y /= m; }
    const px = (x * 0.5 + 0.5) * Wd, py = (-y * 0.5 + 0.5) * Hd;
    const arrow = mk.firstElementChild;
    if (on) { mk.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`; arrow.style.transform = 'rotate(180deg)'; }
    else { const ang = Math.atan2(py - Hd / 2, px - Wd / 2) + Math.PI / 2; mk.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`; arrow.style.transform = `rotate(${ang.toFixed(3)}rad)`; }
  } else { mk.hidden = true; if (G.mode === 'orders' && G.target) setText('orderDist', Math.round(flight.pos.distanceTo(G.target.gate))); }
  drawRadar();
}

const RC = { home: '#ff7a5c', order: '#ffffff', decor: 'rgba(255,255,255,0.62)' };
function drawRadar() {
  const c = rctx, S2 = 200, h = 100, range = 520, sc = 92 / range;
  c.clearRect(0, 0, S2, S2);
  c.save();
  c.beginPath(); c.arc(h, h, 98, 0, 7); c.clip();
  c.fillStyle = 'rgba(40,110,220,0.18)'; c.fillRect(0, 0, S2, S2);
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2;
  c.beginPath(); c.arc(h, h, 46, 0, 7); c.stroke();
  c.beginPath(); c.moveTo(h, 8); c.lineTo(h, 192); c.moveTo(8, h); c.lineTo(192, h); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
  const cy = Math.cos(flight.yaw), sy = Math.sin(flight.yaw);
  const proj = (x, z) => { const dx = x - flight.pos.x, dz = z - flight.pos.z; return [h + (dx * cy - dz * sy) * sc, h + -(-dx * sy - dz * cy) * sc]; };
  for (const d of ISLANDS) {
    const [px, py] = proj(d.x, d.z);
    const isT = G.target === d && G.mode === 'orders';
    const rad = Math.max(3.2, d.r * sc * 0.95);
    const dd = Math.hypot(px - h, py - h);
    if (dd > 98 + rad && !isT) continue;
    c.fillStyle = d.order === 0 ? RC.home : d.order > 0 ? RC.order : RC.decor;
    if (isT) {
      let tx = px, ty = py;
      if (dd > 84) { tx = h + (px - h) / dd * 84; ty = h + (py - h) / dd * 84; }
      const pul = 1 + Math.sin(T * 6) * 0.15;
      c.fillStyle = '#ffc21f'; c.strokeStyle = '#fff'; c.lineWidth = 3;
      c.beginPath(); c.arc(tx, ty, (dd > 84 ? 8 : rad + 3) * pul, 0, 7); c.fill(); c.stroke();
    } else { c.beginPath(); c.arc(px, py, rad, 0, 7); c.fill(); }
  }
  // 环
  for (let i = 0; i < Math.min(3, G.rings.length); i++) {
    const [px, py] = proj(G.rings[i].pos.x, G.rings[i].pos.z);
    c.strokeStyle = i === 0 ? '#ffc21f' : 'rgba(255,194,31,0.6)'; c.lineWidth = i === 0 ? 4 : 3;
    c.beginPath(); c.arc(px, py, i === 0 ? 7 : 5, 0, 7); c.stroke();
  }
  c.restore();
  // 飞机
  c.fillStyle = '#ff5a36'; c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(h, h - 11); c.lineTo(h + 8, h + 9); c.lineTo(h, h + 4); c.lineTo(h - 8, h + 9); c.closePath(); c.fill(); c.stroke();
  const n = $('radarN');
  n.style.left = (50 + sy * 40).toFixed(1) + '%'; n.style.top = (50 - cy * 40).toFixed(1) + '%';
}

// ---------- 语言切换 ----------
onLang(() => {
  renderBrief(); renderBests(); world && world.setLang(); updateOrderCard(false);
  Object.keys(hudCache).forEach((k) => delete hudCache[k]);
});

// ---------- 主循环 ----------
let perfT = 0, perfN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  T += dt;
  if (G.state === 'playing') stepGame(dt, true);
  else if (G.state === 'result') stepGame(dt, false);
  if (G.state === 'playing' || G.state === 'result') { updateFx(dt); }
  if (G.state === 'playing') updateHud(dt);
  if (G.state === 'paused') { /* 冻结 */ } else { particles.update(dt); }
  if (world) world.hideTarget = G.mode === 'orders' && G.state === 'playing' ? G.target : null;
  if (world) world.update(G.state === 'paused' ? 0 : dt, T, camera.position, G.state === 'playing');
  if (G.state !== 'paused') updateCamera(dt);
  renderer.render(scene, camera);
  // 动态分辨率: 帧率长期偏低就降一点 (用真实帧间隔)
  if (G.state === 'playing' || G.state === 'menu') {
    perfT += Math.min(0.5, (now - (frame._p || now)) / 1000); perfN++;
    if (perfT > 2.5) {
      const avg = perfT / perfN;
      if (avg > 0.03 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); resize(); }
      perfT = 0; perfN = 0;
    }
  }
  frame._p = now;
}

// ---------- 启动 ----------
async function boot() {
  applyI18n();
  refreshSoundUI();
  renderBrief(); renderBests();
  const fill = $('loadFill');
  const prog = (p) => { fill.style.width = Math.round(clamp(p, 0.05, 1) * 100) + '%'; };
  resize();
  prog(0.12);
  await nextFrame();
  world = createWorld(scene, { lite: S.lite });
  prog(0.5);
  await nextFrame();
  planeParts = await loadPlaneModel('assets/plane.glb', (p) => prog(0.5 + p * 0.45));
  planeGroup.add(planeParts.root);
  prog(1);
  await nextFrame();
  resize();
  G.state = 'menu';
  camera.position.set(ISLANDS[0].x + 22, ISLANDS[0].y + 34, ISLANDS[0].z + 28);
  $('loading').classList.add('out');
  setTimeout(() => { $('loading').hidden = true; }, 600);
  showScreen('menu', true);
  $('installTip').hidden = !(isIOS && !isStandalone && !S.tipClosed);
  last = performance.now();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot().catch((e) => {
  console.error(e);
  $('loading').querySelector('b').textContent = 'Error: ' + (e && e.message ? e.message : e);
});

// 调试 / 自动化测试入口
function simulate(sec, dt = 1 / 30) {
  for (let t = 0; t < sec; t += dt) {
    if (G.state !== 'playing') break;
    T += dt; stepGame(dt, true); updateFx(dt); updateCamera(dt);
  }
}
window.__game = { G, S, flight, camera, scene, renderer, input, particles, sfx, get world() { return world; }, startGame, finish, setPaused, goHome, simulate };
