/**
 * ŻYŁKA WIZUALNA – lina Verleta (N punktów, K iteracji więzów) przypięta do szczytówki i spławika.
 * Luźna → zwis, napięta → prosta. Segmenty pod wodą mają większy opór i słabszą grawitację.
 * UWAGA: tylko wizualna! Napięcie w rozgrywce liczy TensionModel.
 */
import * as THREE from 'three';
import { CFG } from '../config';

export interface LineEnv {
  waterY(x: number, z: number): number;
  terrainY(x: number, z: number): number;
}

export class VerletLine {
  readonly n: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** pozycje z poprzedniego kroku – do interpolacji w renderze */
  private snap: Float32Array;
  /** czy koniec przypięty (po zerwaniu – luźny koniec) */
  endPinned = true;
  /** żyłka leży na tafli (bez ryby na końcu) – nie tonie pod powierzchnię */
  surfaceClamp = true;
  private initialized = false;

  constructor(n = CFG.line.points) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.snap = new Float32Array(n * 3);
  }

  reset(a: THREE.Vector3, b: THREE.Vector3): void {
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      const k = i * 3;
      this.pos[k] = this.prev[k] = this.snap[k] = x;
      this.pos[k + 1] = this.prev[k + 1] = this.snap[k + 1] = y;
      this.pos[k + 2] = this.prev[k + 2] = this.snap[k + 2] = z;
    }
    this.initialized = true;
  }

  update(dt: number, a: THREE.Vector3, b: THREE.Vector3, length: number, env: LineEnv): void {
    if (!this.initialized) this.reset(a, b);
    const n = this.n;
    const L = CFG.line;
    const P = this.pos;
    const Q = this.prev;
    this.snap.set(P);
    // skok (teleport, start) – zamiast rozciągać się przez pół mapy, żyłka układa się od nowa
    const jump = Math.hypot(P[0] - a.x, P[1] - a.y, P[2] - a.z);
    if (jump > L.resetJump) {
      this.reset(a, b);
      return;
    }
    const g = L.gravity * dt * dt;
    // integracja
    for (let i = 1; i < n - (this.endPinned ? 1 : 0); i++) {
      const k = i * 3;
      const x = P[k];
      const y = P[k + 1];
      const z = P[k + 2];
      const wy = env.waterY(x, z);
      const under = y < wy;
      const damping = under ? L.waterDamping : L.airDamping;
      const vx = (x - Q[k]) * (1 - damping);
      const vy = (y - Q[k + 1]) * (1 - damping);
      const vz = (z - Q[k + 2]) * (1 - damping);
      Q[k] = x;
      Q[k + 1] = y;
      Q[k + 2] = z;
      P[k] = x + vx;
      P[k + 1] = y + vy - g * (under ? 1 - L.waterBuoyancy : 1);
      P[k + 2] = z + vz;
    }
    const direct = a.distanceTo(b);
    // wizualny luz ograniczony do naturalnego zwisu – nadmiar ze szpuli nie robi pętli w powietrzu
    const visual = Math.min(length, direct * (1 + L.visualSlackFrac) + L.visualSlackAbs);
    const total = this.endPinned ? Math.max(visual, direct) : Math.max(Math.min(length, 30), 0.5);
    const seg = total / (n - 1);
    for (let it = 0; it < L.iterations; it++) {
      P[0] = a.x;
      P[1] = a.y;
      P[2] = a.z;
      if (this.endPinned) {
        const e = (n - 1) * 3;
        P[e] = b.x;
        P[e + 1] = b.y;
        P[e + 2] = b.z;
      }
      for (let i = 0; i < n - 1; i++) {
        const k0 = i * 3;
        const k1 = k0 + 3;
        const dx = P[k1] - P[k0];
        const dy = P[k1 + 1] - P[k0 + 1];
        const dz = P[k1 + 2] - P[k0 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - seg) / d;
        const w0 = i === 0 ? 0 : 0.5;
        const w1 = i + 1 === n - 1 && this.endPinned ? 0 : 0.5;
        const ws = w0 + w1 || 1;
        P[k0] += dx * diff * (w0 / ws);
        P[k0 + 1] += dy * diff * (w0 / ws);
        P[k0 + 2] += dz * diff * (w0 / ws);
        P[k1] -= dx * diff * (w1 / ws);
        P[k1 + 1] -= dy * diff * (w1 / ws);
        P[k1 + 2] -= dz * diff * (w1 / ws);
      }
    }
    // tafla (żyłka pływa), dno / ziemia
    for (let i = 1; i < n; i++) {
      const k = i * 3;
      if (this.surfaceClamp) {
        const wy = env.waterY(P[k], P[k + 2]) - 0.004;
        if (P[k + 1] < wy) {
          P[k + 1] = wy;
          // na wodzie tłumienie jak w wodzie
          Q[k + 1] = P[k + 1];
        }
      }
      const gy = env.terrainY(P[k], P[k + 2]) + 0.01;
      if (P[k + 1] < gy) P[k + 1] = gy;
    }
  }

  /**
   * Punkty do narysowania: interpolacja między krokami fizyki (alpha) i dociągnięcie końców do pozycji
   * wyrenderowanej szczytówki i spławika (bez „odrywania się” żyłki od wędki w ruchu).
   */
  renderInto(out: Float32Array, alpha: number, start: THREE.Vector3, end: THREE.Vector3 | null): void {
    const n = this.n;
    const P = this.pos;
    const S = this.snap;
    for (let i = 0; i < n * 3; i++) out[i] = S[i] + (P[i] - S[i]) * alpha;
    const e = (n - 1) * 3;
    const sx = start.x - out[0];
    const sy = start.y - out[1];
    const sz = start.z - out[2];
    const ex = end ? end.x - out[e] : 0;
    const ey = end ? end.y - out[e + 1] : 0;
    const ez = end ? end.z - out[e + 2] : 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ws = (1 - t) * (1 - t);
      const we = t * t;
      out[i * 3] += sx * ws + ex * we;
      out[i * 3 + 1] += sy * ws + ey * we;
      out[i * 3 + 2] += sz * ws + ez * we;
    }
  }
}

