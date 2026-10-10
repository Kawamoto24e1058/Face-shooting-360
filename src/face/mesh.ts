import { FACE_TRIANGLES } from './tesselation';

/**
 * 顔ランドマーク（テクスチャ座標 x,y ∈ 0〜1 と奥行き z）から、立体の「お面」メッシュを作る（純関数）。
 * - 表面: MediaPipe の 468 点メッシュ。目と口の穴は中心点を足して塞ぐ
 * - 側面と裏: 外周を後ろへ押し出して厚みを付ける（素材は単色）
 * 座標は 1×1 の板と同じスケール（中心原点、+Y 上、+Z 手前）。
 */

export interface Landmark3 {
  x: number;
  y: number;
  z: number;
}

export interface FaceMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** 0: 表面（テクスチャ）, 1: 側面・裏 */
  groups: { start: number; count: number; materialIndex: number }[];
}

export const MESH_PARAMS = {
  /** 奥行きの強調（写真からの推定値は控えめに出るため） */
  depthScale: 1.2,
  /** お面の厚み（外周から後ろへ） */
  thickness: 0.1,
  /** 裏側の外周を内側に寄せる割合（丸みを出す） */
  backShrink: 0.9,
  /** 目・口の穴を塞ぐ点をどれだけ奥に下げるか */
  holeRecess: 0.015,
} as const;

/** 三角形リストから、境界（1枚の三角形にしか属さない辺）をつないだループを求める */
export function boundaryLoops(tris: readonly number[]): number[][] {
  const count = new Map<string, number>();
  const directed = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[i + k];
      const b = tris[i + ((k + 1) % 3)];
      count.set(key(a, b), (count.get(key(a, b)) ?? 0) + 1);
    }
  }
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[i + k];
      const b = tris[i + ((k + 1) % 3)];
      if (count.get(key(a, b)) === 1) directed.set(a, b);
    }
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of directed.keys()) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let cur: number | undefined = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(cur);
      cur = directed.get(cur);
    }
    loops.push(loop);
  }
  return loops;
}

const LOOPS = boundaryLoops(FACE_TRIANGLES);
/** 一番長いループが顔の外周、それ以外が目・口の穴 */
const OUTER = LOOPS.reduce((a, b) => (b.length > a.length ? b : a));
const HOLES = LOOPS.filter((l) => l !== OUTER);

export function buildFaceMesh(lm: readonly Landmark3[]): FaceMeshData {
  const P = MESH_PARAMS;
  // 表面の頂点。z は外周の平均を 0 にそろえる
  const zOf = (i: number) => -lm[i].z * P.depthScale;
  const zBase = OUTER.reduce((s, i) => s + zOf(i), 0) / OUTER.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const push = (x: number, y: number, z: number, u: number, v: number) => {
    pos.push(x, y, z);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };
  for (let i = 0; i < 468; i++) push(lm[i].x - 0.5, 0.5 - lm[i].y, zOf(i) - zBase, lm[i].x, 1 - lm[i].y);

  const front: number[] = [...FACE_TRIANGLES];
  // 目・口の穴を中心点で塞ぐ
  for (const hole of HOLES) {
    let cx = 0, cy = 0, cz = 0, cu = 0, cv = 0;
    for (const i of hole) {
      cx += pos[i * 3];
      cy += pos[i * 3 + 1];
      cz += pos[i * 3 + 2];
      cu += uv[i * 2];
      cv += uv[i * 2 + 1];
    }
    const n = hole.length;
    const c = push(cx / n, cy / n, cz / n - P.holeRecess, cu / n, cv / n);
    // 境界の向き（ループの向き）は隣の三角形と逆向きにすれば表裏がそろう
    for (let k = 0; k < n; k++) front.push(hole[(k + 1) % n], hole[k], c);
  }

  // 表面が手前（+Z）を向くよう、全体の巻き方向をそろえる
  if (signedAreaSum(pos, front) < 0) flip(front);

  // 側面と裏。外周の頂点を複製して後ろへ押し出す
  const outer = OUTER;
  let ox = 0, oy = 0;
  for (const i of outer) {
    ox += pos[i * 3];
    oy += pos[i * 3 + 1];
  }
  ox /= outer.length;
  oy /= outer.length;
  const zBack = Math.min(...outer.map((i) => pos[i * 3 + 2])) - P.thickness;
  const rim = outer.map((i) => push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]));
  const back = outer.map((i) =>
    push(ox + (pos[i * 3] - ox) * P.backShrink, oy + (pos[i * 3 + 1] - oy) * P.backShrink, zBack, uv[i * 2], uv[i * 2 + 1]),
  );
  const backCenter = push(ox, oy, zBack - P.thickness * 0.3, 0.5, 0.5);
  const shell: number[] = [];
  const m = outer.length;
  for (let k = 0; k < m; k++) {
    const a = rim[k], b = rim[(k + 1) % m], c = back[(k + 1) % m], d = back[k];
    shell.push(a, b, c, a, c, d);
    shell.push(back[k], back[(k + 1) % m], backCenter);
  }
  // 側面・裏は外向きにする（外周ループの向きは表面と同じなので、表面の向きに合わせて決める）
  if (shellFacesInward(pos, shell, ox, oy, zBack)) flip(shell);

  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    indices: new Uint32Array([...front, ...shell]),
    groups: [
      { start: 0, count: front.length, materialIndex: 0 },
      { start: front.length, count: shell.length, materialIndex: 1 },
    ],
  };
}

function flip(tris: number[]): void {
  for (let i = 0; i < tris.length; i += 3) [tris[i + 1], tris[i + 2]] = [tris[i + 2], tris[i + 1]];
}

/** XY 平面に投影した符号付き面積の合計（正なら手前向き） */
function signedAreaSum(pos: readonly number[], tris: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i] * 3, tris[i + 1] * 3, tris[i + 2] * 3];
    s += (pos[b] - pos[a]) * (pos[c + 1] - pos[a + 1]) - (pos[b + 1] - pos[a + 1]) * (pos[c] - pos[a]);
  }
  return s;
}

/** 側面・裏の法線が、お面の中心（内側）を向いている三角形の方が多ければ true */
function shellFacesInward(pos: readonly number[], tris: readonly number[], cx: number, cy: number, zBack: number): boolean {
  let inward = 0;
  const cz = zBack / 2;
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i] * 3, tris[i + 1] * 3, tris[i + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (pos[a] + pos[b] + pos[c]) / 3 - cx;
    const my = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3 - cy;
    const mz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) inward++;
  }
  return inward > tris.length / 6;
}
