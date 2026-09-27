/**
 * Przygotowanie (tutorial jako lista celów): bagażnik, wędka, robaki, nabijanie, dojście nad wodę, rzut.
 * Kolejność wymuszona: bez wędki i robaka nie da się nabić, bez przynęty nie da się zarzucić.
 */
import * as THREE from 'three';
import { CFG } from '../config';
import { clamp01, damp } from '../core/math';
import { events } from '../core/Events';
import type { Input } from '../core/Input';
import { PIVOTS, pivot } from '../assets/AssetRegistry';
import type { World } from '../world/World';
import type { Player } from './Player';
import { InteractionSystem } from './Interaction';
import type { FishingController, MsgKind } from '../fishing/FishingController';
import type { CameraRig } from '../render/CameraRig';

export interface Objective {
  id: string;
  text: string;
  done: boolean;
}

export class Preparation {
  readonly interaction = new InteractionSystem();
  readonly objectives: Objective[] = [
    { id: 'trunk', text: 'Otwórz bagażnik', done: false },
    { id: 'rod', text: 'Weź wędkę', done: false },
    { id: 'worms', text: 'Weź robaki', done: false },
    { id: 'bait', text: 'Nabij robaka (przytrzymaj F)', done: false },
    { id: 'shore', text: 'Idź na pomost / nad brzeg', done: false },
    { id: 'cast', text: 'Zarzuć', done: false },
  ];
  trunkOpen = false;
  private trunkAngle = 0;
  rodInTrunk = true;
  wormsInTrunk = true;
  /** postęp nabijania 0..1 (null = nie nabija) */
  baitProgress: number | null = null;
  allDoneTime = -1;
  onMessage: (t: string, k: MsgKind) => void = () => {};

  constructor(
    private world: World,
    private player: Player,
    private fishing: FishingController,
    private camera: CameraRig,
    readonly rodObj: THREE.Object3D,
    readonly wormBoxObj: THREE.Object3D,
  ) {
    const car = world.car;
    const lid = pivot(car, PIVOTS.trunkLid);
    this.interaction.add({
      id: 'trunk',
      label: () => (this.trunkOpen ? 'Zamknij bagażnik' : 'Otwórz bagażnik'),
      position: (out) => car.localToWorld(out.set(0, 1.0, -2.45)),
      enabled: () => !this.trunkOpen || (!this.rodInTrunk && !this.wormsInTrunk),
      onInteract: () => {
        this.trunkOpen = !this.trunkOpen;
        events.emit('trunk', { open: this.trunkOpen });
        if (this.trunkOpen) this.complete('trunk');
        this.player.anim.setPose('openTrunk', 10);
        this.poseTimer = 0.6;
      },
    });
    this.interaction.add({
      id: 'rod',
      label: () => 'Weź wędkę',
      position: (out) => car.localToWorld(out.set(0.25, 1.0, -2.3)),
      enabled: () => this.trunkOpen && this.rodInTrunk && this.trunkAngle > 0.8,
      onInteract: () => this.takeRod(),
    });
    this.interaction.add({
      id: 'worms',
      label: () => 'Weź robaki',
      position: (out) => car.localToWorld(out.set(-0.4, 1.0, -2.35)),
      enabled: () => this.trunkOpen && this.wormsInTrunk && this.trunkAngle > 0.8,
      onInteract: () => {
        this.wormsInTrunk = false;
        this.wormBoxObj.visible = false;
        this.fishing.gear.hasWorms = true;
        events.emit('pickup', { what: 'worms' });
        this.complete('worms');
        this.onMessage('Masz pudełko z robakami', 'good');
        this.player.anim.setPose('reach', 12);
        this.poseTimer = 0.5;
      },
    });
    this.lid = lid;
  }

  private lid: THREE.Object3D;
  private poseTimer = 0;

