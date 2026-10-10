import type { Expression } from '../face/mesh';
import type { Rng } from './spawner';

/**
 * 表情ごとの「性格」。表情は点数の倍率には使わず、動き・耐久・弱点の出方にだけ反映する
 * （表情の誤検出や個人差で不公平にならないようにするため）。
 */
export interface Personality {
  label: string;
  /** 動く速さの倍率 */
  speedMul: number;
  /** 必ず動くか */
  alwaysMoving: boolean;
  /** 倒すのに必要な命中数 */
  hp: number;
  /** プレイヤーに向かって突進してくる */
  charge: boolean;
  /** まばたきの合間に一瞬だけ弱点（どこに当てても目と同じ扱い）が出る */
  blinkWeak: boolean;
  /** 口に当てるとボーナスアイテムを出す */
  mouthBonus: boolean;
  /** 出現し始めるウェーブ（0始まり） */
  fromWave: number;
  /** 出現の重み */
  weight: number;
}

export const PERSONALITY: Record<Expression, Personality> = {
  neutral: { label: '真顔', speedMul: 1, alwaysMoving: false, hp: 1, charge: false, blinkWeak: false, mouthBonus: false, fromWave: 0, weight: 4 },
  smile: { label: '笑顔', speedMul: 0.8, alwaysMoving: false, hp: 2, charge: false, blinkWeak: false, mouthBonus: false, fromWave: 0, weight: 2 },
  surprise: { label: '驚き', speedMul: 2.2, alwaysMoving: true, hp: 1, charge: false, blinkWeak: false, mouthBonus: false, fromWave: 1, weight: 2 },
  angry: { label: '怒り', speedMul: 1, alwaysMoving: false, hp: 1, charge: true, blinkWeak: false, mouthBonus: false, fromWave: 2, weight: 2 },
  eyesClosed: { label: '目つぶり', speedMul: 1, alwaysMoving: false, hp: 1, charge: false, blinkWeak: true, mouthBonus: false, fromWave: 1, weight: 1.5 },
  mouthOpen: { label: '口開け', speedMul: 1, alwaysMoving: false, hp: 1, charge: false, blinkWeak: false, mouthBonus: true, fromWave: 2, weight: 1.5 },
};

export const EXPRESSION_PARAMS = {
  /** 突進で近づける最短距離 */
  chargeMinDistance: 2.4,
  /** 突進の速さ [距離/秒] */
  chargeSpeed: 1.1,
  /** 目つぶり：閉じている時間と、弱点が出る時間 [秒] */
  blinkClosedSec: 1.6,
  blinkWeakSec: 0.6,
  /** 元写真と同じ表情を出やすくする倍率 */
  photoBias: 1.8,
} as const;

/**
 * 出現させる表情を選ぶ。photoExpression は元写真の表情（ブレンドシェイプから推定）で、
 * 「元写真に合わせて的の初期表情を選ぶ」用途に限って使う。
 */
export function pickExpression(rng: Rng, wave: number, photoExpression?: Expression | null): Expression {
  const entries = (Object.entries(PERSONALITY) as [Expression, Personality][])
    .filter(([, p]) => wave >= p.fromWave)
    .map(([e, p]) => [e, p.weight * (e === photoExpression ? EXPRESSION_PARAMS.photoBias : 1)] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [e, w] of entries) {
    r -= w;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1][0];
}

/** ブレンドシェイプ（0〜1）から元写真のおおまかな表情を選ぶ。感情の判定や表示には使わない */
export function photoExpressionFrom(bs: Record<string, number> | undefined): Expression | null {
  if (!bs) return null;
  const v = (k: string) => bs[k] ?? 0;
  const pairs: [Expression, number][] = [
    ['smile', (v('mouthSmileLeft') + v('mouthSmileRight')) / 2],
    ['mouthOpen', v('jawOpen')],
    ['eyesClosed', (v('eyeBlinkLeft') + v('eyeBlinkRight')) / 2],
    ['surprise', (v('browInnerUp') + v('eyeWideLeft') + v('eyeWideRight')) / 3],
  ];
  const best = pairs.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] >= 0.5 ? best[0] : 'neutral';
}
