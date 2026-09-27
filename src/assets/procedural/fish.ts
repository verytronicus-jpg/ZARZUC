import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG, type SpeciesId } from '../../config';
import type { AssetFactory, AssetOptions } from '../AssetRegistry';
import { PIVOTS } from '../AssetRegistry';
import { group } from '../materials';
import { clamp01, smoothstep } from '../../core/math';

interface FishLook {
  /** wysokość i szerokość ciała względem długości */
  h: number;
  w: number;
  back: number;
  flank: number;
  belly: number;
  fin: number;
  lowerFin: number;
  eye: number;
  stripes: boolean;
  twoDorsals: boolean;
  longAnal: boolean;
  metal: number;
  rough: number;
  barbels: boolean;
}

const LOOKS: Record<SpeciesId, FishLook> = {
  ploc: { h: 0.27, w: 0.11, back: 0x3a4a52, flank: 0xc9d1d4, belly: 0xf1f1ec, fin: 0x9a8a78, lowerFin: 0xd9502e, eye: 0xc8201a, stripes: false, twoDorsals: false, longAnal: false, metal: 0.45, rough: 0.35, barbels: false },
  okon: { h: 0.28, w: 0.12, back: 0x3b4a22, flank: 0x9aa55a, belly: 0xe8e2c4, fin: 0x5a5a40, lowerFin: 0xe0401c, eye: 0xd9b030, stripes: true, twoDorsals: true, longAnal: false, metal: 0.15, rough: 0.55, barbels: false },
  karas: { h: 0.44, w: 0.17, back: 0x4a3e1c, flank: 0xc49a3a, belly: 0xe8d49a, fin: 0x7a5a2a, lowerFin: 0x8a6030, eye: 0xc9a040, stripes: false, twoDorsals: false, longAnal: false, metal: 0.35, rough: 0.45, barbels: false },
  leszcz: { h: 0.38, w: 0.09, back: 0x3c3526, flank: 0x9b8155, belly: 0xd8c9a2, fin: 0x3a3228, lowerFin: 0x4a3a2a, eye: 0x9a9070, stripes: false, twoDorsals: false, longAnal: true, metal: 0.3, rough: 0.5, barbels: false },
  karp: { h: 0.3, w: 0.19, back: 0x4a4520, flank: 0xb89a3e, belly: 0xe2cf8c, fin: 0x6a5a30, lowerFin: 0x9a6a32, eye: 0xc9a040, stripes: false, twoDorsals: false, longAnal: false, metal: 0.35, rough: 0.45, barbels: true },
};

const tmpC = new THREE.Color();

function colorize(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): void {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), tmpC);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function solid(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  colorize(geo, (_x, _y, _z, out) => out.copy(c));
  return geo;
}

function strip(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Trójkątna płetwa w płaszczyźnie (0, y, z). */
function fin(points: Array<[number, number, number]>, hex: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const arr: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    arr.push(...points[0], ...points[i], ...points[i + 1]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return solid(g, hex);
}

/** profil ciała: t = 0 ogon … 1 pysk */
function bodyProfile(t: number): number {
  const b = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.2))), 0.7);
  return Math.max(b, 0.16 * (1 - t) * (1 - t) + (t < 0.05 ? 0.16 : 0));
}

