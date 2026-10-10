import { describe, expect, it } from 'vitest';
import { checkPose, computeAlignment, convexHull, expand, mapPoint, FACE_OVAL, EYE_A, EYE_B, NOSE_TIP, OVAL_LEFT, OVAL_RIGHT, type Pt } from './geometry';

/** 必要な点だけを持つ合成ランドマーク。中心(cx,cy)・半径r の円形の顔を roll だけ回す */
function synthFace(cx: number, cy: number, r: number, roll = 0, noseShift = 0): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  const rot = (x: number, y: number): Pt => ({
    x: cx + x * Math.cos(roll) - y * Math.sin(roll),
    y: cy + x * Math.sin(roll) + y * Math.cos(roll),
  });
  FACE_OVAL.forEach((idx, i) => {
    const a = (i / FACE_OVAL.length) * Math.PI * 2 - Math.PI / 2;
    lm[idx] = rot(Math.cos(a) * r, Math.sin(a) * r);
  });
  lm[OVAL_LEFT] = rot(-r, 0);
  lm[OVAL_RIGHT] = rot(r, 0);
  for (const i of [...EYE_A, 33, 133]) lm[i] = rot(-r * 0.4, -r * 0.2);
  for (const i of [...EYE_B, 362, 263]) lm[i] = rot(r * 0.4, -r * 0.2);
  lm[NOSE_TIP] = rot(noseShift * r, r * 0.1);
  return lm;
}

describe('alignment', () => {
  it('maps a tilted face so the eyes are level and the face fills the square', () => {
    const lm = synthFace(300, 200, 100, 0.3);
    const a = computeAlignment(lm, 512, 1);
    expect(a.roll).toBeCloseTo(0.3);
    const eA = mapPoint(a, lm[33]);
    const eB = mapPoint(a, lm[263]);
    expect(eA.y).toBeCloseTo(eB.y);
    expect(eA.x).toBeLessThan(eB.x);
    const xs = FACE_OVAL.map((i) => mapPoint(a, lm[i]).x);
    expect(Math.min(...xs)).toBeGreaterThan(-1);
    expect(Math.max(...xs)).toBeLessThan(513);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(480);
  });
});

describe('checkPose', () => {
  it('accepts a frontal face', () => {
    expect(checkPose(synthFace(300, 300, 100))).toBeNull();
  });
  it('rejects a face turned sideways', () => {
    expect(checkPose(synthFace(300, 300, 100, 0, 0.6))).toBe('notFrontal');
  });
  it('rejects a tiny face', () => {
    expect(checkPose(synthFace(300, 300, 20))).toBe('tooSmall');
  });
});

describe('polygon helpers', () => {
  it('convex hull drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull).toHaveLength(4);
  });
  it('expand scales around the centroid', () => {
    const e = expand(
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ],
      2,
    );
    expect(e[0]).toEqual({ x: -1, y: -1 });
    expect(e[2]).toEqual({ x: 3, y: 3 });
  });
});
