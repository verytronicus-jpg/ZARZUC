export interface StateHandlers<S extends string> {
  enter?: (prev: S | null) => void;
  exit?: (next: S) => void;
  update?: (dt: number, time: number) => void;
  /** limit czasu w stanie [s] (liczba lub funkcja liczona przy wejściu) */
  timeout?: number | (() => number);
  onTimeout?: () => void;
}

/** Prosta maszyna stanów z czasem w stanie i timeoutami. */
export class StateMachine<S extends string> {
  state: S;
  prev: S | null = null;
  /** czas w bieżącym stanie [s] */
  time = 0;
  private timeoutAt = Infinity;
  private handlers: Partial<Record<S, StateHandlers<S>>>;
  private listeners: Array<(next: S, prev: S) => void> = [];
  private started = false;

  constructor(initial: S, handlers: Partial<Record<S, StateHandlers<S>>> = {}) {
    this.state = initial;
    this.handlers = handlers;
  }

  setHandlers(handlers: Partial<Record<S, StateHandlers<S>>>): void {
    this.handlers = handlers;
  }

  onChange(fn: (next: S, prev: S) => void): void {
    this.listeners.push(fn);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.enterState(null);
  }

  is(...states: S[]): boolean {
    return states.includes(this.state);
  }

  go(next: S): void {
    const prev = this.state;
    this.handlers[prev]?.exit?.(next);
    this.prev = prev;
    this.state = next;
    this.enterState(prev);
    for (const l of this.listeners) l(next, prev);
  }

  private enterState(prev: S | null): void {
    this.time = 0;
    const h = this.handlers[this.state];
    const t = h?.timeout;
    this.timeoutAt = t === undefined ? Infinity : typeof t === 'function' ? t() : t;
    h?.enter?.(prev);
  }

  /** Wydłuża/ustawia timeout bieżącego stanu (liczony od wejścia). */
  setTimeout(seconds: number): void {
    this.timeoutAt = seconds;
  }

  get timeLeft(): number {
    return this.timeoutAt - this.time;
  }

  update(dt: number): void {
    if (!this.started) this.start();
    this.time += dt;
    const current = this.state;
    this.handlers[current]?.update?.(dt, this.time);
    if (this.state === current && this.time >= this.timeoutAt) {
      const h = this.handlers[current];
      this.timeoutAt = Infinity;
      h?.onTimeout?.();
    }
  }
}
