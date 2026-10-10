import { zoneColor } from './zoneMask';
import type { ZoneOrNone } from '../core/score';

/**
 * 段階2用のダミー顔（自作の図形のみ）。テクスチャとゾーンマスクを同じ形状から生成する。
 * 段階3で写真から作る顔に差し替える。
 */
const SIZE = 512;

interface Shape {
  zone: ZoneOrNone;
  draw(ctx: CanvasRenderingContext2D): void;
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) => (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

const FACE = { cx: 256, cy: 266, rx: 190, ry: 236 };

function clipFace(ctx: CanvasRenderingContext2D, y0: number, y1: number) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(FACE.cx, FACE.cy, FACE.rx, FACE.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillRect(0, y0, SIZE, y1 - y0);
  ctx.restore();
}

// 後に描いたものが優先される
const SHAPES: Shape[] = [
  { zone: 'cheek', draw: ellipse(FACE.cx, FACE.cy, FACE.rx, FACE.ry) },
  { zone: 'forehead', draw: (ctx) => clipFace(ctx, 0, 190) },
  { zone: 'chin', draw: (ctx) => clipFace(ctx, 430, SIZE) },
  { zone: 'eye', draw: ellipse(180, 232, 42, 26) },
  { zone: 'eye', draw: ellipse(332, 232, 42, 26) },
  { zone: 'nose', draw: ellipse(256, 300, 30, 52) },
  { zone: 'mouth', draw: ellipse(256, 385, 72, 30) },
];

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

export function createDummyFace(hue: number): { texture: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const [mask, m] = makeCanvas();
  for (const s of SHAPES) {
    m.fillStyle = zoneColor(s.zone);
    s.draw(m);
  }

  const [tex, t] = makeCanvas();
  // 顔
  const g = t.createRadialGradient(220, 200, 40, 256, 266, 260);
  g.addColorStop(0, `hsl(${hue} 70% 82%)`);
  g.addColorStop(1, `hsl(${hue} 55% 60%)`);
  t.fillStyle = g;
  ellipse(FACE.cx, FACE.cy, FACE.rx, FACE.ry)(t);
  t.lineWidth = 8;
  t.strokeStyle = `hsl(${hue} 40% 35%)`;
  t.stroke();
  // 目
  t.fillStyle = '#fff';
  ellipse(180, 232, 42, 26)(t);
  ellipse(332, 232, 42, 26)(t);
  t.fillStyle = '#222';
  ellipse(184, 234, 16, 16)(t);
  ellipse(328, 234, 16, 16)(t);
  // 眉
  t.strokeStyle = '#333';
  t.lineWidth = 10;
  t.lineCap = 'round';
  t.beginPath();
  t.moveTo(140, 186);
  t.lineTo(214, 178);
  t.moveTo(298, 178);
  t.lineTo(372, 186);
  t.stroke();
  // 鼻
  t.fillStyle = `hsl(${hue} 50% 66%)`;
  ellipse(256, 300, 26, 46)(t);
  // 口
  t.fillStyle = '#7a2032';
  ellipse(256, 385, 66, 24)(t);
  t.fillStyle = '#fff';
  t.fillRect(220, 366, 72, 10);
  return { texture: tex, mask };
}
