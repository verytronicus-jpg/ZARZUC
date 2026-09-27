import * as THREE from 'three';
import { REFLECT_LAYER } from './layers';

/**
 * Odbicie planarne tafli (poziom wody): kamera lustrzana z ukośną płaszczyzną obcięcia (Lengyel),
 * renderuje tylko obiekty z warstwy REFLECT_LAYER (niebo, góry, las, chatka, pomost, łódka, postać…).
 * Woda próbkuje wynik przez textureMatrix (projekcja punktu tafli do kamery lustrzanej).
 */
export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  readonly camera = new THREE.PerspectiveCamera();
  private plane = new THREE.Plane();
  private clip = new THREE.Vector4();
  private q = new THREE.Vector4();
  private normal = new THREE.Vector3(0, 1, 0);
  private tmp = {
    view: new THREE.Vector3(),
    target: new THREE.Vector3(),
    look: new THREE.Vector3(),
    camPos: new THREE.Vector3(),
    planePos: new THREE.Vector3(),
    rot: new THREE.Matrix4(),
  };
  scale = 0.5;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.camera.layers.set(REFLECT_LAYER);
  }

  setSize(w: number, h: number): void {
    this.target.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, level: number, onBefore?: (cam: THREE.Camera) => void): void {
    const t = this.tmp;
    t.camPos.setFromMatrixPosition(camera.matrixWorld);
    if (t.camPos.y <= level) return;
    t.planePos.set(t.camPos.x, level, t.camPos.z);
    const n = this.normal;
    t.view.subVectors(t.planePos, t.camPos).reflect(n).negate().add(t.planePos);
    t.rot.extractRotation(camera.matrixWorld);
    t.look.set(0, 0, -1).applyMatrix4(t.rot).add(t.camPos);
    t.target.subVectors(t.planePos, t.look).reflect(n).negate().add(t.planePos);
    const rc = this.camera;
    rc.position.copy(t.view);
    rc.up.set(0, 1, 0).applyMatrix4(t.rot).reflect(n);
    rc.lookAt(t.target);
    rc.far = camera.far;
    rc.near = camera.near;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // ukośna płaszczyzna obcięcia (nic spod tafli)
    this.plane.setFromNormalAndCoplanarPoint(n, t.planePos).applyMatrix4(rc.matrixWorldInverse);
    const c = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = rc.projectionMatrix;
    const q = this.q;
    q.x = (Math.sign(c.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(c.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1;
    q.w = (1 + pm.elements[10]) / pm.elements[14];
    c.multiplyScalar(2 / c.dot(q));
    pm.elements[2] = c.x;
    pm.elements[6] = c.y;
    pm.elements[10] = c.z + 1 - 0.003;
    pm.elements[14] = c.w;
    rc.projectionMatrixInverse.copy(pm).invert();
    onBefore?.(rc);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, rc);
    renderer.setRenderTarget(prev);
  }
}
