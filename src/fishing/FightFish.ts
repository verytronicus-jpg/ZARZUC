/**
 * Ryba w holu: ciało w płaszczyźnie + głębokość.
 *   m·a = F_ryby − T·kierunek_do_wędki − opór wody
 *   F_ryby = siła_gatunku · waga · g · (0,3 + 0,7·wytrzymałość) · zryw
 * Zrywy: losowe odjazdy o charakterze gatunku. Ryba chce płynąć OD gracza, w stronę głębi / trzcin.
 */
import * as THREE from 'three';
import { CFG, G, type SpeciesConfig } from '../config';
import { clamp, clamp01, lerp, smoothstep, wrapAngle } from '../core/math';
import type { Rng } from '../core/Rng';

export interface FishEnv {
  depth(x: number, z: number): number;
  waterY(x: number, z: number): number;
  reedDistance(x: number, z: number): number;
  nearestReed(x: number, z: number): { x: number; z: number } | null;
}

interface FishStepInput {
  T: number;
  /** jednostkowy kierunek od ryby do szczytówki */
  toTip: THREE.Vector3;
  playerPos: THREE.Vector3;
  /** boczne prowadzenie wędki −1..1 (względem linii gracz→ryba, + = w prawo) */
  rodSide: number;
  /** mnożnik nacisku (wędka w górze) */
  pressureMul: number;
}

export class FightFish {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  heading = 0;
  stamina = 1;
  tired = false;
  surging = false;
  private surgeT = 0;
  private surgeDur = 0;
  private pause = 0;
  private surgeYaw = 0;
  private time = 0;
  private wanderPhase: number;
  /** ostatnia siła ryby [N] (debug/HUD) */
  force = 0;
  /** dla wskaźnika: >0 gdy wędka prowadzona przeciwnie do ucieczki */
  opposite = 0;
  /** wizualne */
  roll = 0;
  swim = 1;

  readonly massKg: number;
  readonly fMax: number;

  constructor(
    readonly sp: SpeciesConfig,
    readonly weightKg: number,
    readonly lengthM: number,
    private rng: Rng,
  ) {
    this.massKg = Math.max(CFG.fight.minMass, weightKg) * (1 + CFG.fight.addedMass);
    this.fMax = sp.strength * weightKg * G;
    this.pause = rng.range(0.2, 0.8); // pierwszy odjazd zaraz po zacięciu
    this.wanderPhase = rng.range(0, 100);
  }

  get dragCoef(): number {
    return CFG.fight.dragCoef * Math.pow(Math.max(0.02, this.weightKg), 2 / 3) * this.sp.fight.dragMul;
  }

  /** siła ryby w bieżącym stanie (bez kierunku) */
  currentForce(): number {
    const f = this.sp.fight;
    if (this.tired) return this.fMax * 0.04 * (0.5 + 0.5 * Math.sin(this.time * 3));
    let level = this.surging ? f.peak : f.cruise;
    if (f.headshake > 0) level *= 1 + f.headshake * Math.sin(this.time * Math.PI * 2 * f.headshakeHz) * (this.surging ? 1 : 0.4);
    return this.fMax * (0.3 + 0.7 * this.stamina) * level;
  }

