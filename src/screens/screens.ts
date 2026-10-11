import { accuracy, ZONE_LABEL, ZONES } from '../core/score';
import type { GameResult, StageClearInfo } from '../core/game';
import { STAGES } from '../core/stages';
import type { Settings } from '../state/store';

/** 画面（タイトル・キャリブレーション・カウントダウン・リザルト）の DOM を組み立てる */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...children);
  return e;
}

function button(label: string, onClick: () => void, secondary = false): HTMLButtonElement {
  const b = el('button', { type: 'button', className: secondary ? 'btn secondary' : 'btn', textContent: label });
  b.addEventListener('click', onClick);
  return b;
}

export interface TitleOptions {
  settings: Settings;
  bestScore: number;
  bestStage: number;
  inAppBrowser: boolean;
  insecure: boolean;
  /** 保存済みの顔のサムネイル（無ければ null） */
  faceThumb: HTMLCanvasElement | null;
  pwa: {
    needRefresh: boolean;
    canInstall: boolean;
    iosGuide: boolean;
    onUpdate: () => void;
    onInstall: () => void;
  };
  /** 保存済みの顔が立体データを持っているか（旧データは平面） */
  face3d: boolean;
  onStart: () => void;
  onRecapture: () => void;
  onDeleteFace: () => void;
  onSettings: (patch: Partial<Settings>) => void;
}

