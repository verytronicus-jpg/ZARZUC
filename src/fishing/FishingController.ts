/**
 * MASZYNA STANÓW ŁOWIENIA
 * IDLE → AIMING → CHARGING → CASTING → SETTLING → WAITING → NIBBLE → BITE → FIGHT → LANDING → CAUGHT → IDLE
 * Porażki: MISSED_EARLY, BAIT_STOLEN, LINE_SNAPPED, FISH_ESCAPED (każda z komunikatem i timeoutem).
 */
import * as THREE from 'three';
import { CFG, KGF, speciesById, type SpeciesConfig, type SpeciesId } from '../config';
import { StateMachine } from '../core/StateMachine';
import { clamp, clamp01, damp, DEG, lerp, triangle, fmt, smoothstep } from '../core/math';
import type { Rng } from '../core/Rng';
import type { Input } from '../core/Input';
import { events } from '../core/Events';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import type { AssetRegistry } from '../assets/AssetRegistry';
import { PIVOTS, pivot } from '../assets/AssetRegistry';
import { Bobber, type BobberEnv } from './Bobber';
import { VerletLine, LineRenderer } from './VerletLine';
import { RodController } from './RodController';
import { TensionModel, slackEscapeProbability } from './tension';
import { FightFish, type FishEnv } from './FightFish';
import { createBitePattern, type BitePattern } from './bitePatterns';
import { biteRate, evaluateStrike, poissonFires } from './strike';
import { rollFish, spotAttraction, sampleLength, weightGrams, type FishInstance, type SpotEnv } from './species';
import { launchVelocity, simulateRange } from './cast';
import { onPier } from '../world/terrainMath';

export type FState =
  | 'IDLE'
  | 'AIMING'
  | 'CHARGING'
  | 'CASTING'
  | 'SETTLING'
  | 'WAITING'
  | 'NIBBLE'
  | 'BITE'
  | 'FIGHT'
  | 'LANDING'
  | 'CAUGHT'
  | 'MISSED_EARLY'
  | 'BAIT_STOLEN'
  | 'LINE_SNAPPED'
  | 'FISH_ESCAPED';

export interface Gear {
  rodInHand: boolean;
  hasWorms: boolean;
  baitOn: boolean;
}

export type MsgKind = 'info' | 'good' | 'bad' | 'warn';

