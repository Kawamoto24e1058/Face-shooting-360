import { accuracy, ZONE_LABEL, ZONES, type ScoreState } from '../core/score';
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
  inAppBrowser: boolean;
  insecure: boolean;
  /** 保存済みの顔のサムネイル（無ければ null） */
  faceThumb: HTMLCanvasElement | null;
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
  for (const n of [6, 10, 12, 16, 20]) maxTargets.append(el('option', { value: String(n), textContent: `${n}体`, selected: n === s.maxTargets }));
  maxTargets.addEventListener('change', () => o.onSettings({ maxTargets: Number(maxTargets.value) }));

  const warnings: HTMLElement[] = [];
  if (o.inAppBrowser) warnings.push(el('div', { className: 'warn', textContent: 'アプリ内ブラウザではカメラやセンサーが使えない場合があります。SafariまたはChromeで開いてください。' }));
  if (o.insecure) warnings.push(el('div', { className: 'warn', textContent: 'HTTPSで開いていないため、カメラとセンサーが使えません。' }));

  return el('div', { className: 'panel' }, [
    el('h1', { textContent: 'Face360' }),
    el('p', { className: 'note', textContent: '（仮タイトル）360°見回して、出てくる顔の的を撃つ90秒のスコアアタック' }),
    ...warnings,
    el('div', { className: 'warn', textContent: '⚠ 体ごと回って遊びます。周囲に人や物がないか確認してください。座って遊ぶときは「座りモード」をONにしてください。' }),
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
    el('p', { className: 'note', textContent: `ベストスコア: ${o.bestScore.toLocaleString()}` }),
    el('p', { className: 'note', textContent: 'カメラ映像・顔データは端末内だけで処理し、外部に送信しません。' }),
  ]);
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

export function resultScreen(o: { result: ScoreState; best: number; isBest: boolean; onRetry: () => void; onTitle: () => void }): HTMLElement {
  const r = o.result;
  const rows: [string, string][] = [
    ['命中率', `${Math.round(accuracy(r) * 100)}% (${r.hits}/${r.shots})`],
    ['最大コンボ', String(r.maxCombo)],
    ...ZONES.map((z) => [ZONE_LABEL[z].replace('!', ''), String(r.zoneHits[z])] as [string, string]),
    ['ベストスコア', o.best.toLocaleString()],
  ];
  return el('div', { className: 'panel' }, [
    el('h2', { textContent: o.isBest ? 'NEW RECORD!' : 'RESULT' }),
    el('div', { className: 'big', textContent: r.score.toLocaleString() }),
    el('table', { className: 'result-table' }, [
      el('tbody', {}, rows.map(([k, v]) => el('tr', {}, [el('td', { textContent: k }), el('td', { textContent: v })]))),
    ]),
    button('もう一度', o.onRetry),
    button('タイトルへ', o.onTitle, true),
  ]);
}
