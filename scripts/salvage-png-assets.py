from pathlib import Path
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    "images/characters/elf_female/body_back.png",
    "images/equipment/clothing/pants_shorts_front.png",
    "images/equipment/clothing/skirt_back.png",
    "images/equipment/clothing/skirt_front.png",
    "images/equipment/clothing/top_masc_buttoned.png",
    "images/equipment/clothing/top_masc_laced.png",
    "images/equipment/clothing/top_masc_lacework.png",
]

failed = []
for rel in TARGETS:
    src = ROOT / rel
    tmp = src.with_suffix(src.suffix + ".salvaged")
    try:
        with Image.open(src) as image:
            image.load()
            rgba = image.convert("RGBA")
            size = rgba.size
            bbox = rgba.getbbox()
            rgba.save(tmp, format="PNG", optimize=False)
        # Re-open with normal strict Pillow settings before replacing the source.
        old_setting = ImageFile.LOAD_TRUNCATED_IMAGES
        ImageFile.LOAD_TRUNCATED_IMAGES = False
        try:
            with Image.open(tmp) as check:
                check.load()
                if check.size != size:
                    raise RuntimeError(f"saved dimensions changed from {size} to {check.size}")
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = old_setting
        tmp.replace(src)
        print(f"Salvaged {rel}: {size[0]}x{size[1]} RGBA, non-empty bbox={bbox}")
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        failed.append((rel, str(exc)))
        print(f"FAILED {rel}: {exc}")

if failed:
    print("\nUnable to salvage all malformed PNGs:")
    for rel, error in failed:
        print(f"  {rel}: {error}")
    raise SystemExit(1)

print(f"\nSalvaged {len(TARGETS)} PNG assets with Pillow's truncated-image decoder.")
