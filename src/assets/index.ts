import { AssetRegistry, type AssetFactory } from './AssetRegistry';
import { mergeStaticChildren } from './materials';
import { CharacterFactory } from './procedural/character';
import { RodFactory, FloatFactory, HookFactory, WormFactory, WormBoxFactory } from './procedural/tackle';
import { FishFactory } from './procedural/fish';
import { CabinFactory, BoatFactory } from './procedural/cabin';
import { CabinInteriorFactory } from './procedural/interior';
import { PovHandFactory } from './procedural/povHand';
import {
  SpruceFactory,
  FarTreeFactory,
  PineFactory,
  BirchFactory,
  WillowFactory,
  BushFactory,
  FernFactory,
  ReedFactory,
  CattailFactory,
  LilyFactory,
  RockFactory,
  StumpFactory,
  FallenLogFactory,
} from './procedural/nature';

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
  // świat (chatka/łódka: części scalone w fabryce; roślinność: jedna siatka → InstancedMesh)
  r.register('cabin', new CabinFactory());
  r.register('cabinInterior', new CabinInteriorFactory());
  r.register('povHand', new PovHandFactory());
  r.register('boat', new BoatFactory());
  r.register('spruceNear', new SpruceFactory('near'));
  r.register('spruceMid', new SpruceFactory('mid'));
  r.register('farTree', new FarTreeFactory());
  r.register('pine', new PineFactory());
  r.register('birch', new BirchFactory());
  r.register('willow', new WillowFactory());
  r.register('bush', new BushFactory());
  r.register('fern', new FernFactory());
  r.register('reeds', new ReedFactory());
  r.register('cattail', new CattailFactory());
  r.register('lily', new LilyFactory());
  r.register('rock', new RockFactory());
  r.register('stump', new StumpFactory());
  r.register('fallenLog', new FallenLogFactory());
  return r;
}
