/**
 * Przyroda wg arkuszy reference/02-postacie-i-obiekty/09-drzewa i 10-roslinnosc-kamienie:
 * świerki (warstwowe, opadające gałęzie, żółtozielone końcówki), sosna, brzoza, wierzba płacząca,
 * krzaki, paprocie, trzciny z kiściami, pałki, grążele, kamienie z mchem, zwalony pień, pniak.
 * Każdy model = JEDNA siatka z kolorami wierzchołków (do InstancedMesh). Podstawa w (0,0,0), oś +Y.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { clamp01, lerp, smoothstep } from '../../core/math';
import type { AssetFactory } from '../AssetRegistry';
import { group } from '../materials';
import { axisNormals, C, flat, jitter, loft, merge, paint, solid, spherify } from './geo';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Materiał roślinności: kolory wierzchołków, obustronny, bez odwracania normalnych tylnych ścian. */
export function vegetationBaseMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
}

function meshOf(name: string, geo: THREE.BufferGeometry, cast = true): THREE.Object3D {
  const g = group(name);
  const m = new THREE.Mesh(geo, vegetationBaseMaterial());
  m.name = `${name}_mesh`;
  m.castShadow = cast;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

// ---------------------------------------------------------------------------
// pnie
// ---------------------------------------------------------------------------
function trunk(h: number, r0: number, r1: number, seg: number, bark: THREE.Color, barkTop: THREE.Color, flare = 1.6): THREE.BufferGeometry {
  const t = new THREE.CylinderGeometry(r1, r0, h, seg, 3, true);
  t.translate(0, h / 2, 0);
  // rozszerzenie u nasady (korzenie)
  const pos = t.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + (flare - 1) * (1 - smoothstep(0, h * 0.12, y));
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  t.computeVertexNormals();
  return paint(flat(t), (p, _n, out) => out.copy(bark).lerp(barkTop, clamp01(p.y / h)));
}

// ---------------------------------------------------------------------------
// świerk
// ---------------------------------------------------------------------------
export type SpruceLod = 'near' | 'mid';

/** Gałąź-„frond”: opadający, pofalowany pas z grzbietem, szeroki w środku, zwężony na końcu. */
function frond(
  y: number,
  ang: number,
  len: number,
  width: number,
  droop: number,
  segs: number,
  ridge: boolean,
  inner: THREE.Color,
  mid: THREE.Color,
  tip: THREE.Color,
  shade: number,
): THREE.BufferGeometry {
  const dir = V(Math.cos(ang), 0, Math.sin(ang));
  const side = V(-Math.sin(ang), 0, Math.cos(ang));
  const sections: THREE.Vector3[][] = [];
  const r0 = 0.12;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const r = r0 + (len - r0) * t;
    const yy = y + 0.12 - droop * Math.pow(t, 1.5) + droop * 0.28 * Math.pow(t, 4);
    const c = dir.clone().multiplyScalar(r).setY(yy);
    const w = width * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * t)), 0.7) * (t === 1 ? 0.15 : 1);
    const l = c.clone().addScaledVector(side, w / 2).setY(yy - w * 0.22);
    const rr = c.clone().addScaledVector(side, -w / 2).setY(yy - w * 0.22);
    if (ridge) sections.push([l, c.clone().setY(yy + w * 0.12), rr]);
    else sections.push([l, rr]);
  }
  const g = loft(sections);
  // kolory: od ciemnego wnętrza do jasnych, żółtozielonych końcówek; brzegi ciemniejsze od grzbietu
  const L = len;
  return paint(g, (p, _n, out) => {
    const rr = Math.hypot(p.x, p.z) / L;
    out.copy(inner).lerp(mid, smoothstep(0.15, 0.6, rr)).lerp(tip, smoothstep(0.6, 1.0, rr));
    const edge = Math.abs((p.x - dir.x * rr * L) * side.x + (p.z - dir.z * rr * L) * side.z) / Math.max(width * 0.5, 1e-3);
    out.multiplyScalar(shade * (1 - 0.18 * clamp01(edge)));
  });
}

