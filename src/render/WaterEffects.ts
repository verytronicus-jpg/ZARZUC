import * as THREE from 'three';
import { events } from '../core/Events';
import { Rng } from '../core/Rng';
import { FX_LAYER } from './layers';
import type { World } from '../world/World';

interface Drop {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
  x: number;
  z: number;
}

/** Efekty wody: plusk (cząsteczki) + rozchodzące się pierścienie fali. */
export class WaterEffects {
  private drops: Drop[] = [];
  private points: THREE.Points;
  private posAttr: THREE.BufferAttribute;
  private rings: Ring[] = [];
  private ringIdx = 0;
  private rng = new Rng(4242);
  private readonly N = 260;

  constructor(
    scene: THREE.Scene,
    private world: World,
  ) {
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(this.N * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xe8f2f4, size: 0.05, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.layers.set(FX_LAYER);
    scene.add(this.points);
    for (let i = 0; i < this.N; i++) this.drops.push({ alive: false, p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0, max: 1 });

    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 40, 1);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xdfeaec, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.visible = false;
      m.renderOrder = 2;
      m.layers.set(FX_LAYER);
      scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, size: 1, x: 0, z: 0 });
    }

    events.on('splash', (e) => this.splash(e.x, e.y, e.z, e.strength));
    events.on('fishSplash', (e) => this.splash(e.x, e.y, e.z, e.strength));
    events.on('ripple', (e) => this.ring(e.x, e.z, 0.25 + e.strength * 0.6, 1.2 + e.strength));
  }

  splash(x: number, y: number, z: number, strength: number): void {
    const n = Math.floor(18 + strength * 50);
    let spawned = 0;
    for (const d of this.drops) {
      if (spawned >= n) break;
      if (d.alive) continue;
      d.alive = true;
      d.p.set(x + this.rng.range(-0.05, 0.05), y + 0.02, z + this.rng.range(-0.05, 0.05));
      const a = this.rng.range(0, Math.PI * 2);
      const h = this.rng.range(0.2, 1.1) * (0.6 + strength);
      d.v.set(Math.cos(a) * h, this.rng.range(1.0, 2.6) * (0.5 + strength), Math.sin(a) * h);
      d.life = 0;
      d.max = this.rng.range(0.5, 1.0);
      spawned++;
    }
    this.ring(x, z, 0.4 + strength * 1.2, 1.4 + strength);
    this.ring(x, z, 0.2 + strength * 0.6, 1.0 + strength * 0.6, 0.18);
  }

  ring(x: number, z: number, size: number, life: number, delay = 0): void {
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    r.x = x;
    r.z = z;
    r.size = size;
    r.max = life;
    r.life = -delay;
    r.mesh.visible = true;
  }

  update(dt: number, time: number): void {
    const arr = this.posAttr.array as Float32Array;
    for (let i = 0; i < this.N; i++) {
      const d = this.drops[i];
      if (d.alive) {
        d.life += dt;
        d.v.y -= 9.81 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.life > d.max || d.p.y < this.world.waterY(d.p.x, d.p.z, time) - 0.05) {
          d.alive = false;
          d.p.set(0, -99, 0);
        }
      }
      arr[i * 3] = d.p.x;
      arr[i * 3 + 1] = d.p.y;
      arr[i * 3 + 2] = d.p.z;
    }
    this.posAttr.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life += dt;
      if (r.life < 0) {
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        continue;
      }
      const t = r.life / r.max;
      if (t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.size * (0.15 + t * 1.4);
      r.mesh.scale.set(s, 1, s);
      r.mesh.position.set(r.x, this.world.waterY(r.x, r.z, time) + 0.012, r.z);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t) * Math.min(1, r.life * 8);
    }
  }
}
