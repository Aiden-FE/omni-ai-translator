#!/usr/bin/env python3
"""
Generate extension icons for Omni AI Translator.

Produces 16/32/48/128px PNG icons using the sunlit teal design token:
  - Background: HSL(174, 84%, 27%) -- --primary (sunlit teal)
  - Foreground: HSL(36, 100%, 98%) -- --background (warm white)
  - Character:  「译」 centered, bold

Icons are rendered at 4x supersampling then Lanczos-downscaled for quality.
"""

import colorsys
import math
import os
from PIL import Image, ImageDraw, ImageFont

# --- Design tokens (from shared/styles/tokens.css) ---

def hsl_to_rgb(h, s, l):
    """Convert HSL (degrees, 0-1, 0-1) to RGB 0-255 tuple."""
    r, g, b = colorsys.hls_to_rgb(h / 360, l, s)
    return (int(r * 255), int(g * 255), int(b * 255))

TEAL = hsl_to_rgb(174, 0.84, 0.27)       # --primary
WARM_WHITE = hsl_to_rgb(36, 1.00, 0.98)   # --background (warm white)

# --- Font path ---

FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"

# --- Icon sizes ---

SIZES = [16, 32, 48, 128]
SCALE = 4  # supersampling factor

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icon")


def rounded_rectangle_mask(size, radius):
    """Create a rounded rectangle alpha mask."""
    img = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=radius,
        fill=255,
    )
    return img


def generate_icon(size):
    """Generate a single icon at the given pixel size."""
    render_size = size * SCALE
    radius = int(render_size * 0.2)  # 20% corner radius

    # Create transparent canvas
    img = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))

    # Draw rounded rectangle with teal background
    mask = rounded_rectangle_mask(render_size, radius)
    bg_layer = Image.new("RGBA", (render_size, render_size), TEAL + (255,))
    img = Image.composite(bg_layer, img, mask)

    # Draw 「译」 character
    # Font size: ~60% of icon size for larger icons, ~70% for 16px
    if size <= 16:
        font_ratio = 0.72
    elif size <= 32:
        font_ratio = 0.65
    else:
        font_ratio = 0.60

    font_size = int(render_size * font_ratio)
    font = ImageFont.truetype(FONT_PATH, font_size)

    draw = ImageDraw.Draw(img)
    char = "译"

    # Measure text
    bbox = draw.textbbox((0, 0), char, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Center the character
    x = (render_size - text_w) / 2 - bbox[0]
    y = (render_size - text_h) / 2 - bbox[1]

    draw.text((x, y), char, fill=WARM_WHITE + (255,), font=font)

    # Downscale with Lanczos
    img = img.resize((size, size), Image.LANCZOS)
    return img


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for size in SIZES:
        img = generate_icon(size)
        path = os.path.join(OUTPUT_DIR, f"{size}.png")
        img.save(path, "PNG")
        print(f"Generated {path} ({size}x{size})")

    print(f"\nAll {len(SIZES)} icons generated in {os.path.abspath(OUTPUT_DIR)}")


if __name__ == "__main__":
    main()
