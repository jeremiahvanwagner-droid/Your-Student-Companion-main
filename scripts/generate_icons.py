#!/usr/bin/env python3
"""
Generate the PWA icon set referenced by public/manifest.json.

Run from the repo root:  python scripts/generate_icons.py
Outputs: public/logo192.png, public/logo512.png, public/favicon.ico

Design: navy canvas (hsl(217,64%,11%) ≈ #0a192f) with the mint accent
(#64ffda) "YSC" wordmark and the accent dot from the AppShell logo.
Maskable-safe: all glyphs stay inside the inner 80% safe zone.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NAVY = (10, 25, 47, 255)        # #0a192f — app background
MINT = (100, 255, 218, 255)     # #64ffda — accent
PUBLIC = Path(__file__).resolve().parents[1] / "public"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("No usable bold TTF font found — install dejavu fonts.")


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), NAVY)
    draw = ImageDraw.Draw(img)

    # Rounded mint keyline inside the maskable safe zone
    inset = round(size * 0.10)
    radius = round(size * 0.18)
    stroke = max(2, round(size * 0.025))
    draw.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=radius,
        outline=MINT,
        width=stroke,
    )

    # Wordmark
    font = _font(round(size * 0.34))
    text = "YSC"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) / 2 - bbox[0]
    ty = (size - th) / 2 - bbox[1] - size * 0.02
    draw.text((tx, ty), text, font=font, fill=MINT)

    # Accent dot (mirrors the AppShell BookOpen badge)
    dot_r = round(size * 0.045)
    dot_cx = tx + tw + size * 0.015
    dot_cy = ty + th + size * 0.005
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=MINT,
    )
    return img


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    for size, name in [(192, "logo192.png"), (512, "logo512.png")]:
        make_icon(size).save(PUBLIC / name, "PNG")
        print(f"wrote public/{name}")

    favicon_sizes = [(16, 16), (24, 24), (32, 32), (64, 64)]
    base = make_icon(64)
    base.save(PUBLIC / "favicon.ico", sizes=favicon_sizes)
    print("wrote public/favicon.ico")


if __name__ == "__main__":
    main()
