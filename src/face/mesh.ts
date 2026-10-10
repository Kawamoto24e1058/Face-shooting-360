import { FACE_TRIANGLES } from './tesselation';
import { CANONICAL_FACE } from './canonical';

/**
 * 顔ランドマーク（テクスチャ座標 x,y ∈ 0〜1 と奥行き z）から、立体の「お面」メッシュを作る（純関数）。
 * - 正面から見た配置（x,y）と見た目（テクスチャ）は本人の写真のまま
 * - 奥行き（z）は MediaPipe の標準顔モデルを使う。写真1枚からの推定は鼻やあごが極端になりやすいため
 *   （本人の推定値は personalDepth の割合だけ混ぜる）
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
  /** 0: 表面（テクスチャ）, 1: 側面・裏, 2: 口の中 */
  groups: { start: number; count: number; materialIndex: number }[];
  /** 表情ごとの頂点の移動量（EXPRESSIONS と同じ順、neutral は含まない） */
  morphs: Float32Array[];
}

export const MESH_PARAMS = {
  /** 奥行きに本人の推定値を混ぜる割合（0 = 標準顔のみ） */
  personalDepth: 0.2,
  /** 標準顔の奥行きの倍率（1 = 実際の顔の比率） */
  canonicalDepth: 0.85,
  /** お面の厚み（外周から後ろへ） */
  thickness: 0.1,
  /** 裏側の外周を内側に寄せる割合（丸みを出す） */
  backShrink: 0.9,
  /** 目の穴を塞ぐ点をどれだけ奥に下げるか */
  holeRecess: 0.015,
  /** 口の中（暗い面）をどれだけ奥に置くか */
  mouthRecess: 0.04,
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
/** 一番長いループが顔の外周、20点のループが口（唇の内側）、残りが目 */
const OUTER = LOOPS.reduce((a, b) => (b.length > a.length ? b : a));
const MOUTH = LOOPS.find((l) => l.length === 20)!;
const EYES = LOOPS.filter((l) => l !== OUTER && l !== MOUTH);

/** 頂点がどのランドマークの動きに従うか（表情の変形用）。-1 は動かない */
type Follow = number | number[];

/** 本人の配置に合わせた奥行き。標準顔を本人の大きさに合わせて縮尺し、本人の推定値を少し混ぜる */
export function blendedDepth(lm: readonly Landmark3[], personal: number = MESH_PARAMS.personalDepth): number[] {
  const C = CANONICAL_FACE;
  let ux = 0, uy = 0, cx = 0, cy = 0;
  for (let i = 0; i < 468; i++) {
    ux += lm[i].x;
    uy += lm[i].y;
    cx += C[i * 3];
    cy += C[i * 3 + 1];
  }
  ux /= 468; uy /= 468; cx /= 468; cy /= 468;
  let su = 0, sc = 0;
  for (let i = 0; i < 468; i++) {
    su += (lm[i].x - ux) ** 2 + (lm[i].y - uy) ** 2;
    sc += (C[i * 3] - cx) ** 2 + (C[i * 3 + 1] - cy) ** 2;
  }
  const scale = Math.sqrt(su / sc) * MESH_PARAMS.canonicalDepth;
  return Array.from({ length: 468 }, (_, i) => (1 - personal) * C[i * 3 + 2] * scale + personal * -lm[i].z);
}

export function buildFaceMesh(lm: readonly Landmark3[]): FaceMeshData {
  const P = MESH_PARAMS;
  // 表面の頂点。z は外周の平均を 0 にそろえる
  const depth = blendedDepth(lm);
  const zOf = (i: number) => depth[i];
  const zBase = OUTER.reduce((s, i) => s + zOf(i), 0) / OUTER.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const follow: Follow[] = [];
  const push = (x: number, y: number, z: number, u: number, v: number, f: Follow = -1) => {
    pos.push(x, y, z);
    uv.push(u, v);
    follow.push(f);
    return pos.length / 3 - 1;
  };
  for (let i = 0; i < 468; i++) push(lm[i].x - 0.5, 0.5 - lm[i].y, zOf(i) - zBase, lm[i].x, 1 - lm[i].y, i);
  const px = (i: number) => pos[i * 3];
  const py = (i: number) => pos[i * 3 + 1];
  const pz = (i: number) => pos[i * 3 + 2];
  const center = (ring: readonly number[]) => {
    const n = ring.length;
    let x = 0, y = 0, z = 0, u = 0, v = 0;
    for (const i of ring) {
      x += px(i);
      y += py(i);
      z += pz(i);
      u += uv[i * 2];
      v += uv[i * 2 + 1];
    }
    return { x: x / n, y: y / n, z: z / n, u: u / n, v: v / n };
  };

  const front: number[] = [...FACE_TRIANGLES];
  // 目の穴は中心点で塞ぐ（まぶたが閉じると一緒につぶれる）
  for (const ring of EYES) {
    const c = center(ring);
    const ci = push(c.x, c.y, c.z - P.holeRecess, c.u, c.v, [...ring]);
    // 境界の向き（ループの向き）は隣の三角形と逆向きにすれば表裏がそろう
    for (let k = 0; k < ring.length; k++) front.push(ring[(k + 1) % ring.length], ring[k], ci);
  }
  // 口の穴は「動かない写真の面」で塞ぎ、その奥に暗い口の中を置く。
  // 口を開ける表情では下唇だけが下がり、隙間から口の中が見える
  const mc = center(MOUTH);
  const mouthFill = MOUTH.map((i) => push(px(i), py(i), pz(i) - 0.002, uv[i * 2], uv[i * 2 + 1]));
  const mfc = push(mc.x, mc.y, mc.z - P.holeRecess, mc.u, mc.v);
  const n = MOUTH.length;
  for (let k = 0; k < n; k++) front.push(mouthFill[(k + 1) % n], mouthFill[k], mfc);
  const zMouth = Math.min(...MOUTH.map(pz)) - P.mouthRecess;
  const cavityRing = MOUTH.map((i) =>
    push(
      mc.x + (px(i) - mc.x) * 1.15,
      py(i) < mc.y ? mc.y + (py(i) - mc.y) * 1.2 - 0.09 : py(i),
      zMouth,
      mc.u,
      mc.v,
    ),
  );
  const cavityCenter = push(mc.x, mc.y - 0.04, zMouth - 0.01, mc.u, mc.v);
  const cavity: number[] = [];
  for (let k = 0; k < n; k++) cavity.push(cavityRing[(k + 1) % n], cavityRing[k], cavityCenter);

  // 表面が手前（+Z）を向くよう、全体の巻き方向をそろえる
  if (signedAreaSum(pos, FACE_TRIANGLES) < 0) {
    flip(front);
    flip(cavity);
  }

  // 側面と裏。外周の頂点を複製して後ろへ押し出す
  const outer = OUTER;
  const oc = center(outer);
  const zBack = Math.min(...outer.map(pz)) - P.thickness;
  const rim = outer.map((i) => push(px(i), py(i), pz(i), uv[i * 2], uv[i * 2 + 1], i));
  const back = outer.map((i) =>
    push(oc.x + (px(i) - oc.x) * P.backShrink, oc.y + (py(i) - oc.y) * P.backShrink, zBack, uv[i * 2], uv[i * 2 + 1]),
  );
  const backCenter = push(oc.x, oc.y, zBack - P.thickness * 0.3, 0.5, 0.5);
  const shell: number[] = [];
  const m = outer.length;
  for (let k = 0; k < m; k++) {
    const a = rim[k], b = rim[(k + 1) % m], c = back[(k + 1) % m], d = back[k];
    shell.push(a, b, c, a, c, d);
    shell.push(back[k], back[(k + 1) % m], backCenter);
  }
  // 側面・裏は外向きにする
  if (shellFacesInward(pos, shell, oc.x, oc.y, zBack)) flip(shell);

  // 表情の変形：ランドマークの移動量を、それに従う頂点へ配る
  const base = new Float32Array(pos.slice(0, 468 * 3));
  const morphs = EXPRESSION_SHAPES.map((shape) => {
    const d = shape(base);
    const out = new Float32Array(pos.length);
    follow.forEach((f, v) => {
      const src = typeof f === 'number' ? (f >= 0 ? [f] : []) : f;
      if (src.length === 0) return;
      for (const i of src) {
        out[v * 3] += d[i * 3] / src.length;
        out[v * 3 + 1] += d[i * 3 + 1] / src.length;
        out[v * 3 + 2] += d[i * 3 + 2] / src.length;
      }
    });
    return out;
  });

  return {
    positions: new Float32Array(pos),
    uvs: new Float32Array(uv),
    indices: new Uint32Array([...front, ...shell, ...cavity]),
    groups: [
      { start: 0, count: front.length, materialIndex: 0 },
      { start: front.length, count: shell.length, materialIndex: 1 },
      { start: front.length + shell.length, count: cavity.length, materialIndex: 2 },
    ],
    morphs,
  };
}

// ---- 表情 ----

/** 表情の種類。neutral は変形なし（モーフの並びには含まない） */
export const EXPRESSIONS = ['neutral', 'smile', 'surprise', 'angry', 'eyesClosed', 'mouthOpen'] as const;
export type Expression = (typeof EXPRESSIONS)[number];
/** morphTargetInfluences の添字（neutral は -1） */
export const morphIndex = (e: Expression): number => EXPRESSIONS.indexOf(e) - 1;

const UPPER_LID_A = [246, 161, 160, 159, 158, 157, 173];
const LOWER_LID_A = [7, 163, 144, 145, 153, 154, 155];
const UPPER_LID_B = [466, 388, 387, 386, 385, 384, 398];
const LOWER_LID_B = [249, 390, 373, 374, 380, 381, 382];
const BROW_A = [70, 63, 105, 66, 107, 46, 53, 52, 65, 55];
const BROW_B = [300, 293, 334, 296, 336, 276, 283, 282, 295, 285];
const BROW_INNER_A = [107, 66, 55, 65];
const BROW_INNER_B = [336, 296, 285, 295];
const MOUTH_CORNER_A = 61;
const MOUTH_CORNER_B = 291;
const CHEEK_A = 205;
const CHEEK_B = 425;
const UPPER_LIP_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];

