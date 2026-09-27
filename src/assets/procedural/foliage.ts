import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetFactory } from '../AssetRegistry';
import { Rng } from '../../core/Rng';
import { clamp01, lerp, smoothstep } from '../../core/math';
import { tex } from '../../render/textures';
import { axisNormals, C, spherify } from './geo';
import { group } from '../materials';

/**
 * Drzewa i rośliny z „kart” z teksturą (atlas public/textures/foliage.webp, kanał alfa): gęste, pierzaste
 * gałęzie świerka, pęki igieł sosny, liście brzozy i krzaków, płaczące pędy wierzby, liście paproci
 * (wg arkuszy 09-drzewa i 10-roslinnosc). Pnie i rdzenie koron używają białego, nieprzezroczystego pola
 * atlasu – kolor dają wierzchołki. Jedna siatka i jeden materiał na gatunek → jeden InstancedMesh.
 */

/** Obszary atlasu (u0, u1, v0, v1); v = 1 u góry obrazu. */
const ATLAS = {
  spruce: [0.006, 0.994, 0.5, 1.0],
  pine: [0.0, 0.25, 0.0, 0.5],
  leaves: [0.25, 0.5, 0.0, 0.5],
  willow: [0.5, 0.75, 0.0, 0.5],
  fern: [0.75, 1.0, 0.0, 0.5],
} as const;
type Region = readonly [number, number, number, number];
/** Białe, nieprzezroczyste pole (prawy dolny róg atlasu). */
const WHITE_UV: [number, number] = [0.977, 0.047];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmpC = new THREE.Color();

function foliageMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map: tex('foliage'),
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.42,
  });
  m.name = 'foliage';
  return m;
}

/** Siatka z listy wierzchołków (pozycja, uv, kolor) i trójkątów. */
class Builder {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: THREE.Vector3, u: number, v: number, c: THREE.Color): number {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Geometria bez UV/koloru → z białym polem atlasu i kolorem z funkcji. */
function opaque(g: THREE.BufferGeometry, color: (p: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  const pos = o.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const col = new Float32Array(pos.count * 3);
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = WHITE_UV[0];
    uv[i * 2 + 1] = WHITE_UV[1];
    p.fromBufferAttribute(pos, i);
    tmpC.setRGB(1, 1, 1);
    color(p, tmpC);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  o.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('[foliage] Nie udało się scalić geometrii');
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

function meshOf(name: string, geo: THREE.BufferGeometry, cast = true): THREE.Object3D {
  const g = group(name);
  const m = new THREE.Mesh(geo, foliageMaterial());
  m.name = `${name}_mesh`;
  m.castShadow = cast;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/**
 * Gałąź-karta: pas od pnia na zewnątrz, opadający, z grzbietem (przekrój „V” odwrócone – bryła z boku).
 * Tekstura: długość wzdłuż u, szerokość wzdłuż v.
 */
function branchCard(
  b: Builder,
  base: THREE.Vector3,
  ang: number,
  len: number,
  width: number,
  droop: number,
  segs: number,
  region: Region,
  shade: (t: number, out: THREE.Color) => void,
): void {
  const dir = V(Math.cos(ang), 0, Math.sin(ang));
  const side = V(-Math.sin(ang), 0, Math.cos(ang));
  const [u0, u1, v0, v1] = region;
  const vm = (v0 + v1) / 2;
  let prev: number[] | null = null;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = base.clone().addScaledVector(dir, len * t);
    c.y += 0.05 - droop * Math.pow(t, 1.6);
    const w = width * 0.5 * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)));
    shade(t, tmpC);
    const u = lerp(u0, u1, t);
    const l = b.vert(c.clone().addScaledVector(side, w).setY(c.y - w * 0.28), u, v1, tmpC);
    const m = b.vert(c.clone().setY(c.y + w * 0.12), u, vm, tmpC);
    const r = b.vert(c.clone().addScaledVector(side, -w).setY(c.y - w * 0.28), u, v0, tmpC);
    if (prev) {
      b.quad(prev[0], prev[1], m, l);
      b.quad(prev[1], prev[2], r, m);
    }
    prev = [l, m, r];
  }
}

