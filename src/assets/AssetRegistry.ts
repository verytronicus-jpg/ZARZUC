import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { SpeciesId } from '../config';

/**
 * AssetRegistry – każdy model powstaje przez fabrykę z jednym interfejsem.
 * Dziś fabryki są proceduralne; później wystarczy `registry.loadGLB('character', 'models/character.glb')`
 * i reszta gry nie zauważy różnicy – pod warunkiem, że GLB zawiera pivoty o nazwach z PIVOTS.
 */
export type AssetKind =
  | 'character'
  | 'rod'
  | 'float'
  | 'fish'
  | 'wormBox'
  | 'worm'
  | 'hook'
  | 'cabin'
  | 'cabinInterior'
  | 'povHand'
  | 'boat'
  | 'spruceNear'
  | 'spruceMid'
  | 'farTree'
  | 'pine'
  | 'birch'
  | 'willow'
  | 'bush'
  | 'fern'
  | 'reeds'
  | 'cattail'
  | 'lily'
  | 'rock'
  | 'stump'
  | 'fallenLog';

export interface AssetOptions {
  species?: SpeciesId;
  /** długość ryby [m] */
  lengthM?: number;
}

export interface AssetFactory {
  create(opts?: AssetOptions): THREE.Object3D;
}

/** Nazwy kości/pivotów – takie same jak docelowo w Blenderze. */
export const PIVOTS = {
  // postać
  hips: 'hips',
  spine: 'spine',
  neck: 'neck',
  head: 'head',
  upperarmL: 'upperarm_L',
  forearmL: 'forearm_L',
  handL: 'hand_L',
  upperarmR: 'upperarm_R',
  forearmR: 'forearm_R',
  handR: 'hand_R',
  thighL: 'thigh_L',
  shinL: 'shin_L',
  footL: 'foot_L',
  thighR: 'thigh_R',
  shinR: 'shin_R',
  footR: 'foot_R',
  // wędka
  rodTip: 'rod_tip',
  reel: 'reel',
  reelHandle: 'reel_handle',
  rodSegment: (i: number) => `rod_seg_${i}`,
  // spławik / ryba
  floatTop: 'float_top',
  mouth: 'mouth',
  // chatka
  doorFront: 'door_front',
  doorLatch: 'door_latch',
  chimneyTop: 'chimney_top',
  lantern: 'lantern',
} as const;

export function pivot(root: THREE.Object3D, name: string): THREE.Object3D {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`[AssetRegistry] Brak pivota "${name}" w modelu "${root.name}"`);
  return o;
}

class GltfFactory implements AssetFactory {
  constructor(
    private scene: THREE.Object3D,
    private scale: number,
  ) {}
  create(opts?: AssetOptions): THREE.Object3D {
    const o = SkeletonUtils.clone(this.scene);
    o.scale.multiplyScalar(this.scale * (opts?.lengthM ?? 1));
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return o;
  }
}

/** Fabryka ryb: model GLB dla wybranych gatunków, reszta z fabryki zapasowej. */
class SpeciesSwitch implements AssetFactory {
  readonly bySpecies = new Map<SpeciesId, AssetFactory>();
  constructor(private fallback: AssetFactory | undefined) {}
  create(opts?: AssetOptions): THREE.Object3D {
    const f = (opts?.species && this.bySpecies.get(opts.species)) || this.fallback;
    if (!f) throw new Error('[AssetRegistry] Brak modelu ryby');
    return f.create(opts);
  }
}

export class AssetRegistry {
  private factories = new Map<AssetKind, AssetFactory>();

  register(kind: AssetKind, factory: AssetFactory): void {
    this.factories.set(kind, factory);
  }

  create(kind: AssetKind, opts?: AssetOptions): THREE.Object3D {
    const f = this.factories.get(kind);
    if (!f) throw new Error(`[AssetRegistry] Brak fabryki dla "${kind}"`);
    const o = f.create(opts);
    if (!o.name) o.name = kind;
    return o;
  }

  /**
   * Podmiana fabryki na model GLB (np. wyeksportowany z Blendera). Zwraca false, gdy w modelu brakuje wymaganych
   * pivotów – wtedy zostaje dotychczasowa fabryka. Dla ryb `species` podmienia tylko jeden gatunek.
   */
  async loadGLB(kind: AssetKind, url: string, scale = 1, opts: { species?: SpeciesId; required?: string[] } = {}): Promise<boolean> {
    const gltf = await new GLTFLoader().loadAsync(url);
    const missing = (opts.required ?? []).filter((n) => !gltf.scene.getObjectByName(n));
    if (missing.length) {
      console.warn(`[AssetRegistry] ${url}: brak pivotów ${missing.join(', ')} – zostaje model proceduralny`);
      return false;
    }
    const glb = new GltfFactory(gltf.scene, scale);
    if (opts.species) {
      const fallback = this.factories.get(kind);
      const prev = fallback instanceof SpeciesSwitch ? fallback : new SpeciesSwitch(fallback);
      prev.bySpecies.set(opts.species, glb);
      this.register(kind, prev);
    } else this.register(kind, glb);
    return true;
  }
}
