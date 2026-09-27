/**
 * Wędka: orientacja blanku (yaw/pitch w świecie), ugięcie szczytówki (sprężyna z tłumieniem,
 * funkcja napięcia) rozłożone na łańcuch 6 segmentów. Pozycja szczytówki napędza linę.
 */
import * as THREE from 'three';
import { CFG } from '../config';
import { PIVOTS, pivot } from '../assets/AssetRegistry';
import { dampAngle, damp } from '../core/math';

const WEIGHTS = [0.06, 0.1, 0.15, 0.19, 0.23, 0.27];
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

export class RodController {
  readonly rod: THREE.Object3D;
  readonly segments: THREE.Object3D[] = [];
  readonly tip: THREE.Object3D;
  readonly reelHandle: THREE.Object3D | null;
  /** kierunek docelowy blanku */
  yaw = 0;
  pitch = 0.6;
  private curYaw = 0;
  private curPitch = 0.6;
  bend = 0;
  private bendVel = 0;
  /** dodatkowe ugięcie (np. ładowanie przy zamachu, ujemne = do tyłu) */
  extraBend = 0;
  readonly bendToward = new THREE.Vector3(0, -1, 0);
  /** gdy true, wędkę kontroluje FishingController (kierunek w świecie) */
  controlled = true;
  turnRate = 14;

  constructor(rod: THREE.Object3D) {
    this.rod = rod;
    for (let i = 0; i < CFG.rod.tipSegments; i++) this.segments.push(pivot(rod, PIVOTS.rodSegment(i)));
    this.tip = pivot(rod, PIVOTS.rodTip);
    this.reelHandle = rod.getObjectByName(PIVOTS.reelHandle) ?? null;
  }

  setDirection(yaw: number, pitch: number, instant = false): void {
    this.yaw = yaw;
    this.pitch = pitch;
    if (instant) {
      this.curYaw = yaw;
      this.curPitch = pitch;
    }
  }

  get dir(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.curYaw) * Math.cos(this.curPitch), Math.sin(this.curPitch), Math.cos(this.curYaw) * Math.cos(this.curPitch));
  }

  /**
   * Krok: orientacja + sprężyna ugięcia. `tension` [N], `kRod` efektywna sztywność wędki.
   * Wymaga aktualnych macierzy rodzica (dłoni).
   */
  update(dt: number, tension: number, kRod: number): void {
    this.curYaw = dampAngle(this.curYaw, this.yaw, this.turnRate, dt);
    this.curPitch = damp(this.curPitch, this.pitch, this.turnRate, dt);

    // ugięcie: δ = T / k_rod → kąt
    const R = CFG.rod;
    const deflection = tension / Math.max(1, kRod);
    const target = Math.min(R.maxBendRad, Math.atan2(deflection, R.length * 0.45) * 1.7) + 0.035 + this.extraBend;
    const acc = R.bendSpring * (target - this.bend) - R.bendDamping * this.bendVel;
    this.bendVel += acc * dt;
    this.bend += this.bendVel * dt;
  }

  /** Ustawia macierze wędki (orientacja + ugięcie) – wywoływać po aktualizacji rodzica. */
  pose(): void {
    const parent = this.rod.parent;
    if (!parent) return;
    if (this.controlled) {
      const d = this.dir;
      tmpM.lookAt(d, new THREE.Vector3(0, 0, 0), UP);
      tmpQ.setFromRotationMatrix(tmpM);
      parent.getWorldQuaternion(tmpQ2);
      this.rod.quaternion.copy(tmpQ2.invert().multiply(tmpQ));
    }
    this.rod.updateMatrixWorld(true);
    // oś ugięcia: prostopadła do blanku i kierunku żyłki
    const rodDir = Z.clone().applyQuaternion(this.rod.getWorldQuaternion(tmpQ));
    const axisW = tmpV.crossVectors(rodDir, this.bendToward);
    if (axisW.lengthSq() < 1e-6) axisW.crossVectors(rodDir, UP);
    if (axisW.lengthSq() < 1e-6) axisW.set(1, 0, 0);
    axisW.normalize();
    const axisL = axisW.applyQuaternion(tmpQ.invert());
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].quaternion.setFromAxisAngle(axisL, this.bend * (WEIGHTS[i] ?? 1 / 6));
    }
    this.rod.updateMatrixWorld(true);
  }

  /** Pozycja szczytówki wg wizualnego (ugiętego) blanku. */
  tipWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.tip.getWorldPosition(out);
  }

  /** Szczytówka nieugiętej wędki (do modelu napięcia – ugięcie jest w k_eff). */
  straightTip(out: THREE.Vector3): THREE.Vector3 {
    this.rod.getWorldPosition(out);
    return out.addScaledVector(this.dir, CFG.rod.length - CFG.rod.buttOffset);
  }

  spinReel(amount: number): void {
    if (this.reelHandle) this.reelHandle.rotation.x += amount;
  }
}
