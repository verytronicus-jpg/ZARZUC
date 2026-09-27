import * as THREE from 'three';
import { CFG } from '../config';
import { damp, smoothstep, clamp } from '../core/math';
import { events } from '../core/Events';
import { PIVOTS, pivot } from '../assets/AssetRegistry';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import type { UpperPose } from '../player/CharacterAnimator';
import { RodController } from '../fishing/RodController';
import { ROAD, houseGroundHeight } from '../world/terrainMath';
import { Timeline, type Caption, type TimelineEvent, type TimelineHost } from './Timeline';
import { buildIntro, CAR_HOUSE, DRIVER_OFFSET, INTRO_START } from './introScript';

export interface CutsceneUI {
  setFade(a: number): void;
  setCaption(c: Caption | null, alpha: number): void;
}

/** Aktorzy cutscenki: postać (chód, pozy, chwytanie), auto (jazda, koła, zawieszenie, drzwi, bagażnik). */
export class IntroCutscene implements TimelineHost {
  readonly timeline: Timeline;
  private rodCtl: RodController;
  private lid: THREE.Object3D;
  private door: THREE.Object3D;
  private chassis: THREE.Object3D;
  private wheels: THREE.Object3D[];
  private lidTarget = 0;
  private doorTarget = 0;
  private carPath: THREE.CatmullRomCurve3;
  private carS = 0;
  private carSpeed = 0;
  private prevCarYaw = CAR_HOUSE.yaw;
  private walkPrev = new Map<TimelineEvent, THREE.Vector3>();
  private walkCurves = new Map<TimelineEvent, THREE.CatmullRomCurve3>();
  private rodHeld = false;
  private time = 0;
  ended = false;
  onEnd: () => void = () => {};

  constructor(
    private world: World,
    private player: Player,
    private rodObj: THREE.Object3D,
    private boxObj: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    private ui: CutsceneUI,
  ) {
    this.timeline = new Timeline(buildIntro(houseGroundHeight()), this, camera);
    this.rodCtl = new RodController(rodObj);
    const car = world.car;
    this.lid = pivot(car, PIVOTS.trunkLid);
    this.door = pivot(car, PIVOTS.doorL);
    this.chassis = pivot(car, PIVOTS.chassis);
    this.wheels = (['FL', 'FR', 'RL', 'RR'] as const).map((id) => {
      const w = pivot(car, PIVOTS.wheel(id));
      w.rotation.order = 'YXZ';
      return w;
    });
    // trasa auta: droga od domu do parkingu
    const pts = [...ROAD].reverse().map(([x, z]) => new THREE.Vector3(x, 0, z));
    pts[0].set(CAR_HOUSE.x, 0, CAR_HOUSE.z);
    pts.splice(1, 0, new THREE.Vector3(CAR_HOUSE.x - 0.5, 0, CAR_HOUSE.z - 5));
    pts[pts.length - 1].set(CFG.world.parkingX, 0, CFG.world.parkingZ - 1);
    this.carPath = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  }

  update(dt: number): void {
    this.time += dt;
    this.timeline.update(dt);
    // klapa i drzwi
    this.lid.rotation.x = damp(this.lid.rotation.x, this.lidTarget * 1.62, 5, dt);
    this.door.rotation.y = damp(this.door.rotation.y, this.doorTarget * -1.1, 7, dt);
    // wędka w ręce – niesiona pionowo
    if (this.rodHeld) {
      this.player.applySim();
      this.rodCtl.setDirection(this.player.yaw, 1.15);
      this.rodCtl.update(dt, 0, CFG.rod.kRod);
      this.rodCtl.bendToward.set(0, -1, 0);
      this.rodCtl.pose();
    }
    if (!this.ended && this.timeline.done) this.finish();
  }

  skip(): void {
    this.timeline.skipToEnd();
    this.lid.rotation.x = 0;
    this.door.rotation.y = 0;
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.ui.setFade(0);
    this.ui.setCaption(null, 0);
    this.onEnd();
  }

