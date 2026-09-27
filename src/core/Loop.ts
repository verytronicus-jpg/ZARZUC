import { CFG } from '../config';

/**
 * Pętla gry: fizyka w stałym kroku (akumulator), render z interpolacją (alpha ∈ [0,1)).
 */
export class Loop {
  timeScale = 1;
  /** czas symulacji [s] */
  simTime = 0;
  running = false;
  fps = 60;
  private acc = 0;
  private last = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private fixedUpdate: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  frame(now: number): void {
    const step = CFG.loop.step;
    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (!(frameDt >= 0)) frameDt = 0;
    frameDt = Math.min(frameDt, CFG.loop.maxFrame);

    this.fpsAcc += frameDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.acc += frameDt * this.timeScale;
    let n = 0;
    while (this.acc >= step && n < CFG.loop.maxSubSteps) {
      this.fixedUpdate(step);
      this.simTime += step;
      this.acc -= step;
      n++;
    }
    if (n >= CFG.loop.maxSubSteps) this.acc = 0; // spiral-of-death guard
    this.render(this.acc / step, frameDt);
  }

  /** czas do renderu: interpolowany między krokami */
  renderTime(alpha: number): number {
    return this.simTime + (alpha - 1) * CFG.loop.step;
  }
}
