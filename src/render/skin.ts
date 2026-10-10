import * as THREE from 'three';
import { ZONES } from '../core/score';
import { ZoneMask, zoneHighlight } from '../face/zoneMask';
import { buildFaceMesh, type Landmark3 } from '../face/mesh';
import type { Pt } from '../face/geometry';
import type { FaceSkin } from './target';

/**
 * 切り抜きテクスチャとマスクから、的に貼る見た目一式を作る。
 * 奥行き付きのランドマークがあれば立体のお面メッシュ、無ければ板（サンプル顔・旧データ）。
 */
export function createFaceSkin(
  texture: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  landmarks?: readonly (Pt | Landmark3)[],
): FaceSkin {
  const tex = new THREE.CanvasTexture(texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mask = ZoneMask.fromCanvas(maskCanvas);
  const highlights = Object.fromEntries(ZONES.map((z) => [z, new THREE.CanvasTexture(zoneHighlight(mask, z))]));
  const geometry = has3d(landmarks) ? faceGeometry(landmarks) : undefined;
  return { texture: tex, mask, highlights, geometry };
}

export function has3d(lm: readonly (Pt | Landmark3)[] | undefined): lm is readonly Landmark3[] {
  return !!lm && lm.length >= 468 && lm.every((p) => typeof (p as Landmark3).z === 'number');
}

function faceGeometry(lm: readonly Landmark3[]): THREE.BufferGeometry {
  const m = buildFaceMesh(lm);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  for (const gr of m.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function disposeFaceSkin(s: FaceSkin): void {
  s.texture.dispose();
  s.geometry?.dispose();
  for (const t of Object.values(s.highlights ?? {})) t?.dispose();
}
