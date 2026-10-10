import { describe, expect, it } from 'vitest';
import {
  accuracy,
  applyShot,
  breakCombo,
  comboMultiplier,
  computePoints,
  distanceMultiplier,
  initialScoreState,
  samePartMultiplier,
} from './score';

describe('multipliers', () => {
  it('combo starts at 1.0 and caps at 5', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBeCloseTo(1.4);
    expect(comboMultiplier(11)).toBe(5);
    expect(comboMultiplier(100)).toBe(5);
  });
  it('distance ranges 1.0–1.5 and clamps', () => {
    expect(distanceMultiplier(0)).toBe(1);
    expect(distanceMultiplier(1)).toBe(1.5);
    expect(distanceMultiplier(-1)).toBe(1);
    expect(distanceMultiplier(2)).toBe(1.5);
  });
  it('same part decays by 0.8 with a floor', () => {
    expect(samePartMultiplier(1)).toBe(1);
    expect(samePartMultiplier(2)).toBeCloseTo(0.8);
    expect(samePartMultiplier(3)).toBeCloseTo(0.64);
    expect(samePartMultiplier(50)).toBe(0.2);
  });
});

describe('computePoints', () => {
  it('base case equals base points', () => {
    expect(computePoints({ zone: 'eye', combo: 1, distanceT: 0, moving: false, samePartStreak: 1 })).toBe(500);
  });
  it('multiplies all factors', () => {
    // 300 * 1.4 * 1.5 * 1.2 * 0.8 = 604.8
    expect(
      computePoints({ zone: 'forehead', combo: 2, distanceT: 1, moving: true, samePartStreak: 2 }),
    ).toBe(605);
  });
  it('applies weapon multiplier', () => {
    expect(
      computePoints({ zone: 'nose', combo: 1, distanceT: 0, moving: false, samePartStreak: 1, weaponMultiplier: 0.5 }),
    ).toBe(100);
  });
});

describe('applyShot', () => {
  it('accumulates combo and resets on miss', () => {
    let s = initialScoreState();
    s = applyShot(s, [{ zone: 'nose', distanceT: 0, moving: false }]).state;
    s = applyShot(s, [{ zone: 'cheek', distanceT: 0, moving: false }]).state;
    expect(s.combo).toBe(2);
    expect(s.score).toBe(200 + 140);
    s = applyShot(s, []).state;
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(2);
    expect(s.shots).toBe(3);
    expect(s.hits).toBe(2);
    expect(accuracy(s)).toBeCloseTo(2 / 3);
  });
  it('tracks same-part streak', () => {
    let s = initialScoreState();
    s = applyShot(s, [{ zone: 'eye', distanceT: 0, moving: false }]).state;
    const r = applyShot(s, [{ zone: 'eye', distanceT: 0, moving: false }]);
    // 500 * 1.4(combo2) * 0.8(same part) = 560
    expect(r.points).toEqual([560]);
    expect(r.state.zoneHits.eye).toBe(2);
  });
  it('counts a multi-pellet shot as one shot / one combo step', () => {
    const r = applyShot(
      initialScoreState(),
      [
        { zone: 'cheek', distanceT: 0, moving: false },
        { zone: 'chin', distanceT: 0, moving: false },
      ],
      0.5,
    );
    expect(r.state.shots).toBe(1);
    expect(r.state.hits).toBe(1);
    expect(r.state.combo).toBe(1);
    expect(r.points).toEqual([50, 50]);
  });
  it('breakCombo resets combo but keeps score', () => {
    let s = applyShot(initialScoreState(), [{ zone: 'eye', distanceT: 0, moving: false }]).state;
    s = breakCombo(s);
    expect(s.combo).toBe(0);
    expect(s.score).toBe(500);
  });
});
