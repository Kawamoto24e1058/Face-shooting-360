import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { castRay } from './hitscan';
import { Target } from '../render/target';
import { ZoneMask, ZONE_IDS } from '../face/zoneMask';

/** 8x8 のマスク: 中央 4x4 が eye、その外周が cheek、四隅は透過 */
function makeMask(): ZoneMask {
  const w = 8;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const corner = (x < 2 || x > 5) && (y < 2 || y > 5);
      const center = x >= 2 && x <= 5 && y >= 2 && y <= 5;
      data[i] = ZONE_IDS.indexOf(center ? 'eye' : 'cheek') * 32;
      data[i + 3] = corner ? 0 : 255;
    }
  }
  return new ZoneMask({ width: w, height: w, data, colorSpace: 'srgb' } as ImageData);
}

function setup(distances: number[]) {
  const skin = { texture: new THREE.Texture(), mask: makeMask() };
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100);
  camera.updateMatrixWorld();
  const targets = distances.map((d) => {
    const t = new Target(skin, { azimuth: 0, elevation: 0, distance: d, rare: false }, { moving: false, speed: 0, rng: () => 0.5 });
    t.update(1); // 出現アニメーションを終わらせる
    t.mesh.updateMatrixWorld();
    return t;
  });
  return { camera, targets, meshes: targets.map((t) => t.mesh) };
}

describe('castRay', () => {
  it('hits the center zone of a target straight ahead', () => {
    const { camera, targets, meshes } = setup([5]);
    const hits = castRay(camera, 0, 0, meshes, false);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: 'target', target: targets[0], zone: 'eye' });
  });

  it('passes through transparent corners to the target behind', () => {
    const { camera, targets, meshes } = setup([4, 8]);
    // 手前の的の左上隅（透過）を狙い、その延長線上に奥の的の中心を置く
    const s = targets[0].mesh.scale.x;
    const off = Math.atan((s * 0.4) / 4);
    const dir = new THREE.Vector3(-Math.tan(off), Math.tan(off), -1).normalize();
    targets[1].mesh.position.copy(dir.multiplyScalar(8));
    targets[1].mesh.lookAt(0, 0, 0);
    targets[1].mesh.updateMatrixWorld();
    const hits = castRay(camera, -off, off, meshes, false);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ target: targets[1], zone: 'eye' });
  });

  it('pierce returns every overlapped target', () => {
    const { camera, meshes } = setup([4, 6, 8]);
    expect(castRay(camera, 0, 0, meshes, true)).toHaveLength(3);
  });

  it('misses when aiming away', () => {
    const { camera, meshes } = setup([5]);
    expect(castRay(camera, 0.5, 0, meshes, false)).toHaveLength(0);
  });
});