interface Handle {
  i: number;
  d: [number, number, number];
}

/**
 * ハンドル（ランドマークと移動量）の周りをガウス関数でなめらかに動かす。
 * 重なったハンドルは重み付き平均にして、動きすぎないようにする。
 */
function deform(base: Float32Array, handles: readonly Handle[], radius: number, exclude?: ReadonlySet<number>): Float32Array {
  const out = new Float32Array(468 * 3);
  const r2 = 2 * radius * radius;
  for (let v = 0; v < 468; v++) {
    if (exclude?.has(v)) continue;
    let w = 0, dx = 0, dy = 0, dz = 0;
    for (const h of handles) {
      const ex = base[v * 3] - base[h.i * 3];
      const ey = base[v * 3 + 1] - base[h.i * 3 + 1];
      const k = Math.exp(-(ex * ex + ey * ey) / r2);
      w += k;
      dx += h.d[0] * k;
      dy += h.d[1] * k;
      dz += h.d[2] * k;
    }
    if (w < 1e-6) continue;
    const s = Math.min(1, w) / w;
    out[v * 3] = dx * s;
    out[v * 3 + 1] = dy * s;
    out[v * 3 + 2] = dz * s;
  }
  return out;
}

function sum(...arrs: Float32Array[]): Float32Array {
  const out = new Float32Array(468 * 3);
  for (const a of arrs) for (let i = 0; i < out.length; i++) out[i] += a[i];
  return out;
}

