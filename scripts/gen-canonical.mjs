// MediaPipe の標準顔モデル（canonical_face_model.obj, Apache-2.0）から 468 点の座標を取り出し、
// src/face/canonical.ts に書き出す。顔の「形」はこの平均的な顔を使い、見た目は本人の写真を貼る。
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL =
  'https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = await fetch(URL);
if (!res.ok) throw new Error(`download failed: ${res.status}`);
const v = (await res.text())
  .split('\n')
  .filter((l) => l.startsWith('v '))
  .map((l) => l.trim().split(/\s+/).slice(1).map(Number));
if (v.length !== 468) throw new Error(`unexpected vertex count ${v.length}`);
const flat = v.flat().map((n) => Math.round(n * 1000) / 1000);
const body =
  `// 自動生成: scripts/gen-canonical.mjs（元データ: MediaPipe canonical_face_model.obj, Apache-2.0）\n` +
  `// 468点の標準顔（x 右, y 上, z 手前。単位はおおよそ cm）。添字はランドマーク番号と同じ\n` +
  `export const CANONICAL_FACE: readonly number[] = [${flat.join(',')}];\n`;
await writeFile(join(root, 'src/face/canonical.ts'), body);
console.log('vertices', v.length);
