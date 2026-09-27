import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { simulateRange } from '../src/fishing/cast';
import { gerstner, waterHeight } from '../src/world/waves';
import { Bobber, type BobberEnv } from '../src/fishing/Bobber';
import { Rng } from '../src/core/Rng';
import { StateMachine } from '../src/core/StateMachine';
import * as THREE from 'three';

describe('rzut', () => {
  it('maksymalny zasięg ≈ 30 m', () => {
    const r = simulateRange(1, 3, CFG.cast).range;
    expect(r).toBeGreaterThan(27);
    expect(r).toBeLessThan(33);
  });

  it('zasięg rośnie z siłą, minimum kilka metrów', () => {
    let prev = 0;
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const r = simulateRange(p, 3, CFG.cast).range;
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
    expect(simulateRange(0, 3, CFG.cast).range).toBeGreaterThan(3);
  });

  it('opór powietrza skraca rzut', () => {
    const noDrag = simulateRange(1, 3, { ...CFG.cast, airDragK: 0 }).range;
    expect(noDrag).toBeGreaterThan(simulateRange(1, 3, CFG.cast).range + 5);
  });
});

describe('fale Gerstnera – CPU = GPU', () => {
  it('waterHeight() w punkcie świata zgadza się z przesuniętym wierzchołkiem', () => {
    for (const [x0, z0, t] of [
      [0, 0, 0],
      [12.3, -7.1, 3.7],
      [-40, 22, 11.2],
      [5, 5, 100],
    ]) {
      const p = gerstner(x0, z0, t); // to liczy wierzchołek na GPU
      expect(waterHeight(p.x, p.z, t)).toBeCloseTo(p.y, 5);
    }
  });

  it('amplituda fal jest mała (poranny spokój)', () => {
    let max = 0;
    for (let i = 0; i < 200; i++) max = Math.max(max, Math.abs(waterHeight(i * 0.7, i * 0.3, i * 0.1)));
    expect(max).toBeLessThan(0.1);
  });
});

describe('spławik', () => {
  const flatEnv = (depth: number): BobberEnv => ({
    waterY: () => 0,
    terrainY: () => -depth,
    depth: () => depth,
  });

  it('w spoczynku antenka wystaje, korpus zanurzony', () => {
    const r = CFG.rig;
    const h = Bobber.restImmersion(r.floatMassG + r.shotMassG + r.hookMassG);
    expect(h).toBeGreaterThan(r.bodyLength);
    expect(h).toBeLessThan(r.bodyLength + r.antennaLength * 0.5);
  });

  it('po upadku leży płasko 0,5–1 s, potem wstaje (śrucina opada)', () => {
    const b = new Bobber(new Rng(1));
    const env = flatEnv(3);
    const tip = new THREE.Vector3(0, 3, 10);
    b.launch(new THREE.Vector3(0, 0.5, 0), { x: 0, y: -1, z: 0 });
    for (let i = 0; i < 300 && b.mode === 'flight'; i++) b.update(1 / 60, env, tip);
    expect(b.mode).toBe('water');
    let t = 0;
    let flatUntil = 0;
    for (; t < 3; t += 1 / 60) {
      b.update(1 / 60, env, tip);
      if (b.tilt > 0.85) flatUntil = t;
    }
    expect(flatUntil).toBeGreaterThan(0.4);
    expect(flatUntil).toBeLessThan(1.3);
    expect(b.tilt).toBeLessThan(0.05);
    expect(b.settled).toBe(true);
  });

  it('płycej niż grunt → spławik przechylony, przynęta leży', () => {
    const b = new Bobber(new Rng(2));
    const env = flatEnv(0.7);
    b.launch(new THREE.Vector3(0, 0.3, 0), { x: 0, y: -1, z: 0 });
    const tip = new THREE.Vector3(0, 3, 10);
    for (let t = 0; t < 4; t += 1 / 60) b.update(1 / 60, env, tip);
    expect(b.lying).toBe(true);
    expect(b.tilt).toBeGreaterThan(0.4);
  });

  it('dociążenie przez rybę topi spławik, podniesienie śruciny kładzie go', () => {
    const b = new Bobber(new Rng(3));
    const env = flatEnv(3);
    const tip = new THREE.Vector3(0, 3, 10);
    b.launch(new THREE.Vector3(0, 0.3, 0), { x: 0, y: -1, z: 0 });
    for (let t = 0; t < 3; t += 1 / 60) b.update(1 / 60, env, tip);
    const restY = b.pos.y;
    b.signal = { pullGf: 5, lateral: 0, liftShot: 0 };
    for (let t = 0; t < 1; t += 1 / 60) b.update(1 / 60, env, tip);
    expect(b.pos.y).toBeLessThan(restY - 0.08);
    b.signal = { pullGf: 0, lateral: 0, liftShot: 1 };
    for (let t = 0; t < 1.5; t += 1 / 60) b.update(1 / 60, env, tip);
    expect(b.tilt).toBeGreaterThan(0.8);
    expect(b.pos.y).toBeGreaterThan(restY);
  });
});

describe('maszyna stanów', () => {
  it('timeout przełącza stan i liczy czas w stanie', () => {
    const log: string[] = [];
    const fsm = new StateMachine<'A' | 'B'>('A');
    fsm.setHandlers({
      A: { timeout: 0.5, onTimeout: () => fsm.go('B'), enter: () => log.push('enterA') },
      B: { enter: (prev) => log.push(`enterB from ${prev}`) },
    });
    fsm.start();
    for (let i = 0; i < 20; i++) fsm.update(0.05);
    expect(fsm.state).toBe('B');
    expect(log).toEqual(['enterA', 'enterB from A']);
    expect(fsm.time).toBeGreaterThan(0.4);
  });
});