export function fishMaterial(look?: FishLook): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: look?.rough ?? 0.5,
    metalness: look?.metal ?? 0.3,
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
         varying float vFishWorldY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
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
         varying float vFishWorldY;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         // widoczność pod wodą zanika z głębokością
         float under = max(uWaterY - vFishWorldY, 0.0);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, uWaterColor, clamp(under * uFade, 0.0, 0.9));`,
      );
  };
  m.customProgramCacheKey = () => 'fish-swim-v1';
  return m;
}

/**
 * Ryba proceduralna o długości 1 (skalowana do lengthM). Oś +Z = pysk, pivot `mouth` na pysku.
 * Całość to JEDNA siatka z kolorami wierzchołków (1 draw call).
 */
export class FishFactory implements AssetFactory {
  private geoCache = new Map<SpeciesId, THREE.BufferGeometry>();

  create(opts?: AssetOptions): THREE.Object3D {
    const species = opts?.species ?? 'ploc';
    const look = LOOKS[species];
    let geo = this.geoCache.get(species);
    if (!geo) {
      geo = this.build(look);
      this.geoCache.set(species, geo);
    }
    const root = group(`fish_${species}`);
    const m = new THREE.Mesh(geo, fishMaterial(look));
    m.name = 'fish_body';
    m.castShadow = true;
    m.receiveShadow = false;
    root.add(m);
    const mouth = group(PIVOTS.mouth, 0, look.h * 0.04, 0.5);
    root.add(mouth);
    root.scale.setScalar(opts?.lengthM ?? 0.25);
    return root;
  }

  private build(L: FishLook): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const back = new THREE.Color(L.back);
    const flank = new THREE.Color(L.flank);
    const belly = new THREE.Color(L.belly);
    const dark = new THREE.Color(0x1d2212);

    // --- ciało ---
    const body = new THREE.SphereGeometry(0.5, 28, 16);
    body.rotateX(Math.PI / 2); // bieguny na osi Z
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const t = clamp01(z + 0.5);
      const rho = Math.hypot(x, y);
      const cx = rho > 1e-6 ? x / rho : 0;
      const cy = rho > 1e-6 ? y / rho : 0;
      const prof = bodyProfile(t);
      const hh = (L.h / 2) * prof;
      const hw = (L.w / 2) * Math.pow(prof, 0.85);
      // grzbiet bardziej wysklepiony niż brzuch
      const yy = cy * hh * (cy > 0 ? 1.05 : 0.95) + L.h * 0.03 * prof;
      p.setXYZ(i, cx * hw, yy, z);
    }
    body.computeVertexNormals();
    const bodyG = strip(body);
    colorize(bodyG, (x, y, z, out) => {
      const t = clamp01(z + 0.5);
      const hh = Math.max(1e-4, (L.h / 2) * bodyProfile(t));
      const yn = y / hh;
      out.copy(belly).lerp(flank, smoothstep(-0.75, -0.1, yn)).lerp(back, smoothstep(0.25, 0.85, yn));
      if (L.stripes) {
        const band = Math.sin(t * Math.PI * 7.5 + 0.6);
        if (band > 0.35 && yn > -0.45 && t > 0.15 && t < 0.85) out.lerp(dark, 0.55 * smoothstep(0.35, 0.6, band));
      }
      // pokrywa skrzelowa
      if (t > 0.76 && t < 0.79) out.multiplyScalar(0.8);
      // delikatne "łuski"
      const sc = 0.94 + 0.06 * Math.sin(z * 90 + y * 60) * Math.sin(x * 70);
      out.multiplyScalar(sc);
    });
    parts.push(bodyG);

    const H = L.h;
    // --- płetwa ogonowa ---
    parts.push(
      fin(
        [
          [0, 0, -0.45],
          [0, H * 0.62, -0.7],
          [0, H * 0.12, -0.6],
          [0, -H * 0.12, -0.6],
          [0, -H * 0.62, -0.7],
        ],
        L.fin,
      ),
    );
    if (L === LOOKS.okon || L === LOOKS.ploc) {
      // dolny płat ogona czerwonawy
      parts.push(fin([[0, -0.01, -0.46], [0, -H * 0.12, -0.6], [0, -H * 0.6, -0.69]], L.lowerFin));
    }
    // --- płetwa grzbietowa ---
    const top = (t: number) => (H / 2) * bodyProfile(t) * 1.05 + H * 0.03 * bodyProfile(t) - 0.004;
    if (L.twoDorsals) {
      const z1 = 0.02;
      const z2 = 0.28;
      parts.push(fin([[0, top(z1 + 0.5), z1], [0, top(z1 + 0.5) + H * 0.55, z1 + 0.06], [0, top(z2 + 0.5) + H * 0.35, z2 - 0.05], [0, top(z2 + 0.5), z2]], 0x2a2a1c));
      parts.push(fin([[0, top(0.35), -0.18], [0, top(0.4) + H * 0.35, -0.12], [0, top(0.48) + H * 0.2, -0.02], [0, top(0.48), -0.01]], L.fin));
    } else {
      const z1 = L.longAnal ? -0.02 : -0.05;
      parts.push(fin([[0, top(z1 + 0.5), z1], [0, top(z1 + 0.5) + H * 0.55, z1 + 0.08], [0, top(0.72) + H * 0.12, 0.2], [0, top(0.72), 0.2]], L.fin));
    }
    // --- płetwa odbytowa ---
    const bot = (t: number) => -(H / 2) * bodyProfile(t) * 0.95 + H * 0.03 * bodyProfile(t) + 0.004;
    const aStart = L.longAnal ? -0.3 : -0.28;
    const aEnd = L.longAnal ? 0.05 : -0.14;
    parts.push(fin([[0, bot(aStart + 0.5), aStart], [0, bot(aStart + 0.5) - H * 0.35, aStart + 0.02], [0, bot(aEnd + 0.5) - H * 0.12, aEnd], [0, bot(aEnd + 0.5), aEnd]], L.lowerFin));
    // --- płetwy brzuszne i piersiowe (lekko odchylone na boki) ---
    for (const sx of [-1, 1]) {
      const pelvic = fin([[0, 0, 0], [0, -H * 0.3, -0.09], [0, -H * 0.05, -0.12]], L.lowerFin);
      pelvic.rotateZ(sx * 0.5);
      pelvic.translate(sx * L.w * 0.18, bot(0.52) + 0.01, 0.02);
      parts.push(pelvic);
      const pect = fin([[0, 0, 0], [0, -H * 0.2, -0.1], [0, -H * 0.02, -0.12]], L.lowerFin);
      pect.rotateZ(sx * 1.0);
      pect.translate(sx * L.w * 0.4, -H * 0.12, 0.27);
      parts.push(pect);
    }
    // --- oczy ---
    for (const sx of [-1, 1]) {
      const eyeZ = 0.4;
      const hw = (L.w / 2) * Math.pow(bodyProfile(eyeZ + 0.5), 0.85);
      const iris = strip(new THREE.SphereGeometry(0.022 + H * 0.02, 8, 6));
      solid(iris, L.eye);
      iris.translate(sx * hw * 0.92, H * 0.06, eyeZ);
      parts.push(iris);
      const pupil = strip(new THREE.SphereGeometry(0.013 + H * 0.012, 6, 5));
      solid(pupil, 0x050505);
      pupil.translate(sx * (hw * 0.92 + 0.012), H * 0.06, eyeZ + 0.004);
      parts.push(pupil);
    }
    // --- wąsiki karpia ---
    if (L.barbels) {
      for (const sx of [-1, 1]) {
        const b = strip(new THREE.CylinderGeometry(0.003, 0.005, 0.05, 4));
        solid(b, L.flank);
        b.rotateX(0.9);
        b.translate(sx * 0.02, -H * 0.1, 0.47);
        parts.push(b);
      }
    }
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) throw new Error('Nie udało się zbudować modelu ryby');
    merged.computeBoundingSphere();
    return merged;
  }
}
