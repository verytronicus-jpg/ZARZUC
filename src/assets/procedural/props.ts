import * as THREE from 'three';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group, mat, mesh } from '../materials';

/** Stojak na wędki przy ścianie garażu + półka z pudełkiem robaków. Front = +Z. */
export class RodRackFactory implements AssetFactory {
  create(): THREE.Object3D {
    const wood = mat(0x7a5634, 0.9);
    const root = group('rodRack');
    for (const sx of [-1, 1]) {
      const post = mesh(new THREE.BoxGeometry(0.07, 1.6, 0.07), wood);
      post.position.set(0.45 * sx, 0.8, 0);
      root.add(post);
    }
    for (const y of [0.55, 1.3]) {
      const bar = mesh(new THREE.BoxGeometry(1.0, 0.06, 0.08), wood);
      bar.position.set(0, y, 0.02);
      root.add(bar);
      for (let i = 0; i < 4; i++) {
        const peg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), wood);
        peg.rotation.x = Math.PI / 2;
        peg.position.set(-0.33 + i * 0.22, y, 0.1);
        root.add(peg);
      }
    }
    const shelf = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), wood);
    shelf.position.set(0.8, 0.95, 0.1);
    root.add(shelf);
    const bracket = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.25), wood);
    bracket.position.set(0.8, 0.84, 0.08);
    root.add(bracket);
    // wędka stoi pionowo na stojaku: slot = chwyt, wędka w górę
    root.add(group(PIVOTS.rackSlot, -0.11, 0.62, 0.16));
    root.add(group(PIVOTS.shelfSlot, 0.8, 0.97, 0.12));
    return root;
  }
}

/** Dom z garażem. Front (brama garażu) = +Z. Origin = środek podstawy. */
export class HouseFactory implements AssetFactory {
  create(): THREE.Object3D {
    const wall = mat(0xd8cdb7, 0.95);
    const roofM = mat(0x6e3b2c, 0.8);
    const trim = mat(0x5a4636, 0.9);
    const glassM = mat(0x2a3a44, 0.2, 0.4, { emissive: 0x3a2a10, emissiveIntensity: 0.25 });
    const root = group('house');
    const main = mesh(new THREE.BoxGeometry(8, 3.2, 7), wall);
    main.position.set(-3, 1.6, 0);
    root.add(main);
    const garage = mesh(new THREE.BoxGeometry(4.2, 2.8, 6.5), wall);
    garage.position.set(3.1, 1.4, 0.25);
    root.add(garage);
    // dach dwuspadowy (pryzmat)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-4.3, 0);
    roofShape.lineTo(0, 2.2);
    roofShape.lineTo(4.3, 0);
    roofShape.lineTo(-4.3, 0);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 7.6, bevelEnabled: false });
    roofGeo.translate(0, 0, -3.8);
    const roof = mesh(roofGeo, roofM);
    roof.position.set(-3, 3.2, 0);
    root.add(roof);
    const gRoof = mesh(new THREE.BoxGeometry(4.5, 0.15, 6.9), roofM);
    gRoof.position.set(3.1, 2.87, 0.25);
    root.add(gRoof);
    const door = mesh(new THREE.BoxGeometry(3.2, 2.2, 0.08), trim);
    door.position.set(3.1, 1.1, 3.52);
    root.add(door);
    for (let i = 0; i < 5; i++) {
      const line = mesh(new THREE.BoxGeometry(3.2, 0.03, 0.02), mat(0x3e3026, 0.9), { cast: false });
      line.position.set(3.1, 0.3 + i * 0.42, 3.57);
      root.add(line);
    }
    for (const x of [-5, -1.2]) {
      const win = mesh(new THREE.BoxGeometry(1.2, 1.0, 0.06), glassM, { cast: false });
      win.position.set(x, 1.8, 3.52);
      root.add(win);
    }
    const front = mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), trim);
    front.position.set(-3.1, 1.05, 3.52);
    root.add(front);
    const chimney = mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), mat(0x8a5a44, 0.9));
    chimney.position.set(-5, 4.6, -1);
    root.add(chimney);
    return root;
  }
}
