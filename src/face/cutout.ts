import { zoneColor } from './zoneMask';
import {
  applyAlignment,
  BROW_LOWER,
  centroid,
  CHIN_TIP,
  computeAlignment,
  convexHull,
  expand,
  EYE_A,
  EYE_B,
  FACE_OVAL,
  LIPS_OUTER,
  LOWER_LIP_BOTTOM,
  mapPoint,
  NOSE,
  pick,
  type Pt,
} from './geometry';

export const FACE_TEXTURE_SIZE = 512;

export interface Cutout {
  /** 輪郭で切り抜いた透過テクスチャ */
  texture: HTMLCanvasElement;
  /** 部位マスク（R に部位ID） */
  mask: HTMLCanvasElement;
  /** テクスチャ座標（0〜1）に変換したランドマーク。段階4のメッシュワープで使う */
  landmarks: Pt[];
  /** 顔領域の平均輝度（0〜255） */
  brightness: number;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function polygon(ctx: CanvasRenderingContext2D, pts: readonly Pt[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/**
 * 元画像とランドマーク（元画像のピクセル座標）から、切り抜きテクスチャとゾーンマスクを作る。
 * 端末内の Canvas だけで処理し、外部には送らない。
 */
export function makeCutout(source: CanvasImageSource, landmarksPx: readonly Pt[], size = FACE_TEXTURE_SIZE): Cutout {
  const a = computeAlignment(landmarksPx, size);
  const lm = landmarksPx.map((p) => mapPoint(a, p));
  const oval = pick(lm, FACE_OVAL);

  // テクスチャ
  const [tex, t] = canvas(size);
  t.save();
  polygon(t, oval);
  t.clip();
  t.save();
  applyAlignment(t, a);
  t.drawImage(source, 0, 0);
  t.restore();
  t.restore();
  // 背景（カメラ映像）から浮くように、輪郭に白い縁取り
  t.lineWidth = size * 0.012;
  t.strokeStyle = 'rgba(255,255,255,0.9)';
  polygon(t, oval);
  t.stroke();

  // ゾーンマスク（後に描いた部位が優先）
  const [mask, m] = canvas(size);
  const fill = (zone: Parameters<typeof zoneColor>[0], draw: () => void) => {
    m.fillStyle = zoneColor(zone);
    draw();
  };
  fill('cheek', () => {
    polygon(m, oval);
    m.fill();
  });
  const browY = centroid(pick(lm, BROW_LOWER)).y;
  const chinY = lm[LOWER_LIP_BOTTOM].y + (lm[CHIN_TIP].y - lm[LOWER_LIP_BOTTOM].y) * 0.35;
  const clipRect = (zone: Parameters<typeof zoneColor>[0], y0: number, y1: number) =>
    fill(zone, () => {
      m.save();
      polygon(m, oval);
      m.clip();
      m.fillRect(0, y0, size, y1 - y0);
      m.restore();
    });
  clipRect('forehead', 0, browY);
  clipRect('chin', chinY, size);
  fill('nose', () => {
    polygon(m, convexHull(pick(lm, NOSE)));
    m.fill();
  });
  fill('mouth', () => {
    polygon(m, expand(pick(lm, LIPS_OUTER), 1.15));
    m.fill();
  });
  fill('eye', () => {
    polygon(m, expand(pick(lm, EYE_A), 1.35));
    m.fill();
    polygon(m, expand(pick(lm, EYE_B), 1.35));
    m.fill();
  });

  return {
    texture: tex,
    mask,
    landmarks: lm.map((p) => ({ x: p.x / size, y: p.y / size })),
    brightness: meanBrightness(t, size),
  };
}

function meanBrightness(ctx: CanvasRenderingContext2D, size: number): number {
  const { data } = ctx.getImageData(0, 0, size, size);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 200) continue;
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return n === 0 ? 0 : sum / n;
}
