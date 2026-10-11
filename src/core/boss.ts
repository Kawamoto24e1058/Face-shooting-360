/**
 * ボスの攻撃パターン（純粋な状態機械。描画や当たり判定はゲーム側）。
 * move（回り込み）→ volley（扇状にインク弾）→ spin（回転して裏の弱点を見せる）→ summon（子分を呼ぶ）を繰り返す。
 * 体力が減るほど間隔が短く、弾数が増える。
 */

export type BossPattern = 'move' | 'volley' | 'spin' | 'summon';

export const BOSS_CYCLE: readonly BossPattern[] = ['volley', 'spin', 'summon', 'move', 'volley', 'spin', 'move'];

export const BOSS_TIMING = {
  /** 各パターンの長さ [秒]（体力が減ると短くなる） */
  duration: { move: 1.8, volley: 2.6, spin: 4.5, summon: 2.0 } as Record<BossPattern, number>,
  /** 出現してから最初の攻撃までの間（正面を向いて構える） [秒] */
  intro: 1.6,
  /** 撃つ・呼ぶ前に口を開けて知らせる時間 [秒] */
  windup: 0.8,
  /** 扇状射撃の広がり [rad] */
  volleySpread: 0.9,
} as const;

export type BossAction =
  | { type: 'pattern'; pattern: BossPattern }
  | { type: 'volley'; count: number }
  | { type: 'summon'; count: number }
  | { type: 'windup' };

export interface BossBrainOptions {
  volley: number;
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
    if (this.pattern === 'volley' || this.pattern === 'summon') {
      const elapsed = BOSS_TIMING.duration[this.pattern] * tempo - this.timer;
      if (!this.windupSent) {
        this.windupSent = true;
        out.push({ type: 'windup' });
      }
      if (!this.acted && elapsed >= BOSS_TIMING.windup * tempo) {
        this.acted = true;
        // 体力が減るほど弾・子分が増える
        const extra = hpRatio < 0.5 ? 2 : 0;
        if (this.pattern === 'volley') out.push({ type: 'volley', count: this.opts.volley + extra });
        else out.push({ type: 'summon', count: this.opts.minions + (hpRatio < 0.5 ? 1 : 0) });
      }
    }
    return out;
  }
}