/** Płaska karta (kwadrat) w płaszczyźnie wyznaczonej przez osie ax, ay. */
function flatCard(b: Builder, c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, sx: number, sy: number, region: Region, col: THREE.Color): void {
  const [u0, u1, v0, v1] = region;
  const p = (x: number, y: number) => c.clone().addScaledVector(ax, x * sx).addScaledVector(ay, y * sy);
  const a = b.vert(p(-1, -1), u0, v0, col);
  const d = b.vert(p(1, -1), u1, v0, col);
  const e = b.vert(p(1, 1), u1, v1, col);
  const f = b.vert(p(-1, 1), u0, v1, col);
  b.quad(a, d, e, f);
}

/** „Kępa” z kart: pozioma + kilka skośnych wokół (pęk igieł, liście). */
function puff(b: Builder, c: THREE.Vector3, r: number, rng: Rng, region: Region, dark: THREE.Color, light: THREE.Color, tilt = 0.9, n = 4, flatten = 1): void {
  const col = new THREE.Color();
  const rot = rng.range(0, Math.PI * 2);
  col.copy(dark).lerp(light, 0.85);
  flatCard(b, c.clone().setY(c.y + r * 0.12 * flatten), V(Math.cos(rot), 0, Math.sin(rot)), V(-Math.sin(rot), 0, Math.cos(rot)), r, r, region, col);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const out = V(Math.cos(a), 0, Math.sin(a));
    const tangent = V(-Math.sin(a), 0, Math.cos(a));
    // oś „w górę” karty: pochylona od poziomu o `tilt`
    const up = out.clone().multiplyScalar(Math.cos(tilt)).setY(Math.sin(tilt) * flatten).normalize();
    col.copy(dark).lerp(light, 0.35 + 0.4 * rng.next());
    flatCard(b, c.clone().addScaledVector(out, r * 0.45).setY(c.y - r * 0.1 * flatten), tangent, up, r * 0.78, r * 0.72, region, col);
  }
}

/** Normalne kart „od środka” najbliższej kępy (miękkie, malarskie cieniowanie koron). */
function puffNormals(g: THREE.BufferGeometry, centers: Array<[THREE.Vector3, number]>, flatten = 1, up = 0.25): void {
  const pos = g.attributes.position;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const p = V();
  const d = V();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let best = centers[0][0];
    let bd = Infinity;
    for (const [c, r] of centers) {
      const q = p.distanceToSquared(c) / (r * r);
      if (q < bd) {
        bd = q;
        best = c;
      }
    }
    d.copy(p).sub(best);
    d.y /= flatten;
    d.normalize();
    d.y += up;
    d.normalize();
    nor.setXYZ(i, d.x, d.y, d.z);
  }
  nor.needsUpdate = true;
}

