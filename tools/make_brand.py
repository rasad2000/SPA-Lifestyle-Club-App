"""Generate every SPA brand asset in apps/mobile/assets/images from the source artwork.

Run (reproducible; needs Pillow + numpy and the npm-installed Google fonts):
    uv run --no-project --with pillow --with numpy python tools/make_brand.py [--src ../brand-src/selected]

Sources (generated with Antigravity's image generator, text-free; prompts and raw outputs in
brand-src/ next to this repo, NOT committed; only the derived outputs below are):
  - hall.jpg (768x1376): the white glasshouse hall, rose-covered pillars, calm marble wall.
  - mark-monogram.jpg: "SPA" in crimson Didone caps inside a gold laurel wreath, on white.
  - mark-symbol.jpg: a gold pomegranate tree of life inside a glasshouse arch, on white.
  - poster-salon / poster-copy / poster-speaker.jpg (768x1376): the three news posters' art.
  - licht.jpg / glas.jpg (1376x768): the two Home video articles' frames.

Outputs:
  - bg-hall.jpg (1080x2340): the full-screen background. Scaled to the screen height and
    centre-cropped; the pillars' inner edges land at 13.5 % of the width (ui/frame.ts).
  - spa-mark.png (480, RGBA): the symbol keyed off its white ground (Home hero).
  - icon.png (1024), android-icon-{foreground,background,monochrome}.png, splash-icon.png,
    favicon.png: the monogram (letters read at icon size; the symbol's hairlines don't).
  - news-*.jpg (720x1280): the posters, typeset here in Bodoni Moda + Manrope (exact
    spelling; the generator is never asked for letters).
  - tex-licht.jpg / tex-glas.jpg (1080x608).
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
OUT = REPO / "apps" / "mobile" / "assets" / "images"
FONTS = REPO / "node_modules" / "@expo-google-fonts"

IVORY = (247, 242, 232)
PORCELAIN = (255, 253, 248)
CRIMSON = (142, 27, 44)
DEEP_GOLD = (118, 89, 26)
GOLD = (201, 162, 74)
INK = (43, 26, 23)


def font(family: str, weight: str, size: int) -> ImageFont.FreeTypeFont:
    folder = {"bodoni": "bodoni-moda", "manrope": "manrope"}[family]
    name = {"bodoni": "BodoniModa", "manrope": "Manrope"}[family]
    return ImageFont.truetype(str(FONTS / folder / weight / f"{name}_{weight}.ttf"), size)


def key_white(img: Image.Image) -> Image.Image:
    """Colour-to-alpha against white: the art keeps its exact colours, the paper vanishes."""
    a = np.asarray(img.convert("RGB")).astype(np.float64) / 255.0
    alpha = np.clip((1.0 - a.min(axis=2)) * 1.15, 0.0, 1.0)
    # Faint paper noise (JPEG grain on the white) → fully transparent.
    alpha[alpha < 0.04] = 0.0
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    rgb = np.clip((a - (1.0 - alpha[..., None])) / safe, 0.0, 1.0)
    out = np.dstack([rgb, alpha]) * 255.0
    return Image.fromarray(out.round().astype(np.uint8), "RGBA")


def trim(img: Image.Image, pad: float = 0.06) -> Image.Image:
    """Crop an RGBA image to its visible content, centred on a square with a margin."""
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    art = img.crop(box)
    side = int(max(art.size) * (1 + 2 * pad))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return sq


def on_ground(art: Image.Image, size: int, scale: float, ground: tuple[int, int, int] | None) -> Image.Image:
    """Centre `art` at `scale` of a `size` square, on a colour or on transparency."""
    canvas = Image.new("RGBA", (size, size), (*ground, 255) if ground else (0, 0, 0, 0))
    s = int(size * scale)
    a = art.resize((s, s), Image.LANCZOS)
    canvas.alpha_composite(a, ((size - s) // 2, (size - s) // 2))
    return canvas


def fit(img: Image.Image, w: int, h: int, anchor_y: float = 0.5) -> Image.Image:
    """Scale to cover w x h, crop centred horizontally and at `anchor_y` vertically."""
    s = max(w / img.width, h / img.height)
    big = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    x = (big.width - w) // 2
    y = int((big.height - h) * anchor_y)
    out = big.crop((x, y, x + w, y + h))
    return out.filter(ImageFilter.UnsharpMask(radius=2, percent=40, threshold=2)) if s > 1.2 else out


def hall(src: Path) -> Image.Image:
    return fit(Image.open(src / "hall.jpg").convert("RGB"), 1080, 2340)


def tracked(draw: ImageDraw.ImageDraw, cx: int, y: int, text: str, f: ImageFont.FreeTypeFont, fill, track: float):
    """Centred text with letter spacing (Pillow has none)."""
    widths = [draw.textlength(ch, font=f) for ch in text]
    total = sum(widths) + track * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths, strict=True):
        draw.text((x, y), ch, font=f, fill=fill)
        x += w + track


def poster(
    src: Path, art: str, symbol: Image.Image, label: str, title: list[str], lines: list[str], pill: str | None
) -> Image.Image:
    img = fit(Image.open(src / art).convert("RGB"), 720, 1280, anchor_y=0.5).convert("RGBA")
    # Ivory veil over the top: the type sits on calm porcelain, the art shows below.
    veil = np.zeros((1280, 720, 4), np.uint8)
    veil[..., :3] = PORCELAIN
    ys = np.arange(1280)
    veil[..., 3] = (np.clip(1.0 - (ys - 300) / 320, 0, 1) * 0.92 * 255).astype(np.uint8)[:, None]
    img.alpha_composite(Image.fromarray(veil, "RGBA"))
    d = ImageDraw.Draw(img)
    cx = 360
    img.alpha_composite(symbol.resize((92, 92), Image.LANCZOS), (cx - 46, 52))
    tracked(d, cx, 170, label, font("manrope", "600SemiBold", 17), DEEP_GOLD, 5)
    d.line([(cx - 60, 204), (cx + 60, 204)], fill=GOLD, width=2)
    y = 228
    for t in title:
        f = font("bodoni", "500Medium", 76 if len(t) <= 9 else 62)
        w = d.textlength(t, font=f)
        d.text((cx - w / 2, y), t, font=f, fill=CRIMSON)
        y += 86
    y += 6
    for line in lines:
        f = font("bodoni", "400Regular_Italic", 30) if line.startswith("_") else font("manrope", "500Medium", 21)
        text = line.lstrip("_")
        w = d.textlength(text, font=f)
        d.text((cx - w / 2, y), text, font=f, fill=INK)
        y += 40
    if pill:
        f = font("manrope", "700Bold", 18)
        w = sum(d.textlength(ch, font=f) for ch in pill) + 3 * (len(pill) - 1)
        x0, y0 = cx - w / 2 - 26, y + 16
        d.rounded_rectangle([x0, y0, cx + w / 2 + 26, y0 + 46], radius=23, fill=CRIMSON)
        tracked(d, cx, int(y0 + 12), pill, f, (255, 255, 255), 3)
    foot = font("manrope", "600SemiBold", 13)
    band = Image.new("RGBA", (720, 54), (*PORCELAIN, 225))
    img.alpha_composite(band, (0, 1226))
    tracked(d, cx, 1246, "SPA GARDEN CLUB  ·  SOCIETY  ·  PROSPERITY  ·  ABUNDANCE", foot, DEEP_GOLD, 2.2)
    return img.convert("RGB")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(REPO.parent / "brand-src" / "selected"), type=Path)
    args = ap.parse_args(argv)
    src: Path = args.src
    OUT.mkdir(parents=True, exist_ok=True)

    hall(src).save(OUT / "bg-hall.jpg", quality=86, optimize=True, progressive=True)

    symbol = trim(key_white(Image.open(src / "mark-symbol.jpg")))
    symbol.resize((480, 480), Image.LANCZOS).save(OUT / "spa-mark.png", optimize=True)

    mono = trim(key_white(Image.open(src / "mark-monogram.jpg")), pad=0.04)
    on_ground(mono, 1024, 0.78, PORCELAIN).convert("RGB").save(OUT / "icon.png", optimize=True)
    # Android adaptive: the foreground must stay inside the 66 % safe zone.
    on_ground(mono, 1024, 0.62, None).save(OUT / "android-icon-foreground.png", optimize=True)
    Image.new("RGB", (1024, 1024), PORCELAIN).save(OUT / "android-icon-background.png", optimize=True)
    mono_alpha = on_ground(mono, 1024, 0.62, None).getchannel("A")
    white = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
    white.putalpha(mono_alpha)
    white.save(OUT / "android-icon-monochrome.png", optimize=True)
    on_ground(mono, 1024, 0.9, None).save(OUT / "splash-icon.png", optimize=True)
    on_ground(mono, 48, 0.96, PORCELAIN).convert("RGB").save(OUT / "favicon.png", optimize=True)

    posters = {
        "news-garden-salon.jpg": (
            "poster-salon.jpg",
            "PRIVATE MEMBERS ONLY",
            ["GARDEN", "SALON"],
            ["_On Tour", "Hamburg · Wien · sonntags 15–18 Uhr"],
            None,
        ),
        "news-copytrader.jpg": (
            "poster-copy.jpg",
            "ANNOUNCEMENT",
            ["COPYTRADER"],
            ["_Ihr habt gewartet.", "Die Strategie unserer Mentoren, auf deinem Konto."],
            "AB MORGEN LIVE",
        ),
        "news-private-session.jpg": (
            "poster-speaker.jpg",
            "SPECIAL SPEAKER",
            ["BECOME", "MORE."],
            ["_Dr. Helena Voss", "Private Session · Dienstag · 21:00 Uhr"],
            None,
        ),
    }
    for name, (art, label, title, lines, pill) in posters.items():
        poster(src, art, symbol, label, title, lines, pill).save(
            OUT / name, quality=88, optimize=True, progressive=True
        )

    for name in ("licht", "glas"):
        fit(Image.open(src / f"{name}.jpg").convert("RGB"), 1080, 608).save(
            OUT / f"tex-{name}.jpg", quality=86, optimize=True
        )

    for p in sorted(OUT.iterdir()):
        im = Image.open(p)
        print(f"{p.name:32s} {im.size[0]}x{im.size[1]} {im.mode} {p.stat().st_size // 1024} KiB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
