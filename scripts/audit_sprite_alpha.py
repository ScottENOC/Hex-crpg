#!/usr/bin/env python3
from pathlib import Path
from PIL import Image

ROOT = Path('images')
rows = []
for path in sorted(ROOT.rglob('*.png')):
    try:
        with Image.open(path) as im:
            rgba = im.convert('RGBA')
            alpha = rgba.getchannel('A')
            bbox = alpha.getbbox()
            w, h = rgba.size
            if not bbox:
                crop_w = crop_h = 0
                saved = 100.0
                margins = (w, h, 0, 0)
            else:
                left, top, right, bottom = bbox
                crop_w, crop_h = right - left, bottom - top
                saved = 100.0 * (1.0 - (crop_w * crop_h) / (w * h))
                margins = (left, top, w - right, h - bottom)
            if saved > 0.01:
                rows.append((saved, w*h*4, path.as_posix(), w, h, crop_w, crop_h, *margins))
    except Exception as exc:
        print(f'ERROR\t{path}\t{exc}')

rows.sort(reverse=True)
print('saved_pct\tdecoded_MiB\tpath\toriginal\tcrop\tmargins_LTRB')
for saved, decoded, path, w, h, cw, ch, l, t, r, b in rows:
    print(f'{saved:6.2f}\t{decoded/1024/1024:7.2f}\t{path}\t{w}x{h}\t{cw}x{ch}\t{l},{t},{r},{b}')
