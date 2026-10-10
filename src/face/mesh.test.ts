import { describe, expect, it } from 'vitest';
import { blendedDepth, boundaryLoops, buildFaceMesh, morphIndex, type Landmark3 } from './mesh';
import { CANONICAL_FACE } from './canonical';
import { FACE_TRIANGLES } from './tesselation';

/** 球面の一部に 468 点を並べた合成ランドマーク（中央ほど手前＝z が小さい） */
function synth(): Landmark3[] {
  // 実際の三角形の接続を使うため、各点に一意な位置を与える（黄金角で円盤に配置）
  return Array.from({ length: 478 }, (_, i) => {
    const r = Math.sqrt(i / 478) * 0.45;
    const a = i * 2.39996;
    const x = 0.5 + Math.cos(a) * r;
    const y = 0.5 + Math.sin(a) * r;
    return { x, y, z: -(0.2 - r * r) };
  });
}

describe('face mesh topology', () => {
  it('has the outer rim, two eyes and the mouth as boundary loops', () => {
    const sizes = boundaryLoops(FACE_TRIANGLES).map((l) => l.length).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 16, 20, 36]);
  });
});

describe('buildFaceMesh', () => {
  const m = buildFaceMesh(synth());
  it('closes the holes and adds a shell', () => {
    const front = m.groups[0].count / 3;
    expect(front).toBe(852 + 16 + 16 + 20);
    expect(m.groups[1].count / 3).toBe(36 * 3);
    expect(m.groups[2].count / 3).toBe(20);
    expect(m.indices.length).toBe(m.groups[0].count + m.groups[1].count + m.groups[2].count);
    expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
  });
  it('keeps the surface within the unit square and the back behind it', () => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < 468; i++) {
      xs.push(m.positions[i * 3]);
      zs.push(m.positions[i * 3 + 2]);
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.5);
    const zAll = Array.from({ length: m.positions.length / 3 }, (_, i) => m.positions[i * 3 + 2]);
    expect(Math.min(...zAll)).toBeLessThan(Math.min(...zs));
  });
  it('uv matches the texture coordinates', () => {
    const lm = synth();
    expect(m.uvs[0]).toBeCloseTo(lm[0].x);
    expect(m.uvs[1]).toBeCloseTo(1 - lm[0].y);
  });
});

/** 実際の顔に近い配置の合成ランドマーク（必要な点だけ意味のある位置に置く） */
describe('expressions', () => {
  const m = buildFaceMesh(synth());
  const dy = (e: Parameters<typeof morphIndex>[0], v: number) => m.morphs[morphIndex(e)][v * 3 + 1];
  it('has one morph per non-neutral expression covering every vertex', () => {
    expect(m.morphs).toHaveLength(5);
    for (const a of m.morphs) expect(a.length).toBe(m.positions.length);
  });
  it('closing the eyes moves the upper lid toward the lower lid', () => {
    const up = 159, low = 145;
    const dir = Math.sign(m.positions[low * 3 + 1] - m.positions[up * 3 + 1]);
    expect(Math.sign(dy('eyesClosed', up))).toBe(dir);
    expect(dy('eyesClosed', low)).toBe(0);
  });
  it('morphs stay small so the face does not break apart', () => {
    for (const a of m.morphs) {
      let max = 0;
      for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i]));
      expect(max).toBeLessThan(0.15);
    }
  });
});

describe('blendedDepth', () => {
  /** 標準顔の正面配置をそのままテクスチャ座標にしたランドマーク（z は極端な値） */
  const fromCanonical = (zNoise: number): Landmark3[] =>
    Array.from({ length: 468 }, (_, i) => ({
      x: 0.5 + CANONICAL_FACE[i * 3] / 40,
      y: 0.5 - CANONICAL_FACE[i * 3 + 1] / 40,
      z: i === 1 ? -zNoise : 0,
    }));
  it('uses the canonical nose height regardless of a noisy estimate', () => {
    const calm = blendedDepth(fromCanonical(0), 0);
    const noisy = blendedDepth(fromCanonical(5), 0);
    expect(noisy[1]).toBeCloseTo(calm[1]);
    // 鼻先（1）が外周（234）より手前
    expect(calm[1]).toBeGreaterThan(calm[234]);
  });
  it('mixes the personal estimate by the given ratio', () => {
    const a = blendedDepth(fromCanonical(0), 0.2);
    const b = blendedDepth(fromCanonical(1), 0.2);
    expect(b[1] - a[1]).toBeCloseTo(0.2);
  });
});
