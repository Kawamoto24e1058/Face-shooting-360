// MediaPipe の FACE_LANDMARKS_TESSELATION（辺のリスト。3本ずつが1三角形）から三角形の頂点番号を取り出し、
// src/face/tesselation.ts に書き出す。プレイ中に MediaPipe 本体を読み込まずに済むようにするため。
// 元データ: @mediapipe/tasks-vision（Apache-2.0）
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { FaceLandmarker } = await import(join(root, 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'));
const T = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
const tris = [];
for (let i = 0; i < T.length; i += 3) {
  const [a, b, c] = [T[i], T[i + 1], T[i + 2]];
  if (a.end !== b.start || b.end !== c.start || c.end !== a.start) throw new Error(`unexpected edge order at ${i}`);
  tris.push(a.start, b.start, c.start);
}
const body = `// 自動生成: scripts/gen-tesselation.mjs（元データ: MediaPipe Face Mesh, Apache-2.0）\n// 468点の顔メッシュの三角形（${tris.length / 3}枚）\nexport const FACE_TRIANGLES: readonly number[] = [${tris.join(',')}];\n`;
await writeFile(join(root, 'src/face/tesselation.ts'), body);
console.log('triangles', tris.length / 3);
