/**
 * Heightmapa terenu: siatka próbek funkcji analitycznej.
 * heightAt() interpoluje dokładnie po tych samych trójkątach, co siatka renderowana
 * (podział komórki (i,j)-(i,j+1)-(i+1,j) / (i+1,j)-(i,j+1)-(i+1,j+1)),
 * więc postać stoi dokładnie na widocznej powierzchni.
 */
import { CFG } from '../config';
import { terrainHeightAnalytic } from './terrainMath';

export class Heightmap {
  readonly nx: number;
  readonly nz: number;
  readonly dx: number;
  readonly dz: number;
  readonly x0: number;
  readonly z0: number;
  readonly heights: Float32Array;

  constructor() {
    const w = CFG.world;
    this.x0 = w.terrainMinX;
    this.z0 = w.terrainMinZ;
    this.nx = Math.round((w.terrainMaxX - w.terrainMinX) / w.terrainStep) + 1;
    this.nz = Math.round((w.terrainMaxZ - w.terrainMinZ) / w.terrainStep) + 1;
    this.dx = (w.terrainMaxX - w.terrainMinX) / (this.nx - 1);
    this.dz = (w.terrainMaxZ - w.terrainMinZ) / (this.nz - 1);
    this.heights = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        this.heights[j * this.nx + i] = terrainHeightAnalytic(this.x0 + i * this.dx, this.z0 + j * this.dz);
      }
    }
  }

  h(i: number, j: number): number {
    i = Math.max(0, Math.min(this.nx - 1, i));
    j = Math.max(0, Math.min(this.nz - 1, j));
    return this.heights[j * this.nx + i];
  }

  heightAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.dx;
    const fz = (z - this.z0) / this.dz;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const h00 = this.h(i, j);
    const h10 = this.h(i + 1, j);
    const h01 = this.h(i, j + 1);
    const h11 = this.h(i + 1, j + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
}
