import * as THREE from 'three';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group, mat, mesh } from '../materials';

/** Auto kombi/hatchback. Przód = +Z, lewa strona = +X (drzwi kierowcy). */
export class CarFactory implements AssetFactory {
  create(): THREE.Object3D {
    const paint = mat(0x5b86a0, 0.42, 0.08);
    const dark = mat(0x1c1f22, 0.7);
    const glass = mat(0x1d2a33, 0.15, 0.5);
    const chrome = mat(0xb9c0c6, 0.3, 0.9);
    const tire = mat(0x151515, 0.95);
    const interior = mat(0x2b2724, 0.95);

    const root = group('car');
    const chassis = group(PIVOTS.chassis);
    root.add(chassis);

    const body = mesh(new THREE.BoxGeometry(1.8, 0.56, 4.2), paint);
    body.position.set(0, 0.63, 0);
    chassis.add(body);
    const hood = mesh(new THREE.BoxGeometry(1.74, 0.08, 1.3), paint);
    hood.position.set(0, 0.93, 1.4);
    hood.rotation.x = 0.06;
    chassis.add(hood);
    const cabin = mesh(new THREE.BoxGeometry(1.62, 0.54, 2.3), glass);
    cabin.position.set(0, 1.18, -0.25);
    chassis.add(cabin);
    const roof = mesh(new THREE.BoxGeometry(1.66, 0.06, 2.34), paint);
    roof.position.set(0, 1.47, -0.25);
    chassis.add(roof);
    for (const sx of [-1, 1]) {
      const pillar = mesh(new THREE.BoxGeometry(0.07, 0.54, 0.1), paint);
      pillar.position.set(0.79 * sx, 1.18, 0.88);
      chassis.add(pillar);
      const pillarB = mesh(new THREE.BoxGeometry(0.06, 0.54, 0.12), paint);
      pillarB.position.set(0.8 * sx, 1.18, -0.15);
      chassis.add(pillarB);
    }
    for (const z of [2.12, -2.12]) {
      const bumper = mesh(new THREE.BoxGeometry(1.84, 0.18, 0.12), dark);
      bumper.position.set(0, 0.42, z);
      chassis.add(bumper);
    }
    const headMat = mat(0xfff1c8, 0.3, 0, { emissive: 0xffe7b0, emissiveIntensity: 0.6 });
    const tailMat = mat(0x8a1010, 0.4, 0, { emissive: 0x550000, emissiveIntensity: 0.5 });
    for (const sx of [-1, 1]) {
      const hl = mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), headMat, { cast: false });
      hl.position.set(0.6 * sx, 0.74, 2.1);
      chassis.add(hl);
      const tl = mesh(new THREE.BoxGeometry(0.26, 0.14, 0.05), tailMat, { cast: false });
      tl.position.set(0.68 * sx, 0.78, -2.1);
      chassis.add(tl);
      const mirror = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), paint);
      mirror.position.set(0.95 * sx, 1.05, 0.85);
      chassis.add(mirror);
    }
    const plate = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), mat(0xf2f2ee, 0.5), { cast: false });
    plate.position.set(0, 0.52, -2.19);
    chassis.add(plate);

    // bagażnik: podłoga i wnętrze
    const floor = mesh(new THREE.BoxGeometry(1.5, 0.04, 0.8), interior);
    floor.position.set(0, 0.9, -1.72);
    chassis.add(floor);
    const slotRod = group(PIVOTS.trunkSlotRod, 0.25, 0.95, -1.6);
    chassis.add(slotRod);
    const slotBox = group(PIVOTS.trunkSlotBox, -0.4, 0.93, -1.72);
    chassis.add(slotBox);

    // klapa na zawiasie (tylna, uchylna)
    const lid = group(PIVOTS.trunkLid, 0, 1.47, -1.37);
    chassis.add(lid);
    const lidShape = group('trunk_lid_shape');
    lidShape.rotation.x = -0.66;
    lid.add(lidShape);
    const lidPanel = mesh(new THREE.BoxGeometry(1.66, 0.06, 0.92), paint);
    lidPanel.position.z = -0.46;
    lidShape.add(lidPanel);
    const lidGlass = mesh(new THREE.BoxGeometry(1.4, 0.02, 0.45), glass, { cast: false });
    lidGlass.position.set(0, 0.035, -0.3);
    lidShape.add(lidGlass);
    const handle = mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), chrome);
    handle.position.set(0, -0.02, -0.86);
    lidShape.add(handle);

    // drzwi kierowcy (lewe, +X)
    const door = group(PIVOTS.doorL, 0.915, 0.62, 0.45);
    chassis.add(door);
    const doorPanel = mesh(new THREE.BoxGeometry(0.05, 0.54, 1.05), paint);
    doorPanel.position.set(0, 0, -0.53);
    door.add(doorPanel);
    const doorGlass = mesh(new THREE.BoxGeometry(0.03, 0.46, 0.95), glass, { cast: false });
    doorGlass.position.set(-0.01, 0.52, -0.53);
    door.add(doorGlass);

    // koła
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.232, 8);
    hubGeo.rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.236, 0.035, 0.4);
    const ids: Array<['FL' | 'FR' | 'RL' | 'RR', number, number]> = [
      ['FL', 1, 1.35],
      ['FR', -1, 1.35],
      ['RL', 1, -1.35],
      ['RR', -1, -1.35],
    ];
    for (const [id, sx, z] of ids) {
      const w = group(PIVOTS.wheel(id), 0.82 * sx, 0.33, z);
      w.add(mesh(wheelGeo, tire));
      w.add(mesh(hubGeo, chrome));
      w.add(mesh(spokeGeo, dark)); // widoczny obrót
      root.add(w);
    }
    return root;
  }
}
