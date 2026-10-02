from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path('.')
CLOTHING = ROOT / 'images/equipment/clothing'


def clear_edge_background(path: Path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    amin, amax = im.getchannel('A').getextrema()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if amin < 255 and all(im.getpixel(xy)[3] == 0 for xy in corners):
        print(f'skip already transparent: {path}')
        return
    edge = corners + [(w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    rgb = [im.getpixel(xy)[:3] for xy in edge]
    dark = max(max(c) for c in rgb) < 30
    threshold = 28 if dark else 55
    for seed in edge:
        if im.getpixel(seed)[3]:
            ImageDraw.floodfill(im, seed, (0, 0, 0, 0), thresh=threshold)
    amin2, amax2 = im.getchannel('A').getextrema()
    if amin2 != 0 or amax2 == 0:
        raise RuntimeError(f'background cleanup failed for {path}: alpha {amin2}..{amax2}')
    im.save(path, optimize=True)
    print(f'cleaned {path}: {w}x{h}, alpha {amin2}..{amax2}, threshold={threshold}')


def replace(path, old, new, count=1):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n < count:
        raise RuntimeError(f'{path}: expected at least {count} occurrence(s), found {n}: {old[:120]!r}')
    p.write_text(s.replace(old, new, count))


def remove_line(path, text):
    replace(path, text + '\n', '')


# Clean the newly uploaded opaque sprites. Include the two existing front images
# because they are being renamed into directional families; already-transparent
# files are detected and left pixel-identical.
for name in [
    'bra_side.png', 'briefs_female_side.png',
    'pants_baggy_wraps_back.png', 'pants_baggy_wraps_front.png', 'pants_baggy_wraps_side.png',
    'pants_breaches_back.png', 'pants_breaches_side.png',
    'pants_hose_back.png', 'pants_hose_side.png',
    'pants_breeches.png', 'pants_hose.png',
]:
    p = CLOTHING / name
    if p.exists():
        clear_edge_background(p)

# Normalise the two families whose old front file lacked a suffix, and correct
# the accidental 'breaches' spelling in the new breeches side/back uploads.
for src, dst in {
    'pants_breeches.png': 'pants_breeches_front.png',
    'pants_breaches_back.png': 'pants_breeches_back.png',
    'pants_breaches_side.png': 'pants_breeches_side.png',
    'pants_hose.png': 'pants_hose_front.png',
}.items():
    s, d = CLOTHING / src, CLOTHING / dst
    if d.exists():
        d.unlink()
    s.rename(d)

# New three-view wrap set supersedes the old unsuffixed image.
(CLOTHING / 'pants_baggy_wraps.png').unlink(missing_ok=True)

# Explicitly retired artwork.
for name in [
    'traveler_garb_front.svg', 'traveler_garb_side.svg', 'traveler_garb_back.svg',
    'top_masc_buttoned.png', 'top_masc_toggle.png',
]:
    (CLOTHING / name).unlink(missing_ok=True)

# Wire all of the new directional images into the clothing renderer.
p = 'clothingLayers.js'
remove_line(p, "    top_masc_toggle:twoToneTop('images/equipment/clothing/top_masc_toggle.png'),")
remove_line(p, "    top_masc_buttoned:twoToneTop('images/equipment/clothing/top_masc_buttoned.png'),")
replace(
    p,
    "    pants_baggy_wraps:singleLayer('pants','images/equipment/clothing/pants_baggy_wraps.png','Baggy wraps'),\n"
    "    pants_breeches:singleLayer('pants','images/equipment/clothing/pants_breeches.png','Breeches'),\n"
    "    pants_hose:singleLayer('pants','images/equipment/clothing/pants_hose.png','Hose'),",
    "    pants_baggy_wraps:singleLayerViews('pants',{front:'images/equipment/clothing/pants_baggy_wraps_front.png',side:'images/equipment/clothing/pants_baggy_wraps_side.png',back:'images/equipment/clothing/pants_baggy_wraps_back.png'},'Baggy wraps'),\n"
    "    pants_breeches:singleLayerViews('pants',{front:'images/equipment/clothing/pants_breeches_front.png',side:'images/equipment/clothing/pants_breeches_side.png',back:'images/equipment/clothing/pants_breeches_back.png'},'Breeches'),\n"
    "    pants_hose:singleLayerViews('pants',{front:'images/equipment/clothing/pants_hose_front.png',side:'images/equipment/clothing/pants_hose_side.png',back:'images/equipment/clothing/pants_hose_back.png'},'Hose'),",
)
replace(
    p,
    "      front:'images/equipment/clothing/briefs_female_front.png',\n      back:'images/equipment/clothing/briefs_female_back.png',",
    "      front:'images/equipment/clothing/briefs_female_front.png',\n      side:'images/equipment/clothing/briefs_female_side.png',\n      back:'images/equipment/clothing/briefs_female_back.png',",
)
replace(
    p,
    "      front:'images/equipment/clothing/bra_front.png',\n      back:'images/equipment/clothing/bra_back.png',",
    "      front:'images/equipment/clothing/bra_front.png',\n      side:'images/equipment/clothing/bra_side.png',\n      back:'images/equipment/clothing/bra_back.png',",
)
replace(
    p,
    "  const MASCULINE_START_TOPS=['top_masc_toggle','top_masc_lacework','top_masc_laced','top_masc_buttoned'];",
    "  const MASCULINE_START_TOPS=['top_masc_lacework','top_masc_laced'];",
)
replace(
    p,
    "  const RETIRED_TOPS=new Set(['top_shirt','top_tunic']);",
    "  const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','traveler_garb']);",
)
replace(
    p,
    "  const PLAYER_DEFAULT={shirt:'top_masc_toggle',pants:STARTER_PANTS,underwear:'underwear_briefs',bra:'underwear_bra'};",
    "  const PLAYER_DEFAULT={shirt:'top_masc_laced',pants:STARTER_PANTS,underwear:'underwear_briefs',bra:'underwear_bra'};",
)
legacy = """  function legacy(itemId){
    if(itemId!=='traveler_garb') return null;
    return {slot:'shirt',layers:[{id:'base',label:'Base',defaultColor:{hue:28,saturation:76,value:70,opacity:1},views:{
      front:'images/equipment/clothing/traveler_garb_front.svg',
      side:'images/equipment/clothing/traveler_garb_side.svg',
      back:'images/equipment/clothing/traveler_garb_back.svg',
    }}]};
  }

"""
replace(p, legacy, '')
replace(
    p,
    "    const item=window.items?.[itemId], builtin=GARMENTS[itemId], old=legacy(itemId);\n"
    "    if(!item&&!builtin&&!old) return null;\n"
    "    const source=builtin||old;",
    "    const item=window.items?.[itemId], builtin=GARMENTS[itemId];\n"
    "    if(!item&&!builtin) return null;\n"
    "    const source=builtin;",
)
replace(
    p,
    "      top_masc_toggle:'Toggle Tunic',top_masc_lacework:'Lacework Shirt',top_masc_laced:'Laced Tunic',top_masc_buttoned:'Buttoned Work Shirt',",
    "      top_masc_lacework:'Lacework Shirt',top_masc_laced:'Laced Tunic',",
)
replace(
    p,
    "    // but widen the central chest/waist. Legacy traveller garb is a composite\n"
    "    // SVG (shirt + lower tunic + boots), so leave it on its historical path.\n"
    "    if(slot==='shirt'){\n"
    "      if(hasFeminineBody(entity)&&itemId!=='traveler_garb') return drawFeminineTop(ctx,source,trim,targetX,targetY,targetW,targetH,itemId,v);",
    "    // but widen the central chest/waist.\n"
    "    if(slot==='shirt'){\n"
    "      if(hasFeminineBody(entity)) return drawFeminineTop(ctx,source,trim,targetX,targetY,targetW,targetH,itemId,v);",
)

# Purge retired IDs from old saves/market caches while removing them from live
# catalogues and renderer paths.
replace(
    'clothingSystem.js',
    "  const RETIRED_GARMENTS=new Set(['fine_tunic','noble_doublet','scholars_robe']);",
    "  const RETIRED_GARMENTS=new Set(['fine_tunic','noble_doublet','scholars_robe','traveler_garb','top_masc_toggle','top_masc_buttoned']);",
)
remove_line('equipment.js', "    'traveler_garb':  { id: 'traveler_garb',  name: \"Traveler's Garb\",  type: 'clothes', buyPrice: 15, description: 'Plain, practical, well-worn.' },")
remove_line('gameEngine.js', "    traveler_garb:  { shirtHue: 30,  pantsHue: 25,  satMult: 0.7 },")
replace(
    'civilianVisualDiversity.js',
    "        farmer: 'traveler_garb', labourer: 'traveler_garb', merchant: 'fine_tunic',\n"
    "        smith: 'traveler_garb', fisher: 'traveler_garb', hunter: 'traveler_garb',\n"
    "        clerk: 'scholars_robe', tavern_worker: 'traveler_garb', craftsperson: 'traveler_garb',",
    "        farmer: 'fine_tunic', labourer: 'fine_tunic', merchant: 'fine_tunic',\n"
    "        smith: 'fine_tunic', fisher: 'fine_tunic', hunter: 'fine_tunic',\n"
    "        clerk: 'scholars_robe', tavern_worker: 'fine_tunic', craftsperson: 'fine_tunic',",
)
replace(
    'campaign2Content.js',
    "window.campaign2ClothierItems = ['traveler_garb', 'fine_tunic', 'noble_doublet', 'scholars_robe'];",
    "window.campaign2ClothierItems = ['fine_tunic', 'noble_doublet', 'scholars_robe'];",
)

dp = 'directionalPresentationFixes.js'
replace(dp, "    let registryReady = false;\n    let clothingAssetsRefreshed = false;", "    let registryReady = false;")
refresh_block = """    function refreshClothingAssets() {
        const target = window.CLOTHING_ASSETS?.traveler_garb;
        if (!target || clothingAssetsRefreshed) return false;
        const paths = {
            front:'images/equipment/clothing/traveler_garb_front.svg',
            side:'images/equipment/clothing/traveler_garb_side.svg',
            back:'images/equipment/clothing/traveler_garb_back.svg',
        };
        for (const [view,path] of Object.entries(paths)) {
            const img = window.assetManager.request(path);
            window.assetManager.whenReady(path).then(() => { window.drawMap?.(); window.renderEntities?.(); }).catch(() => {});
            target[view] = img;
        }
        clothingAssetsRefreshed = true;
        return true;
    }

"""
replace(dp, refresh_block, '')
remove_line(dp, '        refreshClothingAssets();')
replace(
    dp,
    "        if (registryReady && window.CLOTHING_VISUALS && clothingAssetsRefreshed && window.__femaleBaseClothingRecolorV4Installed) {",
    "        if (registryReady && window.CLOTHING_VISUALS && window.__femaleBaseClothingRecolorV4Installed) {",
)

replace(
    'fashionMarket.js',
    "    top_blouse:28,top_dress:48,top_shirt_f:26,top_masc_toggle:24,top_masc_lacework:30,\n"
    "    top_masc_laced:28,top_masc_buttoned:26,pants_baggy_wraps:18,pants_breeches:28,",
    "    top_blouse:28,top_dress:48,top_shirt_f:26,top_masc_lacework:30,\n"
    "    top_masc_laced:28,pants_baggy_wraps:18,pants_breeches:28,",
)
remove_line('companionFashionPreferences.js', "  top_masc_toggle:{ masculine:1, structured:.55, practical:.75 },")
remove_line('companionFashionPreferences.js', "  top_masc_buttoned:{ masculine:.85, structured:.7, practical:.8 },")
replace(
    'assetLoadScheduler.js',
    "            : ['top_masc_toggle','top_masc_lacework','top_masc_laced','top_masc_buttoned'];",
    "            : ['top_masc_lacework','top_masc_laced'];",
)
replace(
    'assetLoadScheduler.js',
    "        if (allViews) paths.push('images/equipment/clothing/briefs_female_back.png');",
    "        if (allViews) paths.push('images/equipment/clothing/briefs_female_side.png','images/equipment/clothing/briefs_female_back.png');",
)
replace(
    'assetLoadScheduler.js',
    "            if (allViews) paths.push('images/equipment/clothing/bra_back.png');",
    "            if (allViews) paths.push('images/equipment/clothing/bra_side.png','images/equipment/clothing/bra_back.png');",
)

# Update regression tests to match the deliberately reduced catalogue and new
# three-view families.
t = 'tests-unit/clothing-render-regression.test.js'
replace(t, "test('masculine starter tops are the four new two-tone PNG overlays', () => {", "test('masculine starter tops use the two retained two-tone PNG overlays', () => {")
replace(
    t,
    "        'top_masc_toggle.png',\n        'top_masc_lacework.png',\n        'top_masc_laced.png',\n        'top_masc_buttoned.png',",
    "        'top_masc_lacework.png',\n        'top_masc_laced.png',",
)
replace(
    t,
    "    contains(layersSource, \"const MASCULINE_START_TOPS=['top_masc_toggle','top_masc_lacework','top_masc_laced','top_masc_buttoned'];\");",
    "    contains(layersSource, \"const MASCULINE_START_TOPS=['top_masc_lacework','top_masc_laced'];\");",
)
replace(
    t,
    "    contains(layersSource, \"const RETIRED_TOPS=new Set(['top_shirt','top_tunic']);\");",
    "    contains(layersSource, \"const RETIRED_TOPS=new Set(['top_shirt','top_tunic','top_masc_toggle','top_masc_buttoned','traveler_garb']);\");",
)
replace(t, "        'briefs_female_front.png',\n        'briefs_female_back.png',", "        'briefs_female_front.png',\n        'briefs_female_side.png',\n        'briefs_female_back.png',")
replace(t, "        'bra_front.png',\n        'bra_back.png',", "        'bra_front.png',\n        'bra_side.png',\n        'bra_back.png',")
replace(
    t,
    "test('trousers use the current directional PNG assets', () => {\n"
    "    const layersSource = read('clothingLayers.js');\n"
    "    contains(layersSource, \"front:'images/equipment/clothing/pants_trousers_front.png'\");\n"
    "    contains(layersSource, \"side:'images/equipment/clothing/pants_trousers_front.png'\");\n"
    "    contains(layersSource, \"back:'images/equipment/clothing/pants_trousers_back.png'\");\n"
    "});",
    "test('pants use the current directional PNG assets', () => {\n"
    "    const layersSource = read('clothingLayers.js');\n"
    "    contains(layersSource, \"front:'images/equipment/clothing/pants_trousers_front.png'\");\n"
    "    contains(layersSource, \"back:'images/equipment/clothing/pants_trousers_back.png'\");\n"
    "    for (const id of ['pants_baggy_wraps','pants_breeches','pants_hose']) {\n"
    "        contains(layersSource, `front:'images/equipment/clothing/${id}_front.png'`);\n"
    "        contains(layersSource, `side:'images/equipment/clothing/${id}_side.png'`);\n"
    "        contains(layersSource, `back:'images/equipment/clothing/${id}_back.png'`);\n"
    "    }\n"
    "});",
)

c = 'tests-unit/companion-fashion-preferences.test.js'
replace(c, "function load({shirt='top_masc_buttoned', hue=210, opacity=1, attraction=18, companion='Wren Talbot', familiarity=60}={}) {", "function load({shirt='top_masc_laced', hue=210, opacity=1, attraction=18, companion='Wren Talbot', familiarity=60}={}) {")
replace(c, "    top_masc_buttoned:{name:'Buttoned Work Shirt',clothingGender:'male',type:'clothes'},", "    top_masc_laced:{name:'Laced Tunic',clothingGender:'male',type:'clothes'},")
replace(
    c,
    "  global.party[0].clothingColors.top_masc_buttoned.base.hue=150; api.observe(c);\n"
    "  global.party[0].clothingColors.top_masc_buttoned.base.hue=30; api.observe(c);",
    "  global.party[0].clothingColors.top_masc_laced.base.hue=150; api.observe(c);\n"
    "  global.party[0].clothingColors.top_masc_laced.base.hue=30; api.observe(c);",
)

# Assertions before the workflow is allowed to commit.
for name in [
    'traveler_garb_front.svg', 'traveler_garb_side.svg', 'traveler_garb_back.svg',
    'top_masc_buttoned.png', 'top_masc_toggle.png',
    'pants_baggy_wraps.png', 'pants_breeches.png', 'pants_hose.png',
    'pants_breaches_back.png', 'pants_breaches_side.png',
]:
    if (CLOTHING / name).exists():
        raise RuntimeError(f'legacy asset still exists: {name}')

expected = [
    'bra_front.png', 'bra_side.png', 'bra_back.png',
    'briefs_female_front.png', 'briefs_female_side.png', 'briefs_female_back.png',
    'pants_baggy_wraps_front.png', 'pants_baggy_wraps_side.png', 'pants_baggy_wraps_back.png',
    'pants_breeches_front.png', 'pants_breeches_side.png', 'pants_breeches_back.png',
    'pants_hose_front.png', 'pants_hose_side.png', 'pants_hose_back.png',
]
for name in expected:
    path = CLOTHING / name
    if not path.exists():
        raise RuntimeError(f'missing directional asset: {name}')
    im = Image.open(path).convert('RGBA')
    amin, amax = im.getchannel('A').getextrema()
    if amin != 0 or amax == 0:
        raise RuntimeError(f'bad transparency: {name} alpha={amin}..{amax}')
    print(f'verified {name}: alpha={amin}..{amax}, bbox={im.getbbox()}')

# The only remaining retired IDs should be explicit migration/purge declarations
# (and the regression test that checks those declarations).
for needle in ['traveler_garb', 'top_masc_buttoned', 'top_masc_toggle', 'pants_breaches']:
    hits = []
    allowed = {'clothingLayers.js', 'clothingSystem.js', 'tests-unit/clothing-render-regression.test.js'}
    for path in ROOT.rglob('*'):
        if not path.is_file() or '.git' in path.parts or path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.svg'}:
            continue
        if path.as_posix() in {'.github/workflows/clothing-sprite-cleanup.yml', 'scripts/tmp_clothing_cleanup.py'}:
            continue
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        if needle in text and path.as_posix() not in allowed:
            hits.append(path.as_posix())
    if hits:
        raise RuntimeError(f'unexpected live references to {needle}: {hits}')

print('clothing cleanup assertions passed')
