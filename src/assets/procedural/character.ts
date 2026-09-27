import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { smoothstep } from '../../core/math';

/**
 * Bohater wg arkuszy 01-bohater-arkusz / 01b-bohater-detale: młody wędkarz w rdzawej czapce, kremowym T-shircie,
 * granatowo-morskich ogrodniczkach z musztardowymi szelkami (na plecach „X”), z saszetką przy pasku,
 * breloczkiem-spławikiem na szelce, zegarkiem i gumowcami.
 *
 * Jedna siatka ze szkieletem (SkinnedMesh, kolory wierzchołków → jeden draw call). Kości mają nazwy z PIVOTS
 * (jak w Blenderze), więc animator i doczepianie wędki działają tak samo jak dla modelu GLB.
 * Origin = między stopami na ziemi, przód = +Z, prawa ręka po stronie -X.
 */

// --- paleta (z arkuszy) ---
const COL = {
  skin: 0xd8ae94,
  skinShade: 0xc48f70,
  stubble: 0x7d6150,
  lips: 0xc27762,
  hair: 0x3a2518,
  brow: 0x33200f,
  eyeWhite: 0xeee6dc,
  iris: 0x4a3020,
  beanie: 0xb04a26,
  beanieDark: 0x8e3a1e,
  shirt: 0xdccfb4,
  shirtShade: 0xc8b99c,
  overall: 0x3e5a62,
  overallDark: 0x2f454c,
  knee: 0x30393a,
  strap: 0xc4952e,
  strapDark: 0x8f6a1e,
  buckle: 0x3a3632,
  belt: 0x4a3324,
  beltMetal: 0x8c7b58,
  pouch: 0x8b6a3a,
  pouchDark: 0x6a4e2a,
  boot: 0x4f5746,
  bootMud: 0x3c3a30,
  sole: 0x9c7a52,
  watch: 0x26272a,
  floatRed: 0xd23a2a,
  floatWhite: 0xf0ece4,
} as const;

/** Kości w kolejności indeksów (hierarchia jak w dotychczasowym modelu). */
const BONES: Array<{ name: string; parent: string | null; pos: [number, number, number] }> = [
  { name: PIVOTS.hips, parent: null, pos: [0, 0.95, 0] },
  { name: PIVOTS.spine, parent: PIVOTS.hips, pos: [0, 0.06, 0] },
  { name: PIVOTS.neck, parent: PIVOTS.spine, pos: [0, 0.55, 0] },
  { name: PIVOTS.head, parent: PIVOTS.neck, pos: [0, 0.13, 0] },
  { name: PIVOTS.upperarmL, parent: PIVOTS.spine, pos: [0.245, 0.47, 0] },
  { name: PIVOTS.forearmL, parent: PIVOTS.upperarmL, pos: [0, -0.3, 0] },
  { name: PIVOTS.handL, parent: PIVOTS.forearmL, pos: [0, -0.29, 0] },
  { name: PIVOTS.upperarmR, parent: PIVOTS.spine, pos: [-0.245, 0.47, 0] },
  { name: PIVOTS.forearmR, parent: PIVOTS.upperarmR, pos: [0, -0.3, 0] },
  { name: PIVOTS.handR, parent: PIVOTS.forearmR, pos: [0, -0.29, 0] },
  { name: PIVOTS.thighL, parent: PIVOTS.hips, pos: [0.1, -0.03, 0] },
  { name: PIVOTS.shinL, parent: PIVOTS.thighL, pos: [0, -0.45, 0] },
  { name: PIVOTS.footL, parent: PIVOTS.shinL, pos: [0, -0.43, 0] },
  { name: PIVOTS.thighR, parent: PIVOTS.hips, pos: [-0.1, -0.03, 0] },
  { name: PIVOTS.shinR, parent: PIVOTS.thighR, pos: [0, -0.45, 0] },
  { name: PIVOTS.footR, parent: PIVOTS.shinR, pos: [0, -0.43, 0] },
];
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i])) as Record<string, number>;

type Weights = Array<[number, number]>;
type WeightFn = (p: THREE.Vector3) => Weights;
type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

interface Part {
  geo: THREE.BufferGeometry;
  weights: WeightFn;
}

const tmpP = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpC = new THREE.Color();
const hex = (h: number) => new THREE.Color(h);

/** Przekrój eliptyczny na wysokości y (dla rur wzdłuż osi Y). */
interface Section {
  y: number;
  rx: number;
  rz: number;
  cx?: number;
  cz?: number;
}

