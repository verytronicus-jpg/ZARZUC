import * as THREE from 'three';
import { CFG, KGF } from '../config';
import { Loop } from './Loop';
import { Input } from './Input';
import { Rng } from './Rng';
import { StateMachine } from './StateMachine';
import { events } from './Events';
import { fmt } from './math';
import { RenderContext } from '../render/RenderContext';
import { CameraRig } from '../render/CameraRig';
import { WaterEffects } from '../render/WaterEffects';
import { createDefaultRegistry } from '../assets';
import type { AssetRegistry } from '../assets/AssetRegistry';
import { World } from '../world/World';
import { resetWorldCaches } from '../world/terrainMath';
import { Player } from '../player/Player';
import { Preparation } from '../player/Preparation';
import { FishingController, type CaughtFish } from '../fishing/FishingController';
import { CatchLog } from '../fishing/CatchLog';
import { UI } from '../ui/UI';
import { CatchPreview } from '../ui/CatchPreview';
import { GameAudio } from '../audio/GameAudio';
import { DebugPanel } from '../debug/DebugPanel';
import { mountStartScreen, type StartScreenHandle, type StartScreenFish } from '../ui/startscreen/startscreen.js';
import '../ui/startscreen/startscreen.css';
import { fmtWeight } from './math';

export type GState = 'BOOT' | 'START_SCREEN' | 'INTRO' | 'GAMEPLAY' | 'PAUSE';

