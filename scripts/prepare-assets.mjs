// MediaPipe の WASM とモデルを public/ に用意する（自前ホストにして外部CDNへの通信をなくす）。
// dev / build の前に自動実行される。生成物は git 管理しない。
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const outDir = join(root, 'public/mediapipe');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(join(outDir, 'wasm'), { recursive: true });
for (const f of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  await copyFile(join(wasmSrc, f), join(outDir, 'wasm', f));
}

const modelPath = join(outDir, 'face_landmarker.task');
if (!(await exists(modelPath))) {
  console.log('downloading face_landmarker.task ...');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
}
console.log('mediapipe assets ready');
