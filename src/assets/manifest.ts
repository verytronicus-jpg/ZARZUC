import { CFG, type SpeciesId } from '../config';
import { PIVOTS, type AssetKind, type AssetRegistry } from './AssetRegistry';

/**
 * Modele z Blendera: `public/models/manifest.json` wskazuje pliki GLB, które zastępują fabryki proceduralne.
 *
 * ```json
 * { "models": {
 *     "character": { "url": "models/character.glb" },
 *     "rod": { "url": "models/rod.glb", "scale": 1 },
 *     "fish:okon": { "url": "models/okon.glb" }
 * } }
 * ```
 * Klucz = rodzaj z AssetKind (ryby: `fish:<gatunek>`, skala = długość 1 m). Model bez wymaganych pivotów
 * (nazwy z PIVOTS) albo nieudane wczytanie → zostaje model proceduralny (ostrzeżenie w konsoli).
 */
interface ModelEntry {
  url: string;
  scale?: number;
}

/** Pivoty, bez których gra nie może używać modelu danego rodzaju. */
export const REQUIRED_PIVOTS: Partial<Record<AssetKind, string[]>> = {
  character: [
    PIVOTS.hips, PIVOTS.spine, PIVOTS.neck, PIVOTS.head,
    PIVOTS.upperarmL, PIVOTS.forearmL, PIVOTS.handL, PIVOTS.upperarmR, PIVOTS.forearmR, PIVOTS.handR,
    PIVOTS.thighL, PIVOTS.shinL, PIVOTS.footL, PIVOTS.thighR, PIVOTS.shinR, PIVOTS.footR,
  ],
  rod: [PIVOTS.rodTip, PIVOTS.reel, ...Array.from({ length: CFG.rod.tipSegments }, (_, i) => PIVOTS.rodSegment(i))],
  float: [PIVOTS.floatTop],
  fish: [PIVOTS.mouth],
  cabin: [PIVOTS.doorFront, PIVOTS.doorLatch, PIVOTS.chimneyTop],
};

export async function applyModelManifest(registry: AssetRegistry, url = 'models/manifest.json'): Promise<string[]> {
  let models: Record<string, ModelEntry> = {};
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: Record<string, ModelEntry> };
    models = json.models ?? {};
  } catch {
    return [];
  }
  const loaded: string[] = [];
  await Promise.all(
    Object.entries(models).map(async ([key, entry]) => {
      const [kind, species] = key.split(':') as [AssetKind, SpeciesId | undefined];
      try {
        const ok = await registry.loadGLB(kind, entry.url, entry.scale ?? 1, { species, required: REQUIRED_PIVOTS[kind] ?? [] });
        if (ok) loaded.push(key);
      } catch (err) {
        console.warn(`[modele] Nie udało się wczytać ${entry.url} (${key}) – zostaje model proceduralny`, err);
      }
    }),
  );
  if (loaded.length) console.info(`[modele] GLB: ${loaded.join(', ')}`);
  return loaded;
}
