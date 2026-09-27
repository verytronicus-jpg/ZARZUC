/**
 * SPŁAWIK – fizyka pionowa z wyporności (F = ρ·g·V_zanurzona, zanurzenie liczone od wysokości FALI
 * w danym punkcie), tłumienie, opór poziomy, dryf. Ustawianie się: po upadku leży płasko,
 * wstaje gdy śrucina opadnie na grunt; jeśli woda płytsza niż grunt – zostaje przechylony.
 */
import * as THREE from 'three';
import { CFG, G } from '../config';
import { clamp, clamp01, damp, smoothstep } from '../core/math';
import type { Rng } from '../core/Rng';
import { events } from '../core/Events';
import type { FloatSignal } from './bitePatterns';
import { stepProjectile } from './cast';

type BobberMode = 'hand' | 'flight' | 'water' | 'land' | 'held';

export interface BobberEnv {
  waterY(x: number, z: number): number;
  terrainY(x: number, z: number): number;
  depth(x: number, z: number): number;
}

const tmp = new THREE.Vector3();

export class Bobber {
  mode: BobberMode = 'hand';
  /** pozycja dołu korpusu spławika */
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** 0 = pionowo, 1 = płasko */
  tilt = 1;
  prevTilt = 1;
  /** kierunek, w którym spławik leży płasko (poziomy) */
  readonly lieDir = new THREE.Vector3(0, 0, 1);
  /** opadanie śruciny */
  shotDepth = 0;
  shotSinkSpeed = 1;
  shotOnBottom = false;
  /** sygnał od ryby (branie) */
  signal: FloatSignal = { pullGf: 0, lateral: 0, liftShot: 0 };
  readonly lateralDir = new THREE.Vector3(1, 0, 0);
  /** ciągnięty (zwijanie) – spławik sunie płasko po wodzie */
  dragged = false;
  /** droga przebyta w locie (żyłka schodzi ze szpuli) */
  flightPath = 0;
  lastSurfaceY = 0;
  private rippleCooldown = 0;
  /** antenka całkiem pod wodą */
  submerged = false;

  constructor(private rng: Rng) {}

  get totalLength(): number {
    return CFG.rig.bodyLength + CFG.rig.antennaLength;
  }

  /** Czy śrucina wisi (ciągnie spławik w dół) – 0..1 */
  get hang(): number {
    if (this.shotOnBottom) return 0;
    return smoothstep(CFG.rig.grunt - 0.08, CFG.rig.grunt, this.shotDepth) * (1 - this.signal.liftShot);
  }

  /** Objętość zanurzona [m³] dla zanurzenia h (od dołu korpusu). */
  static submergedVolume(h: number): number {
    const r = CFG.rig;
    const Ab = Math.PI * r.bodyRadius * r.bodyRadius;
    const Aa = Math.PI * r.antennaRadius * r.antennaRadius;
    return Ab * clamp(h, 0, r.bodyLength) + Aa * clamp(h - r.bodyLength, 0, r.antennaLength);
  }

  /** Zanurzenie spoczynkowe przy danym obciążeniu (do testów/strojenia). */
  static restImmersion(loadG: number): number {
    const r = CFG.rig;
    const V = loadG / 1000 / CFG.water.density; // m³
    const Ab = Math.PI * r.bodyRadius * r.bodyRadius;
    const Aa = Math.PI * r.antennaRadius * r.antennaRadius;
    const vb = Ab * r.bodyLength;
    if (V <= vb) return V / Ab;
    return r.bodyLength + (V - vb) / Aa;
  }

  launch(from: THREE.Vector3, v: { x: number; y: number; z: number }): void {
    this.mode = 'flight';
    this.pos.copy(from);
    this.prevPos.copy(from);
    this.vel.set(v.x, v.y, v.z);
    this.flightPath = 0;
    this.tilt = this.prevTilt = 1;
    this.shotDepth = 0;
    this.shotOnBottom = false;
    this.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
  }

  /** Zestaw wraca pod szczytówkę. */
  toHand(tip: THREE.Vector3): void {
    this.mode = 'hand';
    this.pos.copy(tip).y -= CFG.cast.hangLength;
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.shotDepth = 0;
    this.shotOnBottom = false;
    this.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
    this.dragged = false;
  }

