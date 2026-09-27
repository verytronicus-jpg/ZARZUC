import * as THREE from 'three';
import { CFG } from '../../config';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { cylZ, group, mat, mesh } from '../materials';

/**
 * Wędka: origin w miejscu chwytu (dłoń), oś +Z = kierunek blanku.
 * Szczytówka to łańcuch `rod_seg_0..5`, na końcu `rod_tip`.
 */
export class RodFactory implements AssetFactory {
  create(): THREE.Object3D {
    const r = CFG.rod;
    // wg arkusza 03-sprzet: brązowy blank z miedzianymi owijkami, korkowa rękojeść, czarno-mosiężna nasadka
    const blank = mat(0x4a2c1c, 0.38, 0.15);
    const cork = mat(0xc49a66, 0.95);
    const corkDark = mat(0x8a6a44, 0.95);
    const black = mat(0x1e1d1c, 0.45, 0.3);
    const brass = mat(0xb08a4a, 0.35, 0.85);
    const metal = mat(0xa6acb0, 0.3, 0.85);
    const lineGreen = mat(0x6f8a52, 0.6);
    const tipMat = mat(0x5a3422, 0.4, 0.1);

    const root = group('rod');
    const buttLen = r.length * (1 - r.tipFraction);
    const tipLen = r.length * r.tipFraction;
    const z0 = -r.buttOffset;

    const butt = mesh(cylZ(0.012, 0.0062, buttLen, 10), blank);
    butt.position.z = z0;
    root.add(butt);
    // stopka, dolna rękojeść z korka, uchwyt kołowrotka, przednia rękojeść
    const cap = mesh(cylZ(0.019, 0.018, 0.035, 12), corkDark);
    cap.position.z = z0 - 0.02;
    root.add(cap);
    const rear = mesh(cylZ(0.0175, 0.016, 0.3, 12), cork);
    rear.position.z = z0 + 0.012;
    root.add(rear);
    const seat = mesh(cylZ(0.0135, 0.0135, 0.1, 12), black);
    seat.position.z = z0 + 0.31;
    root.add(seat);
    for (const dz of [0.31, 0.405]) {
      const ring = mesh(cylZ(0.0152, 0.0152, 0.008, 12), brass);
      ring.position.z = z0 + dz;
      root.add(ring);
    }
    const fore = mesh(cylZ(0.0145, 0.012, 0.16, 12), cork);
    fore.position.z = z0 + 0.415;
    root.add(fore);
    const hook = mesh(cylZ(0.0125, 0.0115, 0.02, 10), brass);
    hook.position.z = z0 + 0.575;
    root.add(hook);

    // kołowrotek (spinning) pod blankiem: stopka, korpus, szpula z zieloną żyłką, kabłąk, korbka
    const reel = group(PIVOTS.reel, 0, -0.06, 0.08);
    root.add(reel);
    const foot = mesh(new THREE.BoxGeometry(0.01, 0.05, 0.045), black);
    foot.position.y = 0.032;
    reel.add(foot);
    const bodyGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.045, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const reelBody = mesh(bodyGeo, black);
    reelBody.position.set(0, -0.01, -0.005);
    reel.add(reelBody);
    const trimGeo = new THREE.TorusGeometry(0.03, 0.0025, 6, 18);
    const trim = mesh(trimGeo, brass, { cast: false });
    trim.position.set(0, -0.01, 0.018);
    reel.add(trim);
    const spoolGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 16);
    spoolGeo.rotateX(Math.PI / 2);
    const spool = mesh(spoolGeo, lineGreen);
    spool.position.set(0, -0.01, 0.036);
    reel.add(spool);
    const lipGeo = new THREE.CylinderGeometry(0.027, 0.027, 0.006, 16);
    lipGeo.rotateX(Math.PI / 2);
    const lip = mesh(lipGeo, metal);
    lip.position.set(0, -0.01, 0.053);
    reel.add(lip);
    const bail = mesh(new THREE.TorusGeometry(0.03, 0.0018, 4, 16, Math.PI), metal, { cast: false });
    bail.rotation.set(0, Math.PI / 2, 0);
    bail.position.set(0, -0.01, 0.045);
    reel.add(bail);
    const reelHandle = group(PIVOTS.reelHandle, 0.035, -0.01, 0);
    reel.add(reelHandle);
    const arm = mesh(new THREE.BoxGeometry(0.007, 0.06, 0.008), brass);
    arm.position.y = -0.03;
    reelHandle.add(arm);
    const knob = mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.022, 10), black);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.013, -0.06, 0);
    reelHandle.add(knob);

    // przelotki z miedzianymi owijkami
    const ringGeo = new THREE.TorusGeometry(0.012, 0.0022, 5, 12);
    const wrapGeo = cylZ(0.0085, 0.0085, 0.018, 8);
    for (let i = 0; i < 4; i++) {
      const z = z0 + 0.72 + i * ((buttLen - 0.72) / 4);
      const k = 1 - i * 0.18;
      const ring = mesh(ringGeo, metal, { cast: false });
      ring.scale.setScalar(k);
      ring.position.set(0, -0.02 * k, z);
      root.add(ring);
      const wrap = mesh(wrapGeo, brass, { cast: false });
      wrap.scale.set(1 - i * 0.08, 1 - i * 0.08, 1);
      wrap.position.z = z - 0.009;
      root.add(wrap);
    }

    // szczytówka – łańcuch segmentów
    const segLen = tipLen / r.tipSegments;
    let parent: THREE.Object3D = root;
    let z = z0 + buttLen;
    for (let i = 0; i < r.tipSegments; i++) {
      const seg = group(PIVOTS.rodSegment(i), 0, 0, z);
      parent.add(seg);
      const rad0 = 0.0062 * (1 - (i / r.tipSegments) * 0.75);
      const rad1 = 0.0062 * (1 - ((i + 1) / r.tipSegments) * 0.75);
      seg.add(mesh(cylZ(rad0, rad1, segLen, 6), i === r.tipSegments - 1 ? tipMat : blank, { cast: i < 3 }));
      if (i % 2 === 1) {
        const ring = mesh(new THREE.TorusGeometry(0.0075, 0.0015, 4, 8), metal, { cast: false });
        ring.position.set(0, -0.011, segLen * 0.8);
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
    const bodyMat = mat(0x1c1b1a, 0.45);
    const redMat = mat(0xd0301f, 0.4);
    const bandMat = mat(0xf2efe4, 0.5);
    const antMat = mat(0xff4a12, 0.4, 0, { emissive: 0xff3a00, emissiveIntensity: 0.55 });
    const R = r.bodyRadius * s;
    const L = r.bodyLength * s;
    // korpus: dolna, czarna połowa + górna, czerwona (dwie połówki elipsoidy)
    const lower = new THREE.SphereGeometry(R, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    lower.scale(1, L / (R * 2), 1);
    lower.translate(0, L / 2, 0);
    root.add(mesh(lower, bodyMat));
    const upper = new THREE.SphereGeometry(R, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    upper.scale(1, L / (R * 2), 1);
    upper.translate(0, L / 2, 0);
    root.add(mesh(upper, redMat));
    const mid = mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.16, 14, 1, true), bandMat);
    mid.position.y = L * 0.5;
    root.add(mid);
    const stem = mesh(new THREE.CylinderGeometry(0.0012 * s, 0.0012 * s, 0.02 * s, 5), bodyMat);
    stem.position.y = -0.008 * s;
    root.add(stem);
    const band = mesh(new THREE.CylinderGeometry(r.antennaRadius * s * 1.6, r.bodyRadius * s * 0.4, 0.008 * s, 10), redMat);
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
  create(): THREE.Object3D {
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
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0022, 6);
    // pierścienie (segmenty) i siodełko
    const p = geo.attributes.position;
    const uv = geo.attributes.uv;
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = uv.getX(i);
      c.set(0xb0644a).multiplyScalar(0.85 + 0.15 * Math.sin(t * 90));
      if (Math.abs(t - 0.3) < 0.06) c.set(0xc27a62);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = mesh(geo, mat(0xffffff, 0.5, 0, { vertexColors: true }), { cast: false });
    const g = group('worm');
    g.add(m);
    return g;
  }
}

