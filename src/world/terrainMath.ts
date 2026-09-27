/**
 * Czysta matematyka świata (bez Three.js): kształt jeziora, MAPA GŁĘBOKOŚCI, wysokość terenu,
 * trzciny, pomost, droga. Używana przez render, gracza, rybę i testy.
 */
import { CFG } from '../config';
import { clamp, clamp01, lerp, smoothstep, DEG } from '../core/math';

const W = () => CFG.world;

export function lakeTheta(x: number, z: number): number {
  return Math.atan2(z / W().lakeRz, x / W().lakeRx);
}

/** Nieregularna linia brzegowa: skala promienia zależna od kąta. */
export function shoreScale(theta: number): number {
  return (
    1 +
    0.06 * Math.sin(3 * theta + 0.4) +
    0.035 * Math.sin(5 * theta + 1.3) +
    0.018 * Math.sin(9 * theta + 2.0)
  );
}

/** Znormalizowany promień: <1 woda, 1 = linia brzegu. */
export function lakeR(x: number, z: number): number {
  const w = W();
  const e = Math.hypot(x / w.lakeRx, z / w.lakeRz);
  return e / shoreScale(lakeTheta(x, z));
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 0..1 – na ile kąt leży w łuku trzcin. */
export function reedArcMask(theta: number): number {
  let m = 0;
  for (const arc of W().reedArcs) {
    const d = Math.abs(angleDiff(theta, arc.angleDeg * DEG));
    const h = arc.halfWidthDeg * DEG;
    m = Math.max(m, 1 - smoothstep(h * 0.55, h, d));
  }
  return m;
}

/** Punkt linii brzegu dla danego kąta (w przestrzeni świata). */
export function shorePoint(theta: number): { x: number; z: number } {
  const s = shoreScale(theta);
  return { x: W().lakeRx * Math.cos(theta) * s, z: W().lakeRz * Math.sin(theta) * s };
}

/** Głębokość wody [m] (0 na lądzie). MAPA GŁĘBOKOŚCI jeziora. */
export function lakeDepth(x: number, z: number): number {
  const w = W();
  const r = lakeR(x, z);
  if (r >= 1) return 0;
  const u = clamp((1 - r) / w.depthSpan, 0, 1);
  let d = w.maxDepth * Math.pow(u, w.depthExponent);
  // płycizna przy trzcinach
  const reed = reedArcMask(lakeTheta(x, z));
  d *= 1 - w.reedShallowing * reed * smoothstep(0.35, 0.85, r);
  // dołek
  const hd = Math.hypot(x - w.holeX, z - w.holeZ) / w.holeRadius;
  d += w.holeDepth * Math.exp(-hd * hd) * smoothstep(0, 0.3, u);
  return Math.max(0, d);
}

/** Łagodne pagórki (zawsze ≥ 0) + wznoszenie się w miarę oddalania od jeziora. */
export function hills(x: number, z: number): number {
  const r = lakeR(x, z);
  return (
    1.1 * (0.5 + 0.5 * Math.sin(x * 0.043 + 0.7) * Math.cos(z * 0.037 - 0.4)) +
    0.55 * (0.5 + 0.5 * Math.sin(x * 0.09 + z * 0.06 + 1.1)) +
    0.18 * (0.5 + 0.5 * Math.sin(x * 0.31 - z * 0.27)) +
    Math.max(0, r - 1.6) * 1.6
  );
}

// ---------- droga ----------
/** Droga: parking nad jeziorem → dom (podjazd). Auto w cutscence jedzie tą trasą. */
export const ROAD: ReadonlyArray<[number, number]> = [
  [-6, 58],
  [-6, 68],
  [-12, 86],
  [2, 112],
  [-6, 140],
  [-2, 158],
  [-2, 176],
  [0.5, 185],
  [2.5, 191],
];

export function nearestOnPolyline(
  pts: ReadonlyArray<[number, number]>,
  x: number,
  z: number,
): { x: number; z: number; dist: number } {
  let best = { x: pts[0][0], z: pts[0][1], dist: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
    const px = ax + vx * t;
    const pz = az + vz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) best = { x: px, z: pz, dist: d };
  }
  return best;
}