export function spruceGeometry(seed: number, lod: SpruceLod): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const H = 13;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(trunk(H * 0.97, 0.3, 0.04, lod === 'near' ? 8 : 5, C(0x4a3121), C(0x6a4a30), 1.7));
  const inner = C(0x1f3a1c);
  const mid = C(0x3b5f27);
  const tip = C(0x93a33b);
  const whorls = lod === 'near' ? 11 : 8;
  const Rmax = 3.2;
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1);
    const y = lerp(H * 0.13, H * 0.94, Math.pow(t, 0.95));
    const R = Rmax * Math.pow(1 - t * 0.97, 0.95) + 0.3;
    const shade = lerp(0.8, 1.12, t);
    if (lod === 'near') {
      const k = t > 0.75 ? 4 : t > 0.45 ? 5 : 6;
      for (let b = 0; b < k; b++) {
        const a = (b / k) * Math.PI * 2 + i * 0.73 + rng.range(-0.2, 0.2);
        const len = R * rng.range(0.85, 1.08);
        parts.push(frond(y + rng.range(-0.12, 0.12), a, len, len * rng.range(0.7, 0.9), len * 0.42, 2, true, inner, mid, tip, shade * rng.range(0.92, 1.06)));
      }
    } else {
      // „spódnica” z ząbkowanym, opadającym brzegiem
      const k = 9;
      const pts: number[] = [];
      const top = V(0, y + 0.55, 0);
      for (let b = 0; b < k * 2; b++) {
        const a0 = (b / (k * 2)) * Math.PI * 2 + i * 0.5;
        const a1 = ((b + 1) / (k * 2)) * Math.PI * 2 + i * 0.5;
        const r0 = b % 2 === 0 ? R : R * 0.72;
        const r1 = b % 2 === 0 ? R * 0.72 : R;
        const d0 = b % 2 === 0 ? R * 0.42 : R * 0.25;
        const d1 = b % 2 === 0 ? R * 0.25 : R * 0.42;
        pts.push(top.x, top.y, top.z, Math.cos(a1) * r1, y - d1, Math.sin(a1) * r1, Math.cos(a0) * r0, y - d0, Math.sin(a0) * r0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      parts.push(
        paint(g, (p, _n, out) => {
          const rr = Math.hypot(p.x, p.z) / R;
          out.copy(inner).lerp(mid, smoothstep(0.1, 0.55, rr)).lerp(tip, smoothstep(0.7, 1.0, rr) * 0.8).multiplyScalar(shade);
        }),
      );
    }
  }
  // szpic
  const spike = new THREE.ConeGeometry(0.22, 1.4, 5);
  spike.translate(0, H * 0.97 + 0.5, 0);
  parts.push(solid(flat(spike), C(0x6f8a2e)));
  const geo = merge(parts);
  axisNormals(geo, 0.45, 0.85);
  return geo;
}

export class SpruceFactory implements AssetFactory {
  constructor(private lod: SpruceLod, private seed = 11) {}
  create(): THREE.Object3D {
    return meshOf(`spruce_${this.lod}`, spruceGeometry(this.seed, this.lod));
  }
}

/** Daleki las: prosty stożek z ząbkami (bardzo tani, bez cieni). */
export class FarTreeFactory implements AssetFactory {
  create(): THREE.Object3D {
    const parts: THREE.BufferGeometry[] = [];
    const c1 = new THREE.ConeGeometry(2.6, 7.5, 6, 1, true);
    c1.translate(0, 5.2, 0);
    const c2 = new THREE.ConeGeometry(1.8, 6, 6, 1, true);
    c2.translate(0, 9.5, 0);
    for (const c of [c1, c2]) parts.push(paint(flat(c), (p, _n, out) => out.copy(C(0x223a1e)).lerp(C(0x4a6428), clamp01((p.y - 2) / 12))));
    const t = new THREE.CylinderGeometry(0.15, 0.25, 2, 4, 1, true);
    t.translate(0, 1, 0);
    parts.push(solid(flat(t), C(0x3a2a1c)));
    const geo = merge(parts);
    axisNormals(geo, 0.5, 1);
    return meshOf('farTree', geo, false);
  }
}

// ---------------------------------------------------------------------------
// sosna, brzoza, wierzba
// ---------------------------------------------------------------------------
function clump(center: THREE.Vector3, r: number, rng: Rng, dark: THREE.Color, light: THREE.Color, flatten = 0.65, detail = 1): THREE.BufferGeometry {
  const g = flat(new THREE.IcosahedronGeometry(r, detail));
  jitter(g, rng, r * 0.18, r * 0.12);
  g.scale(1, flatten, 1);
  g.translate(center.x, center.y, center.z);
  spherify(g, center, 1 / flatten, 0.9);
  return paint(g, (p, n, out) => {
    const up = clamp01(n.y * 0.5 + 0.5);
    out.copy(dark).lerp(light, smoothstep(0.25, 0.95, up));
    out.multiplyScalar(0.92 + 0.16 * Math.sin(p.x * 3.1 + p.z * 2.3));
  });
}

