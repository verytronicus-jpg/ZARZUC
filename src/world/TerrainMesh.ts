import * as THREE from 'three';
import { CFG } from '../config';
import { smoothstep } from '../core/math';
import type { Heightmap } from './Heightmap';
import { lakeR, pathMask, clearingMask, boundsDistance, shoreDistance } from './terrainMath';
import { reflectable } from '../render/layers';
import { terrainMaterial } from '../render/materialsFx';

/**
 * Siatka terenu z heightmapy: kolory wierzchołków (widok z daleka, dno jeziora) i wagi splattingu tekstur
 * (A = trawa, ściółka, ścieżka, piasek · B = dno, skała, las z daleka). Trójkąty dzielone jak w Heightmap.heightAt.
 */
export function buildTerrainMesh(hm: Heightmap): THREE.Mesh {
  const nx = hm.nx;
  const nz = hm.nz;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const splatA = new Float32Array(nx * nz * 4);
  const splatB = new Float32Array(nx * nz * 3);
  const wgt = [0, 0, 0, 0, 0, 0];
  const mixTo = (idx: number, k: number) => {
    for (let q = 0; q < 6; q++) wgt[q] *= 1 - k;
    wgt[idx] += k;
  };
  const grassA = new THREE.Color(0x6f8a2e);
  const grassB = new THREE.Color(0xa3a340);
  const grassDry = new THREE.Color(0xb8a456);
  const forest = new THREE.Color(0x4a4a26);
  const needles = new THREE.Color(0x6a5230);
  const sand = new THREE.Color(0xb49a70);
  const mud = new THREE.Color(0x6a6048);
  const bed = new THREE.Color(0x8c8466);
  const deep = new THREE.Color(0x3c4a3a);
  const path = new THREE.Color(0xa88458);
  const pathEdge = new THREE.Color(0x8a7040);
  const rock = new THREE.Color(0x8c8678);
  const clearing = new THREE.Color(0x9aa244);
  const canopy = new THREE.Color(0x2f4222);
  const c = new THREE.Color();
  const W = CFG.world;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = hm.xs[i];
      const z = hm.zs[j];
      const h = hm.heights[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      const r = lakeR(x, z);
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17 - x * 0.05);
      const n2 = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.7) * Math.sin(z * 1.1 - x * 0.4);
      wgt.fill(0);
      let canopyW = 0;
      if (r < 1) {
        const d = -h;
        const sandW = 1 - smoothstep(0.05, 0.55, d);
        wgt[3] = sandW;
        wgt[4] = 1 - sandW;
        c.copy(bed).lerp(sand, 1 - smoothstep(0.0, 0.5, d)).lerp(mud, smoothstep(0.6, 2.0, d) * 0.6).lerp(deep, smoothstep(1.8, 4.2, d));
        // jasne kamienie na dnie przy brzegu
        c.multiplyScalar(0.9 + 0.2 * n2);
      } else {
        const bd = boundsDistance(x, z);
        const forestW = smoothstep(-4, 12, bd) * (1 - clearingMask(x, z));
        wgt[0] = 1 - forestW;
        wgt[1] = forestW;
        c.copy(grassA).lerp(grassB, n).lerp(grassDry, smoothstep(0.55, 1, n2) * 0.45);
        c.lerp(forest, forestW * 0.75).lerp(needles, forestW * smoothstep(0.4, 0.9, n) * 0.4);
        c.lerp(clearing, clearingMask(x, z) * 0.5);
        const shoreW = 1 - smoothstep(1.0, 1.035, r);
        c.lerp(sand, shoreW);
        mixTo(3, shoreW);
        // skalisty cypel
        const pd = Math.hypot(x - W.pointX, z - W.pointZ) / (W.pointRadius * 1.5);
        const rockW = (1 - smoothstep(0.3, 1, pd)) * 0.9;
        c.lerp(rock, rockW * 0.78);
        mixTo(5, rockW);
        // ścieżka (udeptana ziemia) z ciemniejszym brzegiem
        const pm = x > -40 && x < 20 && z > 30 && z < 100 ? pathMask(x, z) : 0;
        if (pm > 0) {
          c.lerp(pathEdge, smoothstep(0, 0.5, pm) * 0.6).lerp(path, smoothstep(0.35, 1, pm));
          mixTo(2, smoothstep(0.15, 0.85, pm));
        }
        // las poza obszarem gry: ciemne dno lasu / korony widziane z daleka
        const far = Math.max(smoothstep(20, 60, bd), smoothstep(8, 30, shoreDistance(x, z, r)) * smoothstep(0, 20, bd));
        c.lerp(canopy, far * 0.85);
        canopyW = far;
        c.multiplyScalar(0.92 + 0.08 * n2);
      }
      col.set([c.r, c.g, c.b], k * 3);
      splatA.set([wgt[0], wgt[1], wgt[2], wgt[3]], k * 4);
      splatB.set([wgt[4], wgt[5], canopyW], k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i; // (i,j)
      const b = (j + 1) * nx + i; // (i,j+1)
      const c1 = j * nx + i + 1; // (i+1,j)
      const d = (j + 1) * nx + i + 1; // (i+1,j+1)
      // ten sam podział co Heightmap.heightAt
      idx.push(a, b, c1, c1, b, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSplatA', new THREE.BufferAttribute(splatA, 4));
  geo.setAttribute('aSplatB', new THREE.BufferAttribute(splatB, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, terrainMaterial());
  reflectable(m);
  m.receiveShadow = true;
  m.name = 'terrain';
  return m;
}
