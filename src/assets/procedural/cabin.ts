/**
 * Chatka z bali wg reference/01-swiat/06-chatka-arkusz: kamienna podmurówka, bale z okrągłymi czołami na
 * narożach, dach dwuspadowy z gontów (kalenica równoległa do frontu), szczyty z pionowych desek,
 * kamienny komin, drzwi z okuciami (pivot `door_front`), okno, ganek z dwoma stopniami, ławka, latarnia,
 * beczka, stos drewna przy ścianie bocznej.
 * Origin = środek podstawy na poziomie gruntu, front (drzwi) = +Z. Wymiary z CFG.world.
 */
import * as THREE from 'three';
import { CFG } from '../../config';
import { Rng } from '../../core/Rng';
import { clamp01, lerp, smoothstep } from '../../core/math';
import type { AssetFactory } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group } from '../materials';
import { C, flat, jitter, merge, paint, solid } from './geo';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Wymiary i położenia elementów chatki (lokalnie) – używane też przez intro. */
export function cabinLayout() {
  const w = CFG.world;
  const W = w.cabinWidth;
  const D = w.cabinDepth;
  const F = w.floorHeight;
  const logR = 0.15;
  const rows = 9;
  const wallTop = F + rows * logR * 1.86;
  const doorX = -W * 0.22;
  const doorW = 0.94;
  const doorH = 2.0;
  return {
    W,
    D,
    F,
    logR,
    rows,
    wallTop,
    doorX,
    doorW,
    doorH,
    /** zawias drzwi (od środka patrząc na zewnątrz – po lewej = +X) */
    hingeX: doorX + doorW / 2,
    winX: W * 0.24,
    winY: F + 0.95,
    winW: 0.95,
    winH: 0.9,
    ridge: 2.15,
    eave: 0.5,
    gableOver: 0.42,
  };
}

function log(len: number, r: number, axis: 'x' | 'z', rng: Rng): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * rng.range(0.94, 1.02), len, 9, 1, false);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  const f = flat(g);
  jitter(f, rng, 0.012, 0.012);
  f.computeVertexNormals();
  const tone = rng.range(0.85, 1.12);
  return paint(f, (p, n, out) => {
    const along = axis === 'x' ? n.x : n.z;
    if (Math.abs(along) > 0.9) {
      // czoło bala: jasne drewno ze słojami
      const rr = axis === 'x' ? Math.hypot(p.y, p.z) : Math.hypot(p.x, p.y);
      out.copy(C(0xd8ac6c)).lerp(C(0xa8743e), 0.5 + 0.5 * Math.sin(rr * 90)).multiplyScalar(tone);
    } else {
      const t = axis === 'x' ? p.x : p.z;
      out
        .copy(C(0x7a5232))
        .lerp(C(0x9c6c40), 0.5 + 0.5 * Math.sin(t * 5.3 + p.y * 30))
        .lerp(C(0x5a3a22), clamp01(-n.y) * 0.5)
        .multiplyScalar(tone);
    }
  });
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, col: THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void)): THREE.BufferGeometry {
  const g = flat(new THREE.BoxGeometry(w, h, d));
  g.translate(x, y, z);
  return typeof col === 'function' ? paint(g, col) : solid(g, col);
}

function stone(r: number, x: number, y: number, z: number, rng: Rng, sx = 1.2, sy = 0.75, sz = 0.9): THREE.BufferGeometry {
  const g = flat(new THREE.DodecahedronGeometry(r, 0));
  jitter(g, rng, r * 0.15);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  g.computeVertexNormals();
  const tone = rng.range(0.8, 1.15);
  return paint(g, (_p, n, out) => {
    out.copy(C(0x8f887a)).lerp(C(0xb0a896), 0.5 + 0.5 * n.y).multiplyScalar(tone);
    if (n.y > 0.6 && rng.next() < 0.3) out.lerp(C(0x6f7a3a), 0.5);
  });
}