  /** @returns true gdy zaczął się zryw */
  step(dt: number, inp: FishStepInput, env: FishEnv): boolean {
    const F = CFG.fight;
    const f = this.sp.fight;
    this.time += dt;
    this.prevPos.copy(this.pos);
    let surgeStarted = false;

    // --- zrywy ---
    if (!this.tired) {
      if (this.surging) {
        this.surgeT += dt;
        if (this.surgeT >= this.surgeDur) {
          this.surging = false;
          this.pause = this.rng.range(f.pauseMin, f.pauseMax);
        }
      } else {
        this.pause -= dt;
        if (this.pause <= 0 && this.stamina > 0.08) {
          this.surging = true;
          this.surgeT = 0;
          this.surgeDur = this.rng.range(f.surgeMin, f.surgeMax);
          const away = Math.atan2(this.pos.x - inp.playerPos.x, this.pos.z - inp.playerPos.z);
          this.surgeYaw = away + this.rng.range(-1.1, 1.1);
          surgeStarted = true;
        }
      }
    } else {
      this.surging = false;
    }

    // --- kierunek, w którym ryba chce płynąć ---
    const awayX = this.pos.x - inp.playerPos.x;
    const awayZ = this.pos.z - inp.playerPos.z;
    const awayLen = Math.hypot(awayX, awayZ) || 1;
    let wx = awayX / awayLen;
    let wz = awayZ / awayLen;
    // głębia (gradient mapy głębokości)
    const e = 2;
    const gx = env.depth(this.pos.x + e, this.pos.z) - env.depth(this.pos.x - e, this.pos.z);
    const gz = env.depth(this.pos.x, this.pos.z + e) - env.depth(this.pos.x, this.pos.z - e);
    const gl = Math.hypot(gx, gz);
    if (gl > 1e-4) {
      wx += (gx / gl) * f.seekDeep;
      wz += (gz / gl) * f.seekDeep;
    }
    // trzciny
    if (f.seekReeds > 0) {
      const r = env.nearestReed(this.pos.x, this.pos.z);
      if (r) {
        const dx = r.x - this.pos.x;
        const dz = r.z - this.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        const w = f.seekReeds * (1 - smoothstep(10, 45, dl));
        wx += (dx / dl) * w;
        wz += (dz / dl) * w;
      }
    }
    // krążenie (karaś) + błądzenie
    const circ = f.circling;
    wx += -awayZ / awayLen * circ;
    wz += (awayX / awayLen) * circ;
    const wander = Math.sin(this.time * 0.7 + this.wanderPhase) * F.wanderStrength;
    // boczny nacisk wędki skręca rybę
    const rightX = -awayZ / awayLen;
    const rightZ = awayX / awayLen;
    wx += rightX * inp.rodSide * F.sideSteer;
    wz += rightZ * inp.rodSide * F.sideSteer;
    let desired = Math.atan2(wx, wz) + wander;
    if (this.surging) desired = lerp(desired, this.surgeYaw, 0.65);
    // zmęczona ryba sunie łbem do wędki
    if (this.tired) desired = Math.atan2(inp.toTip.x, inp.toTip.z);
    // unikanie płycizny: sprawdź punkt przed rybą
    const ahead = 2.5;
    const ax = this.pos.x + Math.sin(this.heading) * ahead;
    const az = this.pos.z + Math.cos(this.heading) * ahead;
    if (!this.tired && env.depth(ax, az) < F.minDepth + 0.2 && gl > 1e-4) desired = Math.atan2(gx, gz);
    const turn = F.headingTurnRate * (this.surging ? 1.8 : 1) * dt;
    this.heading += clamp(wrapAngle(desired - this.heading), -turn, turn);

    // --- siły ---
    const Ff = this.currentForce();
    this.force = Ff;
    const hx = Math.sin(this.heading);
    const hz = Math.cos(this.heading);
    const sp = this.vel.length();
    const c = this.dragCoef;
    const m = this.massKg;
    const ax2 = (Ff * hx + inp.T * inp.toTip.x - c * sp * this.vel.x) / m;
    const az2 = (Ff * hz + inp.T * inp.toTip.z - c * sp * this.vel.z) / m;
    this.vel.x += ax2 * dt;
    this.vel.z += az2 * dt;

    // głębokość: ryba trzyma się głębiej, zmęczona wypływa na powierzchnię
    const wy = env.waterY(this.pos.x, this.pos.z);
    const depthHere = env.depth(this.pos.x, this.pos.z);
    const bottomY = wy - depthHere;
    let targetY: number;
    if (this.tired) targetY = wy - F.surfaceDepthTired;
    else {
      const frac = this.sp.id === 'leszcz' ? lerp(0.25, 0.7, this.stamina) : lerp(0.35, 0.8, this.stamina) * (this.surging ? 1.1 : 1);
      targetY = wy - clamp(depthHere * frac, 0.25, Math.max(0.25, depthHere - 0.15));
    }
    const ay = ((targetY - this.pos.y) * 6 - this.vel.y * 3) + (inp.T * inp.toTip.y) / m * 0.35;
    this.vel.y += ay * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = clamp(this.pos.y, bottomY + 0.08, wy - 0.02);

    // ląd: odbij
    if (env.depth(this.pos.x, this.pos.z) < 0.06) {
      this.pos.x = this.prevPos.x;
      this.pos.z = this.prevPos.z;
      this.vel.x *= -0.2;
      this.vel.z *= -0.2;
      if (gl > 1e-4) this.heading = Math.atan2(gx, gz);
    }

    // --- zmęczenie: ∝ T·dt (nacisk wędki, prowadzenie przeciwne 2× szybciej) ---
    const swimLat = (this.vel.x * rightX + this.vel.z * rightZ) / Math.max(0.2, sp);
    // wędka po przeciwnej stronie niż kierunek ucieczki (w bok)
    this.opposite = clamp01(-swimLat * inp.rodSide * 1.6) * smoothstep(0.1, 0.5, Math.abs(inp.rodSide));
    const mult = inp.pressureMul * (1 + (F.oppositeRodFatigue - 1) * this.opposite);
    const drain = (inp.T / Math.max(0.2, this.fMax * f.endurance)) * mult * dt;
    this.stamina -= drain;
    if (inp.T < F.regenTensionBelow) this.stamina += F.regen * dt;
    this.stamina = clamp01(this.stamina);
    if (!this.tired && this.stamina <= F.tiredThreshold) this.tired = true;
    else if (this.tired && this.stamina > F.recoverThreshold) this.tired = false;

    // wizualne
    this.roll = lerp(this.roll, this.tired ? Math.PI / 2 : 0, 1 - Math.exp(-2 * dt));
    this.swim = this.tired ? 0.3 : this.surging ? 2.2 : 1.1;
    return surgeStarted;
  }
}