/** Rura z przekrojów eliptycznych (od góry do dołu lub odwrotnie), opcjonalnie zamknięta. */
function tube(sections: Section[], seg: number, capStart = false, capEnd = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = seg;
  for (const s of sections) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push((s.cx ?? 0) + Math.sin(a) * s.rx, s.y, (s.cz ?? 0) + Math.cos(a) * s.rz);
    }
  }
  const down = sections[0].y > sections[sections.length - 1].y;
  for (let i = 0; i < sections.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * ring + k;
      const a1 = i * ring + ((k + 1) % seg);
      const b = a + ring;
      const b1 = a1 + ring;
      if (down) idx.push(a, b, a1, a1, b, b1);
      else idx.push(a, a1, b, a1, b1, b);
    }
  }
  const cap = (si: number, top: boolean) => {
    const s = sections[si];
    const c = pos.length / 3;
    pos.push(s.cx ?? 0, s.y, s.cz ?? 0);
    for (let k = 0; k < seg; k++) {
      const a = si * ring + k;
      const a1 = si * ring + ((k + 1) % seg);
      if (top) idx.push(c, a, a1);
      else idx.push(c, a1, a);
    }
  };
  if (capStart) cap(0, down);
  if (capEnd) cap(sections.length - 1, !down);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Elipsoida (środek, półosie) z opcjonalnym obrotem. */
function ellipsoid(c: [number, number, number], r: [number, number, number], ws = 14, hs = 10, rot?: THREE.Euler): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.scale(r[0], r[1], r[2]);
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(c[0], c[1], c[2]);
  return g;
}

function box(c: [number, number, number], s: [number, number, number], rot?: THREE.Euler): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
  g.deleteAttribute('uv');
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(c[0], c[1], c[2]);
  return g;
}

function colorize(g: THREE.BufferGeometry, fn: ColorFn | number): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const solidC = typeof fn === 'number' ? hex(fn) : null;
  for (let i = 0; i < pos.count; i++) {
    tmpP.fromBufferAttribute(pos, i);
    tmpN.fromBufferAttribute(nor, i);
    if (solidC) tmpC.copy(solidC);
    else (fn as ColorFn)(tmpP, tmpN, tmpC);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// --- wagi skóry ---
const rigid = (bone: string): WeightFn => () => [[B[bone], 1]];
const blend2 = (a: string, b: string, t: number): Weights => [
  [B[a], 1 - t],
  [B[b], t],
];

/** Noga: biodra → udo → goleń → stopa (płynnie na stawach). */
function legWeights(side: 'L' | 'R'): WeightFn {
  const thigh = side === 'L' ? PIVOTS.thighL : PIVOTS.thighR;
  const shin = side === 'L' ? PIVOTS.shinL : PIVOTS.shinR;
  const foot = side === 'L' ? PIVOTS.footL : PIVOTS.footR;
  return (p) => {
    if (p.y > 0.7) return blend2(thigh, PIVOTS.hips, smoothstep(0.9, 1.0, p.y) * 0.85);
    if (p.y > 0.28) return blend2(shin, thigh, smoothstep(0.43, 0.52, p.y));
    return blend2(foot, shin, smoothstep(0.08, 0.16, p.y));
  };
}

/** Ręka: tułów → ramię → przedramię → dłoń. */
function armWeights(side: 'L' | 'R'): WeightFn {
  const up = side === 'L' ? PIVOTS.upperarmL : PIVOTS.upperarmR;
  const fore = side === 'L' ? PIVOTS.forearmL : PIVOTS.forearmR;
  const hand = side === 'L' ? PIVOTS.handL : PIVOTS.handR;
  return (p) => {
    if (p.y > 1.3) return blend2(up, PIVOTS.spine, smoothstep(1.47, 1.56, p.y) * 0.55);
    if (p.y > 1.0) return blend2(fore, up, smoothstep(1.13, 1.23, p.y));
    return blend2(hand, fore, smoothstep(0.87, 0.94, p.y));
  };
}

const torsoWeights: WeightFn = (p) => {
  if (p.y > 1.45) return blend2(PIVOTS.spine, PIVOTS.neck, smoothstep(1.55, 1.62, p.y));
  return blend2(PIVOTS.hips, PIVOTS.spine, smoothstep(0.98, 1.14, p.y));
};
const neckWeights: WeightFn = (p) => blend2(PIVOTS.neck, PIVOTS.head, smoothstep(1.64, 1.72, p.y));

// --- tułów: wspólne przekroje (używane też do „przyklejania” szelek, klapy i kieszeni) ---
const TORSO: Section[] = [
  { y: 0.97, rx: 0.158, rz: 0.115 },
  { y: 1.03, rx: 0.156, rz: 0.113 },
  { y: 1.095, rx: 0.158, rz: 0.115 },
  { y: 1.105, rx: 0.158, rz: 0.115 },
  { y: 1.2, rx: 0.165, rz: 0.122, cz: 0.004 },
  { y: 1.3, rx: 0.176, rz: 0.13, cz: 0.01 },
  { y: 1.38, rx: 0.182, rz: 0.132, cz: 0.014 },
  { y: 1.45, rx: 0.19, rz: 0.124, cz: 0.008 },
  { y: 1.5, rx: 0.192, rz: 0.11 },
  { y: 1.535, rx: 0.17, rz: 0.096 },
  { y: 1.565, rx: 0.13, rz: 0.08 },
  { y: 1.6, rx: 0.088, rz: 0.07 },
  { y: 1.625, rx: 0.074, rz: 0.066, cz: 0.004 },
];

/** Punkt na powierzchni tułowia (przód lub tył) dla danego x, y, odsunięty o `off`. */
function torsoSurface(x: number, y: number, front: boolean, off: number): THREE.Vector3 {
  let i = 0;
  while (i < TORSO.length - 2 && TORSO[i + 1].y < y) i++;
  const a = TORSO[i];
  const b = TORSO[i + 1];
  const t = Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)));
  const rx = a.rx + (b.rx - a.rx) * t;
  const rz = a.rz + (b.rz - a.rz) * t;
  const cz = (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * t;
  const u = Math.min(0.98, Math.abs(x) / rx);
  const zz = rz * Math.sqrt(1 - u * u);
  // normalna elipsy ~ (x/rx², z/rz²)
  const nx = x / (rx * rx);
  const nz = (front ? zz : -zz) / (rz * rz);
  const nl = Math.hypot(nx, nz) || 1;
  return new THREE.Vector3(x + (nx / nl) * off, y, cz + (front ? zz : -zz) + (nz / nl) * off);
}

