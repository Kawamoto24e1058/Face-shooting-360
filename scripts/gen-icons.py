# PWA 用の PNG アイコンを生成する（public/icon.svg と同じ図柄）。
# 実行: python3 scripts/gen-icons.py （Pillow が必要）。生成物はリポジトリに含める。
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'public'
BG = (16, 16, 24, 255)
PINK = (255, 79, 163, 255)
CYAN = (79, 227, 255, 255)
WHITE = (255, 255, 255, 255)


def draw(size: int, maskable: bool, rounded: bool) -> Image.Image:
    s = size * 4  # 4倍で描いて縮小（アンチエイリアス）
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 96 // 512, fill=BG)
    else:
        d.rectangle([0, 0, s - 1, s - 1], fill=BG)
    # maskable は外周 20% が切られても良いように図柄を縮める
    k = 0.72 if maskable else 1.0
    c = s / 2
    u = s / 512 * k

    def ring(r, w, col):
        d.ellipse([c - r * u, c - r * u, c + r * u, c + r * u], outline=col, width=round(w * u))

    ring(150, 28, PINK)
    ring(60, 20, CYAN)
    w = round(20 * u)
    for a, b in [((256, 60), (256, 160)), ((256, 352), (256, 452)), ((60, 256), (160, 256)), ((352, 256), (452, 256))]:
        p0 = (c + (a[0] - 256) * u, c + (a[1] - 256) * u)
        p1 = (c + (b[0] - 256) * u, c + (b[1] - 256) * u)
        d.line([p0, p1], fill=WHITE, width=w)
        for p in (p0, p1):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


draw(192, False, True).save(OUT / 'icon-192.png')
draw(512, False, True).save(OUT / 'icon-512.png')
draw(512, True, False).save(OUT / 'icon-maskable-512.png')
# iOS は透過を黒で埋めるので角丸なし・不透明で作る
draw(180, False, False).convert('RGB').save(OUT / 'apple-touch-icon.png')
print('icons written to', OUT)
