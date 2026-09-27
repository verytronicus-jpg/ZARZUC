import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { REQUIRED_PIVOTS } from '../src/assets/manifest';
import { CharacterFactory } from '../src/assets/procedural/character';
import { RodFactory, FloatFactory } from '../src/assets/procedural/tackle';
import { PIVOTS } from '../src/assets/AssetRegistry';

/** Modele proceduralne muszą mieć te same pivoty, których wymagamy od GLB (animacje, wędka, spławik). */
describe('modele proceduralne', () => {
  const cases: Array<[string, THREE.Object3D, string[]]> = [
    ['postać', new CharacterFactory().create(), REQUIRED_PIVOTS.character ?? []],
    ['wędka', new RodFactory().create(), REQUIRED_PIVOTS.rod ?? []],
    ['spławik', new FloatFactory().create(), REQUIRED_PIVOTS.float ?? []],
  ];
  for (const [name, obj, required] of cases) {
    it(`${name}: ma wszystkie wymagane pivoty`, () => {
      expect(required.length).toBeGreaterThan(0);
      for (const n of required) expect(obj.getObjectByName(n), n).toBeTruthy();
    });
  }

  it('postać: jedna siatka ze szkieletem, dłonie to kości, wagi skóry znormalizowane', () => {
    const root = new CharacterFactory().create();
    const skinned: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    });
    expect(skinned.length).toBe(1);
    expect((root.getObjectByName(PIVOTS.handR) as THREE.Bone).isBone).toBe(true);
    const sw = skinned[0].geometry.attributes.skinWeight;
    for (let i = 0; i < sw.count; i += 97) {
      const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      expect(s).toBeCloseTo(1, 4);
    }
    // wzrost z czapką ~1,9 m, stopy na ziemi
    const box = new THREE.Box3().setFromBufferAttribute(skinned[0].geometry.attributes.position as THREE.BufferAttribute);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.max.y).toBeGreaterThan(1.8);
    expect(box.max.y).toBeLessThan(2.05);
  });
});
