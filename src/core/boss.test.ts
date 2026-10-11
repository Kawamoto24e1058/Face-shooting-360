import { describe, expect, it } from 'vitest';
import { BOSS_CYCLE, BossBrain, type BossAction } from './boss';

function run(brain: BossBrain, seconds: number, hp = 1): BossAction[] {
  const out: BossAction[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) out.push(...brain.update(1 / 60, hp));
  return out;
}

describe('BossBrain', () => {
  it('cycles through every pattern', () => {
    const acts = run(new BossBrain({ minions: 2 }), 30);
    const patterns = acts.filter((a) => a.type === 'pattern').map((a) => (a as { pattern: string }).pattern);
    for (const p of new Set(BOSS_CYCLE)) expect(patterns).toContain(p);
  });
  it('summons once per summon pattern with the configured count', () => {
    const acts = run(new BossBrain({ minions: 2 }), 30);
    const summons = acts.filter((a) => a.type === 'summon');
    const patterns = acts.filter((a) => a.type === 'pattern' && a.pattern === 'summon');
    expect(summons.length).toBe(patterns.length);
    expect(summons.every((v) => v.type === 'summon' && v.count === 2)).toBe(true);
  });
  it('gets faster and calls more minions when hurt', () => {
    const calm = run(new BossBrain({ minions: 2 }), 30, 1).filter((a) => a.type === 'summon');
    const angry = run(new BossBrain({ minions: 2 }), 30, 0.2).filter((a) => a.type === 'summon');
    expect(angry.length).toBeGreaterThan(calm.length);
    expect(angry.every((v) => v.type === 'summon' && v.count === 3)).toBe(true);
  });
});
