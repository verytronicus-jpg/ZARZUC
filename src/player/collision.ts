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

export interface CollisionResult {
  x: number;
  z: number;
  hit: boolean;
}

/**
 * Siatka przestrzenna kolizji: gracz sprawdza tylko przeszkody z sąsiednich komórek (setki drzew na mapie →
 * kilka sprawdzeń na krok) i nic nie alokuje.
 */
export class CollisionGrid {
  private cells = new Map<number, Collider[]>();
  private seen = new Map<Collider, number>();
  private query = 0;
  private readonly found: Collider[] = [];

  constructor(
    colliders: readonly Collider[],
    private cell = 4,
  ) {
    for (let ci = 0; ci < colliders.length; ci++) {
      const c = colliders[ci];
      const rad = c.kind === 'circle' ? c.r : Math.hypot(c.hx, c.hz);
      const x0 = Math.floor((c.x - rad) / cell);
      const x1 = Math.floor((c.x + rad) / cell);
      const z0 = Math.floor((c.z - rad) / cell);
      const z1 = Math.floor((c.z + rad) / cell);
      for (let i = x0; i <= x1; i++)
        for (let j = z0; j <= z1; j++) {
          const k = this.key(i, j);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(c);
        }
      this.seen.set(c, 0);
    }
  }

  private key(i: number, j: number): number {
    return (i + 32768) * 65536 + (j + 32768);
  }

  /** Przeszkody w promieniu `r` od (x, z) – zwracana tablica jest wielokrotnego użytku. */
  near(x: number, z: number, r: number): readonly Collider[] {
    const out = this.found;
    out.length = 0;
    const q = ++this.query;
    const cs = this.cell;
    const x0 = Math.floor((x - r) / cs);
    const x1 = Math.floor((x + r) / cs);
    const z0 = Math.floor((z - r) / cs);
    const z1 = Math.floor((z + r) / cs);
    for (let i = x0; i <= x1; i++)
      for (let j = z0; j <= z1; j++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const c = list[k];
          if (this.seen.get(c) === q) continue;
          this.seen.set(c, q);
          out.push(c);
        }
      }
    return out;
  }
}

export function resolveCollisions(
  x: number,
  z: number,
  r: number,
  colliders: readonly Collider[],
  out: CollisionResult = { x: 0, z: 0, hit: false },
): CollisionResult {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (let ci = 0; ci < colliders.length; ci++) {
      const c = colliders[ci];
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
  out.x = x;
  out.z = z;
  out.hit = hit;
  return out;
}
