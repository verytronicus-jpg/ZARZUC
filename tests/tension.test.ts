import { describe, expect, it } from 'vitest';
import { CFG, KGF } from '../src/config';
import { TensionModel, slackEscapeProbability, type TensionParams } from '../src/fishing/tension';

const DT = 1 / 120;

function params(over: Partial<TensionParams> = {}): TensionParams {
  return {
    kRod: CFG.rod.kRod,
    ea: CFG.line.ea,
    damping: CFG.line.damping,
    strengthN: CFG.line.strengthKgf * KGF,
    snapTime: CFG.line.snapTime,
    spoolAccel: CFG.reel.spoolAccel,
    spoolMaxSpeed: CFG.reel.spoolMaxSpeed,
    spoolFriction: CFG.reel.spoolFriction,
    reelSpeed: CFG.reel.speed,
    minLine: 0.5,
    ...over,
  };
}

describe('model napięcia', () => {
  it('wytrzymałość żyłki 5,5 kgf ≈ 54 N', () => {
    expect(CFG.line.strengthKgf * KGF).toBeGreaterThan(53.5);
    expect(CFG.line.strengthKgf * KGF).toBeLessThan(54.5);
  });

  it('luźna żyłka (d ≤ L) → T = 0', () => {
    const m = new TensionModel(params(), 3 * KGF);
    m.reset(20, 18);
    for (let i = 0; i < 60; i++) m.step(18, DT, false);
    expect(m.T).toBe(0);
    expect(m.slackTime).toBeGreaterThan(0.4);
  });

  it('k_eff to szeregowe połączenie wędki i żyłki', () => {
    const p = params();
    const m = new TensionModel(p, 100);
    m.L = 20;
    const kl = p.ea / 20;
    expect(m.kEff()).toBeCloseTo(1 / (1 / p.kRod + 1 / kl), 9);
    expect(m.kEff()).toBeLessThan(Math.min(p.kRod, kl));
  });

  it('statycznie T = k_eff · s', () => {
    const m = new TensionModel(params(), 1000);
    m.reset(10, 10);
    const d = 10.3;
    for (let i = 0; i < 400; i++) m.step(d, DT, false);
    expect(m.T).toBeCloseTo(m.kEff() * 0.3, 3);
  });

  it('tłumienie: szybkie rozciąganie daje większe T niż wolne', () => {
    const fast = new TensionModel(params(), 1000);
    const slow = new TensionModel(params(), 1000);
    fast.reset(10, 10.05);
    slow.reset(10, 10.05);
    fast.step(10.1, DT, false); // +5 cm w jednym kroku
    slow.step(10.1, 1, false); // +5 cm w sekundę
    expect(fast.T).toBeGreaterThan(slow.T);
  });
});

describe('hamulec', () => {
  it('przy stałym ciągnięciu T nie przekracza hamulca, a żyłka schodzi ze szpuli', () => {
    const drag = 3 * KGF;
    const m = new TensionModel(params(), drag);
    m.reset(15, 15);
    let d = 15;
    const L0 = m.L;
    let maxT = 0;
    for (let i = 0; i < 1200; i++) {
      d += 1.5 * DT; // ryba odpływa 1,5 m/s
      m.step(d, DT, false);
      if (i > 240) maxT = Math.max(maxT, m.T);
    }
    expect(maxT).toBeLessThan(drag * 1.05);
    expect(m.T).toBeGreaterThan(drag * 0.9);
    expect(m.L).toBeGreaterThan(L0 + 10);
    expect(m.slipping).toBe(true);
  });

  it('podczas poślizgu zwijanie nie skraca żyłki', () => {
    const drag = 2 * KGF;
    const m = new TensionModel(params(), drag);
    m.reset(15, 15);
    let d = 15;
    for (let i = 0; i < 600; i++) {
      d += 1.0 * DT;
      m.step(d, DT, false);
    }
    const L1 = m.L;
    for (let i = 0; i < 240; i++) {
      d += 1.0 * DT;
      m.step(d, DT, true); // gracz kręci
    }
    expect(m.L).toBeGreaterThan(L1);
  });

  it('bez poślizgu zwijanie skraca żyłkę z prędkością CFG.reel.speed', () => {
    const m = new TensionModel(params(), 5 * KGF);
    m.reset(20, 15); // luz 5 m
    for (let i = 0; i < 240; i++) m.step(15, DT, true);
    expect(m.L).toBeCloseTo(20 - CFG.reel.speed * 2, 2);
  });

  it('ostry zryw chwilowo przebija hamulec (bezwładność szpuli)', () => {
    const drag = 3 * KGF;
    const m = new TensionModel(params(), drag);
    m.reset(5, 5);
    let peak = 0;
    let d = 5;
    for (let i = 0; i < 60; i++) {
      d += 4 * DT; // gwałtowny odjazd 4 m/s
      m.step(d, DT, false);
      peak = Math.max(peak, m.T);
    }
    expect(peak).toBeGreaterThan(drag);
  });
});

describe('zerwanie żyłki', () => {
  it('pęka, gdy T > wytrzymałość dłużej niż 0,1 s (hamulec ustawiony za mocno)', () => {
    const m = new TensionModel(params(), 6 * KGF);
    m.reset(10, 10);
    let d = 10;
    let snappedAt = -1;
    for (let i = 0; i < 1200 && snappedAt < 0; i++) {
      d += 1.2 * DT;
      const r = m.step(d, DT, false);
      if (r.snapped) snappedAt = i * DT;
    }
    expect(snappedAt).toBeGreaterThan(0);
    expect(m.snapped).toBe(true);
    expect(m.T).toBe(0);
  });

  it('nie pęka przy krótkim (< 0,1 s) przekroczeniu', () => {
    const p = params();
    const m = new TensionModel(p, 100);
    const k = m.kEff(1, 10);
    const sOver = (p.strengthN * 1.2) / k;
    m.reset(10, 10);
    const steps = Math.floor(0.08 / DT);
    for (let i = 0; i < steps; i++) m.step(10 + sOver, DT, false);
    for (let i = 0; i < 30; i++) m.step(10, DT, false);
    expect(m.snapped).toBe(false);
  });

  it('pęka przy dłuższym przekroczeniu', () => {
    const p = params();
    const m = new TensionModel(p, 100);
    const k = m.kEff(1, 10);
    const sOver = (p.strengthN * 1.2) / k;
    m.reset(10, 10);
    for (let i = 0; i < Math.ceil(0.12 / DT) + 2; i++) m.step(10 + sOver, DT, false);
    expect(m.snapped).toBe(true);
  });

  it('przykład balansu: karp 5 kg ciągnie ~78 N > 54 N → bez hamulca żyłka pęka', () => {
    const W = 5;
    const F = 1.6 * W * 9.81;
    expect(F).toBeGreaterThan(75);
    expect(F).toBeGreaterThan(CFG.line.strengthKgf * KGF);
  });
});

describe('spadnięcie ryby przy luźnej żyłce', () => {
  it('brak szans przed 1,5 s luzu, potem ~35%/s', () => {
    expect(slackEscapeProbability(1.0, 1.5, 0.35, 1 / 60)).toBe(0);
    const p = slackEscapeProbability(2, 1.5, 0.35, 1 / 60);
    // po sekundzie kroków: 1 − (1 − p)^60 ≈ 0,35
    expect(1 - Math.pow(1 - p, 60)).toBeCloseTo(0.35, 3);
  });
});
