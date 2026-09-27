export interface StartScreenFish {
  name: string;
  lat: string;
  rar: string;
  rc: string;
  sx: number;
  sy: number;
  spiky?: boolean;
  whisk?: boolean;
  caught?: boolean;
  record?: string;
  /** ilustracja gatunku (PNG/WebP z przezroczystym tłem); bez niej – sylwetka SVG */
  img?: string;
}

export interface StartScreenOptions {
  title: string;
  tagline: string;
  /** domena w stopce */
  domain?: string;
  species: StartScreenFish[];
  /** klik „Zacznij łowić” (w obsłudze gestu użytkownika – można tu odblokować dźwięk gry) */
  onCastStart?: () => void;
  /** koniec animacji zarzucenia i paska ładowania */
  onStart?: () => void;
  onOptions?: (o: { nature?: number; sfx?: boolean; quality?: 'high' | 'low' }) => void;
}

export interface StartScreenHandle {
  root: HTMLElement;
  destroy(): void;
}

export function mountStartScreen(opts: StartScreenOptions): StartScreenHandle;
