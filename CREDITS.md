# CREDITS

素材の出典とライセンスをここにまとめる。素材を追加したら必ず追記すること。

## ライブラリ

| 名前 | ライセンス | 用途 |
| --- | --- | --- |
| [three.js](https://github.com/mrdoob/three.js) | MIT | 3D描画 |
| [zustand](https://github.com/pmndrs/zustand) | MIT | 状態管理 |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | MIT | PWA化 |
| [@mediapipe/tasks-vision](https://github.com/google-ai-edge/mediapipe) | Apache-2.0 | 顔検出（WASM） |
| 標準顔モデルの座標（`src/face/canonical.ts`） | Apache-2.0 | MediaPipe `canonical_face_model.obj` から生成 |
| 的の装飾（フード・帽子など） | 自作（コードで組み立て） | - |
| 顔メッシュの三角形（`src/face/tesselation.ts`） | Apache-2.0 | `@mediapipe/tasks-vision` の FACE_LANDMARKS_TESSELATION から生成 |
| [Face Landmarker モデル](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Apache-2.0 | 顔ランドマーク（`face_landmarker.task`、ビルド時に取得して同梱） |

## 画像・音・フォント

| 素材 | 出典 | ライセンス |
| --- | --- | --- |
| アイコン（`public/icon.svg`、PNG 各種） | 自作（PNG は `scripts/gen-icons.py` で生成） | - |
| ダミー顔・インク飛沫 | コード内で図形描画（自作） | - |
| 効果音 | Web Audio でその場で合成（自作） | - |
| フォント | 端末のシステムフォントを使用 | - |

外部の効果音・BGM・フォントを使う場合は、再配布可能なライセンスのものに限る。