  /** Umieszcza wędkę i robaki w bagażniku (stan po cutscence). */
  stowInTrunk(): void {
    const car = this.world.car;
    const slotRod = pivot(car, PIVOTS.trunkSlotRod);
    const slotBox = pivot(car, PIVOTS.trunkSlotBox);
    slotRod.add(this.rodObj);
    this.rodObj.position.set(0, 0, 0);
    this.rodObj.rotation.set(0, 0, 0); // wzdłuż auta (+Z do przodu)
    slotBox.add(this.wormBoxObj);
    this.wormBoxObj.position.set(0, 0, 0);
    this.wormBoxObj.rotation.set(0, 0, 0);
    this.wormBoxObj.visible = true;
    this.rodInTrunk = true;
    this.wormsInTrunk = true;
    this.trunkOpen = false;
    this.trunkAngle = 0;
    this.lid.rotation.x = 0;
  }

  private takeRod(): void {
    this.rodInTrunk = false;
    const hand = pivot(this.player.root, PIVOTS.handR);
    hand.add(this.rodObj);
    this.rodObj.position.set(0, -0.03, 0);
    this.fishing.attachRod(this.rodObj);
    events.emit('pickup', { what: 'rod' });
    this.complete('rod');
    this.onMessage('Wędka w ręce', 'good');
  }

  complete(id: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o && !o.done) o.done = true;
  }

  get currentObjective(): Objective | null {
    return this.objectives.find((o) => !o.done) ?? null;
  }

  update(dt: number, input: Input, time: number): void {
    // klapa na zawiasie
    const target = this.trunkOpen ? 1 : 0;
    this.trunkAngle = damp(this.trunkAngle, target, 5.5 / CFG.prep.trunkOpenTime, dt);
    this.lid.rotation.x = this.trunkAngle * 1.62;

    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0 && this.baitProgress === null) this.player.anim.setPose(this.fishing.gear.rodInHand ? 'holdRod' : 'none');
    }

    // interakcje (nie w trakcie łowienia)
    const f = this.fishing;
    const camF = this.camera.forwardFlat;
    if (!f.busy && this.baitProgress === null) this.interaction.update(this.player.pos, camF);
    else this.interaction.current = null;
    if (this.interaction.current && input.consumePress('KeyE')) this.interaction.interact();

    // nabijanie robaka: przytrzymaj F
    const canBait = f.gear.rodInHand && f.gear.hasWorms && !f.gear.baitOn && f.fsm.is('IDLE', 'AIMING');
    if (input.consumePress('KeyF')) {
      if (!f.gear.rodInHand) this.onMessage('Najpierw weź wędkę', 'warn');
      else if (!f.gear.hasWorms) this.onMessage('Najpierw weź robaki z bagażnika', 'warn');
      else if (f.gear.baitOn) this.onMessage('Robak już jest na haczyku', 'info');
      else if (!f.fsm.is('IDLE', 'AIMING')) this.onMessage('Najpierw zwiń zestaw', 'warn');
      else this.baitProgress = 0;
    }
    if (this.baitProgress !== null) {
      if (!canBait) {
        this.cancelBait(false);
      } else if (!input.held('KeyF')) {
        this.cancelBait(true);
      } else {
        this.baitProgress = clamp01(this.baitProgress + dt / CFG.prep.baitHoldTime);
        this.player.moveLocked = true;
        this.player.anim.setPose('bait', 10);
        this.player.anim.fidget = 1;
        this.camera.zoom = CFG.camera.baitZoomDistance;
        if (this.baitProgress >= 1) {
          f.gear.baitOn = true;
          this.baitProgress = null;
          this.finishBaitPose();
          events.emit('baitOn', {});
          this.complete('bait');
          this.onMessage('Robak nabity na haczyk', 'good');
        }
      }
    }

    // cel: nad wodą
    if (!this.objectives[4].done && f.gear.rodInHand && f.canCastHere) this.complete('shore');
    if (!this.objectives[5].done && f.hasCastOnce) this.complete('cast');
    if (this.allDoneTime < 0 && this.objectives.every((o) => o.done)) this.allDoneTime = time;
  }

  private finishBaitPose(): void {
    this.player.moveLocked = false;
    this.player.anim.fidget = 0;
    this.player.anim.setPose('holdRod');
    this.camera.zoom = null;
  }

  private cancelBait(message: boolean): void {
    this.baitProgress = null;
    this.finishBaitPose();
    if (message) this.onMessage('Nabijanie przerwane', 'warn');
  }
}
