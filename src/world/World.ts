import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from '../config';
import { Rng } from '../core/Rng';
import { clamp01, smoothstep, DEG } from '../core/math';
import { Heightmap } from './Heightmap';
import { Water } from './Water';
import { waterHeight, waterHeightFast } from './waves';
import {
  lakeR,
  lakeDepth,
  pierRect,
  distToPier,
  terrainHeightAnalytic,
  cabinFrame,
  cabinToWorld,
  porchHeight,
  pathMask,
  pathPolyline,
  structureDistance,
  boundsDistance,
} from './terrainMath';
import type { Collider } from '../player/collision';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { RenderContext } from '../render/RenderContext';
import { flat, paint, solid } from '../assets/procedural/geo';
import { ChimneySmoke } from './ChimneySmoke';
import { GrassField } from './GrassField';
import { windUniforms } from './wind';
import { buildTerrainMesh } from './TerrainMesh';
import { Vegetation } from './Vegetation';
import { VegetationInstancer } from './VegetationInstancer';
import { cabinLayout } from '../assets/procedural/cabin';
import { reflectable } from '../render/layers';
import { triplanarDetail } from '../render/materialsFx';

/** Kolory wierzchołków części konstrukcji (stały kolor albo zależny od wysokości). */
function colored(g: THREE.BufferGeometry, color: number | ((y: number) => THREE.Color)): THREE.BufferGeometry {
  const f = flat(g);
  return typeof color === 'number' ? solid(f, color) : paint(f, (p, _n, out) => out.copy(color(p.y)));
}

