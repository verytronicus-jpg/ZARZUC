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
/** Podgląd spławika w rogu: tylko spławik, żyłka, ryba i niebo (+ woda z WATER_LAYER) – nie cała scena. */
export const PIP_LAYER = 5;

import type { Object3D } from 'three';

/** Włącza odbicie w wodzie dla obiektu i jego dzieci. */
export function reflectable(o: Object3D): Object3D {
  o.traverse((c) => c.layers.enable(REFLECT_LAYER));
  return o;
}

/** Dodaje obiekt (i dzieci) do podglądu spławika. */
export function pipVisible(o: Object3D): Object3D {
  o.traverse((c) => c.layers.enable(PIP_LAYER));
  return o;
}
