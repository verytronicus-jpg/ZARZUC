export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
export const DEG = Math.PI / 180;

/** Wygładzanie wykładnicze niezależne od dt. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

export const dampAngle = (a: number, b: number, rate: number, dt: number): number =>
  a + wrapAngle(b - a) * (1 - Math.exp(-rate * dt));

/** Fala trójkątna 0→1→0 o okresie 2·half. */
export const triangle = (t: number, half: number): number => {
  const p = (t / half) % 2;
  return p < 1 ? p : 2 - p;
};

/** Formatowanie liczby po polsku (przecinek dziesiętny). */
export const fmt = (v: number, digits = 1): string => v.toFixed(digits).replace('.', ',');

export const fmtWeight = (grams: number): string =>
  grams >= 1000 ? `${fmt(grams / 1000, 2)} kg` : `${Math.round(grams)} g`;
