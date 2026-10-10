import type { Zone, ZoneOrNone } from '../core/score';

/**
 * 部位マスク。R チャンネルに部位IDを書いた画像から UV で部位を引く。
 * 段階3で写真の切り抜きから生成するマスクも同じ形式にする。
 */
export const ZONE_IDS: readonly ZoneOrNone[] = ['none', 'forehead', 'eye', 'nose', 'mouth', 'cheek', 'chin'];
const STEP = 32;

export function zoneColor(zone: ZoneOrNone): string {
  const v = ZONE_IDS.indexOf(zone) * STEP;
  return `rgb(${v},0,0)`;
}

export class ZoneMask {
  constructor(private readonly data: ImageData) {}

  static fromCanvas(c: HTMLCanvasElement | OffscreenCanvas): ZoneMask {
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    return new ZoneMask(ctx.getImageData(0, 0, c.width, c.height));
  }

  /** uv は Three.js の規約（v=0 が下） */
  sample(u: number, v: number): ZoneOrNone {
    const { width, height, data } = this.data;
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return 'none';
    const id = Math.round(data[i] / STEP);
    return ZONE_IDS[id] ?? 'none';
  }
}

export type { Zone };

const PREVIEW_COLORS: Record<ZoneOrNone, [number, number, number, number]> = {
  none: [0, 0, 0, 0],
  forehead: [255, 200, 40, 150],
  eye: [255, 40, 90, 190],
  nose: [60, 220, 255, 170],
  mouth: [180, 80, 255, 170],
  cheek: [80, 255, 120, 90],
  chin: [255, 130, 40, 150],
};

/** 確認画面で見せるための色付きマスク */
export function colorizeMask(src: HTMLCanvasElement): HTMLCanvasElement {
  const m = ZoneMask.fromCanvas(src);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const col = PREVIEW_COLORS[m.sample((x + 0.5) / c.width, 1 - (y + 0.5) / c.height)];
      img.data.set(col, (y * c.width + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
