import * as THREE from 'three';
import { ZONES } from '../core/score';
import { ZoneMask, zoneHighlight } from '../face/zoneMask';
import type { FaceSkin } from './target';

/** 切り抜きテクスチャとマスクから、的に貼る見た目一式を作る */
export function createFaceSkin(texture: HTMLCanvasElement, maskCanvas: HTMLCanvasElement): FaceSkin {
  const tex = new THREE.CanvasTexture(texture);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mask = ZoneMask.fromCanvas(maskCanvas);
  const highlights = Object.fromEntries(ZONES.map((z) => [z, new THREE.CanvasTexture(zoneHighlight(mask, z))]));
  return { texture: tex, mask, highlights };
}

export function disposeFaceSkin(s: FaceSkin): void {
  s.texture.dispose();
  for (const t of Object.values(s.highlights ?? {})) t?.dispose();
}
