/**
 * SKALARNY MODEL NAPIĘCIA ŻYŁKI (serce holu). Czysta logika – testowana w Vitest.
 *
 *  d  – odległość szczytówka → ryba (z wędki NIEugiętej; ugięcie siedzi w k_eff)
 *  L  – wypuszczona żyłka
 *  s  = d − L (rozciągnięcie); s ≤ 0 → żyłka luźna, T = 0
 *  T  = k_eff·s + c·ds/dt,   k_eff = szeregowo(k_wędki, EA/L)
 *  Hamulec: gdy T > hamulec, szpula oddaje żyłkę (L rośnie tak, by T = hamulec),
 *           z niewielką bezwładnością szpuli → ostre zrywy chwilowo przebijają hamulec.
 *  Zerwanie: T > wytrzymałość dłużej niż snapTime.
 */
export interface TensionParams {
  kRod: number;
  ea: number;
  damping: number;
  strengthN: number;
  snapTime: number;
  spoolAccel: number;
  spoolMaxSpeed: number;
  spoolFriction: number;
  reelSpeed: number;
  /** minimalna długość żyłki (nie da się zwinąć poniżej) */
  minLine: number;
}

export interface TensionStep {
  T: number;
  slipping: boolean;
  /** prędkość oddawania żyłki przez hamulec [m/s] */
  payout: number;
  snapped: boolean;
}

export class TensionModel {
  L = 0;
  T = 0;
  sPrev = 0;
  spoolV = 0;
  overTime = 0;
  slackTime = 0;
  snapped = false;
  slipping = false;
  payout = 0;
  dragN: number;

  constructor(
    public p: TensionParams,
    dragN: number,
  ) {
    this.dragN = dragN;
  }

  reset(L: number, d: number): void {
    this.L = L;
    this.sPrev = d - L;
    this.T = 0;
    this.spoolV = 0;
    this.overTime = 0;
    this.slackTime = 0;
    this.snapped = false;
    this.slipping = false;
    this.payout = 0;
  }

  /** sztywność zastępcza: wędka i żyłka połączone szeregowo */
  kEff(stiffMul = 1, L = this.L): number {
    const kr = this.p.kRod * stiffMul;
    const kl = this.p.ea / Math.max(L, 0.05);
    return 1 / (1 / kr + 1 / kl);
  }

  private tensionFor(s: number, k: number, dt: number): number {
    if (s <= 0) return 0;
    return Math.max(0, k * s + (this.p.damping * (s - this.sPrev)) / dt);
  }

  step(d: number, dt: number, reeling: boolean, stiffMul = 1): TensionStep {
    const p = this.p;
    if (this.snapped) return { T: 0, slipping: false, payout: 0, snapped: true };

    // 1. zwijanie (może zostać zniwelowane przez poślizg hamulca)
    if (reeling) this.L = Math.max(p.minLine, this.L - p.reelSpeed * dt);

    // 2. napięcie "surowe"
    let k = this.kEff(stiffMul);
    let s = d - this.L;
    let T = this.tensionFor(s, k, dt);

    // 3. hamulec z bezwładnością szpuli
    let released = 0;
    if (T > this.dragN) {
      // rozciągnięcie, przy którym T == hamulec (uwzględnia człon tłumienia)
      const sTarget = (this.dragN + (p.damping * this.sPrev) / dt) / (k + p.damping / dt);
      const need = Math.max(0, s - sTarget);
      this.spoolV = Math.min(p.spoolMaxSpeed, this.spoolV + p.spoolAccel * dt);
      released = Math.min(need, this.spoolV * dt);
      if (released >= need - 1e-9) this.spoolV = Math.min(this.spoolV, need / dt);
      this.L += released;
      k = this.kEff(stiffMul);
      s = d - this.L;
      T = this.tensionFor(s, k, dt);
    } else {
      this.spoolV = Math.max(0, this.spoolV - p.spoolFriction * dt);
    }
    this.slipping = released > 1e-6;
    this.payout = released / dt;
    this.sPrev = s;
    this.T = T;

    // 4. zerwanie
    if (T > p.strengthN) {
      this.overTime += dt;
      if (this.overTime > p.snapTime) {
        this.snapped = true;
        this.T = 0;
      }
    } else {
      this.overTime = 0;
    }

    // 5. luźna żyłka
    if (T <= 1e-3) this.slackTime += dt;
    else this.slackTime = 0;

    return { T: this.T, slipping: this.slipping, payout: this.payout, snapped: this.snapped };
  }
}

/** Szansa spięcia ryby w tym kroku przy luźnej żyłce. */
export function slackEscapeProbability(slackTime: number, threshold: number, perSecond: number, dt: number): number {
  if (slackTime <= threshold) return 0;
  return 1 - Math.pow(1 - perSecond, dt);
}
