import * as THREE from 'three';
import { CFG } from '../config';
import { clamp, damp, smoothstep } from '../core/math';
import type { World } from '../world/World';

export type CamMode = 'follow' | 'fight' | 'external';

/**
 * Kamera trzecioosobowa: orbita myszą (pointer lock), ramię sprężynowe z kolizją z terenem,
 * tryb holu (kadruje wędkę i rybę, trzęsienie przy zrywach), płynne przejście z kamery cutscenki.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.18;
  mode: CamMode = 'external';
  private dist = CFG.camera.distance;
  /** nadpisanie docelowej długości ramienia (np. nabijanie robaka) */
  zoom: number | null = null;
  shake = 0;
  readonly fightFocus = new THREE.Vector3();
  private blendFrom: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private blendT = 0;
  private blendDur = 1;
  private readonly smPos = new THREE.Vector3();
  private readonly smLook = new THREE.Vector3();
  private fightInit = false;
  private time = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private world: World,
  ) {}

  get forwardFlat(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Start płynnego przejścia z bieżącej pozy kamery (np. cutscenki) do kamery gracza. */
  startBlend(duration: number): void {
    this.blendFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    this.blendT = 0;
    this.blendDur = duration;
  }

  get blending(): boolean {
    return this.blendFrom !== null;
  }

  /** Ustawia yaw tak, by kamera patrzyła w kierunku (dx,dz). */
  lookAlong(dx: number, dz: number): void {
    this.yaw = Math.atan2(dx, dz);
  }

  update(dt: number, look: { dx: number; dy: number }, playerPos: THREE.Vector3): void {
    this.time += dt;
    if (this.mode === 'external') return;
    const C = CFG.camera;
    if (this.mode === 'follow') {
      this.yaw -= look.dx * C.sensitivity;
      this.pitch = clamp(this.pitch + look.dy * C.sensitivity, C.pitchMin, C.pitchMax);
    }

    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    if (this.mode === 'follow') {
      this.fightInit = false;
      const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const pivot = playerPos.clone().add(new THREE.Vector3(0, C.height, 0)).addScaledVector(right, C.shoulder * (this.zoom !== null ? 0.6 : 1));
      const f = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      const want = this.zoom ?? C.distance;
      // kolizja ramienia z terenem i wodą
      let allowed = want;
      const N = 14;
      const p = new THREE.Vector3();
      for (let i = 1; i <= N; i++) {
        const d = (want * i) / N;
        p.copy(pivot).addScaledVector(f, -d);
        const g = this.world.terrainAt(p.x, p.z);
        const floor = Math.max(g, this.world.isWater(p.x, p.z, 0.01) ? CFG.water.level + 0.08 : -Infinity);
        if (p.y < floor + C.collisionPad || this.world.cameraBlocked(p.x, p.y, p.z)) {
          allowed = Math.max(C.minDistance, (want * (i - 1)) / N);
          break;
        }
      }
      this.dist = allowed < this.dist ? damp(this.dist, allowed, C.springIn, dt) : damp(this.dist, allowed, C.springOut, dt);
      target.copy(pivot).addScaledVector(f, -this.dist);
      // ostateczne zabezpieczenie przed wejściem w teren
      const g2 = this.world.terrainAt(target.x, target.z) + 0.2;
      if (target.y < g2) target.y = g2;
      lookAt.copy(pivot).addScaledVector(f, 5);
      this.smPos.copy(target);
      this.smLook.copy(lookAt);
    } else {
      // hol: kadr na wędkę i miejsce ryby
      const toFish = this.fightFocus.clone().sub(playerPos);
      toFish.y = 0;
      const dist = toFish.length();
      if (dist > 0.01) toFish.divideScalar(dist);
      else toFish.copy(this.forwardFlat);
      const right = new THREE.Vector3(-toFish.z, 0, toFish.x);
      target
        .copy(playerPos)
        .addScaledVector(toFish, -C.fightDistance * (0.75 + 0.25 * smoothstep(3, 25, dist)))
        .addScaledVector(right, -2.4)
        .add(new THREE.Vector3(0, C.fightHeight, 0));
      const g = this.world.terrainAt(target.x, target.z) + 0.4;
      if (target.y < g) target.y = g;
      lookAt.copy(playerPos).add(new THREE.Vector3(0, 1.4, 0)).lerp(this.fightFocus, 0.55);
      if (!this.fightInit) {
        this.smPos.copy(this.camera.position);
        this.smLook.copy(playerPos).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(this.forwardFlat, 6);
        this.fightInit = true;
      }
      this.smPos.lerp(target, 1 - Math.exp(-3 * dt));
      this.smLook.lerp(lookAt, 1 - Math.exp(-4 * dt));
      // yaw kamery podąża (po holu gracz wraca do orbity bez skoku)
      this.yaw = Math.atan2(this.smLook.x - this.smPos.x, this.smLook.z - this.smPos.z);
      this.pitch = 0.2;
      this.dist = C.distance;
    }

    const cam = this.camera;
    cam.position.copy(this.smPos);
    cam.lookAt(this.smLook);
    if (this.shake > 0.001) {
      const s = this.shake * C.shakeAmount;
      cam.position.x += Math.sin(this.time * 47) * s;
      cam.position.y += Math.sin(this.time * 61 + 1) * s;
      cam.rotateZ(Math.sin(this.time * 37) * s * 0.3);
      this.shake = damp(this.shake, 0, 4, dt);
    }

    if (this.blendFrom) {
      this.blendT += dt / this.blendDur;
      const t = smoothstep(0, 1, Math.min(1, this.blendT));
      const pos = cam.position.clone();
      const quat = cam.quaternion.clone();
      cam.position.lerpVectors(this.blendFrom.pos, pos, t);
      cam.quaternion.slerpQuaternions(this.blendFrom.quat, quat, t);
      if (this.blendT >= 1) this.blendFrom = null;
    }
  }
}