/** Pasek (szelka, klapa) przyklejony do tułowia: ścieżka punktów (x, y), szerokość w, grubość na zewnątrz. */
function torsoStrip(path: Array<[number, number]>, w: number, front: boolean, off: number, color: ColorFn | number): THREE.BufferGeometry {
  const pts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    const [x2, y2] = path[Math.min(path.length - 1, i + 1)];
    const [x0, y0] = path[Math.max(0, i - 1)];
    // kierunek w płaszczyźnie (x, y) i prostopadła
    let dx = x2 - x0;
    let dy = y2 - y0;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const px = -dy * w * 0.5;
    const py = dx * w * 0.5;
    const a = torsoSurface(x + px, y + py, front, off);
    const b = torsoSurface(x - px, y - py, front, off);
    pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i > 0) {
      const k = i * 2;
      if (front) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      else idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // pasek od strony ciała też widoczny (grubość = drugi, odwrócony płat lekko pod spodem)
  return colorize(g, color);
}

/** Panel (klapa, kieszeń) na przodzie tułowia jako siatka punktów powierzchni. */
function torsoPanel(x0: number, x1: number, y0: number, y1: number, off: number, color: ColorFn | number, nx = 8, ny = 6): THREE.BufferGeometry {
  const pts: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const p = torsoSurface(x0 + ((x1 - x0) * i) / nx, y0 + ((y1 - y0) * j) / ny, true, off);
      pts.push(p.x, p.y, p.z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + nx + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return colorize(g, color);
}

export class CharacterFactory implements AssetFactory {
  create(): THREE.Object3D {
    const parts: Part[] = [];
    const add = (geo: THREE.BufferGeometry, weights: WeightFn) => parts.push({ geo, weights });
    // lekki szum koloru (faktura tkaniny/skóry), stały dla danego miejsca
    const grain = (p: THREE.Vector3, amt: number) => 1 + (Math.sin(p.x * 91 + p.y * 57) * Math.sin(p.z * 73 - p.y * 41)) * amt;

    // ================= nogi i gumowce =================
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const lx = 0.1 * sx;
      const lw = legWeights(side);
      // nogawka ogrodniczek (od biodra do wnętrza cholewki)
      const leg: Section[] = [
        { y: 1.0, rx: 0.092, rz: 0.104, cx: lx * 0.85 },
        { y: 0.9, rx: 0.104, rz: 0.112, cx: lx * 0.95 },
        { y: 0.78, rx: 0.1, rz: 0.106, cx: lx },
        { y: 0.64, rx: 0.094, rz: 0.098, cx: lx },
        { y: 0.52, rx: 0.088, rz: 0.09, cx: lx, cz: 0.004 },
        { y: 0.46, rx: 0.086, rz: 0.09, cx: lx, cz: 0.008 },
        { y: 0.4, rx: 0.084, rz: 0.088, cx: lx, cz: 0.004 },
        { y: 0.32, rx: 0.08, rz: 0.082, cx: lx },
        { y: 0.26, rx: 0.076, rz: 0.078, cx: lx },
      ];
      add(
        colorize(tube(leg, 16, true, true), (p, n, out) => {
          out.set(COL.overall);
          // przetarte, ciemniejsze kolana (łaty z przodu)
          const knee = (1 - smoothstep(0.07, 0.13, Math.abs(p.y - 0.46))) * smoothstep(-0.2, 0.4, n.z);
          out.lerp(hex(COL.knee), knee * 0.85);
          // szew po zewnętrznej stronie
          if (Math.abs(n.x * sx - 1) < 0.08) out.multiplyScalar(0.88);
          out.multiplyScalar(grain(p, 0.035));
        }),
        lw,
      );
      // gumowiec: cholewka + stopa z noskiem, podeszwa
      const boot: Section[] = [
        { y: 0.37, rx: 0.09, rz: 0.092, cx: lx },
        { y: 0.36, rx: 0.092, rz: 0.094, cx: lx },
        { y: 0.3, rx: 0.086, rz: 0.088, cx: lx },
        { y: 0.2, rx: 0.08, rz: 0.086, cx: lx, cz: 0.004 },
        { y: 0.14, rx: 0.076, rz: 0.098, cx: lx, cz: 0.02 },
        { y: 0.09, rx: 0.074, rz: 0.132, cx: lx, cz: 0.045 },
        { y: 0.05, rx: 0.076, rz: 0.148, cx: lx, cz: 0.05 },
        { y: 0.03, rx: 0.08, rz: 0.154, cx: lx, cz: 0.05 },
        { y: 0.0, rx: 0.08, rz: 0.154, cx: lx, cz: 0.05 },
      ];
      add(
        colorize(tube(boot, 18, false, true), (p, _n, out) => {
          out.set(COL.boot);
          out.lerp(hex(COL.bootMud), (1 - smoothstep(0.03, 0.14, p.y)) * 0.6);
          if (p.y > 0.345) out.multiplyScalar(1.12);
          if (p.y < 0.032) out.set(COL.sole);
          out.multiplyScalar(grain(p, 0.04));
        }),
        lw,
      );
      // wnętrze cholewki (ciemny otwór, gdy noga zgięta)
      add(colorize(tube([{ y: 0.365, rx: 0.086, rz: 0.088, cx: lx }, { y: 0.3, rx: 0.08, rz: 0.082, cx: lx }], 14), COL.bootMud), lw);
    }

    // ================= biodra, pasek, saszetka =================
    add(
      colorize(
        tube(
          [
            { y: 1.06, rx: 0.162, rz: 0.12 },
            { y: 1.0, rx: 0.18, rz: 0.128 },
            { y: 0.92, rx: 0.19, rz: 0.13 },
            { y: 0.86, rx: 0.172, rz: 0.12 },
            { y: 0.83, rx: 0.12, rz: 0.1 },
          ],
          18,
          false,
          true,
        ),
        (p, _n, out) => out.set(COL.overall).multiplyScalar(grain(p, 0.035)),
      ),
      rigid(PIVOTS.hips),
    );
    // pasek
    add(
      colorize(tube([{ y: 1.075, rx: 0.172, rz: 0.13 }, { y: 1.03, rx: 0.182, rz: 0.136 }], 24, false, false), (p, _n, out) => {
        out.set(COL.belt).multiplyScalar(grain(p, 0.06));
      }),
      rigid(PIVOTS.hips),
    );
    add(colorize(box([0, 1.052, 0.137], [0.05, 0.042, 0.012]), COL.beltMetal), rigid(PIVOTS.hips));
    // saszetka na lewym biodrze (z klapą i paskiem)
    const pouchRot = new THREE.Euler(0, 0.7, 0);
    const pouchAt = (dx: number, dy: number, dz: number): [number, number, number] => {
      const v = new THREE.Vector3(dx, dy, dz).applyEuler(pouchRot);
      return [0.165 + v.x, 0.975 + v.y, 0.105 + v.z];
    };
    add(colorize(box(pouchAt(0, 0, 0), [0.14, 0.13, 0.07], pouchRot), (p, _n, out) => out.set(COL.pouch).multiplyScalar(grain(p, 0.08))), rigid(PIVOTS.hips));
    add(colorize(box(pouchAt(0, 0.038, 0.006), [0.144, 0.06, 0.075], pouchRot), COL.pouchDark), rigid(PIVOTS.hips));
    add(colorize(box(pouchAt(0, 0.012, 0.041), [0.024, 0.075, 0.01], pouchRot), COL.belt), rigid(PIVOTS.hips));
    add(colorize(box(pouchAt(0, -0.005, 0.047), [0.032, 0.022, 0.006], pouchRot), COL.beltMetal), rigid(PIVOTS.hips));

    // ================= tułów: koszulka + ogrodniczki =================
    add(
      colorize(tube(TORSO, 24, false, false), (p, n, out) => {
        const front = n.z > 0;
        // ogrodniczki: pas w talii dookoła, z tyłu wyżej (panel pod skrzyżowaniem szelek)
        const backPanel = !front && p.y < 1.19 && Math.abs(p.x) < 0.15;
        if (p.y < 1.1 || backPanel) out.set(COL.overall).multiplyScalar(grain(p, 0.035));
        else {
          out.set(COL.shirt);
          // fałdy koszulki
          out.lerp(hex(COL.shirtShade), (0.5 + 0.5 * Math.sin(p.y * 60 + p.x * 20)) * 0.35);
        }
      }),
      torsoWeights,
    );
    // klapa (śliniak) ogrodniczek z przodu, kieszeń
    add(torsoPanel(-0.12, 0.12, 1.08, 1.395, 0.006, (p, _n, out) => out.set(COL.overall).multiplyScalar(grain(p, 0.04))), torsoWeights);
    add(
      torsoPanel(-0.065, 0.065, 1.2, 1.31, 0.011, (p, _n, out) => {
        out.set(COL.overallDark);
        if (p.y > 1.29) out.multiplyScalar(0.8); // klapka kieszeni
      }),
      torsoWeights,
    );
    // szelki: z przodu pionowo od klapy przez barki, z tyłu skrzyżowane „X”
    for (const sx of [-1, 1]) {
      const front: Array<[number, number]> = [];
      for (let y = 1.37; y <= 1.5551; y += 0.0185) front.push([sx * (0.095 + (y - 1.37) * 0.08), y]);
      add(torsoStrip(front, 0.042, true, 0.012, COL.strap), torsoWeights);
      const back: Array<[number, number]> = [];
      for (let t = 0; t <= 1.0001; t += 0.1) back.push([sx * (0.11 - t * 0.19), 1.555 - t * 0.375]);
      add(torsoStrip(back, 0.042, false, 0.01 + (sx > 0 ? 0.004 : 0), COL.strap), torsoWeights);
      // sprzączki przy klapie
      const bp = torsoSurface(sx * 0.097, 1.385, true, 0.02);
      add(colorize(box([bp.x, bp.y, bp.z], [0.05, 0.03, 0.01]), COL.buckle), torsoWeights);
      const bp2 = torsoSurface(sx * 0.1, 1.43, true, 0.02);
      add(colorize(box([bp2.x, bp2.y, bp2.z], [0.046, 0.012, 0.008]), COL.strapDark), torsoWeights);
    }
    // breloczek-spławik na lewej szelce
    {
      const fp = torsoSurface(0.1, 1.335, true, 0.03);
      add(
        colorize(ellipsoid([fp.x, fp.y, fp.z], [0.012, 0.024, 0.012], 10, 8), (p, _n, out) => out.set(p.y > fp.y + 0.002 ? COL.floatRed : COL.floatWhite)),
        torsoWeights,
      );
      add(colorize(box([fp.x, fp.y + 0.035, fp.z - 0.002], [0.004, 0.03, 0.004]), COL.beltMetal), torsoWeights);
    }

    // ================= szyja i głowa =================
    add(
      colorize(
        tube(
          [
            { y: 1.56, rx: 0.072, rz: 0.068 },
            { y: 1.64, rx: 0.068, rz: 0.064, cz: 0.006 },
            { y: 1.72, rx: 0.062, rz: 0.058, cz: 0.01 },
          ],
          14,
        ),
        COL.skin,
      ),
      neckWeights,
    );
    const hc: [number, number, number] = [0, 1.79, 0.012];
    {
      // czaszka + twarz: kula z węższą żuchwą i wysuniętym podbródkiem
      let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 40, 30);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      g = mergeVertices(g);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let y = p.getY(i);
        let z = p.getZ(i);
        if (y < 0) {
          const t = -y;
          x *= 1 - 0.2 * t * t;
          z *= 1 - 0.1 * t;
          if (z > 0) z += 0.12 * t * z;
        }
        // płaski tył czaszki, lekko wysunięte kości policzkowe
        if (z < 0) z *= 0.95;
        x *= 1 + 0.04 * Math.max(0, z) * (1 - Math.abs(y));
        p.setXYZ(i, x * 0.102, y * 0.126, z * 0.115);
      }
      g.computeVertexNormals();
      g.translate(hc[0], hc[1], hc[2]);
      add(
        colorize(g, (q, n, out) => {
          out.set(COL.skin);
          const ly = q.y - hc[1];
          // zarost: żuchwa, broda i wąs (z przodu i po bokach poniżej kości policzkowych)
          const beard = smoothstep(-0.005, -0.03, ly) * smoothstep(-0.3, 0.3, n.z) * (1 - smoothstep(-0.11, -0.13, ly));
          const mustache = (1 - smoothstep(0.004, 0.012, Math.abs(ly + 0.042))) * smoothstep(0.6, 0.9, n.z) * (1 - smoothstep(0.02, 0.035, Math.abs(q.x)));
          out.lerp(hex(COL.stubble), Math.max(beard * 0.8, mustache * 0.9));
          // usta
          const lip = (1 - smoothstep(0.003, 0.009, Math.abs(ly + 0.058))) * smoothstep(0.85, 0.95, n.z) * (1 - smoothstep(0.018, 0.026, Math.abs(q.x)));
          out.lerp(hex(COL.lips), lip * 0.7);
          // cień pod łukami brwiowymi
          const socket = (1 - smoothstep(0.006, 0.02, Math.abs(ly - 0.012))) * (1 - smoothstep(0.02, 0.05, Math.abs(Math.abs(q.x) - 0.037))) * smoothstep(0.5, 0.8, n.z);
          out.lerp(hex(COL.skinShade), socket * 0.5);
        }),
        rigid(PIVOTS.head),
      );
    }
    // nos, uszy
    add(colorize(ellipsoid([0, hc[1] - 0.008, hc[2] + 0.11], [0.014, 0.022, 0.016], 10, 8, new THREE.Euler(-0.3, 0, 0)), COL.skin), rigid(PIVOTS.head));
    // usta: lekki uśmiech (dwa krótkie, uniesione na końcach odcinki)
    for (const sx of [-1, 1]) {
      add(colorize(ellipsoid([sx * 0.011, hc[1] - 0.056, hc[2] + 0.107], [0.013, 0.0035, 0.005], 8, 4, new THREE.Euler(0, sx * -0.35, sx * 0.25)), 0x7e4234), rigid(PIVOTS.head));
    }
    for (const sx of [-1, 1]) {
      add(colorize(ellipsoid([sx * 0.1, hc[1] - 0.005, hc[2] - 0.01], [0.014, 0.032, 0.022], 10, 8), COL.skinShade), rigid(PIVOTS.head));
      // oczy: białko + tęczówka, brwi
      add(colorize(ellipsoid([sx * 0.037, hc[1] + 0.012, hc[2] + 0.106], [0.014, 0.0095, 0.007], 10, 6), COL.eyeWhite), rigid(PIVOTS.head));
      add(colorize(ellipsoid([sx * 0.036, hc[1] + 0.011, hc[2] + 0.112], [0.0065, 0.0075, 0.0035], 8, 6), COL.iris), rigid(PIVOTS.head));
      add(colorize(box([sx * 0.04, hc[1] + 0.034, hc[2] + 0.104], [0.042, 0.011, 0.012], new THREE.Euler(0.2, -sx * 0.15, -sx * 0.07)), COL.brow), rigid(PIVOTS.head));
    }
    // włosy wystające spod czapki: boki, kark, kosmyki na czole
    const hair = (c: [number, number, number], r: [number, number, number], rot?: THREE.Euler) =>
      add(colorize(ellipsoid(c, r, 10, 8, rot), (p, _n, out) => out.set(COL.hair).multiplyScalar(grain(p, 0.12))), rigid(PIVOTS.head));
    for (const sx of [-1, 1]) {
      hair([sx * 0.092, hc[1] + 0.035, hc[2] - 0.02], [0.03, 0.035, 0.06], new THREE.Euler(0, 0, sx * 0.3));
      hair([sx * 0.07, hc[1] + 0.02, hc[2] - 0.075], [0.04, 0.04, 0.04]);
      hair([sx * 0.1, hc[1] + 0.02, hc[2] + 0.03], [0.012, 0.03, 0.02], new THREE.Euler(0.3, 0, sx * 0.2));
    }
    hair([0, hc[1] + 0.005, hc[2] - 0.09], [0.07, 0.05, 0.04]);
    hair([-0.03, hc[1] + 0.068, hc[2] + 0.092], [0.035, 0.014, 0.02], new THREE.Euler(0.4, 0.2, -0.4));
    hair([0.02, hc[1] + 0.072, hc[2] + 0.095], [0.03, 0.012, 0.016], new THREE.Euler(0.4, -0.3, 0.5));
    // czapka: kopuła z prążkami i wywiniętym mankietem, lekko zsunięta do tyłu
    {
      const tilt = new THREE.Matrix4().makeRotationX(-0.2);
      const pivotY = hc[1] + 0.05;
      const place = (g: THREE.BufferGeometry) => {
        g.translate(0, -pivotY, 0);
        g.applyMatrix4(tilt);
        g.translate(0, pivotY, hc[2] - 0.004);
        g.computeVertexNormals();
        return g;
      };
      const dome: Section[] = [];
      const top = hc[1] + 0.175;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = t * Math.PI * 0.5;
        dome.push({ y: hc[1] + 0.05 + Math.sin(a) * 0.125, rx: 0.116 * Math.cos(a) + 0.001, rz: 0.124 * Math.cos(a) + 0.001 });
      }
      dome.unshift({ y: hc[1] + 0.03, rx: 0.114, rz: 0.122 });
      dome.push({ y: top, rx: 0.001, rz: 0.001 });
      const ribs = 40;
      add(
        colorize(place(tube(dome, ribs)), (p, _n, out) => {
          const a = Math.atan2(p.x, p.z - hc[2]);
          const rib = 0.5 + 0.5 * Math.cos(a * ribs);
          out.set(COL.beanie).lerp(hex(COL.beanieDark), rib * 0.35);
        }),
        rigid(PIVOTS.head),
      );
      add(
        colorize(
          place(
            tube(
              [
                { y: hc[1] + 0.1, rx: 0.12, rz: 0.128 },
                { y: hc[1] + 0.098, rx: 0.126, rz: 0.134 },
                { y: hc[1] + 0.03, rx: 0.126, rz: 0.134 },
                { y: hc[1] + 0.022, rx: 0.114, rz: 0.122 },
              ],
              ribs,
            ),
          ),
          (p, _n, out) => {
            const a = Math.atan2(p.x, p.z - hc[2]);
            const rib = 0.5 + 0.5 * Math.cos(a * ribs);
            out.set(COL.beanie).multiplyScalar(1.05).lerp(hex(COL.beanieDark), rib * 0.45);
          },
        ),
        rigid(PIVOTS.head),
      );
    }

    // ================= ręce =================
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const ax = 0.245 * sx;
      const aw = armWeights(side);
      const arm: Section[] = [
        { y: 1.535, rx: 0.035, rz: 0.035, cx: ax - sx * 0.02 },
        { y: 1.515, rx: 0.068, rz: 0.064, cx: ax - sx * 0.01 },
        { y: 1.47, rx: 0.08, rz: 0.075, cx: ax },
        { y: 1.42, rx: 0.076, rz: 0.072, cx: ax + sx * 0.004 },
        { y: 1.33, rx: 0.066, rz: 0.068, cx: ax + sx * 0.004, cz: 0.006 },
        { y: 1.25, rx: 0.058, rz: 0.06, cx: ax, cz: 0.004 },
        { y: 1.18, rx: 0.05, rz: 0.052, cx: ax },
        { y: 1.1, rx: 0.058, rz: 0.058, cx: ax, cz: 0.006 },
        { y: 1.01, rx: 0.048, rz: 0.05, cx: ax, cz: 0.004 },
        { y: 0.93, rx: 0.037, rz: 0.04, cx: ax },
        { y: 0.9, rx: 0.035, rz: 0.038, cx: ax },
      ];
      add(colorize(tube(arm, 16), (p, _n, out) => out.set(COL.skin).multiplyScalar(grain(p, 0.02))), aw);
      // rękaw T-shirtu (podwinięty mankiet)
      add(
        colorize(
          tube(
            [
              { y: 1.55, rx: 0.05, rz: 0.05, cx: ax - sx * 0.04 },
              { y: 1.53, rx: 0.078, rz: 0.076, cx: ax - sx * 0.018 },
              { y: 1.48, rx: 0.09, rz: 0.086, cx: ax - sx * 0.004 },
              { y: 1.4, rx: 0.087, rz: 0.083, cx: ax + sx * 0.005 },
              { y: 1.36, rx: 0.087, rz: 0.083, cx: ax + sx * 0.006 },
              { y: 1.335, rx: 0.083, rz: 0.08, cx: ax + sx * 0.006 },
              { y: 1.33, rx: 0.07, rz: 0.07, cx: ax + sx * 0.006 },
            ],
            18,
            true,
          ),
          (p, _n, out) => {
            out.set(COL.shirt);
            if (p.y < 1.365) out.multiplyScalar(0.94);
            out.lerp(hex(COL.shirtShade), (0.5 + 0.5 * Math.sin(p.y * 70 + p.z * 30)) * 0.3);
          },
        ),
        aw,
      );
      // dłoń: śródręcze, zwinięte palce, kciuk (dłoń zaciśnięta – trzyma wędkę)
      const hand = side === 'L' ? PIVOTS.handL : PIVOTS.handR;
      add(colorize(ellipsoid([ax, 0.855, 0.004], [0.026, 0.05, 0.042], 12, 8), COL.skin), rigid(hand));
      add(colorize(ellipsoid([ax - sx * 0.004, 0.815, 0.012], [0.028, 0.032, 0.044], 12, 8), COL.skin), rigid(hand));
      add(colorize(ellipsoid([ax - sx * 0.012, 0.845, 0.04], [0.016, 0.034, 0.016], 8, 6, new THREE.Euler(0.35, 0, -sx * 0.3)), COL.skinShade), rigid(hand));
      // zegarek na lewym nadgarstku
      if (side === 'L') {
        add(colorize(tube([{ y: 0.96, rx: 0.039, rz: 0.042, cx: ax }, { y: 0.94, rx: 0.039, rz: 0.042, cx: ax }], 14, true, true), COL.watch), aw);
        add(colorize(box([ax + 0.036, 0.95, 0.0], [0.012, 0.03, 0.03]), 0x3a3c40), aw);
      }
    }

    return this.assemble(parts);
  }

  /** Scalanie części w jedną siatkę ze szkieletem. */
  private assemble(parts: Part[]): THREE.Object3D {
    const geos: THREE.BufferGeometry[] = [];
    for (const part of parts) {
      const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
      const pos = g.attributes.position;
      const si = new Uint16Array(pos.count * 4);
      const sw = new Float32Array(pos.count * 4);
      for (let i = 0; i < pos.count; i++) {
        tmpP.fromBufferAttribute(pos, i);
        const w = part.weights(tmpP).filter(([, v]) => v > 1e-3);
        let sum = 0;
        for (const [, v] of w) sum += v;
        for (let k = 0; k < Math.min(4, w.length); k++) {
          si[i * 4 + k] = w[k][0];
          sw[i * 4 + k] = w[k][1] / sum;
        }
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      for (const name of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
      }
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    if (!geo) throw new Error('[CharacterFactory] Nie udało się scalić geometrii postaci');
    geo.computeBoundingSphere();

    const root = new THREE.Group();
    root.name = 'character';
    const bones: THREE.Bone[] = [];
    const byName = new Map<string, THREE.Bone>();
    for (const b of BONES) {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.set(...b.pos);
      (b.parent ? byName.get(b.parent)! : root).add(bone);
      byName.set(b.name, bone);
      bones.push(bone);
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = 'character_body';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return root;
  }
}