function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: THREE.Color): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return solid(flat(g), col);
}

export class PineFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(71);
    const H = 16;
    const parts: THREE.BufferGeometry[] = [trunk(H * 0.92, 0.32, 0.12, 7, C(0x6a3f22), C(0xc2703a), 1.5)];
    const dark = C(0x2c4a22);
    const light = C(0x7d9434);
    const bark = C(0x9a5a30);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const y = lerp(H * 0.62, H * 0.97, t);
      const a = i * 2.4 + rng.range(-0.3, 0.3);
      const out = lerp(3.6, 1.4, t) * rng.range(0.85, 1.1);
      const end = V(Math.cos(a) * out, y + 0.9, Math.sin(a) * out);
      parts.push(limb(V(0, y - 0.6, 0), end, 0.13, 0.05, bark));
      // płaskie „poduszki” igliwia
      const r = lerp(2.1, 1.4, t) * rng.range(0.85, 1.1);
      parts.push(clump(end.clone().setY(end.y + 0.25), r, rng, dark, light, 0.38));
      parts.push(clump(end.clone().add(V(Math.cos(a + 1.3) * r * 0.6, 0.1, Math.sin(a + 1.3) * r * 0.6)), r * 0.7, rng, dark, light, 0.4));
    }
    parts.push(clump(V(0, H + 0.5, 0), 1.6, rng, dark, light, 0.45));
    return meshOf('pine', merge(parts));
  }
}

export class BirchFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(33);
    const H = 11;
    const t = new THREE.CylinderGeometry(0.08, 0.2, H, 7, 12, true);
    t.translate(0, H / 2, 0);
    const bark = paint(flat(t), (p, _n, out) => {
      // biała kora z czarnymi przetarciami
      const band = Math.sin(p.y * 7.3 + Math.sin(p.x * 30) * 1.5) * Math.sin(p.y * 2.1 + p.z * 20);
      out.copy(C(0xe8e2d4)).lerp(C(0x2a2622), band > 0.72 ? 0.85 : 0);
      if (p.y < 0.6) out.lerp(C(0x3a3028), 1 - p.y / 0.6);
    });
    const parts: THREE.BufferGeometry[] = [bark];
    const dark = C(0x5d7a2a);
    const light = C(0xb9c64c);
    const branch = C(0x5a4a3a);
    for (let i = 0; i < 12; i++) {
      const tt = i / 11;
      const y = lerp(H * 0.42, H * 1.02, tt);
      const a = i * 2.2 + rng.range(-0.4, 0.4);
      const out = lerp(1.6, 0.5, tt) * rng.range(0.8, 1.2);
      const c = V(Math.cos(a) * out, y, Math.sin(a) * out);
      if (tt < 0.8) parts.push(limb(V(0, y - 0.8, 0), c, 0.05, 0.02, branch));
      parts.push(clump(c, lerp(1.25, 0.8, tt) * rng.range(0.85, 1.15), rng, dark, light, 0.8));
    }
    return meshOf('birch', merge(parts));
  }
}

export class WillowFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(52);
    const bark = C(0x5a3e26);
    const parts: THREE.BufferGeometry[] = [trunk(3.2, 0.55, 0.38, 9, C(0x4a3220), C(0x6a4a2e), 1.5)];
    const dark = C(0x6a7f2c);
    const light = C(0xc3cc55);
    const crown: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const tip = V(Math.cos(a) * 2.6, 6.2 + rng.range(-0.4, 0.6), Math.sin(a) * 2.6);
      parts.push(limb(V(0, 2.9, 0), tip, 0.3, 0.12, bark));
      crown.push(tip);
    }
    crown.push(V(0, 7.2, 0));
    for (const c of crown) parts.push(clump(c, 2.3 * rng.range(0.9, 1.1), rng, dark, light, 0.6));
    // zwisające „kurtyny” gałązek
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.06, 0.06);
      const r = rng.range(3.1, 4.3);
      const top = rng.range(5.6, 7.0);
      const len = rng.range(3.4, 5.2);
      const sections: THREE.Vector3[][] = [];
      const side = V(-Math.sin(a), 0, Math.cos(a));
      for (let s = 0; s <= 3; s++) {
        const t = s / 3;
        const rr = r + 0.35 * t;
        const c = V(Math.cos(a) * rr, top - len * t, Math.sin(a) * rr);
        const w = lerp(0.55, 0.12, t);
        sections.push([c.clone().addScaledVector(side, w), c.clone().addScaledVector(side, -w)]);
      }
      const g = loft(sections);
      parts.push(paint(g, (p, _n, out) => out.copy(dark).lerp(light, clamp01((p.y - (top - len)) / len) * 0.9 + 0.1)));
    }
    const geo = merge(parts);
    return meshOf('willow', geo);
  }
}

