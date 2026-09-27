/** Seedowany RNG (mulberry32) – powtarzalny, do testów i debugowania. */
export class Rng {
  private s: number;

  constructor(seed = 1) {
    this.s = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Losowanie indeksu wg wag (wagi ≥ 0). Zwraca -1 gdy suma wag = 0. */
  weightedIndex(weights: readonly number[]): number {
    let sum = 0;
    for (const w of weights) sum += Math.max(0, w);
    if (sum <= 0) return -1;
    let r = this.next() * sum;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /** Niezależny strumień (np. dla efektów wizualnych, żeby nie psuć powtarzalności logiki). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }
}
