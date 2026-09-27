import * as THREE from 'three';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group, limb, mat, mesh } from '../materials';

/**
 * Postać z brył z hierarchią stawów (nazwy jak kości w Blenderze).
 * Origin = między stopami na ziemi, przód = +Z, prawa ręka po stronie -X.
 */
export class CharacterFactory implements AssetFactory {
  create(): THREE.Object3D {
    const jacket = mat(0x56633b, 0.9);
    const jacketDark = mat(0x464f30, 0.9);
    const pants = mat(0x39465a, 0.9);
    const boots = mat(0x3a2c22, 0.8);
    const skin = mat(0xd9a582, 0.7);
    const hat = mat(0x7f6236, 0.95);
    const vest = mat(0x7a6a4a, 0.9);

    const root = group('character');
    const hips = group(PIVOTS.hips, 0, 0.95, 0);
    root.add(hips);
    hips.add(mesh(new THREE.BoxGeometry(0.34, 0.18, 0.2), pants));

    // --- tułów ---
    const spine = group(PIVOTS.spine, 0, 0.06, 0);
    hips.add(spine);
    const chest = mesh(new THREE.CapsuleGeometry(0.19, 0.3, 4, 10), jacket);
    chest.scale.set(1.05, 1, 0.68);
    chest.position.y = 0.3;
    spine.add(chest);
    const vestM = mesh(new THREE.BoxGeometry(0.36, 0.3, 0.05), vest);
    vestM.position.set(0, 0.3, 0.12);
    spine.add(vestM);
    for (const sx of [-1, 1]) {
      const pocket = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), jacketDark);
      pocket.position.set(0.09 * sx, 0.24, 0.15);
      spine.add(pocket);
    }

    const neck = group(PIVOTS.neck, 0, 0.55, 0);
    spine.add(neck);
    neck.add(mesh(limb(0.05, 0.1), skin).translateY(0.1));
    const head = group(PIVOTS.head, 0, 0.13, 0);
    neck.add(head);
    const headM = mesh(new THREE.SphereGeometry(0.11, 14, 10), skin);
    headM.scale.set(0.95, 1.08, 1);
    head.add(headM);
    const nose = mesh(new THREE.ConeGeometry(0.02, 0.05, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.01, 0.11);
    head.add(nose);
    const brim = mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.02, 16), hat);
    brim.position.y = 0.06;
    head.add(brim);
    const crown = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 14), hat);
    crown.position.y = 0.12;
    head.add(crown);

    // --- ręce ---
    const makeArm = (side: 'L' | 'R') => {
      const sx = side === 'L' ? 1 : -1;
      const upper = group(side === 'L' ? PIVOTS.upperarmL : PIVOTS.upperarmR, 0.22 * sx, 0.47, 0);
      spine.add(upper);
      upper.add(mesh(limb(0.058, 0.31), jacket));
      const fore = group(side === 'L' ? PIVOTS.forearmL : PIVOTS.forearmR, 0, -0.3, 0);
      upper.add(fore);
      fore.add(mesh(limb(0.05, 0.27), jacket));
      const hand = group(side === 'L' ? PIVOTS.handL : PIVOTS.handR, 0, -0.29, 0);
      fore.add(hand);
      const handM = mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
      handM.scale.set(0.8, 1.1, 0.9);
      handM.position.y = -0.02;
      hand.add(handM);
      upper.rotation.z = 0.08 * sx;
    };
    makeArm('L');
    makeArm('R');

    // --- nogi ---
    const makeLeg = (side: 'L' | 'R') => {
      const sx = side === 'L' ? 1 : -1;
      const thigh = group(side === 'L' ? PIVOTS.thighL : PIVOTS.thighR, 0.1 * sx, -0.03, 0);
      hips.add(thigh);
      thigh.add(mesh(limb(0.075, 0.46), pants));
      const shin = group(side === 'L' ? PIVOTS.shinL : PIVOTS.shinR, 0, -0.45, 0);
      thigh.add(shin);
      shin.add(mesh(limb(0.062, 0.44), pants));
      const foot = group(side === 'L' ? PIVOTS.footL : PIVOTS.footR, 0, -0.43, 0);
      shin.add(foot);
      const boot = mesh(new THREE.BoxGeometry(0.11, 0.1, 0.26), boots);
      boot.position.set(0, 0.01, 0.05);
      foot.add(boot);
    };
    makeLeg('L');
    makeLeg('R');

    return root;
  }
}
