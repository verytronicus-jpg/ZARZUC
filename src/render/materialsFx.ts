import * as THREE from 'three';
import { CFG } from '../config';
import { tex } from './textures';

/**
 * Rozszerzenia materiałów standardowych (onBeforeCompile) – „malowane” detale bez UV:
 * - terrainMaterial: mieszanie 6 tekstur (trawa, ściółka, ścieżka, piasek, dno, skała) wg wag w wierzchołkach,
 *   anty-kafelkowanie (dwie skale + szum), w oddali przejście w kolor wierzchołka;
 * - triplanarDetail: szary detal (słoje drewna, kora, skała) rzutowany z trzech osi i mnożony przez kolor.
 */

const WORLD_VARYINGS_VS = /* glsl */ `
  #ifdef USE_INSTANCING
    vec4 fxWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
    vec3 fxNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
    vec4 fxWorld = modelMatrix * vec4(transformed, 1.0);
    vec3 fxNormal = normalize(mat3(modelMatrix) * objectNormal);
  #endif
  vFxWorld = fxWorld.xyz;
  vFxNormal = fxNormal;
`;

export function terrainMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const T = CFG.terrainTex;
  const uniforms = {
    tGrass: { value: tex('grass') },
    tForest: { value: tex('forest') },
    tPath: { value: tex('path') },
    tSand: { value: tex('sand') },
    tBed: { value: tex('bed') },
    tRock: { value: tex('rock') },
    tNoise: { value: tex('noise') },
    uTiling: { value: new THREE.Vector4(T.grassTiling, T.forestTiling, T.pathTiling, T.sandTiling) },
    uTiling2: { value: new THREE.Vector2(T.bedTiling, T.rockTiling) },
    uFar: { value: new THREE.Vector2(T.fadeStart, T.fadeEnd) },
    uCenter: { value: new THREE.Vector2(T.centerX, T.centerZ) },
    uTint: { value: T.tint },
    uWet: { value: new THREE.Vector2(CFG.water.level, T.wetAbove) },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute vec4 aSplatA;
         attribute vec3 aSplatB;
         varying vec4 vSplatA;
         varying vec3 vSplatB;
         varying vec3 vFxWorld;
         varying vec3 vFxNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vSplatA = aSplatA;
         vSplatB = aSplatB;`,
      )
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${WORLD_VARYINGS_VS}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D tGrass, tForest, tPath, tSand, tBed, tRock, tNoise;
         uniform vec4 uTiling;
         uniform vec2 uTiling2;
         uniform vec2 uFar;
         uniform vec2 uCenter;
         uniform float uTint;
         uniform vec2 uWet;
         varying vec4 vSplatA;
         varying vec3 vSplatB;
         varying vec3 vFxWorld;
         varying vec3 vFxNormal;
         vec3 samp2(sampler2D t, vec2 p, float s) {
           // dwie skale + obrót drugiej: mniej widoczne kafelki
           vec3 a = texture2D(t, p * s).rgb;
           vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p * s * 0.37 + 0.31;
           vec3 b = texture2D(t, q).rgb;
           float n = texture2D(tNoise, p * 0.013).b;
           return mix(a, b, smoothstep(0.35, 0.65, n) * 0.55);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec2 p = vFxWorld.xz;
           vec4 wa = vSplatA;
           vec2 wb = vSplatB.xy;
           float sum = wa.x + wa.y + wa.z + wa.w + wb.x + wb.y + 1e-4;
           vec3 alb = vec3(0.0);
           if (wa.x > 0.01) alb += samp2(tGrass, p, uTiling.x) * wa.x;
           if (wa.y > 0.01) alb += samp2(tForest, p, uTiling.y) * wa.y;
           if (wa.z > 0.01) alb += samp2(tPath, p, uTiling.z) * wa.z;
           if (wa.w > 0.01) alb += samp2(tSand, p, uTiling.w) * wa.w;
           if (wb.x > 0.01) alb += samp2(tBed, p, uTiling2.x) * wb.x;
           if (wb.y > 0.01) alb += samp2(tRock, p, uTiling2.y) * wb.y;
           alb /= sum;
           // kolor wierzchołka = odcień/jasność lokalna; w oddali sam kolor wierzchołka
           float lumV = dot(vColor.rgb, vec3(0.3, 0.55, 0.15));
           vec3 tinted = alb * mix(vec3(1.0), vColor.rgb / max(lumV, 0.05) * 0.5 + 0.5, uTint);
           float far = smoothstep(uFar.x, uFar.y, length(p - uCenter));
           // las poza obszarem gry: ciemne korony z fakturą ściółki zamiast jasnej trawy
           float canopy = max(far, vSplatB.z * 0.9);
           float lumT = dot(alb, vec3(0.3, 0.55, 0.15));
           diffuseColor.rgb = mix(tinted, vColor.rgb * mix(1.0, 0.55 + lumT * 1.6, 1.0 - far), canopy);
           // mokry brzeg i dno: ciemniej i bardziej nasycone przy linii wody i pod nią
           float wet = 1.0 - smoothstep(uWet.x - 0.6, uWet.x + uWet.y, vFxWorld.y);
           diffuseColor.rgb = mix(diffuseColor.rgb, pow(diffuseColor.rgb, vec3(1.25)) * 0.72, wet);
         }`,
      );
  };
  m.customProgramCacheKey = () => 'terrain-splat-v3';
  return m;
}

/**
 * Detal trójplanarny (szary, średnio ~0,8) mnożony przez kolor materiału.
 * `horizontalGrain` – słoje wzdłuż poziomu (bale, deski) zamiast pionowo.
 */
export function triplanarDetail<T extends THREE.MeshStandardMaterial>(
  m: T,
  name: 'wood' | 'bark' | 'rock',
  scale: number,
  strength: number,
  horizontalGrain = true,
): T {
  const prev = m.onBeforeCompile;
  const uniforms = {
    tDetail: { value: tex(name) },
    uDetailScale: { value: scale },
    uDetailStrength: { value: strength },
  };
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (!shader.vertexShader.includes('vFxWorld')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFxWorld;\nvarying vec3 vFxNormal;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${WORLD_VARYINGS_VS}`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFxWorld;\nvarying vec3 vFxNormal;');
    }
    const swz = horizontalGrain ? 'yx' : 'xy';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nuniform float uDetailScale;\nuniform float uDetailStrength;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 w = pow(abs(normalize(vFxNormal)), vec3(4.0));
           w /= (w.x + w.y + w.z + 1e-4);
           vec3 p = vFxWorld * uDetailScale;
           float dx = texture2D(tDetail, p.zy.${swz}).r;
           float dy = texture2D(tDetail, p.xz).r;
           float dz = texture2D(tDetail, p.xy.${swz}).r;
           float det = dx * w.x + dy * w.y + dz * w.z;
           diffuseColor.rgb *= mix(1.0, det / 0.8, uDetailStrength);
         }`,
      );
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|tri-${name}-${horizontalGrain}`;
  return m;
}
