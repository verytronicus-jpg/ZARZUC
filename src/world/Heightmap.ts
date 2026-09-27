/**
 * Heightmapa terenu: siatka próbek funkcji analitycznej.
 * Siatka prostokątna o NIEJEDNORODNYM kroku: gęsta (terrainStep) w obszarze gry, dalej krok rośnie
 * geometrycznie do terrainMaxStep (góry i las w oddali) – jedna siatka, bez szwów.
 * heightAt() interpoluje dokładnie po tych samych trójkątach, co siatka renderowana
 * (podział komórki (i,j)-(i,j+1)-(i+1,j) / (i+1,j)-(i,j+1)-(i+1,j+1)),
 * więc postać stoi dokładnie na widocznej powierzchni.
 */
import { CFG } from '../config';
import { terrainHeightAnalytic } from './terrainMath';

/** Współrzędne węzłów: gęsto w [fineMin, fineMax], na zewnątrz krok rośnie ×growth do maxStep, aż do ±extent. */
export function gradedAxis(fineMin: number, fineMax: number, step: number, growth: number, maxStep: number, extent: number): number[] {
  const n = Math.round((fineMax - fineMin) / step);
  const d = (fineMax - fineMin) / n;
  const mid: number[] = [];
  for (let i = 0; i <= n; i++) mid.push(fineMin + i * d);
  const hi: number[] = [];
  let s = d;
  let x = fineMax;
  while (x < extent) {
    s = Math.min(maxStep, s * growth);
    x += s;
    hi.push(x);
  }
  const lo: number[] = [];
  s = d;
  x = fineMin;
  while (x > -extent) {
    s = Math.min(maxStep, s * growth);
    x -= s;
    lo.push(x);
  }
  return [...lo.reverse(), ...mid, ...hi];
}

export class Heightmap {
  readonly nx: number;
  readonly nz: number;
  /** współrzędne węzłów */
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly heights: Float32Array;
  private fineX0: number;
  private fineZ0: number;
  private fineIX: number;
  private fineIZ: number;
  private fineNX: number;
  private fineNZ: number;
  private fineD: number;

  constructor() {
    const w = CFG.world;
    const ax = gradedAxis(w.terrainFineMinX, w.terrainFineMaxX, w.terrainStep, w.terrainGrowth, w.terrainMaxStep, w.terrainExtent);
    const az = gradedAxis(w.terrainFineMinZ, w.terrainFineMaxZ, w.terrainStep, w.terrainGrowth, w.terrainMaxStep, w.terrainExtent);
    this.xs = Float64Array.from(ax);
    this.zs = Float64Array.from(az);
    this.nx = ax.length;
    this.nz = az.length;
    // szybki indeks w części jednorodnej
    this.fineX0 = w.terrainFineMinX;
    this.fineZ0 = w.terrainFineMinZ;
    this.fineIX = ax.findIndex((v) => Math.abs(v - w.terrainFineMinX) < 1e-6);
    this.fineIZ = az.findIndex((v) => Math.abs(v - w.terrainFineMinZ) < 1e-6);
    this.fineD = (w.terrainFineMaxX - w.terrainFineMinX) / Math.round((w.terrainFineMaxX - w.terrainFineMinX) / w.terrainStep);
    this.fineNX = Math.round((w.terrainFineMaxX - w.terrainFineMinX) / this.fineD);
    this.fineNZ = Math.round((w.terrainFineMaxZ - w.terrainFineMinZ) / this.fineD);
    this.heights = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        this.heights[j * this.nx + i] = terrainHeightAnalytic(this.xs[i], this.zs[j]);
      }
    }
  }

  h(i: number, j: number): number {
    i = Math.max(0, Math.min(this.nx - 1, i));
    j = Math.max(0, Math.min(this.nz - 1, j));
    return this.heights[j * this.nx + i];
  }

  /** indeks komórki i ułamek (0..1) wzdłuż osi */
  private locate(v: number, arr: Float64Array, fine0: number, fineI: number, fineN: number): [number, number] {
    const f = (v - fine0) / this.fineD;
    if (f >= 0 && f < fineN) {
      const k = Math.floor(f);
      return [fineI + k, f - k];
    }
    // wyszukiwanie binarne w części rzadkiej
    let lo = 0;
    let hi = arr.length - 1;
    if (v <= arr[0]) return [0, 0];
    if (v >= arr[hi]) return [hi - 1, 1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= v) lo = m;
      else hi = m;
    }
    return [lo, (v - arr[lo]) / (arr[lo + 1] - arr[lo])];
  }

  heightAt(x: number, z: number): number {
    const [i, u] = this.locate(x, this.xs, this.fineX0, this.fineIX, this.fineNX);
    const [j, v] = this.locate(z, this.zs, this.fineZ0, this.fineIZ, this.fineNZ);
    const h00 = this.h(i, j);
    const h10 = this.h(i + 1, j);
    const h01 = this.h(i, j + 1);
    const h11 = this.h(i + 1, j + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
}
