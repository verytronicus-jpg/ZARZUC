import * as THREE from 'three';
import { CFG } from '../config';

/**
 * Post-processing „ciepły poranek” (bez zewnętrznych bibliotek):
 * scena → HDR (HalfFloat, MSAA na „Wysokiej”) → [kopia koloru i głębi dla refrakcji wody] → woda →
 * bloom (dual-Kawase, 5 poziomów) · AO z bufora głębi (tylko „Wysoka”) · promienie słońca (tylko „Wysoka”) →
 * kompozyt: mgła wysokościowa + poranna mgiełka nad wodą, ekspozycja, ACES, grading (lift/gamma/gain,
 * podział tonów, nasycenie), winieta, ziarno, sRGB.
 */

const FULLSCREEN_VS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function pass(fs: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS,
    fragmentShader: fs,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

function rt(w: number, h: number, opts: Partial<THREE.RenderTargetOptions> = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
    ...opts,
  });
}

export interface PostSettings {
  msaa: number;
  ao: boolean;
  rays: boolean;
  /** rozdzielczość tekstury refrakcji względem ekranu */
  refractScale: number;
}

export class PostFX {
  readonly scene: THREE.WebGLRenderTarget;
  /** kolor sceny (rgb) + liniowa głębokość w metrach (a) – dla refrakcji i przejrzystości wody */
  readonly refract: THREE.WebGLRenderTarget;
  private bloomDown: THREE.WebGLRenderTarget[] = [];
  private bloomUp: THREE.WebGLRenderTarget[] = [];
  private aoRT: THREE.WebGLRenderTarget;
  private raysRT: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private copyMat: THREE.ShaderMaterial;
  private prefilterMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private aoMat: THREE.ShaderMaterial;
  private raysMat: THREE.ShaderMaterial;
  readonly compositeMat: THREE.ShaderMaterial;
  settings: PostSettings;
  private w = 1;
  private h = 1;
  time = 0;
  private tmpV = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();

  constructor(
    private renderer: THREE.WebGLRenderer,
    settings: PostSettings,
  ) {
    this.settings = { ...settings };
    const depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.scene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      samples: settings.msaa,
      depthBuffer: true,
      depthTexture,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.refract = rt(1, 1);
    for (let i = 0; i < 5; i++) {
      this.bloomDown.push(rt(1, 1));
      this.bloomUp.push(rt(1, 1));
    }
    this.aoRT = rt(1, 1, { type: THREE.UnsignedByteType });
    this.raysRT = rt(1, 1);

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);

    const depthUniforms = () => ({
      tDepth: { value: depthTexture },
      uNear: { value: 0.05 },
      uFar: { value: 3000 },
    });

    this.copyMat = pass(
      /* glsl */ `
      #include <packing>
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform float uNear, uFar;
      varying vec2 vUv;
      void main() {
        float d = texture2D(tDepth, vUv).x;
        float z = d >= 1.0 ? uFar : -perspectiveDepthToViewZ(d, uNear, uFar);
        gl_FragColor = vec4(texture2D(tColor, vUv).rgb, z);
      }`,
      { tColor: { value: null }, ...depthUniforms() },
    );

