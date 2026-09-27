import { AssetRegistry, type AssetFactory } from './AssetRegistry';
import { mergeStaticChildren } from './materials';
import { CharacterFactory } from './procedural/character';
import { RodFactory, FloatFactory, HookFactory, WormFactory, WormBoxFactory } from './procedural/tackle';
import { FishFactory } from './procedural/fish';
import { CabinFactory, BoatFactory } from './procedural/cabin';
import { CabinInteriorFactory } from './procedural/interior';
import { PovHandFactory } from './procedural/povHand';
import { SpruceCardFactory, PineCardFactory, BirchCardFactory, WillowCardFactory, BushCardFactory, FernCardFactory } from './procedural/foliage';
import {
  FarTreeFactory,
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
  r.register('character', new CharacterFactory());
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
  r.register('spruceNear', new SpruceCardFactory('near'));
  r.register('spruceMid', new SpruceCardFactory('mid'));
  r.register('farTree', new FarTreeFactory());
  r.register('pine', new PineCardFactory());
  r.register('birch', new BirchCardFactory());
  r.register('willow', new WillowCardFactory());
  r.register('bush', new BushCardFactory());
  r.register('fern', new FernCardFactory());
  r.register('reeds', new ReedFactory());
  r.register('cattail', new CattailFactory());
  r.register('lily', new LilyFactory());
  r.register('rock', new RockFactory());
  r.register('stump', new StumpFactory());
  r.register('fallenLog', new FallenLogFactory());
  return r;
}
