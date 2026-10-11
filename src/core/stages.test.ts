import { describe, expect, it } from 'vitest';
import { clearBonus, livesAfterClear, MAX_LIVES, stageStars, STAGES } from './stages';
import { EXPRESSIONS } from '../face/mesh';

describe('stages', () => {
  it('get harder stage by stage', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].quota).toBeGreaterThanOrEqual(STAGES[i - 1].quota);
      expect(STAGES[i].bossHp).toBeGreaterThan(STAGES[i - 1].bossHp);
      expect(STAGES[i].fireIntervalMul).toBeLessThanOrEqual(STAGES[i - 1].fireIntervalMul);
    }
  });
  it('only use known expressions', () => {
    for (const s of STAGES) for (const e of s.expressions) expect(EXPRESSIONS).toContain(e);
  });
  it('rates stars by damage taken', () => {
    expect(stageStars(0)).toBe(3);
    expect(stageStars(1)).toBe(2);
    expect(stageStars(2)).toBe(1);
  });
  it('heals one life on clear up to the max', () => {
    expect(livesAfterClear(1)).toBe(2);
    expect(livesAfterClear(MAX_LIVES)).toBe(MAX_LIVES);
  });
  it('bonus grows with stars and lives', () => {
    expect(clearBonus(3, 3)).toBeGreaterThan(clearBonus(2, 3));
    expect(clearBonus(3, 3)).toBeGreaterThan(clearBonus(3, 1));
  });
});
