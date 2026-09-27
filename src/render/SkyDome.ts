import * as THREE from 'three';
import { CFG } from '../config';
import { DEG } from '../core/math';

/**
 * Niebo: kopuła wokół kamery z panoramą gór (reference/01-swiat/09-panorama-gor → public/textures/panorama.jpg,
 * 360° = oryginał + lustro bez słońca) nałożoną jak na cylinder, powyżej płynne przejście w gradient.
 * Położenie panoramy liczone tak, by namalowane słońce pokrywało się z kierunkiem światła słońca.
 * Bez oświetlenia i bez mgły (tło).
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** zakres elewacji panoramy [°] i przesunięcie w poziomie – do odbić w wodzie */
  readonly mapping = { eMin: 0, eMax: 0, uSun: 0, azSun: 0 };

  constructor() {
    const geo = new THREE.SphereGeometry(100, 48, 24);
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uPano: { value: null as THREE.Texture | null },
        uHasPano: { value: 0 },
        uAzSun: { value: 0 },
        uUSun: { value: 0 },
        uEMin: { value: 0 },
        uEMax: { value: 1 },
        uTopFade: { value: CFG.sky.topFade },
        uZenith: { value: new THREE.Color(CFG.sky.zenith) },
        uTop: { value: new THREE.Color(CFG.sky.panoramaTop) },
        uHorizon: { value: new THREE.Color(CFG.sky.horizon) },
        uBottom: { value: new THREE.Color(CFG.sky.bottom) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunBoost: { value: CFG.sky.sunBoost },
        uBrightness: { value: CFG.sky.brightness },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPano;
        uniform float uHasPano;
        uniform float uAzSun, uUSun, uEMin, uEMax, uTopFade, uSunBoost, uBrightness;
        uniform vec3 uZenith, uTop, uHorizon, uBottom, uSunDir;
        varying vec3 vDir;
        #define PI 3.14159265
        void main() {
          vec3 d = normalize(vDir);
          float el = asin(clamp(d.y, -1.0, 1.0)) * 180.0 / PI;
          float az = atan(d.x, d.z);
          // gradient (poza panoramą i do czasu jej wczytania)
          vec3 col = mix(uHorizon, uTop, smoothstep(-2.0, uEMax, el));
          col = mix(col, uZenith, smoothstep(uEMax, 90.0, el));
          col = mix(col, uBottom, smoothstep(0.0, -12.0, el));
          if (uHasPano > 0.5) {
            float u = fract(uUSun + (uAzSun - az) / (2.0 * PI));
            float v = (uEMax - el) / (uEMax - uEMin);
            if (v >= 0.0 && v <= 1.0) {
              vec3 p = texture2D(uPano, vec2(u, 1.0 - v)).rgb;
              float fadeTop = smoothstep(0.0, uTopFade, v);
              col = mix(col, p, fadeTop);
            } else if (v > 1.0) {
              vec3 p = texture2D(uPano, vec2(u, 0.002)).rgb;
              col = mix(p, uBottom, smoothstep(1.0, 1.25, v));
            }
          }
          // słońce: wzmocnienie HDR jasnego obszaru wokół tarczy (pod bloom)
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col *= 1.0 + uSunBoost * pow(sd, 900.0) + 0.35 * uSunBoost * pow(sd, 60.0);
          gl_FragColor = vec4(col * uBrightness, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
    this.updateMapping();
    new THREE.TextureLoader().load(
      CFG.sky.panoramaUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this.material.uniforms.uPano.value = tex;
        this.material.uniforms.uHasPano.value = 1;
        this.onLoad?.(tex);
      },
      undefined,
      () => console.warn('[SkyDome] Nie udało się wczytać panoramy – zostaje gradient nieba'),
    );
  }

  onLoad: ((tex: THREE.Texture) => void) | null = null;

  /** Położenie panoramy: namalowane słońce = kierunek światła słońca. */
  updateMapping(): void {
    const S = CFG.sky;
    const arc = S.panoramaArcDeg;
    // pionowy zakres: proporcje obrazu A (wysokość / szerokość) × łuk, ściśnięty w pionie
    const span = (arc * S.panoramaAspect) / S.panoramaSquash;
    const eMax = CFG.sun.elevationDeg + S.panoramaSunV * span;
    const m = this.mapping;
    m.eMax = eMax;
    m.eMin = eMax - span;
    m.uSun = S.panoramaSunU * (arc / 360);
    m.azSun = CFG.sun.azimuthDeg * DEG;
    const u = this.material.uniforms;
    u.uEMax.value = m.eMax;
    u.uEMin.value = m.eMin;
    u.uUSun.value = m.uSun;
    u.uAzSun.value = m.azSun;
    u.uTopFade.value = S.topFade;
    (u.uZenith.value as THREE.Color).set(S.zenith);
    (u.uTop.value as THREE.Color).set(S.panoramaTop);
    (u.uHorizon.value as THREE.Color).set(S.horizon);
    (u.uBottom.value as THREE.Color).set(S.bottom);
    u.uSunBoost.value = S.sunBoost;
    u.uBrightness.value = S.brightness;
  }

  setSunDir(dir: THREE.Vector3): void {
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(dir);
  }

  /** kopuła zawsze wokół kamery */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
