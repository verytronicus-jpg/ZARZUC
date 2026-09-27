import * as THREE from 'three';
import { CFG, type SpeciesId } from '../../config';
import type { AssetFactory, AssetOptions } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { cylZ, group, mat, mesh } from '../materials';

/**
 * Wędka: origin w miejscu chwytu (dłoń), oś +Z = kierunek blanku.
 * Szczytówka to łańcuch `rod_seg_0..5`, na końcu `rod_tip`.
 */
export class RodFactory implements AssetFactory {
  create(): THREE.Object3D {
    const r = CFG.rod;
    const blank = mat(0x2a2f28, 0.35, 0.2);
    const cork = mat(0xb08a5c, 0.95);
    const metal = mat(0x9aa3aa, 0.35, 0.8);
    const reelMat = mat(0x2c2c30, 0.4, 0.5);
    const tipMat = mat(0xd8d2c0, 0.4);

    const root = group('rod');
    const buttLen = r.length * (1 - r.tipFraction);
    const tipLen = r.length * r.tipFraction;

    const butt = mesh(cylZ(0.013, 0.0065, buttLen, 8), blank);
    butt.position.z = -r.buttOffset;
    root.add(butt);
    const handle = mesh(cylZ(0.016, 0.015, 0.42, 10), cork);
    handle.position.z = -r.buttOffset - 0.02;
    root.add(handle);
    const cap = mesh(cylZ(0.018, 0.018, 0.04, 10), reelMat);
    cap.position.z = -r.buttOffset - 0.05;
    root.add(cap);

    // kołowrotek pod blankiem
    const reel = group(PIVOTS.reel, 0, -0.06, 0.08);
    root.add(reel);
    const foot = mesh(new THREE.BoxGeometry(0.012, 0.05, 0.05), reelMat);
    foot.position.y = 0.03;
    reel.add(foot);
    const bodyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 14);
    bodyGeo.rotateX(Math.PI / 2);
    const reelBody = mesh(bodyGeo, reelMat);
    reelBody.position.set(0, -0.01, 0);
    reel.add(reelBody);
    const spoolGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.035, 14);
    spoolGeo.rotateX(Math.PI / 2);
    const spool = mesh(spoolGeo, metal);
    spool.position.set(0, -0.01, 0.035);
    reel.add(spool);
    const reelHandle = group(PIVOTS.reelHandle, 0.035, -0.01, 0);
    reel.add(reelHandle);
    const arm = mesh(new THREE.BoxGeometry(0.008, 0.06, 0.008), metal);
    arm.position.y = -0.03;
    reelHandle.add(arm);
    const knob = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), cork);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.012, -0.06, 0);
    reelHandle.add(knob);

    // przelotki
    const ringGeo = new THREE.TorusGeometry(0.012, 0.0022, 5, 10);
    for (let i = 0; i < 4; i++) {
      const ring = mesh(ringGeo, metal, { cast: false });
      ring.position.set(0, -0.018, -r.buttOffset + 0.5 + i * ((buttLen - 0.5) / 4));
      root.add(ring);
    }

    // szczytówka – łańcuch segmentów
    const segLen = tipLen / r.tipSegments;
    let parent: THREE.Object3D = root;
    let z = -r.buttOffset + buttLen;
    for (let i = 0; i < r.tipSegments; i++) {
      const seg = group(PIVOTS.rodSegment(i), 0, 0, z);
      parent.add(seg);
      const rad0 = 0.0065 * (1 - (i / r.tipSegments) * 0.75);
      const rad1 = 0.0065 * (1 - ((i + 1) / r.tipSegments) * 0.75);
      seg.add(mesh(cylZ(rad0, rad1, segLen, 6), i === r.tipSegments - 1 ? tipMat : blank, { cast: i < 3 }));
      if (i % 2 === 1) {
        const ring = mesh(new THREE.TorusGeometry(0.007, 0.0015, 4, 8), metal, { cast: false });
        ring.position.set(0, -0.01, segLen * 0.8);
        seg.add(ring);
      }
      parent = seg;
      z = segLen;
    }
    const tip = group(PIVOTS.rodTip, 0, 0, segLen);
    parent.add(tip);
    return root;
  }
}

