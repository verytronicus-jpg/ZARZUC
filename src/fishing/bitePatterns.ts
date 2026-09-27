/**
 * WZORY BRAŃ – każdy gatunek inaczej porusza spławikiem.
 * Wzór nie ustawia spławika "na sztywno": zwraca siły działające na zestaw
 * (dociążenie w gramach, podniesienie śruciny, znoszenie w bok), a fizyka spławika
 * (wyporność + tłumienie) zamienia je w ruch. Dzięki temu branie wygląda naturalnie.
 */
import type { SpeciesId } from '../config';
import { smoothstep } from '../core/math';
import type { Rng } from '../core/Rng';

export interface FloatSignal {
  /** dodatkowe obciążenie w gramach-siły (ujemne = ryba unosi zestaw) */
  pullGf: number;
  /** prędkość znoszenia w bok [m/s] */
  lateral: number;
  /** 0..1 – ryba podniosła śrucinę (leszcz): spławik traci obciążenie i się kładzie */
  liftShot: number;
}

export interface BitePattern {
  species: SpeciesId;
  nibbleDuration: number;
  window: number;
  nibble(t: number): FloatSignal;
  bite(t: number): FloatSignal;
  describe: string;
}

const NONE: FloatSignal = { pullGf: 0, lateral: 0, liftShot: 0 };

/** gładki impuls 0→1→0 */
function pulse(t: number, start: number, dur: number): number {
  if (t < start || t > start + dur) return 0;
  return Math.sin((Math.PI * (t - start)) / dur);
}

export function createBitePattern(species: SpeciesId, window: number, rng: Rng): BitePattern {
  switch (species) {
    case 'ploc': {
      // 2–4 szybkie drobne podskoki, potem szybkie zanurzenie pod kątem
      const n = rng.int(2, 4);
      const taps: number[] = [];
      let t = rng.range(0.2, 0.4);
      for (let i = 0; i < n; i++) {
        taps.push(t);
        t += rng.range(0.26, 0.42);
      }
      const amp = rng.range(0.4, 0.55);
      return {
        species, window, describe: 'drobne podskoki → zanurzenie pod kątem',
        nibbleDuration: t + 0.1,
        nibble: (tt) => ({ pullGf: taps.reduce((s, s0) => s + amp * pulse(tt, s0, 0.11), 0), lateral: 0, liftShot: 0 }),
        bite: (tt) => ({ pullGf: 2.2 * smoothstep(0, 0.08, tt), lateral: 0.3 * smoothstep(0.02, 0.12, tt), liftShot: 0 }),
      };
    }
    case 'okon': {
      // krótko i zdecydowanie: szybkie zatopienie, odjazd w bok
      const tap = rng.chance(0.55);
      const dur = rng.range(0.45, 0.9);
      return {
        species, window, describe: 'zdecydowane zatopienie i odjazd w bok',
        nibbleDuration: dur,
        nibble: (tt) => (tap ? { pullGf: 0.55 * pulse(tt, 0.15, 0.12), lateral: 0, liftShot: 0 } : NONE),
        bite: (tt) => ({ pullGf: 4.2 * smoothstep(0, 0.05, tt), lateral: 0.65 * smoothstep(0.04, 0.2, tt), liftShot: 0 }),
      };
    }
    case 'karas': {
      // delikatne drżenie, spławik powoli sunie w bok
      const dur = rng.range(1.6, 3.0);
      const ph = rng.range(0, 6);
      return {
        species, window, describe: 'delikatne drżenie, spławik powoli sunie w bok',
        nibbleDuration: dur,
        nibble: (tt) => ({
          pullGf: 0.1 + 0.16 * Math.abs(Math.sin(tt * 2 * Math.PI * 7.5 + ph)) * (0.6 + 0.4 * Math.sin(tt * 3.1 + ph)),
          lateral: 0.03 * smoothstep(0.3, 1.2, tt),
          liftShot: 0,
        }),
        bite: (tt) => ({ pullGf: 0.3 + 0.08 * Math.sin(tt * 23), lateral: 0.2 * smoothstep(0, 0.35, tt), liftShot: 0 }),
      };
    }
    case 'leszcz': {
      // drgnięcia, potem spławik UNOSI SIĘ i kładzie płasko (ryba podnosi śrucinę), potem odjeżdża
      const n = rng.int(1, 2);
      const taps: number[] = [];
      let t = rng.range(0.3, 0.6);
      for (let i = 0; i < n; i++) {
        taps.push(t);
        t += rng.range(0.5, 0.9);
      }
      return {
        species, window, describe: 'spławik się unosi i kładzie płasko, potem odjeżdża',
        nibbleDuration: t + 0.2,
        nibble: (tt) => ({ pullGf: taps.reduce((s, s0) => s + 0.32 * pulse(tt, s0, 0.16), 0), lateral: 0, liftShot: 0 }),
        bite: (tt) => {
          const lift = smoothstep(0, 0.35, tt);
          return { pullGf: -0.35 * lift, lateral: 0.22 * smoothstep(0.55, 0.95, tt), liftShot: lift };
        },
      };
    }
    case 'karp': {
      // parę drgnięć, potem spławik znika i żyłka ucieka
      const n = rng.int(2, 3);
      const taps: number[] = [];
      let t = rng.range(0.3, 0.7);
      for (let i = 0; i < n; i++) {
        taps.push(t);
        t += rng.range(0.45, 0.9);
      }
      return {
        species, window, describe: 'parę drgnięć, spławik znika i żyłka ucieka',
        nibbleDuration: t + 0.2,
        nibble: (tt) => ({ pullGf: taps.reduce((s, s0) => s + 0.6 * pulse(tt, s0, 0.18), 0), lateral: 0, liftShot: 0 }),
        bite: (tt) => ({ pullGf: 6 * smoothstep(0, 0.12, tt), lateral: 0.8 * smoothstep(0.08, 0.3, tt), liftShot: 0 }),
      };
    }
  }
}