/** Blaszana puszka z robakami (arkusz 03): ocynkowana, z rantami, otwarta – robaki na wierzchu. */
export class WormBoxFactory implements AssetFactory {
  create(): THREE.Object3D {
    const root = group('wormBox');
    const tin = mat(0x8c908c, 0.45, 0.65);
    const tinDark = mat(0x5e605c, 0.5, 0.6);
    const box = mesh(new THREE.CylinderGeometry(0.072, 0.07, 0.07, 18, 1, true), tin);
    box.position.y = 0.035;
    root.add(box);
    const bottom = mesh(new THREE.CircleGeometry(0.07, 18), tinDark);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.004;
    root.add(bottom);
    for (const y of [0.012, 0.066]) {
      const rim = mesh(new THREE.TorusGeometry(0.072, 0.003, 4, 20), tinDark, { cast: false });
      rim.rotation.x = Math.PI / 2;
      rim.position.y = y;
      root.add(rim);
    }
    // ziemia i robaki
    const soil = mesh(new THREE.CircleGeometry(0.068, 18), mat(0x3a2a1e, 0.95), { cast: false });
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.055;
    root.add(soil);
    const wormMat = mat(0xb0644a, 0.5);
    for (let i = 0; i < 6; i++) {
      const pts: THREE.Vector3[] = [];
      const a0 = i * 1.1;
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const a = a0 + t * 2.2;
        const r = 0.02 + 0.035 * Math.sin(t * Math.PI);
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.058 + Math.sin(t * 9 + i) * 0.004, Math.sin(a) * r));
      }
      root.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0035, 5), wormMat, { cast: false }));
    }
    return root;
  }
}
