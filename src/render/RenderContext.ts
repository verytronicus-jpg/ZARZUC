import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { CFG } from '../config';
import { DEG } from '../core/math';
import { SkyDome } from './SkyDome';
import { PostFX } from './PostFX';
import { PlanarReflection } from './PlanarReflection';
import { FX_LAYER, REFLECT_LAYER, SHADOW_LAYER, WATER_LAYER } from './layers';
import type { Water } from '../world/Water';

export type Quality = 'high' | 'low';

/**
 * Renderer, scena, światła poranka (słońce z kaskadowymi miękkimi cieniami + wypełnienie + niebo + mapa otoczenia
 * z nieba), kopuła nieba z panoramą gór i potok renderu:
 * odbicie planarne → scena (HDR) → kopia dla refrakcji → woda i efekty → PostFX (bloom, AO, promienie, mgła, grading).
 */
export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: SunLight;
  readonly fill: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: SkyDome;
  readonly post: PostFX;
  readonly reflection = new PlanarReflection();
  readonly sunDir = new THREE.Vector3();
  /** kolory nieba do odbić w wodzie (gdy brak panoramy) */
  readonly skyZenith = new THREE.Color(CFG.sky.panoramaTop);
  readonly skyHorizon = new THREE.Color(CFG.sky.horizon);
  quality: Quality = CFG.quality.current;
  water: Water | null = null;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  /** mnożniki światła otoczenia i ekspozycji (intro: ciemne wnętrze → oślepienie → norma) */
  private lightScale = { ambient: 1, exposure: 1 };
  private size = new THREE.Vector2();
  /** dynamiczna rozdzielczość (mnożnik pixel ratio) */
  private dyn = { scale: 1, acc: 0, n: 0, last: 0, slow: 0, fast: 0, blockUntil: 0, justRaised: false };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CFG.render.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, CFG.render.cameraNear, CFG.render.cameraFar);

    this.hemi = new THREE.HemisphereLight(CFG.sun.hemiSky, CFG.sun.hemiGround, CFG.sun.hemiIntensity);
    this.scene.add(this.hemi);

    this.sun = new SunLight(CFG.sun.color, CFG.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    for (let i = 0; i < 2; i++) this.sun.shadow.getCamera(i).layers.enable(SHADOW_LAYER);
    this.sun.shadow.camera.layers.enable(SHADOW_LAYER);
    this.scene.add(this.sun);

    this.fill = new THREE.DirectionalLight(CFG.sun.fillColor, CFG.sun.fillIntensity);
    this.scene.add(this.fill);

    this.sky = new SkyDome();
    this.sky.mesh.layers.enable(REFLECT_LAYER);
    this.scene.add(this.sky.mesh);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.sky.onLoad = () => this.updateEnvironment();

    this.post = new PostFX(this.renderer, this.postSettings());
    this.applyQuality(this.quality);
    this.applySun();
    this.updateEnvironment();

    window.addEventListener('resize', () => this.resize());
    // zrzuty/testy: stała rozdzielczość
    if (new URLSearchParams(location.search).has('fixedres')) CFG.render.dynamicRes.enabled = false;
  }

  /** Mnożnik rozdzielczości z dynamicznego skalowania (1 = pełna). */
  get resolutionScale(): number {
    return this.dyn.scale;
  }

  /**
   * Średni czas klatki w oknach po `interval` s. W dół dopiero po 2 wolnych oknach z rzędu; w górę, gdy przez
   * `upWindows` okien klatki trzymają cel (vsync) – a jeśli po podniesieniu znów zwolni, cofamy i blokujemy
   * podnoszenie na `cooldown` s. Mało przebudów buforów = brak przycięć.
   */
  private updateDynamicRes(): void {
    const D = CFG.render.dynamicRes;
    const now = performance.now();
    const d = this.dyn;
    if (d.last) {
      const ms = now - d.last;
      // pomijamy przestoje (karta w tle, kompilacja shaderów)
      if (ms < 250) {
        d.acc += ms;
        d.n++;
      }
    }
    d.last = now;
    if (!D.enabled) {
      if (d.scale !== 1) {
        d.scale = 1;
        this.resize();
      }
      return;
    }
    if (d.acc < D.interval * 1000 || d.n === 0) return;
    const avg = d.acc / d.n;
    d.acc = 0;
    d.n = 0;
    const slow = avg > D.targetMs * 1.15;
    const onTarget = avg < D.targetMs * 1.03;
    d.slow = slow ? d.slow + 1 : 0;
    d.fast = onTarget ? d.fast + 1 : 0;
    let s = d.scale;
    if (slow && d.justRaised) {
      // podniesienie nie wyszło – wracamy i nie próbujemy przez chwilę
      s = Math.max(D.minScale, s - D.step);
      d.blockUntil = now + D.cooldown * 1000;
      d.slow = 0;
    } else if (d.slow >= 2) {
      s = Math.max(D.minScale, s - D.step);
      d.slow = 0;
    } else if (d.fast >= D.upWindows && s < 1 && now > d.blockUntil) {
      s = Math.min(1, s + D.step);
      d.fast = 0;
    }
    d.justRaised = s > d.scale;
    if (Math.abs(s - d.scale) > 1e-3) {
      d.scale = s;
      this.resize();
    }
  }

  private preset() {
    return CFG.quality[this.quality];
  }

  private postSettings() {
    const Q = this.preset();
    return { msaa: Q.msaa, ao: Q.ao, rays: Q.rays, refractScale: Q.refractScale };
  }

  /** Mapa otoczenia (oświetlenie obrazem) z kopuły nieba – po wczytaniu panoramy. */
  updateEnvironment(): void {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(this.sky.mesh.geometry, this.sky.material));
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(envScene, 0.02, 0.1, 500);
    this.scene.environment = this.envRT.texture;
    old?.dispose();
  }

  setLightScale(ambient: number, exposure: number): void {
    this.lightScale.ambient = ambient;
    this.lightScale.exposure = exposure;
    this.applySun();
  }

  applySun(): void {
    const s = CFG.sun;
    const k = this.lightScale.ambient;
    this.sunDir.setFromSphericalCoords(1, (90 - s.elevationDeg) * DEG, s.azimuthDeg * DEG);
    this.sun.position.copy(this.sunDir).multiplyScalar(200);
    this.sun.color.set(s.color);
    this.sun.intensity = s.intensity;
    this.fill.color.set(s.fillColor);
    this.fill.intensity = s.fillIntensity * k;
    this.fill.position.setFromSphericalCoords(100, (90 - s.fillElevationDeg) * DEG, s.fillAzimuthDeg * DEG);
    this.hemi.color.set(s.hemiSky);
    this.hemi.groundColor.set(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity * k;
    this.scene.environmentIntensity = s.envIntensity * k;
    this.renderer.toneMappingExposure = CFG.render.exposure * this.lightScale.exposure;
    this.scene.fog = null;
    this.scene.background = null;
    this.sky.updateMapping();
    this.sky.setSunDir(this.sunDir);
    this.skyZenith.set(CFG.sky.panoramaTop);
    this.skyHorizon.set(CFG.sky.horizon);
    this.post.applyConfig();
  }

  /** Kaskady cieni liczone względem kamery – nic nie trzeba przesuwać (zostaje dla zgodności). */
  followShadow(_target: THREE.Vector3): void {}

  /** Jakość grafiki z ekranu startowego / opcji. */
  setQuality(q: Quality): void {
    this.applyQuality(q);
  }

  private applyQuality(q: Quality): void {
    this.quality = q;
    CFG.quality.current = q;
    const Q = this.preset();
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== Q.shadowMapSize) {
      sh.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
      sh.map?.dispose();
      (sh as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    sh.camera.far = Q.shadowFar;
    sh.radius = Q.shadowRadius;
    this.reflection.scale = Q.reflectionScale;
    this.post.setSettings(this.postSettings());
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const Q = this.preset();
    // budżet pikseli: na ekranach o dużej gęstości nie renderujemy więcej niż pixelBudget
    const dpr = Math.min(window.devicePixelRatio || 1, Q.pixelRatioMax);
    const pr = Math.max(0.4, Math.min(dpr, Math.sqrt(Q.pixelBudget / Math.max(1, w * h))) * this.dyn.scale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.size);
    this.post.setSize(this.size.x, this.size.y);
    this.reflection.setSize(this.size.x, this.size.y);
  }

  /** Pełny potok renderu klatki. */
  render(dt: number): void {
    this.updateDynamicRes();
    const r = this.renderer;
    const cam = this.camera;
    const Q = this.preset();
    cam.updateMatrixWorld();
    this.sky.follow(cam);
    const wu = this.water?.material.uniforms;
    // 1. odbicie planarne (cienie z poprzedniej klatki)
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = false;
    if (Q.reflection && wu) {
      this.reflection.render(r, this.scene, cam, CFG.water.level, (rc) => this.sky.follow(rc));
      this.sky.follow(cam);
      wu.tReflect.value = this.reflection.target.texture;
      (wu.uReflectMatrix.value as THREE.Matrix4).copy(this.reflection.textureMatrix);
      wu.uReflectOn.value = 1;
    } else if (wu) wu.uReflectOn.value = 0;
    // 2. scena (warstwa 0) do HDR – tu liczone są kaskady cieni
    cam.layers.set(0);
    r.setRenderTarget(this.post.scene);
    r.shadowMap.needsUpdate = true;
    r.clear();
    r.render(this.scene, cam);
    // 3. kopia koloru i głębi dla refrakcji
    this.post.copyForRefraction(cam);
    // 4. woda i efekty na wodzie (bez czyszczenia bufora)
    if (wu) {
      wu.tRefract.value = this.post.refract.texture;
      wu.uRefractOn.value = 1;
      (wu.uResolution.value as THREE.Vector2).copy(this.size);
      this.bindPanorama(wu);
    }
    cam.layers.set(WATER_LAYER);
    cam.layers.enable(FX_LAYER);
    const ac = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(this.post.scene);
    r.render(this.scene, cam);
    r.autoClear = ac;
    cam.layers.set(0);
    // 5. efekty i wyjście na ekran
    this.post.finish(cam, this.sunDir, this.sun.color, CFG.post.exposure * this.lightScale.exposure, dt);
  }

  private bindPanorama(wu: Record<string, THREE.IUniform>): void {
    const pano = this.sky.material.uniforms.uPano.value as THREE.Texture | null;
    wu.tPano.value = pano;
    wu.uPanoOn.value = pano ? 1 : 0;
    const m = this.sky.mapping;
    (wu.uPanoMap.value as THREE.Vector4).set(m.azSun, m.uSun, m.eMin, m.eMax);
  }

  /**
   * Dodatkowy widok bezpośrednio na ekran (podgląd spławika): bez post-processingu, woda bez refrakcji
   * (odbicie panoramy), cienie z bieżącej klatki.
   */
  renderViewport(cam: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number): void {
    const r = this.renderer;
    const wu = this.water?.material.uniforms;
    if (wu) {
      wu.uRefractOn.value = 0;
      wu.uReflectOn.value = 0;
      this.bindPanorama(wu);
    }
    cam.layers.set(0);
    cam.layers.enable(WATER_LAYER);
    cam.layers.enable(FX_LAYER);
    this.sky.follow(cam);
    r.shadowMap.needsUpdate = false;
    r.setRenderTarget(null);
    r.setScissorTest(true);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.render(this.scene, cam);
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.clientWidth, r.domElement.clientHeight);
    this.sky.follow(this.camera);
  }
}
