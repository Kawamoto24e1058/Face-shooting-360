/**
 * 得点計算（純関数）。
 * 得点 = 基本点 × コンボ倍率 × 距離倍率 × 動的ボーナス × 同部位減衰 (× 弾種倍率)
 * 数値はすべて初期値。実機プレイで調整する。
 */

export const ZONES = ['forehead', 'eye', 'nose', 'mouth', 'cheek', 'chin'] as const;
export type Zone = (typeof ZONES)[number];
/** 輪郭外（透過部分）。ミス扱いでコンボが切れる */
export type ZoneOrNone = Zone | 'none';

export const ZONE_BASE: Record<Zone, number> = {
  forehead: 300,
  eye: 500,
  nose: 200,
  mouth: 250,
  cheek: 100,
  chin: 100,
};

export const ZONE_LABEL: Record<Zone, string> = {
  forehead: 'HEAD!',
  eye: 'EYE!',
  nose: 'NOSE!',
  mouth: 'MOUTH!',
  cheek: 'CHEEK!',
  chin: 'CHIN!',
};

/** 部位の表示色（照準・命中ラベル・判定エリア表示で共通） */
export const ZONE_COLOR: Record<Zone, string> = {
  forehead: '#ffc828',
  eye: '#ff285a',
  nose: '#3cdcff',
  mouth: '#b450ff',
  cheek: '#50ff78',
  chin: '#ff8228',
};

export const ZONE_NAME_JA: Record<Zone, string> = {
  forehead: '額',
  eye: '目',
  nose: '鼻',
  mouth: '口',
  cheek: '頬',
  chin: '顎',
};

export const SCORE_PARAMS = {
  /** 連続ヒット1回あたりのコンボ倍率の上昇幅。リロードでコンボが切れるため、1マガジン(12発)内で上限に届く値にしている */
  comboStep: 0.4,
  comboMax: 5,
  distanceMin: 1.0,
  distanceMax: 1.5,
  movingBonus: 1.2,
  samePartDecay: 0.8,
  /** 同部位減衰の下限（仕様未定のため仮置き。調整対象） */
  samePartFloor: 0.2,
} as const;

/** combo: このヒットを含めた連続ヒット数（1以上） */
export function comboMultiplier(combo: number): number {
  if (combo <= 1) return 1;
  return Math.min(SCORE_PARAMS.comboMax, 1 + SCORE_PARAMS.comboStep * (combo - 1));
}

/** t: 0（最も近い）〜1（最も遠い）に正規化した距離 */
export function distanceMultiplier(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return SCORE_PARAMS.distanceMin + (SCORE_PARAMS.distanceMax - SCORE_PARAMS.distanceMin) * c;
}

/** streak: 同じ部位への連続ヒット数（このヒットを含む、1以上） */
export function samePartMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  return Math.max(SCORE_PARAMS.samePartFloor, SCORE_PARAMS.samePartDecay ** (streak - 1));
}

export interface HitInput {
  zone: Zone;
  combo: number;
  distanceT: number;
  moving: boolean;
  samePartStreak: number;
  /** 弾種による倍率（拡散弾は低め） */
  weaponMultiplier?: number;
}

export function computePoints(h: HitInput): number {
  const raw =
    ZONE_BASE[h.zone] *
    comboMultiplier(h.combo) *
    distanceMultiplier(h.distanceT) *
    (h.moving ? SCORE_PARAMS.movingBonus : 1) *
    samePartMultiplier(h.samePartStreak) *
    (h.weaponMultiplier ?? 1);
  return Math.round(raw);
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  lastZone: Zone | null;
  samePartStreak: number;
  shots: number;
  hits: number;
  zoneHits: Record<Zone, number>;
}

export function initialScoreState(): ScoreState {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    lastZone: null,
    samePartStreak: 0,
    shots: 0,
    hits: 0,
    zoneHits: { forehead: 0, eye: 0, nose: 0, mouth: 0, cheek: 0, chin: 0 },
  };
}

export interface ShotHit {
  zone: Zone;
  distanceT: number;
  moving: boolean;
}

/**
 * 1回の発射の結果を反映する。拡散弾のように1発で複数ヒットする場合も1回の発射として扱い、
 * コンボは「1発以上当たれば+1」「全弾外れで0」とする。
 */
export function applyShot(
  state: ScoreState,
  hits: readonly ShotHit[],
  weaponMultiplier = 1,
): { state: ScoreState; points: number[] } {
  const next: ScoreState = { ...state, zoneHits: { ...state.zoneHits }, shots: state.shots + 1 };
  if (hits.length === 0) {
    next.combo = 0;
    next.lastZone = null;
    next.samePartStreak = 0;
    return { state: next, points: [] };
  }
  next.combo = state.combo + 1;
  next.maxCombo = Math.max(state.maxCombo, next.combo);
  next.hits = state.hits + 1;
  const points: number[] = [];
  for (const h of hits) {
    next.samePartStreak = next.lastZone === h.zone ? next.samePartStreak + 1 : 1;
    next.lastZone = h.zone;
    next.zoneHits[h.zone] += 1;
    const p = computePoints({
      zone: h.zone,
      combo: next.combo,
      distanceT: h.distanceT,
      moving: h.moving,
      samePartStreak: next.samePartStreak,
      weaponMultiplier,
    });
    points.push(p);
    next.score += p;
  }
  return { state: next, points };
}

/** リロード開始でコンボを切る */
export function breakCombo(state: ScoreState): ScoreState {
  return { ...state, combo: 0, lastZone: null, samePartStreak: 0 };
}

export function accuracy(state: ScoreState): number {
  return state.shots === 0 ? 0 : state.hits / state.shots;
}
