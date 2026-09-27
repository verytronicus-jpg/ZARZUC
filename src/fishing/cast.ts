/** Balistyka zestawu (spławik + śrucina + haczyk): grawitacja + kwadratowy opór powietrza a = -k|v|v. */
import { lerp, DEG } from '../core/math';

interface CastConfig {
  vMin: number;
  vMax: number;
  angleDeg: number;
  gravity: number;
  airDragK: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function launchVelocity(power: number, yaw: number, cfg: CastConfig): Vec3 {
  const v0 = lerp(cfg.vMin, cfg.vMax, power);
  const a = cfg.angleDeg * DEG;
  const h = v0 * Math.cos(a);
  return { x: Math.sin(yaw) * h, y: v0 * Math.sin(a), z: Math.cos(yaw) * h };
}

/** Jeden krok (semi-implicit Euler). Modyfikuje p i v w miejscu. Zwraca przebytą drogę. */
export function stepProjectile(p: Vec3, v: Vec3, dt: number, cfg: CastConfig): number {
  const sp = Math.hypot(v.x, v.y, v.z);
  const k = cfg.airDragK * sp;
  v.x += -k * v.x * dt;
  v.y += (-cfg.gravity - k * v.y) * dt;
  v.z += -k * v.z * dt;
  const dx = v.x * dt;
  const dy = v.y * dt;
  const dz = v.z * dt;
  p.x += dx;
  p.y += dy;
  p.z += dz;
  return Math.hypot(dx, dy, dz);
}

/** Zasięg poziomy przy starcie z wysokości h0 nad wodą (do strojenia i HUD). */
export function simulateRange(power: number, h0: number, cfg: CastConfig, dt = 1 / 120): { range: number; path: number; time: number } {
  const p = { x: 0, y: h0, z: 0 };
  const v = launchVelocity(power, 0, cfg);
  let path = 0;
  let t = 0;
  while (p.y > 0 && t < 20) {
    path += stepProjectile(p, v, dt, cfg);
    t += dt;
  }
  return { range: Math.hypot(p.x, p.z), path, time: t };
}