/** Normalne skierowane w górę (karty paproci – obie strony jasne). */
function upNormals(g: THREE.BufferGeometry, mix: number): void {
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const n = V();
  for (let i = 0; i < nor.count; i++) {
    n.fromBufferAttribute(nor, i);
    if (n.y < 0) n.negate();
    n.lerp(V(0, 1, 0), mix).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

function trunkGeo(h: number, r0: number, r1: number, seg: number, bark: number, barkTop: number, flare = 1.6): THREE.BufferGeometry {
  const t = new THREE.CylinderGeometry(r1, r0, h, seg, 3, true);
  t.translate(0, h / 2, 0);
  const pos = t.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + (flare - 1) * (1 - smoothstep(0, h * 0.12, y));
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  t.computeVertexNormals();
  return opaque(t, (p, out) => out.copy(C(bark)).lerp(C(barkTop), clamp01(p.y / h)));
}

function limbGeo(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return opaque(g, (_p, out) => out.set(col));
}

/** Ciemny rdzeń korony (zasłania prześwity między kartami). */
function core(c: THREE.Vector3, r: THREE.Vector3, col: number, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(r.x, r.y, r.z);
  g.translate(c.x, c.y, c.z);
  g.deleteAttribute('uv');
  const o = opaque(g, (_p, out) => out.set(col));
  spherify(o, c, r.x / r.y, 0.8);
  return o;
}

// ---------------------------------------------------------------------------
// świerk (bliski / średni) – arkusz 09: stożek, gęste opadające gałęzie, jasne końcówki
// ---------------------------------------------------------------------------
type SpruceLod = 'near' | 'mid';

function spruceCardGeometry(seed: number, lod: SpruceLod): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const H = 13;
  const Rmax = 3.3;
  const parts: THREE.BufferGeometry[] = [trunkGeo(H * 0.97, 0.3, 0.04, lod === 'near' ? 8 : 5, 0x4a3121, 0x6a4a30, 1.7)];
  // rdzeń: ciemny stożek wewnątrz korony
  const cone = new THREE.ConeGeometry(Rmax * 0.62, H * 0.88, lod === 'near' ? 8 : 6, 1, true);
  cone.translate(0, H * 0.12 + H * 0.44, 0);
  parts.push(opaque(cone, (p, out) => out.set(0x16281a).multiplyScalar(0.8 + 0.4 * clamp01((p.y - H * 0.1) / H))));
  const b = new Builder();
  const whorls = lod === 'near' ? 15 : 9;
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1);
    // piętra gęstnieją ku wierzchołkowi (bez „talerzy na patyku” pod słońce)
    const y = lerp(H * 0.1, H * 0.94, Math.pow(t, 0.82));
    const R = Rmax * Math.pow(1 - t * 0.96, 0.9) + 0.4;
    const k = lod === 'near' ? (t > 0.5 ? 4 : 5) : t > 0.6 ? 3 : 5;
    const shade = lerp(0.72, 1.08, t);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2 + i * 0.93 + rng.range(-0.25, 0.25);
      const len = R * rng.range(0.88, 1.08);
      const tint = rng.range(0.9, 1.1);
      branchCard(
        b,
        V(0, y + rng.range(-0.15, 0.15), 0),
        a,
        len,
        len * lerp(0.62, 0.8, t),
        len * lerp(0.42, 0.18, t),
        lod === 'near' ? 2 : 1,
        ATLAS.spruce,
        (u, out) => out.setScalar(shade * tint * lerp(0.62, 1.12, smoothstep(0.1, 1, u))),
      );
    }
  }
  // wierzchołek: dwie skrzyżowane pionowe karty
  for (let j = 0; j < 2; j++) {
    const a = j * Math.PI * 0.5;
    const top = V(0, H * 0.9, 0);
    const [u0, u1, v0, v1] = ATLAS.spruce;
    const side = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.45);
    const col = C(0xffffff).multiplyScalar(1.1);
    const p0 = b.vert(top.clone().add(side), u0, v1, col);
    const p1 = b.vert(top.clone().sub(side), u0, v0, col);
    const p2 = b.vert(V(0, H * 1.05, 0).sub(side.clone().multiplyScalar(0.3)), u1, v0, col);
    const p3 = b.vert(V(0, H * 1.05, 0).add(side.clone().multiplyScalar(0.3)), u1, v1, col);
    b.quad(p0, p1, p2, p3);
  }
  parts.push(b.geometry());
  const geo = mergeAll(parts);
  axisNormals(geo, 0.5, 0.8);
  return geo;
}

export class SpruceCardFactory implements AssetFactory {
  constructor(private lod: SpruceLod, private seed = 11) {}
  create(): THREE.Object3D {
    return meshOf(`spruce_${this.lod}`, spruceCardGeometry(this.seed, this.lod));
  }
}