/** Globalna maszyna stanów gry i spinanie systemów. */
export class Game {
  readonly fsm = new StateMachine<GState>('BOOT');
  readonly rng: Rng;
  readonly loop: Loop;
  readonly input: Input;
  readonly ctx: RenderContext;
  readonly assets: AssetRegistry;
  readonly world: World;
  readonly player: Player;
  readonly camRig: CameraRig;
  readonly fishing: FishingController;
  readonly prep: Preparation;
  readonly effects: WaterEffects;
  readonly ui: UI;
  readonly audio = new GameAudio();
  readonly log = new CatchLog();
  readonly preview: CatchPreview;
  readonly debug: DebugPanel;
  private startScreen: StartScreenHandle | null = null;
  private rodObj: THREE.Object3D;
  private boxObj: THREE.Object3D;
  private stepsThisFrame = 0;
  private escHold = 0;
  private startOrbit = 0;
  private debugOverlay = false;
  private catchOpen = false;
  private hudOn = false;
  private lastCatchRecord = false;
  private tmp = new THREE.Vector3();
  /** kamera podglądu spławika (obraz w obrazie) */
  private floatCam = new THREE.PerspectiveCamera(32, 16 / 10, 0.05, 400);
  private floatCamPos = new THREE.Vector3();
  private floatCamInit = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.rng = new Rng(CFG.seed);
    this.ui = new UI(uiRoot);
    this.input = new Input(canvas);
    this.ctx = new RenderContext(canvas);
    this.assets = createDefaultRegistry();
    this.world = new World(this.ctx, this.assets, this.rng.fork());
    const character = this.assets.create('character');
    this.ctx.scene.add(character);
    this.player = new Player(character, this.world);
    this.camRig = new CameraRig(this.ctx.camera, this.world);
    this.fishing = new FishingController(this.world, this.player, this.input, this.rng.fork(), this.assets, this.ctx.scene);
    this.rodObj = this.assets.create('rod');
    this.boxObj = this.assets.create('wormBox');
    for (const o of [this.rodObj, this.boxObj])
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) m.castShadow = true;
      });
    this.prep = new Preparation(this.player, this.fishing, this.camRig, this.rodObj, this.boxObj);
    this.effects = new WaterEffects(this.ctx.scene, this.world);
    this.preview = new CatchPreview(this.ui.catchCanvas, this.assets);
    this.debug = new DebugPanel((path) => this.onConfigChange(path));

    this.fishing.onMessage = (t, k, time) => this.ui.message(t, k, time);
    this.prep.onMessage = (t, k) => this.ui.message(t, k);
    this.fishing.onCatch = (f) => this.onCatch(f);
    this.fishing.onSurge = () => (this.camRig.shake = 1);

    this.loop = new Loop(
      (dt) => this.fixedUpdate(dt),
      (a, fdt) => this.render(a, fdt),
    );
    this.setupStates();
    this.setupUIEvents();
    (window as unknown as { __game: Game }).__game = this;
    document.title = CFG.game.title;
  }

  start(): void {
    this.fsm.start();
    this.loop.start();
  }

  // ------------------------------------------------------------------
  private setupStates(): void {
    this.fsm.setHandlers({
      BOOT: {
        enter: () => {
          this.player.root.visible = false;
          this.ui.hideLoading();
          queueMicrotask(() => this.fsm.go('START_SCREEN'));
        },
      },
      START_SCREEN: {
        enter: () => {
          this.camRig.mode = 'external';
          this.ui.setFade(1);
          this.startScreen = mountStartScreen({
            title: CFG.game.title,
            tagline: CFG.game.tagline,
            domain: CFG.game.domain,
            species: this.startScreenSpecies(),
            onCastStart: () => {
              // gest użytkownika – odblokuj dźwięk gry, ale wycisz go do intro
              this.audio.unlock();
              this.audio.setMuted(true);
            },
            onStart: () => {
              if (this.fsm.is('START_SCREEN')) this.fsm.go('INTRO');
            },
            onOptions: (o) => {
              if (o.nature !== undefined) CFG.audio.ambient = 0.45 * o.nature;
              if (o.sfx !== undefined) CFG.audio.sfx = o.sfx ? 0.9 : 0;
              if (o.quality) this.ctx.setQuality(o.quality);
              this.audio.applyVolumes();
            },
          });
        },
        exit: () => {
          this.startScreen?.destroy();
          this.startScreen = null;
          this.audio.setMuted(false);
        },
      },
      INTRO: {
        enter: () => {
          this.ui.showHud(false);
          this.player.controlled = false;
          this.escHold = 0;
          // K1: intro natychmiastowe – postać od razu na starcie z wędką i robakami
          const W = CFG.world;
          this.player.teleport(W.startX, W.startZ, W.startYaw);
          this.player.root.visible = true;
          this.prep.equip();
          this.endIntro();
        },
        exit: () => {
          this.ui.setSkip(false, 0);
        },
      },
      GAMEPLAY: {
        enter: (prev) => {
          if (prev === 'PAUSE') this.ui.showPause(false);
        },
      },
      PAUSE: {
        enter: () => {
          this.ui.showPause(true);
          this.audio.setMuted(true);
          this.input.exitLock();
        },
        exit: () => {
          this.ui.showPause(false);
          this.audio.setMuted(false);
        },
      },
    });
  }

  private setupUIEvents(): void {
    this.ui.resumeBtn.addEventListener('click', () => {
      events.emit('uiClick', {});
      this.fsm.go('GAMEPLAY');
      this.input.requestLock();
    });
    this.ui.releaseBtn.addEventListener('click', () => {
      events.emit('uiClick', {});
      this.closeCatch();
      this.input.requestLock();
    });
    const canvas = this.ctx.renderer.domElement;
    canvas.addEventListener('click', () => {
      if (this.fsm.is('GAMEPLAY') && !this.input.locked && !this.catchOpen && !this.ui.logVisible) this.input.requestLock();
    });
    this.input.onLockChange = (locked) => {
      // ESC zwalnia kursor → pauza
      if (!locked && this.fsm.is('GAMEPLAY') && !this.catchOpen && !this.debug.visible) this.fsm.go('PAUSE');
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.fsm.is('PAUSE') && !e.repeat) {
        // ponowny ESC w pauzie – wznowienie (kursor przechwycony po kliknięciu)
        this.fsm.go('GAMEPLAY');
      } else if (e.code === 'Escape' && this.fsm.is('GAMEPLAY') && !this.input.locked && !this.catchOpen && !e.repeat) {
        this.fsm.go('PAUSE');
      }
    });
  }

  /** Gatunki do „Kolekcji ryb” na ekranie startowym (odkryte wg dziennika). */
  private startScreenSpecies(): StartScreenFish[] {
    const look: Record<string, Omit<StartScreenFish, 'name' | 'caught' | 'record'>> = {
      ploc: { lat: 'Rutilus rutilus', rar: 'Pospolita', rc: '#9be3a4', sx: 1, sy: 0.9 },
      okon: { lat: 'Perca fluviatilis', rar: 'Pospolita', rc: '#9be3a4', sx: 1, sy: 1.05, spiky: true },
      karas: { lat: 'Carassius carassius', rar: 'Pospolita', rc: '#9be3a4', sx: 0.9, sy: 1.3 },
      leszcz: { lat: 'Abramis brama', rar: 'Rzadka', rc: '#7cc4ff', sx: 0.95, sy: 1.35 },
      karp: { lat: 'Cyprinus carpio', rar: 'Epicka', rc: '#d59bff', sx: 1.05, sy: 1.2, whisk: true },
    };
    return CFG.species.map((sp) => {
      const rec = this.log.records[sp.id];
      return { name: sp.name, ...look[sp.id], caught: !!rec, record: rec ? `Rekord ${fmtWeight(rec.weightG)}` : undefined };
    });
  }

  /** Koniec intro: sterowanie dla gracza, kamera 3. osoby płynnie (bez cięcia i bez teleportu postaci). */
  private endIntro(): void {
    const p = this.player;
    p.root.visible = true;
    p.controlled = true;
    p.prevPos.copy(p.pos);
    this.ctx.camera.fov = CFG.camera.fov;
    this.ctx.camera.updateProjectionMatrix();
    this.camRig.yaw = p.yaw;
    this.camRig.pitch = CFG.intro.endPitch;
    this.camRig.mode = 'follow';
    this.camRig.startBlend(CFG.intro.blendTime);
    this.hudOn = true;
    this.ui.setFade(0);
    this.ui.showHud(true);
    this.ui.message('Zejdź nad jezioro', 'info', 4);
    this.fsm.go('GAMEPLAY');
  }

  private onCatch(f: CaughtFish): void {
    const sp = this.fishing.fishSpecies!;
    const record = this.log.add({ species: f.species, lengthCm: f.lengthCm, weightG: f.weightG, date: new Date().toISOString(), fightTime: f.fightTime });
    this.lastCatchRecord = record;
    this.catchOpen = true;
    this.input.exitLock();
    this.ui.showCatch({ species: sp.name, lengthCm: f.lengthCm, weightG: f.weightG, record, fightTime: f.fightTime });
    this.preview.show(f.species, f.lengthCm);
  }

  private closeCatch(): void {
    this.catchOpen = false;
    this.ui.showCatch(null);
    this.preview.hide();
    events.emit('fishSplash', { x: this.player.pos.x + Math.sin(this.player.yaw) * 1.5, y: 0, z: this.player.pos.z + Math.cos(this.player.yaw) * 1.5, strength: 0.4 });
    this.fishing.releaseCaught();
  }

  private onConfigChange(path: string): void {
    if (path.startsWith('sun') || path.startsWith('render')) this.ctx.applySun();
    if (path.startsWith('water')) this.world.water.refresh();
    if (path.startsWith('reel.drag')) this.fishing.tension.dragN = this.fishing.dragKgf * KGF;
    if (path.startsWith('line') || path.startsWith('rod') || path.startsWith('reel')) {
      const t = this.fishing.tension.p;
      t.kRod = CFG.rod.kRod;
      t.ea = CFG.line.ea;
      t.damping = CFG.line.damping;
      t.strengthN = CFG.line.strengthKgf * KGF;
      t.snapTime = CFG.line.snapTime;
      t.spoolAccel = CFG.reel.spoolAccel;
      t.spoolMaxSpeed = CFG.reel.spoolMaxSpeed;
      t.spoolFriction = CFG.reel.spoolFriction;
      t.reelSpeed = CFG.reel.speed;
    }
    if (path.startsWith('world')) resetWorldCaches();
    if (path === 'debug.timeScale') this.loop.timeScale = CFG.debug.timeScale;
  }

  // ------------------------------------------------------------------
  private fixedUpdate(dt: number): void {
    this.stepsThisFrame++;
    const st = this.fsm.state;
    if (st === 'PAUSE' || st === 'BOOT') return;
    this.world.update(dt);
    this.fsm.update(dt);
    if (st !== 'GAMEPLAY') return;

    const inp = this.input;
    // debug
    if (inp.consumePress('F1')) this.toggleDebug();
    if (this.debugOverlay) {
      if (inp.consumePress('KeyB')) this.fishing.forceBite();
      if (inp.consumePress('Digit1')) this.setTimeScale(0.25);
      if (inp.consumePress('Digit2')) this.setTimeScale(1);
      if (inp.consumePress('Digit3')) this.setTimeScale(4);
    }
    if (inp.consumePress('Tab') && !this.catchOpen) this.ui.showLog(!this.ui.logVisible, this.log);

    const inputOn = !this.catchOpen;
    inp.enabled = inputOn;
    this.player.update(dt, inp, this.camRig.yaw);
    this.fishing.update(dt, this.camRig.yaw);
    this.prep.update(dt, inp, this.loop.simTime);
    inp.enabled = true;
  }

  private setTimeScale(s: number): void {
    CFG.debug.timeScale = s;
    this.loop.timeScale = s;
    this.ui.message(`Tempo czasu ×${s}`, 'info', 1.2);
  }

  private toggleDebug(): void {
    this.debugOverlay = !this.debugOverlay;
    this.debug.toggle(this.debugOverlay);
    if (!this.debugOverlay) this.ui.setDebug(null);
  }

  private render(alpha: number, frameDt: number): void {
    const st = this.fsm.state;
    this.ctx.renderer.info.reset();
    const scaledDt = frameDt * this.loop.timeScale;
    const rt = this.loop.renderTime(alpha);
    this.world.setRenderTime(rt);
    const cam = this.ctx.camera;

    if (st === 'START_SCREEN' || st === 'BOOT') {
      this.startOrbit += frameDt * 0.035;
      const a = this.startOrbit + 2.2;
      cam.position.set(Math.cos(a) * 62, 11 + Math.sin(this.startOrbit * 0.7) * 2, Math.sin(a) * 50 + 8);
      cam.lookAt(0, 0.5, 5);
    }

    if (st === 'GAMEPLAY' || st === 'PAUSE') {
      this.player.applyVisual(alpha);
      const f = this.fishing;
      if (f.fsm.is('FIGHT', 'LANDING') && f.fish) {
        this.camRig.mode = 'fight';
        this.camRig.fightFocus.lerpVectors(f.fish.prevPos, f.fish.pos, alpha);
      } else if (this.camRig.mode === 'fight') this.camRig.mode = 'follow';
      const look = st === 'GAMEPLAY' && !this.catchOpen ? this.input.consumeLook() : (this.input.consumeLook(), { dx: 0, dy: 0 });
      this.camRig.update(frameDt, look, this.player.root.position);
      f.render(alpha, rt);
      if (st === 'GAMEPLAY') this.updateHud();
    } else if (st === 'INTRO') {
      this.input.consumeLook();
    }

    this.effects.update(scaledDt, rt);
    this.ctx.followShadow(this.shadowTarget());
    if (st !== 'START_SCREEN' && st !== 'BOOT') this.ctx.render();
    this.renderFloatCam(frameDt);
    this.preview.update(frameDt);
    this.audio.update(scaledDt, this.fishing.reeling && this.fishing.rigOut, this.fishing.fsm.is('FIGHT') ? this.fishing.dragPayout : 0);
    if (this.debugOverlay) this.ui.setDebug(this.debugText());

    if (this.stepsThisFrame > 0) {
      this.input.endFrame();
      this.stepsThisFrame = 0;
    }
  }

  /** Podgląd spławika w rogu ekranu – brania są widoczne nawet z 30 m. */
  private renderFloatCam(dt: number): void {
    const f = this.fishing;
    const show =
      this.fsm.is('GAMEPLAY') &&
      !this.catchOpen &&
      f.bobber.mode === 'water' &&
      f.fsm.is('SETTLING', 'WAITING', 'NIBBLE', 'BITE', 'MISSED_EARLY', 'BAIT_STOLEN', 'FISH_ESCAPED');
    this.ui.setFloatCam(show);
    if (!show) {
      this.floatCamInit = false;
      return;
    }
    const r = this.ui.floatCamRect();
    const b = f.floatObj.position;
    const dir = this.tmp.set(b.x - this.player.pos.x, 0, b.z - this.player.pos.z).normalize();
    const want = new THREE.Vector3(b.x - dir.x * 1.15 + dir.z * 0.25, f.bobber.lastSurfaceY + 0.24, b.z - dir.z * 1.15 - dir.x * 0.25);
    if (!this.floatCamInit) {
      this.floatCamPos.copy(want);
      this.floatCamInit = true;
    } else this.floatCamPos.lerp(want, 1 - Math.exp(-4 * dt));
    this.floatCam.position.copy(this.floatCamPos);
    this.floatCam.lookAt(b.x, f.bobber.lastSurfaceY + 0.06, b.z);
    this.floatCam.aspect = r.w / r.h;
    this.floatCam.updateProjectionMatrix();
    const R = this.ctx.renderer;
    const H = R.domElement.clientHeight;
    R.shadowMap.autoUpdate = false;
    R.setScissorTest(true);
    R.setViewport(r.x, H - r.y - r.h, r.w, r.h);
    R.setScissor(r.x, H - r.y - r.h, r.w, r.h);
    R.render(this.ctx.scene, this.floatCam);
    R.setScissorTest(false);
    R.setViewport(0, 0, R.domElement.clientWidth, H);
    R.shadowMap.autoUpdate = true;
  }

  private shadowTarget(): THREE.Vector3 {
    if (this.fsm.is('START_SCREEN', 'BOOT')) return this.tmp.set(0, 0, 20);
    if (this.fsm.is('INTRO')) return this.tmp.copy(this.ctx.camera.position).lerp(this.player.root.position, 0.7);
    return this.tmp.copy(this.player.root.position);
  }

  private updateHud(): void {
    const ui = this.ui;
    const f = this.fishing;
    const prep = this.prep;
    const t = this.loop.simTime;
    ui.setObjectives(prep.objectives, prep.objectivesVisible(t));
    ui.setStatus(f.gear.baitOn, f.dragKgf, f.L, f.gear.rodInHand);
    let hint = '';
    if (prep.baitProgress === null) hint = f.hint;
    ui.setHint(hint.replace(/\[(.+?)\]/g, '<kbd>$1</kbd>'));

    // podpowiedź nad obiektem
    const it = prep.interaction.current;
    if (it && !this.catchOpen) {
      const p = this.tmp.copy(prep.interaction.currentPos).add(new THREE.Vector3(0, 0.3, 0)).project(this.ctx.camera);
      if (p.z < 1) {
        const x = (p.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
        ui.setPrompt(`[E] ${it.label()}`, x, y);
      } else ui.setPrompt(null);
    } else if (f.canLand && f.fsm.is('FIGHT') && f.fish) {
      const p = this.tmp.copy(f.fish.pos).add(new THREE.Vector3(0, 0.5, 0)).project(this.ctx.camera);
      ui.setPrompt('[E] Wyciągnij', (p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
    } else ui.setPrompt(null);

    // sygnalizacja stanu spławika: znacznik w widoku głównym + ramka podglądu
    const rigInWater = f.bobber.mode === 'water' && f.fsm.is('SETTLING', 'WAITING', 'NIBBLE', 'BITE', 'MISSED_EARLY', 'BAIT_STOLEN', 'FISH_ESCAPED');
    const fstate = f.fsm.is('BITE') ? (f.bobber.submerged ? 'under' : 'bite') : f.fsm.is('NIBBLE') ? 'nibble' : 'idle';
    ui.setFloatState(fstate);
    if (rigInWater && !this.catchOpen) {
      const p = this.tmp.copy(f.floatObj.position);
      p.y = Math.max(p.y, f.bobber.lastSurfaceY) + 0.25;
      p.project(this.ctx.camera);
      const onScreen = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      if (onScreen) ui.setFloatMarker((p.x * 0.5 + 0.5) * window.innerWidth, (-p.y * 0.5 + 0.5) * window.innerHeight);
      else ui.setFloatMarker(null);
    } else ui.setFloatMarker(null);
    ui.setCrosshair(f.fsm.is('AIMING', 'CHARGING'));
    ui.setPower(f.fsm.is('CHARGING'), f.power, f.castInfo);
    ui.setHold(prep.baitProgress);
    if (f.fsm.is('FIGHT', 'LANDING') && f.fish) {
      ui.setFight({
        species: f.fishSpecies?.name ?? '?',
        tensionRatio: f.tensionRatio,
        dragRatio: (f.dragKgf * KGF) / f.strengthN,
        dragKgf: f.dragKgf,
        line: f.L,
        fatigue: f.fatigueShown,
        slipping: f.tension.slipping,
        rodSide: f.rodSide,
        rodUp: f.rodUp,
      });
    } else ui.setFight(null);
    ui.setClickToPlay(!this.input.locked && !this.input.lockFailed && !this.catchOpen && !this.debug.visible && this.hudOn && !this.camRig.blending);
  }

  private debugText(): string {
    const f = this.fishing;
    const fish = f.fish;
    const r = this.ctx.renderer.info.render;
    return [
      `FPS          ${this.loop.fps.toFixed(0)}   draw calls ${r.calls}   tris ${r.triangles}`,
      `Gra          ${this.fsm.state}   tempo ×${this.loop.timeScale}   ${CFG.bite.fastMode ? `SZYBKIE BRANIA ×${CFG.bite.fastMultiplier}` : ''}`,
      `Łowienie     ${f.fsm.state}  (${fmt(f.fsm.time, 1)} s)`,
      `T            ${f.lastT.toFixed(1)} N   (${Math.round(f.tensionRatio * 100)} % z ${f.strengthN.toFixed(0)} N)`,
      `hamulec      ${(f.dragKgf * KGF).toFixed(1)} N   poślizg ${f.tension.slipping ? 'TAK' : '-'}  ${f.dragPayout.toFixed(2)} m/s`,
      `L            ${f.L.toFixed(2)} m`,
      `d            ${fish ? f.rod!.straightTip(this.tmp).distanceTo(fish.pos).toFixed(2) : f.rod ? f.rod.straightTip(this.tmp).distanceTo(f.bobber.pos).toFixed(2) : '-'} m`,
      `ryba         ${f.fishSpecies ? `${f.fishSpecies.name} ${fmt(f.fishInfo!.lengthCm, 1)} cm ${Math.round(f.fishInfo!.weightG)} g` : '-'}`,
      `wytrzymałość ${fish ? `${(fish.stamina * 100).toFixed(1)} %  siła ${fish.force.toFixed(1)} N ${fish.surging ? 'ZRYW' : ''} ${fish.tired ? 'ZMĘCZONA' : ''}` : '-'}`,
      `spławik      ${f.bobber.mode}  tilt ${f.bobber.tilt.toFixed(2)}  grunt ${f.bobber.shotDepth.toFixed(2)}  ${f.bobber.lying ? 'LEŻY' : ''}`,
      `gracz        ${this.player.pos.x.toFixed(1)}, ${this.player.pos.y.toFixed(2)}, ${this.player.pos.z.toFixed(1)}   głęb. ${this.world.depthAt(this.player.pos.x, this.player.pos.z).toFixed(2)}`,
      `[B] wymuś branie  [1] ×0,25  [2] ×1  [3] ×4`,
    ].join('\n');
  }
}
