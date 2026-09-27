import * as THREE from 'three';
import { CFG } from '../config';
import { DEG } from '../core/math';

export interface Interactable {
  id: string;
  label: () => string;
  position: (out: THREE.Vector3) => THREE.Vector3;
  enabled: () => boolean;
  onInteract: () => void;
}

/** Najbliższy obiekt w zasięgu (2 m) i w stożku widzenia. Podpowiedź "[E] …" nad obiektem. */
export class InteractionSystem {
  readonly items: Interactable[] = [];
  current: Interactable | null = null;
  readonly currentPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  add(i: Interactable): void {
    this.items.push(i);
  }

  update(playerPos: THREE.Vector3, facing: THREE.Vector3): void {
    const cosCone = Math.cos((CFG.interaction.coneDeg / 2) * DEG);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const it of this.items) {
      if (!it.enabled()) continue;
      it.position(this.tmp);
      const dx = this.tmp.x - playerPos.x;
      const dz = this.tmp.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > CFG.interaction.range) continue;
      const dot = d > 0.2 ? (dx * facing.x + dz * facing.z) / d : 1;
      if (dot < cosCone) continue;
      const score = d - dot * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
    if (best) best.position(this.currentPos);
  }

  interact(): boolean {
    if (!this.current) return false;
    this.current.onInteract();
    return true;
  }
}
