import * as THREE from 'three';
import { CFG } from '../config';
import { clamp01, lerp, smoothstep, DEG } from '../core/math';
import { events } from '../core/Events';
import { PIVOTS, pivot, type AssetRegistry } from '../assets/AssetRegistry';
import { cabinLayout } from '../assets/procedural/cabin';
import type { World } from '../world/World';
import type { Player } from '../player/Player';
import { Timeline, type Caption, type TimelineEvent, type TimelineHost } from './Timeline';
import { buildDoorIntro } from './doorIntroScript';

export interface IntroHost {
  setFade(a: number): void;
  setCaption(c: Caption | null, alpha: number): void;
  /** mnożniki światła otoczenia i ekspozycji (ciemne wnętrze → oślepienie → norma) */
  setLighting(ambient: number, exposure: number): void;
  /** głośność natury (ptaki, woda) 0..1 */
  setAmbience(level: number): void;
  /** przekazanie kamery graczowi (kamera 3. osoby wjeżdża płynnie z bieżącej pozy) */
  handoff(): void;
  end(): void;
}

/**
 * Intro „otwierane drzwi”: ręka na zasuwie, klik, drzwi skrzypią i otwierają się do środka, wlewa się poranne
 * światło (ekspozycja spada z oślepienia do normy), krok przez próg na ganek, kamera odjeżdża za plecy
 * bohatera – bez cięcia i bez teleportu (postać pojawia się tam, gdzie była kamera POV).
 */
export class DoorIntro implements TimelineHost {
  readonly timeline: Timeline;
  private door: THREE.Object3D;
  private hand: THREE.Object3D;
  private gaps: THREE.Mesh;
  private camera: THREE.PerspectiveCamera;
  private handTarget = new THREE.Vector3();
  private handPos = new THREE.Vector3();
  private handRest = new THREE.Vector3();
  private doorAngle = 0;
  private bob = 0;
  private stepsDone = 0;
  ended = false;
  handedOff = false;

