/**
 * Czysta matematyka świata (bez Three.js): kształt jeziora, MAPA GŁĘBOKOŚCI, wysokość terenu,
 * trzciny, pomost, cypel, zwalone drzewo, chatka z polaną, ścieżka, granice gracza.
 * Używana przez render, gracza, rybę i testy.
 */
import { CFG } from '../config';
import { clamp, clamp01, lerp, smoothstep, DEG } from '../core/math';

const W = () => CFG.world;

// =====================================================================
// jezioro
// =====================================================================

/** Kąt punktu względem środka głównej misy (w przestrzeni elipsy). 90° = +z (południe). */
export function lakeTheta(x: number, z: number): number {
  return Math.atan2(z / W().lakeRz, x / W().lakeRx);
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Nieregularna linia brzegowa głównej misy: skala promienia zależna od kąta (zatoczki, cypel, drobne falowanie).
 * `bumps` skaluje zatoczki/cypel (0 = sam zarys – do wznoszenia terenu z dala od brzegu).
 */
export function shoreScale(theta: number, bumps = 1, negBumps = bumps): number {
  let s =
    1 +
    0.035 * Math.sin(3 * theta + 0.4) +
    0.022 * Math.sin(5 * theta + 1.3) +
    0.014 * Math.sin(9 * theta + 2.0) +
    0.007 * Math.sin(17 * theta + 0.7);
  if (bumps > 0 || negBumps > 0) {
    for (const b of W().shoreBumps) {
      const d = angleDiff(theta, b.angleDeg * DEG) / (b.widthDeg * DEG);
      s += (b.amount < 0 ? negBumps : bumps) * b.amount * Math.exp(-d * d);
    }
  }
  return s;
}

/** Pole przedłużenia jeziora na północ (tylko widok). */
function farField(x: number, z: number): number {
  const w = W();
  const dx = (x - w.farLakeX) / w.farLakeRx;
  const dz = (z - w.farLakeZ) / w.farLakeRz;
  const th = Math.atan2(dz, dx);
  const wob = 1 + 0.06 * Math.sin(4 * th + 1.1) + 0.04 * Math.sin(7 * th + 0.3) + 0.02 * Math.sin(13 * th);
  return Math.hypot(dx, dz) / wob;
}

/** Wygładzone minimum (łączy misę z przedłużeniem kanałem bez ostrego kąta). */
function smin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Znormalizowane pole jeziora: <1 woda, 1 = linia brzegu, >1 ląd (≈ odległość w promieniach misy). */
export function lakeR(x: number, z: number, bumps = 1, negBumps = bumps): number {
  const w = W();
  const th = lakeTheta(x, z);
  let r = Math.hypot(x / w.lakeRx, z / w.lakeRz) / shoreScale(th, bumps, negBumps);
  // przedłużenie na północ (poza misą – wpływ tylko dla z < −20, płynnie włączany)
  if (z < -10) {
    const f = farField(x, z);
    const k = w.lakeBlend * smoothstep(-10, -30, z);
    r = k > 1e-4 ? smin(r, f, k) : Math.min(r, f);
  }
  // wyspy / zalesione cyple w oddali
  for (const is of w.islands) {
    const dx = x - is.x;
    const dz = z - is.z;
    if (Math.abs(dx) > is.r * 1.6 || Math.abs(dz) > is.r * 1.6) continue;
    const d = Math.hypot(dx, dz) / is.r;
    if (d < 1.6) r = Math.max(r, 1 + (1 - d) * 0.9);
  }
  return r;
}

/** Promień elipsy misy w danym kierunku [m] – do przeliczenia pola na metry. */
function basinRadiusAt(theta: number): number {
  const w = W();
  return Math.hypot(w.lakeRx * Math.cos(theta), w.lakeRz * Math.sin(theta));
}

/**
 * Przybliżona odległość od linii brzegu [m] (dodatnia na lądzie). Blisko wody liczona od prawdziwego brzegu
 * (z zatoczkami i cyplem), dalej od samego zarysu – żeby cypel/zatoczki nie ciągnęły grzbietów/dolin w las.
 */
export function shoreDistance(x: number, z: number, r = lakeR(x, z)): number {
  const R = basinRadiusAt(lakeTheta(x, z));
  const dNear = (r - 1) * R;
  if (dNear <= 0) return dNear;
  const dBase = (lakeR(x, z, 0) - 1) * R;
  return lerp(dNear, Math.max(dBase, 0), smoothstep(4, 30, dNear));
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

/** Punkt linii brzegu głównej misy dla danego kąta. */
export function shorePoint(theta: number): { x: number; z: number } {
  const s = shoreScale(theta);
  return { x: W().lakeRx * Math.cos(theta) * s, z: W().lakeRz * Math.sin(theta) * s };
}

/** Głębokość wody [m] (0 na lądzie). MAPA GŁĘBOKOŚCI jeziora. */
export function lakeDepth(x: number, z: number): number {
  const w = W();
  const r = lakeR(x, z);
  if (r >= 1) return 0;
  // profil głębokości liczony bez cypla (stromy uskok przy skałach), brzeg – z cyplem
  const rd = Math.min(r, lerp(r, lakeR(x, z, 1, 0), smoothstep(1, 0.9, r)));
  const u = clamp((1 - rd) / w.depthSpan, 0, 1);
  const inBasin = z > -38 ? 1 : 1 - smoothstep(-38, -70, z);
  // przedłużenie jeziora: szybciej głęboko (węższy pas płycizny)
  const uFar = clamp((1 - rd) / 0.28, 0, 1);
  let d = lerp(w.farLakeDepth * Math.pow(uFar, 0.7), w.maxDepth * Math.pow(u, w.depthExponent), inBasin);
  if (inBasin > 0) {
    // płycizna przy trzcinach (zatoczki)
    const reed = reedArcMask(lakeTheta(x, z)) * inBasin;
    d *= 1 - w.reedShallowing * reed * smoothstep(0.2, 0.85, rd);
    // płycizna wokół skalistego cypla
    const pd = Math.hypot(x - w.pointX, z - w.pointZ) / (w.pointRadius * 1.8);
    d *= lerp(0.6, 1, smoothstep(0.35, 1, pd));
    // dołek
    const hd = Math.hypot(x - w.holeX, z - w.holeZ) / w.holeRadius;
    d += w.holeDepth * Math.exp(-hd * hd) * smoothstep(0, 0.3, u) * inBasin;
  }
  return Math.max(0, d);
}

// =====================================================================
// łamane (ścieżka)
// =====================================================================

export function nearestOnPolyline(
  pts: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
): { x: number; z: number; dist: number; s: number } {
  let best = { x: pts[0][0], z: pts[0][1], dist: Infinity, s: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const len = Math.sqrt(len2);
    const t = len2 > 0 ? clamp01(((x - ax) * vx + (z - az) * vz) / len2) : 0;
    const px = ax + vx * t;
    const pz = az + vz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.dist) best = { x: px, z: pz, dist: d, s: acc + len * t };
    acc += len;
  }
  return best;
}

export function polylineLength(pts: ReadonlyArray<readonly [number, number]>): number {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}

// =====================================================================
// chatka
// =====================================================================

export interface CabinFrame {
  x: number;
  z: number;
  /** obrót: przód (drzwi) chatki patrzy w stronę (sin yaw, cos yaw) */
  yaw: number;
  fx: number;
  fz: number;
  /** lokalne +X modelu chatki w świecie (po prawej, patrząc na front z zewnątrz) */
  rx: number;
  rz: number;
  ground: number;
}

let cabinCache: CabinFrame | null = null;
/** Położenie i orientacja chatki: drzwi zwrócone w stronę nasady pomostu. */
export function cabinFrame(): CabinFrame {
  if (cabinCache) return cabinCache;
  const w = W();
  const p = pierRect();
  const dx = (p.x0 + p.x1) / 2 - w.cabinX;
  const dz = p.z1 - w.cabinZ;
  const yaw = Math.atan2(dx, dz);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  cabinCache = { x: w.cabinX, z: w.cabinZ, yaw, fx, fz, rx: fz, rz: -fx, ground: w.cabinGround };
  return cabinCache;
}

/** Punkt w lokalnym układzie modelu chatki (lx = lokalne +X, lz = lokalne +Z = w stronę drzwi). */
export function cabinToWorld(lx: number, lz: number): { x: number; z: number } {
  const c = cabinFrame();
  return { x: c.x + c.rx * lx + c.fx * lz, z: c.z + c.rz * lx + c.fz * lz };
}

/** Świat → lokalny układ chatki. */
export function worldToCabin(x: number, z: number): { lx: number; lz: number } {
  const c = cabinFrame();
  const dx = x - c.x;
  const dz = z - c.z;
  return { lx: dx * c.rx + dz * c.rz, lz: dx * c.fx + dz * c.fz };
}

/** Start gracza: na ganku przed drzwiami, przodem do jeziora. */
export function porchStart(): { x: number; z: number; yaw: number } {
  const w = W();
  const p = cabinToWorld(-w.cabinWidth * 0.22, w.cabinDepth / 2 + w.porchStartDepth);
  return { x: p.x, z: p.z, yaw: cabinFrame().yaw };
}

/** Środek stopni ganku (tu zaczyna się ścieżka). */
export function porchFoot(): { x: number; z: number } {
  const w = W();
  return cabinToWorld(-w.cabinWidth * 0.22, w.cabinDepth / 2 + w.porchDepth + 0.75);
}

// =====================================================================
// ścieżka
// =====================================================================

let pathCache: Array<[number, number]> | null = null;
/** Ścieżka (gęsta łamana) od stopni ganku do nasady pomostu. */
export function pathPolyline(): Array<[number, number]> {
  if (pathCache) return pathCache;
  const w = W();
  const p = pierRect();
  const foot = porchFoot();
  const ctrl: Array<[number, number]> = [[foot.x, foot.z], ...w.pathPoints, [(p.x0 + p.x1) / 2, p.z1 - 0.4]];
  // CatmullRom (centripetalny w przybliżeniu – jednolity parametr wystarcza przy łagodnych łukach)
  const out: Array<[number, number]> = [];
  const n = ctrl.length;
  const P = (i: number) => ctrl[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[n - 1]);
  pathCache = out;
  return out;
}

/** 0..1 – udeptana ziemia ścieżki (1 na środku). */
export function pathMask(x: number, z: number): number {
  const n = nearestOnPolyline(pathPolyline(), x, z);
  const hw = W().pathWidth / 2;
  return 1 - smoothstep(hw * 0.7, hw * 1.25, n.dist);
}

// =====================================================================
// teren
// =====================================================================

/** Tani szum wartości (sumy sinusów) – pagórki. */
function hills(x: number, z: number): number {
  return (
    0.5 * Math.sin(x * 0.043 + 0.7) * Math.cos(z * 0.037 - 0.4) +
    0.3 * Math.sin(x * 0.09 + z * 0.06 + 1.1) +
    0.12 * Math.sin(x * 0.21 - z * 0.17) +
    0.35 * Math.sin(x * 0.011 - 0.5) * Math.sin(z * 0.013 + 0.9)
  );
}

/** Ląd bez wypłaszczeń: brzeg + wznoszenie z odległością od wody + pagórki. */
export function baseLand(x: number, z: number, r = lakeR(x, z)): number {
  const w = W();
  const d = Math.max(0, shoreDistance(x, z, r));
  let h = w.bankHeight * smoothstep(1, 1.06, r) + w.riseLinear * d + w.riseQuad * d * d;
  const amp = w.hillAmp * smoothstep(2, 25, d) + w.hillAmpFar * d;
  h += hills(x, z) * amp;
  // skalisty cypel wystaje ponad wodę
  const pdx = x - w.pointX;
  const pdz = z - w.pointZ;
  const pr = w.pointRadius * 1.6;
  if (r >= 1 && Math.abs(pdx) < pr && Math.abs(pdz) < pr) {
    const pd = Math.hypot(pdx, pdz) / pr;
    if (pd < 1) h = Math.max(h, w.bankHeight + w.pointHeight * (1 - smoothstep(0.2, 1, pd)));
  }
  return h;
}

/** Maska polany (1 = płasko na wysokości polany). */
export function clearingMask(x: number, z: number): number {
  const w = W();
  const c = cabinFrame();
  const d = Math.hypot(x - c.x, z - c.z);
  return 1 - smoothstep(w.clearingRadius, w.clearingRadius + w.clearingFade, d);
}

/** Wysokość terenu (analityczna). Pod wodą = −głębokość. */
export function terrainHeightAnalytic(x: number, z: number): number {
  const r = lakeR(x, z);
  if (r < 1) return -lakeDepth(x, z);
  const w = W();
  let h = baseLand(x, z, r);
  // ścieżka: wypłaszczenie w poprzek, łagodny spadek wzdłuż (od polany do brzegu)
  const pb = pathBox();
  const m = w.pathFlatten * 2;
  if (x > pb.x0 - m && x < pb.x1 + m && z > pb.z0 - m && z < pb.z1 + m) {
    const n = nearestOnPolyline(pathPolyline(), x, z);
    if (n.dist < m) h = lerp(h, pathHeightAt(n.s), 1 - smoothstep(w.pathFlatten * 0.6, m, n.dist));
  }
  // polana z chatką
  const cm = clearingMask(x, z);
  if (cm > 0) h = lerp(h, w.cabinGround, cm);
  return h;
}

let pathBoxCache: { x0: number; x1: number; z0: number; z1: number; len: number; endH: number } | null = null;
function pathBox() {
  if (pathBoxCache) return pathBoxCache;
  const pts = pathPolyline();
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, len: polylineLength(pts), endH: 0 };
  for (const [x, z] of pts) {
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.z0 = Math.min(b.z0, z);
    b.z1 = Math.max(b.z1, z);
  }
  const [ex, ez] = pts[pts.length - 1];
  b.endH = baseLand(ex, ez);
  pathBoxCache = b;
  return b;
}

