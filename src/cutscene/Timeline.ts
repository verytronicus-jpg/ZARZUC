/**
 * Timeline oparty na danych: lista ujęć (czas, ścieżka kamery CatmullRomCurve3, punkt patrzenia,
 * przejścia fade, napisy) + lista akcji (jednorazowych i ciągłych) wykonywanych przez "aktorów".
 */
import * as THREE from 'three';
import { clamp01, smoothstep } from '../core/math';

export type V3 = [number, number, number];

export interface Shot {
  start: number;
  duration: number;
  /** punkty ścieżki kamery (CatmullRom) */
  cam: V3[];
  /** punkt(y) patrzenia – ścieżka lub nazwa celu dynamicznego (np. 'car', 'actor') */
  look: V3[] | string;
  /** przestrzeń punktów kamery: świat lub lokalna przestrzeń celu (np. auto) */
  space?: 'world' | string;
  lookOffset?: V3;
  fadeIn?: number;
  fadeOut?: number;
  fov?: number;
  ease?: 'linear' | 'smooth';
}

export interface TimelineEvent {
  /** czas startu */
  t: number;
  /** czas końca (akcje ciągłe) */
  t1?: number;
  type: string;
  [key: string]: unknown;
}

export interface Caption {
  t: number;
  t1: number;
  text: string;
  sub?: string;
}

export interface TimelineData {
  duration: number;
  shots: Shot[];
  events: TimelineEvent[];
  captions: Caption[];
}

export interface TimelineHost {
  /** jednorazowa akcja (start) */
  fire(e: TimelineEvent): void;
  /** akcja ciągła: postęp 0..1 */
  track(e: TimelineEvent, progress: number, dt: number): void;
  /** obiekt dynamiczny dla ujęć (look/space) */
  target(name: string): THREE.Object3D | null;
  setFade(alpha: number): void;
  setCaption(c: Caption | null, alpha: number): void;
}

export class Timeline {
  time = 0;
  private fired = new Set<TimelineEvent>();
  private finished = new Set<TimelineEvent>();
  private curves = new Map<Shot, { cam: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3 | null }>();
  done = false;

  constructor(
    readonly data: TimelineData,
    private host: TimelineHost,
    private camera: THREE.PerspectiveCamera,
  ) {
    for (const s of data.shots) {
      const cam = new THREE.CatmullRomCurve3(s.cam.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
      const look = Array.isArray(s.look) ? new THREE.CatmullRomCurve3(s.look.map((p) => new THREE.Vector3(...p)), false, 'centripetal') : null;
      this.curves.set(s, { cam, look });
    }
  }

  get activeShot(): Shot | null {
    let cur: Shot | null = null;
    for (const s of this.data.shots) if (this.time >= s.start) cur = s;
    return cur;
  }

  update(dt: number): void {
    if (this.done) return;
    this.time += dt;
    const t = this.time;
    for (const e of this.data.events) {
      if (t >= e.t && !this.fired.has(e)) {
        this.fired.add(e);
        this.host.fire(e);
      }
      if (e.t1 !== undefined && t >= e.t && !this.finished.has(e)) {
        const p = clamp01((t - e.t) / (e.t1 - e.t));
        this.host.track(e, p, dt);
        if (p >= 1) this.finished.add(e);
      }
    }
    this.applyCamera();
    // napisy
    let cap: Caption | null = null;
    let ca = 0;
    for (const c of this.data.captions) {
      if (t >= c.t && t <= c.t1) {
        cap = c;
        ca = Math.min(smoothstep(c.t, c.t + 0.6, t), 1 - smoothstep(c.t1 - 0.6, c.t1, t));
      }
    }
    this.host.setCaption(cap, ca);
    if (t >= this.data.duration) this.done = true;
  }

  /** Przewinięcie do końca: odpala wszystkie zaległe akcje (w kolejności). */
  skipToEnd(): void {
    const evs = [...this.data.events].sort((a, b) => a.t - b.t);
    for (const e of evs) {
      if (!this.fired.has(e)) {
        this.fired.add(e);
        this.host.fire(e);
      }
      if (e.t1 !== undefined && !this.finished.has(e)) {
        this.finished.add(e);
        this.host.track(e, 1, 0);
      }
    }
    this.time = this.data.duration;
    this.host.setCaption(null, 0);
    this.done = true;
  }

  private applyCamera(): void {
    const s = this.activeShot;
    if (!s) return;
    const c = this.curves.get(s)!;
    const local = clamp01((this.time - s.start) / s.duration);
    const u = s.ease === 'linear' ? local : smoothstep(0, 1, local);
    const pos = c.cam.getPoint(u);
    const space = s.space && s.space !== 'world' ? this.host.target(s.space) : null;
    if (space) pos.applyMatrix4(space.matrixWorld);
    let look: THREE.Vector3;
    if (c.look) look = c.look.getPoint(u);
    else {
      const o = this.host.target(s.look as string);
      look = o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    }
    if (s.lookOffset) look.add(new THREE.Vector3(...s.lookOffset));
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (s.fov && this.camera.fov !== s.fov) {
      this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    // fade
    let fade = 0;
    if (s.fadeIn) fade = Math.max(fade, 1 - smoothstep(s.start, s.start + s.fadeIn, this.time));
    if (s.fadeOut) fade = Math.max(fade, smoothstep(s.start + s.duration - s.fadeOut, s.start + s.duration, this.time));
    this.host.setFade(fade);
  }
}
