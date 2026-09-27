/** Mały, typowany emiter zdarzeń (audio, HUD, efekty). */
interface GameEvents {
  splash: { x: number; y: number; z: number; strength: number };
  ripple: { x: number; z: number; strength: number };
  castWhoosh: { power: number };
  step: { surface: 'grass' | 'wood' | 'gravel'; run: boolean };
  baitOn: Record<string, never>;
  lineSnap: Record<string, never>;
  fishSplash: { x: number; y: number; z: number; strength: number };
  strike: Record<string, never>;
  caught: Record<string, never>;
  uiClick: Record<string, never>;
  bite: Record<string, never>;
  floatUnder: { x: number; z: number };
  doorLatch: Record<string, never>;
  doorCreak: Record<string, never>;
}

type Handler<T> = (payload: T) => void;

class Events {
  private map = new Map<keyof GameEvents, Handler<any>[]>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): void {
    const list = this.map.get(type) ?? [];
    list.push(fn);
    this.map.set(type, list);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const list = this.map.get(type);
    if (!list) return;
    for (const fn of list) fn(payload);
  }
}

export const events = new Events();
