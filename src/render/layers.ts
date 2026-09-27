/**
 * Warstwy obiektów (THREE.Layers).
 * Kamera gracza renderuje scenę w dwóch przebiegach: warstwa 0 (wszystko nieprzezroczyste i większość efektów),
 * potem WATER_LAYER (tafla – korzysta z kopii koloru i głębi pierwszego przebiegu) i FX_LAYER (efekty na wodzie).
 */
/** Obiekty widoczne tylko dla kamer cieni (np. siatki-cienie roślinności blisko gracza). */
export const SHADOW_LAYER = 1;
/** Tafla wody (drugi przebieg). */
export const WATER_LAYER = 2;
/** Obiekty odbijające się w wodzie (kamera lustrzana renderuje tylko tę warstwę). */
export const REFLECT_LAYER = 3;
/** Efekty rysowane po wodzie (kręgi, plusk, mgiełka). */
export const FX_LAYER = 4;

import type { Object3D } from 'three';

/** Włącza odbicie w wodzie dla obiektu i jego dzieci. */
export function reflectable(o: Object3D): Object3D {
  o.traverse((c) => c.layers.enable(REFLECT_LAYER));
  return o;
}

/** Przenosi obiekt (i dzieci) wyłącznie na daną warstwę. */
export function onlyLayer(o: Object3D, layer: number): Object3D {
  o.traverse((c) => c.layers.set(layer));
  return o;
}