/** Wysokość środka ścieżki w funkcji drogi s od ganku: prawie stały spadek od polany do brzegu. */
function pathHeightAt(s: number): number {
  const b = pathBox();
  const t = clamp01(s / b.len);
  const e = 0.75 * t + 0.25 * smoothstep(0, 1, t);
  return lerp(W().cabinGround, b.endH, e);
}

// =====================================================================
// pomost, platformy (ganek, stopnie)
// =====================================================================

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
  cabinCache = null;
  pathCache = null;
  pathBoxCache = null;
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

/**
 * Deski pod nogami (ganek i stopnie w lokalnym układzie chatki): wysokość albo −Infinity.
 * Ganek: pas przed ścianą frontową; stopnie przed drzwiami.
 */
export function porchHeight(x: number, z: number): number {
  const w = W();
  const { lx, lz } = worldToCabin(x, z);
  const hw = w.cabinWidth / 2 + 0.2;
  const front = w.cabinDepth / 2;
  const g = w.cabinGround;
  const f = w.floorHeight;
  if (Math.abs(lx) <= hw && lz >= front - 0.05 && lz <= front + w.porchDepth) return g + f;
  // dwa stopnie przed drzwiami (drzwi po lewej stronie frontu, patrząc z zewnątrz: lx < 0)
  const sx = -w.cabinWidth * 0.22;
  if (Math.abs(lx - sx) <= 0.8) {
    const z0 = front + w.porchDepth;
    if (lz > z0 && lz <= z0 + 0.35) return g + (f * 2) / 3;
    if (lz > z0 + 0.35 && lz <= z0 + 0.7) return g + f / 3;
  }
  return -Infinity;
}

