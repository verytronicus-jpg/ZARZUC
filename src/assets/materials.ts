import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Współdzielone materiały (mniej przełączeń stanu, mniej pamięci). */
export function mat(
  color: number,
  roughness = 0.85,
  metalness = 0,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${metalness}|${JSON.stringify(extra)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    cache.set(key, m);
  }
  return m;
}

export function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  opts: { cast?: boolean; receive?: boolean; name?: string } = {},
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  if (opts.name) m.name = opts.name;
  return m;
}

/** Walec wzdłuż osi Z (od z=0 do z=len). */
export function cylZ(r0: number, r1: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

/** Kapsuła wisząca w dół od punktu (0,0,0) do (0,-len,0). */
export function limb(radius: number, len: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 2), 4, 10);
  g.translate(0, -len / 2, 0);
  return g;
}

export function group(name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/**
 * Optymalizacja draw calli: w każdej grupie scala bezpośrednie dzieci-siatki o tym samym materiale
 * (pivoty/stawy zostają nietknięte, więc animacje działają dalej).
 */
export function mergeStaticChildren(root: THREE.Object3D): THREE.Object3D {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => groups.push(o));
  for (const parent of groups) {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || m.children.length > 0 || Array.isArray(m.material) || (m as THREE.InstancedMesh).isInstancedMesh) continue;
      const list = byMat.get(m.material) ?? [];
      list.push(m);
      byMat.set(m.material, list);
    }
    for (const [material, list] of byMat) {
      if (list.length < 2) continue;
      const geos: THREE.BufferGeometry[] = [];
      let ok = true;
      for (const m of list) {
        m.updateMatrix();
        const g = m.geometry.clone().applyMatrix4(m.matrix);
        if (!g.index) {
          ok = false;
          break;
        }
        geos.push(g);
      }
      if (!ok) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, material);
      mm.castShadow = list.some((m) => m.castShadow);
      mm.receiveShadow = list.some((m) => m.receiveShadow);
      mm.name = `${parent.name || 'group'}_merged`;
      for (const m of list) parent.remove(m);
      parent.add(mm);
    }
  }
  return root;
}