function planks(x0: number, x1: number, z0: number, z1: number, y: number, thick: number, along: 'x' | 'z', width: number, rng: Rng, base = 0x8a6a48): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const span = along === 'x' ? z1 - z0 : x1 - x0;
  const n = Math.max(1, Math.round(span / width));
  const pw = span / n;
  for (let i = 0; i < n; i++) {
    const tone = rng.range(0.82, 1.12);
    const col = C(base).multiplyScalar(tone);
    if (along === 'x') out.push(box(x1 - x0, thick, pw - 0.012, (x0 + x1) / 2, y - thick / 2, z0 + pw * (i + 0.5), col));
    else out.push(box(pw - 0.012, thick, z1 - z0, x0 + pw * (i + 0.5), y - thick / 2, (z0 + z1) / 2, col));
  }
  return out;
}

export class CabinFactory implements AssetFactory {
  create(): THREE.Object3D {
    const L = cabinLayout();
    const { W, D, F, logR } = L;
    const rng = new Rng(907);
    const wood: THREE.BufferGeometry[] = [];
    const metal: THREE.BufferGeometry[] = [];
    const root = group('cabin');

    // ---------- podmurówka ----------
    wood.push(box(W + 0.1, F, D + 0.1, 0, F / 2, 0, C(0x5a554c)));
    const perim = (W + D) * 2;
    for (let i = 0; i < perim / 0.42; i++) {
      const s = (i / (perim / 0.42)) * perim;
      let x: number;
      let z: number;
      if (s < W) {
        x = -W / 2 + s;
        z = D / 2 + 0.07;
      } else if (s < W + D) {
        x = W / 2 + 0.07;
        z = D / 2 - (s - W);
      } else if (s < 2 * W + D) {
        x = W / 2 - (s - W - D);
        z = -D / 2 - 0.07;
      } else {
        x = -W / 2 - 0.07;
        z = -D / 2 + (s - 2 * W - D);
      }
      for (const yy of [0.14, 0.38]) wood.push(stone(rng.range(0.16, 0.21), x + rng.range(-0.05, 0.05), yy, z, rng));
    }

    // ---------- ściany z bali ----------
    const step = logR * 1.86;
    const over = 0.3;
    for (let r = 0; r < L.rows; r++) {
      const yFB = F + logR + r * step;
      const ySide = yFB + step / 2;
      // front i tył (z otworami)
      for (const zs of [1, -1]) {
        const z = (D / 2) * zs;
        const cuts: Array<[number, number]> = [];
        if (zs === 1) {
          if (yFB - logR < F + L.doorH) cuts.push([L.doorX - L.doorW / 2 - 0.02, L.doorX + L.doorW / 2 + 0.02]);
          if (yFB + logR > L.winY && yFB - logR < L.winY + L.winH) cuts.push([L.winX - L.winW / 2, L.winX + L.winW / 2]);
        } else if (yFB + logR > L.winY && yFB - logR < L.winY + L.winH) cuts.push([-L.winW / 2, L.winW / 2]);
        let x0 = -W / 2 - over;
        const segs: Array<[number, number]> = [];
        for (const [a, b] of cuts.sort((p, q) => p[0] - q[0])) {
          segs.push([x0, a]);
          x0 = b;
        }
        segs.push([x0, W / 2 + over]);
        for (const [a, b] of segs) {
          if (b - a < 0.05) continue;
          const g = log(b - a, logR, 'x', rng);
          g.translate((a + b) / 2, yFB, z);
          wood.push(g);
        }
      }
      // boki
      for (const xs of [1, -1]) {
        const g = log(D + over * 2, logR, 'z', rng);
        g.translate((W / 2) * xs, ySide, 0);
        wood.push(g);
      }
    }
    const top = L.wallTop;

    // ---------- szczyty (pionowe deski) ----------
    const rise = L.ridge;
    const halfD = D / 2 + 0.1;
    for (const xs of [1, -1]) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const z0 = -halfD + (i / n) * halfD * 2;
        const z1 = -halfD + ((i + 1) / n) * halfD * 2;
        const zc = (z0 + z1) / 2;
        const h = rise * (1 - Math.abs(zc) / halfD);
        if (h < 0.05) continue;
        wood.push(box(0.05, h, z1 - z0 - 0.012, (W / 2) * xs + xs * 0.02, top + h / 2, zc, C(0x7a5836).multiplyScalar(rng.range(0.85, 1.1))));
      }
    }

    // ---------- dach ----------
    const slopeLen = Math.hypot(halfD + L.eave, rise * ((halfD + L.eave) / halfD));
    const pitch = Math.atan2(rise, halfD);
    const roofW = W + L.gableOver * 2 + over;
    for (const zs of [1, -1]) {
      const slab = new THREE.BoxGeometry(roofW, 0.07, slopeLen);
      slab.translate(0, 0, (slopeLen / 2) * zs);
      slab.rotateX(zs * pitch);
      slab.translate(0, top + rise + 0.02, 0);
      wood.push(solid(flat(slab), C(0x4d3a2a)));
      // gonty: rzędy od okapu do kalenicy
      const rowsN = Math.floor(slopeLen / 0.19);
      for (let r = 0; r < rowsN; r++) {
        const s = slopeLen - 0.1 - r * 0.19;
        const offset = r % 2 ? 0.15 : 0;
        for (let x = -roofW / 2 + offset; x < roofW / 2 - 0.1; x += 0.3) {
          const sw = 0.29 * rng.range(0.85, 1.05);
          const g = new THREE.BoxGeometry(sw, 0.035, 0.4);
          g.rotateX(-0.07 * zs + rng.range(-0.03, 0.03));
          g.translate(x + sw / 2, 0.05 + rng.range(0, 0.01), (s - 0.1) * zs);
          g.rotateX(zs * pitch);
          g.translate(0, top + rise + 0.02, 0);
          const tone = rng.range(0.78, 1.15);
          const mossy = rng.next() < 0.12;
          wood.push(
            paint(flat(g), (_p, n, out) => {
              out.copy(C(0x7c6650)).lerp(C(0x5c4a3a), clamp01(-n.y)).multiplyScalar(tone);
              if (mossy) out.lerp(C(0x6c7a3a), 0.45);
            }),
          );
        }
      }
    }
    // kalenica
    wood.push(box(roofW, 0.12, 0.26, 0, top + rise + 0.1, 0, C(0x5e4632)));

    // ---------- komin (kamienny, po lewej patrząc na front) ----------
    const chX = -W * 0.3;
    const chZ = -0.35;
    const chTop = top + rise + 1.05;
    for (let y = top - 0.2; y < chTop; y += 0.22) {
      for (const [dx, dz] of [
        [-0.28, -0.24],
        [0.28, -0.24],
        [-0.28, 0.24],
        [0.28, 0.24],
        [0, -0.3],
        [0, 0.3],
        [-0.36, 0],
        [0.36, 0],
      ] as const) {
        wood.push(stone(0.15, chX + dx + rng.range(-0.02, 0.02), y + 0.1, chZ + dz, rng, 1.25, 0.8, 1.1));
      }
    }
    wood.push(box(0.8, chTop - top, 0.7, chX, (top + chTop) / 2, chZ, C(0x6f6a60)));
    wood.push(box(0.95, 0.08, 0.85, chX, chTop + 0.04, chZ, C(0x7a7468)));
    root.add(group('chimney_top', chX, chTop + 0.1, chZ));

    // ---------- ganek i stopnie ----------
    const pd = CFG.world.porchDepth;
    wood.push(...planks(-W / 2 - 0.2, W / 2 + 0.2, D / 2 + 0.05, D / 2 + pd, F, 0.06, 'x', 0.16, rng));
    for (const x of [-W / 2 - 0.05, -W / 4, 0, W / 4, W / 2 + 0.05]) wood.push(stone(0.2, x, 0.15, D / 2 + pd - 0.15, rng, 1, 1.3, 1));
    wood.push(box(W + 0.4, F - 0.08, 0.1, 0, (F - 0.08) / 2, D / 2 + pd - 0.06, C(0x5a4030)));
    const sx = L.doorX;
    const s1 = D / 2 + pd;
    wood.push(...planks(sx - 0.8, sx + 0.8, s1, s1 + 0.37, (F * 2) / 3, 0.07, 'x', 0.18, rng));
    wood.push(box(1.6, (F * 2) / 3 - 0.07, 0.34, sx, ((F * 2) / 3 - 0.07) / 2, s1 + 0.18, C(0x5a4030)));
    wood.push(...planks(sx - 0.8, sx + 0.8, s1 + 0.35, s1 + 0.72, F / 3, 0.07, 'x', 0.18, rng));
    wood.push(box(1.6, F / 3 - 0.07, 0.34, sx, (F / 3 - 0.07) / 2, s1 + 0.53, C(0x5a4030)));

    // ---------- obramowanie drzwi i okien ----------
    const trim = C(0x6a4a2e);
    const dz = D / 2 + logR + 0.02;
    wood.push(box(0.12, L.doorH + 0.1, 0.06, L.doorX - L.doorW / 2 - 0.06, F + L.doorH / 2, dz, trim));
    wood.push(box(0.12, L.doorH + 0.1, 0.06, L.doorX + L.doorW / 2 + 0.06, F + L.doorH / 2, dz, trim));
    wood.push(box(L.doorW + 0.36, 0.14, 0.07, L.doorX, F + L.doorH + 0.06, dz, trim));
    wood.push(box(L.doorW + 0.1, 0.05, 0.34, L.doorX, F + 0.02, D / 2, C(0x5a4030)));
    // wewnętrzne ościeżnice (widoczne z intro)
    wood.push(box(0.1, L.doorH, D > 0 ? 0.3 : 0.3, L.doorX - L.doorW / 2 - 0.05, F + L.doorH / 2, D / 2, C(0x7a5836)));
    wood.push(box(0.1, L.doorH, 0.3, L.doorX + L.doorW / 2 + 0.05, F + L.doorH / 2, D / 2, C(0x7a5836)));
    wood.push(box(L.doorW + 0.2, 0.1, 0.3, L.doorX, F + L.doorH + 0.05, D / 2, C(0x7a5836)));
    const glass: THREE.BufferGeometry[] = [];
    const windowAt = (x: number, z: number, zs: number) => {
      const y0 = L.winY;
      const y1 = L.winY + L.winH;
      const zz = z + zs * (logR + 0.02);
      wood.push(box(L.winW + 0.2, 0.1, 0.08, x, y0 - 0.02, zz, trim));
      wood.push(box(L.winW + 0.2, 0.1, 0.08, x, y1 + 0.02, zz, trim));
      wood.push(box(0.1, L.winH, 0.08, x - L.winW / 2 - 0.02, (y0 + y1) / 2, zz, trim));
      wood.push(box(0.1, L.winH, 0.08, x + L.winW / 2 + 0.02, (y0 + y1) / 2, zz, trim));
      wood.push(box(0.05, L.winH, 0.06, x, (y0 + y1) / 2, zz, trim));
      wood.push(box(L.winW, 0.05, 0.06, x, (y0 + y1) / 2, zz, trim));
      wood.push(box(L.winW + 0.3, 0.06, 0.2, x, y0 - 0.08, zz + zs * 0.05, C(0x6a4a2e)));
      const gl = new THREE.PlaneGeometry(L.winW, L.winH);
      if (zs < 0) gl.rotateY(Math.PI);
      gl.translate(x, (y0 + y1) / 2, z + zs * 0.01);
      glass.push(flat(gl));
      // wnęka okna (tło za szybą)
      wood.push(box(L.winW, L.winH, 0.02, x, (y0 + y1) / 2, z - zs * 0.12, C(0x1c1612)));
    };
    windowAt(L.winX, D / 2, 1);
    windowAt(0, -D / 2, -1);

    // ---------- ławka pod oknem ----------
    const bz = D / 2 + 0.42;
    const bx = L.winX + 0.05;
    for (const dx of [-0.6, 0.6]) {
      wood.push(box(0.07, 0.42, 0.34, bx + dx, F + 0.21, bz, C(0x7a5836)));
      wood.push(box(0.07, 0.5, 0.06, bx + dx, F + 0.66, bz - 0.2, C(0x7a5836)));
    }
    wood.push(...planks(bx - 0.75, bx + 0.75, bz - 0.18, bz + 0.18, F + 0.46, 0.04, 'x', 0.12, rng, 0x9a7650));
    wood.push(box(1.5, 0.1, 0.03, bx, F + 0.72, bz - 0.22, C(0x9a7650)));
    wood.push(box(1.5, 0.1, 0.03, bx, F + 0.88, bz - 0.22, C(0x9a7650)));

    // ---------- beczka (prawy przedni narożnik) ----------
    const barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12, 6, false);
    const bp = barrel.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      const k = 1 + 0.12 * (1 - (y / 0.4) ** 2);
      bp.setX(i, bp.getX(i) * k);
      bp.setZ(i, bp.getZ(i) * k);
    }
    barrel.computeVertexNormals();
    const bf = flat(barrel);
    bf.translate(W / 2 + 0.55, 0.4, D / 2 + 0.35);
    wood.push(
      paint(bf, (p, n, out) => {
        const y = p.y - 0.4;
        const hoop = Math.abs(Math.abs(y) - 0.27) < 0.03 || Math.abs(y) < 0.02;
        out.copy(hoop ? C(0x3a3634) : C(0x8a603a).multiplyScalar(0.9 + 0.2 * Math.sin(Math.atan2(p.z, p.x) * 20)));
        if (n.y > 0.9) out.copy(C(0x6a4a30));
      }),
    );

    // ---------- stos drewna (lewa ściana boczna) ----------
    for (let rr = 0; rr < 5; rr++) {
      for (let k = 0; k < 9; k++) {
        const g = log(0.55, rng.range(0.08, 0.11), 'x', rng);
        g.translate(-W / 2 - 0.55, 0.1 + rr * 0.2, -1.9 + k * 0.21 + (rr % 2) * 0.1);
        wood.push(g);
      }
    }

    // ---------- latarnia przy drzwiach ----------
    const lx = L.doorX - L.doorW / 2 - 0.45;
    const ly = F + 1.85;
    const lz = D / 2 + logR + 0.22;
    metal.push(box(0.04, 0.04, 0.26, lx, ly + 0.32, lz - 0.11, C(0x262220)));
    metal.push(box(0.2, 0.03, 0.2, lx, ly + 0.2, lz, C(0x262220)));
    metal.push(box(0.2, 0.03, 0.2, lx, ly - 0.14, lz, C(0x262220)));
    for (const [dx, dz2] of [
      [-0.09, -0.09],
      [0.09, -0.09],
      [-0.09, 0.09],
      [0.09, 0.09],
    ] as const)
      metal.push(box(0.02, 0.34, 0.02, lx + dx, ly + 0.03, lz + dz2, C(0x262220)));
    const cone = flat(new THREE.ConeGeometry(0.13, 0.14, 4));
    cone.rotateY(Math.PI / 4);
    cone.translate(lx, ly + 0.29, lz);
    metal.push(solid(cone, C(0x262220)));
    const flame = flat(new THREE.SphereGeometry(0.075, 8, 6));
    flame.scale(1, 1.5, 1);
    flame.translate(lx, ly + 0.02, lz);

    // ---------- drzwi (pivot na zawiasie) ----------
    const door = group(PIVOTS.doorFront, L.hingeX, F, D / 2);
    const doorParts: THREE.BufferGeometry[] = [];
    const n = 4;
    const pw = L.doorW / n;
    for (let i = 0; i < n; i++) {
      const tone = rng.range(0.85, 1.1);
      doorParts.push(
        box(pw - 0.01, L.doorH, 0.06, -pw * (i + 0.5), L.doorH / 2, 0, (p, _n, out) =>
          out.copy(C(0xa77a4a)).lerp(C(0x8a5e36), 0.5 + 0.5 * Math.sin(p.y * 13 + i * 2.1)).multiplyScalar(tone),
        ),
      );
    }
    // poprzeczki od środka
    doorParts.push(box(L.doorW - 0.08, 0.14, 0.04, -L.doorW / 2, 0.4, -0.05, C(0x8a6038)));
    doorParts.push(box(L.doorW - 0.08, 0.14, 0.04, -L.doorW / 2, L.doorH - 0.4, -0.05, C(0x8a6038)));
    const doorMetal: THREE.BufferGeometry[] = [];
    // okucia zawiasów (po obu stronach) z ozdobnym zakończeniem
    for (const y of [0.4, L.doorH - 0.4]) {
      for (const zs of [1, -1]) {
        doorMetal.push(box(0.62, 0.07, 0.015, -0.3, y, zs * 0.038, C(0x1e1c1a)));
        const tip = flat(new THREE.OctahedronGeometry(0.06, 0));
        tip.scale(1, 1, 0.2);
        tip.translate(-0.62, y, zs * 0.038);
        doorMetal.push(solid(tip, C(0x1e1c1a)));
        for (let k = 0; k < 3; k++) doorMetal.push(box(0.025, 0.025, 0.02, -0.08 - k * 0.2, y, zs * 0.048, C(0x3a3430)));
      }
      doorMetal.push(box(0.06, 0.16, 0.08, 0.02, y, 0, C(0x1e1c1a)));
    }
    // zasuwa (od środka) i uchwyt-kółko (na zewnątrz)
    doorMetal.push(box(0.3, 0.05, 0.03, -L.doorW + 0.18, 1.05, -0.05, C(0x2a2624)));
    doorMetal.push(box(0.05, 0.12, 0.04, -L.doorW + 0.24, 1.0, -0.07, C(0x2a2624)));
    const ring = flat(new THREE.TorusGeometry(0.05, 0.008, 5, 12));
    ring.translate(-L.doorW + 0.14, 1.0, 0.06);
    doorMetal.push(solid(ring, C(0x2a2624)));
    const doorMesh = new THREE.Mesh(merge(doorParts), cabinWoodMaterial());
    doorMesh.castShadow = true;
    doorMesh.receiveShadow = true;
    doorMesh.name = 'door_planks';
    door.add(doorMesh);
    const dm = new THREE.Mesh(merge(doorMetal), cabinMetalMaterial());
    dm.castShadow = true;
    dm.name = 'door_metal';
    door.add(dm);
    root.add(door);
    root.add(group('door_latch', L.doorX - L.doorW / 2 + 0.2, F + 1.05, D / 2 - 0.2));

    // ---------- scalenie ----------
    const main = new THREE.Mesh(merge(wood), cabinWoodMaterial());
    main.name = 'cabin_wood';
    main.castShadow = true;
    main.receiveShadow = true;
    root.add(main);
    const met = new THREE.Mesh(merge(metal), cabinMetalMaterial());
    met.name = 'cabin_metal';
    met.castShadow = true;
    root.add(met);
    const gl = new THREE.Mesh(merge(glass), new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.08, metalness: 0.2, emissive: 0x2a1a08, emissiveIntensity: 0.35 }));
    gl.name = 'cabin_glass';
    root.add(gl);
    const fl = new THREE.Mesh(flame, new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xffa040, emissiveIntensity: 3 }));
    fl.name = 'lantern_flame';
    root.add(fl);
    root.add(group('lantern', lx, ly, lz));
    return root;
  }
}

