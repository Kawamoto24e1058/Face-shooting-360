import { describe, expect, it } from 'vitest';
import { pickExpression, photoExpressionFrom, PERSONALITY } from './expressions';

const seq = (seed = 3) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

describe('pickExpression', () => {
  it('only uses expressions unlocked for the wave', () => {
    const rng = seq();
    for (let i = 0; i < 500; i++) {
      const e = pickExpression(rng, 0);
      expect(PERSONALITY[e].fromWave).toBe(0);
    }
  });
  it('eventually uses every expression in later waves', () => {
    const rng = seq(9);
    const seen = new Set(Array.from({ length: 2000 }, () => pickExpression(rng, 8)));
    expect(seen.size).toBe(6);
  });
  it('favors the photo expression', () => {
    const count = (bias: 'smile' | null) => {
      const rng = seq(11);
      return Array.from({ length: 4000 }, () => pickExpression(rng, 0, bias)).filter((e) => e === 'smile').length;
    };
    expect(count('smile')).toBeGreaterThan(count(null));
  });
});

describe('photoExpressionFrom', () => {
  it('maps strong blendshapes and falls back to neutral', () => {
    expect(photoExpressionFrom({ mouthSmileLeft: 0.8, mouthSmileRight: 0.9 })).toBe('smile');
    expect(photoExpressionFrom({ jawOpen: 0.7 })).toBe('mouthOpen');
    expect(photoExpressionFrom({ mouthSmileLeft: 0.1 })).toBe('neutral');
    expect(photoExpressionFrom(undefined)).toBeNull();
  });
});
