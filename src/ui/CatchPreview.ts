import * as THREE from 'three';
import type { AssetRegistry } from '../assets/AssetRegistry';
import type { SpeciesId } from '../config';

/** Obracający się model złowionej ryby (osobny mały renderer w karcie ekranu złowienia). */
export class CatchPreview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 600 / 480, 0.01, 20);
  private fish: THREE.Object3D | null = null;
  private time = 0;
  active = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private assets: AssetRegistry,
  ) {
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
    key.position.set(1.5, 2, 2);
    const rim = new THREE.DirectionalLight(0x9ccaff, 1.6);
    rim.position.set(-2, 1, -2);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xdde8f0, 0x3a3020, 1.2));
    this.camera.position.set(0, 0.12, 1.25);
    this.camera.lookAt(0, 0, 0);
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(600, 480, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.9;
    } catch {
      this.renderer = null;
    }
    return this.renderer;
  }

  show(species: SpeciesId, lengthCm: number): void {
    if (this.fish) this.scene.remove(this.fish);
    // model w stałej wielkości kadru; długość widać w statystykach
    this.fish = this.assets.create('fish', { species, lengthM: 0.75 });
    this.fish.rotation.y = Math.PI / 2;
    const mat = (this.fish.getObjectByName('fish_body') as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
    const u = mat?.userData.uniforms as Record<string, { value: number }> | undefined;
    if (u) {
      u.uWaterY.value = -100; // brak zaniku podwodnego
      u.uSwim.value = 0.6;
    }
    this.fish.userData.lengthCm = lengthCm;
    this.scene.add(this.fish);
    this.time = 0;
    this.active = true;
  }

  hide(): void {
    this.active = false;
  }

  update(dt: number): void {
    if (!this.active || !this.fish) return;
    const r = this.ensureRenderer();
    if (!r) return;
    this.time += dt;
    this.fish.rotation.y = Math.PI / 2 + this.time * 0.8;
    this.fish.rotation.z = Math.sin(this.time * 1.3) * 0.12;
    const mat = (this.fish.getObjectByName('fish_body') as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
    const u = mat?.userData.uniforms as Record<string, { value: number }> | undefined;
    if (u) u.uTime.value = this.time;
    r.render(this.scene, this.camera);
  }
}