export interface CaughtFish extends FishInstance {
  fightTime: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class FishingController {
  readonly fsm: StateMachine<FState>;
  readonly bobber: Bobber;
  readonly line = new VerletLine();
  readonly lineRenderer = new LineRenderer(CFG.line.points);
  readonly dropperRenderer = new LineRenderer(2, 0xdddddd, 0.55);
  readonly tension: TensionModel;
  rod: RodController | null = null;
  floatObj: THREE.Object3D;
  hookObj: THREE.Object3D;
  wormOnHook: THREE.Object3D | null;
  fishObj: THREE.Object3D | null = null;
  fish: FightFish | null = null;
  fishInfo: FishInstance | null = null;
  pattern: BitePattern | null = null;
  gear: Gear = { rodInHand: false, hasWorms: false, baitOn: false };

  /** wypuszczona żyłka [m] */
  L = CFG.cast.hangLength;
  power = 0;
  dragKgf = CFG.reel.dragDefaultKgf;
  reeling = false;
  tSinceSettle = 0;
  spookCooldown = 0;
  rodSide = 0;
  rodUp = 0.45;
  canLand = false;
  canCastHere = false;
  castBlockReason = '';
  lastT = 0;
  fatigueBias = 0;
  fatigueShown = 1;
  dragPayout = 0;
  estRange = 0;
  fightTime = 0;
  hasCastOnce = false;
  private swingDir = 0;
  private launched = false;
  private strikeCooldown = 0;
  private lateralSign = 1;
  private landingFrom = new THREE.Vector3();
  private attraction = 1;
  private splashCooldown = 0;
  private reelRippleT = 0;
  private reelHeld = 0;
  private lastTip = new THREE.Vector3();

  onMessage: (text: string, kind: MsgKind, time?: number) => void = () => {};
  onCatch: (fish: CaughtFish) => void = () => {};
  onCast: () => void = () => {};
  onSurge: () => void = () => {};

  readonly bobberEnv: BobberEnv;
  readonly fishEnv: FishEnv;

  constructor(
    private world: World,
    private player: Player,
    private input: Input,
    private rng: Rng,
    assets: AssetRegistry,
    private scene: THREE.Scene,
  ) {
    this.bobber = new Bobber(rng);
    this.tension = new TensionModel(
      {
        kRod: CFG.rod.kRod,
        ea: CFG.line.ea,
        damping: CFG.line.damping,
        strengthN: CFG.line.strengthKgf * KGF,
        snapTime: CFG.line.snapTime,
        spoolAccel: CFG.reel.spoolAccel,
        spoolMaxSpeed: CFG.reel.spoolMaxSpeed,
        spoolFriction: CFG.reel.spoolFriction,
        reelSpeed: CFG.reel.speed,
        minLine: 0.5,
      },
      this.dragKgf * KGF,
    );
    this.floatObj = assets.create('float');
    this.hookObj = assets.create('hook');
    this.wormOnHook = this.hookObj.getObjectByName('worm_on_hook') ?? null;
    this.floatObj.visible = false;
    this.hookObj.visible = false;
    this.lineRenderer.object.visible = false;
    this.dropperRenderer.object.visible = false;
    scene.add(this.floatObj, this.hookObj, this.lineRenderer.object, this.dropperRenderer.object);
    this.assets = assets;

    this.bobberEnv = {
      waterY: (x, z) => world.waterY(x, z),
      terrainY: (x, z) => world.terrainAt(x, z),
      depth: (x, z) => world.depthAt(x, z),
    };
    this.fishEnv = {
      depth: (x, z) => world.depthAt(x, z),
      waterY: (x, z) => world.waterY(x, z),
      reedDistance: (x, z) => world.reedDistance(x, z),
      nearestReed: (x, z) => {
        let best: { x: number; z: number } | null = null;
        let bd = Infinity;
        for (const p of world.reedPoints) {
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        return best;
      },
    };

    this.fsm = new StateMachine<FState>('IDLE');
    this.setupStates();
  }

  private assets: AssetRegistry;

  get strengthN(): number {
    return CFG.line.strengthKgf * KGF;
  }

  get tensionRatio(): number {
    return this.lastT / this.strengthN;
  }

  get state(): FState {
    return this.fsm.state;
  }

  /** zestaw w wodzie (nie w ręce) */
  get rigOut(): boolean {
    return !this.fsm.is('IDLE', 'AIMING', 'CHARGING', 'CAUGHT', 'LINE_SNAPPED') && !(this.fsm.is('CASTING') && !this.launched);
  }

  get busy(): boolean {
    return !this.fsm.is('IDLE', 'AIMING');
  }

  attachRod(rodObj: THREE.Object3D): void {
    this.rod = new RodController(rodObj);
    this.gear.rodInHand = true;
    this.rod.setDirection(this.player.yaw, CFG.rod.idlePitchDeg * DEG, true);
    this.floatObj.visible = true;
    this.hookObj.visible = true;
    this.lineRenderer.object.visible = true;
    this.dropperRenderer.object.visible = true;
    this.player.applySim();
    this.rod.pose();
    this.rod.tipWorld(this.lastTip);
    this.bobber.toHand(this.lastTip);
    this.line.reset(this.lastTip, this.bobber.pos);
  }

  private msg(text: string, kind: MsgKind = 'info', time?: number): void {
    this.onMessage(text, kind, time);
  }

  /** Tekst podpowiedzi dla bieżącego stanu (HUD). */
  get hint(): string {
    switch (this.fsm.state) {
      case 'IDLE':
        if (!this.gear.rodInHand) return '';
        if (!this.gear.baitOn) return this.gear.hasWorms ? 'Przytrzymaj [F], aby nabić robaka' : 'Brak przynęty';
        return this.castBlockReason || 'Podejdź nad wodę';
      case 'AIMING':
        return 'Celuj kamerą · przytrzymaj [LPM], by zarzucić';
      case 'CHARGING':
        return 'Puść [LPM] przy właściwej sile';
      case 'CASTING':
        return 'Zestaw leci…';
      case 'SETTLING':
        return 'Spławik się ustawia…';
      case 'WAITING':
        if (this.reeling) return `Zwijanie… ${fmt(this.L, 1)} m`;
        if (!this.gear.baitOn) return 'Brak robaka – przytrzymaj [LPM], by zwinąć, potem nabij nowego';
        if (this.bobber.mode === 'land') return 'Zestaw na brzegu – zwiń [LPM]';
        if (this.reeling) return `Zwijanie… ${fmt(this.L, 1)} m`;
        return this.bobber.lying ? 'Przynęta leży na dnie – płytko (branie rzadziej) · przytrzymaj [LPM], by zwinąć' : 'Obserwuj spławik · [PPM] zatnij · przytrzymaj [LPM], by zwinąć';
      case 'NIBBLE':
        return 'Coś skubie… czekaj, jeszcze nie zacinaj';
      case 'BITE':
        return 'BIERZE! Zatnij [PPM]!';
      case 'FIGHT':
        return this.canLand
          ? '[E] Wyciągnij rybę'
          : 'Hol: [LPM] zwijaj · mysz = kąt wędki · kółko = hamulec';
      case 'LANDING':
        return 'Wyciągasz rybę…';
      case 'CAUGHT':
        return '';
      case 'MISSED_EARLY':
      case 'BAIT_STOLEN':
      case 'FISH_ESCAPED':
        return this.reeling ? `Zwijanie… ${fmt(this.L, 1)} m` : 'Przytrzymaj [LPM], by zwinąć zestaw';
      case 'LINE_SNAPPED':
        return 'Wiążesz nowy zestaw…';
    }
  }

  // ------------------------------------------------------------------
  private setupStates(): void {
    const B = CFG.bite;
    this.fsm.setHandlers({
      IDLE: {
        enter: () => {
          this.player.moveLocked = false;
          this.player.faceYaw = null;
          this.canLand = false;
        },
      },
      AIMING: {
        enter: () => {
          this.player.moveLocked = false;
        },
      },
      CHARGING: {
        timeout: CFG.cast.chargeTimeout,
        enter: () => {
          this.power = 0;
          this.player.moveLocked = true;
        },
        onTimeout: () => {
          this.msg('Rzut anulowany', 'warn');
          this.fsm.go('AIMING');
        },
      },
      CASTING: {
        timeout: CFG.cast.flightTimeout,
        enter: () => {
          this.launched = false;
          this.player.moveLocked = true;
          events.emit('castWhoosh', { power: this.power });
        },
        onTimeout: () => this.fsm.go('SETTLING'),
      },
      SETTLING: {
        timeout: CFG.rig.settleTimeout,
        enter: () => {
          this.tSinceSettle = 0;
        },
        onTimeout: () => this.fsm.go('WAITING'),
      },
      WAITING: {
        timeout: B.waitTimeout,
        enter: () => {
          this.bobber.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
          this.pattern = null;
          this.forced = false;
        },
        onTimeout: () => {
          if (this.gear.baitOn && this.bobber.mode === 'water') this.msg('Nic nie bierze… spróbuj w innym miejscu (głębiej / przy trzcinach)', 'info', 4);
          this.fsm.setTimeout(this.fsm.time + B.waitTimeout);
        },
      },
      NIBBLE: {
        timeout: () => this.pattern?.nibbleDuration ?? 1,
        onTimeout: () => this.endNibble(),
      },
      BITE: {
        timeout: () => this.pattern?.window ?? 1,
        enter: () => {
          this.lateralSign = this.rng.sign();
          this.input.clearMotionHistory();
          events.emit('bite', {});
          this.msg('Bierze! Zatnij [PPM]', 'good', Math.max(0.6, this.pattern?.window ?? 1));
        },
        onTimeout: () => {
          this.gear.baitOn = false;
          this.msg('Za późno! Ryba zjadła robaka', 'bad');
          this.fsm.go('BAIT_STOLEN');
        },
      },
      FIGHT: {
        timeout: CFG.fight.fightTimeout,
        enter: () => this.startFight(),
        onTimeout: () => {
          this.msg('Ryba się spięła (zbyt długi hol)', 'bad');
          this.fsm.go('FISH_ESCAPED');
        },
      },
      LANDING: {
        timeout: CFG.landing.liftTime,
        enter: () => {
          if (this.fish) this.landingFrom.copy(this.fish.pos);
          this.player.faceYaw = null;
        },
        onTimeout: () => this.fsm.go('CAUGHT'),
      },
      CAUGHT: {
        enter: () => {
          this.gear.baitOn = false;
          this.bobber.toHand(this.lastTip);
          this.L = CFG.cast.hangLength;
          if (this.fishObj) this.fishObj.visible = false;
          events.emit('caught', {});
          if (this.fishInfo) this.onCatch({ ...this.fishInfo, fightTime: this.fightTime });
        },
      },
      MISSED_EARLY: {
        timeout: B.failStateTime,
        enter: () => {
          this.bobber.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
          this.spookCooldown = B.spookCooldown;
          this.tSinceSettle = 0;
        },
        onTimeout: () => this.fsm.go('WAITING'),
      },
      BAIT_STOLEN: {
        timeout: B.failStateTime,
        enter: () => {
          this.bobber.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
          this.gear.baitOn = false;
        },
        onTimeout: () => this.fsm.go('WAITING'),
      },
      FISH_ESCAPED: {
        timeout: B.failStateTime,
        enter: () => this.releaseFish(),
        onTimeout: () => this.fsm.go('WAITING'),
      },
      LINE_SNAPPED: {
        timeout: B.failStateTime + 0.8,
        enter: () => {
          events.emit('lineSnap', {});
          this.line.endPinned = false;
          this.floatObj.visible = false;
          this.hookObj.visible = false;
          this.dropperRenderer.object.visible = false;
          this.gear.baitOn = false;
          if (this.fishObj) this.fishObj.visible = false;
          this.fish = null;
          this.lastT = 0;
        },
        onTimeout: () => {
          this.line.endPinned = true;
          this.floatObj.visible = true;
          this.hookObj.visible = true;
          this.dropperRenderer.object.visible = true;
          this.L = CFG.cast.hangLength;
          this.bobber.toHand(this.lastTip);
          this.line.reset(this.lastTip, this.bobber.pos);
          this.msg('Nowy zestaw zawiązany – nabij robaka [F]', 'info');
          this.fsm.go('IDLE');
        },
      },
    });
    this.fsm.start();
  }

  // ------------------------------------------------------------------
  /** Sprawdza, czy z tego miejsca można zarzucić (brzeg/pomost + patrzenie na wodę). */
  updateCastZone(camYaw: number): void {
    const p = this.player.pos;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let nearWater = onPier(p.x, p.z);
    if (!nearWater) {
      for (let d = 0.5; d <= CFG.cast.shoreReach; d += 0.5) {
        if (this.world.isWater(p.x + fx * d, p.z + fz * d, 0.05)) {
          nearWater = true;
          break;
        }
      }
    }
    const look = CFG.cast.lookSampleDist;
    const looking = this.world.isWater(p.x + fx * look, p.z + fz * look, 0.3) && this.world.isWater(p.x + fx * look * 0.6, p.z + fz * look * 0.6, 0.1);
    this.canCastHere = nearWater && looking;
    this.castBlockReason = !nearWater ? 'Podejdź nad brzeg lub na pomost' : !looking ? 'Spójrz na wodę' : '';
  }

  private endNibble(): void {
    if (this.forced) {
      this.forced = false;
      this.fsm.go('BITE');
      return;
    }
    const info = this.fishInfo;
    const sp = info ? speciesById(info.species) : null;
    if (info && sp && info.lengthCm <= sp.nibblerMaxCm && this.rng.chance(CFG.bite.stealChance)) {
      this.gear.baitOn = false;
      this.msg('Drobnica obskubała robaka!', 'bad');
      this.fsm.go('BAIT_STOLEN');
      return;
    }
    if (this.rng.chance(CFG.bite.abandonChance)) {
      this.msg('Ryba odpłynęła…', 'info');
      this.tSinceSettle = Math.min(this.tSinceSettle, CFG.bite.rampTime * 0.5);
      this.fsm.go('WAITING');
      return;
    }
    this.fsm.go('BITE');
  }

  private spotEnv(x: number, z: number): SpotEnv {
    return { depth: this.world.depthAt(x, z), reedDist: this.world.reedDistance(x, z), pierDist: this.world.pierDistance(x, z) };
  }

  /** Wymuszenie brania (debug). */
  forceBite(species?: SpeciesId, lengthCm?: number): void {
    if (this.fsm.is('WAITING', 'SETTLING') && this.bobber.mode === 'water') {
      this.gear.baitOn = true;
      this.startNibble(species, lengthCm);
      this.forced = true;
    }
  }

  /** wymuszone branie (debug) zawsze przechodzi do BITE */
  private forced = false;

  private startNibble(forceSpecies?: SpeciesId, forceLength?: number): void {
    const env = this.spotEnv(this.bobber.pos.x, this.bobber.pos.z);
    this.fishInfo = rollFish(this.rng, env);
    if (forceSpecies) {
      const fs = speciesById(forceSpecies);
      const len = forceLength ?? sampleLength(this.rng, fs);
      this.fishInfo = { species: fs.id, lengthCm: len, weightG: weightGrams(fs, len) };
    }
    const sp = speciesById(this.fishInfo.species);
    this.pattern = createBitePattern(sp.id, sp.bite.window, this.rng);
    const a = this.rng.range(0, Math.PI * 2);
    this.bobber.lateralDir.set(Math.cos(a), 0, Math.sin(a));
    this.fsm.go('NIBBLE');
  }

  private strikeRequested(): boolean {
    const rmb = this.input.consumeMousePress(2);
    if (this.strikeCooldown > 0) return false;
    let jerk = false;
    // szarpnięcie myszą liczy się TYLKO w oknie brania (zwykłe rozglądanie się przy skubaniu nie płoszy ryby)
    if (CFG.bite.jerkStrike && this.fsm.is('BITE') && this.input.recentDownMotion(CFG.bite.jerkWindowMs) > CFG.bite.jerkPixels) {
      jerk = true;
      this.input.clearMotionHistory();
    }
    if (rmb || jerk) {
      this.strikeCooldown = 0.5;
      return true;
    }
    return false;
  }

  private doStrike(): void {
    events.emit('strike', {});
    this.rod!.extraBend = 0;
    // szarpnięcie wędką w górę
    this.rod!.pitch = CFG.rod.aimPitchDeg * DEG * 1.3;
    const phase = this.fsm.is('NIBBLE') ? 'nibble' : this.fsm.is('BITE') ? 'bite' : 'waiting';
    const res = evaluateStrike(phase, this.fsm.time, this.pattern?.window ?? 1, this.rng, CFG.bite);
    switch (res) {
      case 'empty':
        this.msg('Zacięcie w pustkę', 'info');
        this.jerkRig(0.35);
        break;
      case 'spooked':
        this.msg('Za wcześnie! Spłoszyłeś rybę', 'bad');
        this.jerkRig(0.3);
        this.fsm.go('MISSED_EARLY');
        break;
      case 'aborted':
        this.msg('Za wcześnie – ryba przerwała próbę', 'warn');
        this.jerkRig(0.3);
        this.tSinceSettle = 0;
        this.fsm.go('WAITING');
        break;
      case 'hooked':
        this.msg('Zacięta!', 'good', 1.5);
        this.fsm.go('FIGHT');
        break;
      case 'missed':
        this.msg('Pusto! Haczyk nie chwycił – ryba spadła', 'bad');
        this.fsm.go('FISH_ESCAPED');
        break;
      case 'stolen':
        this.gear.baitOn = false;
        this.msg('Za późno! Ryba zjadła robaka', 'bad');
        this.fsm.go('BAIT_STOLEN');
        break;
    }
  }

  /** Szarpnięcie zestawem w stronę wędki (zacięcie bez ryby). */
  private jerkRig(dist: number): void {
    if (this.bobber.mode !== 'water') return;
    tmpA.copy(this.lastTip).sub(this.bobber.pos);
    tmpA.y = 0;
    const d = tmpA.length();
    if (d < 0.5) return;
    tmpA.divideScalar(d);
    this.bobber.pos.addScaledVector(tmpA, Math.min(dist, d - 0.5));
    this.bobber.shotDepth *= 0.5;
    this.bobber.vel.y += 0.3;
    this.tSinceSettle = 0;
    events.emit('ripple', { x: this.bobber.pos.x, z: this.bobber.pos.z, strength: 0.6 });
  }

  private startFight(): void {
    const info = this.fishInfo!;
    const sp = speciesById(info.species);
    this.fish = new FightFish(sp, info.weightG / 1000, info.lengthCm / 100, this.rng);
    const bx = this.bobber.pos.x;
    const bz = this.bobber.pos.z;
    const wy = this.world.waterY(bx, bz);
    const depth = this.world.depthAt(bx, bz);
    this.fish.pos.set(bx, wy - Math.min(CFG.rig.grunt, Math.max(0.2, depth - 0.1)), bz);
    this.fish.prevPos.copy(this.fish.pos);
    this.fish.heading = Math.atan2(bx - this.player.pos.x, bz - this.player.pos.z);
    this.bobber.mode = 'held';
    this.bobber.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
    this.rod!.straightTip(tmpA);
    const d = tmpA.distanceTo(this.fish.pos);
    this.L = Math.max(this.L, d - 0.05);
    this.tension.dragN = this.dragKgf * KGF;
    this.tension.reset(this.L, d);
    this.rodSide = 0;
    this.rodUp = 0.45;
    this.fatigueBias = this.rng.range(-CFG.fight.fatigueNoise, CFG.fight.fatigueNoise);
    this.fightTime = 0;
    this.canLand = false;
    // model ryby
    if (this.fishObj) this.scene.remove(this.fishObj);
    this.fishObj = this.assets.create('fish', { species: sp.id, lengthM: info.lengthCm / 100 });
    this.scene.add(this.fishObj);
    this.player.moveLocked = true;
    this.hookObj.visible = false;
  }

  private releaseFish(): void {
    // ryba się spina: zestaw wraca na powierzchnię tam, gdzie była ryba
    if (this.fish) {
      this.bobber.pos.set(this.fish.pos.x, this.world.waterY(this.fish.pos.x, this.fish.pos.z) - 0.02, this.fish.pos.z);
      this.bobber.prevPos.copy(this.bobber.pos);
      events.emit('fishSplash', { x: this.fish.pos.x, y: this.fish.pos.y, z: this.fish.pos.z, strength: 0.6 });
    }
    this.bobber.mode = this.world.depthAt(this.bobber.pos.x, this.bobber.pos.z) > 0.02 ? 'water' : 'land';
    this.bobber.vel.set(0, 0, 0);
    this.bobber.shotDepth = 0;
    this.bobber.tilt = 1;
    this.bobber.signal = { pullGf: 0, lateral: 0, liftShot: 0 };
    if (this.gear.baitOn) this.gear.baitOn = this.rng.chance(CFG.bite.escapedKeepBaitChance);
    this.hookObj.visible = true;
    if (this.fishObj) this.fishObj.visible = false;
    this.fish = null;
    this.lastT = 0;
    this.tSinceSettle = 0;
    this.spookCooldown = CFG.bite.spookCooldown;
  }

  /** Po zamknięciu ekranu złowienia. */
  releaseCaught(): void {
    if (this.fishObj) {
      this.scene.remove(this.fishObj);
      this.fishObj = null;
    }
    this.fish = null;
    this.fishInfo = null;
    this.fsm.go('IDLE');
    if (this.gear.hasWorms) this.msg('Nabij nowego robaka [F]', 'info');
  }

  // ------------------------------------------------------------------
  /** Krok fizyki łowienia. */
  update(dt: number, camYaw: number): void {
    if (!this.rod || !this.gear.rodInHand) return;
    this.strikeCooldown = Math.max(0, this.strikeCooldown - dt);
    this.spookCooldown = Math.max(0, this.spookCooldown - dt);
    this.splashCooldown = Math.max(0, this.splashCooldown - dt);
    const st = this.fsm.state;
    const aim = this.input.consumeAim();

    // hamulec kółkiem (zawsze)
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) {
      const R = CFG.reel;
      this.dragKgf = clamp(this.dragKgf - wheel * R.dragStepKgf, R.dragMinKgf, R.dragMaxKgf);
      this.tension.dragN = this.dragKgf * KGF;
    }

    this.updateCastZone(camYaw);
    const lmbPressed = this.input.consumeMousePress(0);
    const lmbHeld = this.input.mouseHeld(0);
    const lmbReleased = this.input.consumeMouseRelease(0);

    // ------- orientacja wędki (kierunek) -------
    const R = CFG.rod;
    let yaw = this.player.yaw;
    let pitch = R.idlePitchDeg * DEG;
    this.rod.extraBend = 0;
    this.rod.turnRate = 12;

    switch (st) {
      case 'IDLE':
        this.player.faceYaw = null;
        if (this.gear.baitOn && this.canCastHere) this.fsm.go('AIMING');
        else if (lmbPressed) {
          if (!this.gear.baitOn) this.msg(this.gear.hasWorms ? 'Najpierw nabij przynętę [F]' : 'Najpierw nabij przynętę – brak robaków', 'warn');
          else this.msg(this.castBlockReason || 'Nie można tu zarzucić', 'warn');
        }
        break;
      case 'AIMING':
        this.player.faceYaw = camYaw;
        yaw = camYaw;
        pitch = R.aimPitchDeg * DEG;
        this.estRange = simulateRange(1, 3, CFG.cast).range;
        if (!this.gear.baitOn || !this.canCastHere) this.fsm.go('IDLE');
        else if (lmbPressed) this.fsm.go('CHARGING');
        break;
      case 'CHARGING': {
        this.player.faceYaw = camYaw;
        yaw = camYaw;
        this.power = triangle(this.fsm.time, CFG.cast.chargeTime);
        const back = lerp(R.aimPitchDeg, R.chargeBackPitchDeg, smoothstep(0, 0.35, this.fsm.time) * (0.35 + 0.65 * this.power));
        pitch = back * DEG;
        this.rod.turnRate = 10;
        this.rod.extraBend = -0.1 * this.power;
        this.player.anim.charge = smoothstep(0, 0.3, this.fsm.time) * (0.4 + 0.6 * this.power);
        this.estRange = simulateRange(this.power, 3, CFG.cast).range;
        if (lmbReleased || !lmbHeld) {
          this.swingDir = camYaw;
          if (this.power > CFG.cast.spreadAbove) this.swingDir += this.rng.range(-1, 1) * CFG.cast.spreadDeg * DEG;
          this.fsm.go('CASTING');
        }
        break;
      }
      case 'CASTING': {
        yaw = this.swingDir;
        this.player.faceYaw = this.swingDir;
        this.rod.turnRate = 30;
        if (!this.launched) {
          pitch = R.waitPitchDeg * DEG + 0.25;
          this.rod.extraBend = 0.25;
          if (this.fsm.time >= CFG.cast.swingTime) {
            this.rod.tipWorld(tmpA);
            const v = launchVelocity(this.power, this.swingDir, CFG.cast);
            this.bobber.launch(tmpA, v);
            this.L = CFG.cast.hangLength;
            this.launched = true;
            this.onCast();
          }
        } else {
          pitch = R.waitPitchDeg * DEG;
          this.L = CFG.cast.hangLength + this.bobber.flightPath;
          if (this.bobber.mode === 'water') {
            this.hasCastOnce = true;
            this.fsm.go('SETTLING');
          } else if (this.bobber.mode === 'land') {
            this.msg('Zestaw wylądował na brzegu – zwiń [LPM]', 'warn');
            this.fsm.go('WAITING');
          }
        }
        break;
      }
      case 'SETTLING':
      case 'WAITING':
      case 'NIBBLE':
      case 'BITE':
      case 'MISSED_EARLY':
      case 'BAIT_STOLEN':
      case 'FISH_ESCAPED': {
        const dx = this.bobber.pos.x - this.player.pos.x;
        const dz = this.bobber.pos.z - this.player.pos.z;
        yaw = Math.atan2(dx, dz);
        this.player.faceYaw = yaw;
        pitch = R.waitPitchDeg * DEG;
        this.player.moveLocked = true;
        this.updateRigInWater(dt, lmbHeld);
        break;
      }
      case 'FIGHT': {
        this.rodSide = clamp(this.rodSide + aim.dx * R.aimSensitivity, -1, 1);
        this.rodUp = clamp(this.rodUp - aim.dy * R.aimSensitivity, 0, 1);
        const fish = this.fish!;
        const toFishYaw = Math.atan2(fish.pos.x - this.player.pos.x, fish.pos.z - this.player.pos.z);
        this.player.faceYaw = toFishYaw;
        // + = w prawo (z perspektywy gracza) → yaw maleje
        yaw = toFishYaw - this.rodSide * R.fightSideMaxDeg * DEG;
        pitch = lerp(R.fightPitchMinDeg, R.fightPitchMaxDeg, this.rodUp) * DEG;
        this.rod.turnRate = 8;
        this.updateFight(dt, lmbHeld);
        break;
      }
      case 'LANDING': {
        pitch = 70 * DEG;
        yaw = this.player.yaw;
        break;
      }
      case 'CAUGHT':
      case 'LINE_SNAPPED':
        pitch = R.idlePitchDeg * DEG;
        break;
    }

    // zacięcie
    if (this.fsm.is('WAITING', 'NIBBLE', 'BITE') && this.bobber.mode === 'water' && this.strikeRequested()) this.doStrike();
    else if (!this.fsm.is('NIBBLE', 'BITE', 'WAITING')) this.input.consumeMousePress(2);

    // animacje górnej części ciała
    const anim = this.player.anim;
    switch (this.fsm.state) {
      case 'AIMING':
        anim.setPose('aim');
        break;
      case 'CHARGING':
        anim.setPose('charge', 14);
        break;
      case 'CASTING':
        anim.setPose(this.launched ? 'aim' : 'castFwd', 25);
        break;
      case 'FIGHT':
        anim.fightSide = this.rodSide;
        anim.fightUp = this.rodUp;
        anim.setPose('fight');
        break;
      case 'LANDING':
        anim.setPose('lift');
        break;
      case 'IDLE':
      case 'CAUGHT':
      case 'LINE_SNAPPED':
        if (anim.pose !== 'bait') anim.setPose('holdRod');
        break;
      default:
        anim.setPose('aim');
    }

    // ------- wędka: kierunek, ugięcie, szczytówka -------
    this.rod.setDirection(yaw, pitch);
    const stiff = this.stiffMul();
    this.rod.update(dt, this.lastT, CFG.rod.kRod * stiff);
    this.player.applySim();
    // ugięcie w stronę żyłki
    const target = this.fish ? this.fish.pos : this.bobber.pos;
    this.rod.bendToward.copy(target).sub(this.lastTip).normalize();
    if (!this.rigOut) this.rod.bendToward.set(0, -1, 0);
    this.rod.pose();
    this.rod.tipWorld(this.lastTip);
    if (this.reeling) this.rod.spinReel(dt * 14);

    // ------- zestaw w ręce / lot -------
    if (this.bobber.mode === 'hand' || this.bobber.mode === 'flight' || this.bobber.mode === 'land') {
      this.bobber.update(dt, this.bobberEnv, this.lastTip);
      if (this.bobber.mode === 'hand') this.L = CFG.cast.hangLength;
    }

    // ------- żyłka wizualna -------
    const end = tmpB.copy(this.bobber.pos);
    this.line.update(dt, this.lastTip, end, Math.max(this.L, 0.3), { waterY: this.bobberEnv.waterY, terrainY: this.bobberEnv.terrainY });

    // czas w stanie + timeouty
    this.fsm.update(dt);
  }

  /** mnożnik sztywności wędki (w górze = sztywniej) */
  stiffMul(): number {
    const R = CFG.rod;
    return this.fsm.is('FIGHT') ? lerp(R.upStiffnessMin, R.upStiffnessMax, this.rodUp) : 1;
  }

  /** Zestaw w wodzie: fizyka spławika, brania, zwijanie. */
  private updateRigInWater(dt: number, lmbHeld: boolean): void {
    const st = this.fsm.state;
    const b = this.bobber;
    this.reeling = lmbHeld;

    // --- branie: sygnał od ryby ---
    if (st === 'NIBBLE' && this.pattern) b.signal = this.pattern.nibble(this.fsm.time);
    else if (st === 'BITE' && this.pattern) b.signal = this.pattern.bite(this.fsm.time);
    else b.signal = { pullGf: 0, lateral: 0, liftShot: 0 };

    b.dragged = false;
    if (!lmbHeld) this.reelHeld = 0;
    if (lmbHeld) {
      if (st === 'NIBBLE' || st === 'BITE') {
        this.msg('Ruch zestawu spłoszył rybę', 'warn');
        this.fsm.go('WAITING');
      }
      this.reelHeld += dt;
      // bez ryby zwija się szybciej (pełne obroty korbką), z krótkim rozpędem
      const sp = CFG.reel.retrieveSpeed * Math.min(1, 0.25 + this.reelHeld / CFG.reel.retrieveRamp);
      // luz żyłki wybierany od razu
      const direct = Math.hypot(b.pos.x - this.lastTip.x, b.pos.y - this.lastTip.y, b.pos.z - this.lastTip.z);
      if (this.L > direct + 0.3) this.L = Math.max(direct + 0.3, this.L - sp * 4 * dt);
      else this.L = Math.max(0.5, this.L - sp * dt);
      this.tSinceSettle = 0;
      this.reelRippleT -= dt;
      if (this.reelRippleT <= 0 && b.mode === 'water') {
        this.reelRippleT = 0.35;
        events.emit('ripple', { x: b.pos.x, z: b.pos.z, strength: 0.12 });
      }
    }
    if (b.mode === 'water') b.update(dt, this.bobberEnv, this.lastTip);

    // więz żyłki (nierozciągliwa gdy luz wybrany): spławik w promieniu L od szczytówki
    const dy = this.lastTip.y - b.pos.y;
    const allowedH = Math.sqrt(Math.max(0, this.L * this.L - dy * dy));
    tmpA.set(b.pos.x - this.lastTip.x, 0, b.pos.z - this.lastTip.z);
    const h = tmpA.length();
    if (h > allowedH) {
      if (st === 'BITE' && this.pattern && b.signal.lateral > 0.2) {
        // żyłka ucieka (np. karp) – ryba wyciąga luz
        this.L = Math.sqrt(h * h + dy * dy);
      } else {
        const k = allowedH / Math.max(h, 1e-6);
        b.pos.x = this.lastTip.x + tmpA.x * k;
        b.pos.z = this.lastTip.z + tmpA.z * k;
        if (lmbHeld) b.dragged = true;
      }
    }
    // zestaw pod szczytówką → do ręki
    if (lmbHeld && (allowedH < CFG.reel.retrieveDistance || h < CFG.reel.retrieveDistance)) {
      b.toHand(this.lastTip);
      this.L = CFG.cast.hangLength;
      this.reeling = false;
      this.hookObj.visible = true;
      if (!this.gear.baitOn) this.msg(this.gear.hasWorms ? 'Zestaw w ręce – nabij robaka [F]' : 'Zestaw w ręce', 'info');
      else this.msg('Zestaw w ręce – możesz zarzucić ponownie', 'info');
      this.fsm.go('IDLE');
      return;
    }

    // --- proces Poissona ---
    if (st === 'SETTLING' && b.settled) this.fsm.go('WAITING');
    if (this.fsm.is('WAITING', 'SETTLING') && b.mode === 'water' && !b.dragged) this.tSinceSettle += dt;
    if (this.fsm.is('WAITING') && b.mode === 'water' && !b.dragged && this.gear.baitOn && this.spookCooldown <= 0 && b.settled) {
      const env = this.spotEnv(b.pos.x, b.pos.z);
      this.attraction = spotAttraction(env);
      const factor = (b.lying ? CFG.bite.lyingFloatFactor : 1) * (CFG.bite.fastMode ? CFG.bite.fastMultiplier : 1);
      const rate = biteRate(this.tSinceSettle, this.attraction, CFG.bite, factor);
      if (poissonFires(this.rng, rate, dt)) this.startNibble();
    }
  }

  /** Hol: skalarny model napięcia + ryba. */
  private updateFight(dt: number, lmbHeld: boolean): void {
    const fish = this.fish!;
    const F = CFG.fight;
    this.fightTime += dt;
    this.reeling = lmbHeld;
    const n = F.substeps;
    const h = dt / n;
    const stiff = this.stiffMul();
    const pressure = lerp(CFG.rod.upPressureMin, CFG.rod.upPressureMax, this.rodUp);
    this.rod!.straightTip(tmpA);
    // minimalna długość żyłki: od szczytówki do wody
    this.tension.p.minLine = Math.max(0.5, tmpA.y - CFG.water.level + CFG.reel.minLineAboveWater);
    let surge = false;
    let payout = 0;
    for (let i = 0; i < n; i++) {
      const d = tmpA.distanceTo(fish.pos);
      const r = this.tension.step(d, h, lmbHeld, stiff);
      payout += r.payout / n;
      const toTip = tmpB.copy(tmpA).sub(fish.pos).normalize();
      if (fish.step(h, { T: r.T, toTip, playerPos: this.player.pos, rodSide: this.rodSide, pressureMul: pressure }, this.fishEnv)) surge = true;
      if (r.snapped) break;
    }
    this.L = this.tension.L;
    this.lastT = this.tension.T;
    this.dragPayout = payout;
    if (surge) {
      this.onSurge();
      const wy = this.world.waterY(fish.pos.x, fish.pos.z);
      if (wy - fish.pos.y < 0.6) events.emit('fishSplash', { x: fish.pos.x, y: wy, z: fish.pos.z, strength: 0.8 });
    }
    // chlapanie zmęczonej / płytko pływającej ryby
    const wy = this.world.waterY(fish.pos.x, fish.pos.z);
    if (this.splashCooldown <= 0 && wy - fish.pos.y < 0.15 && this.rng.chance(F.splashChancePerSec * dt)) {
      this.splashCooldown = 0.8;
      events.emit('fishSplash', { x: fish.pos.x, y: wy, z: fish.pos.z, strength: 0.35 + 0.4 * (fish.weightKg > 1 ? 1 : fish.weightKg) });
    }

    // spławik jedzie po żyłce nad rybą
    const b = this.bobber;
    b.prevPos.copy(b.pos);
    b.pos.set(fish.pos.x, Math.min(wy - 0.01, fish.pos.y + CFG.rig.grunt), fish.pos.z);
    b.tilt = damp(b.tilt, 0.8, 3, dt);
    b.prevTilt = b.tilt;
    b.lastSurfaceY = wy;

    // porażki
    if (this.tension.snapped) {
      this.msg(`Żyłka pękła! (${Math.round(this.tension.p.strengthN)} N przekroczone)`, 'bad', 3);
      this.fsm.go('LINE_SNAPPED');
      return;
    }
    if (this.L > CFG.line.spoolCapacity) {
      this.msg('Cała żyłka zeszła ze szpuli – pękła!', 'bad', 3);
      this.fsm.go('LINE_SNAPPED');
      return;
    }
    if (this.rng.next() < slackEscapeProbability(this.tension.slackTime, F.slackTime, F.slackEscapePerSec, dt)) {
      this.msg('Luźna żyłka – ryba się spięła!', 'bad', 3);
      this.fsm.go('FISH_ESCAPED');
      return;
    }

    // wskaźnik zmęczenia (niedokładny ±15%)
    this.fatigueBias += this.rng.range(-0.02, 0.02);
    this.fatigueBias = clamp(this.fatigueBias, -F.fatigueNoise, F.fatigueNoise);
    this.fatigueShown = damp(this.fatigueShown, clamp01(fish.stamina + this.fatigueBias * (0.3 + fish.stamina)), 3, dt);

    // wyciągnięcie
    tmpB.set(fish.pos.x - tmpA.x, 0, fish.pos.z - tmpA.z);
    this.canLand = tmpB.length() < CFG.landing.maxDistance && fish.stamina < CFG.landing.maxStamina;
    if (this.canLand && this.input.consumePress('KeyE')) this.fsm.go('LANDING');
  }

  // ------------------------------------------------------------------
  /** Wizualizacja (interpolowana). */
  render(alpha: number, time: number): void {
    if (!this.rod) return;
    const b = this.bobber;
    if (this.floatObj.visible) b.applyVisual(this.floatObj, alpha);
    // haczyk z robakiem pod spławikiem
    if (this.hookObj.visible) {
      tmpA.lerpVectors(b.prevPos, b.pos, alpha);
      if (b.mode === 'water') {
        const depth = Math.min(b.shotDepth, CFG.rig.grunt);
        this.hookObj.position.set(tmpA.x, tmpA.y - depth, tmpA.z);
      } else if (b.mode === 'hand') {
        this.hookObj.position.set(tmpA.x, tmpA.y - 0.18, tmpA.z);
      } else {
        this.hookObj.position.set(tmpA.x, tmpA.y - 0.05, tmpA.z);
      }
      this.hookObj.rotation.y = time * 0.5;
      if (this.wormOnHook) this.wormOnHook.visible = this.gear.baitOn;
      this.dropperRenderer.setSegment(tmpA, this.hookObj.position);
    }
    this.lineRenderer.set(this.line.pos);

    // ryba
    if (this.fishObj && this.fish && this.fsm.is('FIGHT', 'LANDING')) {
      const f = this.fish;
      const pos = tmpA.lerpVectors(f.prevPos, f.pos, alpha);
      const len = f.lengthM;
      const o = this.fishObj;
      o.visible = true;
      if (this.fsm.is('LANDING')) {
        const t = smoothstep(0, 1, this.fsm.time / CFG.landing.liftTime);
        const hand = pivot(this.player.root, PIVOTS.handL).getWorldPosition(tmpB);
        o.position.lerpVectors(this.landingFrom, hand, t);
        o.position.y += Math.sin(t * Math.PI) * 0.8 - len * 0.5 * t;
        o.rotation.set(-Math.PI / 2 * t, this.player.yaw, 0);
      } else {
        o.rotation.set(0, f.heading, f.roll);
        o.position.set(pos.x - Math.sin(f.heading) * len * 0.5, pos.y, pos.z - Math.cos(f.heading) * len * 0.5);
      }
      const mat = (o.getObjectByName('fish_body') as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
      const u = mat?.userData.uniforms as Record<string, { value: unknown }> | undefined;
      if (u) {
        u.uTime.value = time;
        u.uSwim.value = this.fsm.is('LANDING') ? 1.6 : f.swim;
        u.uSwimFreq.value = f.surging ? 16 : 9;
      }
    }
  }

  /** Tekst do HUD: odległość rzutu (szacunek). */
  get castInfo(): string {
    return `~${fmt(this.estRange, 0)} m`;
  }

  get fishSpecies(): SpeciesConfig | null {
    return this.fishInfo ? speciesById(this.fishInfo.species) : null;
  }
}
