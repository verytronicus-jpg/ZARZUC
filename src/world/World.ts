import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from '../config';
import { Rng } from '../core/Rng';
import { clamp01, lerp, smoothstep, DEG } from '../core/math';
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
  cabinFrame,
  cabinToWorld,
  porchHeight,
  pathMask,
  pathPolyline,
  nearestOnPolyline,
  clearingMask,
  structureDistance,
  boundsDistance,
  shoreDistance,
  porchFoot,
} from './terrainMath';
import type { Collider } from '../player/collision';
import type { AssetKind, AssetRegistry } from '../assets/AssetRegistry';
import type { RenderContext } from '../render/RenderContext';
import { ChimneySmoke } from './ChimneySmoke';
import { cabinLayout } from '../assets/procedural/cabin';
import { SHADOW_LAYER } from '../render/layers';

/** Wspólne uniformy wiatru dla roślinności (czas renderu). */
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };

function colorGeo(geo: THREE.BufferGeometry, hex: number | ((y: number) => THREE.Color)): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
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

/** Instancja do rozmieszczenia. */
interface Inst {
  x: number;
  y: number;
  z: number;
  rotY: number;
  s: number;
  sy?: number;
  tint?: number;
  rotX?: number;
  rotZ?: number;
}

/**
 * Świat „Chatka nad jeziorem”: teren (heightmapa o zmiennym kroku), jezioro z mapą głębokości i przedłużeniem
 * na północ, pomost z łódką, chatka na polanie, ścieżka z płotkiem, las świerkowy (2 poziomy szczegółów
 * + daleki las), brzozy, wierzba, krzaki, paprocie, trzciny, pałki, grążele, kamienie, cypel, zwalone drzewo.
 */
