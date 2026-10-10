import { CAPTURE_ERROR_MESSAGE, captureFace, loadImage, releaseLandmarker } from '../face/detect';
import type { Cutout } from '../face/cutout';
import { colorizeMask } from '../face/zoneMask';

export interface CaptureDone {
  cutout: Cutout;
  blendshapes: Record<string, number>;
}

export interface CaptureOptions {
  /** 「この顔で遊ぶ」のタップ内で呼ばれる（センサー許可をここで取るため同期で呼ぶ） */
  onConfirm: (face: CaptureDone) => void;
  onSkip: () => void;
  onBack: () => void;
}

/** 顔の取り込み：撮影/選択 → 検出・切り抜き → 確認と同意 */
export function captureScreen(o: CaptureOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'panel';

  const fileInput = (capture: boolean) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    if (capture) i.setAttribute('capture', 'user');
    i.hidden = true;
    i.addEventListener('change', () => {
      const f = i.files?.[0];
      i.value = '';
      if (f) void process(f);
    });
    return i;
  };
  const shoot = fileInput(true);
  const pick = fileInput(false);

  const btn = (label: string, onClick: () => void, cls = 'btn') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  };

  function renderSelect(message?: string) {
    root.replaceChildren(
      h('h2', '顔の取り込み'),
      h('p', '正面を向いた、自分の顔だけが写った明るい写真を使います。'),
      ...(message ? [h('div', message, 'warn')] : []),
      btn('カメラで撮影', () => shoot.click()),
      btn('写真を選ぶ', () => pick.click(), 'btn secondary'),
      h('p', '写真の解析・切り抜き・保存はすべてこの端末の中で行い、外部には送信しません。', 'note'),
      btn('サンプルの顔で遊ぶ', o.onSkip, 'btn secondary'),
      btn('戻る', o.onBack, 'link'),
      shoot,
      pick,
    );
  }

  function renderBusy() {
    root.replaceChildren(h('h2', '解析中…'), h('p', '端末内で顔を検出しています（初回は準備に数秒かかります）。', 'note'));
  }

  function renderPreview(done: CaptureDone) {
    const preview = document.createElement('div');
    preview.className = 'face-preview';
    const tex = done.cutout.texture;
    tex.className = 'face-img';
    const mask = colorizeMask(done.cutout.mask);
    mask.className = 'face-mask';
    mask.hidden = true;
    preview.append(tex, mask);

    const showZones = document.createElement('input');
    showZones.type = 'checkbox';
    showZones.addEventListener('change', () => (mask.hidden = !showZones.checked));

    const consent = document.createElement('input');
    consent.type = 'checkbox';
    const go = btn('この顔で遊ぶ', () => {
      if (!consent.checked) return;
      void releaseLandmarker();
      o.onConfirm(done);
    });
    go.disabled = true;
    consent.addEventListener('change', () => (go.disabled = !consent.checked));

    root.replaceChildren(
      h('h2', 'この顔で遊びますか？'),
      preview,
      label('部位の判定エリアを表示', showZones),
      label('これは自分の顔です（他人の顔は使いません）', consent, 'consent'),
      go,
      btn('撮り直す', () => renderSelect(), 'btn secondary'),
    );
  }

  async function process(file: File) {
    renderBusy();
    try {
      const img = await loadImage(file);
      const r = await captureFace(img);
      if (r.ok) renderPreview({ cutout: r.cutout, blendshapes: r.blendshapes });
      else renderSelect(CAPTURE_ERROR_MESSAGE[r.error]);
    } catch {
      renderSelect('写真を読み込めませんでした。別の写真でお試しください。');
    }
  }

  renderSelect();
  return root;
}

function h(tag: 'h2' | 'p' | 'div', text: string, cls?: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

function label(text: string, input: HTMLInputElement, cls = ''): HTMLLabelElement {
  const l = document.createElement('label');
  l.className = `check ${cls}`;
  l.append(input, text);
  return l;
}
