// 纯 WebAudio 合成音效 + 轻快背景音乐，无需任何音频文件
export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.paused = false;
    this.musicTimer = 0;
    this.step = 0;
    this.nextT = 0;
    this.engineOn = false;
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'running') return;
    try {
      if (!this.ctx) {
        // iOS: 让 WebAudio 走“媒体”通道，静音拨片开着也能出声
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = (this.ctx = new AC());
        this.master = ctx.createGain();
        this.master.gain.value = this.on ? 0.9 : 0;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(ctx.destination);
        this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
        this.mus = ctx.createGain(); this.mus.gain.value = 0.55; this.mus.connect(this.master);
        // 噪声缓冲
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this._buildEngine();
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      // iOS 需要在手势里播放一个静音缓冲来彻底解锁
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    this.engGain && this.engGain.gain.setTargetAtTime(p ? 0 : this._engTarget || 0, this.ctx.currentTime, 0.05);
    this.windGain && this.windGain.gain.setTargetAtTime(p ? 0 : this._windTarget || 0, this.ctx.currentTime, 0.05);
  }

  _buildEngine() {
    const ctx = this.ctx;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 70;
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 35; this.o2.detune.value = 8;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2.5;
    this.engFilter = f;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    this.o1.connect(f); this.o2.connect(g2); g2.connect(f); f.connect(this.engGain); this.engGain.connect(this.sfx);
    // 螺旋桨颤动
    const lfo = ctx.createOscillator(); lfo.frequency.value = 26;
    const lg = ctx.createGain(); lg.gain.value = 0.35;
    const am = ctx.createGain(); am.gain.value = 0.65;
    lfo.connect(lg); lg.connect(am.gain);
    this.engGain.disconnect(); this.engGain.connect(am); am.connect(this.sfx);
    this.lfo = lfo;
    // 风声
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    this.windBp = bp;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    n.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.sfx);
    this.o1.start(); this.o2.start(); lfo.start(); n.start();
  }

  engine(speed01, boosting, active) {
    if (!this.ctx || !this.engGain) return;
    const t = this.ctx.currentTime;
    const base = 58 + speed01 * 46 + (boosting ? 18 : 0);
    this.o1.frequency.setTargetAtTime(base, t, 0.08);
    this.o2.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.lfo.frequency.setTargetAtTime(20 + speed01 * 22, t, 0.1);
    this.engFilter.frequency.setTargetAtTime(380 + speed01 * 520 + (boosting ? 400 : 0), t, 0.1);
    this._engTarget = active ? 0.05 + speed01 * 0.035 : 0;
    this._windTarget = active ? 0.02 + speed01 * speed01 * 0.16 : 0;
    this.engGain.gain.setTargetAtTime(this.paused ? 0 : this._engTarget, t, 0.1);
    this.windGain.gain.setTargetAtTime(this.paused ? 0 : this._windTarget, t, 0.1);
    this.windBp.frequency.setTargetAtTime(600 + speed01 * 1400, t, 0.15);
  }

  tone(freq, t0, dur, type = 'sine', vol = 0.2, slideTo = 0, dest = null) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(t0, dur, f0, f1, vol = 0.3, type = 'bandpass') {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = 1.1;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(f); f.connect(g); g.connect(this.sfx);
    n.start(t0, Math.random()); n.stop(t0 + dur + 0.05);
  }

  ring(combo) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const k = sc[Math.min(combo, sc.length - 1)];
    const f = 523.25 * Math.pow(2, k / 12);
    this.tone(f, t, 0.28, 'triangle', 0.22);
    this.tone(f * 1.5, t + 0.06, 0.3, 'sine', 0.16);
    this.tone(f * 2, t + 0.12, 0.34, 'sine', 0.1);
    this.noise(t, 0.3, 900, 3600, 0.12, 'highpass');
  }

  boostStart() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.6, 400, 2800, 0.3);
    this.tone(180, t, 0.45, 'sawtooth', 0.07, 520);
  }

  deliver() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.tone(f, t + i * 0.09, 0.4, 'triangle', 0.2);
      this.tone(f * 2, t + i * 0.09, 0.25, 'sine', 0.06);
    });
    this.noise(t + 0.3, 0.8, 2000, 6000, 0.1, 'highpass');
  }

  bump() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.tone(150, t, 0.28, 'sine', 0.5, 45);
    this.noise(t, 0.25, 900, 120, 0.4, 'lowpass');
  }

  click() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.08, 'triangle', 0.14, 1320);
  }

  tick(high) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    this.tone(high ? 1046 : 660, t, 0.18, 'triangle', 0.16);
  }

  finish(win = true) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const seq = win ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5] : [392, 330, 262];
    seq.forEach((f, i) => this.tone(f, t + i * 0.13, 0.42, 'triangle', 0.2));
  }

  // ---- 背景音乐 ----
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = setInterval(() => this._sched(), 90);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = 0;
  }

  _sched() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') { this.nextT = ctx ? ctx.currentTime + 0.1 : 0; return; }
    const beat = 60 / 112 / 2; // 八分音符
    const chords = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
    const pat = [0, 1, 2, 3, 2, 1, 2, 3];
    const spark = [76, 79, 81, 84, 88];
    const m = (n) => 440 * Math.pow(2, (n - 69) / 12);
    while (this.nextT < ctx.currentTime + 0.35) {
      const s = this.step;
      const ch = chords[(s >> 3) & 3];
      const t = this.nextT;
      const pn = ch[pat[s & 7]];
      if (!this.paused) {
        this.tone(m(pn), t, beat * 1.8, 'triangle', 0.075, 0, this.mus);
        if ((s & 7) === 0) this.tone(m(ch[0] - 24), t, beat * 3.2, 'sine', 0.16, 0, this.mus);
        if ((s & 7) === 4) this.tone(m(ch[0] - 24 + 7), t, beat * 2, 'sine', 0.1, 0, this.mus);
        if ((s & 1) === 1 && Math.random() < 0.28) this.tone(m(spark[(Math.random() * spark.length) | 0]), t, beat * 2.5, 'sine', 0.05, 0, this.mus);
      }
      this.nextT += beat;
      this.step++;
    }
  }
}
