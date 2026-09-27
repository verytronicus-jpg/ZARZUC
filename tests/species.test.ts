import { describe, expect, it } from 'vitest';
import { CFG, speciesById } from '../src/config';
import { Rng } from '../src/core/Rng';
import { weightGrams, sampleLength, pickSpecies, zoneFit, speciesWeights, type SpotEnv } from '../src/fishing/species';
import { lakeDepth, pierRect, structureDistance } from '../src/world/terrainMath';

describe('wzór długość–waga W = a·L^b', () => {
  it('liczy wagę zgodnie ze wzorem dla każdego gatunku', () => {
    for (const sp of CFG.species) {
      const L = (sp.minCm + sp.maxCm) / 2;
      expect(weightGrams(sp, L)).toBeCloseTo(sp.a * Math.pow(L, sp.b), 9);
    }
  });

  it('daje realistyczne wagi', () => {
    // płoć 20 cm ≈ 105 g, karp 60 cm ≈ 3,4 kg, leszcz 50 cm ≈ 1,8 kg, okoń 30 cm ≈ 370 g
    expect(weightGrams(speciesById('ploc'), 20)).toBeGreaterThan(90);
    expect(weightGrams(speciesById('ploc'), 20)).toBeLessThan(120);
    expect(weightGrams(speciesById('karp'), 60)).toBeGreaterThan(3000);
    expect(weightGrams(speciesById('karp'), 60)).toBeLessThan(3800);
    expect(weightGrams(speciesById('leszcz'), 50)).toBeGreaterThan(1500);
    expect(weightGrams(speciesById('leszcz'), 50)).toBeLessThan(2100);
    expect(weightGrams(speciesById('okon'), 30)).toBeGreaterThan(300);
    expect(weightGrams(speciesById('okon'), 30)).toBeLessThan(450);
  });

  it('jest rosnący względem długości', () => {
    const sp = speciesById('karas');
    let prev = 0;
    for (let L = sp.minCm; L <= sp.maxCm; L += 1) {
      const w = weightGrams(sp, L);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });
});

describe('losowanie długości', () => {
  it('mieści się w zakresie i jest przesunięte ku małym rybom', () => {
    const rng = new Rng(7);
    for (const sp of CFG.species) {
      const xs: number[] = [];
      for (let i = 0; i < 4000; i++) {
        const L = sampleLength(rng, sp);
        expect(L).toBeGreaterThanOrEqual(sp.minCm);
        expect(L).toBeLessThanOrEqual(sp.maxCm);
        xs.push(L);
      }
      xs.sort((a, b) => a - b);
      const median = xs[xs.length >> 1];
      expect(median).toBeLessThan((sp.minCm + sp.maxCm) / 2);
      // duże są rzadkie: górne 10% zakresu < 10% prób
      const top = xs.filter((x) => x > sp.maxCm - (sp.maxCm - sp.minCm) * 0.1).length / xs.length;
      expect(top).toBeLessThan(0.1);
    }
  });
});

describe('losowanie gatunku (szansa × strefa)', () => {
  const count = (env: SpotEnv, n = 20000) => {
    const rng = new Rng(123);
    const c: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const sp = pickSpecies(rng, env);
      c[sp.id] = (c[sp.id] ?? 0) + 1;
    }
    for (const k of Object.keys(c)) c[k] /= n;
    return c;
  };

  it('rozkład zgodny z wagami (szansa × dopasowanie)', () => {
    const env = { depth: 1.5, reedDist: 30, structDist: 30 };
    const w = speciesWeights(env);
    const sum = w.reduce((a, b) => a + b, 0);
    const c = count(env);
    CFG.species.forEach((sp, i) => {
      expect(c[sp.id] ?? 0).toBeCloseTo(w[i] / sum, 1);
    });
  });

  it('głęboka woda → leszcz i karp; płycizna przy trzcinach → karaś', () => {
    const deep = count({ depth: 3.8, reedDist: 40, structDist: 40 });
    const shallow = count({ depth: 0.7, reedDist: 2, structDist: 40 });
    expect((deep.leszcz ?? 0) + (deep.karp ?? 0)).toBeGreaterThan(0.4);
    expect((shallow.leszcz ?? 0) + (shallow.karp ?? 0)).toBeLessThan(0.05);
    expect(shallow.karas ?? 0).toBeGreaterThan(deep.karas ?? 0);
    expect(shallow.karas ?? 0).toBeGreaterThan(0.25);
  });

  it('okoń lubi struktury (pomost, zwalone drzewo, kamienie cypla)', () => {
    const okon = speciesById('okon');
    expect(zoneFit(okon, { depth: 2, reedDist: 40, structDist: 1 })).toBeGreaterThan(zoneFit(okon, { depth: 2, reedDist: 40, structDist: 40 }) * 1.5);
  });

  it('okoń jest najczęstszy przy każdej ze struktur mapy', () => {
    const W = CFG.world;
    const p = pierRect();
    const spots: Array<[number, number]> = [
      [p.x0 - 1.5, p.z0 + 2], // przy końcu pomostu
      [W.logX1 - 1, W.logZ1 - 1.5], // przy czubku zwalonego drzewa
      [W.pointX - W.pointRadius - 1, W.pointZ + 2], // przy kamieniach cypla
    ];
    for (const [x, z] of spots) {
      const env = { depth: lakeDepth(x, z), reedDist: 40, structDist: structureDistance(x, z) };
      expect(env.depth).toBeGreaterThan(0.5);
      const c = count(env);
      const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
      expect(best).toBe('okon');
    }
  });

  it('jest powtarzalne dla tego samego ziarna RNG', () => {
    const env = { depth: 2, reedDist: 10, structDist: 10 };
    const a = new Rng(99);
    const b = new Rng(99);
    for (let i = 0; i < 100; i++) expect(pickSpecies(a, env).id).toBe(pickSpecies(b, env).id);
  });
});
