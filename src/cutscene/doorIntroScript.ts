/**
 * Dane intro „otwierane drzwi” (~5 s, z oczu wędkarza). Wszystko jako dane dla Timeline:
 * ujęcia (ścieżki kamery w lokalnym układzie chatki), akcje aktorów, fade.
 * Czasy i odległości w CFG.intro. Układ chatki: cabinLayout() (drzwi w +Z, zawias po stronie +X).
 */
import { CFG } from '../config';
import { cabinLayout } from '../assets/procedural/cabin';
import type { TimelineData, V3 } from './Timeline';

export function buildDoorIntro(): TimelineData {
  const I = CFG.intro;
  const L = cabinLayout();
  const eye = L.F + I.eyeHeight;
  const front = L.D / 2;
  const dx = L.doorX;
  // pozycje kamery (lokalnie w chatce)
  const start: V3 = [dx + I.startSide, eye, front - I.startBack];
  const lean: V3 = [dx + I.startSide, eye - 0.03, front - I.startBack + I.leanIn];
  const pull: V3 = [dx + I.pullSide, eye, front - I.startBack - I.pullBack];
  const threshold: V3 = [dx, eye - 0.02, front + 0.15];
  const porch: V3 = [dx + 0.05, eye - 0.02, front + CFG.world.porchDepth - I.porchEdge];
  // cele patrzenia
  const latch: V3 = [dx - L.doorW / 2 + 0.2, L.F + 1.45, front];
  const doorMid: V3 = [dx - 0.1, L.F + 1.55, front];
  const outside: V3 = [dx + 0.4, L.F + 0.9, front + 10];
  const lake: V3 = [dx + 1.2, L.F - 1.5, front + 26];
  return {
    duration: I.hudAt,
    captions: [],
    shots: [
      {
        start: 0,
        duration: I.stepStart,
        space: 'cabin',
        fadeIn: I.fadeIn,
        fov: I.fov,
        ease: 'linear',
        // 0–0,65 s: rozjaśnienie w miejscu · do 1,3 s: krok do drzwi i sięgnięcie · potem otwieranie i odsunięcie
        cam: [start, start, lean, pull, pull],
        look: [doorMid, doorMid, latch, doorMid, outside],
      },
      {
        start: I.stepStart,
        duration: I.handoff - I.stepStart,
        space: 'cabin',
        fov: I.fov,
        cam: [pull, threshold, porch],
        look: [outside, lake, lake],
      },
    ],
    events: [
      { t: 0, type: 'setup' },
      { t: I.reachStart, t1: I.latchAt, type: 'hand' },
      { t: I.latchAt, type: 'latch' },
      { t: I.doorOpenStart, t1: I.doorOpenEnd, type: 'door' },
      { t: I.doorOpenStart, t1: I.doorOpenStart + I.handRelease, type: 'handPull' },
      { t: I.doorOpenStart + 0.05, t1: I.doorOpenStart + I.adaptTime, type: 'light' },
      { t: I.stepStart, t1: I.handoff, type: 'step' },
      { t: I.handoff, type: 'handoff' },
      { t: I.hudAt, type: 'end' },
    ],
  };
}
