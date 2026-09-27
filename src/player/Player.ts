import * as THREE from 'three';
import { CFG } from '../config';
import { dampAngle } from '../core/math';
import { events } from '../core/Events';
import type { Input } from '../core/Input';
import type { World } from '../world/World';
import { CollisionGrid, resolveCollisions, type CollisionResult } from './collision';
import { outsideBounds, onPier, porchHeight } from '../world/terrainMath';
import { CharacterAnimator } from './CharacterAnimator';

/** Kontroler postaci: przyspieszenie/hamowanie, płynny obrót, grawitacja, teren, kolizje, granice. */
export class Player {
  readonly root: THREE.Object3D;
  readonly anim: CharacterAnimator;
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  prevYaw = 0;
  grounded = true;
  /** sterowanie gracza (false w cutscence) */
  controlled = false;
  /** ruch zablokowany (np. zestaw w wodzie, nabijanie) */
  moveLocked = false;
  /** wymuszony kierunek patrzenia (np. celowanie) */
  faceYaw: number | null = null;
  private stepAcc = 0;
  private grid: CollisionGrid | null = null;
  private hit: CollisionResult = { x: 0, z: 0, hit: false };

  constructor(
    root: THREE.Object3D,
    private world: World,
  ) {
    this.root = root;
    this.anim = new CharacterAnimator(root);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  }

  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  onPier(): boolean {
    return onPier(this.pos.x, this.pos.z);
  }

  teleport(x: number, z: number, yaw: number): void {
    this.pos.set(x, this.world.groundAt(x, z), z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = this.prevYaw = yaw;
  }

  update(dt: number, input: Input | null, camYaw: number): void {
    const P = CFG.player;
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;

    // --- zamiar ruchu ---
    let ix = 0;
    let iz = 0;
    let running = false;
    if (input && this.controlled && !this.moveLocked) {
      if (input.held('KeyW')) iz += 1;
      if (input.held('KeyS')) iz -= 1;
      if (input.held('KeyD')) ix += 1;
      if (input.held('KeyA')) ix -= 1;
      running = input.held('ShiftLeft') || input.held('ShiftRight');
    }
    const len = Math.hypot(ix, iz);
    const tv = new THREE.Vector3();
    if (len > 0) {
      ix /= len;
      iz /= len;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const rx = -Math.cos(camYaw);
      const rz = Math.sin(camYaw);
      const sp = running ? P.runSpeed : P.walkSpeed;
      tv.set((fx * iz + rx * ix) * sp, 0, (fz * iz + rz * ix) * sp);
    }
    // przyspieszenie / hamowanie (bez natychmiastowej prędkości)
    const dvx = tv.x - this.vel.x;
    const dvz = tv.z - this.vel.z;
    const dv = Math.hypot(dvx, dvz);
    if (dv > 0) {
      const rate = tv.lengthSq() > this.vel.lengthSq() * 0.98 && len > 0 ? P.accel : P.decel;
      const k = Math.min(1, (rate * dt) / dv);
      this.vel.x += dvx * k;
      this.vel.z += dvz * k;
    }

    // obrót w kierunku ruchu (lub wymuszonego celu)
    const sp = this.speed;
    if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, P.turnRate, dt);
    else if (sp > 0.15) this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), P.turnRate, dt);

    // --- ruch poziomy + kolizje ---
    if (sp > 1e-4) {
      let nx = this.pos.x + this.vel.x * dt;
      let nz = this.pos.z + this.vel.z * dt;
      const blocked = (x: number, z: number) => {
        if (onPier(x, z)) return false;
        if (this.world.depthAt(x, z) > CFG.world.maxWadeDepth) return true;
        if (outsideBounds(x, z)) return true;
        const g = this.world.groundAt(x, z);
        return g - this.pos.y > P.maxStepUp;
      };
      if (blocked(nx, nz)) {
        // ślizg wzdłuż przeszkody (osobno osie)
        if (!blocked(nx, this.pos.z)) nz = this.pos.z;
        else if (!blocked(this.pos.x, nz)) nx = this.pos.x;
        else {
          nx = this.pos.x;
          nz = this.pos.z;
        }
        this.vel.multiplyScalar(0.5);
      }
      if (!this.grid) this.grid = new CollisionGrid(this.world.colliders);
      const r = resolveCollisions(nx, nz, P.radius, this.grid.near(nx, nz, P.radius + 0.5), this.hit);
      if (!blocked(r.x, r.z)) {
        this.pos.x = r.x;
        this.pos.z = r.z;
      }
      // kroki
      if (this.grounded) {
        this.stepAcc += sp * dt;
        const stepLen = running ? P.stepLengthRun : P.stepLengthWalk;
        if (this.stepAcc >= stepLen) {
          this.stepAcc = 0;
          events.emit('step', { surface: this.onPier() || porchHeight(this.pos.x, this.pos.z) > -Infinity ? 'wood' : this.world.depthAt(this.pos.x, this.pos.z) > 0 ? 'gravel' : 'grass', run: running });
        }
      }
    }

    // --- grawitacja + trzymanie się terenu ---
    const ground = this.world.groundAt(this.pos.x, this.pos.z);
    this.vel.y -= P.gravity * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= ground || (this.grounded && this.pos.y - ground < 0.35)) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.anim.update(dt, sp);
  }

  /** Pozycja/obrót do renderu (interpolacja). */
  applyVisual(alpha: number): void {
    this.root.position.lerpVectors(this.prevPos, this.pos, alpha);
    const d = Math.atan2(Math.sin(this.yaw - this.prevYaw), Math.cos(this.yaw - this.prevYaw));
    this.root.rotation.y = this.prevYaw + d * alpha;
  }

  /** Macierze w kroku fizyki (pozycja dłoni/szczytówki bez interpolacji). */
  applySim(): void {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
  }
}
