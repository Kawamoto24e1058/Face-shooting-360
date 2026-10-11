/**
 * ボスの行動パターン（純粋な状態機械。描画や当たり判定はゲーム側）。
 * spin（回転して裏の弱点を見せる）→ summon（子分を呼んでガード）→ move（回り込み）を繰り返す。
 * 反撃はしない。体力が減るほど間隔が短く、子分が増える。
 */

export type BossPattern = 'move' | 'spin' | 'summon';

export const BOSS_CYCLE: readonly BossPattern[] = ['spin', 'summon', 'spin', 'move'];

export const BOSS_TIMING = {
  /** 各パターンの長さ [秒]（体力が減ると短くなる） */
  duration: { move: 1.8, spin: 4.5, summon: 2.0 } as Record<BossPattern, number>,
  /** 出現してから最初の行動までの間（正面を向いて構える） [秒] */
  intro: 1.6,
  /** 子分を呼ぶ前に口を開けて知らせる時間 [秒] */
  windup: 0.8,
} as const;

export type BossAction = { type: 'pattern'; pattern: BossPattern } | { type: 'summon'; count: number } | { type: 'windup' };

export interface BossBrainOptions {
  minions: number;
}

export class BossBrain {
  private index = -1;
  private timer: number = BOSS_TIMING.intro;
  private acted = false;
  private windupSent = false;
  pattern: BossPattern = 'move';

  constructor(private readonly opts: BossBrainOptions) {}

  /** 体力の割合に応じた速さの倍率（体力が減るほど速い） */
  static tempo(hpRatio: number): number {
    return hpRatio < 0.25 ? 0.6 : hpRatio < 0.5 ? 0.78 : 1;
  }

  /** 時間を進め、この瞬間に起きる行動を返す */
  update(dt: number, hpRatio: number): BossAction[] {
    const out: BossAction[] = [];
    const tempo = BossBrain.tempo(hpRatio);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.index = (this.index + 1) % BOSS_CYCLE.length;
      this.pattern = BOSS_CYCLE[this.index];
      this.timer = BOSS_TIMING.duration[this.pattern] * tempo;
      this.acted = false;
      this.windupSent = false;
      out.push({ type: 'pattern', pattern: this.pattern });
    }
    if (this.pattern === 'summon') {
      const elapsed = BOSS_TIMING.duration.summon * tempo - this.timer;
      if (!this.windupSent) {
        this.windupSent = true;
        out.push({ type: 'windup' });
      }
      if (!this.acted && elapsed >= BOSS_TIMING.windup * tempo) {
        this.acted = true;
        // 体力が減るほど子分が増える
        out.push({ type: 'summon', count: this.opts.minions + (hpRatio < 0.5 ? 1 : 0) });
      }
    }
    return out;
  }
}
