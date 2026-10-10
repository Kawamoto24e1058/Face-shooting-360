import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { checkPose, type FaceIssue, type Pt } from './geometry';
import { makeCutout, type Cutout } from './cutout';

/**
 * MediaPipe Face Landmarker で写真から顔を取り込む。取り込み時に1回だけ実行し、プレイ中は使わない。
 * WASM とモデルは自前ホスト（public/mediapipe）から読み込み、画像はどこにも送らない。
 */

const BASE = `${import.meta.env.BASE_URL}mediapipe`;
const MAX_INPUT = 1280;
const MIN_BRIGHTNESS = 55;

export type CaptureError = 'noFace' | 'multipleFaces' | 'tooDark' | 'loadFailed' | FaceIssue;

export const CAPTURE_ERROR_MESSAGE: Record<CaptureError, string> = {
  noFace: '顔が見つかりませんでした。顔がはっきり写った写真を選んでください。',
  multipleFaces: '複数の顔が写っています。自分の顔だけが写った写真を選んでください。',
  notFrontal: '顔が横を向いています。正面を向いた写真を選んでください。',
  tooSmall: '顔が小さすぎます。顔が大きく写った写真を選んでください。',
  tooDark: '写真が暗すぎます。明るい場所で撮った写真を選んでください。',
  loadFailed: '顔の解析の準備に失敗しました。通信状況を確認して、もう一度お試しください。',
};

export type CaptureResult =
  | { ok: true; cutout: Cutout; blendshapes: Record<string, number> }
  | { ok: false; error: CaptureError };

let landmarker: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
      const options = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate },
        runningMode: 'IMAGE' as const,
        numFaces: 2,
        outputFaceBlendshapes: true,
      });
      try {
        return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
      } catch {
        return await FaceLandmarker.createFromOptions(fileset, options('CPU'));
      }
    })();
    landmarker.catch(() => (landmarker = null));
  }
  return landmarker;
}

/** 写真の向き（EXIF）を反映し、大きすぎる写真は縮小して canvas に描く */
export async function loadImage(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, MAX_INPUT / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export async function captureFace(image: HTMLCanvasElement): Promise<CaptureResult> {
  let lmk: FaceLandmarker;
  try {
    lmk = await getLandmarker();
  } catch {
    return { ok: false, error: 'loadFailed' };
  }
  const res = lmk.detect(image);
  if (res.faceLandmarks.length === 0) return { ok: false, error: 'noFace' };
  if (res.faceLandmarks.length > 1) return { ok: false, error: 'multipleFaces' };
  const px: Pt[] = res.faceLandmarks[0].map((p) => ({ x: p.x * image.width, y: p.y * image.height }));
  const issue = checkPose(px);
  if (issue) return { ok: false, error: issue };
  const cutout = makeCutout(image, px);
  if (cutout.brightness < MIN_BRIGHTNESS) return { ok: false, error: 'tooDark' };
  const blendshapes: Record<string, number> = {};
  for (const c of res.faceBlendshapes?.[0]?.categories ?? []) blendshapes[c.categoryName] = c.score;
  return { ok: true, cutout, blendshapes };
}

/** 取り込みが終わったらメモリを解放する */
export async function releaseLandmarker(): Promise<void> {
  const p = landmarker;
  landmarker = null;
  if (p) (await p.catch(() => null))?.close();
}
