import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import {
  lakeDepth,
  lakeR,
  pierRect,
  cabinFrame,
  pathPolyline,
  polylineLength,
  terrainHeightAnalytic,
  groundHeight,
  structureDistance,
  outsideBounds,
  reedArcMask,
  lakeTheta,
  porchFoot,
  distToFallenTree,
  distToPointRocks,
} from '../src/world/terrainMath';

const W = CFG.world;

describe('układ lokacji „Chatka nad jeziorem”', () => {
  it('ścieżka od ganku do nasady pomostu ma około 50 m (±5 m)', () => {
    const L = polylineLength(pathPolyline());
    expect(L).toBeGreaterThan(45);
    expect(L).toBeLessThan(55);
  });

  it('polana z chatką leży 4–6 m nad lustrem wody', () => {
    const c = cabinFrame();
    const h = terrainHeightAnalytic(c.x, c.z) - CFG.water.level;
    expect(h).toBeGreaterThan(4);
    expect(h).toBeLessThan(6);
  });

  it('drzwi chatki patrzą w stronę jeziora', () => {
    const c = cabinFrame();
    // punkt 20 m przed drzwiami jest bliżej wody niż chatka
    expect(lakeR(c.x + c.fx * 20, c.z + c.fz * 20)).toBeLessThan(lakeR(c.x, c.z));
  });

  it('ścieżka jest w całości na lądzie i w granicach gracza', () => {
    for (const [x, z] of pathPolyline()) {
      expect(lakeDepth(x, z)).toBeLessThanOrEqual(W.maxWadeDepth);
      expect(outsideBounds(x, z)).toBe(false);
    }
    const f = porchFoot();
    expect(outsideBounds(f.x, f.z)).toBe(false);
  });

  it('ścieżka nie ma stromych uskoków (da się zejść)', () => {
    const pts = pathPolyline();
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const dh = Math.abs(groundHeight(bx, bz) - groundHeight(ax, az));
      const d = Math.hypot(bx - ax, bz - az);
      expect(dh / Math.max(d, 0.1)).toBeLessThan(0.45);
    }
  });

  it('pomost wchodzi w wodę, a jego koniec jest nad głębszą wodą', () => {
    const p = pierRect();
    expect(lakeDepth((p.x0 + p.x1) / 2, p.z0)).toBeGreaterThan(1);
    expect(lakeDepth((p.x0 + p.x1) / 2, p.z1)).toBe(0);
  });

  it('z końca pomostu da się dorzucić do głębi > 2,5 m (leszcz, karp)', () => {
    const p = pierRect();
    const x = (p.x0 + p.x1) / 2;
    let found = false;
    for (let d = 5; d <= 28; d += 1) if (lakeDepth(x, p.z0 - d) > 2.5) found = true;
    expect(found).toBe(true);
  });

  it('dwie płytkie zatoczki z trzcinami (płoć, karaś)', () => {
    for (const arc of W.reedArcs) {
      const th = (arc.angleDeg * Math.PI) / 180;
      // punkt kilka metrów od brzegu w zatoczce
      let shallow = false;
      for (let k = 0.8; k < 1.0; k += 0.02) {
        const x = Math.cos(th) * W.lakeRx * k * (1 + 0.15);
        const z = Math.sin(th) * W.lakeRz * k * (1 + 0.15);
        const d = lakeDepth(x, z);
        if (d > 0.2 && d < 1.6 && reedArcMask(lakeTheta(x, z)) > 0.9) shallow = true;
      }
      expect(shallow).toBe(true);
    }
  });

  it('skalisty cypel i zwalone drzewo są strukturami przy wodzie', () => {
    expect(lakeR(W.pointX, W.pointZ)).toBeGreaterThan(0.85);
    // czubek pnia leży w wodzie, korzenie na lądzie
    expect(lakeDepth(W.logX1, W.logZ1)).toBeGreaterThan(0.3);
    expect(lakeDepth(W.logX0, W.logZ0)).toBe(0);
    expect(distToFallenTree(W.logX1, W.logZ1)).toBe(0);
    expect(distToPointRocks(W.pointX, W.pointZ)).toBe(0);
  });

  it('structureDistance: blisko pomostu, pnia i kamieni cypla, daleko na środku jeziora', () => {
    const p = pierRect();
    expect(structureDistance(p.x0 - 1, (p.z0 + p.z1) / 2)).toBeLessThan(1.5);
    expect(structureDistance((W.logX0 + W.logX1) / 2, (W.logZ0 + W.logZ1) / 2 - 2)).toBeLessThan(2);
    expect(structureDistance(W.pointX - W.pointRadius - 1, W.pointZ)).toBeLessThan(1.5);
    expect(structureDistance(-20, -10)).toBeGreaterThan(15);
  });

  it('chatka i ganek w granicach gracza, środek jeziora nie jest lądem', () => {
    const c = cabinFrame();
    expect(outsideBounds(c.x + c.fx * 5, c.z + c.fz * 5)).toBe(false);
    expect(lakeDepth(0, 0)).toBeGreaterThan(3);
  });
});
