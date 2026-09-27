/**
 * Gatunki: wzór długość–waga, losowanie długości (przesunięte ku małym), dopasowanie do strefy,
 * losowanie gatunku ważone szansą × dopasowaniem do miejsca, gdzie leży przynęta. Czysta logika.
 */
import { CFG, type SpeciesConfig, type SpeciesId } from '../config';
import { smoothstep } from '../core/math';
import type { Rng } from '../core/Rng';

/** W[g] = a · L[cm]^b */
export function weightGrams(sp: Pick<SpeciesConfig, 'a' | 'b'>, lengthCm: number): number {
  return sp.a * Math.pow(lengthCm, sp.b);
}

/** Długość [cm] – rozkład potęgowy przesunięty w stronę małych ryb (duże rzadkie). */
export function sampleLength(rng: Rng, sp: Pick<SpeciesConfig, 'minCm' | 'maxCm' | 'lengthSkew'>): number {
  const u = rng.next();
  return sp.minCm + (sp.maxCm - sp.minCm) * Math.pow(u, sp.lengthSkew);
}

export interface SpotEnv {
  /** głębokość wody w miejscu przynęty [m] */
  depth: number;
  /** odległość do najbliższych trzcin [m] */
  reedDist: number;
  /** odległość do pomostu [m] */
  pierDist: number;
}

/** Dopasowanie gatunku do miejsca (0..~2.5). */
export function zoneFit(sp: SpeciesConfig, env: SpotEnv): number {
  const z = sp.zone;
  const inDepth =
    smoothstep(z.depthMin - z.depthRamp, z.depthMin, env.depth) * (1 - smoothstep(z.depthMax, z.depthMax + z.depthRamp, env.depth));
  const depthFit = z.outside + (z.inside - z.outside) * inDepth;
  const reed = z.reedBonus * (1 - smoothstep(0, z.structureRange, env.reedDist));
  const pier = z.pierBonus * (1 - smoothstep(0, z.structureRange, env.pierDist));
  return depthFit * (1 + reed + pier);
}

export function speciesWeights(env: SpotEnv, list: readonly SpeciesConfig[] = CFG.species): number[] {
  return list.map((sp) => sp.chance * zoneFit(sp, env));
}

export function pickSpecies(rng: Rng, env: SpotEnv, list: readonly SpeciesConfig[] = CFG.species): SpeciesConfig {
  const i = rng.weightedIndex(speciesWeights(env, list));
  return list[Math.max(0, i)];
}

/** "Atrakcyjność" łowiska – skaluje częstotliwość brań. Typowe miejsce ≈ 1. */
export function spotAttraction(env: SpotEnv, list: readonly SpeciesConfig[] = CFG.species): number {
  return speciesWeights(env, list).reduce((a, b) => a + b, 0);
}

export interface FishInstance {
  species: SpeciesId;
  lengthCm: number;
  weightG: number;
}

export function rollFish(rng: Rng, env: SpotEnv): FishInstance {
  const sp = pickSpecies(rng, env);
  const lengthCm = sampleLength(rng, sp);
  return { species: sp.id, lengthCm, weightG: weightGrams(sp, lengthCm) };
}
