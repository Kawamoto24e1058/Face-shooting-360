import { ZONE_COLOR, type Zone, type ZoneOrNone } from '../core/score';

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

  get width(): number {
    return this.data.width;
  }

  get height(): number {
    return this.data.height;
  }

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


const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** 確認画面で見せるための色付きマスク */
export function colorizeMask(src: HTMLCanvasElement): HTMLCanvasElement {
  const m = ZoneMask.fromCanvas(src);
  return paint(m, (z) => (z === 'none' ? null : [...hexToRgb(ZONE_COLOR[z]), z === 'cheek' ? 90 : 170]));
}

/** 指定した部位だけを白で塗った画像（命中時に部位を光らせる用） */
export function zoneHighlight(m: ZoneMask, zone: Zone, size = 256): HTMLCanvasElement {
  return paint(m, (z) => (z === zone ? [255, 255, 255, 255] : null), size);
}

function paint(
  m: ZoneMask,
  color: (z: ZoneOrNone) => [number, number, number, number] | null,
  size = m.width,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const col = color(m.sample((x + 0.5) / c.width, 1 - (y + 0.5) / c.height));
      if (col) img.data.set(col, (y * c.width + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
