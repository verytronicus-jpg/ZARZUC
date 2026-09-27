import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from '../config';
import { Rng } from '../core/Rng';
import { clamp01, smoothstep, DEG } from '../core/math';
import { Heightmap } from './Heightmap';
import { Water } from './Water';
import { waterHeight } from './waves';
import {
  lakeR,
  lakeDepth,
  lakeTheta,
  reedArcMask,
  pierRect,
  distToPier,
  terrainHeightAnalytic,
} from './terrainMath';
import type { Collider } from '../player/collision';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { RenderContext } from '../render/RenderContext';

function colorGeo(geo: THREE.BufferGeometry, hex: number | ((y: number) => THREE.Color)): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (typeof hex === 'number') c.set(hex);
    else c.copy(hex(pos.getY(i)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Świat: teren z heightmapą, jezioro (mapa głębokości + woda Gerstnera), pomost, roślinność. */
export class World {
  readonly heightmap: Heightmap;
  readonly water: Water;
  readonly colliders: Collider[] = [];
  readonly reedPoints: Array<{ x: number; z: number }> = [];
  readonly group = new THREE.Group();
  private swayMaterials: THREE.Material[] = [];
  time = 0;

  constructor(
    private ctx: RenderContext,
    private assets: AssetRegistry,
    private rng: Rng,
  ) {
    this.heightmap = new Heightmap();
    this.water = new Water(ctx.sunDir, ctx.sun.color, ctx.skyZenith, ctx.skyHorizon);
    this.group.name = 'world';
    this.group.add(this.buildTerrain());
    this.group.add(this.water.mesh);
    this.group.add(this.buildPier());
    this.buildReeds();
    this.buildTrees();
    this.buildRocks();
    this.buildGrass();
    ctx.scene.add(this.group);
  }

  // ---------- zapytania ----------
  groundAt(x: number, z: number): number {
    const t = this.heightmap.heightAt(x, z);
    const p = pierRect();
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return Math.max(t, p.deck);
    return t;
  }

  terrainAt(x: number, z: number): number {
    return this.heightmap.heightAt(x, z);
  }

  depthAt(x: number, z: number): number {
    return lakeDepth(x, z);
  }

  waterY(x: number, z: number, t = this.time): number {
    return waterHeight(x, z, t);
  }

  isWater(x: number, z: number, minDepth = 0.05): boolean {
    return lakeDepth(x, z) > minDepth;
  }

  reedDistance(x: number, z: number): number {
    let best = Infinity;
    for (const p of this.reedPoints) {
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  get pier() {
    return pierRect();
  }

  pierDistance(x: number, z: number): number {
    return distToPier(x, z);
  }

  update(dt: number): void {
    this.time += dt;
  }

  setRenderTime(t: number): void {
    this.water.setTime(t);
    for (const m of this.swayMaterials) {
      const u = (m.userData.uniforms as { uTime: { value: number } } | undefined)?.uTime;
      if (u) u.value = t;
    }
  }

  // ---------- budowa ----------
  private buildTerrain(): THREE.Mesh {
    const hm = this.heightmap;
    const nx = hm.nx;
    const nz = hm.nz;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const grassA = new THREE.Color(0x5f7c30);
    const grassB = new THREE.Color(0x839240);
    const grassDry = new THREE.Color(0x8a8248);
    const sand = new THREE.Color(0x9c8a64);
    const mud = new THREE.Color(0x4a4232);
    const deep = new THREE.Color(0x2c3a30);
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = hm.x0 + i * hm.dx;
        const z = hm.z0 + j * hm.dz;
        const h = hm.heights[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const r = lakeR(x, z);
        const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
        const n2 = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.7) * Math.sin(z * 1.1 - x * 0.4);
        if (r < 1) {
          const d = -h;
          c.copy(sand).lerp(mud, smoothstep(0.05, 0.9, d)).lerp(deep, smoothstep(1.5, 4, d));
        } else {
          c.copy(grassA).lerp(grassB, n).lerp(grassDry, smoothstep(0.55, 1, n2) * 0.35);
          c.lerp(sand, 1 - smoothstep(1.0, 1.045, r));
          // zacieniona trawa w obniżeniach
          c.multiplyScalar(0.92 + 0.08 * n2);
        }
        col.set([c.r, c.g, c.b], k * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i; // (i,j)
        const b = (j + 1) * nx + i; // (i,j+1)
        const c1 = j * nx + i + 1; // (i+1,j)
        const d = (j + 1) * nx + i + 1; // (i+1,j+1)
        // ten sam podział co Heightmap.heightAt
        idx.push(a, b, c1, c1, b, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }

  private buildPier(): THREE.Mesh {
    const p = pierRect();
    const parts: THREE.BufferGeometry[] = [];
    const len = p.z1 - p.z0;
    const plankW = 0.16;
    const n = Math.floor(len / (plankW + 0.02));
    const rng = new Rng(77);
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(p.x1 - p.x0, 0.05, plankW);
      const tone = 0.85 + rng.next() * 0.25;
      const base = new THREE.Color(0x8a6a48).multiplyScalar(tone);
      g.translate((p.x0 + p.x1) / 2 + (rng.next() - 0.5) * 0.03, p.deck - 0.025, p.z0 + 0.1 + i * (plankW + 0.02));
      parts.push(colorGeo(g, () => base));
    }
    for (const x of [p.x0 + 0.1, p.x1 - 0.1]) {
      const beam = new THREE.BoxGeometry(0.12, 0.16, len);
      beam.translate(x, p.deck - 0.13, (p.z0 + p.z1) / 2);
      parts.push(colorGeo(beam, 0x5e4630));
      for (let z = p.z0 + 0.2; z < p.z1; z += 2.4) {
        const bottom = terrainHeightAnalytic(x, z) - 0.3;
        const h = p.deck - bottom;
        const post = new THREE.CylinderGeometry(0.09, 0.1, h, 7);
        post.translate(x, bottom + h / 2, z);
        parts.push(colorGeo(post, 0x4d3a28));
        this.colliders.push({ kind: 'circle', x, z, r: 0.12 });
      }
    }
    // poręcz na końcu pomostu
    const rail = new THREE.BoxGeometry(p.x1 - p.x0, 0.06, 0.08);
    rail.translate((p.x0 + p.x1) / 2, p.deck + 0.5, p.z0 + 0.1);
    parts.push(colorGeo(rail, 0x6a5038));
    for (const x of [p.x0 + 0.1, p.x1 - 0.1]) {
      const rp = new THREE.BoxGeometry(0.08, 0.55, 0.08);
      rp.translate(x, p.deck + 0.25, p.z0 + 0.1);
      parts.push(colorGeo(rp, 0x6a5038));
    }
    const geo = mergeGeometries(parts, false)!;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'pier';
    // niewidzialna barierka na końcu pomostu (gracz nie spadnie do wody)
    this.colliders.push({ kind: 'box', x: (p.x0 + p.x1) / 2, z: p.z0 - 0.05, hx: (p.x1 - p.x0) / 2 + 0.3, hz: 0.1, angle: 0 });
    return m;
  }

  private swayMaterial(base: THREE.MeshStandardMaterial, amount: number): THREE.MeshStandardMaterial {
    const uniforms = { uTime: { value: 0 } };
    base.userData.uniforms = uniforms;
    base.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
             vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
           #else
             vec2 ip = vec2(0.0);
           #endif
           float sw = sin(uTime * 1.3 + ip.x * 0.35 + ip.y * 0.2) + 0.5 * sin(uTime * 2.7 + ip.x * 0.9);
           transformed.x += sw * ${amount.toFixed(3)} * position.y * position.y;
           transformed.z += sw * ${(amount * 0.5).toFixed(3)} * position.y * position.y;`,
        );
    };
    base.customProgramCacheKey = () => `sway-${amount}`;
    this.swayMaterials.push(base);
    return base;
  }

  private buildReeds(): void {
    const w = CFG.world;
    const blades: THREE.BufferGeometry[] = [];
    const bladeCol = (y: number) => new THREE.Color(0x4f6a2a).lerp(new THREE.Color(0xa59a58), smoothstep(0.6, 1.9, y));
    for (let i = 0; i < 5; i++) {
      const g = new THREE.ConeGeometry(0.018, 1.7 + i * 0.12, 4, 1);
      g.translate(0, (1.7 + i * 0.12) / 2, 0);
      g.rotateZ((i - 2) * 0.07);
      g.rotateY(i * 1.3);
      g.translate(Math.cos(i * 2.1) * 0.07, 0, Math.sin(i * 2.1) * 0.07);
      blades.push(colorGeo(g, bladeCol));
    }
    const head = new THREE.CylinderGeometry(0.025, 0.02, 0.2, 5);
    head.translate(0.02, 1.95, 0.01);
    blades.push(colorGeo(head, 0x5a3a22));
    const geo = mergeGeometries(blades, false)!;
    geo.computeVertexNormals();
    const matR = this.swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), 0.03);
    const inst = new THREE.InstancedMesh(geo, matR, w.reedCount);
    inst.castShadow = true;
    inst.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const color = new THREE.Color();
    let count = 0;
    let tries = 0;
    while (count < w.reedCount && tries < w.reedCount * 40) {
      tries++;
      const arc = w.reedArcs[this.rng.int(0, w.reedArcs.length - 1)];
      const th = (arc.angleDeg + this.rng.range(-1, 1) * arc.halfWidthDeg) * DEG;
      const rr = this.rng.range(0.86, 1.02);
      const sc = 1 + 0.06 * Math.sin(3 * th + 0.4) + 0.035 * Math.sin(5 * th + 1.3) + 0.018 * Math.sin(9 * th + 2.0);
      const x = w.lakeRx * Math.cos(th) * sc * rr;
      const z = w.lakeRz * Math.sin(th) * sc * rr;
      const mask = reedArcMask(lakeTheta(x, z));
      if (this.rng.next() > mask) continue;
      if (lakeDepth(x, z) > 0.9) continue;
      const y = this.heightmap.heightAt(x, z);
      pos.set(x, y, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI * 2));
      const k = this.rng.range(0.75, 1.25);
      s.set(k, this.rng.range(0.85, 1.25), k);
      m.compose(pos, q, s);
      inst.setMatrixAt(count, m);
      color.setHSL(0.18 + this.rng.range(-0.02, 0.03), 0.5, this.rng.range(0.85, 1.1));
      inst.setColorAt(count, color);
      if (count % 3 === 0) this.reedPoints.push({ x, z });
      count++;
    }
    inst.count = count;
    inst.name = 'reeds';
    this.group.add(inst);
  }

  private treeAllowed(x: number, z: number, minR: number): boolean {
    const r = lakeR(x, z);
    if (r < minR) return false;
    if (distToPier(x, z) < 9) return false;
    return true;
  }

  private buildTrees(): void {
    const w = CFG.world;
    const trunkCol = 0x5a4430;
    // sosna
    const pine: THREE.BufferGeometry[] = [];
    const t1 = new THREE.CylinderGeometry(0.14, 0.22, 4, 6);
    t1.translate(0, 2, 0);
    pine.push(colorGeo(t1, trunkCol));
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry(1.9 - i * 0.5, 2.6, 7);
      c.translate(0, 3.4 + i * 1.3, 0);
      pine.push(colorGeo(c, (y) => new THREE.Color(0x2c4a24).lerp(new THREE.Color(0x3d5f2e), clamp01((y - 3) / 4))));
    }
    const pineGeo = mergeGeometries(pine, false)!;
    pineGeo.computeVertexNormals();
    // liściaste (brzoza/olcha)
    const leafy: THREE.BufferGeometry[] = [];
    const t2 = new THREE.CylinderGeometry(0.12, 0.2, 3.4, 6);
    t2.translate(0, 1.7, 0);
    leafy.push(colorGeo(t2, 0xd8d2c4));
    const blobs: Array<[number, number, number, number]> = [
      [0, 4.2, 0, 1.6],
      [0.9, 3.7, 0.3, 1.1],
      [-0.8, 3.8, -0.4, 1.15],
      [0.1, 5.1, -0.2, 1.05],
    ];
    for (const [x, y, z, r] of blobs) {
      const b = new THREE.IcosahedronGeometry(r, 1);
      b.translate(x, y, z);
      leafy.push(colorGeo(b, (yy) => new THREE.Color(0x4a6a2a).lerp(new THREE.Color(0x7a8a3a), clamp01((yy - 3) / 3))));
    }
    const leafyGeo = mergeGeometries(leafy, false)!;
    leafyGeo.computeVertexNormals();

    const matT = this.swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 0.0025);
    const pines = new THREE.InstancedMesh(pineGeo, matT, w.treeCount);
    const leafs = new THREE.InstancedMesh(leafyGeo, matT, w.treeCount);
    let np = 0;
    let nl = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let tries = 0;
    while (np + nl < w.treeCount && tries < w.treeCount * 30) {
      tries++;
      // gęściej dalej od jeziora, kilka drzew blisko brzegu
      const ang = this.rng.range(0, Math.PI * 2);
      const rr = 1.12 + Math.pow(this.rng.next(), 0.8) * 2.2;
      const x = Math.cos(ang) * w.lakeRx * rr * 1.02;
      const z = Math.sin(ang) * w.lakeRz * rr * 1.25 + 8;
      if (x < w.terrainMinX + 5 || x > w.terrainMaxX - 5 || z < w.terrainMinZ + 5 || z > w.terrainMaxZ - 5) continue;
      if (!this.treeAllowed(x, z, 1.1)) continue;
      const y = this.heightmap.heightAt(x, z);
      p.set(x, y - 0.1, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI * 2));
      const k = this.rng.range(0.8, 1.45);
      s.set(k, k * this.rng.range(0.9, 1.2), k);
      m.compose(p, q, s);
      col.setHSL(0.25, 0.2, this.rng.range(0.8, 1.05));
      if (this.rng.chance(0.55)) {
        pines.setMatrixAt(np, m);
        pines.setColorAt(np, col);
        np++;
      } else {
        leafs.setMatrixAt(nl, m);
        leafs.setColorAt(nl, col);
        nl++;
      }
      this.colliders.push({ kind: 'circle', x, z, r: 0.25 * k });
    }
    pines.count = np;
    leafs.count = nl;
    for (const im of [pines, leafs]) {
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
    }
  }

  private buildRocks(): void {
    const geo = colorGeo(new THREE.DodecahedronGeometry(0.5, 0), 0x8a877c);
    geo.computeVertexNormals();
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), CFG.world.rockCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    let tries = 0;
    while (n < CFG.world.rockCount && tries < 3000) {
      tries++;
      const ang = this.rng.range(0, Math.PI * 2);
      const nearShore = this.rng.chance(0.6);
      const rr = nearShore ? this.rng.range(0.97, 1.08) : this.rng.range(1.1, 2.4);
      const x = Math.cos(ang) * CFG.world.lakeRx * rr * 1.05;
      const z = Math.sin(ang) * CFG.world.lakeRz * rr * 1.05;
      if (!this.treeAllowed(x, z, 0.95)) continue;
      if (reedArcMask(lakeTheta(x, z)) > 0.3 && nearShore) continue;
      const y = this.heightmap.heightAt(x, z);
      const k = nearShore ? this.rng.range(0.3, 1.0) : this.rng.range(0.4, 1.6);
      p.set(x, y + 0.08 * k, z);
      q.setFromEuler(new THREE.Euler(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3)));
      s.set(k * this.rng.range(0.9, 1.5), k * this.rng.range(0.5, 0.8), k * this.rng.range(0.9, 1.4));
      m.compose(p, q, s);
      inst.setMatrixAt(n, m);
      col.setHSL(0.1, 0.05, this.rng.range(0.75, 1.05));
      inst.setColorAt(n, col);
      if (k > 0.6) this.colliders.push({ kind: 'circle', x, z, r: 0.45 * k });
      n++;
    }
    inst.count = n;
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  private buildGrass(): void {
    const tuft: THREE.BufferGeometry[] = [];
    const blade = (ang: number, lean: number, h: number, off: number) => {
      const g = new THREE.BufferGeometry();
      const w = 0.035;
      const tipX = Math.sin(lean) * h * 0.35;
      g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, tipX, h, 0.02], 3));
      g.computeVertexNormals();
      g.rotateY(ang);
      g.translate(Math.cos(ang * 3) * off, 0, Math.sin(ang * 3) * off);
      return colorGeo(g, (y) => new THREE.Color(0x4d6a26).lerp(new THREE.Color(0xb3b25a), clamp01(y / 0.45)));
    };
    for (let i = 0; i < 7; i++) tuft.push(blade((i / 7) * Math.PI * 2, (i % 3) - 1, 0.3 + (i % 4) * 0.06, 0.05 + (i % 2) * 0.04));
    const geo = mergeGeometries(tuft, false)!;
    geo.computeVertexNormals();
    const N = 4200;
    const matG = this.swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), 0.12);
    const inst = new THREE.InstancedMesh(geo, matG, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let n = 0;
    let tries = 0;
    while (n < N && tries < N * 10) {
      tries++;
      const ang = this.rng.range(0, Math.PI * 2);
      const rr = this.rng.range(1.01, 1.5);
      const x = Math.cos(ang) * CFG.world.lakeRx * rr;
      const z = Math.sin(ang) * CFG.world.lakeRz * rr;
      if (lakeR(x, z) < 1.015) continue;
      if (distToPier(x, z) < 1.2) continue;
      p.set(x, this.heightmap.heightAt(x, z) - 0.02, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(0, Math.PI));
      const k = this.rng.range(0.6, 1.4);
      s.set(k, k * this.rng.range(0.7, 1.3), k);
      m.compose(p, q, s);
      inst.setMatrixAt(n++, m);
    }
    inst.count = n;
    inst.receiveShadow = true;
    this.group.add(inst);
  }
}