// ---------------------------------------------------------------------------
// krzaki, paprocie
// ---------------------------------------------------------------------------
export class BushFactory implements AssetFactory {
  constructor(private seed = 5) {}
  create(): THREE.Object3D {
    const rng = new Rng(this.seed);
    const parts: THREE.BufferGeometry[] = [];
    const dark = C(0x2e5220);
    const light = C(0x8fae3a);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 * 2.3 + rng.range(-0.3, 0.3);
      const r = i === 0 ? 0 : rng.range(0.3, 0.65);
      const c = V(Math.cos(a) * r, rng.range(0.4, 0.8) + (i === 0 ? 0.3 : 0), Math.sin(a) * r);
      parts.push(clump(c, rng.range(0.34, 0.5), rng, dark, light, 0.85, 0));
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      parts.push(limb(V(0, 0, 0), V(Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4), 0.03, 0.015, C(0x5a3e28)));
    }
    return meshOf('bush', merge(parts));
  }
}

export class FernFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(19);
    const parts: THREE.BufferGeometry[] = [];
    const dark = C(0x2f5a22);
    const light = C(0x9dc047);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const len = rng.range(0.7, 1.05);
      const lift = rng.range(0.55, 0.85);
      const dir = V(Math.cos(a), 0, Math.sin(a));
      const side = V(-Math.sin(a), 0, Math.cos(a));
      // ząbkowany listek: pas z naprzemiennie szerokimi i wąskimi przekrojami (piłkowany brzeg)
      const sections: THREE.Vector3[][] = [];
      const segs = 8;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const c = dir.clone().multiplyScalar(len * t).setY(lift * Math.sin(Math.PI * 0.85 * t) * (1 - 0.35 * t) + 0.02);
        const w = 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (s % 2 === 0 ? 1 : 0.45) + 0.01;
        sections.push([c.clone().addScaledVector(side, w).setY(c.y - w * 0.25), c.clone().addScaledVector(side, -w).setY(c.y - w * 0.25)]);
      }
      const g = loft(sections);
      parts.push(paint(g, (p, _n, out) => out.copy(dark).lerp(light, smoothstep(0.1, 0.9, Math.hypot(p.x, p.z) / len))));
    }
    return meshOf('fern', merge(parts), false);
  }
}

// ---------------------------------------------------------------------------
// rośliny wodne
// ---------------------------------------------------------------------------
function blade(a: number, h: number, w: number, lean: number, off: THREE.Vector3, col0: THREE.Color, col1: THREE.Color): THREE.BufferGeometry {
  const dir = V(Math.cos(a), 0, Math.sin(a));
  const side = V(-Math.sin(a), 0, Math.cos(a));
  const sections: THREE.Vector3[][] = [];
  for (let s = 0; s <= 2; s++) {
    const t = s / 2;
    const c = off.clone().addScaledVector(dir, lean * h * t * t).setY(h * t);
    const ww = w * (1 - t * 0.92);
    sections.push([c.clone().addScaledVector(side, ww), c.clone().addScaledVector(side, -ww)]);
  }
  return paint(loft(sections), (p, _n, out) => out.copy(col0).lerp(col1, clamp01(p.y / h)));
}