  constructor(
    private world: World,
    private player: Player,
    assets: AssetRegistry,
    camera: THREE.PerspectiveCamera,
    private host: IntroHost,
  ) {
    this.camera = camera;
    this.door = pivot(world.cabin, PIVOTS.doorFront);
    this.timeline = new Timeline(buildDoorIntro(), this, camera);
    this.hand = assets.create('povHand');
    this.hand.visible = false;
    world.cabin.add(this.hand);
    // szpary światła wokół zamkniętych drzwi (od środka)
    const L = cabinLayout();
    const gapMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CFG.intro.gapColor).multiplyScalar(CFG.intro.gapIntensity), transparent: true, depthWrite: false, fog: false });
    const parts: THREE.BufferGeometry[] = [];
    const g = CFG.intro.gapWidth;
    const z = L.D / 2 - 0.02;
    const x0 = L.doorX - L.doorW / 2;
    const x1 = L.doorX + L.doorW / 2;
    const add = (w: number, h: number, x: number, y: number) => {
      const p = new THREE.PlaneGeometry(w, h);
      p.rotateY(Math.PI);
      p.translate(x, y, z);
      parts.push(p);
    };
    add(g, L.doorH, x0, L.F + L.doorH / 2);
    add(g, L.doorH, x1, L.F + L.doorH / 2);
    add(L.doorW, g, L.doorX, L.F + L.doorH);
    add(L.doorW, g * 1.5, L.doorX, L.F + 0.01);
    // pionowe szpary między deskami
    for (let i = 1; i < 4; i++) add(g * 0.6, L.doorH * 0.96, x1 - (L.doorW / 4) * i, L.F + L.doorH / 2);
    const merged = mergeFlat(parts);
    this.gaps = new THREE.Mesh(merged, gapMat);
    this.gaps.name = 'door_gaps';
    world.cabin.add(this.gaps);
  }

  update(dt: number): void {
    if (this.ended) return;
    this.timeline.update(dt);
    // głowa lekko się kołysze przy kroku (po ujęciu z Timeline)
    if (this.bob > 0 && !this.handedOff) {
      const b = Math.sin(this.bob * Math.PI * 2) * CFG.intro.headBob;
      this.camera.position.y += Math.abs(b);
      this.camera.rotateZ(b * 0.25);
    }
    this.updateHand();
    if (!this.ended && this.timeline.done) this.finish();
  }

  /** Pominięcie (Esc): od razu stan końcowy. */
  skip(): void {
    // kamera POV na ganku (koniec kroku przez próg) → postać staje tam, gdzie „widz”
    if (!this.handedOff) {
      this.timeline.poseCameraAt(CFG.intro.handoff - 1e-3);
      this.camera.updateMatrixWorld(true);
    }
    this.timeline.skipToEnd();
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.setDoor(1);
    this.hand.visible = false;
    this.gaps.visible = false;
    this.host.setFade(0);
    this.host.setLighting(1, 1);
    this.host.setAmbience(1);
    if (!this.handedOff) this.handoffNow();
    this.host.end();
  }

  dispose(): void {
    this.world.cabin.remove(this.hand);
    this.world.cabin.remove(this.gaps);
  }

  // ---------------------------------------------------------------- aktorzy
  private setDoor(open01: number): void {
    this.doorAngle = open01;
    this.door.rotation.y = -CFG.intro.doorAngleDeg * DEG * open01;
    this.gaps.visible = open01 < 0.02;
  }

  /** Pozycja zasuwy (koniec drzwi po stronie klamki) w świecie. */
  private latchWorld(out: THREE.Vector3): THREE.Vector3 {
    const L = cabinLayout();
    this.door.updateMatrixWorld(true);
    return this.door.localToWorld(out.set(-L.doorW + 0.2, 1.05, -0.09));
  }

  private updateHand(): void {
    if (!this.hand.visible) return;
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    // łokieć poza kadrem: w prawo i w dół od kamery
    const elbow = new THREE.Vector3(0.24, -0.42, -0.2).applyMatrix4(cam.matrixWorld);
    const wrist = this.handPos;
    const parent = this.hand.parent!;
    parent.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const e = elbow.clone().applyMatrix4(inv);
    const w = wrist.clone().applyMatrix4(inv);
    this.hand.position.copy(e);
    const dir = w.clone().sub(e);
    const len = dir.length();
    this.hand.scale.set(1, 1, len / 0.42);
    this.hand.lookAt(parent.localToWorld(w.clone()));
  }

  // ---------------------------------------------------------------- TimelineHost
  target(name: string): THREE.Object3D | null {
    if (name === 'cabin') return this.world.cabin;
    if (name === 'actor') return this.player.root;
    return null;
  }

  setFade(a: number): void {
    this.host.setFade(a);
  }

  setCaption(c: Caption | null, alpha: number): void {
    this.host.setCaption(c, alpha);
  }

  fire(e: TimelineEvent): void {
    switch (e.type) {
      case 'setup': {
        this.world.cabin.updateMatrixWorld(true);
        this.setDoor(0);
        this.player.root.visible = false;
        this.host.setLighting(CFG.intro.ambientInside, CFG.intro.exposureInside);
        this.host.setAmbience(CFG.intro.ambienceInside);
        this.camera.updateMatrixWorld(true);
        this.handRest.set(0.3, -0.5, -0.35).applyMatrix4(this.camera.matrixWorld);
        this.handPos.copy(this.handRest);
        break;
      }
      case 'latch':
        events.emit('doorLatch', {});
        break;
      case 'door':
        events.emit('doorCreak', {});
        break;
      case 'handoff':
        this.handoffNow();
        break;
      case 'end':
        break;
    }
  }

  track(e: TimelineEvent, p: number, dt: number): void {
    const I = CFG.intro;
    switch (e.type) {
      case 'hand': {
        // ręka sięga do zasuwy z dołu po prawej
        this.hand.visible = true;
        this.camera.updateMatrixWorld(true);
        this.handRest.set(0.3, -0.5, -0.35).applyMatrix4(this.camera.matrixWorld);
        this.latchWorld(this.handTarget);
        const t = smoothstep(0, 1, p);
        this.handPos.lerpVectors(this.handRest, this.handTarget, t);
        // drobny łuk
        this.handPos.y += Math.sin(t * Math.PI) * 0.06;
        break;
      }
      case 'handPull': {
        // ręka trzyma drzwi przy otwieraniu, potem puszcza i znika w dół
        this.latchWorld(this.handTarget);
        if (p < 0.55) this.handPos.copy(this.handTarget);
        else {
          this.camera.updateMatrixWorld(true);
          this.handRest.set(0.35, -0.75, -0.3).applyMatrix4(this.camera.matrixWorld);
          this.handPos.lerpVectors(this.handTarget, this.handRest, smoothstep(0.55, 1, p));
        }
        if (p >= 1) this.hand.visible = false;
        break;
      }
      case 'door': {
        // ease-out: szybki start, powolne dojście do ~100°
        this.setDoor(1 - Math.pow(1 - p, 2.6));
        break;
      }
      case 'light': {
        // oko przyzwyczaja się do światła: ekspozycja z oślepienia do normy, otoczenie jaśnieje
        const k = clamp01(p);
        const flash = Math.exp(-4 * k);
        this.host.setLighting(lerp(I.ambientInside, 1, smoothstep(0, 0.6, k)), lerp(1, I.exposureFlash, flash) * lerp(I.exposureInside, 1, smoothstep(0, 0.25, k)));
        this.host.setAmbience(lerp(I.ambienceInside, 1, smoothstep(0, 0.7, k)));
        break;
      }
      case 'step': {
        this.bob = p;
        // dwa kroki po deskach
        const n = Math.floor(p * 2.2);
        if (n > this.stepsDone && this.stepsDone < 2) {
          this.stepsDone = n;
          events.emit('step', { surface: 'wood', run: false });
        }
        if (p >= 1) this.bob = 0;
        break;
      }
    }
    void dt;
  }

  /** Kamera POV → postać w miejscu kamery, kamera 3. osoby wjeżdża płynnie (bez cięcia). */
  private handoffNow(): void {
    if (this.handedOff) return;
    this.handedOff = true;
    this.timeline.cameraEnabled = false;
    this.host.setFade(0);
    this.bob = 0;
    this.hand.visible = false;
    this.host.handoff();
  }
}

function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
