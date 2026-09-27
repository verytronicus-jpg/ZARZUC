/** Zacięcie i proces brań (Poisson). Czysta logika – testowana w Vitest. */
import { clamp, lerp } from '../core/math';
import type { Rng } from '../core/Rng';

export type StrikePhase = 'waiting' | 'nibble' | 'bite' | 'late';
export type StrikeResult = 'empty' | 'spooked' | 'aborted' | 'hooked' | 'missed' | 'stolen';

export interface StrikeConfig {
  earlyStrikeSpookChance: number;
  hookChanceStart: number;
  hookChanceEnd: number;
}

/** Szansa zaczepienia w oknie BITE – najlepiej na początku okna. */
export function hookChance(tInWindow: number, window: number, cfg: StrikeConfig): number {
  const t = clamp(tInWindow / Math.max(window, 1e-6), 0, 1);
  return lerp(cfg.hookChanceStart, cfg.hookChanceEnd, t);
}

export function evaluateStrike(
  phase: StrikePhase,
  tInWindow: number,
  window: number,
  rng: Rng,
  cfg: StrikeConfig,
): StrikeResult {
  switch (phase) {
    case 'waiting':
      return 'empty';
    case 'nibble':
      return rng.chance(cfg.earlyStrikeSpookChance) ? 'spooked' : 'aborted';
    case 'bite':
      if (tInWindow > window) return 'stolen';
      return rng.chance(hookChance(tInWindow, window, cfg)) ? 'hooked' : 'missed';
    case 'late':
      return 'stolen';
  }
}

export interface BiteRateConfig {
  meanWait: number;
  minWait: number;
  maxWait: number;
  rampTime: number;
  rampStart: number;
}

/**
 * Intensywność procesu Poissona [1/s].
 * Rośnie przez pierwsze `rampTime` s (zapach przynęty), skalowana atrakcyjnością miejsca,
 * ograniczona tak, by średni czas oczekiwania mieścił się w [minWait, maxWait].
 */
export function biteRate(tSinceSettle: number, attraction: number, cfg: BiteRateConfig, factor = 1): number {
  const ramp = cfg.rampStart + (1 - cfg.rampStart) * clamp(tSinceSettle / cfg.rampTime, 0, 1);
  const base = clamp(attraction / cfg.meanWait, 1 / cfg.maxWait, 1 / cfg.minWait);
  return base * ramp * factor;
}

/** Czy w kroku dt wystąpiło zdarzenie procesu Poissona o intensywności rate. */
export function poissonFires(rng: Rng, rate: number, dt: number): boolean {
  if (rate <= 0) return false;
  return rng.next() < 1 - Math.exp(-rate * dt);
}