let woodMat: THREE.MeshStandardMaterial | null = null;
let metalMat: THREE.MeshStandardMaterial | null = null;
export function cabinWoodMaterial(): THREE.MeshStandardMaterial {
  if (!woodMat) woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  return woodMat;
}
export function cabinMetalMaterial(): THREE.MeshStandardMaterial {
  if (!metalMat) metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.6 });
  return metalMat;
}

/** Łódka wiosłowa (drewno, klepki, dwie ławki, wiosła). Dziób = +Z, dno na y = 0, linia wody ~0,12. */
export class BoatFactory implements AssetFactory {
  create(): THREE.Object3D {
    const rng = new Rng(17);
    const parts: THREE.BufferGeometry[] = [];
    const len = 3.2;
    const beam = 1.15;
    const depth = 0.48;
    const sections: THREE.Vector3[][] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N; // 0 rufa … 1 dziób
      const z = (t - 0.5) * len;
      const wmul = t < 0.6 ? lerp(0.78, 1, smoothstep(0, 0.45, t)) : lerp(1, 0.02, smoothstep(0.6, 1, t) ** 1.2);
      const hw = (beam / 2) * wmul;
      const sheer = depth + 0.12 * smoothstep(0.65, 1, t) + 0.04 * (1 - smoothstep(0, 0.2, t));
      const bottom = 0.06 * smoothstep(0.7, 1, t);
      const ring: THREE.Vector3[] = [];
      const K = 8;
      for (let k = 0; k <= K; k++) {
        const a = (k / K) * Math.PI; // 0 lewa burta … π prawa burta
        const cx = -Math.cos(a) * hw;
        const cy = bottom + (1 - Math.sin(a) ** 0.6) * (sheer - bottom);
        ring.push(V(cx, cy, z));
      }
      sections.push(ring);
    }
    // kadłub (zewnątrz + wewnątrz: obustronny materiał)
    const hull = flatLoft(sections);
    parts.push(
      paint(hull, (p, _n, out) => {
        const plank = Math.floor(p.y / 0.085);
        out.copy(C(0x9a6a3e)).multiplyScalar(0.85 + 0.12 * ((plank * 7) % 3) / 2);
        if (p.y > depth - 0.03) out.copy(C(0x6a4428));
      }),
    );
    // ławki
    for (const z of [-0.55, 0.45]) parts.push(box(beam * 0.86, 0.04, 0.22, 0, depth - 0.12, z, C(0xb08050)));
    // wiosła
    for (const s of [-1, 1]) {
      const oar = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 5);
      oar.rotateX(Math.PI / 2);
      oar.rotateY(s * 0.12);
      oar.translate(s * 0.28, depth - 0.07, 0.1);
      parts.push(solid(flat(oar), C(0xc49060)));
      parts.push(box(0.14, 0.02, 0.45, s * 0.28 + s * 0.13, depth - 0.07, 1.15, C(0xc49060)));
    }
    rng.next();
    const g = group('boat');
    const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'boat_hull';
    g.add(m);
    return g;
  }
}

function flatLoft(sections: THREE.Vector3[][]): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let s = 0; s < sections.length - 1; s++) {
    const a = sections[s];
    const b = sections[s + 1];
    for (let k = 0; k < a.length - 1; k++) {
      pts.push(a[k].x, a[k].y, a[k].z, a[k + 1].x, a[k + 1].y, a[k + 1].z, b[k].x, b[k].y, b[k].z);
      pts.push(a[k + 1].x, a[k + 1].y, a[k + 1].z, b[k + 1].x, b[k + 1].y, b[k + 1].z, b[k].x, b[k].y, b[k].z);
    }
  }
  // zamknięcie rufy (pawęż)
  const r = sections[0];
  for (let k = 1; k < r.length - 2; k++) pts.push(r[0].x, r[0].y, r[0].z, r[k + 1].x, r[k + 1].y, r[k + 1].z, r[k].x, r[k].y, r[k].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.computeVertexNormals();
  return g;
}
