/**
 * Przyroda wg arkusza reference/02-postacie-i-obiekty/10-roslinnosc-kamienie: daleki las, trzciny z kiściami,
 * pałki, grążele, kamienie z mchem, zwalony pień, pniak. Drzewa, krzaki i paprocie z kart z teksturą – foliage.ts.
 * Każdy model = JEDNA siatka z kolorami wierzchołków (do InstancedMesh). Podstawa w (0,0,0), oś +Y.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/Rng';
import { clamp01, lerp, smoothstep } from '../../core/math';
import type { AssetFactory } from '../AssetRegistry';
import { group } from '../materials';
import { axisNormals, C, flat, jitter, loft, merge, paint, solid } from './geo';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Materiał roślinności: kolory wierzchołków, obustronny, bez odwracania normalnych tylnych ścian. */
function vegetationBaseMaterial(): THREE.MeshStandardMaterial {
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
// daleki las
// ---------------------------------------------------------------------------

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

/** Gałąź/konar: stożek ścięty między punktami a i b. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: THREE.Color): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 5, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return solid(flat(g), col);
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
        const plume = new THREE.SphereGeometry(1, 5, 3);
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
function rockGeometry(seed: number, detail = 2): THREE.BufferGeometry {
  const rng = new Rng(seed);
  // zaokrąglony głaz (arkusz 10): gładkie normalne, płaski spód, mech na wierzchu
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const o1 = V(rng.range(-5, 5), rng.range(-5, 5), rng.range(-5, 5));
  for (let i = 0; i < pos.count; i++) {
    const p = V(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = Math.sin(p.x * 2.1 + o1.x) * Math.sin(p.y * 1.9 + o1.y) * Math.sin(p.z * 2.3 + o1.z);
    const n2 = Math.sin(p.x * 5.3 + o1.y) * Math.sin(p.z * 4.7 + o1.x);
    const k = 1 + 0.2 * n + 0.05 * n2;
    p.multiplyScalar(k);
    p.y = p.y < -0.25 ? -0.25 - (p.y + 0.25) * 0.2 : p.y;
    const facet = Math.round(p.x * 2.2) / 2.2;
    p.x = lerp(p.x, facet, 0.1);
    pos.setXYZ(i, p.x, p.y + 0.25, p.z);
  }
  g.computeVertexNormals();
  const f = flat(g);
  return paint(f, (p, n, out) => {
    const stone = C(0x77776e).lerp(C(0x9c988c), 0.5 + 0.5 * Math.sin(p.x * 7 + p.z * 5) * Math.sin(p.y * 6));
    const moss = C(0x4a6224).lerp(C(0x7d9432), 0.5 + 0.5 * Math.sin(p.x * 11 + p.z * 13));
    const m = smoothstep(0.3, 0.72, n.y + 0.18 * Math.sin(p.x * 9 + p.z * 7));
    out.copy(stone).lerp(moss, m * 0.92);
    // ciemniejsza, wilgotna podstawa
    out.multiplyScalar(lerp(0.62, 1, smoothstep(0.0, 0.35, p.y)));
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
