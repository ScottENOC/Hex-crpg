#!/usr/bin/env python3
"""Generates the App Store icon (1024x1024, no alpha) and a launch-screen
centered logo (1200x1200, transparent) for Hex-crpg, procedurally via PIL —
no external art dependency. Dark-fantasy palette matching the game's own UI
(#1a1f2e/#222 backgrounds, #e8c468 gold accents, #7a1f1f/#2b3a55 steel/red).
"""
import math
from PIL import Image, ImageDraw, ImageFilter

GOLD = (232, 196, 104)
GOLD_DARK = (163, 130, 60)
STEEL = (210, 215, 225)
STEEL_DARK = (120, 128, 145)
BG_TOP = (26, 31, 46)
BG_BOTTOM = (10, 11, 18)


def vertical_gradient(size, top, bottom):
    w, h = size
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        r = round(top[0] + (bottom[0] - top[0]) * t)
        g = round(top[1] + (bottom[1] - top[1]) * t)
        b = round(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def hexagon_points(cx, cy, r, rotation_deg=0):
    pts = []
    for i in range(6):
        a = math.radians(60 * i + rotation_deg)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def draw_glow(base, cx, cy, radius, color, layers=40, max_alpha=90):
    glow = Image.new('RGBA', base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(layers, 0, -1):
        t = i / layers
        rad = radius * t
        alpha = int(max_alpha * (1 - t) ** 1.5)
        gd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(*color, alpha))
    base.alpha_composite(glow)


def draw_sword(draw, cx, cy, length, color, dark_color):
    """A simple, bold, symmetric sword — tapered blade, crossguard, pommel.
    Deliberately chunky/legible at tiny icon sizes rather than ornate."""
    blade_w = length * 0.11
    blade_top = cy - length * 0.52
    blade_bottom = cy + length * 0.06
    tip = cy - length * 0.60
    # Blade (tapered polygon, pointed tip)
    draw.polygon([
        (cx, tip),
        (cx + blade_w / 2, blade_top),
        (cx + blade_w / 2, blade_bottom),
        (cx - blade_w / 2, blade_bottom),
        (cx - blade_w / 2, blade_top),
    ], fill=color, outline=dark_color, width=max(2, int(length * 0.012)))
    # Center fuller line (a subtle groove down the blade)
    draw.line([(cx, blade_top + length * 0.02), (cx, blade_bottom - length * 0.03)],
               fill=dark_color, width=max(2, int(length * 0.02)))
    # Crossguard
    guard_w = length * 0.34
    guard_h = length * 0.055
    draw.rounded_rectangle(
        [cx - guard_w / 2, blade_bottom, cx + guard_w / 2, blade_bottom + guard_h],
        radius=guard_h / 2, fill=dark_color)
    # Grip
    grip_w = length * 0.09
    grip_bottom = blade_bottom + guard_h + length * 0.20
    draw.rounded_rectangle(
        [cx - grip_w / 2, blade_bottom + guard_h, cx + grip_w / 2, grip_bottom],
        radius=grip_w / 2, fill=color)
    # Pommel
    pommel_r = length * 0.065
    draw.ellipse([cx - pommel_r, grip_bottom - pommel_r, cx + pommel_r, grip_bottom + pommel_r],
                 fill=dark_color)


def build_emblem(size, transparent_bg=False):
    """The shared icon/launch-screen artwork: gold hexagon ring + steel
    sword, centered. `size` is the full square canvas size."""
    if transparent_bg:
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    else:
        canvas = vertical_gradient((size, size), BG_TOP, BG_BOTTOM).convert('RGBA')

    cx, cy = size / 2, size / 2
    hex_r = size * 0.40

    if not transparent_bg:
        draw_glow(canvas, cx, cy, size * 0.44, GOLD, layers=50, max_alpha=70)

    draw = ImageDraw.Draw(canvas)

    # Outer hex ring (flat-top, matches the game's own hex grid orientation)
    outer_pts = hexagon_points(cx, cy, hex_r, rotation_deg=0)
    inner_pts = hexagon_points(cx, cy, hex_r * 0.90, rotation_deg=0)
    draw.polygon(outer_pts, outline=GOLD, width=max(4, int(size * 0.018)))
    draw.polygon(inner_pts, outline=GOLD_DARK, width=max(2, int(size * 0.006)))

    # Sword, centered, crossing the hex
    draw_sword(draw, cx, cy, hex_r * 1.55, STEEL, STEEL_DARK)

    return canvas


def main():
    # 1. App Store icon: 1024x1024, RGB (NO alpha — Apple rejects icons
    #    with a transparency channel), full painted background.
    icon = build_emblem(1024, transparent_bg=False).convert('RGB')
    icon.save('appstore/icon-1024.png')

    # 2. Launch-screen centered logo: transparent background, meant to sit
    #    on a solid-color LaunchScreen storyboard background in Xcode (set
    #    the background color to BG_TOP/#1a1f2e to match). Sized generously
    #    (1200) so it downscales cleanly for every device size Xcode's
    #    auto-layout centers it on.
    logo = build_emblem(1200, transparent_bg=True)
    logo.save('appstore/launch-logo-1200.png')

    # 3. A quick contact-sheet style preview at a few real icon sizes, purely
    #    so legibility at small sizes can be checked without opening Xcode.
    preview_sizes = [180, 120, 87, 60, 40]
    total_w = sum(preview_sizes) + 20 * (len(preview_sizes) - 1)
    preview = Image.new('RGB', (total_w, max(preview_sizes)), (40, 40, 40))
    x = 0
    for s in preview_sizes:
        thumb = icon.resize((s, s), Image.LANCZOS)
        preview.paste(thumb, (x, 0))
        x += s + 20
    preview.save('appstore/icon-size-preview.png')

    print('done')


if __name__ == '__main__':
    main()
