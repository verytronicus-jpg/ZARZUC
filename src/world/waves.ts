/**
 * Fale Gerstnera – JEDNA definicja dla CPU i GPU.
 * GPU dostaje te same parametry (uniformy) i ten sam wzór (WATER_WAVES_GLSL).
 * CPU liczy wysokość w punkcie świata odwracając przesunięcie poziome (iteracja punktu stałego).
 */
import { CFG, G } from '../config';
import { DEG } from '../core/math';

export const MAX_WAVES = 4;

interface WaveParam {
  dx: number;
  dz: number;
  k: number;
  omega: number;
  amp: number;
  q: number;
  phase: number;
}

let params: WaveParam[] = [];

export function refreshWaves(): WaveParam[] {
  params = CFG.water.waves.slice(0, MAX_WAVES).map((w, i) => {
    const k = (2 * Math.PI) / w.wavelength;
    return {
      dx: Math.cos(w.dirDeg * DEG),
      dz: Math.sin(w.dirDeg * DEG),
      k,
      omega: Math.sqrt(G * k),
      amp: w.amplitude,
      // Q·k·A ≤ 1/N zapobiega pętlom
      q: Math.min(w.steepness, 1 / (k * Math.max(w.amplitude, 1e-6) * MAX_WAVES)),
      phase: i * 1.7,
    };
  });
  return params;
}
refreshWaves();

/** Przesunięcie Gerstnera punktu spoczynkowego (x0,z0). */
export function gerstner(x0: number, z0: number, t: number): { x: number; y: number; z: number } {
  gerstnerInto(x0, z0, t);
  return { x: gs.x, y: gs.y, z: gs.z };
}

/** Wynik gerstnerInto (bez alokacji w gorących pętlach). */
const gs = { x: 0, y: 0, z: 0 };
function gerstnerInto(x0: number, z0: number, t: number): void {
  let x = x0;
  let z = z0;
  let y = 0;
  for (let i = 0; i < params.length; i++) {
    const w = params[i];
    const ph = w.k * (w.dx * x0 + w.dz * z0) - w.omega * t + w.phase;
    const c = Math.cos(ph);
    x += w.q * w.amp * w.dx * c;
    z += w.q * w.amp * w.dz * c;
    y += w.amp * Math.sin(ph);
  }
  gs.x = x;
  gs.y = y + CFG.water.level;
  gs.z = z;
}

/** Wysokość powierzchni wody w punkcie świata (x,z) w chwili t. */
export function waterHeight(x: number, z: number, t: number): number {
  let px = x;
  let pz = z;
  for (let i = 0; i < 4; i++) {
    gerstnerInto(px, pz, t);
    px -= gs.x - x;
    pz -= gs.z - z;
  }
  gerstnerInto(px, pz, t);
  return gs.y;
}

/**
 * Przybliżona wysokość wody (jedno wyliczenie fal zamiast iteracji odwrotnej) – do wizualiów, gdzie błąd
 * rzędu milimetrów nie ma znaczenia (np. żyłka leżąca na tafli). Fizyka spławika używa waterHeight().
 */
export function waterHeightFast(x: number, z: number, t: number): number {
  gerstnerInto(x, z, t);
  return gs.y;
}

/** Fragment GLSL – identyczny wzór jak gerstner() powyżej. */
export const WATER_WAVES_GLSL = /* glsl */ `
uniform vec4 uWaveA[${MAX_WAVES}]; // dx, dz, k, omega
uniform vec4 uWaveB[${MAX_WAVES}]; // amp, q, phase, -
uniform float uTime;
uniform float uWaterLevel;

vec3 gerstnerPos(vec2 p0, out vec3 nrm) {
  vec3 pos = vec3(p0.x, 0.0, p0.y);
  vec3 tx = vec3(1.0, 0.0, 0.0);
  vec3 tz = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    float ph = a.z * dot(a.xy, p0) - a.w * uTime + b.z;
    float c = cos(ph);
    float s = sin(ph);
    float qa = b.y * b.x;
    pos.x += qa * a.x * c;
    pos.z += qa * a.y * c;
    pos.y += b.x * s;
    // pochodne (analityczna normalna)
    float ka = a.z * b.x;
    tx += vec3(-qa * a.x * a.x * a.z * s, ka * a.x * c, -qa * a.x * a.y * a.z * s);
    tz += vec3(-qa * a.x * a.y * a.z * s, ka * a.y * c, -qa * a.y * a.y * a.z * s);
  }
  nrm = normalize(cross(tz, tx));
  pos.y += uWaterLevel;
  return pos;
}
`;

export function waveUniformArrays(): { a: number[][]; b: number[][] } {
  const a: number[][] = [];
  const b: number[][] = [];
  for (let i = 0; i < MAX_WAVES; i++) {
    const w = params[i];
    if (w) {
      a.push([w.dx, w.dz, w.k, w.omega]);
      b.push([w.amp, w.q, w.phase, 0]);
    } else {
      a.push([1, 0, 1, 1]);
      b.push([0, 0, 0, 0]);
    }
  }
  return { a, b };
}
