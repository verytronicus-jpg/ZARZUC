import * as THREE from 'three';
import { CFG } from '../config';
import { Rng } from '../core/Rng';

/** Dym z komina: kilkadziesiąt miękkich cząsteczek (punkty z własnym shaderem: rozmiar i przezroczystość wg wieku). */
export class ChimneySmoke {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private life: Float32Array;
  private seed: Float32Array;
  private attrPos: THREE.BufferAttribute;
  private attrLife: THREE.BufferAttribute;
  private rng = new Rng(99);
  private t = 0;

  constructor(private origin: THREE.Vector3) {
    const S = CFG.smoke;
    const n = S.count;
    this.pos = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.life[i] = i / n; // rozłożone w czasie od startu
      this.seed[i] = this.rng.next();
      this.place(i);
    }
    const g = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.pos, 3);
    this.attrPos.setUsage(THREE.DynamicDrawUsage);
    this.attrLife = new THREE.BufferAttribute(this.life, 1);
    this.attrLife.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attrPos);
    g.setAttribute('aLife', this.attrLife);
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uColor: { value: new THREE.Color(S.color) },
          uSize: { value: S.size },
          uScale: { value: 600 },
          uOpacity: { value: S.opacity },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute float aLife;
        attribute float aSeed;
        uniform float uSize;
        uniform float uScale;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife;
          vSeed = aSeed;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = uSize * (0.35 + 1.6 * aLife) * uScale / -mvPosition.z;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vLife;
        varying float vSeed;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c) * 2.0;
          float soft = smoothstep(1.0, 0.2, r) * (0.75 + 0.25 * sin(vSeed * 40.0 + c.x * 9.0 + c.y * 7.0));
          float a = soft * uOpacity * smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
          gl_FragColor = vec4(uColor, a);
          #include <fog_fragment>
        }
      `,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = 'chimney_smoke';
  }

  private place(i: number): void {
    const S = CFG.smoke;
    const l = this.life[i];
    const s = this.seed[i];
    const h = l * S.rise;
    // dryf z wiatrem (rośnie z wysokością) + wir
    this.pos[i * 3] = this.origin.x + S.driftX * h * h * 0.1 + Math.sin(this.t * 0.7 + s * 20) * 0.25 * l;
    this.pos[i * 3 + 1] = this.origin.y + h;
    this.pos[i * 3 + 2] = this.origin.z + S.driftZ * h * h * 0.1 + Math.cos(this.t * 0.6 + s * 13) * 0.25 * l;
  }

  update(dt: number): void {
    const S = CFG.smoke;
    this.t += dt;
    const n = this.life.length;
    for (let i = 0; i < n; i++) {
      this.life[i] += dt / S.lifetime;
      if (this.life[i] >= 1) {
        this.life[i] -= 1;
        this.seed[i] = this.rng.next();
      }
      this.place(i);
    }
    this.attrPos.needsUpdate = true;
    this.attrLife.needsUpdate = true;
  }
}
