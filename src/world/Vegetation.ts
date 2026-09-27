import * as THREE from 'three';
import { CFG } from '../config';
import type { Rng } from '../core/Rng';
import { lerp, smoothstep, DEG } from '../core/math';
import type { Heightmap } from './Heightmap';
import type { Collider } from '../player/collision';
import { REFLECT_LAYER } from '../render/layers';
import type { Inst, VegetationInstancer } from './VegetationInstancer';
import {
  lakeR,
  lakeDepth,
  lakeTheta,
  reedArcMask,
  pierRect,
  distToPier,
  cabinFrame,
  pathMask,
  pathPolyline,
  nearestOnPolyline,
  boundsDistance,
  shoreDistance,
  porchFoot,
} from './terrainMath';

/**
 * Rozmieszczenie roślinności i kamieni: trzciny, pałki, grążele, głazy (brzeg, cypel, ścieżka), las
 * (świerki w dwóch poziomach szczegółów, sosny, brzozy, wierzba, daleki las) i podszyt (krzaki, paprocie, pniaki).
 * Wszystko z jednego ziarna – kolejność losowań decyduje o wyglądzie świata, więc plant() woła etapy zawsze
 * w tej samej kolejności. Przy okazji dopisuje kolizje (drzewa, głazy, pniaki) i punkty trzcin dla łowisk.
 */
export class Vegetation {
  /** siatka zajętości dla drzew i dużych obiektów (min. odstępy) */
  private occ = new Map<string, number>();

  constructor(
    private rng: Rng,
    private heightmap: Heightmap,
    private instancer: VegetationInstancer,
    private colliders: Collider[],
    private reedPoints: Array<{ x: number; z: number }>,
  ) {}

  plant(): void {
    this.reeds();
    this.rocks();
    this.trees();
    this.understory();
  }

  private terrainAt(x: number, z: number): number {
    return this.heightmap.heightAt(x, z);
  }

  // ---------- miejsce na obiekty ----------
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
  // brzeg: trzciny, pałki, grążele
  // =====================================================================
  private reeds(): void {
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
      lilies.push({ x, y: CFG.water.level + 0.03, z, rotY: rng.range(0, 6.28), s: rng.range(0.8, 1.4) });
    }
    this.instancer.add('reeds', reeds, { cast: true, sway: 0.03, name: 'reeds' });
    this.instancer.add('cattail', cattails, { cast: true, sway: 0.03, name: 'cattails' });
    this.instancer.add('lily', lilies, { cast: false, name: 'lilies', reflect: false });
  }

  // =====================================================================
  // kamienie: brzeg, cypel, las
  // =====================================================================
  private rocks(): void {
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
    this.instancer.add('rock', rocks, { cast: true, name: 'rocks', detail: { tex: 'rock', scale: 0.45, strength: 0.55 } });
  }

  // =====================================================================
  // las
  // =====================================================================
  private trees(): void {
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
      // gęsto na zboczach nad jeziorem, rzadziej w oddali (mgła i tak je wtapia)
      if (rng.next() > lerp(1, 0.08, smoothstep(180, 620, d))) continue;
      const s = rng.range(0.9, 1.7) * lerp(1, 1.8, smoothstep(200, 600, d));
      far.push({ x, y: this.terrainAt(x, z) - 0.3, z, rotY: rng.range(0, 6.28), s, sy: rng.range(0.9, 1.3), tint: rng.range(0.75, 1.1) });
    }

    const inst = this.instancer;
    const [nearFull] = inst.add('spruceNear', near, { cast: true, sway: 0.0009, name: 'spruce_near', reflect: false, shadowKind: 'spruceMid' });
    const [nearLod] = inst.add('spruceMid', near, { cast: false, sway: 0.0009, name: 'spruce_near_lod', reflect: false });
    if (nearFull && nearLod) inst.lodPair(nearFull, nearLod, near);
    // w odbiciu wystarczy uproszczony świerk (mniej trójkątów w drugim przebiegu)
    for (const im of inst.add('spruceMid', near, { cast: false, name: 'spruce_near_reflect' })) im.layers.set(REFLECT_LAYER);
    inst.add('spruceMid', midCast, { cast: true, sway: 0.0009, name: 'spruce_mid_cast' });
    inst.add('spruceMid', midFar, { cast: false, sway: 0.0009, name: 'spruce_mid' });
    inst.add('farTree', far, { cast: false, name: 'far_trees' });
    inst.add('pine', pines, { cast: true, sway: 0.0006, name: 'pines' });
    inst.add('birch', birches, { cast: true, sway: 0.002, name: 'birches' });
    inst.add('willow', willows, { cast: true, sway: 0.004, name: 'willow' });
    console.info(`[World] drzewa: bliskie ${near.length}, średnie ${midCast.length}+${midFar.length}, dalekie ${far.length}, sosny ${pines.length}, brzozy ${birches.length}`);
  }

  // =====================================================================
  // podszyt: krzaki, paprocie, pniaki
  // =====================================================================
  private understory(): void {
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
    this.instancer.add('bush', bushes, { cast: true, sway: 0.03, name: 'bushes', reflect: false });
    this.instancer.add('fern', ferns, { cast: false, sway: 0.06, name: 'ferns', reflect: false });
    this.instancer.add('stump', stumps, { cast: true, name: 'stumps', reflect: false, detail: { tex: 'bark', scale: 1.4, strength: 0.4 } });
  }
}
