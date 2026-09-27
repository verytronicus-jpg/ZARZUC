import * as THREE from 'three';
import { PIVOTS } from '../assets/AssetRegistry';
import { CFG } from '../config';
import { clamp01, damp, lerp } from '../core/math';

export type UpperPose =
  | 'none'
  | 'holdRod'
  | 'reach'
  | 'lift'
  | 'carry'
  | 'bait'
  | 'aim'
  | 'charge'
  | 'castFwd'
  | 'fight'
  | 'openTrunk';

type Rot = [number, number, number];
interface PoseDef {
  upperarm_R?: Rot;
  forearm_R?: Rot;
  upperarm_L?: Rot;
  forearm_L?: Rot;
  spine?: Rot;
  head?: Rot;
}

const POSES: Record<Exclude<UpperPose, 'none'>, PoseDef> = {
  holdRod: { upperarm_R: [-0.5, 0, 0.15], forearm_R: [-0.95, 0, 0] },
  reach: { upperarm_R: [-1.45, 0, 0.1], forearm_R: [-0.15, 0, 0], upperarm_L: [-0.3, 0, 0], spine: [0.22, 0, 0] },
  openTrunk: { upperarm_R: [-2.3, 0, 0.1], forearm_R: [-0.3, 0, 0], upperarm_L: [-0.4, 0, -0.1], spine: [0.05, 0, 0] },
  lift: { upperarm_R: [-1.1, 0, 0.25], forearm_R: [-0.9, 0, 0], upperarm_L: [-1.1, 0, -0.25], forearm_L: [-0.9, 0, 0], spine: [0.1, 0, 0] },
  carry: { upperarm_R: [-0.45, 0, 0.1], forearm_R: [-1.05, 0, 0], upperarm_L: [-0.5, 0, -0.12], forearm_L: [-1.3, 0, 0] },
  bait: { upperarm_R: [-0.9, 0, 0.5], forearm_R: [-1.4, 0, 0], upperarm_L: [-0.85, 0, -0.5], forearm_L: [-1.4, 0, 0], head: [0.5, 0, 0], spine: [0.12, 0, 0] },
  aim: { upperarm_R: [-0.8, 0, 0.2], forearm_R: [-0.8, 0, 0], upperarm_L: [-0.7, 0, -0.35], forearm_L: [-1.0, 0, 0] },
  charge: { upperarm_R: [-2.6, 0, 0.25], forearm_R: [-1.1, 0, 0], upperarm_L: [-1.3, 0, -0.35], forearm_L: [-0.9, 0, 0], spine: [-0.08, 0, 0] },
  castFwd: { upperarm_R: [-1.25, 0, 0.2], forearm_R: [-0.25, 0, 0], upperarm_L: [-0.9, 0, -0.3], forearm_L: [-0.6, 0, 0], spine: [0.18, 0, 0] },
  fight: { upperarm_R: [-1.0, 0, 0.3], forearm_R: [-1.05, 0, 0], upperarm_L: [-0.95, 0, -0.45], forearm_L: [-1.35, 0, 0], spine: [-0.05, 0, 0] },
};

const JOINTS = [
  PIVOTS.hips, PIVOTS.spine, PIVOTS.neck, PIVOTS.head,
  PIVOTS.upperarmL, PIVOTS.forearmL, PIVOTS.handL,
  PIVOTS.upperarmR, PIVOTS.forearmR, PIVOTS.handR,
  PIVOTS.thighL, PIVOTS.shinL, PIVOTS.footL,
  PIVOTS.thighR, PIVOTS.shinR, PIVOTS.footR,
] as const;

