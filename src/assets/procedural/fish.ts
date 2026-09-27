import * as THREE from 'three';
import { CFG, type SpeciesId } from '../../config';
import type { AssetFactory, AssetOptions } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group } from '../materials';
import { lerp, smoothstep } from '../../core/math';
import { tex, type TexName } from '../../render/textures';

/** Wygląd materiału (połysk łusek) i grubość ciała względem długości. */
interface FishLook {
  /** grubość ciała (pełna szerokość / długość) */
  w: number;
  metal: number;
  rough: number;
}

const LOOKS: Record<SpeciesId, FishLook> = {
  ploc: { w: 0.11, metal: 0.35, rough: 0.35 },
  okon: { w: 0.12, metal: 0.15, rough: 0.5 },
  karas: { w: 0.17, metal: 0.3, rough: 0.42 },
  leszcz: { w: 0.1, metal: 0.25, rough: 0.45 },
  karp: { w: 0.18, metal: 0.3, rough: 0.42 },
};

/**
 * Obrys ciała (bez płetw) odczytany z ilustracji z arkuszy 04–08 (public/textures/fish/*.webp, wykadrowane
 * od pyska do końca ogona): górna i dolna krawędź w % wysokości obrazu co 5 % długości, od pyska (u = 0)
 * do nasady ogona (`ped`). `aspect` = wysokość / szerokość obrazu.
 */
interface FishArt {
  aspect: number;
  ped: number;
  top: number[];
  bot: number[];
}

const ART: Record<SpeciesId, FishArt> = {
  ploc: {
    aspect: 340 / 720,
    ped: 0.82,
    top: [48, 38, 30, 26, 24, 22, 21, 20, 20, 21, 23, 26, 29, 32, 36, 38, 39],
    bot: [55, 64, 70, 74, 76, 77, 78, 78, 78, 77, 75, 73, 70, 66, 62, 60, 59],
  },
  okon: {
    aspect: 368 / 720,
    ped: 0.85,
    top: [48, 40, 34, 29, 26, 24, 23, 22, 22, 22, 23, 25, 28, 32, 36, 40, 43, 44],
    bot: [57, 64, 68, 71, 74, 76, 77, 78, 78, 78, 77, 76, 74, 72, 69, 64, 60, 58],
  },
  karas: {
    aspect: 432 / 720,
    ped: 0.81,
    top: [51, 42, 33, 26, 22, 19, 17, 16, 16, 17, 18, 21, 26, 31, 35, 39, 41],
    bot: [59, 66, 72, 76, 79, 81, 82, 83, 83, 82, 80, 77, 73, 69, 64, 59, 56],
  },
  leszcz: {
    aspect: 414 / 720,
    ped: 0.81,
    top: [50, 41, 32, 26, 22, 20, 18, 17, 16, 16, 17, 19, 22, 27, 32, 37, 40],
    bot: [57, 62, 68, 73, 77, 79, 81, 82, 82, 81, 79, 76, 72, 67, 62, 57, 53],
  },
  karp: {
    aspect: 358 / 720,
    ped: 0.84,
    top: [47, 38, 30, 24, 21, 19, 18, 17, 17, 17, 18, 20, 23, 27, 31, 36, 39, 40],
    bot: [57, 64, 70, 74, 77, 79, 80, 81, 81, 80, 79, 77, 75, 72, 68, 63, 59, 57],
  },
};

/** Wartość z tablicy próbek co 0,05 (interpolacja liniowa, poza zakresem – ostatnia). */
function sample(arr: number[], u: number): number {
  const f = Math.max(0, u / 0.05);
  const i = Math.min(arr.length - 1, Math.floor(f));
  const j = Math.min(arr.length - 1, i + 1);
  return lerp(arr[i], arr[j], f - i) / 100;
}

function fishMaterial(species: SpeciesId): THREE.MeshStandardMaterial {
  const look = LOOKS[species];
  const m = new THREE.MeshStandardMaterial({
    map: tex(`fish_${species}` as TexName),
    side: THREE.DoubleSide,
    roughness: look.rough,
    metalness: look.metal,
    alphaTest: 0.5,
  });
  const uniforms = {
    uTime: { value: 0 },
    uSwim: { value: 1 },
    uSwimFreq: { value: 9 },
    uWaterY: { value: CFG.water.level },
    uFade: { value: CFG.water.underwaterFade },
    uWaterColor: { value: new THREE.Color(CFG.water.deepColor) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform float uSwim; uniform float uSwimFreq;
         attribute float aFin;
         varying float vFin;
         varying float vFishWorldY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vFin = aFin;
         // pływanie: fala biegnąca od głowy do ogona, amplituda rośnie ku ogonowi
         float tailW = pow(clamp(0.55 - transformed.z, 0.0, 1.3), 2.0);
         transformed.x += sin(transformed.z * 8.0 - uTime * uSwimFreq) * uSwim * tailW * 0.075;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vFishWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWaterY; uniform float uFade; uniform vec3 uWaterColor;
         varying float vFin;
         varying float vFishWorldY;`,
      )
      // ciało zawsze pełne; wycinanie alfą tylko na płaszczyźnie płetw
      .replace('#include <alphatest_fragment>', 'diffuseColor.a = mix(1.0, diffuseColor.a, vFin);\n#include <alphatest_fragment>')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         // widoczność pod wodą zanika z głębokością
         float under = max(uWaterY - vFishWorldY, 0.0);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterColor, clamp(under * uFade, 0.0, 0.9));`,
      );
  };
  m.customProgramCacheKey = () => 'fish-swim-v2';
  return m;
}

