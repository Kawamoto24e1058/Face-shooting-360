import * as THREE from 'three';
import type { Expression } from '../face/mesh';

/**
 * 的の頭まわりの装飾（すべてコードで組み立てる自作のパーツ。外部素材なし）。
 * - 顔の後ろに「フード」を付けて、お面ではなくキャラクターに見せる（輪郭の切れ目も隠れる）
 * - 頭の上のパーツで、表情ごとの性格が見た目で分かるようにする
 * 座標は的のメッシュと同じ（顔の高さ ≒ 1、中心原点、+Z 手前）。当たり判定には使わない。
 */

export type DecorKind = Expression | 'boss' | 'rare';

export interface Decor {
  group: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

interface Style {
  hood: number;
  rim: number;
}

const STYLE: Record<DecorKind, Style> = {
  neutral: { hood: 0x4fa3ff, rim: 0xffffff },
  smile: { hood: 0xb8c4d0, rim: 0xffd23f },
  surprise: { hood: 0xffd23f, rim: 0xff4fa3 },
  angry: { hood: 0xff4f4f, rim: 0x2a1a1a },
  eyesClosed: { hood: 0x9fdcff, rim: 0xffffff },
  mouthOpen: { hood: 0x7cff6b, rim: 0xffd23f },
  boss: { hood: 0xff4fa3, rim: 0xffd23f },
  rare: { hood: 0xffe14f, rim: 0xffffff },
};

/** フードの色（お面の側面もこの色にして、顔とフードの間をなじませる） */
export function hoodColor(kind: DecorKind): number {
  return STYLE[kind].hood;
}

// ---- 共有のジオメトリとマテリアル（的ごとに作らない） ----

let shared: ReturnType<typeof buildShared> | null = null;

function buildShared() {
  // 顔の後ろ半分を覆うフード（Z<0 の半球）
  const hood = new THREE.SphereGeometry(0.6, 28, 18, Math.PI, Math.PI);
  const rim = new THREE.TorusGeometry(0.6, 0.045, 10, 40);
  const ball = new THREE.SphereGeometry(1, 16, 12);
  const cone = new THREE.ConeGeometry(1, 1, 20);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const halo = new THREE.TorusGeometry(0.3, 0.035, 8, 32);
  const mats = new Map<string, THREE.MeshPhongMaterial>();
  const mat = (color: number, opts: { double?: boolean; emissive?: number } = {}) => {
    const key = `${color}-${opts.double ? 1 : 0}-${opts.emissive ?? 0}`;
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshPhongMaterial({
        color,
        shininess: 60,
        specular: 0x444444,
        side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
        emissive: opts.emissive ?? 0x000000,
      });
      mats.set(key, m);
    }
    return m;
  };
  return { hood, rim, ball, cone, cyl, box, halo, mat };
}

function parts() {
  shared ??= buildShared();
  return shared;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale: [number, number, number] | number = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(...scale);
  return m;
}

