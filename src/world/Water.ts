import * as THREE from 'three';
import { CFG } from '../config';
import { lakeDepth } from './terrainMath';
import { gradedAxis } from './Heightmap';
import { WATER_WAVES_GLSL, waveUniformArrays, refreshWaves, MAX_WAVES } from './waves';
import { tex } from '../render/textures';
import { WATER_LAYER } from '../render/layers';

/**
 * Woda „krystaliczny turkus”:
 * - wierzchołki: suma fal Gerstnera – TA SAMA funkcja co na CPU (WATER_WAVES_GLSL / waves.ts),
 * - refrakcja: kopia koloru i głębi sceny sprzed wody (PostFX) + pochłanianie wg grubości warstwy wody
 *   (czerwień ginie najszybciej → turkus, kamienie dna widoczne przy brzegu),
 * - odbicia: planarne (preset „Wysoka”) albo panorama gór wg kierunku odbicia („Niska”, podgląd spławika),
 * - normalna: fale + dwie przesuwane normal mapy, fresnel, iskrzenie słońca (HDR pod bloom), piana przy brzegu.
 * Głębokość z MAPY GŁĘBOKOŚCI w atrybucie wierzchołka (aDepth) – siatka gęsta w misie, rzadka w oddali.
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
      transparent: false,
      depthWrite: true,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uWaterLevel: { value: CFG.water.level },
        uWaveA: { value: wa.a.map((v) => new THREE.Vector4(...v)) },
        uWaveB: { value: wa.b.map((v) => new THREE.Vector4(...v)) },
        uShallow: { value: new THREE.Color(W.shallowColor) },
        uDeep: { value: new THREE.Color(W.deepColor) },
        uScatter: { value: new THREE.Color(W.scatterColor) },
        uAbsorb: { value: new THREE.Vector3(...W.absorb) },
        uSunDir: { value: sunDir },
        uSunColor: { value: sunColor },
        uZenith: { value: zenith },
        uHorizon: { value: horizon },
        tRefract: { value: null as THREE.Texture | null },
        uRefractOn: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        tReflect: { value: null as THREE.Texture | null },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uReflectOn: { value: 0 },
        tPano: { value: null as THREE.Texture | null },
        uPanoOn: { value: 0 },
        uPanoMap: { value: new THREE.Vector4(0, 0, 0, 1) }, // azSun, uSun, eMin, eMax
        tNormal: { value: tex('waterNormal') },
        tNoise: { value: tex('noise') },
        uNormalScale: { value: W.normalScale },
        uNormalTiling: { value: new THREE.Vector2(W.normalTiling[0], W.normalTiling[1]) },
        uNormalSpeed: { value: W.normalSpeed },
        uRefractStrength: { value: W.refractStrength },
        uReflectDistort: { value: W.reflectDistort },
        uFoamDepth: { value: W.foamDepth },
        uFoam: { value: W.foamStrength },
        uGlitterPow: { value: W.glitterPower },
        uGlitter: { value: W.glitterStrength },
        uF0: { value: W.fresnelF0 },
        uReflectStrength: { value: W.reflectStrength },
      },
      vertexShader: /* glsl */ `
        ${WATER_WAVES_GLSL}
        attribute float aDepth;
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vDepth;
        varying float vViewZ;
        void main() {
          vec3 n;
          vec2 p0 = (modelMatrix * vec4(position, 1.0)).xz;
          vec3 p = gerstnerPos(p0, n);
          vRest = p0;
          vWorld = p;
          vDepth = aDepth;
          vec4 mvPosition = viewMatrix * vec4(p, 1.0);
          vViewZ = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        ${WATER_WAVES_GLSL}
        uniform vec3 uShallow, uDeep, uScatter, uAbsorb;
        uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
        uniform sampler2D tRefract; uniform float uRefractOn; uniform vec2 uResolution;
        uniform sampler2D tReflect; uniform mat4 uReflectMatrix; uniform float uReflectOn;
        uniform sampler2D tPano; uniform float uPanoOn; uniform vec4 uPanoMap;
        uniform sampler2D tNormal, tNoise;
        uniform float uNormalScale, uNormalSpeed, uRefractStrength, uReflectDistort, uFoamDepth, uFoam;
        uniform float uGlitterPow, uGlitter, uF0, uReflectStrength;
        uniform vec2 uNormalTiling;
        varying vec3 vWorld;
        varying vec2 vRest;
        varying float vDepth;
        varying float vViewZ;
        #define PI 3.14159265

        vec3 skyDir(vec3 d) {
          vec3 g = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.45));
          if (uPanoOn < 0.5) return g;
          float el = asin(clamp(d.y, -1.0, 1.0)) * 180.0 / PI;
          float az = atan(d.x, d.z);
          float u = fract(uPanoMap.y + (uPanoMap.x - az) / (2.0 * PI));
          float v = (uPanoMap.w - el) / (uPanoMap.w - uPanoMap.z);
          if (v < 0.0) return mix(texture2D(tPano, vec2(u, 0.999)).rgb, uZenith, smoothstep(0.0, -0.4, v));
          return texture2D(tPano, vec2(u, 1.0 - clamp(v, 0.0, 1.0))).rgb;
        }

        vec3 nmap(vec2 uv) {
          vec3 t = texture2D(tNormal, uv).xyz * 2.0 - 1.0;
          return vec3(t.x, 0.0, t.y);
        }

        void main() {
          vec3 n0;
          gerstnerPos(vRest, n0);
          float dist = length(cameraPosition - vWorld);
          float t = uTime * uNormalSpeed;
          vec3 d1 = nmap(vRest * uNormalTiling.x + vec2(t, t * 0.6));
          vec3 d2 = nmap(vRest * uNormalTiling.y + vec2(-t * 0.7, t * 1.1));
          float fade = 1.0 / (1.0 + dist * 0.025);
          vec3 n = normalize(n0 + (d1 + d2 * 0.6) * uNormalScale * fade);
          vec3 v = normalize(cameraPosition - vWorld);
          float ndv = max(dot(n, v), 0.0);
          float fresnel = uF0 + (1.0 - uF0) * pow(1.0 - ndv, 5.0);

          // --- odbicie ---
          vec3 R = reflect(-v, n);
          R.y = abs(R.y);
          vec3 refl;
          if (uReflectOn > 0.5) {
            vec4 pr = uReflectMatrix * vec4(vWorld + vec3(n.x, 0.0, n.z) * uReflectDistort * min(dist, 60.0), 1.0);
            refl = texture2D(tReflect, pr.xy / pr.w).rgb;
          } else {
            // panorama jako odbicie: mniejsze zaburzenie niż normalna fal (bez ziarna na płaskiej tafli w oddali)
            vec3 Rs = reflect(-v, normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.3)));
            Rs.y = abs(Rs.y);
            refl = skyDir(Rs);
          }
          refl *= uReflectStrength;

          // --- refrakcja i pochłanianie ---
          vec3 refr;
          float path = vDepth / max(v.y, 0.15);
          float thick = vDepth;
          if (uRefractOn > 0.5) {
            vec2 suv = gl_FragCoord.xy / uResolution;
            vec2 off = n.xz * uRefractStrength / (1.0 + vViewZ * 0.05);
            vec4 s = texture2D(tRefract, suv + off);
            if (s.a < vViewZ) s = texture2D(tRefract, suv);
            float dz = max(s.a - vViewZ, 0.0);
            path = dz * dist / max(vViewZ, 0.01);
            thick = path * max(v.y, 0.0);
            vec3 T = exp(-uAbsorb * path);
            vec3 inscatter = mix(uShallow, uScatter, 1.0 - exp(-path * 0.35));
            refr = s.rgb * T + inscatter * (1.0 - T);
          } else {
            vec3 T = exp(-uAbsorb * path * 1.2);
            refr = mix(uDeep, uShallow, T.g) * 0.9;
          }
          vec3 col = mix(refr, refl, fresnel);

          // --- iskrzenie słońca ---
          float sd = max(dot(reflect(-v, n), normalize(uSunDir)), 0.0);
          float sparkle = texture2D(tNoise, vRest * 0.35 + vec2(uTime * 0.02, -uTime * 0.013)).a;
          sparkle = smoothstep(0.55, 0.9, sparkle) * 3.0 + 0.3;
          vec3 spec = uSunColor * (pow(sd, uGlitterPow) * uGlitter * sparkle + pow(sd, 40.0) * 0.25);

          // --- piana przy brzegu i kamieniach ---
          float shore = 1.0 - smoothstep(0.0, uFoamDepth, min(thick, vDepth + 0.02));
          float fn = texture2D(tNoise, vRest * 0.45 + vec2(uTime * 0.03, uTime * 0.017)).r;
          float fn2 = texture2D(tNoise, vRest * 1.3 - vec2(uTime * 0.02, 0.0)).g;
          float foam = shore * smoothstep(0.45, 0.8, fn * 0.7 + fn2 * 0.5 + shore * 0.35) * uFoam;
          // piana oświetlona jak otoczenie (nie świeci w HDR)
          vec3 foamCol = vec3(0.9, 0.88, 0.82) * (0.55 + 0.45 * uSunColor / max(max(uSunColor.r, uSunColor.g), 1e-3));
          col = mix(col, foamCol * 0.8, clamp(foam, 0.0, 0.8));

          gl_FragColor = vec4(col + spec * (1.0 - foam), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
    this.mesh.layers.set(WATER_LAYER);
  }

  /** czas symulacji (ten sam co CPU → zgodna wysokość fal) */
  setTime(t: number): void {
    this.material.uniforms['uTime'].value = t;
  }

  /** po zmianie parametrów fal/koloru w configu */
  refresh(): void {
    refreshWaves();
    const wa = waveUniformArrays();
    const u = this.material.uniforms;
    const A = u['uWaveA'].value as THREE.Vector4[];
    const B = u['uWaveB'].value as THREE.Vector4[];
    for (let i = 0; i < MAX_WAVES; i++) {
      A[i].set(wa.a[i][0], wa.a[i][1], wa.a[i][2], wa.a[i][3]);
      B[i].set(wa.b[i][0], wa.b[i][1], wa.b[i][2], wa.b[i][3]);
    }
    const W = CFG.water;
    (u['uShallow'].value as THREE.Color).set(W.shallowColor);
    (u['uDeep'].value as THREE.Color).set(W.deepColor);
    (u['uScatter'].value as THREE.Color).set(W.scatterColor);
    (u['uAbsorb'].value as THREE.Vector3).set(W.absorb[0], W.absorb[1], W.absorb[2]);
    u['uWaterLevel'].value = W.level;
    u['uNormalScale'].value = W.normalScale;
    (u['uNormalTiling'].value as THREE.Vector2).set(W.normalTiling[0], W.normalTiling[1]);
    u['uNormalSpeed'].value = W.normalSpeed;
    u['uRefractStrength'].value = W.refractStrength;
    u['uReflectDistort'].value = W.reflectDistort;
    u['uFoamDepth'].value = W.foamDepth;
    u['uFoam'].value = W.foamStrength;
    u['uGlitterPow'].value = W.glitterPower;
    u['uGlitter'].value = W.glitterStrength;
    u['uF0'].value = W.fresnelF0;
    u['uReflectStrength'].value = W.reflectStrength;
  }
}
