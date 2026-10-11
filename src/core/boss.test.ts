import { describe, expect, it } from 'vitest';
import { BOSS_CYCLE, BossBrain, type BossAction } from './boss';

function run(brain: BossBrain, seconds: number, hp = 1): BossAction[] {
  const out: BossAction[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) out.push(...brain.update(1 / 60, hp));
  return out;
}

describe('BossBrain', () => {
  it('cycles through every pattern', () => {
    const acts = run(new BossBrain({ volley: 3, minions: 2 }), 30);
    const patterns = acts.filter((a) => a.type === 'pattern').map((a) => (a as { pattern: string }).pattern);
    for (const p of new Set(BOSS_CYCLE)) expect(patterns).toContain(p);
  });
  it('fires once per volley pattern with the configured count', () => {
    const acts = run(new BossBrain({ volley: 3, minions: 2 }), 30);
    const volleys = acts.filter((a) => a.type === 'volley');
    const patterns = acts.filter((a) => a.type === 'pattern' && a.pattern === 'volley');
    expect(volleys.length).toBe(patterns.length);
    expect(volleys.every((v) => v.type === 'volley' && v.count === 3)).toBe(true);
  });
  it('gets faster and fires more when hurt', () => {
    const calm = run(new BossBrain({ volley: 3, minions: 2 }), 30, 1).filter((a) => a.type === 'volley');
    const angry = run(new BossBrain({ volley: 3, minions: 2 }), 30, 0.2).filter((a) => a.type === 'volley');
    expect(angry.length).toBeGreaterThan(calm.length);
    expect(angry.every((v) => v.type === 'volley' && v.count === 5)).toBe(true);
  });
});