export class ReedFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(3);
    const parts: THREE.BufferGeometry[] = [];
    const g0 = C(0x4c6a26);
    const g1 = C(0xa9a454);
    for (let i = 0; i < 9; i++) {
      const off = V(rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18));
      const h = rng.range(1.5, 2.3);
      parts.push(blade(rng.range(0, Math.PI * 2), h, 0.02, rng.range(0.05, 0.2), off, g0, g1));
      if (i % 2 === 0) {
        // kiść (wiecha) – wrzecionowata, lekko opadająca, jasna i pierzasta
        const plume = new THREE.SphereGeometry(1, 6, 5);
        plume.scale(0.035, 0.2, 0.05);
        plume.rotateZ(rng.range(0.2, 0.5));
        plume.translate(off.x + 0.06, h + 0.12, off.z);
        parts.push(paint(flat(plume), (p, _n, out) => out.copy(C(0xe2c88c)).lerp(C(0xa8844a), clamp01((h + 0.25 - p.y) / 0.35))));
      }
    }
    // szersze liście
    for (let i = 0; i < 4; i++) parts.push(blade(rng.range(0, Math.PI * 2), rng.range(0.7, 1.2), 0.035, 0.45, V(0, 0, 0), g0, C(0x8ea040)));
    return meshOf('reeds', merge(parts));
  }
}

export class CattailFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(8);
    const parts: THREE.BufferGeometry[] = [];
    const g0 = C(0x3f6224);
    const g1 = C(0x8cab44);
    for (let i = 0; i < 7; i++) parts.push(blade(rng.range(0, Math.PI * 2), rng.range(1.0, 1.6), 0.045, rng.range(0.2, 0.5), V(rng.range(-0.1, 0.1), 0, rng.range(-0.1, 0.1)), g0, g1));
    for (let i = 0; i < 4; i++) {
      const x = rng.range(-0.12, 0.12);
      const z = rng.range(-0.12, 0.12);
      const h = rng.range(1.4, 1.9);
      const stem = new THREE.CylinderGeometry(0.008, 0.012, h, 4, 1, true);
      stem.translate(x, h / 2, z);
      parts.push(solid(flat(stem), C(0x5a7a30)));
      const head = new THREE.CylinderGeometry(0.035, 0.035, 0.26, 6);
      head.translate(x, h - 0.12, z);
      parts.push(solid(flat(head), C(0x6a3a1e)));
    }
    return meshOf('cattail', merge(parts));
  }
}

/** Grążele / lilie wodne: kilka liści z wcięciem + kwiat. Leży na wodzie (y = 0). */
export class LilyFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(21);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const r = rng.range(0.14, 0.24);
      const a = rng.range(0, Math.PI * 2);
      const d = i === 0 ? 0 : rng.range(0.25, 0.55);
      const cut = rng.range(0, Math.PI * 2);
      const leaf = new THREE.CircleGeometry(r, 14, cut + 0.25, Math.PI * 2 - 0.5);
      leaf.rotateX(-Math.PI / 2);
      leaf.translate(Math.cos(a) * d, 0.012 + i * 0.001, Math.sin(a) * d);
      parts.push(paint(flat(leaf), (p, _n, out) => out.copy(C(0x3f6a26)).lerp(C(0x8aa63e), 0.4 + 0.3 * Math.sin(p.x * 30 + p.z * 20))));
    }
    // kwiat: dwa pierścienie płatków + żółty środek
    for (let ring = 0; ring < 2; ring++) {
      const k = 7;
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + ring * 0.45;
        const len = ring === 0 ? 0.09 : 0.065;
        const tilt = ring === 0 ? 0.35 : 0.9;
        const petal = new THREE.SphereGeometry(len * 0.5, 5, 3);
        petal.scale(1, 0.35, 0.45);
        petal.translate(len * 0.5, 0, 0);
        petal.rotateZ(tilt);
        petal.rotateY(a);
        petal.translate(0.05, 0.03, 0.04);
        parts.push(solid(flat(petal), C(0xf4efe0)));
      }
    }
    const heart = new THREE.SphereGeometry(0.022, 6, 4);
    heart.translate(0.05, 0.06, 0.04);
    parts.push(solid(flat(heart), C(0xf0c030)));
    return meshOf('lily', merge(parts), false);
  }
}