export function createDecor(kind: DecorKind): Decor {
  const P = parts();
  const st = STYLE[kind];
  const group = new THREE.Group();
  const owned: THREE.Material[] = [];
  const spinners: { obj: THREE.Object3D; speed: number }[] = [];
  let pulse: THREE.MeshPhongMaterial | null = null;

  // フード（顔の周りを囲む）。ボスは弱点の裏を光らせるので専用のマテリアル
  let hoodMat: THREE.Material = P.mat(st.hood, { double: true });
  if (kind === 'boss') {
    pulse = new THREE.MeshPhongMaterial({ color: st.hood, emissive: st.hood, side: THREE.DoubleSide, shininess: 60 });
    owned.push(pulse);
    hoodMat = pulse;
  }
  group.add(mesh(P.hood, hoodMat, [0, 0.03, -0.02], [0.9, 1.02, 0.85]));
  group.add(mesh(P.rim, P.mat(st.rim), [0, 0.03, -0.02], [0.9, 1.02, 1]));

  const top = 0.64;
  switch (kind) {
    case 'neutral': {
      // アンテナ
      group.add(mesh(P.cyl, P.mat(0xffffff), [0, top + 0.1, -0.08], [0.02, 0.22, 0.02]));
      group.add(mesh(P.ball, P.mat(0xff4fa3), [0, top + 0.23, -0.08], 0.06));
      break;
    }
    case 'smile': {
      // ガードが固い：騎士のかぶとのトサカ
      group.add(mesh(P.box, P.mat(0xffd23f), [0, top + 0.02, -0.2], [0.07, 0.2, 0.5]));
      group.add(mesh(P.ball, P.mat(0xffd23f), [-0.55, 0.05, -0.1], [0.06, 0.12, 0.06]));
      group.add(mesh(P.ball, P.mat(0xffd23f), [0.55, 0.05, -0.1], [0.06, 0.12, 0.06]));
      break;
    }
    case 'surprise': {
      // 素早い：プロペラ帽
      group.add(mesh(P.cyl, P.mat(0xffffff), [0, top + 0.06, -0.1], [0.02, 0.14, 0.02]));
      const prop = new THREE.Group();
      prop.position.set(0, top + 0.14, -0.1);
      prop.add(mesh(P.box, P.mat(0xff4fa3), [0, 0, 0], [0.5, 0.02, 0.08]));
      prop.add(mesh(P.box, P.mat(0x4fe3ff), [0, 0, 0], [0.08, 0.02, 0.5]));
      group.add(prop);
      spinners.push({ obj: prop, speed: 18 });
      break;
    }
    case 'angry': {
      // 突進：角
      for (const s of [-1, 1]) {
        const horn = mesh(P.cone, P.mat(0xfff3d6), [s * 0.36, top - 0.04, -0.08], [0.07, 0.26, 0.07]);
        horn.rotation.z = -s * 0.5;
        group.add(horn);
      }
      break;
    }
    case 'eyesClosed': {
      // 目つぶり：ナイトキャップ
      const cap = mesh(P.cone, P.mat(0x5b6cff), [0.08, top + 0.12, -0.12], [0.3, 0.5, 0.3]);
      cap.rotation.z = -0.5;
      group.add(cap);
      group.add(mesh(P.ball, P.mat(0xffffff), [0.32, top + 0.3, -0.12], 0.07));
      break;
    }
    case 'mouthOpen': {
      // 口開け：パーティー帽
      group.add(mesh(P.cone, P.mat(0xff4fa3), [0, top + 0.16, -0.1], [0.18, 0.42, 0.18]));
      group.add(mesh(P.ball, P.mat(0xffd23f), [0, top + 0.39, -0.1], 0.06));
      break;
    }
    case 'boss': {
      // ボス：王冠
      const crown = new THREE.Group();
      crown.position.set(0, top + 0.02, -0.1);
      crown.add(mesh(P.cyl, P.mat(0xffd23f), [0, 0, 0], [0.32, 0.12, 0.32]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        crown.add(mesh(P.cone, P.mat(0xffd23f), [Math.sin(a) * 0.28, 0.14, Math.cos(a) * 0.28], [0.06, 0.18, 0.06]));
        crown.add(mesh(P.ball, P.mat(0x4fe3ff), [Math.sin(a) * 0.28, 0.25, Math.cos(a) * 0.28], 0.035));
      }
      group.add(crown);
      spinners.push({ obj: crown, speed: 0.8 });
      break;
    }
    case 'rare': {
      // レア：天使の輪
      const ring = mesh(P.halo, P.mat(0xffe14f, { emissive: 0x8a6a00 }), [0, top + 0.16, -0.05], 1);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      break;
    }
  }

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      for (const s of spinners) s.obj.rotation.y += s.speed * dt;
      if (pulse) pulse.emissiveIntensity = 0.35 + 0.3 * Math.sin(t * 6);
    },
    dispose() {
      group.removeFromParent();
      owned.forEach((m) => m.dispose());
    },
  };
}