// ---------------------------------------------------------------------------
// sosna – wysoki rudy pień, płaskie pęki igieł na końcach konarów
// ---------------------------------------------------------------------------
export class PineCardFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(71);
    const H = 16;
    const parts: THREE.BufferGeometry[] = [trunkGeo(H * 0.92, 0.32, 0.12, 7, 0x6a3f22, 0xc2703a, 1.5)];
    const b = new Builder();
    const dark = C(0x6a7a5a);
    const light = C(0xe8f0d0);
    const n = 7;
    const pads: Array<[THREE.Vector3, number]> = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = lerp(H * 0.6, H * 0.96, t);
      const a = i * 2.4 + rng.range(-0.3, 0.3);
      const out = lerp(3.4, 1.3, t) * rng.range(0.85, 1.1);
      const end = V(Math.cos(a) * out, y + 0.8, Math.sin(a) * out);
      parts.push(limbGeo(V(0, y - 0.6, 0), end, 0.13, 0.05, 0x8a5030));
      const r = lerp(1.9, 1.3, t) * rng.range(0.85, 1.1);
      pads.push([end.clone().setY(end.y + 0.2), r]);
      pads.push([end.clone().add(V(Math.cos(a + 1.3) * r * 0.7, 0.05, Math.sin(a + 1.3) * r * 0.7)), r * 0.72]);
    }
    pads.push([V(0, H + 0.4, 0), 1.5]);
    for (const [c, r] of pads) {
      parts.push(core(c.clone().setY(c.y - r * 0.08), V(r * 0.62, r * 0.22, r * 0.62), 0x243a1c));
      puff(b, c, r, rng, ATLAS.pine, dark, light, 0.55, 5, 0.6);
    }
    const cards = b.geometry();
    puffNormals(cards, pads, 0.5, 0.3);
    parts.push(cards);
    const geo = mergeAll(parts);
    return meshOf('pine', geo);
  }
}

// ---------------------------------------------------------------------------
// brzoza – biała kora, lekka ażurowa korona z pęków liści
// ---------------------------------------------------------------------------
export class BirchCardFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(33);
    const H = 11;
    const t = new THREE.CylinderGeometry(0.08, 0.2, H, 7, 12, true);
    t.translate(0, H / 2, 0);
    const parts: THREE.BufferGeometry[] = [
      opaque(t, (p, out) => {
        const band = Math.sin(p.y * 7.3 + Math.sin(p.x * 30) * 1.5) * Math.sin(p.y * 2.1 + p.z * 20);
        out.set(0xe8e2d4).lerp(C(0x2a2622), band > 0.72 ? 0.85 : 0);
        if (p.y < 0.6) out.lerp(C(0x3a3028), 1 - p.y / 0.6);
      }),
    ];
    const b = new Builder();
    const dark = C(0x8a9a70);
    const light = C(0xf4ffe0);
    const clumps: Array<[THREE.Vector3, number]> = [];
    for (let i = 0; i < 13; i++) {
      const tt = i / 12;
      const y = lerp(H * 0.4, H * 1.02, tt);
      const a = i * 2.2 + rng.range(-0.4, 0.4);
      const out = lerp(1.7, 0.5, tt) * rng.range(0.8, 1.2);
      const c = V(Math.cos(a) * out, y, Math.sin(a) * out);
      if (tt < 0.85) parts.push(limbGeo(V(0, y - 0.8, 0), c, 0.05, 0.02, 0x5a4a3a));
      const r = lerp(1.35, 0.85, tt) * rng.range(0.85, 1.15);
      parts.push(core(c, V(r * 0.5, r * 0.4, r * 0.5), 0x3f5a22));
      puff(b, c, r, rng, ATLAS.leaves, dark, light, 1.0, 5, 1);
      clumps.push([c, r]);
    }
    const cards = b.geometry();
    puffNormals(cards, clumps, 0.8, 0.25);
    parts.push(cards);
    return meshOf('birch', mergeAll(parts));
  }
}

