from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path('.')
CLOTHING = ROOT / 'images/equipment/clothing'

NEW_ROOT_ASSETS = [
    'top_blouse_back.png', 'top_blouse_side.png',
    'top_dress_back.png', 'top_dress_side.png',
    'top_masc_laced_back.png', 'top_masc_laced_front.png', 'top_masc_laced_side.png',
    'top_shirt_f_back.png', 'top_shirt_f_side.png',
]


def clear_edge_background(path: Path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    amin, amax = im.getchannel('A').getextrema()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if amin < 255 and all(im.getpixel(xy)[3] == 0 for xy in corners):
        print(f'already transparent: {path}')
        return
    edge = corners + [(w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    edge_rgb = [im.getpixel(xy)[:3] for xy in edge]
    dark = max(max(c) for c in edge_rgb) < 35
    threshold = 30 if dark else 60
    print(f'cleaning {path}: size={w}x{h} alpha={amin}..{amax} edge={edge_rgb} threshold={threshold}')
    for seed in edge:
        if im.getpixel(seed)[3]:
            ImageDraw.floodfill(im, seed, (0, 0, 0, 0), thresh=threshold)
    amin2, amax2 = im.getchannel('A').getextrema()
    if amin2 != 0 or amax2 == 0:
        raise RuntimeError(f'background cleanup failed for {path}: alpha {amin2}..{amax2}')
    im.save(path, optimize=True)


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found < count:
        raise RuntimeError(f'{path}: expected at least {count} occurrence(s), found {found}: {old!r}')
    p.write_text(text.replace(old, new, count))


# Clean every just-uploaded image before moving it into the clothing asset tree.
for name in NEW_ROOT_ASSETS:
    p = ROOT / name
    if not p.exists():
        raise RuntimeError(f'expected uploaded root asset missing: {name}')
    clear_edge_background(p)

# Existing unsuffixed authored images are the front views for these three families.
for stem in ['top_blouse', 'top_dress', 'top_shirt_f']:
    src = CLOTHING / f'{stem}.png'
    dst = CLOTHING / f'{stem}_front.png'
    if not src.exists():
        raise RuntimeError(f'missing existing front source: {src}')
    if dst.exists():
        dst.unlink()
    src.rename(dst)

# top_masc_laced has a newly uploaded full directional set; retire its old shared view.
(CLOTHING / 'top_masc_laced.png').unlink(missing_ok=True)

# Move the uploaded files out of the repo root into the canonical clothing folder.
for name in NEW_ROOT_ASSETS:
    src = ROOT / name
    dst = CLOTHING / name
    if dst.exists():
        dst.unlink()
    src.rename(dst)

# Wire explicit directional views into the renderer. Keep the single-path helper
# for top_masc_lacework, which still only has one authored image.
replace(
    'clothingLayers.js',
    "  const twoToneTop=(path)=>twoToneGarment('shirt',{front:path,side:path,back:path},'Main','Trim');",
    "  const twoToneTopViews=(views)=>twoToneGarment('shirt',views,'Main','Trim');\n"
    "  const twoToneTop=(path)=>twoToneTopViews({front:path,side:path,back:path});",
)
replace(
    'clothingLayers.js',
    "    top_blouse:twoToneTop('images/equipment/clothing/top_blouse.png'),\n"
    "    top_dress:{...twoToneTop('images/equipment/clothing/top_dress.png'),fitMode:'dressSplit',waistFraction:.39,maxSkirtWidth:.98},\n"
    "    top_shirt_f:twoToneTop('images/equipment/clothing/top_shirt_f.png'),\n"
    "    top_masc_lacework:twoToneTop('images/equipment/clothing/top_masc_lacework.png'),\n"
    "    top_masc_laced:twoToneTop('images/equipment/clothing/top_masc_laced.png'),",
    "    top_blouse:twoToneTopViews({front:'images/equipment/clothing/top_blouse_front.png',side:'images/equipment/clothing/top_blouse_side.png',back:'images/equipment/clothing/top_blouse_back.png'}),\n"
    "    top_dress:{...twoToneTopViews({front:'images/equipment/clothing/top_dress_front.png',side:'images/equipment/clothing/top_dress_side.png',back:'images/equipment/clothing/top_dress_back.png'}),fitMode:'dressSplit',waistFraction:.39,maxSkirtWidth:.98},\n"
    "    top_shirt_f:twoToneTopViews({front:'images/equipment/clothing/top_shirt_f_front.png',side:'images/equipment/clothing/top_shirt_f_side.png',back:'images/equipment/clothing/top_shirt_f_back.png'}),\n"
    "    top_masc_lacework:twoToneTop('images/equipment/clothing/top_masc_lacework.png'),\n"
    "    top_masc_laced:twoToneTopViews({front:'images/equipment/clothing/top_masc_laced_front.png',side:'images/equipment/clothing/top_masc_laced_side.png',back:'images/equipment/clothing/top_masc_laced_back.png'}),",
)

# Preload the directional files explicitly. Lacework intentionally retains its
# single-image fallback until separate side/back art exists.
replace(
    'assetLoadScheduler.js',
    "        const selectedTops=allViews ? tops : [tops[hash(`${race}_${gender}|top`)%tops.length]];\n"
    "        const paths=[...selectedTops.map(top=>`images/equipment/clothing/${top}.png`),'images/equipment/clothing/pants_trousers_front.png'];\n"
    "        if (allViews) paths.push('images/equipment/clothing/pants_trousers_back.png');",
    "        const selectedTops=allViews ? tops : [tops[hash(`${race}_${gender}|top`)%tops.length]];\n"
    "        const directionalTops=new Set(['top_blouse','top_dress','top_shirt_f','top_masc_laced']);\n"
    "        const topPath=(top,view='front')=>directionalTops.has(top)\n"
    "            ? `images/equipment/clothing/${top}_${view}.png`\n"
    "            : `images/equipment/clothing/${top}.png`;\n"
    "        const paths=[...selectedTops.map(top=>topPath(top,'front')),'images/equipment/clothing/pants_trousers_front.png'];\n"
    "        if (allViews) {\n"
    "            for (const top of selectedTops) {\n"
    "                if (directionalTops.has(top)) paths.push(topPath(top,'side'),topPath(top,'back'));\n"
    "            }\n"
    "            paths.push('images/equipment/clothing/pants_trousers_back.png');\n"
    "        }",
)

# Strengthen regression coverage for the new top families.
replace(
    'tests-unit/clothing-render-regression.test.js',
    "test('masculine starter tops use the two retained two-tone PNG overlays', () => {\n"
    "    const layersSource = read('clothingLayers.js');\n"
    "    const masculineAssets = [\n"
    "        'top_masc_lacework.png',\n"
    "        'top_masc_laced.png',\n"
    "    ];\n\n"
    "    for (const asset of masculineAssets) {\n"
    "        contains(layersSource, `images/equipment/clothing/${asset}`);\n"
    "    }",
    "test('starter tops use retained assets and explicit directional views where authored', () => {\n"
    "    const layersSource = read('clothingLayers.js');\n"
    "    contains(layersSource, 'images/equipment/clothing/top_masc_lacework.png');\n"
    "    for (const id of ['top_blouse','top_dress','top_shirt_f','top_masc_laced']) {\n"
    "        contains(layersSource, `front:'images/equipment/clothing/${id}_front.png'`);\n"
    "        contains(layersSource, `side:'images/equipment/clothing/${id}_side.png'`);\n"
    "        contains(layersSource, `back:'images/equipment/clothing/${id}_back.png'`);\n"
    "        excludes(layersSource, `images/equipment/clothing/${id}.png`);\n"
    "    }",
)

# Assertions: no uploaded clothing remains at repo root, no obsolete unsuffixed
# file remains for a family that now has all three views, and all new files have alpha.
for name in NEW_ROOT_ASSETS:
    if (ROOT / name).exists():
        raise RuntimeError(f'orphaned root clothing asset remains: {name}')

for stem in ['top_blouse', 'top_dress', 'top_shirt_f', 'top_masc_laced']:
    if (CLOTHING / f'{stem}.png').exists():
        raise RuntimeError(f'legacy unsuffixed asset remains: {stem}.png')
    for view in ['front', 'side', 'back']:
        p = CLOTHING / f'{stem}_{view}.png'
        if not p.exists():
            raise RuntimeError(f'missing directional asset: {p}')
        im = Image.open(p).convert('RGBA')
        amin, amax = im.getchannel('A').getextrema()
        if amin != 0 or amax == 0:
            raise RuntimeError(f'bad transparency: {p} alpha={amin}..{amax}')
        print(f'verified {p}: alpha={amin}..{amax} bbox={im.getbbox()}')

print('directional top cleanup assertions passed')