  // ---------------- TimelineHost ----------------
  target(name: string): THREE.Object3D | null {
    if (name === 'car') return this.world.car;
    if (name === 'actor') return this.player.root;
    return null;
  }

  setFade(a: number): void {
    this.ui.setFade(a);
  }

  setCaption(c: Caption | null, alpha: number): void {
    this.ui.setCaption(c, alpha);
  }

  fire(e: TimelineEvent): void {
    const p = this.player;
    switch (e.type) {
      case 'setup': {
        this.world.placeCar(CAR_HOUSE.x, CAR_HOUSE.z, CAR_HOUSE.yaw);
        this.prevCarYaw = CAR_HOUSE.yaw;
        p.root.visible = true;
        p.teleport(INTRO_START.x, INTRO_START.z, INTRO_START.yaw);
        p.anim.setPose('none');
        // wędka na stojaku, pudełko na półce
        const rack = this.world.rodRack;
        pivot(rack, PIVOTS.rackSlot).add(this.rodObj);
        this.rodObj.position.set(0, 0, 0);
        this.rodObj.rotation.set(-Math.PI / 2 + 0.12, 0, 0);
        pivot(rack, PIVOTS.shelfSlot).add(this.boxObj);
        this.boxObj.position.set(0, 0, 0);
        this.boxObj.rotation.set(0, 0.4, 0);
        this.boxObj.visible = true;
        this.lidTarget = 0;
        this.doorTarget = 0;
        this.lid.rotation.x = 0;
        break;
      }
      case 'pose':
        p.anim.setPose(e.pose as UpperPose, 9);
        break;
      case 'attach': {
        const item = e.item === 'rod' ? this.rodObj : this.boxObj;
        if (e.to === 'trunk') {
          const slot = pivot(this.world.car, e.item === 'rod' ? PIVOTS.trunkSlotRod : PIVOTS.trunkSlotBox);
          slot.add(item);
          item.position.set(0, 0, 0);
          item.rotation.set(0, 0, 0);
          if (e.item === 'rod') this.rodHeld = false;
        } else {
          const hand = pivot(p.root, e.to === 'hand_R' ? PIVOTS.handR : PIVOTS.handL);
          hand.add(item);
          item.position.set(0, e.item === 'box' ? -0.1 : -0.03, e.item === 'box' ? 0.02 : 0);
          item.rotation.set(0, 0, 0);
          if (e.item === 'rod') {
            this.rodHeld = true;
            this.rodCtl.setDirection(p.yaw, 1.15, true);
          }
        }
        events.emit('pickup', { what: String(e.item) });
        break;
      }
      case 'trunk':
        this.lidTarget = e.open ? 1 : 0;
        events.emit('trunk', { open: Boolean(e.open) });
        break;
      case 'door':
        this.doorTarget = e.open ? 1 : 0;
        events.emit('carDoor', {});
        break;
      case 'hide':
        p.root.visible = false;
        break;
      case 'show': {
        const car = this.world.car;
        const w = car.localToWorld(new THREE.Vector3(DRIVER_OFFSET.x, 0, DRIVER_OFFSET.z));
        p.teleport(w.x, w.z, car.rotation.y);
        p.root.visible = true;
        p.anim.setPose('none');
        break;
      }
      case 'engine':
        events.emit('engine', { on: Boolean(e.on) });
        break;
      case 'end':
        break;
    }
  }

  track(e: TimelineEvent, progress: number, dt: number): void {
    if (e.type === 'walk') this.trackWalk(e, progress, dt);
    else if (e.type === 'drive') this.trackDrive(e, progress, dt);
  }

