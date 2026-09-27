/**
 * Dane cutscenki "Sobota, 5:40" (~24 s). Wszystko jako dane: ujęcia, napisy, akcje aktorów.
 */
import { CFG } from '../config';
import type { TimelineData, V3 } from './Timeline';

export const INTRO_START = { x: 6.9, z: 186.95, yaw: Math.PI };
export const CAR_HOUSE = { x: 2.5, z: 190.5, yaw: Math.PI };
export const DRIVER_OFFSET = { x: 1.4, z: -0.1 }; // lokalnie względem auta (lewa strona = +X)
export const INTRO_END_WALK: Array<[number, number]> = [
  [-7.4, 59.1],
  [-7.7, 57.9],
  [-7.3, 56.4],
];

export function buildIntro(hy: number): TimelineData {
  const W = CFG.world;
  const ph = W.parkingH;
  const h = (y: number): number => hy + y;
  const cam = (pts: Array<[number, number, number]>): V3[] => pts.map(([x, y, z]) => [x, h(y), z]);
  return {
    duration: 24.0,
    captions: [
      { t: 0.4, t1: 4.4, text: 'Sobota, 5:40', sub: 'Pierwszy wolny dzień od tygodni' },
      { t: 18.9, t1: 22.4, text: 'Jezioro Ciche', sub: 'Łowisko nr 7' },
    ],
    shots: [
      {
        start: 0, duration: 5.1, fadeIn: 1.4, fov: 50,
        cam: cam([[10.8, 1.75, 190.6], [9.7, 1.6, 189.4], [8.9, 1.5, 188.5]]),
        look: cam([[6.9, 1.05, 186.3], [6.85, 1.15, 186.5], [6.6, 1.2, 187.2]]),
      },
      {
        start: 5.1, duration: 6.2, fov: 55,
        cam: cam([[8.2, 2.3, 197.5], [6.5, 2.2, 198.2], [4.8, 2.0, 198.0]]),
        look: 'actor', lookOffset: [0, 1.0, 0],
      },
      {
        start: 11.3, duration: 3.9, space: 'car', fov: 50, ease: 'linear',
        cam: [[4.6, 1.2, 5.0], [5.2, 1.1, 0.5], [4.8, 1.3, -3.8]],
        look: 'car', lookOffset: [0, 0.8, 0],
      },
      {
        start: 15.2, duration: 3.6, space: 'car', fov: 55, ease: 'linear',
        cam: [[2.0, 2.2, -7.5], [1.0, 2.6, -9.5], [0.2, 3.1, -11]],
        look: 'car', lookOffset: [0, 1.0, 0],
      },
      {
        start: 18.8, duration: 5.2, fov: 55,
        cam: [[-19, ph + 4.2, 45.5], [-16.5, ph + 3.4, 49], [-13.2, ph + 2.6, 51.8]],
        look: 'actor', lookOffset: [0, 1.0, 0],
      },
    ],
    events: [
      { t: 0, type: 'setup' },
      { t: 0.2, type: 'engine', on: false },
      { t: 1.1, type: 'pose', pose: 'reach' },
      { t: 2.0, type: 'attach', item: 'rod', to: 'hand_R' },
      { t: 2.15, type: 'pose', pose: 'holdRod' },
      { t: 2.4, type: 'pose', pose: 'lift' },
      { t: 2.95, type: 'attach', item: 'box', to: 'hand_L' },
      { t: 3.15, type: 'pose', pose: 'carry' },
      { t: 3.4, t1: 6.8, type: 'walk', path: [[6.9, 186.95], [6.3, 189.4], [4.6, 192.6], [2.5, 193.25]], endYaw: Math.PI },
      { t: 6.85, type: 'pose', pose: 'openTrunk' },
      { t: 7.0, type: 'trunk', open: true },
      { t: 7.6, type: 'pose', pose: 'reach' },
      { t: 7.9, type: 'attach', item: 'rod', to: 'trunk' },
      { t: 8.25, type: 'pose', pose: 'reach' },
      { t: 8.55, type: 'attach', item: 'box', to: 'trunk' },
      { t: 8.95, type: 'pose', pose: 'openTrunk' },
      { t: 9.15, type: 'trunk', open: false },
      { t: 9.6, type: 'pose', pose: 'none' },
      { t: 9.8, t1: 11.1, type: 'walk', path: [[2.5, 193.25], [1.1, 192.7], [1.1, 190.7]], endYaw: Math.PI },
      { t: 11.05, type: 'door', open: true },
      { t: 11.45, type: 'hide' },
      { t: 11.75, type: 'door', open: false },
      { t: 11.9, type: 'engine', on: true },
      { t: 12.0, t1: 21.1, type: 'drive' },
      { t: 21.2, type: 'engine', on: false },
      { t: 21.35, type: 'door', open: true },
      { t: 21.6, type: 'show' },
      { t: 21.95, type: 'door', open: false },
      { t: 22.0, t1: 23.5, type: 'walk', path: INTRO_END_WALK, endYaw: Math.PI },
      { t: 23.6, type: 'end' },
    ],
  };
}
