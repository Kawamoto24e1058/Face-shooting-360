/**
 * 顔ランドマーク（MediaPipe Face Landmarker の 478 点）を扱う純関数。
 * 切り抜きの位置合わせとゾーンマスクの多角形をここで決める。
 */

export interface Pt {
  x: number;
  y: number;
}

/** 顔の輪郭（時計回り） */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
/** 画像の左側に写る目（本人の右目） */
export const EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const EYE_B = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
/** 眉の下側の線（ここより上を額・眉間とする） */
export const BROW_LOWER = [46, 53, 52, 65, 55, 285, 295, 282, 283, 276];
export const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 129, 358, 49, 279, 48, 278, 64, 294];
export const LOWER_LIP_BOTTOM = 17;
export const CHIN_TIP = 152;
export const NOSE_TIP = 1;
export const OVAL_LEFT = 234;
export const OVAL_RIGHT = 454;

export const pick = (lm: readonly Pt[], idx: readonly number[]): Pt[] => idx.map((i) => lm[i]);

export function centroid(pts: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** 重心を中心に拡大する（小さい部位を当てやすくする） */
export function expand(pts: readonly Pt[], k: number): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

/** Andrew's monotone chain。反時計回り（y 下向き座標では時計回り）の凸包 */
export function convexHull(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * 元画像のピクセル座標 → 出力テクスチャ（size×size）への変換。
 * 両目を結ぶ線が水平になるよう回転し、輪郭がちょうど収まる正方形に拡大する。
 */
export interface Alignment {
  /** 回転中心（元画像の輪郭の重心） */
  center: Pt;
  /** 両目の傾き [rad] */
  roll: number;
  /** 回転後の座標系での、切り抜き正方形の中心 */
  boxCenter: Pt;
  /** 元画像 1px あたりの出力 px */
  scale: number;
  size: number;
}

export function computeAlignment(lm: readonly Pt[], size: number, margin = 1.08): Alignment {
  const eyeA = centroid(pick(lm, [33, 133]));
  const eyeB = centroid(pick(lm, [362, 263]));
  const roll = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);
  const oval = pick(lm, FACE_OVAL);
  const center = centroid(oval);
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of oval) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const side = Math.max(maxX - minX, maxY - minY) * margin;
  return {
    center,
    roll,
    boxCenter: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    scale: size / side,
    size,
  };
}

export function mapPoint(a: Alignment, p: Pt): Pt {
  const cos = Math.cos(-a.roll);
  const sin = Math.sin(-a.roll);
  const dx = p.x - a.center.x;
  const dy = p.y - a.center.y;
  const x = dx * cos - dy * sin;
  const y = dx * sin + dy * cos;
  return { x: (x - a.boxCenter.x) * a.scale + a.size / 2, y: (y - a.boxCenter.y) * a.scale + a.size / 2 };
}

/** Canvas 2D に同じ変換を設定する（drawImage で元画像を描くと位置合わせ済みになる） */
export function applyAlignment(ctx: CanvasRenderingContext2D, a: Alignment): void {
  ctx.translate(a.size / 2, a.size / 2);
  ctx.scale(a.scale, a.scale);
  ctx.translate(-a.boxCenter.x, -a.boxCenter.y);
  ctx.rotate(-a.roll);
  ctx.translate(-a.center.x, -a.center.y);
}

export type FaceIssue = 'notFrontal' | 'tooSmall';

/** 取り込みに向かない顔を判定する（横向き・小さすぎ） */
export function checkPose(lm: readonly Pt[], minWidthPx = 80): FaceIssue | null {
  const l = lm[OVAL_LEFT];
  const r = lm[OVAL_RIGHT];
  const width = Math.hypot(r.x - l.x, r.y - l.y);
  if (width < minWidthPx) return 'tooSmall';
  // 鼻先が左右の輪郭のどこにあるか（正面なら 0.5 付近）
  const t = ((lm[NOSE_TIP].x - l.x) * (r.x - l.x) + (lm[NOSE_TIP].y - l.y) * (r.y - l.y)) / (width * width);
  if (Math.abs(t - 0.5) > 0.18) return 'notFrontal';
  return null;
}