/**
 * Ryba o długości 1 (skalowana do lengthM): bryła ciała z obrysu ilustracji + płaszczyzna płetw (wycięta alfą),
 * ilustracja rzutowana z boku (łuski, pręgi, oko, płetwy piersiowe). Oś +Z = pysk, pivot `mouth` na pysku.
 * Jedna siatka, jeden materiał (1 draw call).
 */
export class FishFactory implements AssetFactory {
  private geoCache = new Map<SpeciesId, THREE.BufferGeometry>();

  create(opts?: AssetOptions): THREE.Object3D {
    const species = opts?.species ?? 'ploc';
    let geo = this.geoCache.get(species);
    if (!geo) {
      geo = this.build(species);
      this.geoCache.set(species, geo);
    }
    const art = ART[species];
    const root = group(`fish_${species}`);
    const m = new THREE.Mesh(geo, fishMaterial(species));
    m.name = 'fish_body';
    m.castShadow = true;
    m.receiveShadow = false;
    root.add(m);
    const snoutV = (art.top[0] + art.bot[0]) / 200;
    const mouth = group(PIVOTS.mouth, 0, (0.5 - snoutV) * art.aspect, 0.5);
    root.add(mouth);
    root.scale.setScalar(opts?.lengthM ?? 0.25);
    return root;
  }

  private build(species: SpeciesId): THREE.BufferGeometry {
    const art = ART[species];
    const look = LOOKS[species];
    const A = art.aspect;
    const pos: number[] = [];
    const uv: number[] = [];
    const fin: number[] = [];
    const idx: number[] = [];
    const vert = (x: number, y: number, z: number, u: number, v: number, f: number) => {
      pos.push(x, y, z);
      uv.push(u, 1 - v);
      fin.push(f);
      return pos.length / 3 - 1;
    };
    // --- ciało: pierścienie eliptyczne wzdłuż długości ---
    const seg = 18;
    const us: number[] = [0, 0.012, 0.03, 0.055, 0.085];
    for (let u = 0.12; u < art.ped - 0.02; u += 0.045) us.push(u);
    us.push(art.ped);
    const rings: number[][] = [];
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      const top = sample(art.top, u);
      const bot = sample(art.bot, u);
      const k = i === 0 ? 0.35 : 1; // pysk: zaokrąglenie
      const vc = (top + bot) / 2;
      const hh = ((bot - top) / 2) * k;
      const e = u / art.ped;
      const ww = (look.w / 2) * Math.max(0.18, Math.pow(smoothstep(0, 0.32, e), 0.5) * (1 - 0.72 * smoothstep(0.42, 1, e)));
      const ring: number[] = [];
      for (let a = 0; a < seg; a++) {
        const ang = (a / seg) * Math.PI * 2;
        // grzbiet wyżej wysklepiony niż brzuch; przekrój wykorzystuje tę samą rzutowaną współrzędną v
        const cy = Math.cos(ang);
        const v = vc - cy * hh;
        const x = Math.sin(ang) * ww * k;
        ring.push(vert(x, (0.5 - v) * A, 0.5 - u, u, v, 0));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let a = 0; a < seg; a++) {
        const a0 = rings[i][a];
        const a1 = rings[i][(a + 1) % seg];
        const b0 = rings[i + 1][a];
        const b1 = rings[i + 1][(a + 1) % seg];
        idx.push(a0, a1, b0, a1, b1, b0);
      }
    }
    // zamknięcie pyska i nasady ogona
    const cap = (ring: number[], u: number, front: boolean) => {
      const v = (sample(art.top, u) + sample(art.bot, u)) / 2;
      const c = vert(0, (0.5 - v) * A, 0.5 - u + (front ? 0.004 : 0), u, v, 0);
      for (let a = 0; a < seg; a++) {
        if (front) idx.push(c, ring[(a + 1) % seg], ring[a]);
        else idx.push(c, ring[a], ring[(a + 1) % seg]);
      }
    };
    cap(rings[0], 0, true);
    cap(rings[rings.length - 1], art.ped, false);
    // --- płaszczyzna płetw: cały obraz w płaszczyźnie x = 0, wycinany alfą ---
    const nu = 26;
    const nv = 3;
    const grid: number[][] = [];
    for (let j = 0; j <= nv; j++) {
      const row: number[] = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        row.push(vert(0, (0.5 - v) * A, 0.5 - u, u, v, 1));
      }
      grid.push(row);
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) idx.push(grid[j][i], grid[j + 1][i], grid[j][i + 1], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    // płetwy: normalna ±X (liczona per ściana przez DoubleSide)
    const nor = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < fin.length; i++) if (fin[i] > 0.5) nor.setXYZ(i, 1, 0, 0);
    g.computeBoundingSphere();
    return g;
  }
}
