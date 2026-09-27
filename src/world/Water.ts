import * as THREE from 'three';
import { CFG } from '../config';
import { lakeDepth } from './terrainMath';
import { gradedAxis } from './Heightmap';
import { WATER_WAVES_GLSL, waveUniformArrays, refreshWaves, MAX_WAVES } from './waves';

/**
 * Woda: suma fal Gerstnera (wierzchołki, identyczne z CPU), normalna liczona per piksel,
 * fresnel z odbiciem nieba, odblask słońca, kolor i przezroczystość z MAPY GŁĘBOKOŚCI
 * (głębokość zapisana w atrybucie wierzchołka aDepth – siatka gęsta w misie, rzadka w oddali).
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(sunDir: THREE.Vector3, sunColor: THREE.Color, zenith: THREE.Color, horizon: THREE.Color) {
    const W = CFG.water;
    const xs = gradedAxis(W.fineMinX, W.fineMaxX, W.gridStep, W.gridGrowth, W.gridMaxStep, W.extentX).filter((v) => Math.abs(v) <= W.extentX + 1);
    const zs = gradedAxis(W.fineMinZ, W.fineMaxZ, W.gridStep, W.gridGrowth, W.gridMaxStep, 10000).filter((v) => v >= W.minZ && v <= W.maxZ);
    const nx = xs.length;
    const nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const dep = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        pos[k * 3] = xs[i];
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = zs[j];
        dep[k] = lakeDepth(xs[i], zs[j]);
      }
    }
    // tylko komórki, w których jest (albo graniczy) woda
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = (j + 1) * nx + i;
        const c = j * nx + i + 1;
        const d = (j + 1) * nx + i + 1;
        if (dep[a] <= 0 && dep[b] <= 0 && dep[c] <= 0 && dep[d] <= 0) {
          // komórka lądowa – zostaw pas przy brzegu (woda sięga pod skarpę)
          const ci = Math.max(0, i - 1);
          const cj = Math.max(0, j - 1);
          let near = false;
          for (let jj = cj; jj <= Math.min(nz - 1, j + 2) && !near; jj++)
            for (let ii = ci; ii <= Math.min(nx - 1, i + 2); ii++) if (dep[jj * nx + ii] > 0) near = true;
          if (!near) continue;
        }
        idx.push(a, b, c, c, b, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

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
        attribute float aDepth;
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vDepth;
        void main() {
          vec3 n;
          vec2 p0 = (modelMatrix * vec4(position, 1.0)).xz;
          vec3 p = gerstnerPos(p0, n);
          vRest = p0;
          vWorld = p;
          vDepth = aDepth;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        ${WATER_WAVES_GLSL}
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vDepth;

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
          float depth = max(vDepth, 0.0);

          vec3 v = normalize(cameraPosition - vWorld);
          float ndv = max(dot(n, v), 0.0);
          float fresnel = (0.02 + 0.98 * pow(1.0 - ndv, 5.0)) * 0.85;
          vec3 refl = reflect(-v, n);
          refl.y = abs(refl.y);
          vec3 skyCol = mix(uHorizon, uZenith, pow(clamp(refl.y, 0.0, 1.0), 0.45));
          float sd = max(dot(refl, normalize(uSunDir)), 0.0);
          vec3 spec = uSunColor * (pow(sd, 700.0) * 7.0 + pow(sd, 50.0) * 0.35);

          vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 3.4, depth));
          float alpha = mix(0.1, 0.9, smoothstep(0.0, 2.8, depth));
          alpha = max(alpha, fresnel);
          vec3 col = mix(body, skyCol, fresnel) + spec;
          // jaśniejszy pas przy samym brzegu
          float shore = 1.0 - smoothstep(0.0, 0.12, depth);
          col = mix(col, vec3(0.86, 0.84, 0.74), shore * 0.25);
          alpha = mix(alpha, 0.35, shore * 0.6);

          gl_FragColor = vec4(col, clamp(alpha + length(spec) * 0.3, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
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
