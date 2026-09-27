/**
 * ŻYŁKA WIZUALNA – lina Verleta (N punktów, K iteracji więzów) przypięta do szczytówki i spławika.
 * Luźna → zwis, napięta → prosta. Segmenty pod wodą mają większy opór i słabszą grawitację.
 * UWAGA: tylko wizualna! Napięcie w rozgrywce liczy TensionModel.
 */
import * as THREE from 'three';
import { CFG } from '../config';

export interface LineEnv {
  waterY(x: number, z: number): number;
  terrainY(x: number, z: number): number;
}

export class VerletLine {
  readonly n: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** czy koniec przypięty (po zerwaniu – luźny koniec) */
  endPinned = true;
  private initialized = false;

  constructor(n = CFG.line.points) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
  }

  reset(a: THREE.Vector3, b: THREE.Vector3): void {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      this.pos.set([x, y, z], i * 3);
      this.prev.set([x, y, z], i * 3);
    }
    this.initialized = true;
  }

  update(dt: number, a: THREE.Vector3, b: THREE.Vector3, length: number, env: LineEnv): void {
    if (!this.initialized) this.reset(a, b);
    const n = this.n;
    const L = CFG.line;
    const P = this.pos;
    const Q = this.prev;
    const g = L.gravity * dt * dt;
    // integracja
    for (let i = 1; i < n - (this.endPinned ? 1 : 0); i++) {
      const k = i * 3;
      const x = P[k];
      const y = P[k + 1];
      const z = P[k + 2];
      const wy = env.waterY(x, z);
      const under = y < wy;
      const damping = under ? L.waterDamping : L.airDamping;
      const vx = (x - Q[k]) * (1 - damping);
      const vy = (y - Q[k + 1]) * (1 - damping);
      const vz = (z - Q[k + 2]) * (1 - damping);
      Q[k] = x;
      Q[k + 1] = y;
      Q[k + 2] = z;
      P[k] = x + vx;
      P[k + 1] = y + vy - g * (under ? 1 - L.waterBuoyancy : 1);
      P[k + 2] = z + vz;
    }
    const direct = a.distanceTo(b);
    const total = this.endPinned ? Math.max(length, direct) : Math.max(length, 0.5);
    const seg = total / (n - 1);
    for (let it = 0; it < L.iterations; it++) {
      P[0] = a.x;
      P[1] = a.y;
      P[2] = a.z;
      if (this.endPinned) {
        const e = (n - 1) * 3;
        P[e] = b.x;
        P[e + 1] = b.y;
        P[e + 2] = b.z;
      }
      for (let i = 0; i < n - 1; i++) {
        const k0 = i * 3;
        const k1 = k0 + 3;
        const dx = P[k1] - P[k0];
        const dy = P[k1 + 1] - P[k0 + 1];
        const dz = P[k1 + 2] - P[k0 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - seg) / d;
        const w0 = i === 0 ? 0 : 0.5;
        const w1 = i + 1 === n - 1 && this.endPinned ? 0 : 0.5;
        const ws = w0 + w1 || 1;
        P[k0] += dx * diff * (w0 / ws);
        P[k0 + 1] += dy * diff * (w0 / ws);
        P[k0 + 2] += dz * diff * (w0 / ws);
        P[k1] -= dx * diff * (w1 / ws);
        P[k1 + 1] -= dy * diff * (w1 / ws);
        P[k1 + 2] -= dz * diff * (w1 / ws);
      }
    }
    // dno / ziemia
    for (let i = 1; i < n; i++) {
      const k = i * 3;
      const gy = env.terrainY(P[k], P[k + 2]) + 0.01;
      if (P[k + 1] < gy) P[k + 1] = gy;
    }
  }

  point(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }
}

/** Siatka linii renderująca VerletLine (1 draw call). */
export class LineRenderer {
  readonly object: THREE.Line;
  private attr: THREE.BufferAttribute;

  constructor(n: number, color = 0xeeeeee, opacity = 0.75) {
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.object = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
  }

  set(points: Float32Array): void {
    (this.attr.array as Float32Array).set(points);
    this.attr.needsUpdate = true;
  }

  setSegment(a: THREE.Vector3, b: THREE.Vector3): void {
    const arr = this.attr.array as Float32Array;
    const n = arr.length / 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      arr[i * 3] = a.x + (b.x - a.x) * t;
      arr[i * 3 + 1] = a.y + (b.y - a.y) * t;
      arr[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.attr.needsUpdate = true;
  }
}