const uniform = (idx: readonly number[], d: [number, number, number]): Handle[] => idx.map((i) => ({ i, d }));

/** まぶたを閉じる（上まぶたを下まぶたの位置へ） */
function closeEyes(base: Float32Array, amount: number): Float32Array {
  const hs: Handle[] = [];
  const pairs: [number[], number[]][] = [
    [UPPER_LID_A, LOWER_LID_A],
    [UPPER_LID_B, LOWER_LID_B],
  ];
  for (const [up, low] of pairs) {
    // 異常なランドマークで顔が崩れないよう、移動量に上限を設ける
    up.forEach((u, k) => {
      const d = (base[low[k] * 3 + 1] - base[u * 3 + 1]) * amount;
      hs.push({ i: u, d: [0, Math.max(-0.06, Math.min(0.06, d)), 0] });
    });
  }
  return deform(base, hs, 0.018, new Set([...LOWER_LID_A, ...LOWER_LID_B]));
}

/** 下あごを下げる（上唇より下だけを動かす） */
function dropJaw(base: Float32Array, amount: number): Float32Array {
  const out = new Float32Array(468 * 3);
  const yLip = Math.min(...UPPER_LIP_INNER.map((i) => base[i * 3 + 1]));
  const upper = new Set(UPPER_LIP_INNER);
  const cx = (base[MOUTH_CORNER_A * 3] + base[MOUTH_CORNER_B * 3]) / 2;
  for (let v = 0; v < 468; v++) {
    if (upper.has(v)) continue;
    const below = yLip - base[v * 3 + 1];
    if (below < -0.005) continue;
    const t = Math.min(1, (below + 0.005) / 0.03);
    const ex = base[v * 3] - cx;
    const k = t * Math.exp(-(ex * ex) / (2 * 0.22 * 0.22));
    out[v * 3 + 1] = -amount * k;
    out[v * 3 + 2] = -amount * 0.25 * k;
  }
  return out;
}