/** Proceduralne animacje: chód/bieg (sinusy na biodrach, kolanach, ramionach) + nakładki póz górnej części ciała. */
export class CharacterAnimator {
  readonly j: Record<string, THREE.Object3D> = {};
  phase = 0;
  private walk = 0;
  private run = 0;
  private time = 0;
  private hipsBaseY: number;
  pose: UpperPose = 'none';
  private poseW = 0;
  private current: Required<PoseDef> = {
    upperarm_R: [0, 0, 0], forearm_R: [0, 0, 0], upperarm_L: [0, 0, 0], forearm_L: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0],
  };
  /** parametry dodatkowe */
  charge = 0;
  fightSide = 0;
  fightUp = 0.5;
  fidget = 0;
  /** skręt głowy/tułowia w stronę celu (rad) */
  lookYaw = 0;
  poseRate = 8;

  constructor(root: THREE.Object3D) {
    for (const name of JOINTS) {
      const o = root.getObjectByName(name);
      if (o) this.j[name] = o;
    }
    this.hipsBaseY = this.j[PIVOTS.hips]?.position.y ?? 0.95;
  }

  setPose(p: UpperPose, rate = 8): void {
    this.pose = p;
    this.poseRate = rate;
  }

  update(dt: number, speed: number): void {
    const P = CFG.player;
    this.time += dt;
    const targetWalk = clamp01(speed / P.walkSpeed);
    const targetRun = clamp01((speed - P.walkSpeed) / (P.runSpeed - P.walkSpeed));
    this.walk = damp(this.walk, targetWalk, 10, dt);
    this.run = damp(this.run, targetRun, 6, dt);
    const stepLen = lerp(P.stepLengthWalk, P.stepLengthRun, this.run);
    this.phase += (Math.PI * speed * dt) / stepLen;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const w = this.walk;
    const r = this.run;

    const legA = (0.45 + 0.35 * r) * w;
    const knee = (0.55 + 0.7 * r) * w;
    const j = this.j;
    const set = (name: string, x: number, y = 0, z = 0) => {
      const o = j[name];
      if (o) o.rotation.set(x, y, z);
    };
    set(PIVOTS.thighL, -s * legA);
    set(PIVOTS.thighR, s * legA);
    set(PIVOTS.shinL, knee * Math.max(0, c) + 0.05 * w);
    set(PIVOTS.shinR, knee * Math.max(0, -c) + 0.05 * w);
    set(PIVOTS.footL, -0.2 * w * Math.max(0, c));
    set(PIVOTS.footR, -0.2 * w * Math.max(0, -c));
    const hips = j[PIVOTS.hips];
    if (hips) {
      hips.position.y = this.hipsBaseY - 0.035 * w * Math.abs(s) - 0.05 * r + 0.012 * (1 - w) * Math.sin(this.time * 1.7);
      hips.rotation.set(0, 0.08 * s * w, 0.04 * s * w);
    }

    // locomocja rąk
    const armA = (0.4 + 0.5 * r) * w;
    const loco: Required<PoseDef> = {
      upperarm_R: [-s * armA, 0, 0],
      forearm_R: [-0.15 - 0.9 * r * w, 0, 0],
      upperarm_L: [s * armA, 0, 0],
      forearm_L: [-0.15 - 0.9 * r * w, 0, 0],
      spine: [0.12 * r * w + 0.015 * Math.sin(this.time * 1.8), -0.08 * s * w, 0],
      head: [0, 0.08 * s * w, 0],
    };

    // poza górnej części ciała
    const targetW = this.pose === 'none' ? 0 : 1;
    this.poseW = damp(this.poseW, targetW, this.poseRate, dt);
    const def: PoseDef = this.pose === 'none' ? {} : this.resolvePose(this.pose);
    const keys = Object.keys(this.current) as Array<keyof PoseDef>;
    for (const k of keys) {
      const target = def[k];
      const l = loco[k];
      const out: Rot = target
        ? [lerp(l[0], target[0], this.poseW), lerp(l[1], target[1], this.poseW), lerp(l[2], target[2], this.poseW)]
        : l;
      const cur = this.current[k];
      const rate = 18;
      cur[0] = damp(cur[0], out[0], rate, dt);
      cur[1] = damp(cur[1], out[1], rate, dt);
      cur[2] = damp(cur[2], out[2], rate, dt);
    }
    // wiercenie się przy nabijaniu
    const fid = this.fidget * Math.sin(this.time * 11) * 0.12;
    set(PIVOTS.upperarmR, this.current.upperarm_R[0] + fid, this.current.upperarm_R[1], this.current.upperarm_R[2] + 0.08);
    set(PIVOTS.forearmR, this.current.forearm_R[0] - fid, 0, 0);
    set(PIVOTS.upperarmL, this.current.upperarm_L[0] - fid * 0.5, this.current.upperarm_L[1], this.current.upperarm_L[2] - 0.08);
    set(PIVOTS.forearmL, this.current.forearm_L[0], 0, 0);
    set(PIVOTS.spine, this.current.spine[0], this.current.spine[1] + this.lookYaw * 0.4, this.current.spine[2]);
    set(PIVOTS.head, this.current.head[0], this.current.head[1] + this.lookYaw * 0.4, 0);
  }

  private resolvePose(p: Exclude<UpperPose, 'none'>): PoseDef {
    if (p === 'charge') {
      // od celowania do pozycji za głową wg naładowania
      const a = POSES.aim;
      const b = POSES.charge;
      const t = this.charge;
      const mix = (x?: Rot, y?: Rot): Rot | undefined =>
        x && y ? [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)] : y ?? x;
      return {
        upperarm_R: mix(a.upperarm_R, b.upperarm_R),
        forearm_R: mix(a.forearm_R, b.forearm_R),
        upperarm_L: mix(a.upperarm_L, b.upperarm_L),
        forearm_L: mix(a.forearm_L, b.forearm_L),
        spine: mix([0, 0, 0], b.spine),
      };
    }
    if (p === 'fight') {
      const f = POSES.fight;
      const up = this.fightUp;
      return {
        upperarm_R: [f.upperarm_R![0] - up * 0.7, 0, f.upperarm_R![2] - this.fightSide * 0.3],
        forearm_R: f.forearm_R,
        upperarm_L: [f.upperarm_L![0] - up * 0.5, 0, f.upperarm_L![2] - this.fightSide * 0.3],
        forearm_L: f.forearm_L,
        spine: [-0.05 - up * 0.1, this.fightSide * 0.35, 0],
      };
    }
    return POSES[p];
  }
}