// ---------------------------------------------------------------------------
// wierzba płacząca – gruby pień, kopuła i zwisające kurtyny pędów
// ---------------------------------------------------------------------------
export class WillowCardFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(52);
    const parts: THREE.BufferGeometry[] = [trunkGeo(3.2, 0.55, 0.38, 9, 0x4a3220, 0x6a4a2e, 1.5)];
    const b = new Builder();
    const dark = C(0x9aa070);
    const light = C(0xfaffd8);
    const crown: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const tip = V(Math.cos(a) * 2.6, 6.2 + rng.range(-0.4, 0.6), Math.sin(a) * 2.6);
      parts.push(limbGeo(V(0, 2.9, 0), tip, 0.3, 0.12, 0x5a3e26));
      crown.push(tip);
    }
    crown.push(V(0, 7.2, 0));
    for (const c of crown) {
      parts.push(core(c, V(1.7, 1.1, 1.7), 0x56692a, 1));
      puff(b, c, 2.2, rng, ATLAS.leaves, dark, light, 1.0, 5, 0.7);
    }
    // zwisające pędy: pionowe, lekko wygięte na zewnątrz karty
    const [u0, u1, v0, v1] = ATLAS.willow;
    const n = 44;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const r = rng.range(2.6, 4.1);
      const top = rng.range(5.8, 7.4);
      const len = rng.range(3.6, 5.6);
      const w = rng.range(0.7, 1.1);
      const side = V(-Math.sin(a), 0, Math.cos(a));
      let prev: [number, number] | null = null;
      for (let s = 0; s <= 2; s++) {
        const t = s / 2;
        const rr = r + 0.5 * Math.sin(t * Math.PI * 0.7);
        const c = V(Math.cos(a) * rr, top - len * t, Math.sin(a) * rr);
        tmpC.setScalar(lerp(1.08, 0.82, t) * rng.range(0.92, 1.05));
        const v = lerp(v1, v0, t);
        const l = b.vert(c.clone().addScaledVector(side, w / 2), u0, v, tmpC);
        const rgt = b.vert(c.clone().addScaledVector(side, -w / 2), u1, v, tmpC);
        if (prev) b.quad(prev[0], prev[1], rgt, l);
        prev = [l, rgt];
      }
    }
    parts.push(b.geometry());
    const geo = mergeAll(parts);
    axisNormals(geo, 0.4, 0.85);
    return meshOf('willow', geo);
  }
}

// ---------------------------------------------------------------------------
// krzak, paproć
// ---------------------------------------------------------------------------
export class BushCardFactory implements AssetFactory {
  constructor(private seed = 5) {}
  create(): THREE.Object3D {
    const rng = new Rng(this.seed);
    const parts: THREE.BufferGeometry[] = [];
    const b = new Builder();
    const dark = C(0x6a7a58);
    const light = C(0xd8e8b8);
    const centers: Array<[THREE.Vector3, number]> = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 * 2.3 + rng.range(-0.3, 0.3);
      const r = i === 0 ? 0 : rng.range(0.3, 0.6);
      const c = V(Math.cos(a) * r, rng.range(0.45, 0.8) + (i === 0 ? 0.3 : 0), Math.sin(a) * r);
      const s = rng.range(0.45, 0.62);
      parts.push(core(c, V(s * 0.6, s * 0.5, s * 0.6), 0x2a4a1c));
      puff(b, c, s, rng, ATLAS.leaves, dark, light, 1.0, 3, 1);
      centers.push([c, s]);
    }
    const cards = b.geometry();
    puffNormals(cards, centers, 0.9, 0.3);
    parts.push(cards);
    return meshOf('bush', mergeAll(parts));
  }
}

export class FernCardFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(19);
    const b = new Builder();
    const [u0, u1, v0, v1] = ATLAS.fern;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const len = rng.range(0.75, 1.1);
      const lift = rng.range(0.5, 0.8);
      const w = len * 0.42;
      const dir = V(Math.cos(a), 0, Math.sin(a));
      const side = V(-Math.sin(a), 0, Math.cos(a));
      let prev: [number, number] | null = null;
      const segs = 3;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const c = dir.clone().multiplyScalar(len * t).setY(lift * Math.sin(Math.PI * 0.85 * t) * (1 - 0.35 * t) + 0.02);
        tmpC.setScalar(lerp(0.7, 1.08, t) * rng.range(0.92, 1.05));
        const v = lerp(v0, v1, t);
        const l = b.vert(c.clone().addScaledVector(side, w / 2).setY(c.y - w * 0.12), u0, v, tmpC);
        const r = b.vert(c.clone().addScaledVector(side, -w / 2).setY(c.y - w * 0.12), u1, v, tmpC);
        if (prev) b.quad(prev[0], prev[1], r, l);
        prev = [l, r];
      }
    }
    const geo = b.geometry();
    upNormals(geo, 0.6);
    return meshOf('fern', geo, false);
  }
}