// ---------------------------------------------------------------------------
// kamienie, pniaki, zwalony pień
// ---------------------------------------------------------------------------
export function rockGeometry(seed: number, detail = 2): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const o1 = V(rng.range(-5, 5), rng.range(-5, 5), rng.range(-5, 5));
  for (let i = 0; i < pos.count; i++) {
    const p = V(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = Math.sin(p.x * 2.1 + o1.x) * Math.sin(p.y * 1.9 + o1.y) * Math.sin(p.z * 2.3 + o1.z);
    const n2 = Math.sin(p.x * 5.3 + o1.y) * Math.sin(p.z * 4.7 + o1.x);
    const k = 1 + 0.22 * n + 0.07 * n2;
    // spłaszczony spód, płaskie ścięcia (skała łupana)
    p.multiplyScalar(k);
    p.y = p.y < -0.25 ? -0.25 - (p.y + 0.25) * 0.2 : p.y;
    const facet = Math.round(p.x * 2.2) / 2.2;
    p.x = lerp(p.x, facet, 0.18);
    pos.setXYZ(i, p.x, p.y + 0.25, p.z);
  }
  g.computeVertexNormals();
  const f = flat(g);
  f.computeVertexNormals();
  return paint(f, (p, n, out) => {
    const stone = C(0x8e877a).lerp(C(0xb3aa98), 0.5 + 0.5 * Math.sin(p.x * 7 + p.z * 5) * Math.sin(p.y * 6));
    const moss = C(0x5d7228).lerp(C(0x8a9a36), 0.5 + 0.5 * Math.sin(p.x * 11 + p.z * 13));
    const m = smoothstep(0.45, 0.8, n.y + 0.15 * Math.sin(p.x * 9 + p.z * 7));
    out.copy(stone).lerp(moss, m * 0.9);
    if (p.y < 0.1) out.multiplyScalar(0.75);
  });
}

export class RockFactory implements AssetFactory {
  constructor(private seed = 1) {}
  create(): THREE.Object3D {
    return meshOf('rock', rockGeometry(this.seed, 2));
  }
}

export class StumpFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(44);
    const parts: THREE.BufferGeometry[] = [];
    const bark = C(0x5a3e28);
    const s = new THREE.CylinderGeometry(0.34, 0.42, 0.6, 10, 2, false);
    s.translate(0, 0.3, 0);
    const sf = flat(s);
    jitter(sf, rng, 0.03, 0.02);
    parts.push(
      paint(sf, (p, n, out) => {
        if (n.y > 0.9 && p.y > 0.55) {
          // przekrój z przyrostami
          const r = Math.hypot(p.x, p.z);
          out.copy(C(0xd9b07a)).lerp(C(0xa87a4a), 0.5 + 0.5 * Math.sin(r * 60));
        } else out.copy(bark).lerp(C(0x6f8a30), smoothstep(0.1, 0.0, p.y) * 0.6);
      }),
    );
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng.range(-0.2, 0.2);
      parts.push(limb(V(Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25), V(Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75), 0.13, 0.05, bark));
    }
    return meshOf('stump', merge(parts));
  }
}

/** Zwalony świerk: pień wzdłuż +X od 0 do długości 1 (skalowany), z kikutami gałęzi i mchem na wierzchu. */
export class FallenLogFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(61);
    const parts: THREE.BufferGeometry[] = [];
    const L = 16;
    const t = new THREE.CylinderGeometry(0.2, 0.42, L, 10, 10, false);
    t.rotateZ(-Math.PI / 2);
    t.translate(L / 2, 0, 0);
    const tf = flat(t);
    jitter(tf, rng, 0.02, 0.02);
    parts.push(
      paint(tf, (p, n, out) => {
        const bark = C(0x5a4030).lerp(C(0x7d5a3c), 0.5 + 0.5 * Math.sin(p.x * 3.3 + p.z * 9));
        const moss = C(0x5f7428);
        out.copy(bark).lerp(moss, smoothstep(0.55, 0.9, n.y) * 0.8);
        if (Math.abs(n.x) > 0.95) out.copy(C(0xc49a66));
      }),
    );
    // korzenie (talerz korzeniowy przy x = 0)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      parts.push(limb(V(0.2, 0, 0), V(-0.35, Math.sin(a) * 1.3, Math.cos(a) * 1.3), 0.14, 0.04, C(0x4a3624)));
    }
    // kikuty gałęzi
    for (let i = 0; i < 16; i++) {
      const x = rng.range(3, L - 0.8);
      const a = rng.range(0, Math.PI * 2);
      const r = lerp(0.42, 0.2, x / L);
      const len = rng.range(0.4, 1.4) * (1 - x / L * 0.5);
      parts.push(limb(V(x, Math.sin(a) * r * 0.8, Math.cos(a) * r * 0.8), V(x + len * 0.4, Math.sin(a) * (r + len), Math.cos(a) * (r + len)), 0.05, 0.015, C(0x6a5038)));
    }
    return meshOf('fallenLog', merge(parts));
  }
}