    this.prefilterMat = pass(
      /* glsl */ `
      uniform sampler2D tColor;
      uniform vec2 uTexel;
      uniform float uThreshold, uKnee, uClamp;
      varying vec2 vUv;
      vec3 samp(vec2 o) {
        vec3 c = texture2D(tColor, vUv + o * uTexel).rgb;
        // NaN/Inf (np. z nieudanego obliczenia w materiale) → 0, zamiast świecącej plamy z bloomu
        c = vec3(c.r < 1e20 && c.r >= 0.0 ? c.r : 0.0, c.g < 1e20 && c.g >= 0.0 ? c.g : 0.0, c.b < 1e20 && c.b >= 0.0 ? c.b : 0.0);
        return min(c, vec3(uClamp));
      }
      void main() {
        vec3 c = (samp(vec2(-1.0, -1.0)) + samp(vec2(1.0, -1.0)) + samp(vec2(-1.0, 1.0)) + samp(vec2(1.0, 1.0))) * 0.25;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(c * contrib, 1.0);
      }`,
      { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 }, uClamp: { value: 40 } },
    );

    this.downMat = pass(
      /* glsl */ `
      uniform sampler2D tColor;
      uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColor, vUv).rgb * 4.0;
        c += texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`,
      { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
    );

    this.upMat = pass(
      /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tPrev;
      uniform vec2 uTexel;
      uniform float uHasPrev;
      varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture2D(tColor, vUv + vec2(-2.0, 0.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(2.0, 0.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(0.0, -2.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(0.0, 2.0) * uTexel).rgb;
        c += texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb * 2.0;
        c += texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb * 2.0;
        c += texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb * 2.0;
        c += texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb * 2.0;
        c /= 12.0;
        if (uHasPrev > 0.5) c += texture2D(tPrev, vUv).rgb;
        gl_FragColor = vec4(c, 1.0);
      }`,
      { tColor: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uHasPrev: { value: 0 } },
    );

    this.aoMat = pass(
      /* glsl */ `
      #include <packing>
      uniform sampler2D tDepth;
      uniform float uNear, uFar;
      uniform mat4 uProjInv;
      uniform mat4 uProj;
      uniform vec2 uTexel;
      uniform float uRadius, uIntensity, uBias, uMaxDist;
      varying vec2 vUv;
      vec3 viewPos(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      void main() {
        float d = texture2D(tDepth, vUv).x;
        if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
        vec3 p = viewPos(vUv);
        vec3 px = viewPos(vUv + vec2(uTexel.x, 0.0)) - p;
        vec3 nx = p - viewPos(vUv - vec2(uTexel.x, 0.0));
        vec3 py = viewPos(vUv + vec2(0.0, uTexel.y)) - p;
        vec3 ny = p - viewPos(vUv - vec2(0.0, uTexel.y));
        vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
        vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
        // daleko głębia jest skwantowana (różnice sąsiadów = 0) → normalize(0) = NaN na GPU; AO i tak niepotrzebne
        vec3 cr = cross(dx, dy);
        float crl = length(cr);
        if (-p.z > uMaxDist || !(crl > 1e-10)) { gl_FragColor = vec4(1.0); return; }
        vec3 n = cr / crl;
        // promień w ekranie
        vec4 pr = uProj * vec4(uRadius, 0.0, p.z, 1.0);
        float rScreen = clamp(abs(pr.x / pr.w) * 0.5, 0.004, 0.08);
        float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float occ = 0.0;
        const int N = 12;
        for (int i = 0; i < N; i++) {
          float t = (float(i) + 0.5) / float(N);
          float ang = t * 22.0 + noise * 6.2831;
          vec2 o = vec2(cos(ang), sin(ang)) * rScreen * t;
          vec3 q = viewPos(vUv + o);
          vec3 v = q - p;
          float vv = dot(v, v);
          occ += max(0.0, dot(v, n) - uBias * -p.z * 0.01) / (vv + 0.05) * step(vv, uRadius * uRadius * 4.0);
        }
        float ao = clamp(1.0 - uIntensity * occ / float(N), 0.0, 1.0);
        ao = mix(ao, 1.0, smoothstep(uMaxDist * 0.6, uMaxDist, -p.z));
        if (!(ao >= 0.0)) ao = 1.0;
        gl_FragColor = vec4(vec3(ao), 1.0);
      }`,
      {
        ...depthUniforms(),
        uProjInv: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 0.8 },
        uIntensity: { value: 1 },
        uBias: { value: 0.3 },
        uMaxDist: { value: 80 },
      },
    );

    this.raysMat = pass(
      /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tDepth;
      uniform vec3 uSun; // xy = uv słońca, z = widoczność
      uniform float uDecay, uDensity, uThreshold;
      uniform float uAspect;
      varying vec2 vUv;
      void main() {
        if (uSun.z <= 0.001) { gl_FragColor = vec4(0.0); return; }
        vec2 delta = (uSun.xy - vUv) * uDensity / 36.0;
        vec2 uv = vUv;
        float illum = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 36; i++) {
          uv += delta;
          vec2 cuv = clamp(uv, vec2(0.001), vec2(0.999));
          float sky = step(0.99999, texture2D(tDepth, cuv).x);
          vec3 c = texture2D(tColor, cuv).rgb;
          float br = max(c.r, max(c.g, c.b));
          vec2 dd = (cuv - uSun.xy) * vec2(uAspect, 1.0);
          float near = exp(-dot(dd, dd) * 6.0);
          acc += c * sky * smoothstep(uThreshold, uThreshold + 1.0, br) * near * illum;
          illum *= uDecay;
        }
        gl_FragColor = vec4(acc / 36.0 * uSun.z, 1.0);
      }`,
      {
        tColor: { value: null },
        tDepth: { value: depthTexture },
        uSun: { value: new THREE.Vector3() },
        uDecay: { value: 0.96 },
        uDensity: { value: 0.9 },
        uThreshold: { value: 0.6 },
        uAspect: { value: 1 },
      },
    );

    this.compositeMat = pass(
      /* glsl */ `
      #include <packing>
      uniform sampler2D tScene;
      uniform sampler2D tDepth;
      uniform sampler2D tBloom;
      uniform sampler2D tAO;
      uniform sampler2D tRays;
      uniform sampler2D tNoise;
      uniform float uUseAO, uUseRays;
      uniform vec2 uTexel;
      uniform mat4 uProjInv;
      uniform mat4 uViewInv;
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uTime;
      // mgła
      uniform vec3 uFogColor, uFogSunColor;
      uniform float uFogDensity, uFogHeight, uFogFalloff, uFogStart;
      uniform vec3 uMistColor;
      uniform float uMistDensity, uMistHeight, uMistNoise, uMistNear, uWaterLevel;
      // ton i grading
      uniform float uExposure, uBloom, uRays, uAO;
      uniform vec3 uLift, uGamma, uGain, uShadowTint, uHighTint;
      uniform float uSaturation, uContrast, uSplit, uVignette, uGrain;
      varying vec2 vUv;

      vec3 aces(vec3 x) {
        // ACES (dopasowanie Narkowicza) – miękki, filmowy
        const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      float aoBlur(vec2 uv) {
        float d0 = texture2D(tDepth, uv).x;
        float s = 0.0; float w = 0.0;
        for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
          vec2 o = vec2(float(i), float(j)) * uTexel * 2.0;
          float dd = texture2D(tDepth, uv + o).x;
          float ww = 1.0 / (1.0 + abs(dd - d0) * 4000.0);
          s += texture2D(tAO, uv + o).r * ww; w += ww;
        }
        return s / max(w, 1e-4);
      }

      vec3 safe(vec3 c) {
        return vec3(c.r < 1e20 && c.r >= 0.0 ? c.r : 0.0, c.g < 1e20 && c.g >= 0.0 ? c.g : 0.0, c.b < 1e20 && c.b >= 0.0 ? c.b : 0.0);
      }
      void main() {
        vec3 col = safe(texture2D(tScene, vUv).rgb);
        float d = texture2D(tDepth, vUv).x;
        bool sky = d >= 1.0;
        vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        vp /= vp.w;
        vec3 wp = (uViewInv * vec4(vp.xyz, 1.0)).xyz;
        vec3 ray = wp - uCamPos;
        float dist = length(ray);
        vec3 dir = ray / max(dist, 1e-4);
        if (uUseAO > 0.5 && !sky) {
          float ao = aoBlur(vUv);
          col *= mix(1.0, ao >= 0.0 && ao <= 1.0 ? ao : 1.0, uAO);
        }

        if (!sky) {
          // mgła wysokościowa (całka gęstości wykładniczej wzdłuż promienia) + rozproszenie w stronę słońca
          float dy = wp.y - uCamPos.y;
          float fd = max(dist - uFogStart, 0.0);
          float base = uFogDensity * exp(-uFogFalloff * (uCamPos.y - uFogHeight));
          float k = uFogFalloff * dy;
          float integ = base * fd * (abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0);
          float fog = 1.0 - exp(-max(integ, 0.0));
          float sunAmt = pow(max(dot(dir, uSunDir), 0.0), 6.0);
          vec3 fcol = mix(uFogColor, uFogSunColor, sunAmt);
          // mgiełka nad wodą: cienka, plamista warstwa przy tafli, gęstsza w oddali
          // średnia gęstość warstwy wykładniczej wzdłuż promienia (z wysoka patrzymy przez cienką warstwę)
          float hp = max(wp.y - uWaterLevel, 0.0) / uMistHeight;
          float hc = max(uCamPos.y - uWaterLevel, 0.0) / uMistHeight;
          float avgM = abs(hp - hc) > 1e-3 ? (exp(-hc) - exp(-hp)) / (hp - hc) : exp(-hc);
          vec2 nuv = wp.xz * 0.012 + vec2(uTime * 0.004, uTime * 0.0025);
          float n = texture2D(tNoise, nuv).r * 0.65 + texture2D(tNoise, nuv * 2.7 + 0.3).g * 0.35;
          float patchy = mix(1.0, smoothstep(0.25, 0.75, n) * 1.6, uMistNoise);
          float mist = uMistDensity * avgM * patchy * smoothstep(uMistNear, uMistNear * 4.0, dist);
          mist = 1.0 - exp(-mist * min(dist, 600.0) * 0.01);
          vec3 mcol = mix(uMistColor, uFogSunColor, sunAmt * 0.6);
          col = mix(col, fcol, fog);
          col = mix(col, mcol, clamp(mist, 0.0, 0.85));
        }
        col += safe(texture2D(tBloom, vUv).rgb) * uBloom;
        if (uUseRays > 0.5) col += safe(texture2D(tRays, vUv).rgb) * uRays * uSunColor;
        col *= uExposure;
        col = aces(col);
        // grading: lift/gamma/gain
        col = clamp(col * uGain + uLift * (1.0 - col), 0.0, 1.0);
        col = pow(col, 1.0 / uGamma);
        // podział tonów: cienie chłodne, światła ciepłe
        float l = luma(col);
        col = mix(col, col * uShadowTint * 2.0, (1.0 - smoothstep(0.0, 0.5, l)) * uSplit);
        col = mix(col, col * uHighTint * 2.0, smoothstep(0.45, 1.0, l) * uSplit);
        // nasycenie i kontrast
        l = luma(col);
        col = mix(vec3(l), col, uSaturation);
        col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
        // winieta
        vec2 vv = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vv * vec2(1.1, 1.0)) * 1.25);
        // ziarno (delikatne, zmienne w czasie)
        float g = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        col += (g - 0.5) * uGrain;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
      {
        tScene: { value: null },
        tDepth: { value: depthTexture },
        tBloom: { value: null },
        tAO: { value: null },
        tRays: { value: null },
        tNoise: { value: null },
        uUseAO: { value: 0 },
        uUseRays: { value: 0 },
        uTexel: { value: new THREE.Vector2() },
        uProjInv: { value: new THREE.Matrix4() },
        uViewInv: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color() },
        uFogSunColor: { value: new THREE.Color() },
        uFogDensity: { value: 0 },
        uFogHeight: { value: 0 },
        uFogFalloff: { value: 0.02 },
        uFogStart: { value: 0 },
        uMistColor: { value: new THREE.Color() },
        uMistDensity: { value: 0 },
        uMistHeight: { value: 2 },
        uMistNoise: { value: 1 },
        uMistNear: { value: 10 },
        uWaterLevel: { value: 0 },
        uExposure: { value: 1 },
        uBloom: { value: 0.2 },
        uRays: { value: 0.5 },
        uAO: { value: 0.6 },
        uLift: { value: new THREE.Vector3() },
        uGamma: { value: new THREE.Vector3(1, 1, 1) },
        uGain: { value: new THREE.Vector3(1, 1, 1) },
        uShadowTint: { value: new THREE.Color(0.5, 0.5, 0.5) },
        uHighTint: { value: new THREE.Color(0.5, 0.5, 0.5) },
        uSaturation: { value: 1 },
        uContrast: { value: 1 },
        uSplit: { value: 0 },
        uVignette: { value: 0.2 },
        uGrain: { value: 0.02 },
      },
    );
    this.compositeMat.uniforms.tNoise.value = new THREE.TextureLoader().load('textures/noise.png', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
    this.applyConfig();
  }

  /** Parametry z CFG.post (panel F1 zmienia je na żywo). */
  applyConfig(): void {
    const P = CFG.post;
    const u = this.compositeMat.uniforms;
    (u.uFogColor.value as THREE.Color).set(P.fogColor);
    (u.uFogSunColor.value as THREE.Color).set(P.fogSunColor);
    u.uFogDensity.value = P.fogDensity;
    u.uFogHeight.value = P.fogHeight;
    u.uFogFalloff.value = P.fogFalloff;
    u.uFogStart.value = P.fogStart;
    (u.uMistColor.value as THREE.Color).set(P.mistColor);
    u.uMistDensity.value = P.mistDensity;
    u.uMistHeight.value = P.mistHeight;
    u.uMistNoise.value = P.mistNoise;
    u.uMistNear.value = P.mistNear;
    u.uWaterLevel.value = CFG.water.level;
    u.uBloom.value = P.bloomStrength;
    u.uRays.value = P.raysStrength;
    u.uAO.value = P.aoStrength;
    (u.uLift.value as THREE.Vector3).set(P.lift[0], P.lift[1], P.lift[2]);
    (u.uGamma.value as THREE.Vector3).set(P.gamma[0], P.gamma[1], P.gamma[2]);
    (u.uGain.value as THREE.Vector3).set(P.gain[0], P.gain[1], P.gain[2]);
    // odcienie podane „wprost” (0x80 = neutralnie), bez konwersji sRGB→liniowe
    (u.uShadowTint.value as THREE.Color).setHex(P.shadowTint, THREE.LinearSRGBColorSpace);
    (u.uHighTint.value as THREE.Color).setHex(P.highlightTint, THREE.LinearSRGBColorSpace);
    u.uSaturation.value = P.saturation;
    u.uContrast.value = P.contrast;
    u.uSplit.value = P.splitTone;
    u.uVignette.value = P.vignette;
    u.uGrain.value = P.grain;
    this.prefilterMat.uniforms.uThreshold.value = P.bloomThreshold;
    this.prefilterMat.uniforms.uKnee.value = P.bloomKnee;
    this.aoMat.uniforms.uRadius.value = P.aoRadius;
    this.aoMat.uniforms.uIntensity.value = P.aoIntensity;
    this.raysMat.uniforms.uDecay.value = P.raysDecay;
    this.raysMat.uniforms.uDensity.value = P.raysDensity;
    this.raysMat.uniforms.uThreshold.value = P.raysThreshold;
  }

  setSettings(s: PostSettings): void {
    const msaaChanged = s.msaa !== this.settings.msaa;
    this.settings = { ...s };
    if (msaaChanged) this.scene.samples = s.msaa;
    this.setSize(this.w, this.h);
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.scene.setSize(w, h);
    const rs = this.settings.refractScale;
    this.refract.setSize(Math.round(w * rs), Math.round(h * rs));
    let bw = Math.round(w / 2);
    let bh = Math.round(h / 2);
    for (let i = 0; i < this.bloomDown.length; i++) {
      this.bloomDown[i].setSize(bw, bh);
      this.bloomUp[i].setSize(bw, bh);
      bw = Math.max(1, Math.round(bw / 2));
      bh = Math.max(1, Math.round(bh / 2));
    }
    this.aoRT.setSize(Math.round(w / 2), Math.round(h / 2));
    this.raysRT.setSize(Math.round(w / 2), Math.round(h / 2));
    (this.compositeMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
  }

  private blit(mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  /** Kopia koloru i głębi sceny (przed wodą) do tekstury refrakcji. */
  copyForRefraction(camera: THREE.PerspectiveCamera): void {
    const u = this.copyMat.uniforms;
    u.tColor.value = this.scene.texture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    this.blit(this.copyMat, this.refract);
  }

  /** Efekty i wyjście na ekran (scena już w this.scene). */
  finish(camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3, sunColor: THREE.Color, exposure: number, dt: number): void {
    this.time += dt;
    const r = this.renderer;
    const autoClear = r.autoClear;
    r.autoClear = true;
    // bloom
    const src = this.scene.texture;
    this.prefilterMat.uniforms.tColor.value = src;
    (this.prefilterMat.uniforms.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
    this.blit(this.prefilterMat, this.bloomDown[0]);
    for (let i = 1; i < this.bloomDown.length; i++) {
      const prev = this.bloomDown[i - 1];
      this.downMat.uniforms.tColor.value = prev.texture;
      (this.downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / prev.width, 1 / prev.height);
      this.blit(this.downMat, this.bloomDown[i]);
    }
    const n = this.bloomDown.length;
    for (let i = n - 1; i >= 0; i--) {
      const s = i === n - 1 ? this.bloomDown[i] : this.bloomDown[i];
      this.upMat.uniforms.tColor.value = s.texture;
      this.upMat.uniforms.tPrev.value = i === n - 1 ? null : this.bloomUp[i + 1].texture;
      this.upMat.uniforms.uHasPrev.value = i === n - 1 ? 0 : 1;
      (this.upMat.uniforms.uTexel.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
      this.blit(this.upMat, this.bloomUp[i]);
    }
    // AO
    const cu = this.compositeMat.uniforms;
    if (this.settings.ao) {
      const a = this.aoMat.uniforms;
      a.uNear.value = camera.near;
      a.uFar.value = camera.far;
      (a.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (a.uProj.value as THREE.Matrix4).copy(camera.projectionMatrix);
      (a.uTexel.value as THREE.Vector2).set(1 / this.w, 1 / this.h);
      this.blit(this.aoMat, this.aoRT);
    }
    cu.uUseAO.value = this.settings.ao ? 1 : 0;
    cu.tAO.value = this.aoRT.texture;
    // promienie słońca
    let rays = 0;
    if (this.settings.rays) {
      const sp = this.tmpV.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      const facing = sunDir.dot(camera.getWorldDirection(this.tmpDir));
      rays = sp.z < 1 ? THREE.MathUtils.smoothstep(facing, 0.1, 0.6) : 0;
      const ru = this.raysMat.uniforms;
      ru.tColor.value = src;
      (ru.uSun.value as THREE.Vector3).set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, rays);
      ru.uAspect.value = this.w / this.h;
      if (rays > 0) this.blit(this.raysMat, this.raysRT);
    }
    cu.uUseRays.value = rays > 0 ? 1 : 0;
    cu.tRays.value = this.raysRT.texture;
    // kompozyt → ekran
    cu.tScene.value = src;
    cu.tBloom.value = this.bloomUp[0].texture;
    (cu.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (cu.uViewInv.value as THREE.Matrix4).copy(camera.matrixWorld);
    (cu.uCamPos.value as THREE.Vector3).copy(camera.position);
    (cu.uSunDir.value as THREE.Vector3).copy(sunDir);
    (cu.uSunColor.value as THREE.Color).copy(sunColor);
    cu.uExposure.value = exposure;
    cu.uTime.value = this.time;
    this.blit(this.compositeMat, null);
    r.autoClear = autoClear;
  }
}