type Shape = (base: Float32Array) => Float32Array;

/** EXPRESSIONS の neutral 以外と同じ順 */
const EXPRESSION_SHAPES: Shape[] = [
  // smile: 口角を上げて外へ、頬を持ち上げ、下まぶたを少し上げる
  (b) =>
    sum(
      deform(b, [{ i: MOUTH_CORNER_A, d: [-0.025, 0.035, 0] }, { i: MOUTH_CORNER_B, d: [0.025, 0.035, 0] }], 0.045),
      deform(b, [{ i: CHEEK_A, d: [0, 0.018, 0.008] }, { i: CHEEK_B, d: [0, 0.018, 0.008] }], 0.06),
      deform(b, uniform([...LOWER_LID_A, ...LOWER_LID_B], [0, 0.005, 0]), 0.015),
    ),
  // surprise: 眉と上まぶたを上げ、口を開ける
  (b) =>
    sum(
      deform(b, uniform([...BROW_A, ...BROW_B], [0, 0.035, 0]), 0.04),
      deform(b, uniform([...UPPER_LID_A, ...UPPER_LID_B], [0, 0.01, 0]), 0.012),
      dropJaw(b, 0.06),
    ),
  // angry: 眉頭を下げて寄せ、目を細め、口角を下げる
  (b) =>
    sum(
      deform(b, [...uniform(BROW_INNER_A, [0.012, -0.028, 0]), ...uniform(BROW_INNER_B, [-0.012, -0.028, 0])], 0.03),
      closeEyes(b, 0.35),
      deform(b, [{ i: MOUTH_CORNER_A, d: [0.005, -0.02, 0] }, { i: MOUTH_CORNER_B, d: [-0.005, -0.02, 0] }], 0.035),
    ),
  // eyesClosed: まぶたを閉じる
  (b) => closeEyes(b, 0.95),
  // mouthOpen: 口を大きく開ける
  (b) => dropJaw(b, 0.1),
];

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
