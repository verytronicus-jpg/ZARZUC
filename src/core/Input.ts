/**
 * Wejście: klawiatura + mysz + pointer lock.
 * - "held" – stan bieżący
 * - "pressed" – krawędzie konsumowane przez logikę w stałym kroku (consumePress)
 * - ruch myszy: dwa niezależne akumulatory (kamera w renderze, celowanie w kroku fizyki)
 */
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  private released = new Set<string>();
  mouseButtons = new Set<number>();
  private mousePressed = new Set<number>();
  private mouseReleased = new Set<number>();
  lookDX = 0;
  lookDY = 0;
  aimDX = 0;
  aimDY = 0;
  wheel = 0;
  locked = false;
  /** pointer lock niedostępny (np. osadzona ramka) – mysz działa bez przechwycenia */
  lockFailed = false;
  /** historia ruchu Y do wykrywania szarpnięcia */
  private moveHistory: { t: number; dy: number }[] = [];
  /** gdy false, gra ignoruje wejście (np. menu) */
  enabled = true;
  onLockChange: ((locked: boolean) => void) | null = null;
  /** true gdy odblokowanie wywołaliśmy sami (nie ESC) */
  private selfUnlock = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (['Tab', 'F1', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.lockFailed) return; // pierwszy klik tylko przechwytuje kursor
      this.mouseButtons.add(e.button);
      this.mousePressed.add(e.button);
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseButtons.delete(e.button)) this.mouseReleased.add(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.lockFailed) return;
      const dx = e.movementX;
      const dy = e.movementY;
      // odrzucenie skoków niektórych przeglądarek po zablokowaniu kursora
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.lookDX += dx;
      this.lookDY += dy;
      this.aimDX += dx;
      this.aimDY += dy;
      this.moveHistory.push({ t: performance.now(), dy });
      if (this.moveHistory.length > 64) this.moveHistory.shift();
    });
    window.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.mouseButtons.clear();
      }
      const self = this.selfUnlock;
      this.selfUnlock = false;
      if (!self || this.locked) this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    if (this.locked || this.lockFailed) return;
    try {
      if (!this.canvas.requestPointerLock) {
        this.lockFailed = true;
        return;
      }
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function')
        p.catch((err: unknown) => {
          // ESC-cooldown przeglądarki to nie brak wsparcia; blokada ramki (sandbox) – tak
          if (err instanceof DOMException && (err.name === 'NotSupportedError' || err.name === 'SecurityError')) this.lockFailed = true;
        });
    } catch {
      this.lockFailed = true;
    }
  }

  exitLock(): void {
    if (!this.locked) return;
    this.selfUnlock = true;
    document.exitPointerLock();
  }

  consumePress(code: string): boolean {
    if (!this.enabled) return false;
    return this.pressed.delete(code);
  }

  held(code: string): boolean {
    return this.enabled && this.keys.has(code);
  }

  mouseHeld(button: number): boolean {
    return this.enabled && this.mouseButtons.has(button);
  }

  consumeMousePress(button: number): boolean {
    if (!this.enabled) return false;
    return this.mousePressed.delete(button);
  }

  consumeMouseRelease(button: number): boolean {
    return this.mouseReleased.delete(button);
  }

  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return this.enabled ? r : { dx: 0, dy: 0 };
  }

  consumeAim(): { dx: number; dy: number } {
    const r = { dx: this.aimDX, dy: this.aimDY };
    this.aimDX = 0;
    this.aimDY = 0;
    return this.enabled ? r : { dx: 0, dy: 0 };
  }

  consumeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return this.enabled ? w : 0;
  }

  /** Suma ruchu myszy w dół w ostatnich `ms` milisekundach. */
  recentDownMotion(ms: number): number {
    const now = performance.now();
    let s = 0;
    for (const m of this.moveHistory) if (now - m.t <= ms) s += m.dy;
    return s;
  }

  clearMotionHistory(): void {
    this.moveHistory.length = 0;
  }

  /** Czyści krawędzie, które nie zostały skonsumowane (wywołać raz na klatkę po logice). */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.mouseReleased.clear();
  }

  /** Symulacja wejścia (testy / debug). */
  simulateKey(code: string, down: boolean): void {
    if (down) {
      this.keys.add(code);
      this.pressed.add(code);
    } else {
      this.keys.delete(code);
      this.released.add(code);
    }
  }

  simulateMouse(button: number, down: boolean): void {
    if (down) {
      this.mouseButtons.add(button);
      this.mousePressed.add(button);
    } else {
      this.mouseButtons.delete(button);
      this.mouseReleased.add(button);
    }
  }
}