/**
 * Świat „Chatka nad jeziorem”: teren (heightmapa o zmiennym kroku), jezioro z mapą głębokości i przedłużeniem
 * na północ, pomost z łódką, chatka na polanie, ścieżka z płotkiem, zwalone drzewo, roślinność i kamienie
 * (Vegetation), trawa wokół gracza. Tu są też zapytania o świat dla gracza, łowienia i kamery.
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
  grass!: GrassField;
  grassDirty = false;
  smoke!: ChimneySmoke;
  time = 0;
  /** układ chatki (stały; liczony raz – kamera pyta o kolizję co klatkę) */
  private cabinL: ReturnType<typeof cabinLayout> | null = null;
  private boatBase = new THREE.Vector3();
  private instancer: VegetationInstancer;

  constructor(
    ctx: RenderContext,
    private assets: AssetRegistry,
    rng: Rng,
  ) {
    this.heightmap = new Heightmap();
    this.water = new Water(ctx.sunDir, ctx.sun.color, ctx.skyZenith, ctx.skyHorizon);
    this.instancer = new VegetationInstancer(assets, this.group);
    this.group.name = 'world';
    this.group.add(buildTerrainMesh(this.heightmap));
    this.group.add(this.water.mesh);
    this.group.add(this.buildPier());
    this.buildBoat();
    this.buildCabin();
    this.buildFence();
    this.buildFallenTree();
    new Vegetation(rng, this.heightmap, this.instancer, this.colliders, this.reedPoints).plant();
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

  /** Przybliżona wysokość wody (wizualia – np. żyłka na tafli). */
  waterYFast(x: number, z: number): number {
    return waterHeightFast(x, z, this.time);
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

  /** Odległość do struktury dla ryb: pomost, zwalone drzewo, kamienie cypla. */
  structureDistance(x: number, z: number): number {
    return structureDistance(x, z);
  }

  /** Czy punkt (np. kamery) jest wewnątrz bryły chatki (ściany, okap, dach) – ramię kamery się skraca. */
  cameraBlocked(x: number, y: number, z: number, pad = 0.25): boolean {
    const L = (this.cabinL ??= cabinLayout());
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

  /** Preset jakości: gęstość trawy i zasięg cieni roślinności (odświeżenie przy następnej klatce). */
  applyQuality(): void {
    this.instancer.invalidate();
    this.grassDirty = true;
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

  /** Cienie i LOD roślinności wokół gracza (przeliczane co kilka metrów ruchu). */
  updateVegetation(focus: THREE.Vector3): void {
    this.instancer.update(focus);
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
      parts.push(colored(g, () => base));
    }
    for (const x of [p.x0 + 0.12, p.x1 - 0.12]) {
      const beam = new THREE.BoxGeometry(0.14, 0.2, len);
      beam.translate(x, p.deck - 0.16, (p.z0 + p.z1) / 2);
      parts.push(colored(beam, 0x5e4630));
      for (let z = p.z0 + 0.15; z < p.z1 - 0.5; z += 2.4) {
        const bottom = terrainHeightAnalytic(x, z) - 0.3;
        const tall = z < p.z0 + 0.5 || Math.abs(z - (p.z0 + 7.35)) < 0.1;
        const top = tall ? p.deck + 0.55 : p.deck - 0.05;
        const h = top - bottom;
        const post = new THREE.CylinderGeometry(0.12, 0.13, h, 8);
        post.translate(x + (x < 0 ? -0.08 : 0.08), bottom + h / 2, z);
        parts.push(colored(post, (y) => new THREE.Color(0x6a4e34).lerp(new THREE.Color(0x3a3a2a), clamp01((0.1 - y) * 2))));
        this.colliders.push({ kind: 'circle', x, z, r: 0.12 });
      }
    }
    // poprzeczki pod deskami
    for (let z = p.z0 + 0.4; z < p.z1; z += 1.2) {
      const t = new THREE.BoxGeometry(p.x1 - p.x0, 0.12, 0.12);
      t.translate((p.x0 + p.x1) / 2, p.deck - 0.12, z);
      parts.push(colored(t, 0x5a4230));
    }
    const geo = mergeGeometries(parts, false)!;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, triplanarDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'wood', 1.1, 0.55));
    reflectable(m);
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
    reflectable(this.boat);
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
    reflectable(this.cabin);
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
      parts.push(colored(g, wood));
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
        parts.push(colored(g, 0x8a6844));
      }
      // żerdzie blokują przejście
      const mid = a.clone().lerp(b, 0.5);
      this.colliders.push({ kind: 'box', x: mid.x, z: mid.z, hx: a.distanceTo(b) / 2, hz: 0.06, angle: -Math.atan2(b.z - a.z, b.x - a.x) });
    }
    if (!parts.length) return;
    const geo = mergeGeometries(parts, false)!;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, triplanarDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 'wood', 1.6, 0.5));
    reflectable(m);
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
    reflectable(log);
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
  // trawa (kępki źdźbeł na wietrze, rysowane wokół gracza)
  // =====================================================================
  private buildGrass(): void {
    const G = CFG.grass;
    this.grass = new GrassField((rng) => {
      const out: Array<[number, number, number]> = [];
      const c = cabinFrame();
      const step = 1 / Math.sqrt(G.clumpsPerM2);
      for (let z = -40; z < 108; z += step) {
        for (let x = -96; x < 96; x += step) {
          const px = x + rng.range(-0.5, 0.5) * step;
          const pz = z + rng.range(-0.5, 0.5) * step;
          const bd = boundsDistance(px, pz);
          if (bd > 4) continue;
          const r = lakeR(px, pz);
          if (r < 1.01) continue;
          // mniej trawy w lesie i na krawędzi ścieżki, brak na ścieżce, ganku, pomoście
          if (bd > -6 && rng.next() < smoothstep(-6, 4, bd) * 0.8) continue;
          if (pathMask(px, pz) > 0.25) continue;
          if (distToPier(px, pz) < 0.6) continue;
          if (porchHeight(px, pz) > -Infinity) continue;
          if (Math.hypot(px - c.x, pz - c.z) < 4.3) continue;
          out.push([px, this.heightmap.heightAt(px, pz) - 0.03, pz]);
        }
      }
      return out;
    }, 777);
    this.group.add(this.grass.mesh);
  }

  /** Trawa wokół gracza (wywołać co klatkę renderu). */
  updateGrass(player: THREE.Vector3, force = false): void {
    const Q = CFG.quality[CFG.quality.current];
    this.grass.update(player, Q.grassDensity, Q.grassRadius, force);
  }
}