/** Wysokość podłoża dla gracza (teren, deski pomostu, ganek). */
export function groundHeight(x: number, z: number): number {
  const t = terrainHeightAnalytic(x, z);
  let h = t;
  if (onPier(x, z)) h = Math.max(h, pierRect().deck);
  return Math.max(h, porchHeight(x, z));
}

// =====================================================================
// struktury dla ryb (pomost, zwalone drzewo, kamienie cypla)
// =====================================================================

function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = clamp01(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}

export function distToFallenTree(x: number, z: number): number {
  const w = W();
  return Math.max(0, distToSegment(x, z, w.logX0, w.logZ0, w.logX1, w.logZ1) - w.logRadius);
}

export function distToPointRocks(x: number, z: number): number {
  const w = W();
  return Math.max(0, Math.hypot(x - w.pointX, z - w.pointZ) - w.pointRadius);
}

/** Odległość [m] do najbliższej struktury, przy której trzyma się okoń: pomost, zwalone drzewo, kamienie cypla. */
export function structureDistance(x: number, z: number): number {
  return Math.min(distToPier(x, z), distToFallenTree(x, z), distToPointRocks(x, z));
}

// =====================================================================
// granice gracza
// =====================================================================

/** Odległość ze znakiem do wielokąta granic (ujemna w środku). */
export function boundsDistance(x: number, z: number): number {
  const poly = W().bounds;
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    best = Math.min(best, distToSegment(x, z, xi, zi, xj, zj));
  }
  return inside ? -best : best;
}

export function outsideBounds(x: number, z: number): boolean {
  return boundsDistance(x, z) > 0;
}
