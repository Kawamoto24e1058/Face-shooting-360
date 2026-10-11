import { describe, expect, it } from 'vitest';
import { clearBonus, stageStars, STAGES } from './stages';
import { EXPRESSIONS } from '../face/mesh';

describe('stages', () => {
  it('get harder stage by stage', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].quota).toBeGreaterThanOrEqual(STAGES[i - 1].quota);
      expect(STAGES[i].bossHp).toBeGreaterThan(STAGES[i - 1].bossHp);
      expect(STAGES[i].stay).toBeLessThanOrEqual(STAGES[i - 1].stay);
    }
  });
  it('only use known expressions', () => {
    for (const s of STAGES) for (const e of s.expressions) expect(EXPRESSIONS).toContain(e);
  });
  it('rates stars by the time left', () => {
    expect(stageStars(30, 60)).toBe(3);
    expect(stageStars(20, 60)).toBe(2);
    expect(stageStars(5, 60)).toBe(1);
  });
  it('bonus grows with stars and time left', () => {
    expect(clearBonus(3, 20)).toBeGreaterThan(clearBonus(2, 20));
    expect(clearBonus(3, 30)).toBeGreaterThan(clearBonus(3, 10));
  });
});
