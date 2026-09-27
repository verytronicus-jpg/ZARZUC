import * as THREE from 'three';
import { CFG } from '../config';
import { lakeDepth } from './terrainMath';
import { WATER_WAVES_GLSL, waveUniformArrays, refreshWaves, MAX_WAVES } from './waves';

/**
 * Woda: suma fal Gerstnera (wierzchołki, identyczne z CPU), normalna liczona per piksel,
 * fresnel z odbiciem nieba, odblask słońca, kolor i przezroczystość z MAPY GŁĘBOKOŚCI (tekstura).
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly depthTexture: THREE.DataTexture;
  readonly box: { x0: number; z0: number; sx: number; sz: number };

  constructor(sunDir: THREE.Vector3, sunColor: THREE.Color, zenith: THREE.Color, horizon: THREE.Color) {
    const w = CFG.world;
    const m = CFG.water.margin;
    const sx = w.lakeRx * 2 * 1.14 + m * 2;
    const sz = w.lakeRz * 2 * 1.14 + m * 2;
    this.box = { x0: -sx / 2, z0: -sz / 2, sx, sz };

    // --- tekstura głębokości ---
    const N = CFG.water.depthTexSize;
    const data = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = this.box.x0 + ((i + 0.5) / N) * sx;
        const z = this.box.z0 + ((j + 0.5) / N) * sz;
        const d = lakeDepth(x, z);
        data[j * N + i] = Math.round(Math.min(1, d / CFG.water.depthTexMax) * 255);
      }
    }
    this.depthTexture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
    this.depthTexture.magFilter = THREE.LinearFilter;
    this.depthTexture.minFilter = THREE.LinearFilter;
    this.depthTexture.needsUpdate = true;

    // --- siatka (w przestrzeni świata, macierz jednostkowa) ---
    const step = CFG.water.gridStep;
    const nx = Math.ceil(sx / step);
    const nz = Math.ceil(sz / step);
    const geo = new THREE.PlaneGeometry(sx, sz, nx, nz);
    geo.rotateX(-Math.PI / 2);

    const wa = waveUniformArrays();
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uWaterLevel: { value: CFG.water.level },
          uWaveA: { value: wa.a.map((v) => new THREE.Vector4(...v)) },
          uWaveB: { value: wa.b.map((v) => new THREE.Vector4(...v)) },
          uDepthTex: { value: null },
          uDepthBox: { value: new THREE.Vector4(this.box.x0, this.box.z0, sx, sz) },
          uDepthMax: { value: CFG.water.depthTexMax },
          uShallow: { value: new THREE.Color(CFG.water.shallowColor) },
          uDeep: { value: new THREE.Color(CFG.water.deepColor) },
          uSunDir: { value: sunDir },
          uSunColor: { value: sunColor },
          uZenith: { value: zenith },
          uHorizon: { value: horizon },
        },
      ]),
      vertexShader: /* glsl */ `
        ${WATER_WAVES_GLSL}
        #include <fog_pars_vertex>
        varying vec3 vWorld;
        varying vec2 vRest;
        void main() {
          vec3 n;
          vec2 p0 = (modelMatrix * vec4(position, 1.0)).xz;
          vec3 p = gerstnerPos(p0, n);
          vRest = p0;
          vWorld = p;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        ${WATER_WAVES_GLSL}
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D uDepthTex;
        uniform vec4 uDepthBox;
        uniform float uDepthMax;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vWorld;
        varying vec2 vRest;

        vec2 ripple(vec2 p, float t) {
          // drobne zmarszczki tylko w normalnej (nie zmieniają wysokości)
          return vec2(cos(p.x * 3.1 + t * 1.7) * 0.5 + cos((p.x + p.y) * 4.3 - t * 2.1) * 0.35,
                      cos(p.y * 2.7 - t * 1.3) * 0.5 + cos((p.x - p.y) * 5.1 + t * 1.9) * 0.35) * 0.018;
        }

        void main() {
          vec3 n;
          gerstnerPos(vRest, n);
          vec2 r = ripple(vRest, uTime);
          n = normalize(n + vec3(r.x, 0.0, r.y));

          vec2 uv = (vWorld.xz - uDepthBox.xy) / uDepthBox.zw;
          float depth = texture2D(uDepthTex, uv).r * uDepthMax;

          vec3 v = normalize(cameraPosition - vWorld);
          float ndv = max(dot(n, v), 0.0);
          float fresnel = (0.02 + 0.98 * pow(1.0 - ndv, 5.0)) * 0.82;
          vec3 refl = reflect(-v, n);
          refl.y = abs(refl.y);
          vec3 skyCol = mix(uHorizon, uZenith, pow(clamp(refl.y, 0.0, 1.0), 0.45));
          float sd = max(dot(refl, normalize(uSunDir)), 0.0);
          vec3 spec = uSunColor * (pow(sd, 600.0) * 6.0 + pow(sd, 60.0) * 0.25);

          vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 3.2, depth));
          float alpha = mix(0.18, 0.93, smoothstep(0.0, 2.4, depth));
          alpha = max(alpha, fresnel);
          vec3 col = mix(body, skyCol, fresnel) + spec;
          // pasek piany/jasnej wody przy samym brzegu
          float shore = 1.0 - smoothstep(0.0, 0.07, depth);
          col = mix(col, vec3(0.78, 0.76, 0.68), shore * 0.35);
          alpha = mix(alpha, 0.55, shore * 0.5);

          gl_FragColor = vec4(col, clamp(alpha + length(spec) * 0.3, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.material.uniforms['uDepthTex'].value = this.depthTexture;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
  }

  /** czas symulacji (ten sam co CPU → zgodna wysokość fal) */
  setTime(t: number): void {
    this.material.uniforms['uTime'].value = t;
  }

  /** po zmianie parametrów fal w configu */
  refresh(): void {
    refreshWaves();
    const wa = waveUniformArrays();
    const A = this.material.uniforms['uWaveA'].value as THREE.Vector4[];
    const B = this.material.uniforms['uWaveB'].value as THREE.Vector4[];
    for (let i = 0; i < MAX_WAVES; i++) {
      A[i].set(wa.a[i][0], wa.a[i][1], wa.a[i][2], wa.a[i][3]);
      B[i].set(wa.b[i][0], wa.b[i][1], wa.b[i][2], wa.b[i][3]);
    }
    (this.material.uniforms['uShallow'].value as THREE.Color).set(CFG.water.shallowColor);
    (this.material.uniforms['uDeep'].value as THREE.Color).set(CFG.water.deepColor);
    this.material.uniforms['uWaterLevel'].value = CFG.water.level;
  }
}