  private trackWalk(e: TimelineEvent, progress: number, dt: number): void {
    let curve = this.walkCurves.get(e);
    if (!curve) {
      const pts = (e.path as Array<[number, number]>).map(([x, z]) => new THREE.Vector3(x, 0, z));
      curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.walkCurves.set(e, curve);
    }
    // łagodny start i stop
    const u = smoothstep(0, 1, progress) * 0.25 + progress * 0.75;
    const pt = curve.getPointAt(Math.min(1, u));
    const p = this.player;
    const prev = this.walkPrev.get(e) ?? pt.clone();
    const speed = dt > 0 ? prev.distanceTo(pt) / dt : 0;
    this.walkPrev.set(e, pt.clone());
    p.prevPos.copy(p.pos);
    p.prevYaw = p.yaw;
    p.pos.set(pt.x, this.world.groundAt(pt.x, pt.z), pt.z);
    if (progress < 1) {
      const tan = curve.getTangentAt(Math.min(0.999, u));
      p.yaw = Math.atan2(tan.x, tan.z);
    } else if (typeof e.endYaw === 'number') p.yaw = e.endYaw;
    p.vel.set(0, 0, 0);
    p.anim.update(dt, progress < 1 ? clamp(speed, 0, CFG.player.runSpeed) : 0);
    if (progress >= 1) p.prevPos.copy(p.pos);
  }

  private trackDrive(_e: TimelineEvent, progress: number, dt: number): void {
    const len = this.carPath.getLength();
    // profil prędkości: rozpędzanie – jazda – hamowanie
    const u = smoothstep(0, 1, progress);
    const s = u * len;
    const ds = s - this.carS;
    this.carS = s;
    const speed = dt > 0 ? ds / dt : 0;
    const acc = dt > 0 ? (speed - this.carSpeed) / dt : 0;
    this.carSpeed = speed;
    const t = Math.min(1, s / len);
    const pt = this.carPath.getPointAt(t);
    const tan = this.carPath.getTangentAt(Math.min(0.999, t));
    let yaw = Math.atan2(tan.x, tan.z);
    if (progress >= 1) yaw = Math.PI;
    const car = this.world.car;
    car.rotation.order = 'YXZ';
    const L = 2.7;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const hf = this.world.terrainAt(pt.x + fx * L * 0.5, pt.z + fz * L * 0.5);
    const hb = this.world.terrainAt(pt.x - fx * L * 0.5, pt.z - fz * L * 0.5);
    this.world.placeCar(pt.x, pt.z, yaw);
    car.position.y = (hf + hb) / 2;
    car.rotation.x = -Math.atan2(hf - hb, L);
    // koła: obrót od przebytej drogi, skręt od krzywizny
    const yawRate = dt > 0 ? Math.atan2(Math.sin(yaw - this.prevCarYaw), Math.cos(yaw - this.prevCarYaw)) / Math.max(1e-3, ds) : 0;
    this.prevCarYaw = yaw;
    const steer = clamp(yawRate * 2.6, -0.5, 0.5);
    this.wheels.forEach((w, i) => {
      w.rotation.x += ds / 0.33;
      if (i < 2) w.rotation.y = damp(w.rotation.y, steer, 8, dt);
    });
    // zawieszenie: bujanie + przechył od przyspieszenia
    const sp01 = clamp(speed / 20, 0, 1);
    this.chassis.position.y = Math.sin(this.time * 9.3) * 0.012 * sp01 + Math.sin(this.time * 3.1) * 0.01 * sp01;
    this.chassis.rotation.x = damp(this.chassis.rotation.x, clamp(-acc * 0.006, -0.05, 0.05), 5, dt);
    this.chassis.rotation.z = damp(this.chassis.rotation.z, clamp(-steer * sp01 * 0.08, -0.04, 0.04), 5, dt);
    if (progress >= 1) {
      this.chassis.position.y = 0;
      this.chassis.rotation.set(0, 0, 0);
      car.rotation.x = 0;
      this.wheels.forEach((w, i) => i < 2 && (w.rotation.y = 0));
    }
    car.updateMatrixWorld(true);
    // kierowca jedzie z autem (cel kamery 'actor')
    const seat = car.localToWorld(new THREE.Vector3(0.4, 0, 0.2));
    this.player.pos.copy(seat);
    this.player.prevPos.copy(seat);
    this.player.yaw = this.player.prevYaw = yaw;
  }
}
