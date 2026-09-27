import * as THREE from 'three';
import { CFG } from '../config';
import type { AssetKind, AssetRegistry } from '../assets/AssetRegistry';
import { SHADOW_LAYER, REFLECT_LAYER } from '../render/layers';
import { triplanarDetail } from '../render/materialsFx';
import { windUniforms } from './wind';

/** Instancja do rozmieszczenia. */
export interface Inst {
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

interface InstanceOpts {
  cast?: boolean;
  sway?: number;
  name?: string;
  reflect?: boolean;
  detail?: { tex: 'rock' | 'bark' | 'wood'; scale: number; strength: number };
  /** lżejszy model do cieni (np. średni świerk zamiast bliskiego) */
  shadowKind?: AssetKind;
}

/** Materiał roślinności: kopia bazowego + kołysanie na wietrze (instancje) + normalne bez odwracania. */
function vegMaterial(base: THREE.MeshStandardMaterial, sway: number): THREE.MeshStandardMaterial {
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
    if (m.map && m.alphaTest > 0) {
      // karty liści: w dalszych mipmapach alfa się uśrednia – podbijamy ją, żeby korony nie „łysiały” z odległością
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        `{
           vec2 fdx = dFdx(vMapUv * vec2(1024.0, 512.0));
           vec2 fdy = dFdy(vMapUv * vec2(1024.0, 512.0));
           float mip = 0.5 * log2(max(max(dot(fdx, fdx), dot(fdy, fdy)), 1e-6));
           diffuseColor.a *= 1.0 + max(mip, 0.0) * 0.3;
         }
         #include <alphatest_fragment>`,
      );
    }
    if (doubleSided) {
      // liście/igły: te same normalne po obu stronach (miękkie cieniowanie, bez czarnych spodów)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
      );
    }
  };
  m.customProgramCacheKey = () => `veg-${sway}-${doubleSided}-${m.map ? 'map' : ''}`;
  return m;
}

/** Pozycje XZ instancji (do wyboru bliskich gracza). */
function positionsXZ(list: Inst[]): Float32Array {
  const pos = new Float32Array(list.length * 2);
  list.forEach((it, i) => {
    pos[i * 2] = it.x;
    pos[i * 2 + 1] = it.z;
  });
  return pos;
}

/**
 * Roślinność i kamienie jako InstancedMesh (jeden draw call na siatkę modelu) + to, co zależy od położenia
 * gracza: proxy cieni (tylko instancje w pobliżu trafiają do mapy cieni) i LOD bliskich drzew.
 */
export class VegetationInstancer {
  /** cienie: osobne siatki widoczne wyłącznie dla kamery cienia, wypełniane instancjami blisko gracza */
  private shadowSets: Array<{ mats: Float32Array; proxy: THREE.InstancedMesh; pos: Float32Array }> = [];
  /** LOD: pełny model tylko blisko gracza, dalej lżejszy (te same instancje) */
  private lodSets: Array<{ full: THREE.InstancedMesh; lod: THREE.InstancedMesh; mats: Float32Array; cols: Float32Array; pos: Float32Array }> = [];
  private focus = new THREE.Vector3(1e9, 0, 1e9);

  constructor(
    private assets: AssetRegistry,
    private group: THREE.Group,
  ) {}

