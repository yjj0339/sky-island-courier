// 输入：键盘 + 触控（左侧浮动摇杆 / 右侧按住加速）
const $ = (id) => document.getElementById(id);

export class Input {
  constructor(cb = {}) {
    this.cb = cb;
    this.keys = new Set();
    this.stick = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.boostId = -1;
    this.touchBoost = false;
    this.enabled = true;
    this.zoneL = $('touchL'); this.zoneR = $('touchR');
    this.stickEl = $('stick'); this.knob = $('stickKnob'); this.boostBtn = $('boostBtn');
    this._bindKeys();
    this._bindTouch();
    this.layout();
  }

  _bindKeys() {
    const game = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (game.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.cb.anyKey) this.cb.anyKey(e);
      if (e.code === 'KeyP' || e.code === 'Escape') this.cb.pause && this.cb.pause();
      else if (e.code === 'KeyM') this.cb.mute && this.cb.mute();
      else if (e.code === 'KeyC') this.cb.cam && this.cb.cam();
      else if (e.code === 'KeyL') this.cb.lang && this.cb.lang();
      else if (e.code === 'KeyF') this.cb.full && this.cb.full();
      else if ((e.code === 'Enter' || e.code === 'Space') && this.cb.confirm) this.cb.confirm();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this._resetStick(); this._boost(false); });
  }

  layout() {
    // 摇杆待机位置 (左下)
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 14;
    const W = window.innerWidth, H = window.innerHeight;
    this.rem = rem;
    this.rest = { x: Math.max(rem * 7, Math.min(W * 0.16, rem * 11)) + 8, y: H - Math.max(rem * 6.4, Math.min(H * 0.28, rem * 9)) };
    if (!this.stick.on) this._place(this.rest.x, this.rest.y);
  }

  _place(x, y) { this.stickEl.style.left = x + 'px'; this.stickEl.style.top = y + 'px'; }

  _resetStick() {
    this.stick.on = false; this.stick.id = -1; this.stick.x = 0; this.stick.y = 0;
    this.knob.style.transform = 'translate(0,0)';
    this.stickEl.classList.add('idle');
    this._place(this.rest.x, this.rest.y);
  }

  _boost(v) {
    this.touchBoost = v;
    this.boostBtn.classList.toggle('down', v);
    if (!v) this.boostId = -1;
  }

  _bindTouch() {
    const zl = this.zoneL, zr = this.zoneR;
    const maxTravel = () => this.rem * 3.2;
    const move = (e) => {
      const s = this.stick;
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const m = maxTravel();
      const len = Math.hypot(dx, dy);
      if (len > m) { // 摇杆底座跟随手指，不用拉到很远
        const ex = len - m;
        s.ox += (dx / len) * ex; s.oy += (dy / len) * ex;
        dx = e.clientX - s.ox; dy = e.clientY - s.oy;
        this._place(s.ox, s.oy);
      }
      s.x = Math.max(-1, Math.min(1, dx / m)); s.y = Math.max(-1, Math.min(1, dy / m));
      this.knob.style.transform = `translate(${s.x * m}px, ${s.y * m}px)`;
    };
    zl.addEventListener('pointerdown', (e) => {
      if (this.stick.on) return;
      e.preventDefault();
      try { zl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const s = this.stick;
      s.on = true; s.id = e.pointerId;
      const R = this.rem * 4.6;
      s.ox = Math.max(R, Math.min(window.innerWidth * 0.55 - R, e.clientX));
      s.oy = Math.max(window.innerHeight * 0.3 + R, Math.min(window.innerHeight - R, e.clientY));
      this.stickEl.classList.remove('idle');
      this._place(s.ox, s.oy);
      move(e);
      if (this.cb.anyKey) this.cb.anyKey(e);
    });
    zl.addEventListener('pointermove', (e) => { if (this.stick.on && e.pointerId === this.stick.id) move(e); });
    const up = (e) => { if (this.stick.on && e.pointerId === this.stick.id) this._resetStick(); };
    zl.addEventListener('pointerup', up);
    zl.addEventListener('pointercancel', up);
    zl.addEventListener('lostpointercapture', up);

    zr.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { zr.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.boostId = e.pointerId; this._boost(true);
      if (this.cb.anyKey) this.cb.anyKey(e);
    });
    const bup = (e) => { if (e.pointerId === this.boostId) this._boost(false); };
    zr.addEventListener('pointerup', bup);
    zr.addEventListener('pointercancel', bup);
    zr.addEventListener('lostpointercapture', bup);
  }

  // 返回 {turn, climb, boost, stick:{x,y}}
  poll() {
    const k = this.keys;
    let turn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    let climb = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let boost = k.has('Space') || this.touchBoost;
    const s = this.stick;
    if (s.on) {
      const dz = 0.1;
      const f = (v) => { const a = Math.abs(v); if (a < dz) return 0; return Math.sign(v) * Math.pow((a - dz) / (1 - dz), 1.1); };
      const tx = -f(s.x), cy = -f(s.y);
      if (Math.abs(tx) > Math.abs(turn)) turn = tx;
      if (Math.abs(cy) > Math.abs(climb)) climb = cy;
    }
    return { turn, climb, boost };
  }

  clear() {
    this.keys.clear(); this._resetStick(); this._boost(false);
  }
}
