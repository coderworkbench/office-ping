#!/usr/bin/env python3
"""
Office Ping — icon generation.

Produces the full install-icon suite plus favicons:

    frontend/public/
      icons/icon-192.png              (regular, with soft bezel)
      icons/icon-512.png
      icons/icon-180-apple.png        (apple touch icon)
      icons/icon-maskable-192.png     (full-bleed, safe area for Android masking)
      icons/icon-maskable-512.png
      favicon.ico                     (16/32/48)
      favicon.svg                     (crisp vector)
      logo-mark.svg                   (used inline in the app chrome)
      wordmark.svg                    (serif wordmark used on marketing surfaces)
"""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFilter
import os
import pathlib

ROOT = pathlib.Path("/home/it-dev/Documents/TGF/OPS/office-ping/frontend/public")
ICONS = ROOT / "icons"
ICONS.mkdir(parents=True, exist_ok=True)

# Palette
SLAB   = (15, 19, 34)       # #0F1322
EMBER  = (220, 38, 38)      # #DC2626
CREAM  = (243, 232, 211)    # #F3E8D3
INK    = (15, 23, 42)

# ----------- Core raster mark ------------------------------------------------

def draw_mark(size: int, bg=SLAB, masked: bool = False) -> Image.Image:
    """Draw the Office Ping mark at `size` pixels.

    masked=True produces a full-bleed design (for maskable PWA icons where
    the OS applies a shape mask). masked=False includes a soft safe-area
    bezel suitable for standalone display.
    """
    # Work at 4× then downsample for antialiasing
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Background
    if masked:
        d.rectangle([0, 0, s, s], fill=bg + (255,))
    else:
        # iOS-ish rounded square
        r = int(s * 0.22)
        d.rounded_rectangle([0, 0, s, s], radius=r, fill=bg + (255,))
        # subtle inner glow near center (ember @ low alpha, blurred)
        glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([int(s*0.18), int(s*0.18), int(s*0.82), int(s*0.82)],
                   fill=EMBER + (50,))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=s * 0.06))
        img.alpha_composite(glow)

    # ---- the mark itself ----
    # Optical center: nudge dot slightly left; arcs open rightward.
    cx = int(s * 0.44)
    cy = int(s * 0.50)

    # Two warm arcs — outer first, inner over top
    # Arcs sweep from top-right to bottom-right (opening right)
    inner_r = int(s * 0.19)
    outer_r = int(s * 0.30)
    stroke_outer = max(2, int(s * 0.038))
    stroke_inner = max(2, int(s * 0.044))

    def draw_arc(radius, stroke, color, alpha=255, start=-55, end=55):
        d.arc(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            start=start, end=end,
            fill=color + (alpha,), width=stroke,
        )

    draw_arc(outer_r, stroke_outer, CREAM, alpha=180)
    draw_arc(inner_r, stroke_inner, CREAM, alpha=255)

    # The pinging dot — solid ember
    dot_r = int(s * 0.075)
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
              fill=EMBER + (255,))
    # tiny highlight to give the dot "lit" quality
    hr = int(dot_r * 0.4)
    d.ellipse([cx - int(dot_r * 0.35), cy - int(dot_r * 0.6),
               cx - int(dot_r * 0.35) + hr, cy - int(dot_r * 0.6) + hr],
              fill=(255, 255, 255, 90))

    return img.resize((size, size), Image.LANCZOS)


# ----------- Outputs ---------------------------------------------------------

def save(img, path):
    img.save(path, "PNG")
    print("wrote", path)


def main():
    # Standard install icons
    save(draw_mark(192), ICONS / "icon-192.png")
    save(draw_mark(512), ICONS / "icon-512.png")
    # Apple touch icon (iOS already masks to square-rounded)
    save(draw_mark(180), ICONS / "icon-180-apple.png")
    # Maskable (Android adaptive) — full bleed, safe area ≈80%
    save(draw_mark(192, masked=True), ICONS / "icon-maskable-192.png")
    save(draw_mark(512, masked=True), ICONS / "icon-maskable-512.png")

    # Favicon — multi-size .ico
    sizes = [16, 32, 48]
    images = [draw_mark(s) for s in sizes]
    images[0].save(ROOT / "favicon.ico", sizes=[(s, s) for s in sizes])
    print("wrote", ROOT / "favicon.ico")

    # Vector logo-mark (SVG) — identical geometry, infinitely crisp
    (ROOT / "logo-mark.svg").write_text(LOGO_SVG, encoding="utf-8")
    print("wrote", ROOT / "logo-mark.svg")
    (ROOT / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    print("wrote", ROOT / "favicon.svg")


# SVG spec — matches the raster mark 1:1 via a 100-unit viewbox.
LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" aria-label="Office Ping">
  <defs>
    <clipPath id="rc"><rect width="100" height="100" rx="22" ry="22"/></clipPath>
  </defs>
  <g clip-path="url(#rc)">
    <rect width="100" height="100" fill="#0F1322"/>
    <circle cx="50" cy="50" r="32" fill="#DC2626" opacity="0.18" filter="blur(6)"/>
    <!-- outer arc -->
    <path d="M 55.5 23 A 30 30 0 0 1 55.5 77" stroke="#F3E8D3" stroke-opacity="0.65"
          stroke-width="4" fill="none" stroke-linecap="round"/>
    <!-- inner arc -->
    <path d="M 51.5 31 A 19 19 0 0 1 51.5 69" stroke="#F3E8D3"
          stroke-width="5" fill="none" stroke-linecap="round"/>
    <!-- dot -->
    <circle cx="44" cy="50" r="7.5" fill="#DC2626"/>
    <circle cx="42" cy="47" r="2.2" fill="#ffffff" fill-opacity="0.45"/>
  </g>
</svg>
"""

FAVICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="22" ry="22" fill="#0F1322"/>
  <path d="M 55.5 23 A 30 30 0 0 1 55.5 77" stroke="#F3E8D3" stroke-opacity="0.65"
        stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M 51.5 31 A 19 19 0 0 1 51.5 69" stroke="#F3E8D3"
        stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="44" cy="50" r="8" fill="#DC2626"/>
</svg>
"""


if __name__ == "__main__":
    main()