export function titleScreen(o: TitleOptions): HTMLElement {
  const s = o.settings;
  const toggle = (label: string, key: 'seated' | 'camera' | 'effects') => {
    const input = el('input', { type: 'checkbox', checked: s[key] });
    input.addEventListener('change', () => o.onSettings({ [key]: input.checked }));
    return el('label', {}, [label, input]);
  };
  const volume = el('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(s.volume) });
  volume.addEventListener('input', () => o.onSettings({ volume: Number(volume.value) }));
  const maxTargets = el('select');
  const cur = Math.min(7, s.maxTargets);
  for (const n of [3, 5, 7]) maxTargets.append(el('option', { value: String(n), textContent: `${n}体`, selected: n === cur }));
  maxTargets.addEventListener('change', () => o.onSettings({ maxTargets: Number(maxTargets.value) }));

  const warnings: HTMLElement[] = [];
  if (o.inAppBrowser) warnings.push(el('div', { className: 'warn', textContent: 'アプリ内ブラウザではカメラやセンサーが使えない場合があります。SafariまたはChromeで開いてください。' }));
  if (o.insecure) warnings.push(el('div', { className: 'warn', textContent: 'HTTPSで開いていないため、カメラとセンサーが使えません。' }));

  return el('div', { className: 'panel' }, [
    el('h1', { textContent: 'Face360' }),
    el('p', { className: 'note', textContent: '（仮タイトル）360°見回して、インクを撃ってくる顔を倒し、ステージごとのボスに挑む' }),
    ...warnings,
    el('div', { className: 'warn', textContent: '⚠ 体ごと回って遊びます。周囲に人や物がないか確認してください。座って遊ぶときは「座りモード」をONにしてください。' }),
    ...(o.pwa.needRefresh
      ? [el('div', { className: 'warn row' }, ['新しいバージョンがあります', small(button('更新', o.pwa.onUpdate))])]
      : []),
    faceRow(o),
    button('スタート', o.onStart),
    el('div', { className: 'settings' }, [
      toggle('座りモード（前方のみ）', 'seated'),
      toggle('カメラ映像を使う', 'camera'),
      toggle('演出（インク・衝撃波）', 'effects'),
      el('label', {}, ['音量', volume]),
      el('label', {}, ['同時に出る的の上限', maxTargets]),
      ...(o.faceThumb ? [el('div', { className: 'setting-row' }, ['顔データ（端末内）', small(button('削除', o.onDeleteFace, true))])] : []),
    ]),
    el('p', {
      className: 'note',
      textContent:
        o.bestStage > 0
          ? `ベスト: ${o.bestStage > STAGES.length ? '全クリア' : `STAGE ${o.bestStage}`}／${o.bestScore.toLocaleString()}点`
          : `全${STAGES.length}ステージ。飛んでくるインク弾は撃ち落とせます。`,
    }),
    ...installRow(o),
    el('p', { className: 'note', textContent: 'カメラ映像・顔データは端末内だけで処理し、外部に送信しません。' }),
  ]);
}

function installRow(o: TitleOptions): HTMLElement[] {
  if (o.pwa.canInstall) {
    return [small(button('ホーム画面に追加', o.pwa.onInstall, true))];
  }
  if (o.pwa.iosGuide) {
    return [
      el('p', {
        className: 'note',
        textContent: '全画面で遊ぶには、Safari の共有ボタン →「ホーム画面に追加」から起動してください。',
      }),
    ];
  }
  return [];
}

function small(b: HTMLButtonElement): HTMLButtonElement {
  b.classList.add('small');
  return b;
}

function faceRow(o: TitleOptions): HTMLElement {
  if (!o.faceThumb) {
    return el('p', { className: 'note', textContent: 'スタートすると、最初に自分の顔写真を1枚取り込みます。' });
  }
  o.faceThumb.className = 'face-thumb';
  const row = el('div', { className: 'row' }, [o.faceThumb, small(button('顔を撮り直す', o.onRecapture, true))]);
  if (o.face3d) return row;
  return el('div', {}, [row, el('p', { className: 'note', textContent: '撮り直すと、顔が立体になります。' })]);
}

export function calibrateScreen(o: { sensor: boolean; camera: boolean; onReady: () => void }): HTMLElement {
  const lines = [
    o.sensor ? 'スマホを縦に持ち、正面を向いてください。' : 'モーションセンサーが使えないため、ドラッグで視点を動かします。',
    o.camera ? '' : 'カメラ映像の代わりに仮想の部屋を表示します。',
  ].filter(Boolean);
  return el('div', { className: 'panel clear' }, [
    el('h2', { textContent: 'キャリブレーション' }),
    ...lines.map((t) => el('p', { textContent: t, className: 'on-camera' })),
    button('ここが正面', o.onReady),
  ]);
}

export function countdownScreen(): { root: HTMLElement; set: (n: string) => void } {
  const n = el('div', { className: 'countdown' });
  return { root: el('div', { className: 'panel clear' }, [n]), set: (t) => (n.textContent = t) };
}

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** ステージクリア画面。次のステージの前に、正面を合わせ直してから始める */
export function stageClearScreen(o: { info: StageClearInfo; onNext: () => void; onTitle: () => void }): HTMLElement {
  const i = o.info;
  return el('div', { className: 'panel' }, [
    el('h2', { textContent: `STAGE ${i.stage} CLEAR!` }),
    el('div', { className: 'stars', textContent: starText(i.stars) }),
    el('p', { textContent: i.stars === 3 ? 'ノーダメージ！' : i.stars === 2 ? '被弾1回' : '被弾2回以上' }),
    el('table', { className: 'result-table' }, [
      el('tbody', {}, [
        el('tr', {}, [el('td', { textContent: 'クリアボーナス' }), el('td', { textContent: `+${i.bonus.toLocaleString()}` })]),
        el('tr', {}, [el('td', { textContent: 'ライフ' }), el('td', { textContent: '♥'.repeat(i.lives) + '（1回復）' })]),
        el('tr', {}, [el('td', { textContent: 'スコア' }), el('td', { textContent: i.score.toLocaleString() })]),
      ]),
    ]),
    el('p', { className: 'note', textContent: i.allClear ? '' : '正面を向いてから「次のステージへ」を押してください（向きを合わせ直します）。' }),
    button(i.allClear ? '結果を見る' : `STAGE ${i.stage + 1} へ`, o.onNext),
    button('タイトルへ', o.onTitle, true),
  ]);
}

export function resultScreen(o: { result: GameResult; best: number; isBest: boolean; onRetry: () => void; onTitle: () => void }): HTMLElement {
  const r = o.result;
  const rows: [string, string][] = [
    ['到達', r.allClear ? `全${STAGES.length}ステージクリア` : `STAGE ${r.stageReached}`],
    ...r.stars.map((s, i) => [`STAGE ${i + 1}`, starText(s)] as [string, string]),
    ['命中率', `${Math.round(accuracy(r) * 100)}% (${r.hits}/${r.shots})`],
    ['最大コンボ', String(r.maxCombo)],
    ...ZONES.map((z) => [ZONE_LABEL[z].replace('!', ''), String(r.zoneHits[z])] as [string, string]),
    ['ベストスコア', o.best.toLocaleString()],
  ];
  return el('div', { className: 'panel' }, [
    el('h2', { textContent: r.allClear ? 'ALL CLEAR!' : 'GAME OVER' }),
    ...(o.isBest ? [el('p', { textContent: 'NEW RECORD!' })] : []),
    el('div', { className: 'big', textContent: r.score.toLocaleString() }),
    el('table', { className: 'result-table' }, [
      el('tbody', {}, rows.map(([k, v]) => el('tr', {}, [el('td', { textContent: k }), el('td', { textContent: v })]))),
    ]),
    button('もう一度', o.onRetry),
    button('タイトルへ', o.onTitle, true),
  ]);
}
