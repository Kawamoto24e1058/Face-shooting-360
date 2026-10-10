import { describe, expect, it } from 'vitest';
import { boundaryLoops, buildFaceMesh, type Landmark3 } from './mesh';
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
    expect(m.indices.length).toBe(m.groups[0].count + m.groups[1].count);
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