  /** InstancedMesh z modelu z rejestru (każda siatka modelu → osobny InstancedMesh, wspólne macierze). */
  add(kind: AssetKind, list: Inst[], opts: InstanceOpts = {}): THREE.InstancedMesh[] {
    if (!list.length) return [];
    const src = this.assets.create(kind);
    src.updateMatrixWorld(true);
    let shadowGeo: THREE.BufferGeometry | null = null;
    if (opts.shadowKind) {
      const sh = this.assets.create(opts.shadowKind);
      sh.updateMatrixWorld(true);
      sh.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh && !shadowGeo) shadowGeo = mm.geometry.clone().applyMatrix4(mm.matrixWorld);
      });
    }
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
      const mat = vegMaterial(baseMat, opts.sway ?? 0);
      if (opts.detail) triplanarDetail(mat, opts.detail.tex, opts.detail.scale, opts.detail.strength, false);
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
      if (opts.reflect ?? true) im.layers.enable(REFLECT_LAYER);
      this.group.add(im);
      out.push(im);
      if (opts.cast ?? true) {
        const proxy = new THREE.InstancedMesh(shadowGeo ?? geo, mat, list.length);
        proxy.layers.set(SHADOW_LAYER);
        proxy.castShadow = true;
        proxy.receiveShadow = false;
        proxy.count = 0;
        proxy.name = `${im.name}_shadow`;
        this.group.add(proxy);
        this.shadowSets.push({ mats: new Float32Array(im.instanceMatrix.array), proxy, pos: positionsXZ(list) });
      }
    });
    return out;
  }

  /** Para LOD: te same instancje w pełnym i lżejszym modelu; podział wg odległości w update(). */
  lodPair(full: THREE.InstancedMesh, lod: THREE.InstancedMesh, list: Inst[]): void {
    for (const im of [full, lod]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    }
    this.lodSets.push({
      full,
      lod,
      mats: new Float32Array(full.instanceMatrix.array),
      cols: new Float32Array(full.instanceColor!.array),
      pos: positionsXZ(list),
    });
    lod.count = 0;
    lod.visible = false;
  }

  /** Wymusza przeliczenie przy następnym update() (np. po zmianie presetu jakości). */
  invalidate(): void {
    this.focus.set(1e9, 0, 1e9);
  }

  /**
   * Cienie roślinności i LOD drzew wokół punktu (gracza). Przeliczane dopiero po przejściu kilku metrów
   * (CFG.render.shadowProxyStep) – mapa cieni nie przelicza całego lasu, a GPU nie rysuje pełnych drzew w oddali.
   */
  update(focus: THREE.Vector3): void {
    if (focus.distanceToSquared(this.focus) < CFG.render.shadowProxyStep ** 2) return;
    this.focus.copy(focus);
    const Q = CFG.quality[CFG.quality.current];
    const R2 = Q.shadowProxyRadius ** 2;
    for (const set of this.shadowSets) {
      let n = 0;
      const N = set.pos.length / 2;
      const dst = set.proxy.instanceMatrix.array as Float32Array;
      for (let i = 0; i < N; i++) {
        const dx = set.pos[i * 2] - focus.x;
        const dz = set.pos[i * 2 + 1] - focus.z;
        if (dx * dx + dz * dz > R2) continue;
        dst.set(set.mats.subarray(i * 16, i * 16 + 16), n * 16);
        n++;
      }
      set.proxy.count = n;
      set.proxy.instanceMatrix.needsUpdate = true;
      set.proxy.visible = n > 0;
      set.proxy.computeBoundingSphere();
    }
    const L2 = Q.treeLodRadius ** 2;
    for (const set of this.lodSets) {
      let nf = 0;
      let nl = 0;
      const N = set.pos.length / 2;
      const fm = set.full.instanceMatrix.array as Float32Array;
      const lm = set.lod.instanceMatrix.array as Float32Array;
      const fc = set.full.instanceColor!.array as Float32Array;
      const lc = set.lod.instanceColor!.array as Float32Array;
      for (let i = 0; i < N; i++) {
        const dx = set.pos[i * 2] - focus.x;
        const dz = set.pos[i * 2 + 1] - focus.z;
        const m = set.mats.subarray(i * 16, i * 16 + 16);
        const c = set.cols.subarray(i * 3, i * 3 + 3);
        if (dx * dx + dz * dz <= L2) {
          fm.set(m, nf * 16);
          fc.set(c, nf * 3);
          nf++;
        } else {
          lm.set(m, nl * 16);
          lc.set(c, nl * 3);
          nl++;
        }
      }
      for (const [im, n] of [
        [set.full, nf],
        [set.lod, nl],
      ] as const) {
        im.count = n;
        im.visible = n > 0;
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor!.needsUpdate = true;
        im.computeBoundingSphere();
      }
    }
  }
}
