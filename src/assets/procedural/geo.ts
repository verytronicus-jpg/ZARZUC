/**
 * Pomocnicze funkcje do budowy geometrii proceduralnych (kolory wierzchołków, zaburzenia, normalne
 * „uwypuklone” dla miękkiego, malarskiego cieniowania roślin, scalanie).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rng } from '../../core/Rng';

const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/** Geometria bez indeksu i bez UV (dla scalania z kolorami). */
export function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const o = g.index ? g.toNonIndexed() : g;
  if (o.attributes.uv) o.deleteAttribute('uv');
  if (o.attributes.uv1) o.deleteAttribute('uv1');
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
}

/** Kolory wierzchołków z funkcji pozycji i normalnej. */
export function paint(
  g: THREE.BufferGeometry,
  fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color, i: number) => void,
): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i);
    if (nor) tmpN.fromBufferAttribute(nor, i);
    else tmpN.set(0, 1, 0);
    tmpC.setRGB(1, 1, 1);
    fn(tmpV, tmpN, tmpC, i);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function solid(g: THREE.BufferGeometry, hex: number | THREE.Color): THREE.BufferGeometry {
  const c = typeof hex === 'number' ? new THREE.Color(hex) : hex;
  return paint(g, (_p, _n, out) => out.copy(c));
}

/** Losowe przesunięcie wierzchołków (spójne dla wierzchołków w tym samym miejscu). */
export function jitter(g: THREE.BufferGeometry, rng: Rng, amount: number, yAmount = amount): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = seen.get(key);
    if (!d) {
      d = [rng.range(-1, 1) * amount, rng.range(-1, 1) * yAmount, rng.range(-1, 1) * amount];
      seen.set(key, d);
    }
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  pos.needsUpdate = true;
  return g;
}

/**
 * Normalne „od środka” (sfera/elipsoida) – miękkie, malarskie cieniowanie koron i krzaków
 * zamiast fasetek. `mix` = 1 → w pełni sferyczne, 0 → bez zmian.
 */
export function spherify(g: THREE.BufferGeometry, center: THREE.Vector3, yScale = 1, mix = 1): THREE.BufferGeometry {
  const pos = g.attributes.position;
  let nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  if (!nor) {
    g.computeVertexNormals();
    nor = g.attributes.normal as THREE.BufferAttribute;
  }
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i).sub(center);
    tmpV.y *= yScale;
    tmpV.normalize();
    tmpN.fromBufferAttribute(nor, i).lerp(tmpV, mix).normalize();
    nor.setXYZ(i, tmpN.x, tmpN.y, tmpN.z);
  }
  nor.needsUpdate = true;
  return g;
}

/** Normalne od osi pionowej (x,z) z lekkim nachyleniem w górę – korony drzew iglastych. */
export function axisNormals(g: THREE.BufferGeometry, up = 0.35, mix = 1): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    tmpV.set(pos.getX(i), 0, pos.getZ(i));
    if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 1, 0);
    tmpV.normalize();
    tmpV.y = up;
    tmpV.normalize();
    tmpN.fromBufferAttribute(nor, i).lerp(tmpV, mix).normalize();
    nor.setXYZ(i, tmpN.x, tmpN.y, tmpN.z);
  }
  nor.needsUpdate = true;
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const f = flat(p);
    if (!f.attributes.color) solid(f, 0xffffff);
    return f;
  });
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('[geo] Nie udało się scalić geometrii');
  m.computeBoundingSphere();
  m.computeBoundingBox();
  return m;
}

/** Trójkąty z listy punktów (wachlarz / pasy) – pomocniczo do liści, płetw itp. */
function triangles(points: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Pas czworokątów z listy przekrojów (każdy przekrój = tablica punktów w poprzek).
 * Wszystkie przekroje muszą mieć tyle samo punktów.
 */
export function loft(sections: THREE.Vector3[][]): THREE.BufferGeometry {
  const pts: number[] = [];
  for (let s = 0; s < sections.length - 1; s++) {
    const a = sections[s];
    const b = sections[s + 1];
    for (let k = 0; k < a.length - 1; k++) {
      const p00 = a[k];
      const p01 = a[k + 1];
      const p10 = b[k];
      const p11 = b[k + 1];
      pts.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z);
      pts.push(p01.x, p01.y, p01.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z);
    }
  }
  return triangles(pts);
}

export const C = (hex: number) => new THREE.Color(hex);
