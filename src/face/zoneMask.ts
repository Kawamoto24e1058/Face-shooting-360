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
