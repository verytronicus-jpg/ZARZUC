import * as THREE from 'three';

/**
 * Tekstury gry (public/textures – generowane przez scripts/prepare_images.py albo z reference/03-tekstury).
 * Obiekty Texture istnieją od startu (stałe referencje w materiałach); obraz dochodzi asynchronicznie.
 * `texturesReady` – stan BOOT czeka na wczytanie przed pokazaniem świata.
 */
export type TexName = 'grass' | 'forest' | 'path' | 'sand' | 'bed' | 'rock' | 'wood' | 'bark' | 'waterNormal' | 'noise';

const FILES: Record<TexName, { url: string; color: boolean }> = {
  grass: { url: 'textures/grass.jpg', color: true },
  forest: { url: 'textures/forest.jpg', color: true },
  path: { url: 'textures/path.jpg', color: true },
  sand: { url: 'textures/sand.jpg', color: true },
  bed: { url: 'textures/bed.jpg', color: true },
  rock: { url: 'textures/rock.jpg', color: true },
  wood: { url: 'textures/wood.jpg', color: false },
  bark: { url: 'textures/bark.jpg', color: false },
  waterNormal: { url: 'textures/water_normal.png', color: false },
  noise: { url: 'textures/noise.png', color: false },
};

const cache = new Map<TexName, THREE.Texture>();
const pending: Promise<void>[] = [];
const loader = new THREE.TextureLoader();

function create(name: TexName): THREE.Texture {
  const f = FILES[name];
  let done: () => void = () => {};
  pending.push(new Promise<void>((r) => (done = r)));
  const t = loader.load(
    f.url,
    () => done(),
    undefined,
    () => {
      console.warn(`[textures] Nie udało się wczytać ${f.url}`);
      done();
    },
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = f.color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.name = name;
  return t;
}

export function tex(name: TexName): THREE.Texture {
  let t = cache.get(name);
  if (!t) {
    t = create(name);
    cache.set(name, t);
  }
  return t;
}

/** Wczytuje wszystkie tekstury (wywołać raz na starcie). */
export function preloadTextures(): Promise<void> {
  for (const n of Object.keys(FILES) as TexName[]) tex(n);
  return Promise.all(pending).then(() => undefined);
}
