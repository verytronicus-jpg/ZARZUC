import { AssetRegistry, type AssetFactory } from './AssetRegistry';
import { mergeStaticChildren } from './materials';
import { CharacterFactory } from './procedural/character';
import { RodFactory, FloatFactory, HookFactory, WormFactory, WormBoxFactory } from './procedural/tackle';
import { FishFactory } from './procedural/fish';

/** Fabryka proceduralna + scalanie statycznych części (mniej draw calli). */
function optimized(f: AssetFactory): AssetFactory {
  return { create: (opts) => mergeStaticChildren(f.create(opts)) };
}

/** Rejestruje fabryki proceduralne. Podmiana na GLB: patrz README ("Modele z Blendera"). */
export function createDefaultRegistry(): AssetRegistry {
  const r = new AssetRegistry();
  r.register('character', optimized(new CharacterFactory()));
  r.register('rod', optimized(new RodFactory()));
  r.register('float', optimized(new FloatFactory()));
  r.register('hook', optimized(new HookFactory()));
  r.register('worm', new WormFactory());
  r.register('wormBox', optimized(new WormBoxFactory()));
  r.register('fish', new FishFactory());
  return r;
}
