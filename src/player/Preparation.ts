/**
 * Przygotowanie (tutorial jako lista celów): zejście nad jezioro, nabicie robaka, rzut.
 * Wędka jest w ręce od startu, robaki w ekwipunku (nieograniczone). Bez przynęty nie da się zarzucić.
 */
import * as THREE from 'three';
import { CFG } from '../config';
import { clamp01 } from '../core/math';
import { events } from '../core/Events';
import type { Input } from '../core/Input';
import { PIVOTS, pivot } from '../assets/AssetRegistry';
import type { Player } from './Player';
import type { FishingController, MsgKind } from '../fishing/FishingController';
import type { CameraRig } from '../render/CameraRig';

export interface Objective {
  id: string;
  text: string;
  done: boolean;
}

export class Preparation {
  readonly objectives: Objective[] = [
    { id: 'shore', text: 'Zejdź nad jezioro', done: false },
    { id: 'bait', text: 'Nabij robaka (przytrzymaj F)', done: false },
    { id: 'cast', text: 'Zarzuć', done: false },
  ];
  /** postęp nabijania 0..1 (null = nie nabija) */
  baitProgress: number | null = null;
  allDoneTime = -1;
  onMessage: (t: string, k: MsgKind) => void = () => {};

  constructor(
    private player: Player,
    private fishing: FishingController,
    private camera: CameraRig,
    readonly rodObj: THREE.Object3D,
    readonly wormBoxObj: THREE.Object3D,
  ) {
    this.wormBoxObj.visible = false;
  }

  /** Ekwipunek startowy: wędka w prawej dłoni, robaki w kieszeni. */
  equip(): void {
    const hand = pivot(this.player.root, PIVOTS.handR);
    hand.add(this.rodObj);
    this.rodObj.position.set(0, -0.03, 0);
    this.rodObj.rotation.set(0, 0, 0);
    this.fishing.attachRod(this.rodObj);
    this.fishing.gear.hasWorms = true;
    // pudełko z robakami pojawia się w lewej dłoni tylko podczas nabijania
    const handL = pivot(this.player.root, PIVOTS.handL);
    handL.add(this.wormBoxObj);
    this.wormBoxObj.position.set(0, -0.1, 0.02);
    this.wormBoxObj.visible = false;
    this.player.anim.setPose('holdRod');
  }

  complete(id: string): void {
    const o = this.objectives.find((x) => x.id === id);
    if (o && !o.done) o.done = true;
  }

  update(dt: number, input: Input, time: number): void {
    const f = this.fishing;
    // nabijanie robaka: przytrzymaj F
    const canBait = f.gear.rodInHand && f.gear.hasWorms && !f.gear.baitOn && f.fsm.is('IDLE', 'AIMING');
    if (input.consumePress('KeyF')) {
      if (!f.gear.rodInHand) this.onMessage('Brak wędki', 'warn');
      else if (!f.gear.hasWorms) this.onMessage('Brak robaków', 'warn');
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
        this.wormBoxObj.visible = true;
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

    // cele
    if (!this.objectives[0].done && f.canCastHere) this.complete('shore');
    if (!this.objectives[2].done && f.hasCastOnce) {
      this.complete('shore');
      this.complete('bait');
      this.complete('cast');
    }
    if (this.allDoneTime < 0 && this.objectives.every((o) => o.done)) this.allDoneTime = time;
  }

  /** Lista celów widoczna (znika chwilę po wykonaniu wszystkich). */
  objectivesVisible(time: number): boolean {
    return this.allDoneTime < 0 || time - this.allDoneTime < CFG.prep.objectivesLinger;
  }

  private finishBaitPose(): void {
    this.player.moveLocked = false;
    this.player.anim.fidget = 0;
    this.player.anim.setPose('holdRod');
    this.wormBoxObj.visible = false;
    this.camera.zoom = null;
  }

  private cancelBait(message: boolean): void {
    this.baitProgress = null;
    this.finishBaitPose();
    if (message) this.onMessage('Nabijanie przerwane', 'warn');
  }
}
