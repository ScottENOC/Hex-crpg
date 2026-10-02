from pathlib import Path
from PIL import Image

ROOT = Path('.')
CLOTHING = ROOT / 'images/equipment/clothing'


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found < count:
        raise RuntimeError(f'{path}: expected at least {count} occurrence(s), found {found}: {old!r}')
    p.write_text(text.replace(old, new, count))


def remove_line(path, line):
    replace(path, line + '\n', '')


# The three uploaded female side views face left while the game's canonical side
# direction faces right. Flip the already-cleaned transparent PNGs in place.
for name in ['top_blouse_side.png', 'top_dress_side.png', 'top_shirt_f_side.png']:
    path = CLOTHING / name
    im = Image.open(path).convert('RGBA')
    amin, amax = im.getchannel('A').getextrema()
    if amin != 0 or amax == 0:
        raise RuntimeError(f'expected transparent side asset before flip: {path}, alpha={amin}..{amax}')
    im.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(path, optimize=True)
    print(f'flipped side view to face right: {path}')

# Retire the final single-view male shirt. top_masc_laced now provides the sole
# masculine starter top and has explicit front/side/back artwork.
(CLOTHING / 'top_masc_lacework.png').unlink(missing_ok=True)

replace(
    'clothingLayers.js',
    "  const twoToneTopViews=(views)=>twoToneGarment('shirt',views,'Main','Trim');\n"
    "  const twoToneTop=(path)=>twoToneTopViews({front:path,side:path,back:path});",
    "  const twoToneTopViews=(views)=>twoToneGarment('shirt',views,'Main','Trim');",
)
remove_line('clothingLayers.js', "    top_masc_lacework:twoToneTop('images/equipment/clothing/top_masc_lacework.png'),")
replace(
    'clothingLayers.js',
    "  const MASCULINE_START_TOPS=['top_masc_lacework','top_masc_laced'];",
    "  const MASCULINE_START_TOPS=['top_masc_laced'];",
)
replace(
    'clothingLayers.js',
    "  const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','traveler_garb']);",
    "  const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','top_masc_lacework','traveler_garb']);",
)
replace(
    'clothingLayers.js',
    "      top_masc_lacework:'Lacework Shirt',top_masc_laced:'Laced Tunic',",
    "      top_masc_laced:'Laced Tunic',",
)

replace(
    'clothingSystem.js',
    "  const RETIRED_GARMENTS=new Set(['fine_tunic','noble_doublet','scholars_robe','traveler_garb','top_masc_toggle','top_masc_buttoned']);",
    "  const RETIRED_GARMENTS=new Set(['fine_tunic','noble_doublet','scholars_robe','traveler_garb','top_masc_toggle','top_masc_buttoned','top_masc_lacework']);",
)

replace(
    'assetLoadScheduler.js',
    "            : ['top_masc_lacework','top_masc_laced'];",
    "            : ['top_masc_laced'];",
)
remove_line('companionFashionPreferences.js', "  top_masc_lacework:{ masculine:.9, structured:.45, fitted:.45, ornate:.55 },")
replace(
    'fashionMarket.js',
    "    top_blouse:28,top_dress:48,top_shirt_f:26,top_masc_lacework:30,\n    top_masc_laced:28,pants_baggy_wraps:18,pants_breeches:28,",
    "    top_blouse:28,top_dress:48,top_shirt_f:26,top_masc_laced:28,\n    pants_baggy_wraps:18,pants_breeches:28,",
)

# Regression coverage now requires every active starter top to have three explicit views.
t = 'tests-unit/clothing-render-regression.test.js'
replace(
    t,
    "    contains(layersSource, 'images/equipment/clothing/top_masc_lacework.png');\n"
    "    for (const id of ['top_blouse','top_dress','top_shirt_f','top_masc_laced']) {",
    "    for (const id of ['top_blouse','top_dress','top_shirt_f','top_masc_laced']) {",
)
replace(
    t,
    "    contains(layersSource, \"const MASCULINE_START_TOPS=['top_masc_lacework','top_masc_laced'];\");",
    "    contains(layersSource, \"const MASCULINE_START_TOPS=['top_masc_laced'];\");",
)
replace(
    t,
    "    contains(layersSource, \"const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','traveler_garb']);\");",
    "    contains(layersSource, \"const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','top_masc_lacework','traveler_garb']);\");",
)
replace(
    t,
    "    excludes(layersSource, \"top_tunic:singleLayer('shirt'\");",
    "    excludes(layersSource, \"top_tunic:singleLayer('shirt'\");\n"
    "    excludes(layersSource, 'images/equipment/clothing/top_masc_lacework.png');",
)

# Validate all four newly directional top families remain transparent after flips.
for stem in ['top_blouse', 'top_dress', 'top_shirt_f', 'top_masc_laced']:
    if (CLOTHING / f'{stem}.png').exists():
        raise RuntimeError(f'legacy unsuffixed asset remains: {stem}.png')
    for view in ['front', 'side', 'back']:
        path = CLOTHING / f'{stem}_{view}.png'
        if not path.exists():
            raise RuntimeError(f'missing directional asset: {path}')
        im = Image.open(path).convert('RGBA')
        amin, amax = im.getchannel('A').getextrema()
        if amin != 0 or amax == 0:
            raise RuntimeError(f'bad transparency: {path}, alpha={amin}..{amax}')

if (CLOTHING / 'top_masc_lacework.png').exists():
    raise RuntimeError('retired lacework shirt asset still exists')

# top_masc_lacework may remain only in explicit retirement/migration declarations
# and the regression test that confirms it cannot return from old saves.
allowed_lacework = {
    'clothingLayers.js',
    'clothingSystem.js',
    'tests-unit/clothing-render-regression.test.js',
    'scripts/tmp_directional_top_cleanup.py',
}
unexpected = []
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts:
        continue
    if path.as_posix() == '.github/workflows/directional-top-cleanup.yml':
        continue
    if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.svg'}:
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    if 'top_masc_lacework' in text and path.as_posix() not in allowed_lacework:
        unexpected.append(path.as_posix())
if unexpected:
    raise RuntimeError(f'unexpected live top_masc_lacework references: {unexpected}')

# The file audit also documents the one remaining exception rather than hiding it:
# trousers still lack a true side image and intentionally use their front image.
if (CLOTHING / 'pants_trousers_side.png').exists():
    print('pants_trousers now has a true side asset')
else:
    print('AUDIT: pants_trousers_side.png is still missing; renderer currently uses front fallback')

print('final clothing direction cleanup assertions passed')
