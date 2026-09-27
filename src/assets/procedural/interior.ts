/**
 * Wnętrze chatki przy drzwiach wg reference/01-swiat/07-chatka-wnetrze i 02-pov-drzwi-zamkniete:
 * podłoga z desek, okrągły pleciony chodnik, wieszak z kurtką i kapeluszem, stojak z wędkami (spławik na żyłce),
 * kalosze, półka z latarnią, plecak, ławka pod oknem z lampą naftową i skrzynką na przynęty.
 * Lokalnie w układzie chatki (jak CabinFactory). Kamera w intro patrzy tylko na ścianę z drzwiami.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import type { AssetFactory } from '../AssetRegistry';
import { group } from '../materials';
import { cabinLayout, cabinMetalMaterial, cabinWoodMaterial } from './cabin';
import { C, flat, jitter, merge, paint, solid } from './geo';

function box(w: number, h: number, d: number, x: number, y: number, z: number, col: THREE.Color | number): THREE.BufferGeometry {
  const g = flat(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y, z);
  return solid(g, typeof col === 'number' ? C(col) : col);
}

function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, col: number, seg = 8, rotX = 0, rotZ = 0): THREE.BufferGeometry {
  const g = flat(new THREE.CylinderGeometry(r1, r0, h, seg));
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return solid(g, C(col));
}

export class CabinInteriorFactory implements AssetFactory {
  create(): THREE.Object3D {
    const L = cabinLayout();
    const { W, D, F } = L;
    const rng = new Rng(55);
    const wood: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const inner = D / 2 - 0.16; // wewnętrzna płaszczyzna ściany frontowej
    const root = group('cabinInterior');

    // podłoga
    const n = Math.round((W - 0.3) / 0.18);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.15 + (i + 0.5) * ((W - 0.3) / n);
      wood.push(box((W - 0.3) / n - 0.01, 0.04, D - 0.3, x, F + 0.02, 0, C(0x7a5434).multiplyScalar(rng.range(0.8, 1.1))));
    }
    // chodnik: pleciony, okrągły (pierścienie)
    for (let r = 0; r < 7; r++) {
      const ring = new THREE.TorusGeometry(0.12 + r * 0.095, 0.05, 4, 28);
      ring.rotateX(Math.PI / 2);
      ring.scale(1, 0.25, 1);
      ring.translate(L.doorX, F + 0.045, inner - 1.1);
      wood.push(solid(flat(ring), C([0x8a5a3a, 0x6a6a4a, 0x9a7a4a, 0x5a4a3a][r % 4])));
    }

    // --- po lewej od drzwi (patrząc od środka: +X) ---
    const lx = L.doorX + L.doorW / 2 + 0.28;
    // stojak na wędki
    wood.push(box(0.5, 0.06, 0.22, lx + 0.15, F + 0.12, inner - 0.14, 0x6a4a2e));
    wood.push(box(0.5, 0.05, 0.1, lx + 0.15, F + 1.55, inner - 0.07, 0x6a4a2e));
    for (let i = 0; i < 3; i++) {
      const x = lx + i * 0.15;
      const rod = cyl(0.009, 0.004, 2.3, x, F + 1.25, inner - 0.12 + i * 0.01, 0x5a3020, 5, -0.03);
      wood.push(rod);
      wood.push(cyl(0.018, 0.016, 0.4, x, F + 0.42, inner - 0.12, 0xb08a5c, 8));
      const reel = flat(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12));
      reel.rotateZ(Math.PI / 2);
      reel.translate(x - 0.04, F + 0.72, inner - 0.17);
      metal.push(solid(reel, C(0x8a8070)));
    }
    // spławik na żyłce
    const fl = flat(new THREE.SphereGeometry(0.025, 8, 6));
    fl.scale(1, 1.4, 1);
    fl.translate(lx + 0.3, F + 1.35, inner - 0.14);
    wood.push(paint(fl, (p, _n, out) => out.copy(p.y > F + 1.35 ? C(0xe03a26) : C(0xf2eee4))));
    // wieszak z kurtką i kapeluszem
    const hx = lx + 0.75;
    wood.push(box(0.8, 0.12, 0.04, hx + 0.25, F + 1.85, inner - 0.02, 0x7a5434));
    metal.push(cyl(0.012, 0.012, 0.1, hx, F + 1.85, inner - 0.07, 0x2a2622, 6, Math.PI / 2));
    metal.push(cyl(0.012, 0.012, 0.1, hx + 0.5, F + 1.85, inner - 0.07, 0x2a2622, 6, Math.PI / 2));
    const jacket = flat(new THREE.CapsuleGeometry(0.2, 0.55, 4, 10));
    jacket.scale(1, 1, 0.45);
    jacket.translate(hx, F + 1.42, inner - 0.14);
    jitter(jacket, rng, 0.015);
    jacket.computeVertexNormals();
    wood.push(paint(jacket, (_p, n2, out) => out.copy(C(0x55603a)).multiplyScalar(0.8 + 0.25 * Math.max(0, n2.y + 0.3))));
    for (const s of [-1, 1]) {
      const sl = flat(new THREE.CapsuleGeometry(0.06, 0.45, 3, 8));
      sl.rotateZ(s * 0.18);
      sl.translate(hx + s * 0.19, F + 1.35, inner - 0.12);
      wood.push(solid(sl, C(0x4d5634)));
    }
    const brim = flat(new THREE.CylinderGeometry(0.2, 0.21, 0.02, 16));
    brim.rotateX(Math.PI / 2 - 0.15);
    brim.translate(hx + 0.5, F + 1.72, inner - 0.1);
    wood.push(solid(brim, C(0x6e5a3a)));
    const crown = flat(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 14));
    crown.rotateX(Math.PI / 2 - 0.15);
    crown.translate(hx + 0.5, F + 1.73, inner - 0.14);
    wood.push(solid(crown, C(0x6a5436)));
    // kalosze
    for (const s of [0, 1]) {
      const boot = flat(new THREE.CylinderGeometry(0.06, 0.065, 0.36, 10));
      boot.translate(lx + 0.05 + s * 0.16, F + 0.2, inner - 0.45);
      wood.push(solid(boot, C(0x4a5038)));
      wood.push(box(0.12, 0.08, 0.26, lx + 0.05 + s * 0.16, F + 0.05, inner - 0.4, 0x3e4230));
    }
    // ławka pod oknem z lampą i skrzynką
    const bx = L.winX;
    wood.push(box(1.7, 0.06, 0.45, bx, F + 0.62, inner - 0.25, 0x8a6440));
    for (const s of [-1, 1]) wood.push(box(0.07, 0.6, 0.4, bx + s * 0.75, F + 0.3, inner - 0.25, 0x6a4a2e));
    wood.push(box(0.46, 0.18, 0.28, bx + 0.35, F + 0.74, inner - 0.25, 0x5a6038));
    wood.push(box(0.44, 0.02, 0.26, bx + 0.35, F + 0.84, inner - 0.25, 0x7a5a3a));

    // --- po prawej od drzwi (-X): półka z latarnią, plecak ---
    const rx = L.doorX - L.doorW / 2 - 0.75;
    wood.push(box(0.7, 0.05, 0.26, rx, F + 1.75, inner - 0.13, 0x8a6440));
    wood.push(box(0.05, 0.2, 0.2, rx + 0.28, F + 1.64, inner - 0.1, 0x6a4a2e));
    wood.push(box(0.05, 0.2, 0.2, rx - 0.28, F + 1.64, inner - 0.1, 0x6a4a2e));
    // latarnia na półce (świeci – główne ciepłe światło przy drzwiach)
    metal.push(cyl(0.07, 0.07, 0.03, rx + 0.1, F + 1.79, inner - 0.13, 0x3a4028, 12));
    for (const [ddx, ddz] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) metal.push(cyl(0.006, 0.006, 0.2, rx + 0.1 + ddx, F + 1.9, inner - 0.13 + ddz, 0x3a4028, 4));
    metal.push(cyl(0.07, 0.03, 0.06, rx + 0.1, F + 2.03, inner - 0.13, 0x3a4028, 12));
    metal.push(cyl(0.025, 0.025, 0.05, rx + 0.1, F + 2.08, inner - 0.13, 0x3a4028, 8));
    const pack = flat(new THREE.CapsuleGeometry(0.17, 0.25, 4, 10));
    pack.scale(1, 1, 0.55);
    pack.translate(rx - 0.05, F + 1.15, inner - 0.12);
    wood.push(solid(pack, C(0x5a6436)));
    wood.push(box(0.3, 0.16, 0.06, rx - 0.05, F + 1.05, inner - 0.22, 0x4d5530));
    wood.push(box(0.04, 0.5, 0.02, rx - 0.14, F + 1.2, inner - 0.24, 0x6a4a2a));
    wood.push(box(0.04, 0.5, 0.02, rx + 0.04, F + 1.2, inner - 0.24, 0x6a4a2a));

    const wm = new THREE.Mesh(merge(wood), cabinWoodMaterial());
    wm.name = 'interior_wood';
    wm.receiveShadow = true;
    root.add(wm);
    const mm = new THREE.Mesh(merge(metal), cabinMetalMaterial());
    mm.name = 'interior_metal';
    root.add(mm);
    // lampa naftowa na ławce (świeci)
    const lampGlass = flat(new THREE.SphereGeometry(0.075, 10, 8));
    lampGlass.scale(1, 1.3, 1);
    lampGlass.translate(bx - 0.35, F + 0.78, inner - 0.25);
    const lamp = new THREE.Mesh(lampGlass, new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xffa040, emissiveIntensity: 2.2 }));
    lamp.name = 'interior_lamp';
    root.add(lamp);
    const shelfGlass = flat(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 10));
    shelfGlass.translate(rx + 0.1, F + 1.9, inner - 0.13);
    const shelfLamp = new THREE.Mesh(shelfGlass, lamp.material);
    shelfLamp.name = 'interior_lamp2';
    root.add(shelfLamp);
    root.add(group('interior_light', rx + 0.1, F + 1.9, inner - 0.35));
    return root;
  }
}
