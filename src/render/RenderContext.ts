import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CFG } from '../config';
import { DEG } from '../core/math';

/** Renderer, scena, światła poranka, niebo i mgła. */
export class RenderContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  readonly sunDir = new THREE.Vector3();
  /** kolory nieba do odbić w wodzie (liczone z tego samego kierunku słońca) */
  readonly skyZenith = new THREE.Color(0x5a82ad);
  readonly skyHorizon = new THREE.Color(0xa9a698);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.render.pixelRatioMax));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CFG.render.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(CFG.camera.fov, window.innerWidth / window.innerHeight, 0.05, 900);

    this.scene.fog = new THREE.Fog(CFG.render.fogColor, CFG.render.fogNear, CFG.render.fogFar);
    this.scene.background = new THREE.Color(CFG.render.fogColor);

    this.hemi = new THREE.HemisphereLight(CFG.sun.hemiSky, CFG.sun.hemiGround, CFG.sun.hemiIntensity);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(CFG.sun.color, CFG.sun.intensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CFG.render.shadowMapSize, CFG.render.shadowMapSize);
    const b = CFG.render.shadowBox;
    const sc = this.sun.shadow.camera;
    sc.left = -b;
    sc.right = b;
    sc.top = b;
    sc.bottom = -b;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.sky.material.fog = false;
    this.scene.add(this.sky);
    this.applySun();

    window.addEventListener('resize', () => this.resize());
  }

  applySun(): void {
    const s = CFG.sun;
    const phi = (90 - s.elevationDeg) * DEG;
    const theta = s.azimuthDeg * DEG;
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u['turbidity'].value = s.turbidity;
    u['rayleigh'].value = s.rayleigh;
    u['mieCoefficient'].value = s.mieCoefficient;
    u['mieDirectionalG'].value = s.mieDirectionalG;
    u['sunPosition'].value.copy(this.sunDir);
    this.sun.color.set(s.color);
    this.sun.intensity = s.intensity;
    this.hemi.color.set(s.hemiSky);
    this.hemi.groundColor.set(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.renderer.toneMappingExposure = CFG.render.exposure;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(CFG.render.fogColor);
    fog.near = CFG.render.fogNear;
    fog.far = CFG.render.fogFar;
    (this.scene.background as THREE.Color).set(CFG.render.fogColor);
  }

  /** Cień podąża za obszarem gry (światło kierunkowe z pudełkiem wokół celu). */
  followShadow(target: THREE.Vector3): void {
    const snap = 2; // przyciąganie do siatki zmniejsza migotanie cieni
    const tx = Math.round(target.x / snap) * snap;
    const tz = Math.round(target.z / snap) * snap;
    this.sun.target.position.set(tx, target.y, tz);
    this.sun.position.set(tx, target.y, tz).addScaledVector(this.sunDir, 120);
  }

  /** Jakość grafiki z ekranu startowego. */
  setQuality(q: 'high' | 'low'): void {
    this.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, CFG.render.pixelRatioMax));
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
