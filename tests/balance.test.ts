import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CFG, KGF, speciesById, type SpeciesId } from '../src/config';
import { Rng } from '../src/core/Rng';
import { TensionModel } from '../src/fishing/tension';
import { FightFish, type FishEnv } from '../src/fishing/FightFish';
import { weightGrams } from '../src/fishing/species';

/**
 * Symulacja holu bez grafiki (ten sam model co w grze): bot kręci, gdy napięcie jest bezpieczne.
 * Służy do strojenia balansu i pilnuje, by zmiany w configu nie zepsuły rozgrywki.
 */
const env: FishEnv = {
  depth: (x, z) => (Math.hypot(x, z - 3) < 2 ? 0.5 : 3.2),
  waterY: () => 0,
  reedDistance: () => 50,
  nearestReed: () => ({ x: 40, z: 60 }),
};

interface Result {
  outcome: 'landed' | 'snapped' | 'escaped' | 'timeout';
  time: number;
  maxT: number;
}

function simulateFight(species: SpeciesId, lengthCm: number, dragKgf: number, seed: number, policy: 'smart' | 'reckless'): Result {
  const sp = speciesById(species);
  const rng = new Rng(seed);
  const W = weightGrams(sp, lengthCm) / 1000;
  const fish = new FightFish(sp, W, lengthCm / 100, rng);
  fish.pos.set(0, -1.2, 22);
  fish.heading = 0;
  const tip = new THREE.Vector3(0, 2.8, 2.5);
  const player = new THREE.Vector3(0, 0.45, 0);
  const tm = new TensionModel(
    {
      kRod: CFG.rod.kRod,
      ea: CFG.line.ea,
      damping: CFG.line.damping,
      strengthN: CFG.line.strengthKgf * KGF,
      snapTime: CFG.line.snapTime,
      spoolAccel: CFG.reel.spoolAccel,
      spoolMaxSpeed: CFG.reel.spoolMaxSpeed,
      spoolFriction: CFG.reel.spoolFriction,
      reelSpeed: CFG.reel.speed,
      minLine: tip.y + CFG.reel.minLineAboveWater,
    },
    dragKgf * KGF,
  );
  tm.reset(tip.distanceTo(fish.pos) + 0.3, tip.distanceTo(fish.pos));
  const dt = 1 / 120;
  let maxT = 0;
  let rodSide = 0;
  for (let t = 0; t < 600; t += dt) {
    const d = tip.distanceTo(fish.pos);
    const ratio = tm.T / tm.p.strengthN;
    const reeling = policy === 'reckless' ? true : ratio < 0.55 && !fish.surging;
    // bot prowadzi wędkę przeciwnie do ucieczki ryby
    const toFish = new THREE.Vector3().subVectors(fish.pos, player).setY(0).normalize();
    const right = new THREE.Vector3(-toFish.z, 0, toFish.x);
    const lat = fish.vel.dot(right);
    if (policy === 'smart') rodSide = THREE.MathUtils.clamp(-lat * 2, -1, 1);
    const r = tm.step(d, dt, reeling, 1.1);
    maxT = Math.max(maxT, r.T);
    if (r.snapped) return { outcome: 'snapped', time: t, maxT };
    if (tm.L > CFG.line.spoolCapacity) return { outcome: 'snapped', time: t, maxT };
    const toTip = new THREE.Vector3().subVectors(tip, fish.pos).normalize();
    fish.step(dt, { T: r.T, toTip, playerPos: player, rodSide, pressureMul: 1.05 }, env);
    if (tm.slackTime > CFG.fight.slackTime + 3) return { outcome: 'escaped', time: t, maxT };
    const horiz = Math.hypot(fish.pos.x - tip.x, fish.pos.z - tip.z);
    if (horiz < CFG.landing.maxDistance && fish.stamina < CFG.landing.maxStamina) return { outcome: 'landed', time: t, maxT };
  }
  return { outcome: 'timeout', time: 600, maxT };
}

describe('balans holu (symulacja)', () => {
  const report: string[] = [];

  it('mała płoć ląduje szybko przy domyślnym hamulcu', () => {
    const r = simulateFight('ploc', 20, CFG.reel.dragDefaultKgf, 1, 'smart');
    report.push(`płoć 20 cm: ${r.outcome} ${r.time.toFixed(1)} s, Tmax ${r.maxT.toFixed(1)} N`);
    expect(r.outcome).toBe('landed');
    expect(r.time).toBeLessThan(40);
  });

  it('każdy gatunek (średni rozmiar) da się wyholować rozsądną taktyką', () => {
    const sizes: Record<SpeciesId, number> = { ploc: 24, okon: 28, karas: 22, leszcz: 45, karp: 60 };
    for (const id of Object.keys(sizes) as SpeciesId[]) {
      let landed = 0;
      const times: number[] = [];
      for (let seed = 1; seed <= 6; seed++) {
        const r = simulateFight(id, sizes[id], CFG.reel.dragDefaultKgf, seed, 'smart');
        if (r.outcome === 'landed') {
          landed++;
          times.push(r.time);
        }
      }
      report.push(`${id} ${sizes[id]} cm: wyholowane ${landed}/6, czasy ${times.map((t) => t.toFixed(0)).join(', ')} s`);
      expect(landed).toBeGreaterThanOrEqual(4);
    }
  });

  it('duży karp (5 kg) zrywa żyłkę, gdy hamulec dokręcony i gracz kręci na siłę', () => {
    const L = Math.pow(5000 / speciesById('karp').a, 1 / speciesById('karp').b);
    let snapped = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const r = simulateFight('karp', L, 6, seed, 'reckless');
      if (r.outcome === 'snapped') snapped++;
    }
    report.push(`karp 5 kg, hamulec 6 kgf, na siłę: zerwania ${snapped}/6`);
    expect(snapped).toBeGreaterThanOrEqual(4);
  });

  it('duży karp (5 kg) przy hamulcu 3 kgf i męczeniu ryby – do wyholowania', () => {
    const L = Math.pow(5000 / speciesById('karp').a, 1 / speciesById('karp').b);
    let landed = 0;
    const times: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const r = simulateFight('karp', L, 3, seed, 'smart');
      if (r.outcome === 'landed') {
        landed++;
        times.push(r.time);
      }
    }
    report.push(`karp 5 kg (${L.toFixed(1)} cm), hamulec 3 kgf, z głową: ${landed}/6, czasy ${times.map((t) => t.toFixed(0)).join(', ')} s`);
    expect(landed).toBeGreaterThanOrEqual(4);
    // i nie jest to 10-sekundowa formalność
    expect(Math.min(...times)).toBeGreaterThan(30);
  });

  it('raport', () => {
    const out = (globalThis as { process?: { stdout?: { write(s: string): void } } }).process?.stdout;
    out?.write('\n' + report.join('\n') + '\n');
    expect(report.length).toBeGreaterThan(0);
  });
});