/** Spławik: origin = dół korpusu, oś +Y. Skala wizualna > fizyczna, żeby był widoczny z daleka. */
export class FloatFactory implements AssetFactory {
  create(): THREE.Object3D {
    const r = CFG.rig;
    const s = CFG.rigVisual.floatScale;
    const root = group('float');
    const bodyMat = mat(0x2f3d2a, 0.5);
    const bandMat = mat(0xf2efe4, 0.5);
    const antMat = mat(0xff4a12, 0.4, 0, { emissive: 0xff3a00, emissiveIntensity: 0.55 });
    const bodyGeo = new THREE.SphereGeometry(r.bodyRadius * s, 12, 10);
    bodyGeo.scale(1, (r.bodyLength / (r.bodyRadius * 2)) * 1, 1);
    bodyGeo.translate(0, (r.bodyLength * s) / 2, 0);
    root.add(mesh(bodyGeo, bodyMat));
    const stem = mesh(new THREE.CylinderGeometry(0.0012 * s, 0.0012 * s, 0.02 * s, 5), bodyMat);
    stem.position.y = -0.008 * s;
    root.add(stem);
    const band = mesh(new THREE.CylinderGeometry(r.antennaRadius * s * 1.6, r.bodyRadius * s * 0.5, 0.008 * s, 10), bandMat);
    band.position.y = r.bodyLength * s * 0.98;
    root.add(band);
    const ant = mesh(
      new THREE.CylinderGeometry(r.antennaRadius * s, r.antennaRadius * s, r.antennaLength * s, 8),
      antMat,
    );
    ant.position.y = r.bodyLength * s + (r.antennaLength * s) / 2;
    root.add(ant);
    const top = group(PIVOTS.floatTop, 0, (r.bodyLength + r.antennaLength) * s, 0);
    root.add(top);
    return root;
  }
}

/** Haczyk + śrucina + robak. Origin = oczko haczyka, zwisa w dół (-Y). */
export class HookFactory implements AssetFactory {
  create(opts?: AssetOptions & { withWorm?: boolean }): THREE.Object3D {
    const root = group('hook');
    const s = CFG.rigVisual.hookScale;
    const metal = mat(0x6f767c, 0.3, 0.9);
    const hookGeo = new THREE.TorusGeometry(0.004 * s, 0.0006 * s, 4, 10, Math.PI * 1.3);
    const hook = mesh(hookGeo, metal, { cast: false });
    hook.rotation.z = Math.PI * 0.8;
    hook.position.y = -0.01 * s;
    root.add(hook);
    const shank = mesh(new THREE.CylinderGeometry(0.0006 * s, 0.0006 * s, 0.012 * s, 4), metal, { cast: false });
    shank.position.set(0.004 * s, -0.004 * s, 0);
    root.add(shank);
    const worm = new WormFactory().create();
    worm.name = 'worm_on_hook';
    worm.position.set(0.001 * s, -0.012 * s, 0);
    worm.scale.setScalar(s);
    root.add(worm);
    return root;
  }
}

export class WormFactory implements AssetFactory {
  create(): THREE.Object3D {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(Math.sin(t * 7) * 0.006, -t * 0.03, Math.cos(t * 5) * 0.003));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0022, 5);
    const m = mesh(geo, mat(0xb8545a, 0.55), { cast: false });
    const g = group('worm');
    g.add(m);
    return g;
  }
}

/** Pudełko z robakami (kolor wieczka rozpoznawalny w bagażniku). */
export class WormBoxFactory implements AssetFactory {
  create(): THREE.Object3D {
    const root = group('wormBox');
    const box = mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.08, 14), mat(0x3d3226, 0.9));
    box.position.y = 0.04;
    root.add(box);
    const lid = mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.015, 14), mat(0x2f7a3a, 0.6));
    lid.position.y = 0.087;
    root.add(lid);
    const label = mesh(new THREE.BoxGeometry(0.06, 0.035, 0.005), mat(0xe8dcc0, 0.8), { cast: false });
    label.position.set(0, 0.045, 0.072);
    root.add(label);
    return root;
  }
}

export type { SpeciesId };
