import * as THREE from 'three';
import type { Zone } from './score';
import { Target } from '../render/target';
import { Item } from '../render/item';

export type RayHit =
  | { kind: 'target'; target: Target; zone: Zone; point: THREE.Vector3 }
  | { kind: 'item'; item: Item; point: THREE.Vector3 };

const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();

/** レティクル中心からの角度オフセット（右・上が正）でレイの向きを求める */
export function rayDirection(camera: THREE.Camera, offsetX: number, offsetY: number, out = dir): THREE.Vector3 {
  return out.set(Math.tan(offsetX), Math.tan(offsetY), -1).normalize().applyQuaternion(camera.quaternion);
}

/**
 * ヒットスキャン。ポリゴンとの交点の UV からゾーンマスクを引いて部位を決める。
 * 透過部分（輪郭外）はすり抜けて奥を判定する。pierce なら重なった的をすべて返す。
 */
export function castRay(
  camera: THREE.Camera,
  offsetX: number,
  offsetY: number,
  objects: THREE.Object3D[],
  pierce: boolean,
): RayHit[] {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  raycaster.set(origin, rayDirection(camera, offsetX, offsetY));
  const out: RayHit[] = [];
  const seen = new Set<THREE.Object3D>();
  for (const it of raycaster.intersectObjects(objects, false)) {
    // 板ポリゴンの対角線上では2つの三角形に同時に当たるので、1オブジェクト1回にする
    if (seen.has(it.object)) continue;
    seen.add(it.object);
    const item = it.object.userData.item as Item | undefined;
    if (item) {
      if (item.dead) continue;
      out.push({ kind: 'item', item, point: it.point.clone() });
      if (!pierce) break;
      continue;
    }
    const target = it.object.userData.target as Target | undefined;
    if (!target || !target.alive || !it.uv) continue;
    const zone = target.mask.sample(it.uv.x, it.uv.y);
    if (zone === 'none') continue;
    out.push({ kind: 'target', target, zone, point: it.point.clone() });
    if (!pierce) break;
  }
  return out;
}
