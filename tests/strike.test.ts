import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { Rng } from '../src/core/Rng';
import { evaluateStrike, hookChance, biteRate, poissonFires } from '../src/fishing/strike';
import { createBitePattern } from '../src/fishing/bitePatterns';

describe('okna zacięcia', () => {
  it('okna gatunków: płoć najkrótsze, karp najdłuższe, każde ≥ czasu reakcji człowieka', () => {
    const w = Object.fromEntries(CFG.species.map((s) => [s.id, s.bite.window]));
    expect(w).toEqual({ ploc: 0.9, okon: 1.2, karas: 1.4, leszcz: 1.6, karp: 1.9 });
    // czas reakcji ~0,3–0,5 s + zauważenie – nawet płoć da się zaciąć „z marszu”
    for (const v of Object.values(w)) expect(v).toBeGreaterThanOrEqual(0.8);
  });

  it('zacięcie bez brania = w pustkę', () => {
    expect(evaluateStrike('waiting', 0, 1, new Rng(1), CFG.bite)).toBe('empty');
  });

  it('za wcześnie (NIBBLE): ~35% spłoszenia, reszta przerwana próba', () => {
    const rng = new Rng(5);
    let spooked = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = evaluateStrike('nibble', 0, 1, rng, CFG.bite);
      expect(['spooked', 'aborted']).toContain(r);
      if (r === 'spooked') spooked++;
    }
    expect(spooked / N).toBeCloseTo(CFG.bite.earlyStrikeSpookChance, 1);
    expect(spooked / N).toBeLessThan(0.45);
  });

  it('w oknie BITE: 97% na początku, 90% na końcu', () => {
    expect(hookChance(0, 1, CFG.bite)).toBeCloseTo(0.97, 6);
    expect(hookChance(1, 1, CFG.bite)).toBeCloseTo(0.9, 6);
    expect(hookChance(0.5, 1, CFG.bite)).toBeCloseTo(0.935, 6);
    const rng = new Rng(9);
    let early = 0;
    let late = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      if (evaluateStrike('bite', 0.01, 1.5, rng, CFG.bite) === 'hooked') early++;
      if (evaluateStrike('bite', 1.49, 1.5, rng, CFG.bite) === 'hooked') late++;
    }
    expect(early / N).toBeGreaterThan(0.95);
    expect(late / N).toBeLessThan(0.92);
    expect(late / N).toBeGreaterThan(0.88);
  });

  it('po oknie = przynęta zjedzona', () => {
    expect(evaluateStrike('bite', 1.3, 1.2, new Rng(1), CFG.bite)).toBe('stolen');
    expect(evaluateStrike('late', 0, 1, new Rng(1), CFG.bite)).toBe('stolen');
  });

  it('każdy gatunek ma własny wzór brania z oknem z configu', () => {
    const rng = new Rng(3);
    for (const sp of CFG.species) {
      const p = createBitePattern(sp.id, sp.bite.window, rng);
      expect(p.window).toBe(sp.bite.window);
      expect(p.nibbleDuration).toBeGreaterThan(0.3);
    }
    // leszcz podnosi śrucinę (spławik się kładzie), karp i okoń topią spławik
    expect(createBitePattern('leszcz', 1.2, rng).bite(0.5).liftShot).toBeGreaterThan(0.9);
    expect(createBitePattern('karp', 1.5, rng).bite(0.5).pullGf).toBeGreaterThan(4);
    expect(createBitePattern('okon', 0.8, rng).bite(0.3).lateral).toBeGreaterThan(0.4);
    expect(createBitePattern('karas', 1, rng).bite(0.5).pullGf).toBeLessThan(0.6);
  });
});

describe('proces Poissona brań', () => {
  const cfg = CFG.bite;

  it('intensywność rośnie przez pierwsze 5 s', () => {
    const r0 = biteRate(0, 1, cfg);
    const r2 = biteRate(2.5, 1, cfg);
    const r5 = biteRate(5, 1, cfg);
    const r9 = biteRate(9, 1, cfg);
    expect(r0).toBeLessThan(r2);
    expect(r2).toBeLessThan(r5);
    expect(r5).toBeCloseTo(r9, 9);
  });

  it('średni czas oczekiwania 10–40 s', () => {
    for (const attraction of [0.05, 0.5, 1, 2, 10]) {
      const rng = new Rng(11);
      let sum = 0;
      const N = 1500;
      for (let k = 0; k < N; k++) {
        let t = 0;
        while (!poissonFires(rng, biteRate(t, attraction, cfg), 1 / 30)) t += 1 / 30;
        sum += t;
      }
      const mean = sum / N;
      expect(mean).toBeGreaterThan(9);
      expect(mean).toBeLessThan(45);
    }
  });
});