export class World {
  readonly heightmap: Heightmap;
  readonly water: Water;
  readonly colliders: Collider[] = [];
  readonly reedPoints: Array<{ x: number; z: number }> = [];
  readonly group = new THREE.Group();
  cabin!: THREE.Object3D;
  boat!: THREE.Object3D;
  lamp: THREE.PointLight | null = null;
  smoke!: ChimneySmoke;
  time = 0;
  private boatBase = new THREE.Vector3();
  /** cienie roślinności: tylko instancje blisko gracza (osobne siatki widoczne wyłącznie dla kamery cienia) */
  private shadowSets: Array<{ src: THREE.InstancedMesh; proxy: THREE.InstancedMesh; pos: Float32Array }> = [];
  private shadowFocus = new THREE.Vector3(1e9, 0, 1e9);
  /** siatka zajętości dla drzew (min. odstępy) */
  private occ = new Map<string, number>();

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
    this.buildBoat();
    this.buildCabin();
    this.buildFence();
    this.buildFallenTree();
    this.buildReeds();
    this.buildRocks();
    this.buildTrees();
    this.buildUnderstory();
    this.buildGrass();
    ctx.scene.add(this.group);
  }

  // ---------- zapytania ----------
  groundAt(x: number, z: number): number {
    const t = this.heightmap.heightAt(x, z);
    const p = pierRect();
    let h = t;
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) h = Math.max(h, p.deck);
    return Math.max(h, porchHeight(x, z));
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

  /** Odległość do struktury dla ryb: pomost, zwalone drzewo, kamienie cypla. */
  structureDistance(x: number, z: number): number {
    return structureDistance(x, z);
  }

  /** Czy punkt (np. kamery) jest wewnątrz bryły chatki (ściany, okap, dach) – ramię kamery się skraca. */
  cameraBlocked(x: number, y: number, z: number, pad = 0.25): boolean {
    const L = cabinLayout();
    const c = cabinFrame();
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = dx * c.rx + dz * c.rz;
    const lz = dx * c.fx + dz * c.fz;
    const halfW = L.W / 2 + L.gableOver + pad;
    const halfD = L.D / 2 + L.eave + pad;
    if (Math.abs(lx) > halfW || Math.abs(lz) > halfD) return false;
    const ly = y - c.ground;
    const top = L.wallTop;
    // dach: od okapu do kalenicy
    const roofY = top + L.ridge * (1 - Math.min(1, Math.max(0, Math.abs(lz) - 0) / (L.D / 2 + 0.1)));
    if (ly > roofY + 0.25 + pad) return false;
    // ściany (z grubością bala) – wszystko poniżej okapu wewnątrz obrysu
    const wallHalfW = L.W / 2 + L.logR + 0.3 + pad;
    const wallHalfD = L.D / 2 + L.logR + pad;
    if (Math.abs(lx) < wallHalfW && Math.abs(lz) < wallHalfD) return true;
    // okap wystaje nad gankiem
    return ly > top - 0.3 - pad;
  }

  update(dt: number): void {
    this.time += dt;
  }

  setRenderTime(t: number): void {
    this.water.setTime(t);
    windUniforms.uTime.value = t;
    // łódka kołysze się na fali
    if (this.boat) {
      const b = this.boatBase;
      const y = waterHeight(b.x, b.z, t);
      this.boat.position.y = y - CFG.world.boatDraft;
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.025;
      this.boat.rotation.x = Math.sin(t * 0.7 + 1) * 0.015;
    }
  }

  /** Klatkowa aktualizacja efektów (dym z komina). */
  updateEffects(dt: number): void {
    this.smoke?.update(dt);
  }

  /**
   * Cienie roślinności: do siatek-cieni (warstwa SHADOW_LAYER, niewidoczna dla kamery) trafiają tylko instancje
   * w promieniu CFG.render.shadowProxyRadius od punktu – mapa cieni nie przelicza całego lasu.
   */
  updateShadowProxies(focus: THREE.Vector3): void {
    if (focus.distanceToSquared(this.shadowFocus) < CFG.render.shadowProxyStep ** 2) return;
    this.shadowFocus.copy(focus);
    const R2 = CFG.render.shadowProxyRadius ** 2;
    const tmp = new THREE.Matrix4();
    for (const set of this.shadowSets) {
      let n = 0;
      const N = set.src.count;
      for (let i = 0; i < N; i++) {
        const dx = set.pos[i * 2] - focus.x;
        const dz = set.pos[i * 2 + 1] - focus.z;
        if (dx * dx + dz * dz > R2) continue;
        set.src.getMatrixAt(i, tmp);
        set.proxy.setMatrixAt(n++, tmp);
      }
      set.proxy.count = n;
      set.proxy.instanceMatrix.needsUpdate = true;
      set.proxy.visible = n > 0;
      set.proxy.computeBoundingSphere();
    }
  }

  // =====================================================================
  // teren
  // =====================================================================
  private buildTerrain(): THREE.Mesh {
    const hm = this.heightmap;
    const nx = hm.nx;
    const nz = hm.nz;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const grassA = new THREE.Color(0x6f8a2e);
    const grassB = new THREE.Color(0xa3a340);
    const grassDry = new THREE.Color(0xb8a456);
    const forest = new THREE.Color(0x4a4a26);
    const needles = new THREE.Color(0x6a5230);
    const sand = new THREE.Color(0xb49a70);
    const mud = new THREE.Color(0x6a6048);
    const bed = new THREE.Color(0x8c8466);
    const deep = new THREE.Color(0x3c4a3a);
    const path = new THREE.Color(0xa88458);
    const pathEdge = new THREE.Color(0x8a7040);
    const rock = new THREE.Color(0x8c8678);
    const clearing = new THREE.Color(0x9aa244);
    const canopy = new THREE.Color(0x2f4222);
    const c = new THREE.Color();
    const W = CFG.world;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = hm.xs[i];
        const z = hm.zs[j];
        const h = hm.heights[k];
        pos[k * 3] = x;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = z;
        const r = lakeR(x, z);
        const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
        const n2 = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.7) * Math.sin(z * 1.1 - x * 0.4);
        if (r < 1) {
          const d = -h;
          c.copy(bed).lerp(sand, 1 - smoothstep(0.0, 0.5, d)).lerp(mud, smoothstep(0.6, 2.0, d) * 0.6).lerp(deep, smoothstep(1.8, 4.2, d));
          // jasne kamienie na dnie przy brzegu
          c.multiplyScalar(0.9 + 0.2 * n2);
        } else {
          const bd = boundsDistance(x, z);
          const forestW = smoothstep(-4, 12, bd) * (1 - clearingMask(x, z));
          c.copy(grassA).lerp(grassB, n).lerp(grassDry, smoothstep(0.55, 1, n2) * 0.45);
          c.lerp(forest, forestW * 0.75).lerp(needles, forestW * smoothstep(0.4, 0.9, n) * 0.4);
          c.lerp(clearing, clearingMask(x, z) * 0.5);
          c.lerp(sand, 1 - smoothstep(1.0, 1.035, r));
          // skalisty cypel
          const pd = Math.hypot(x - W.pointX, z - W.pointZ) / (W.pointRadius * 1.5);
          c.lerp(rock, (1 - smoothstep(0.3, 1, pd)) * 0.7);
          // ścieżka (udeptana ziemia) z ciemniejszym brzegiem
          const pm = x > -40 && x < 20 && z > 30 && z < 100 ? pathMask(x, z) : 0;
          if (pm > 0) c.lerp(pathEdge, smoothstep(0, 0.5, pm) * 0.6).lerp(path, smoothstep(0.35, 1, pm));
          // las poza obszarem gry: ciemne dno lasu / korony widziane z daleka
          const far = Math.max(smoothstep(20, 60, bd), smoothstep(8, 30, shoreDistance(x, z, r)) * smoothstep(0, 20, bd));
          c.lerp(canopy, far * 0.85);
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
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }

  // =====================================================================
  // pomost, łódka
  // =====================================================================
  private buildPier(): THREE.Mesh {
    const p = pierRect();
    const parts: THREE.BufferGeometry[] = [];
    const len = p.z1 - p.z0;
    const plankW = 0.2;
    const n = Math.floor(len / (plankW + 0.025));
    const rng = new Rng(77);
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(p.x1 - p.x0 + rng.range(-0.04, 0.12), 0.06, plankW);
      const tone = 0.82 + rng.next() * 0.3;
      const base = new THREE.Color(0x9a7650).multiplyScalar(tone);
      g.translate((p.x0 + p.x1) / 2 + rng.range(-0.04, 0.04), p.deck - 0.03, p.z0 + 0.12 + i * (plankW + 0.025));
      g.rotateY(0);
      parts.push(colorGeo(g, () => base));
    }
    for (const x of [p.x0 + 0.12, p.x1 - 0.12]) {
      const beam = new THREE.BoxGeometry(0.14, 0.2, len);
      beam.translate(x, p.deck - 0.16, (p.z0 + p.z1) / 2);
      parts.push(colorGeo(beam, 0x5e4630));
      for (let z = p.z0 + 0.15; z < p.z1 - 0.5; z += 2.4) {
        const bottom = terrainHeightAnalytic(x, z) - 0.3;
        const tall = z < p.z0 + 0.5 || Math.abs(z - (p.z0 + 7.35)) < 0.1;
        const top = tall ? p.deck + 0.55 : p.deck - 0.05;
        const h = top - bottom;
        const post = new THREE.CylinderGeometry(0.12, 0.13, h, 8);
        post.translate(x + (x < 0 ? -0.08 : 0.08), bottom + h / 2, z);
        parts.push(colorGeo(post, (y) => new THREE.Color(0x6a4e34).lerp(new THREE.Color(0x3a3a2a), clamp01((0.1 - y) * 2))));
        this.colliders.push({ kind: 'circle', x, z, r: 0.12 });
      }
    }
    // poprzeczki pod deskami
    for (let z = p.z0 + 0.4; z < p.z1; z += 1.2) {
      const t = new THREE.BoxGeometry(p.x1 - p.x0, 0.12, 0.12);
      t.translate((p.x0 + p.x1) / 2, p.deck - 0.12, z);
      parts.push(colorGeo(t, 0x5a4230));
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

  private buildBoat(): void {
    const p = pierRect();
    const W = CFG.world;
    this.boat = this.assets.create('boat');
    this.boatBase.set(p.x1 + W.boatOffsetX, 0, p.z0 + W.boatOffsetZ);
    this.boat.position.copy(this.boatBase);
    this.boat.rotation.order = 'YXZ';
    this.boat.rotation.y = Math.PI + W.boatYawDeg * DEG;
    this.group.add(this.boat);
  }

  // =====================================================================
  // chatka, płotek przy ścieżce
  // =====================================================================
  private buildCabin(): void {
    const c = cabinFrame();
    const W = CFG.world;
    this.cabin = this.assets.create('cabin');
    this.cabin.position.set(c.x, c.ground, c.z);
    this.cabin.rotation.y = c.yaw;
    this.group.add(this.cabin);
    // wnętrze przy drzwiach (widać je w intro i przez otwarte drzwi) + ciepłe światło lampy
    this.cabin.add(this.assets.create('cabinInterior'));
    const lampAt = this.cabin.getObjectByName('interior_light');
    if (lampAt) {
      const I = CFG.intro;
      this.lamp = new THREE.PointLight(I.lampColor, I.lampIntensity, I.lampDistance, 2);
      lampAt.add(this.lamp);
    }
    this.cabin.updateMatrixWorld(true);
    // kolizje: ściany (drzwi zamknięte – wejście tylko w intro), stos drewna, beczka
    this.colliders.push({ kind: 'box', x: c.x, z: c.z, hx: W.cabinWidth / 2 + 0.2, hz: W.cabinDepth / 2 + 0.2, angle: c.yaw });
    const wood = cabinToWorld(-W.cabinWidth / 2 - 0.55, -0.9);
    this.colliders.push({ kind: 'box', x: wood.x, z: wood.z, hx: 0.35, hz: 1.2, angle: c.yaw });
    const barrel = cabinToWorld(W.cabinWidth / 2 + 0.55, W.cabinDepth / 2 + 0.35);
    this.colliders.push({ kind: 'circle', x: barrel.x, z: barrel.z, r: 0.38 });
    const bench = cabinToWorld(W.cabinWidth * 0.24 + 0.05, W.cabinDepth / 2 + 0.42);
    this.colliders.push({ kind: 'box', x: bench.x, z: bench.z, hx: 0.8, hz: 0.25, angle: c.yaw });
    // dym z komina
    const chimney = this.cabin.getObjectByName('chimney_top');
    const cp = chimney ? chimney.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(c.x, c.ground + 6, c.z);
    this.smoke = new ChimneySmoke(cp);
    this.group.add(this.smoke.points);
  }

  /** Rustykalny płotek (słupki + dwie żerdzie) wzdłuż fragmentu ścieżki, po stronie spadku. */
  private buildFence(): void {
    const W = CFG.world;
    const pts = pathPolyline();
    const parts: THREE.BufferGeometry[] = [];
    const rng = new Rng(404);
    // punkty co ~2,2 m wzdłuż ścieżki, przesunięte w bok
    let acc = 0;
    const posts: THREE.Vector3[] = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const seg = Math.hypot(bx - ax, bz - az);
      const nxv = (bz - az) / seg;
      const nzv = -(bx - ax) / seg;
      for (let t = 0; t < seg; t += 0.25) {
        acc += 0.25;
        const s = acc;
        if (s < W.fenceStart || s > W.fenceEnd) continue;
        if (Math.abs((s - W.fenceStart) % 2.2) < 0.25) {
          const x = ax + ((bx - ax) * t) / seg + nxv * W.fenceOffset;
          const z = az + ((bz - az) * t) / seg + nzv * W.fenceOffset;
          posts.push(new THREE.Vector3(x, this.terrainAt(x, z), z));
        }
      }
    }
    const wood = (y: number) => new THREE.Color(0x7a5a3a).lerp(new THREE.Color(0x5a4028), clamp01(-y));
    for (const p of posts) {
      const g = new THREE.CylinderGeometry(0.05, 0.06, 1.05, 6);
      g.rotateZ(rng.range(-0.05, 0.05));
      g.translate(p.x, p.y + 0.45, p.z);
      parts.push(colorGeo(g, wood));
      this.colliders.push({ kind: 'circle', x: p.x, z: p.z, r: 0.12 });
    }
    for (let i = 1; i < posts.length; i++) {
      const a = posts[i - 1];
      const b = posts[i];
      for (const hh of [0.45, 0.82]) {
        const A = a.clone().setY(a.y + hh);
        const B = b.clone().setY(b.y + hh + rng.range(-0.04, 0.04));
        const len = A.distanceTo(B);
        const g = new THREE.CylinderGeometry(0.035, 0.035, len, 5);
        g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
        g.translate(A.x, A.y, A.z);
        parts.push(colorGeo(g, 0x8a6844));
      }
      // żerdzie blokują przejście
      const mid = a.clone().lerp(b, 0.5);
      this.colliders.push({ kind: 'box', x: mid.x, z: mid.z, hx: a.distanceTo(b) / 2, hz: 0.06, angle: -Math.atan2(b.z - a.z, b.x - a.x) });
    }
    if (!parts.length) return;
    const geo = mergeGeometries(parts, false)!;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'fence';
    this.group.add(m);
  }

  private buildFallenTree(): void {
    const W = CFG.world;
    const log = this.assets.create('fallenLog');
    const dx = W.logX1 - W.logX0;
    const dz = W.logZ1 - W.logZ0;
    const len = Math.hypot(dx, dz);
    const y0 = this.terrainAt(W.logX0, W.logZ0) + W.logRadius * 0.8;
    const y1 = CFG.water.level - W.logRadius * 0.35;
    log.scale.set(len / 16, 1, 1);
    log.position.set(W.logX0, y0, W.logZ0);
    log.rotation.set(0, Math.atan2(-dz, dx), -Math.atan2(y0 - y1, len));
    this.group.add(log);
    // kolizja części na lądzie
    for (let t = 0; t <= 1; t += 0.08) {
      const x = W.logX0 + dx * t;
      const z = W.logZ0 + dz * t;
      if (lakeDepth(x, z) > CFG.world.maxWadeDepth) break;
      this.colliders.push({ kind: 'circle', x, z, r: W.logRadius + 0.1 });
    }
  }

  // =====================================================================
  // instancje
  // =====================================================================
  /** InstancedMesh z modelu z rejestru (każda siatka modelu → osobny InstancedMesh, wspólne macierze). */
  private instanced(kind: AssetKind, list: Inst[], opts: { cast?: boolean; sway?: number; name?: string } = {}): THREE.InstancedMesh[] {
    if (!list.length) return [];
    const src = this.assets.create(kind);
    src.updateMatrixWorld(true);
    const out: THREE.InstancedMesh[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    src.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const baseMat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat = this.vegMaterial(baseMat, opts.sway ?? 0);
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        e.set(it.rotX ?? 0, it.rotY, it.rotZ ?? 0);
        q.setFromEuler(e);
        s.set(it.s, it.s * (it.sy ?? 1), it.s);
        p.set(it.x, it.y, it.z);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
        col.setScalar(it.tint ?? 1);
        im.setColorAt(i, col);
      });
      im.castShadow = false;
      im.receiveShadow = true;
      im.name = opts.name ?? kind;
      im.computeBoundingSphere();
      this.group.add(im);
      out.push(im);
      if (opts.cast ?? true) {
        const proxy = new THREE.InstancedMesh(geo, mat, list.length);
        proxy.layers.set(SHADOW_LAYER);
        proxy.castShadow = true;
        proxy.receiveShadow = false;
        proxy.count = 0;
        proxy.name = `${im.name}_shadow`;
        const pos = new Float32Array(list.length * 2);
        list.forEach((it, i) => {
          pos[i * 2] = it.x;
          pos[i * 2 + 1] = it.z;
        });
        this.group.add(proxy);
        this.shadowSets.push({ src: im, proxy, pos });
      }
    });
    return out;
  }

  /** Materiał roślinności: kopia bazowego + kołysanie na wietrze (instancje) + normalne bez odwracania. */
  private vegMaterial(base: THREE.MeshStandardMaterial, sway: number): THREE.MeshStandardMaterial {
    const m = base.clone();
    const doubleSided = m.side === THREE.DoubleSide;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWind = windUniforms.uWind;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
         #else
           vec2 ip = vec2(0.0);
         #endif
         float sw = sin(uTime * 1.1 + ip.x * 0.31 + ip.y * 0.17) + 0.45 * sin(uTime * 2.3 + ip.x * 0.8 + ip.y * 0.5);
         float hh = max(position.y, 0.0);
         transformed.x += sw * ${sway.toFixed(4)} * uWind * hh * hh;
         transformed.z += sw * ${(sway * 0.6).toFixed(4)} * uWind * hh * hh;`,
      );
      if (doubleSided) {
        // liście/igły: te same normalne po obu stronach (miękkie cieniowanie, bez czarnych spodów)
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
        );
      }
    };
    m.customProgramCacheKey = () => `veg-${sway}-${doubleSided}`;
    return m;
  }

  private key(x: number, z: number, cell: number): string {
    return `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  }

  /** Wolne miejsce (min. odstęp) – prosta siatka zajętości. */
  private free(x: number, z: number, r: number): boolean {
    const cell = 2;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    const n = Math.ceil(r / cell) + 1;
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const v = this.occ.get(`${cx + i},${cz + j}`);
        if (v === undefined) continue;
        const px = (cx + i + 0.5) * cell;
        const pz = (cz + j + 0.5) * cell;
        if (Math.hypot(px - x, pz - z) < r + v) return false;
      }
    return true;
  }

  private occupy(x: number, z: number, r: number): void {
    const k = this.key(x, z, 2);
    this.occ.set(k, Math.max(this.occ.get(k) ?? 0, r));
  }

  /** Czy punkt zasłania widok z drzwi chatki na ścieżkę i pomost (korytarz widokowy). */
  private inViewCorridor(x: number, z: number): number {
    const c = cabinFrame();
    const p = pierRect();
    const px = (p.x0 + p.x1) / 2;
    const pz = p.z0;
    // odcinek drzwi → koniec pomostu i dalej na jezioro
    const vx = px - c.x;
    const vz = pz - c.z;
    const L = Math.hypot(vx, vz);
    const t = ((x - c.x) * vx + (z - c.z) * vz) / (L * L);
    if (t < 0.05 || t > 1.1) return 0;
    const lat = Math.abs(((x - c.x) * vz - (z - c.z) * vx) / L);
    const half = 4 + t * 14;
    return 1 - smoothstep(half * 0.7, half, lat);
  }

  /** Wspólne wykluczenia dla drzew i dużych obiektów. */
  private blockedForTree(x: number, z: number, r: number): boolean {
    if (lakeR(x, z) < 1.03 + r * 0.02) return true;
    if (nearestOnPolyline(pathPolyline(), x, z).dist < 3.2 + r) return true;
    const c = cabinFrame();
    if (Math.hypot(x - c.x, z - c.z) < CFG.world.clearingRadius + 1.5 + r) return true;
    if (distToPier(x, z) < 9) return true;
    const W = CFG.world;
    if (Math.hypot(x - W.pointX, z - W.pointZ) < W.pointRadius * 1.2) return true;
    return false;
  }

  // =====================================================================
  // las
  // =====================================================================
  private buildTrees(): void {
    const W = CFG.world;
    const rng = this.rng;
    const near: Inst[] = [];
    const midCast: Inst[] = [];
    const midFar: Inst[] = [];
    const pines: Inst[] = [];
    const birches: Inst[] = [];
    const willows: Inst[] = [];
    const center = new THREE.Vector2(-8, 40);
    const addCollider = (x: number, z: number, r: number) => {
      if (boundsDistance(x, z) < 4) this.colliders.push({ kind: 'circle', x, z, r });
    };

    // wierzba przy brzegu zachodniej zatoczki, brzozy przy brzegu i skraju polany
    for (const [x, z] of W.willows) {
      const y = this.terrainAt(x, z);
      willows.push({ x, y: y - 0.1, z, rotY: rng.range(0, 6.28), s: rng.range(0.95, 1.1), tint: 1 });
      this.occupy(x, z, 4);
      addCollider(x, z, 0.6);
    }
    let tries = 0;
    while (birches.length < W.birchCount && tries++ < 5000) {
      const x = rng.range(-95, 95);
      const z = rng.range(-40, 110);
      const sd = shoreDistance(x, z);
      const bd = boundsDistance(x, z);
      if (sd < 3 || sd > 30 || bd < -12 || bd > 14) continue;
      if (this.blockedForTree(x, z, 0.5) || this.inViewCorridor(x, z) > 0.2 || !this.free(x, z, 3)) continue;
      birches.push({ x, y: this.terrainAt(x, z) - 0.1, z, rotY: rng.range(0, 6.28), s: rng.range(0.8, 1.15), sy: rng.range(0.9, 1.1), tint: rng.range(0.9, 1.08) });
      this.occupy(x, z, 2.5);
      addCollider(x, z, 0.25);
    }
    tries = 0;
    while (pines.length < W.pineCount && tries++ < 5000) {
      const x = rng.range(-110, 110);
      const z = rng.range(-60, 140);
      const bd = boundsDistance(x, z);
      if (bd < 2 || bd > 40) continue;
      if (this.blockedForTree(x, z, 1) || !this.free(x, z, 3.5)) continue;
      pines.push({ x, y: this.terrainAt(x, z) - 0.1, z, rotY: rng.range(0, 6.28), s: rng.range(0.9, 1.25), tint: rng.range(0.9, 1.1) });
      this.occupy(x, z, 3);
      addCollider(x, z, 0.35);
    }

    // świerki: gęsto poza obszarem gracza, rzadko w środku (młode przy ścieżce)
    tries = 0;
    let placed = 0;
    while (placed < W.spruceCount && tries++ < W.spruceCount * 40) {
      const x = rng.range(W.terrainFineMinX + 4, W.terrainFineMaxX - 4);
      const z = rng.range(W.terrainFineMinZ + 4, W.terrainFineMaxZ - 4);
      const bd = boundsDistance(x, z);
      const inside = bd < 0;
      const young = inside && rng.chance(0.55);
      const s = young ? rng.range(0.14, 0.32) : rng.range(0.55, 1.35);
      const r = young ? 0.8 : 1.6 * s + 0.8;
      if (this.blockedForTree(x, z, young ? 0 : r)) continue;
      // gęstość: w obszarze gracza mało, przy granicy gęstnieje
      const dens = inside ? lerp(0.06, 0.45, smoothstep(-14, 0, bd)) : 1;
      if (rng.next() > dens) continue;
      if (!young && this.inViewCorridor(x, z) > 0.05) continue;
      if (young && this.inViewCorridor(x, z) > 0.7 && rng.chance(0.7)) continue;
      if (!this.free(x, z, r)) continue;
      const y = this.terrainAt(x, z) - 0.15;
      const it: Inst = { x, y, z, rotY: rng.range(0, 6.28), s, sy: rng.range(0.9, 1.15), tint: rng.range(0.82, 1.12) };
      const dist = Math.hypot(x - center.x, z - center.y);
      if (dist < W.spruceNearRadius && (bd < 10 || young)) near.push(it);
      else if (dist < W.spruceNearRadius + 30) midCast.push(it);
      else midFar.push(it);
      this.occupy(x, z, r * 0.6);
      addCollider(x, z, young ? 0.15 : 0.3 * s + 0.1);
      placed++;
    }

    // daleki las na zboczach (poza gęstą siatką terenu)
    const far: Inst[] = [];
    tries = 0;
    while (far.length < W.farTreeCount && tries++ < W.farTreeCount * 30) {
      const x = rng.range(-700, 700);
      const z = rng.range(-750, 520);
      const inFine = x > W.terrainFineMinX + 2 && x < W.terrainFineMaxX - 2 && z > W.terrainFineMinZ + 2 && z < W.terrainFineMaxZ - 2;
      if (inFine) continue;
      if (lakeR(x, z) < 1.04) continue;
      const d = Math.hypot(x * 0.8, z + 150);
      if (rng.next() > lerp(1, 0.15, smoothstep(250, 650, d))) continue;
      const s = rng.range(0.9, 1.7) * lerp(1, 1.8, smoothstep(200, 600, d));
      far.push({ x, y: this.terrainAt(x, z) - 0.3, z, rotY: rng.range(0, 6.28), s, sy: rng.range(0.9, 1.3), tint: rng.range(0.75, 1.1) });
    }

    this.instanced('spruceNear', near, { cast: true, sway: 0.0009, name: 'spruce_near' });
    this.instanced('spruceMid', midCast, { cast: true, sway: 0.0009, name: 'spruce_mid_cast' });
    this.instanced('spruceMid', midFar, { cast: false, sway: 0.0009, name: 'spruce_mid' });
    this.instanced('farTree', far, { cast: false, name: 'far_trees' });
    this.instanced('pine', pines, { cast: true, sway: 0.0006, name: 'pines' });
    this.instanced('birch', birches, { cast: true, sway: 0.002, name: 'birches' });
    this.instanced('willow', willows, { cast: true, sway: 0.004, name: 'willow' });
    console.info(`[World] drzewa: bliskie ${near.length}, średnie ${midCast.length}+${midFar.length}, dalekie ${far.length}, sosny ${pines.length}, brzozy ${birches.length}`);
  }

  // =====================================================================
  // podszyt: krzaki, paprocie, pniaki
  // =====================================================================
  private buildUnderstory(): void {
    const W = CFG.world;
    const rng = this.rng;
    const bushes: Inst[] = [];
    const ferns: Inst[] = [];
    const stumps: Inst[] = [];
    let tries = 0;
    while (bushes.length < W.bushCount && tries++ < W.bushCount * 60) {
      const x = rng.range(W.terrainFineMinX + 5, W.terrainFineMaxX - 5);
      const z = rng.range(W.terrainFineMinZ + 5, W.terrainFineMaxZ - 5);
      const bd = boundsDistance(x, z);
      if (bd < -10 || bd > 16) continue;
      if (lakeR(x, z) < 1.02 || pathMask(x, z) > 0 || nearestOnPolyline(pathPolyline(), x, z).dist < 1.6) continue;
      if (Math.hypot(x - cabinFrame().x, z - cabinFrame().z) < 7) continue;
      if (distToPier(x, z) < 4 || this.inViewCorridor(x, z) > 0.9) continue;
      bushes.push({ x, y: this.terrainAt(x, z) - 0.05, z, rotY: rng.range(0, 6.28), s: rng.range(0.7, 1.5), sy: rng.range(0.75, 1.1), tint: rng.range(0.85, 1.12) });
    }
    tries = 0;
    while (ferns.length < W.fernCount && tries++ < W.fernCount * 60) {
      const x = rng.range(W.terrainFineMinX + 5, W.terrainFineMaxX - 5);
      const z = rng.range(W.terrainFineMinZ + 5, W.terrainFineMaxZ - 5);
      const bd = boundsDistance(x, z);
      if (bd < -6 || bd > 30) continue;
      if (lakeR(x, z) < 1.04 || nearestOnPolyline(pathPolyline(), x, z).dist < 1.3) continue;
      if (Math.hypot(x - cabinFrame().x, z - cabinFrame().z) < 6.5) continue;
      ferns.push({ x, y: this.terrainAt(x, z) - 0.03, z, rotY: rng.range(0, 6.28), s: rng.range(0.6, 1.2), tint: rng.range(0.85, 1.1) });
    }
    tries = 0;
    while (stumps.length < W.stumpCount && tries++ < 4000) {
      const x = rng.range(-100, 100);
      const z = rng.range(-50, 130);
      const bd = boundsDistance(x, z);
      if (bd < -8 || bd > 12) continue;
      if (this.blockedForTree(x, z, 0) || !this.free(x, z, 1)) continue;
      stumps.push({ x, y: this.terrainAt(x, z) - 0.05, z, rotY: rng.range(0, 6.28), s: rng.range(0.7, 1.2) });
      this.occupy(x, z, 0.8);
      if (bd < 2) this.colliders.push({ kind: 'circle', x, z, r: 0.4 });
    }
    this.instanced('bush', bushes, { cast: true, sway: 0.03, name: 'bushes' });
    this.instanced('fern', ferns, { cast: false, sway: 0.06, name: 'ferns' });
    this.instanced('stump', stumps, { cast: true, name: 'stumps' });
  }

  // =====================================================================
  // brzeg: trzciny, pałki, grążele
  // =====================================================================
  private buildReeds(): void {
    const W = CFG.world;
    const rng = this.rng;
    const reeds: Inst[] = [];
    const cattails: Inst[] = [];
    const lilies: Inst[] = [];
    let tries = 0;
    while (reeds.length < W.reedCount && tries++ < W.reedCount * 40) {
      const arc = W.reedArcs[rng.int(0, W.reedArcs.length - 1)];
      const th = (arc.angleDeg + rng.range(-1, 1) * arc.halfWidthDeg) * DEG;
      const rr = rng.range(0.8, 1.2);
      const x = W.lakeRx * Math.cos(th) * rr * 1.1;
      const z = W.lakeRz * Math.sin(th) * rr * 1.1;
      const mask = reedArcMask(lakeTheta(x, z));
      if (rng.next() > mask) continue;
      const d = lakeDepth(x, z);
      const sd = shoreDistance(x, z);
      if (d > 0.95 || sd > 1.8) continue;
      if (distToPier(x, z) < 2.5 || nearestOnPolyline(pathPolyline(), x, z).dist < 2) continue;
      const y = this.terrainAt(x, z);
      const k = rng.range(0.75, 1.25);
      reeds.push({ x, y, z, rotY: rng.range(0, 6.28), s: k, sy: rng.range(0.8, 1.2) * (d > 0.05 ? 1 : 0.85), tint: rng.range(0.85, 1.12) });
      if (reeds.length % 3 === 0) this.reedPoints.push({ x, z });
    }
    // kępka trzcin przy pomoście (od strony zachodniej) – jak na 08-brzeg-pomost
    const p = pierRect();
    for (let i = 0; i < 60; i++) {
      const x = p.x0 - rng.range(2.5, 9);
      const z = p.shoreZ + rng.range(-3.5, 1);
      const d = lakeDepth(x, z);
      if (d > 0.7) continue;
      reeds.push({ x, y: this.terrainAt(x, z), z, rotY: rng.range(0, 6.28), s: rng.range(0.7, 1.1), sy: rng.range(0.7, 1.05), tint: rng.range(0.9, 1.1) });
      if (i % 3 === 0) this.reedPoints.push({ x, z });
    }
    tries = 0;
    while (cattails.length < W.cattailCount && tries++ < W.cattailCount * 60) {
      const useArc = rng.chance(0.75);
      let x: number;
      let z: number;
      if (useArc) {
        const arc = W.reedArcs[rng.int(0, W.reedArcs.length - 1)];
        const th = (arc.angleDeg + rng.range(-1, 1) * arc.halfWidthDeg * 1.1) * DEG;
        const rr = rng.range(0.9, 1.15);
        x = W.lakeRx * Math.cos(th) * rr * 1.1;
        z = W.lakeRz * Math.sin(th) * rr * 1.1;
      } else {
        x = p.x0 - rng.range(1.5, 6);
        z = p.shoreZ + rng.range(-1, 2);
      }
      const d = lakeDepth(x, z);
      const sd = shoreDistance(x, z);
      if (d > 0.45 || sd > 1.2 || sd < -4) continue;
      if (distToPier(x, z) < 1.2) continue;
      cattails.push({ x, y: this.terrainAt(x, z), z, rotY: rng.range(0, 6.28), s: rng.range(0.8, 1.15), tint: rng.range(0.9, 1.1) });
    }
    tries = 0;
    while (lilies.length < W.lilyCount && tries++ < W.lilyCount * 80) {
      const nearPier = rng.chance(0.3);
      let x: number;
      let z: number;
      if (nearPier) {
        x = p.x0 - rng.range(0.5, 7);
        z = rng.range(p.z0 + 1, p.shoreZ - 1);
      } else {
        const arc = W.reedArcs[rng.int(0, W.reedArcs.length - 1)];
        const th = (arc.angleDeg + rng.range(-1, 1) * arc.halfWidthDeg) * DEG;
        const rr = rng.range(0.7, 0.95);
        x = W.lakeRx * Math.cos(th) * rr * 1.1;
        z = W.lakeRz * Math.sin(th) * rr * 1.1;
      }
      const d = lakeDepth(x, z);
      if (d < 0.35 || d > 1.8) continue;
      lilies.push({ x, y: CFG.water.level, z, rotY: rng.range(0, 6.28), s: rng.range(0.8, 1.4) });
    }
    this.instanced('reeds', reeds, { cast: true, sway: 0.03, name: 'reeds' });
    this.instanced('cattail', cattails, { cast: true, sway: 0.03, name: 'cattails' });
    this.instanced('lily', lilies, { cast: false, name: 'lilies' });
  }

  // =====================================================================
  // kamienie: brzeg, cypel, las
  // =====================================================================
  private buildRocks(): void {
    const W = CFG.world;
    const rng = this.rng;
    const rocks: Inst[] = [];
    // cypel: duże głazy na lądzie i w wodzie
    for (let i = 0; i < W.pointRockCount; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * W.pointRadius * 1.25;
      const x = W.pointX + Math.cos(a) * r;
      const z = W.pointZ + Math.sin(a) * r * 0.8;
      const d = lakeDepth(x, z);
      const k = rng.range(0.5, 1.5) * (d > 0.4 ? 0.9 : 1.15);
      const y = this.terrainAt(x, z) - k * 0.25;
      rocks.push({ x, y, z, rotY: rng.range(0, 6.28), s: k, sy: rng.range(0.55, 0.85), tint: rng.range(0.85, 1.1), rotX: rng.range(-0.2, 0.2), rotZ: rng.range(-0.2, 0.2) });
      if (d < W.maxWadeDepth && k > 0.6) this.colliders.push({ kind: 'circle', x, z, r: 0.75 * k });
    }
    // brzeg: kamienie w płytkiej wodzie i na skarpie (poza trzcinami i pomostem)
    let tries = 0;
    while (rocks.length < W.pointRockCount + W.rockCount && tries++ < 20000) {
      const x = rng.range(-110, 110);
      const z = rng.range(-120, 120);
      const sd = shoreDistance(x, z);
      const inWater = sd < 0;
      if (sd < -5 || sd > 60) continue;
      const shoreBand = sd > -4 && sd < 3;
      if (!shoreBand && rng.chance(0.75)) continue;
      if (reedArcMask(lakeTheta(x, z)) > 0.3 && shoreBand) continue;
      if (distToPier(x, z) < 2.5 || nearestOnPolyline(pathPolyline(), x, z).dist < 2.2) continue;
      if (Math.hypot(x - cabinFrame().x, z - cabinFrame().z) < 9) continue;
      if (this.inViewCorridor(x, z) > 0.8 && !shoreBand) continue;
      const k = shoreBand ? rng.range(0.25, 0.8) : rng.range(0.5, 1.6);
      const y = this.terrainAt(x, z) - k * (inWater ? 0.35 : 0.2);
      rocks.push({ x, y, z, rotY: rng.range(0, 6.28), s: k, sy: rng.range(0.5, 0.85), tint: rng.range(0.8, 1.1), rotX: rng.range(-0.15, 0.15), rotZ: rng.range(-0.15, 0.15) });
      if (!inWater && k > 0.55) this.colliders.push({ kind: 'circle', x, z, r: 0.7 * k });
      if (!inWater) this.occupy(x, z, k);
    }
    // kilka dużych głazów przy ścieżce (pierwszy plan key artu)
    const foot = porchFoot();
    for (const [dx, dz, k] of W.pathBoulders) {
      const x = foot.x + dx;
      const z = foot.z + dz;
      if (nearestOnPolyline(pathPolyline(), x, z).dist < 1.2 + k) continue;
      rocks.push({ x, y: this.terrainAt(x, z) - k * 0.2, z, rotY: rng.range(0, 6.28), s: k, sy: 0.7, tint: 1 });
      this.colliders.push({ kind: 'circle', x, z, r: 0.8 * k });
      this.occupy(x, z, k * 1.2);
    }
    this.instanced('rock', rocks, { cast: true, name: 'rocks' });
  }

  // =====================================================================
  // trawa
  // =====================================================================
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
      return colorGeo(g, (y) => new THREE.Color(0x5d7a26).lerp(new THREE.Color(0xc8bc62), clamp01(y / 0.45)));
    };
    for (let i = 0; i < 9; i++) tuft.push(blade((i / 9) * Math.PI * 2, (i % 3) - 1, 0.3 + (i % 4) * 0.07, 0.05 + (i % 2) * 0.05));
    const geo = mergeGeometries(tuft, false)!;
    geo.computeVertexNormals();
    const N = CFG.world.grassCount;
    const base = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const matG = this.vegMaterial(base, 0.12);
    const inst = new THREE.InstancedMesh(geo, matG, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    let tries = 0;
    const rng = this.rng;
    while (n < N && tries < N * 20) {
      tries++;
      const x = rng.range(-95, 95);
      const z = rng.range(-35, 105);
      const bd = boundsDistance(x, z);
      if (bd > 6) continue;
      const r = lakeR(x, z);
      if (r < 1.012) continue;
      if (pathMask(x, z) > 0.2) continue;
      if (distToPier(x, z) < 0.8) continue;
      if (porchHeight(x, z) > -Infinity) continue;
      const c = cabinFrame();
      if (Math.hypot(x - c.x, z - c.z) < 4.2) continue;
      p.set(x, this.heightmap.heightAt(x, z) - 0.02, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(0, Math.PI));
      const k = rng.range(0.7, 1.5);
      s.set(k, k * rng.range(0.7, 1.4), k);
      m.compose(p, q, s);
      inst.setMatrixAt(n, m);
      col.setScalar(rng.range(0.8, 1.15));
      inst.setColorAt(n, col);
      n++;
    }
    inst.count = n;
    inst.receiveShadow = true;
    inst.name = 'grass';
    this.group.add(inst);
  }
}
