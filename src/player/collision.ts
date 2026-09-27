/** Proste kolizje 2D (płaszczyzna XZ): kapsuła gracza jako okrąg vs okręgi / prostokąty obrócone. */
export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
}

export interface BoxCollider {
  kind: 'box';
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** obrót wokół Y [rad] */
  angle: number;
}

export type Collider = CircleCollider | BoxCollider;

export function resolveCollisions(x: number, z: number, r: number, colliders: readonly Collider[]): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of colliders) {
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const min = r + c.r;
        if (d < min) {
          hit = true;
          if (d < 1e-6) {
            x += min;
          } else {
            x = c.x + (dx / d) * min;
            z = c.z + (dz / d) * min;
          }
        }
      } else {
        const cs = Math.cos(c.angle);
        const sn = Math.sin(c.angle);
        // do lokalnego układu prostokąta (rotacja Y: x' = x cos - z sin ... odwrotnie)
        const dx = x - c.x;
        const dz = z - c.z;
        const lx = dx * cs - dz * sn;
        const lz = dx * sn + dz * cs;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ox = lx - qx;
        let oz = lz - qz;
        const d = Math.hypot(ox, oz);
        let nlx = lx;
        let nlz = lz;
        if (d > 1e-6) {
          if (d < r) {
            hit = true;
            nlx = qx + (ox / d) * r;
            nlz = qz + (oz / d) * r;
          } else continue;
        } else {
          // środek w prostokącie – wypchnij najkrótszą drogą
          hit = true;
          const px = c.hx - Math.abs(lx);
          const pz = c.hz - Math.abs(lz);
          if (px < pz) nlx = Math.sign(lx || 1) * (c.hx + r);
          else nlz = Math.sign(lz || 1) * (c.hz + r);
        }
        // z powrotem do świata (odwrotna rotacja)
        x = c.x + nlx * cs + nlz * sn;
        z = c.z - nlx * sn + nlz * cs;
        ox = oz = 0;
      }
    }
  }
  return { x, z, hit };
}
