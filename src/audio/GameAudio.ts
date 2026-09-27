/**
 * Dźwięk – w całości proceduralny (WebAudio): ambient (ptaki, woda), kroki,
 * świst rzutu, plusk, terkot hamulca, zwijanie, trzask zerwanej żyłki, chlapanie ryby.
 */
import { CFG } from '../config';
import { events } from '../core/Events';

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private reelGain: GainNode | null = null;
  private clickPhase = 0;
  private reelPhase = 0;
  private birdTimer = 2;
  private muted = false;

  constructor() {
    events.on('step', (e) => this.step(e.surface, e.run));
    events.on('castWhoosh', (e) => this.whoosh(0.35 + e.power * 0.25, 0.3 + e.power * 0.5));
    events.on('strike', () => this.whoosh(0.18, 0.5));
    events.on('splash', (e) => this.splash(e.strength));
    events.on('fishSplash', (e) => this.splash(e.strength * 1.2, true));
    events.on('lineSnap', () => this.snap());
    events.on('baitOn', () => this.squish());
    events.on('pickup', () => this.blip(520, 0.05, 0.12));
    events.on('uiClick', () => this.blip(760, 0.04, 0.1));
    events.on('caught', () => {
      this.blip(660, 0.12, 0.25);
      setTimeout(() => this.blip(990, 0.16, 0.25), 130);
    });
    // branie: głuche „plum” spławika idącego pod wodę
    events.on('floatUnder', () => this.blip(300, 0.12, 0.22));
    events.on('bite', () => {
      this.blip(520, 0.14, 0.18);
      this.splash(0.15);
    });
  }

  /** Wywołać w obsłudze gestu użytkownika (np. klik START). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = CFG.audio.master;
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = CFG.audio.sfx;
    this.sfx.connect(this.master);
    this.amb = c.createGain();
    this.amb.gain.value = CFG.audio.ambient;
    this.amb.connect(this.master);
    // bufor szumu
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbient();
  }

  /** Po zmianie głośności w opcjach. */
  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.gain.setTargetAtTime(CFG.audio.ambient, t, 0.1);
    this.sfx.gain.setTargetAtTime(CFG.audio.sfx, t, 0.1);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : CFG.audio.master, this.ctx.currentTime, 0.1);
  }

  private src(loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private startAmbient(): void {
    const c = this.ctx!;
    // woda: szum dolnoprzepustowy z powolną modulacją
    const w = this.src(true);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = c.createGain();
    g.gain.value = 0.22;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.1;
    lfo.connect(lfoG).connect(g.gain);
    w.connect(lp).connect(g).connect(this.amb);
    w.start();
    lfo.start();
    // delikatne chlupotanie przy brzegu
    const w2 = this.src(true);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g2 = c.createGain();
    g2.gain.value = 0.03;
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.37;
    const l2 = c.createGain();
    l2.gain.value = 0.025;
    lfo2.connect(l2).connect(g2.gain);
    w2.connect(bp).connect(g2).connect(this.amb);
    w2.start(0, 0.7);
    lfo2.start();
    // wiatr w trzcinach
    const w3 = this.src(true);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g3 = c.createGain();
    g3.gain.value = 0.012;
    w3.connect(hp).connect(g3).connect(this.amb);
    w3.start(0, 1.3);
  }

  private bird(): void {
    const c = this.ctx!;
    const t0 = c.currentTime + 0.02;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.amb);
    const kind = Math.random();
    const notes = 2 + Math.floor(Math.random() * 5);
    const base = 2200 + Math.random() * 2200;
    for (let i = 0; i < notes; i++) {
      const o = c.createOscillator();
      o.type = 'sine';
      const g = c.createGain();
      const t = t0 + i * (kind < 0.5 ? 0.09 : 0.16);
      const f = base * (1 + (Math.random() - 0.5) * 0.3);
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (kind < 0.5 ? 1.5 : 0.7), t + 0.07);
      this.env(g, t, 0.05 + Math.random() * 0.04, 0.01, 0.08);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  /** Dźwięki ciągłe: zwijanie i terkot hamulca. */
  update(dt: number, reeling: boolean, payout: number): void {
    const c = this.ctx;
    if (!c || this.muted) return;
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.bird();
      this.birdTimer = 1.5 + Math.random() * 5;
    }
    // zwijanie: szum przekładni + tykanie
    if (!this.reelGain) {
      const s = this.src(true);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 2;
      this.reelGain = c.createGain();
      this.reelGain.gain.value = 0;
      s.connect(bp).connect(this.reelGain).connect(this.sfx);
      s.start();
    }
    this.reelGain.gain.setTargetAtTime(reeling && payout < 0.05 ? 0.06 : 0, c.currentTime, 0.05);
    if (reeling && payout < 0.05) {
      this.reelPhase += dt * 14;
      while (this.reelPhase >= 1) {
        this.reelPhase -= 1;
        this.click(2200, 0.05);
      }
    }
    // terkot hamulca: klik co ~7 mm oddanej żyłki
    if (payout > 0.02) {
      this.clickPhase += payout * dt * 140;
      let n = 0;
      while (this.clickPhase >= 1 && n < 6) {
        this.clickPhase -= 1;
        this.click(3200 + Math.random() * 400, 0.14, n * 0.004);
        n++;
      }
      this.clickPhase = Math.min(this.clickPhase, 1);
    }
  }

  private click(freq: number, vol: number, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = this.src();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 4;
    const g = c.createGain();
    this.env(g, t, vol, 0.001, 0.02);
    s.connect(bp).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5, 0.04);
  }

  step(surface: 'grass' | 'wood' | 'gravel', run: boolean): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = this.src();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const vol = run ? 0.16 : 0.1;
    if (surface === 'wood') {
      f.type = 'bandpass';
      f.frequency.value = 520;
      f.Q.value = 3;
      this.env(g, t, vol * 1.6, 0.003, 0.09);
      const o = c.createOscillator();
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
      const og = c.createGain();
      this.env(og, t, vol * 0.9, 0.003, 0.1);
      o.connect(og).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.15);
    } else if (surface === 'gravel') {
      f.type = 'highpass';
      f.frequency.value = 2200;
      this.env(g, t, vol * 0.8, 0.005, 0.12);
    } else {
      f.type = 'bandpass';
      f.frequency.value = 1500 + Math.random() * 500;
      f.Q.value = 0.8;
      this.env(g, t, vol * 0.6, 0.01, 0.12);
    }
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 1.5, 0.2);
  }

  thump(vol: number, freq: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.2);
    const g = c.createGain();
    this.env(g, t, vol * 0.5, 0.004, 0.25);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
    const s = this.src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g2 = c.createGain();
    this.env(g2, t, vol * 0.3, 0.002, 0.12);
    s.connect(lp).connect(g2).connect(this.sfx);
    s.start(t, 0.3, 0.2);
  }

  whoosh(dur: number, vol: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = this.src();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = c.createGain();
    this.env(g, t, vol * 0.5, dur * 0.35, dur * 0.65);
    s.connect(bp).connect(g).connect(this.sfx);
    s.start(t, Math.random(), dur + 0.1);
  }

  splash(strength: number, fish = false): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = this.src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(fish ? 2200 : 3800, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.35);
    const g = c.createGain();
    this.env(g, t, 0.15 + strength * 0.35, 0.005, 0.35 + strength * 0.2);
    s.connect(lp).connect(g).connect(this.sfx);
    s.start(t, Math.random(), 0.8);
    // bąbelki
    const n = 2 + Math.floor(strength * 4);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator();
      const tt = t + 0.04 + Math.random() * 0.25;
      const f = 500 + Math.random() * 700;
      o.frequency.setValueAtTime(f, tt);
      o.frequency.exponentialRampToValueAtTime(f * 1.8, tt + 0.05);
      const og = c.createGain();
      this.env(og, tt, 0.04, 0.005, 0.05);
      o.connect(og).connect(this.sfx);
      o.start(tt);
      o.stop(tt + 0.08);
    }
  }

  snap(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = this.src();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = c.createGain();
    this.env(g, t, 0.8, 0.001, 0.05);
    s.connect(hp).connect(g).connect(this.sfx);
    s.start(t, 0, 0.1);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1300, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.18);
    const og = c.createGain();
    this.env(og, t, 0.3, 0.002, 0.2);
    o.connect(og).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.25);
  }

  squish(): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const s = this.src();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = c.createGain();
    this.env(g, t, 0.25, 0.02, 0.15);
    s.connect(lp).connect(g).connect(this.sfx);
    s.start(t, Math.random(), 0.25);
  }

  blip(freq: number, vol: number, dur: number): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    this.env(g, t, vol, 0.005, dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}