function baseLand(x: number, z: number): number {
  const w = W();
  const r = lakeR(x, z);
  return w.bankHeight * smoothstep(1, 1.07, r) + hills(x, z) * smoothstep(1.04, 1.7, r);
}

/** Maska 0..1 wypłaszczonych miejsc: parking, dom. */
function flattenParking(x: number, z: number): number {
  const w = W();
  const dx = Math.abs(x - w.parkingX) - 9;
  const dz = Math.abs(z - w.parkingZ) - 7;
  const d = Math.max(dx, dz, 0);
  return 1 - smoothstep(0, 5, d);
}

export function houseGroundHeight(): number {
  return baseLand(W().houseX, W().houseZ);
}

/** Wysokość terenu (analityczna). Pod wodą = -głębokość. */
export function terrainHeightAnalytic(x: number, z: number): number {
  const r = lakeR(x, z);
  if (r < 1) return -lakeDepth(x, z);
  const w = W();
  let h = baseLand(x, z);
  // droga
  const n = nearestOnPolyline(ROAD, x, z);
  if (n.dist < 7) {
    const roadH = baseLand(n.x, n.z);
    h = lerp(h, roadH, 1 - smoothstep(3, 7, n.dist));
  }
  // dom
  const hd = Math.hypot(x - w.houseX, z - w.houseZ);
  if (hd < 22) h = lerp(h, houseGroundHeight(), 1 - smoothstep(13, 22, hd));
  // parking
  const pm = flattenParking(x, z);
  if (pm > 0) h = lerp(h, w.parkingH, pm);
  return h;
}

export function roadMask(x: number, z: number): number {
  const n = nearestOnPolyline(ROAD, x, z);
  return 1 - smoothstep(2.4, 3.4, n.dist);
}

export function parkingMask(x: number, z: number): number {
  const w = W();
  const dx = Math.abs(x - w.parkingX) - 8;
  const dz = Math.abs(z - w.parkingZ) - 6;
  return 1 - smoothstep(0, 1.2, Math.max(dx, dz, 0));
}

// ---------- pomost ----------
export interface PierRect {
  x0: number;
  x1: number;
  z0: number; // koniec w wodzie (mniejsze z)
  z1: number; // koniec na lądzie
  deck: number;
  shoreZ: number;
}

let pierCache: PierRect | null = null;
export function pierRect(): PierRect {
  if (pierCache) return pierCache;
  const w = W();
  const p = shorePoint(w.pierAngleDeg * DEG);
  pierCache = {
    x0: p.x - w.pierWidth / 2,
    x1: p.x + w.pierWidth / 2,
    z0: p.z - w.pierLengthWater,
    z1: p.z + w.pierLengthLand,
    deck: w.pierDeckHeight,
    shoreZ: p.z,
  };
  return pierCache;
}

export function resetWorldCaches(): void {
  pierCache = null;
}

export function onPier(x: number, z: number, margin = 0): boolean {
  const p = pierRect();
  return x >= p.x0 - margin && x <= p.x1 + margin && z >= p.z0 - margin && z <= p.z1 + margin;
}

export function distToPier(x: number, z: number): number {
  const p = pierRect();
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dz = Math.max(p.z0 - z, 0, z - p.z1);
  return Math.hypot(dx, dz);
}

/** Wysokość podłoża dla gracza (teren lub deski pomostu). */
export function groundHeight(x: number, z: number): number {
  const t = terrainHeightAnalytic(x, z);
  if (onPier(x, z)) return Math.max(t, pierRect().deck);
  return t;
}

/** Granica mapy (elipsa): >1 = poza. */
export function boundsR(x: number, z: number): number {
  const w = W();
  return Math.hypot((x - w.boundsCx) / w.boundsRx, (z - w.boundsCz) / w.boundsRz);
}
