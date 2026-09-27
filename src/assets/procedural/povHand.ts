import * as THREE from 'three';
import type { AssetFactory } from '../AssetRegistry';
import { group } from '../materials';
import { C, flat, merge, paint, solid } from './geo';

/**
 * Ręka widziana z oczu bohatera (intro): przedramię (podwinięty rękaw T-shirtu poza kadrem) + dłoń chwytająca.
 * Origin = łokieć, oś +Z = w stronę dłoni; punkt chwytu na z = 0,52 (skalowany do odległości celu).
 */
export class PovHandFactory implements AssetFactory {
  create(): THREE.Object3D {
    const skin = C(0xd49a74);
    const skinDark = C(0xb07a58);
    const parts: THREE.BufferGeometry[] = [];
    // przedramię
    const fore = new THREE.CylinderGeometry(0.034, 0.047, 0.42, 12, 4, false);
    fore.rotateX(Math.PI / 2);
    fore.translate(0, 0, 0.21);
    parts.push(paint(flat(fore), (p, n, out) => out.copy(skin).lerp(skinDark, 0.35 * Math.max(0, -n.y) + 0.15 * Math.max(0, n.x))));
    // rąbek rękawa (kremowy T-shirt) przy łokciu
    const cuff = new THREE.CylinderGeometry(0.056, 0.058, 0.07, 12);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(0, 0, 0.02);
    parts.push(solid(flat(cuff), C(0xe8dfcc)));
    // dłoń
    const palm = new THREE.BoxGeometry(0.085, 0.032, 0.095, 2, 1, 2);
    palm.translate(0, -0.004, 0.455);
    parts.push(solid(flat(palm), skin));
    // palce (zgięte, chwytają)
    for (let i = 0; i < 4; i++) {
      const x = -0.03 + i * 0.02;
      const len = [0.05, 0.056, 0.053, 0.044][i];
      const f1 = new THREE.CapsuleGeometry(0.0085, len * 0.55, 3, 6);
      f1.rotateX(Math.PI / 2);
      f1.translate(x, -0.004, 0.5 + len * 0.28);
      parts.push(solid(flat(f1), skin));
      const f2 = new THREE.CapsuleGeometry(0.008, len * 0.45, 3, 6);
      f2.rotateX(Math.PI / 2 + 1.1);
      f2.translate(x, -0.022, 0.535 + len * 0.3);
      parts.push(solid(flat(f2), skin));
    }
    // kciuk
    const th = new THREE.CapsuleGeometry(0.01, 0.045, 3, 6);
    th.rotateX(Math.PI / 2);
    th.rotateY(-0.6);
    th.translate(-0.05, 0.004, 0.46);
    parts.push(solid(flat(th), skin));
    const g = group('povHand');
    const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    m.name = 'povHand_mesh';
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 10;
    // skala: oś Z – punkt chwytu na 0,52 (DoorIntro skaluje do długości 0,42 → dopasowane w kodzie)
    m.scale.set(1, 1, 0.42 / 0.52);
    g.add(m);
    return g;
  }
}
