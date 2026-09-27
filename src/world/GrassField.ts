import * as THREE from 'three';
import { CFG } from '../config';
import { Rng } from '../core/Rng';
import { clamp01, smoothstep } from '../core/math';
import { windUniforms } from './wind';

/**
 * Trawa na wietrze: kępki źdźbeł (instancje), wiatr w shaderze (podmuchy przesuwające się po łące),
 * uginanie się pod graczem, zanik z odległością. Z puli wszystkich kępek w każdej chwili rysowane są tylko te
 * w promieniu od gracza (odświeżane co kilka metrów) – jeden draw call, gęsto przy postaci.
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  /** gotowe macierze (16 liczb) i odcienie wszystkich kępek – odświeżanie to tylko kopiowanie */
  private mats: Float32Array;
  private tints: Float32Array;
  private px: Float32Array;
  private pz: Float32Array;
  /** siatka przestrzenna: komórka → indeksy kępek */
  private cells = new Map<number, number[]>();
  private cellSize = 8;
  private count = 0;
  private focus = new THREE.Vector3(1e9, 0, 1e9);
  readonly uniforms = {
    uPlayer: { value: new THREE.Vector3(0, -100, 0) },
    uRadius: { value: 40 },
  };

  constructor(candidates: (rng: Rng) => Array<[number, number, number]>, seed: number) {
    const rng = new Rng(seed);
    const pts = candidates(rng);
    const n = pts.length;
    this.mats = new Float32Array(n * 16);
    this.tints = new Float32Array(n);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    pts.forEach(([x, y, z], i) => {
      const rot = rng.range(0, Math.PI * 2);
      const s = rng.range(0.7, 1.35);
      this.tints[i] = rng.range(0.82, 1.15);
      q.setFromAxisAngle(up, rot);
      sc.set(s, s * (0.85 + 0.3 * clamp01(s - 0.7)), s);
      m.compose(p.set(x, y, z), q, sc);
      m.toArray(this.mats, i * 16);
      this.px[i] = x;
      this.pz[i] = z;
      const key = this.cellKey(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(i);
    });
    const G = CFG.grass;
    const geo = GrassField.clumpGeometry(rng);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniforms.uTime;
      shader.uniforms.uWind = windUniforms.uWind;
      shader.uniforms.uPlayer = u.uPlayer;
      shader.uniforms.uRadius = u.uRadius;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime; uniform float uWind; uniform vec3 uPlayer; uniform float uRadius;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
           // trawa oświetlona jak powierzchnia łąki (normalna w górę) – miękko, bez ciemnych boków źdźbeł
           objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.8));`,
        );
      // obie strony źdźbła z tą samą normalną (bez ciemnych „pleców” przy DoubleSide)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
      );
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vec3 ip = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
           float h = max(position.y, 0.0);
           float bend = h * h;
           // podmuchy: fala przesuwająca się po łące + drobne drganie
           float gust = sin(dot(ip.xz, vec2(0.11, 0.07)) - uTime * 1.3) * 0.5 + 0.5;
           gust = gust * gust;
           float flutter = sin(uTime * 3.7 + ip.x * 1.7 + ip.z * 2.3 + position.x * 9.0) * 0.25;
           vec2 wdir = normalize(vec2(${G.windDirX.toFixed(3)}, ${G.windDirZ.toFixed(3)}));
           float amp = uWind * (${G.sway.toFixed(3)} + gust * ${G.gust.toFixed(3)});
           // w lokalnym układzie instancji (obrót Y) – odwracamy obrót, żeby wiatr wiał w stałą stronę świata
           mat3 rotI = mat3(instanceMatrix);
           vec3 wLocal = transpose(rotI) * vec3(wdir.x, 0.0, wdir.y);
           float sc = length(rotI[0]);
           transformed += wLocal / max(sc * sc, 1e-3) * (amp + flutter * 0.05) * bend;
           // uginanie pod graczem
           vec2 away = ip.xz - uPlayer.xz;
           float dp = length(away);
           float push = (1.0 - smoothstep(0.2, 1.1, dp)) * step(abs(ip.y - uPlayer.y), 1.5);
           vec3 pLocal = transpose(rotI) * vec3(away.x, 0.0, away.y) / max(dp, 1e-3);
           transformed += pLocal / max(sc * sc, 1e-3) * push * bend * 0.9;
           transformed.y -= push * bend * 0.35;
           // zanik z odległością od środka pola (brak „wyskakiwania”)
           float fade = 1.0 - smoothstep(uRadius * 0.72, uRadius, length(ip.xz - uPlayer.xz));
           transformed *= fade;`,
        );
    };
    mat.customProgramCacheKey = () => 'grass-v2';
    const max = Math.min(G.maxInstances, pts.length);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'grass';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  private cellKey(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  /** Kępka: kilka zakrzywionych, zwężających się źdźbeł z kolorem od ciemnej nasady do złotej końcówki. */
  static clumpGeometry(rng: Rng): THREE.BufferGeometry {
    const G = CFG.grass;
    const pos: number[] = [];
    const col: number[] = [];
    const nor: number[] = [];
    const base = new THREE.Color(G.colorBase);
    const mid = new THREE.Color(G.colorMid);
    const tip = new THREE.Color(G.colorTip);
    const c = new THREE.Color();
    const blades = G.bladesPerClump;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const r = rng.range(0.02, 0.14);
      const ox = Math.cos(a) * r;
      const oz = Math.sin(a) * r;
      const h = G.height * rng.range(0.6, 1.25);
      const w = G.width * rng.range(0.7, 1.2);
      const lean = rng.range(0.15, 0.5);
      const ang = rng.range(0, Math.PI * 2);
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const sx = -dz;
      const sz = dx;
      const dry = rng.chance(0.35);
      const segs = G.segments;
      const ring: number[][] = [];
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const off = lean * h * t * t;
        const y = h * t;
        const ww = w * (1 - t) * 0.5 + (s === segs ? 0 : 0.0015);
        ring.push([ox + dx * off - sx * ww, y, oz + dz * off - sz * ww, ox + dx * off + sx * ww, y, oz + dz * off + sz * ww, t]);
      }
      for (let s = 0; s < segs; s++) {
        const A = ring[s];
        const B = ring[s + 1];
        const quad = [
          [A[0], A[1], A[2], A[6]],
          [B[0], B[1], B[2], B[6]],
          [A[3], A[4], A[5], A[6]],
          [A[3], A[4], A[5], A[6]],
          [B[0], B[1], B[2], B[6]],
          [B[3], B[4], B[5], B[6]],
        ];
        for (const [x, y, z, t] of quad) {
          pos.push(x, y, z);
          nor.push(dx * 0.3, 1, dz * 0.3);
          c.copy(base).lerp(mid, smoothstep(0, 0.5, t)).lerp(tip, smoothstep(0.45, 1, t) * (dry ? 1 : 0.55));
          col.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }

  /**
   * Odświeża zestaw rysowanych kępek wokół gracza (co refreshStep metrów ruchu). Wybór z zapasem refreshStep,
   * więc między odświeżeniami przód pola nie „łysieje”; przegląd tylko komórek siatki w promieniu.
   */
  update(player: THREE.Vector3, density: number, radius: number, force = false): void {
    (this.uniforms.uPlayer.value as THREE.Vector3).copy(player);
    this.uniforms.uRadius.value = radius;
    const step = CFG.grass.refreshStep;
    if (!force && player.distanceToSquared(this.focus) < step * step) return;
    this.focus.copy(player);
    const R = radius + step;
    const R2 = R * R;
    const dst = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    const max = this.mesh.instanceMatrix.count;
    const cs = this.cellSize;
    const c0x = Math.floor((player.x - R) / cs);
    const c1x = Math.floor((player.x + R) / cs);
    const c0z = Math.floor((player.z - R) / cs);
    const c1z = Math.floor((player.z + R) / cs);
    let k = 0;
    for (let cx = c0x; cx <= c1x && k < max; cx++) {
      for (let cz = c0z; cz <= c1z && k < max; cz++) {
        const list = this.cells.get(this.cellKey(cx, cz));
        if (!list) continue;
        for (let j = 0; j < list.length && k < max; j++) {
          const i = list[j];
          const dx = this.px[i] - player.x;
          const dz = this.pz[i] - player.z;
          if (dx * dx + dz * dz > R2) continue;
          // gęstość: deterministycznie (hash indeksu) – bez migotania przy zmianie presetu
          if (((i * 2654435761) >>> 0) / 4294967296 > density) continue;
          dst.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
          const t = this.tints[i];
          col[k * 3] = t;
          col[k * 3 + 1] = t;
          col[k * 3 + 2] = t;
          k++;
        }
      }
    }
    this.count = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.clearUpdateRanges();
    this.mesh.instanceMatrix.addUpdateRange(0, k * 16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.clearUpdateRanges();
    this.mesh.instanceColor!.addUpdateRange(0, k * 3);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  get visibleCount(): number {
    return this.count;
  }
}