  /** Początek osiadania po upadku. */
  private startSettling(): void {
    this.shotDepth = 0;
    this.shotOnBottom = false;
    const t = this.rng.range(CFG.rig.settleMin, CFG.rig.settleMax);
    this.shotSinkSpeed = CFG.rig.grunt / t;
    this.tilt = 1;
  }

  /** Czy spławik już "ustał" (śrucina na gruncie lub na dnie) */
  get settled(): boolean {
    return this.mode === 'water' && (this.shotOnBottom || this.shotDepth >= CFG.rig.grunt - 1e-3) && this.tilt < 0.9;
  }

  /** Spławik przechylony, bo przynęta leży na dnie (płycej niż grunt). */
  get lying(): boolean {
    return this.shotOnBottom;
  }

  update(dt: number, env: BobberEnv, tip: THREE.Vector3): { landed?: 'water' | 'land'; impactSpeed?: number } {
    this.prevPos.copy(this.pos);
    this.prevTilt = this.tilt;
    const R = CFG.rig;
    const out: { landed?: 'water' | 'land'; impactSpeed?: number } = {};

    if (this.mode === 'hand') {
      // wahadełko pod szczytówką
      tmp.copy(tip).y -= CFG.cast.hangLength;
      this.vel.addScaledVector(tmp.sub(this.pos), 60 * dt);
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this.pos.addScaledVector(this.vel, dt);
      this.tilt = damp(this.tilt, 0, 8, dt);
      return out;
    }

    if (this.mode === 'flight') {
      const p = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      const v = { x: this.vel.x, y: this.vel.y, z: this.vel.z };
      this.flightPath += stepProjectile(p, v, dt, CFG.cast);
      this.pos.set(p.x, p.y, p.z);
      this.vel.set(v.x, v.y, v.z);
      const g = env.terrainY(p.x, p.z);
      const w = env.waterY(p.x, p.z);
      if (env.depth(p.x, p.z) > 0.02 && p.y <= w) {
        out.landed = 'water';
        out.impactSpeed = this.vel.length();
        this.mode = 'water';
        this.pos.y = w - 0.004;
        this.vel.set(this.vel.x * 0.12, 0, this.vel.z * 0.12);
        this.lieDir.set(this.vel.x, 0, this.vel.z).normalize();
        if (this.lieDir.lengthSq() < 0.5) this.lieDir.set(0, 0, 1);
        this.startSettling();
        events.emit('splash', { x: p.x, y: w, z: p.z, strength: Math.min(1, out.impactSpeed / 14) });
      } else if (p.y <= g) {
        out.landed = 'land';
        out.impactSpeed = this.vel.length();
        this.mode = 'land';
        this.pos.y = g;
        this.vel.set(0, 0, 0);
      }
      this.tilt = 1;
      return out;
    }

    if (this.mode === 'land') {
      this.pos.y = env.terrainY(this.pos.x, this.pos.z) + 0.005;
      this.vel.set(0, 0, 0);
      this.tilt = 1;
      if (env.depth(this.pos.x, this.pos.z) > 0.03) {
        this.mode = 'water';
        this.startSettling();
      }
      return out;
    }

    if (this.mode === 'held') {
      // pozycję ustawia hol (ryba)
      return out;
    }

    // ---------- woda ----------
    const x = this.pos.x;
    const z = this.pos.z;
    const wy = env.waterY(x, z);
    this.lastSurfaceY = wy;
    const bottom = env.depth(x, z);

    // śrucina opada
    if (!this.dragged) {
      if (this.shotDepth < R.grunt) this.shotDepth = Math.min(R.grunt, this.shotDepth + this.shotSinkSpeed * dt);
      // przynęta na dnie? (woda płytsza niż grunt)
      this.shotOnBottom = bottom < R.grunt - 0.02 && this.shotDepth >= bottom - 0.02;
      if (this.shotOnBottom) this.shotDepth = Math.min(this.shotDepth, bottom);
    } else {
      this.shotDepth = Math.max(0, this.shotDepth - 1.5 * dt);
    }

    const hang = this.hang;
    const gram = 1e-3;
    const loadG = R.floatMassG + (R.shotMassG + R.hookMassG) * hang;
    const massKg = (R.floatMassG + R.shotMassG * hang + R.addedMassG) * gram;
    const h = wy - this.pos.y;
    const Fb = CFG.water.density * G * Bobber.submergedVolume(h);
    const W = loadG * gram * G;
    const Fpull = this.signal.pullGf * gram * G;
    const vy = this.vel.y;
    const Fy = Fb - W - Fpull - R.verticalDamping * vy - R.verticalQuadDamping * vy * Math.abs(vy);
    this.vel.y += (Fy / massKg) * dt;
    // ograniczenie przyspieszenia (stabilność przy zmianach trybu)
    this.vel.y = clamp(this.vel.y, -3, 3);
    this.pos.y += this.vel.y * dt;
    const minY = wy - this.totalLength - R.maxSinkDepth;
    if (this.pos.y < minY) {
      this.pos.y = minY;
      this.vel.y = Math.max(0, this.vel.y);
    }
    if (this.pos.y > wy + 0.01) {
      this.pos.y = wy + 0.01;
      this.vel.y = Math.min(0, this.vel.y);
    }

    // poziomo: opór wody, dryf, znoszenie przez rybę
    if (!this.dragged) {
      const tx = R.driftX + this.lateralDir.x * this.signal.lateral;
      const tz = R.driftZ + this.lateralDir.z * this.signal.lateral;
      const k = 1 - Math.exp(-R.horizontalDrag * (this.signal.lateral > 0 ? 3 : 1) * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    // nie wjeżdża na ląd
    if (env.depth(this.pos.x, this.pos.z) < 0.01 && !this.dragged) {
      this.pos.x = this.prevPos.x;
      this.pos.z = this.prevPos.z;
      this.vel.x = this.vel.z = 0;
    }

    // ustawianie się: płasko → pionowo gdy śrucina zawiśnie
    let tiltTarget = 1 - hang;
    if (this.shotOnBottom) tiltTarget = R.lyingTilt;
    if (this.dragged) tiltTarget = 0.85;
    tiltTarget = Math.max(tiltTarget, this.signal.liftShot);
    this.tilt = damp(this.tilt, tiltTarget, R.standUpRate, dt);

    // spławik znika pod wodą / wypływa – wyraźny sygnał brania
    const under = wy - this.pos.y > this.totalLength * 0.97;
    if (under !== this.submerged) {
      this.submerged = under;
      if (under) {
        events.emit('floatUnder', { x: this.pos.x, z: this.pos.z });
        events.emit('splash', { x: this.pos.x, y: wy, z: this.pos.z, strength: 0.25 });
      } else {
        events.emit('ripple', { x: this.pos.x, z: this.pos.z, strength: 0.7 });
      }
    }

    // kręgi na wodzie przy ruchach spławika
    this.rippleCooldown -= dt;
    if (this.rippleCooldown <= 0 && (Math.abs(this.vel.y) > R.rippleSpeedThreshold || (this.signal.lateral > 0.1 && this.rng.chance(0.15)))) {
      this.rippleCooldown = 0.25;
      events.emit('ripple', { x: this.pos.x, z: this.pos.z, strength: clamp01(Math.abs(this.vel.y) * 3 + this.signal.lateral) });
    }
    return out;
  }

  /** Transformacja wizualna (interpolowana): pionowo ↔ płasko. */
  applyVisual(obj: THREE.Object3D, alpha: number): void {
    const s = CFG.rigVisual.floatScale;
    tmp.lerpVectors(this.prevPos, this.pos, alpha);
    const tilt = this.prevTilt + (this.tilt - this.prevTilt) * alpha;
    const R = CFG.rig;
    // pionowo: dół korpusu w pos, ale wizualny spławik jest s× większy – zachowaj linię wody na antence
    const immersion = this.lastSurfaceY - tmp.y;
    const upright = new THREE.Vector3(tmp.x, this.mode === 'water' ? this.lastSurfaceY - immersion * s : tmp.y, tmp.z);
    // płasko: leży na powierzchni
    const flatPos = new THREE.Vector3(tmp.x, this.mode === 'water' ? this.lastSurfaceY - R.bodyRadius * s * 0.4 : tmp.y, tmp.z).addScaledVector(
      this.lieDir,
      (-(R.bodyLength + R.antennaLength) * s) / 2,
    );
    obj.position.lerpVectors(upright, flatPos, tilt);
    const axis = new THREE.Vector3(this.lieDir.z, 0, -this.lieDir.x).normalize();
    obj.quaternion.setFromAxisAngle(axis, tilt * Math.PI * 0.5);
  }
}