/**
 * Żyłka na ekranie: wstęga o stałej szerokości w pikselach (wygładzone krawędzie), punkty wygładzone krzywą
 * Catmull-Rom. Jeden draw call; szerokość i kolor w CFG.line.
 */
export class LineRenderer {
  readonly object: THREE.Mesh;
  private readonly m: number;
  private readonly sub: number;
  private pos: THREE.BufferAttribute;
  private prevA: THREE.BufferAttribute;
  private nextA: THREE.BufferAttribute;
  private pts: Float32Array;
  private readonly uniforms: { uColor: { value: THREE.Color }; uOpacity: { value: number }; uWidth: { value: number }; uResolution: { value: THREE.Vector2 } };

  constructor(n: number, color = 0xeeeeee, opacity = 0.75, width = CFG.line.widthPx) {
    this.sub = n > 2 ? CFG.line.smoothSub : 1;
    this.m = (n - 1) * this.sub + 1;
    const m = this.m;
    this.pts = new Float32Array(m * 3);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(m * 2 * 3), 3);
    this.prevA = new THREE.BufferAttribute(new Float32Array(m * 2 * 3), 3);
    this.nextA = new THREE.BufferAttribute(new Float32Array(m * 2 * 3), 3);
    for (const at of [this.pos, this.prevA, this.nextA]) at.setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(m * 2);
    for (let i = 0; i < m; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const idx: number[] = [];
    for (let i = 0; i < m - 1; i++) {
      const a0 = i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    g.setAttribute('position', this.pos);
    g.setAttribute('aPrev', this.prevA);
    g.setAttribute('aNext', this.nextA);
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uWidth: { value: width },
      uResolution: { value: new THREE.Vector2(1, 1) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aPrev;
        attribute vec3 aNext;
        attribute float aSide;
        uniform vec2 uResolution;
        uniform float uWidth;
        varying float vSide;
        void main() {
          mat4 mvp = projectionMatrix * modelViewMatrix;
          vec4 c = mvp * vec4(position, 1.0);
          vec4 p = mvp * vec4(aPrev, 1.0);
          vec4 n = mvp * vec4(aNext, 1.0);
          vec2 sp = p.xy / max(abs(p.w), 1e-4);
          vec2 sn = n.xy / max(abs(n.w), 1e-4);
          vec2 d = (sn - sp) * uResolution;
          float dl = length(d);
          vec2 dir = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          // +1 px na wygładzenie krawędzi
          c.xy += nrm * aSide * (uWidth + 1.0) / uResolution * c.w;
          vSide = aSide;
          gl_Position = c;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uWidth;
        varying float vSide;
        void main() {
          float w = uWidth + 1.0;
          float a = clamp((1.0 - abs(vSide)) * w * 0.5 + 0.25, 0.0, 1.0);
          gl_FragColor = vec4(uColor, uOpacity * a * min(1.0, uWidth));
          #include <colorspace_fragment>
        }`,
    });
    this.object = new THREE.Mesh(g, mat);
    this.object.frustumCulled = false;
    this.object.renderOrder = 3;
    const vp = new THREE.Vector4();
    this.object.onBeforeRender = (renderer) => {
      renderer.getCurrentViewport(vp);
      this.uniforms.uResolution.value.set(Math.max(1, vp.z), Math.max(1, vp.w));
    };
  }

  set(points: Float32Array): void {
    const n = points.length / 3;
    const sub = this.sub;
    const P = this.pts;
    if (sub === 1) P.set(points.subarray(0, this.m * 3));
    else {
      // Catmull-Rom przez punkty liny
      let o = 0;
      for (let i = 0; i < n - 1; i++) {
        const i0 = Math.max(0, i - 1) * 3;
        const i1 = i * 3;
        const i2 = (i + 1) * 3;
        const i3 = Math.min(n - 1, i + 2) * 3;
        for (let s = 0; s < sub; s++) {
          const t = s / sub;
          const t2 = t * t;
          const t3 = t2 * t;
          for (let c = 0; c < 3; c++) {
            const p0 = points[i0 + c];
            const p1 = points[i1 + c];
            const p2 = points[i2 + c];
            const p3 = points[i3 + c];
            P[o + c] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
          }
          o += 3;
        }
      }
      const e = (n - 1) * 3;
      P[o] = points[e];
      P[o + 1] = points[e + 1];
      P[o + 2] = points[e + 2];
    }
    this.upload();
  }

  setSegment(a: THREE.Vector3, b: THREE.Vector3): void {
    const P = this.pts;
    const m = this.m;
    for (let i = 0; i < m; i++) {
      const t = i / (m - 1);
      P[i * 3] = a.x + (b.x - a.x) * t;
      P[i * 3 + 1] = a.y + (b.y - a.y) * t;
      P[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.upload();
  }

  private upload(): void {
    const m = this.m;
    const P = this.pts;
    const pos = this.pos.array as Float32Array;
    const pr = this.prevA.array as Float32Array;
    const nx = this.nextA.array as Float32Array;
    for (let i = 0; i < m; i++) {
      const ip = Math.max(0, i - 1) * 3;
      const inx = Math.min(m - 1, i + 1) * 3;
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        for (let c = 0; c < 3; c++) {
          pos[o + c] = P[i * 3 + c];
          pr[o + c] = P[ip + c];
          nx[o + c] = P[inx + c];
        }
      }
    }
    this.pos.needsUpdate = true;
    this.prevA.needsUpdate = true;
    this.nextA.needsUpdate = true;
  }
}
