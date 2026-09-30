from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


# Clothing: explicit trousers side source, shared build identity, and retry failed
# Image elements instead of keeping a permanently broken object in the private cache.
p = Path('clothingLayers.js')
text = p.read_text()
text = replace_once(text, "  const BUILD='20260929-clothing-layers-v20';", "  const BUILD=window.PRESENTATION_BUILD||'20260930-visibility-assets-v1';", 'clothingLayers BUILD')
text = replace_once(
    text,
    "    pants_trousers:singleLayerViews('pants',{\n      front:'images/equipment/clothing/pants_trousers.png',\n      back:'images/equipment/clothing/pants_trousers_back.png',\n    },'Trousers'),",
    "    pants_trousers:singleLayerViews('pants',{\n      front:'images/equipment/clothing/pants_trousers.png',\n      // No separately authored side file exists; make the intentional front-art\n      // fallback explicit so every directional consumer resolves the same source.\n      side:'images/equipment/clothing/pants_trousers.png',\n      back:'images/equipment/clothing/pants_trousers_back.png',\n    },'Trousers'),",
    'trousers directional sources',
)
text = replace_once(
    text,
    "  function load(src){if(!src)return null;if(images.has(src))return images.get(src);const img=new Image();img.src=`${src}${src.includes('?')?'&':'?'}build=${BUILD}`;img.onload=()=>{window.renderEntities?.();window.refreshDirectionalTurnPortraits?.();};images.set(src,img);return img;}",
    """  function load(src){
    if(!src)return null;
    if(images.has(src))return images.get(src);
    const img=new Image();
    let attempt=0;
    const retryDelays=[100,350,900];
    const assign=()=>{
      const separator=src.includes('?')?'&':'?';
      const retry=attempt?`&assetRetry=${attempt}-${Date.now()}`:'';
      img.src=`${src}${separator}build=${encodeURIComponent(BUILD)}${retry}`;
    };
    const redraw=()=>{
      window.drawMap?.();
      window.renderEntities?.();
      window.refreshDirectionalTurnPortraits?.();
      window.updateAppearancePreview?.();
    };
    img.addEventListener('load',redraw);
    img.addEventListener('error',()=>{
      if(attempt>=retryDelays.length)return;
      const delay=retryDelays[attempt];
      attempt+=1;
      setTimeout(assign,delay);
    });
    images.set(src,img);
    assign();
    return img;
  }""",
    'clothing image loader',
)
p.write_text(text)

p = Path('clothingSystem.js')
text = p.read_text()
text = replace_once(text, "  const BUILD='20260930-clothing-v12';", "  const BUILD=window.PRESENTATION_BUILD||'20260930-visibility-assets-v1';", 'clothingSystem BUILD')
text = replace_once(text, "    s.src=`${src}?build=${BUILD}`;", "    s.src=`${src}?build=${encodeURIComponent(BUILD)}`;", 'clothingSystem child URL')
p.write_text(text)

p = Path('characterCreation.js')
text = p.read_text()
text = replace_once(
    text,
    "  clothingScript.src = 'clothingSystem.js?build=20260930-clothing-v11';",
    "  clothingScript.src = `clothingSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || '20260930-visibility-assets-v1')}`;",
    'characterCreation clothing loader',
)
p.write_text(text)

# Native support for the braid's tightly cropped side/back images. The generic hair
# crop is designed for large framed sheets and otherwise cuts away these small files.
p = Path('humanoidRenderer.js')
text = p.read_text()
needle = """        trimCache.set(image, trim);
        return trim;
    }

    function drawVisibleFit(ctx, image, bounds, target) {"""
replacement = """        trimCache.set(image, trim);
        return trim;
    }

    function frontHairOpaqueWidthFraction(frontImage) {
        const layout = DIRECTIONAL_LAYOUT.front;
        if (!layout || !imageReady(frontImage)) return layout?.hairDest?.w || .56;
        const trim = alphaTrim(frontImage);
        const iw = frontImage.naturalWidth || frontImage.width || 1;
        const cropLeft = layout.hairCrop.x * iw;
        const cropRight = (layout.hairCrop.x + layout.hairCrop.w) * iw;
        const trimLeft = trim.trimLeft;
        const trimRight = trim.trimLeft + trim.trimWidth;
        const visibleOpaque = Math.max(0, Math.min(trimRight, cropRight) - Math.max(trimLeft, cropLeft));
        const cropWidth = Math.max(1, layout.hairCrop.w * iw);
        return visibleOpaque ? layout.hairDest.w * (visibleOpaque / cropWidth) : layout.hairDest.w;
    }

    function tightDirectionalHairDestination(image, view, frontImage) {
        if (!imageReady(image)) return null;
        const trim = alphaTrim(image);
        const iw = image.naturalWidth || image.width || 1;
        const ih = image.naturalHeight || image.height || 1;
        const opaqueFraction = Math.max(.01, trim.trimWidth / iw);
        const wantedOpaqueWidth = frontHairOpaqueWidthFraction(frontImage);
        const w = wantedOpaqueWidth / opaqueFraction;
        const sourceAspect = iw / ih;
        const h = w * HUMAN_RENDER_ASPECT / Math.max(.01, sourceAspect);
        return {x:.5-w/2,y:view === 'back' ? -.005 : -.010,w,h};
    }

    function drawVisibleFit(ctx, image, bounds, target) {"""
text = replace_once(text, needle, replacement, 'native directional hair helpers')
text = replace_once(
    text,
    "        const sourceHair = set?.hair?.[entity.hairStyle || 'brown_1']?.[view] || set?.hair?.brown_1?.[view];",
    "        const hairStyle = entity.hairStyle || 'brown_1';\n        const hairSet = set?.hair?.[hairStyle] || set?.hair?.brown_1;\n        const sourceHair = hairSet?.[view] || set?.hair?.brown_1?.[view];",
    'hair source selection',
)
old_draw = """            if (!hasHelmet && imageReady(hairImage)) {
                if (drawCropped(ctx, hairImage, layout.hairCrop, layout.hairDest, bounds)) layerOrder.push('hair');
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) layerOrder.push('helmet');"""
new_draw = """            if (!hasHelmet && imageReady(hairImage)) {
                const tightDirectional = hairStyle === 'braid' && view !== 'front';
                const tightDest = tightDirectional
                    ? tightDirectionalHairDestination(sourceHair, view, hairSet?.front)
                    : null;
                const hairCrop = tightDest ? {x:0,y:0,w:1,h:1} : layout.hairCrop;
                const hairDest = tightDest || layout.hairDest;
                const hairDrawn = drawCropped(ctx, hairImage, hairCrop, hairDest, bounds);
                if (hairDrawn) layerOrder.push('hair');
                window.__humanoidRendererLastHair = {
                    style:hairStyle,
                    view,
                    tightDirectional:!!tightDest,
                    crop:{...hairCrop},
                    dest:{...hairDest},
                    sourceWidth:sourceHair?.naturalWidth || sourceHair?.width || 0,
                    sourceHeight:sourceHair?.naturalHeight || sourceHair?.height || 0,
                    drew:!!hairDrawn,
                };
            } else if (hasHelmet && drawHelmet(ctx, entity, view, bounds)) layerOrder.push('helmet');"""
text = replace_once(text, old_draw, new_draw, 'native braid draw')
p.write_text(text)

# Left-facing braid remains a separate authored source; right/back sizing is now native
# in the compositor so internal rendering paths cannot bypass the fix.
p = Path('braidDirectionalHair.js')
text = p.read_text()
text = replace_once(text, "    const BUILD = '20260929-directional-braid-v1';", "    const BUILD = window.PRESENTATION_BUILD || '20260930-visibility-assets-v1';", 'braid BUILD')
pattern = re.compile(r"    function ensureSideLeftImage\(\) \{.*?\n    \}\n\n    function leftRenderSource\(\)", re.S)
replacement = """    function ensureSideLeftImage() {
        if (sideLeftImage || typeof Image === 'undefined') return sideLeftImage;
        const image = new Image();
        let attempt = 0;
        const retryDelays = [100, 350, 900];
        const assign = () => {
            const build = encodeURIComponent(window.PRESENTATION_BUILD || BUILD);
            const retry = attempt ? `&assetRetry=${attempt}-${Date.now()}` : '';
            image.src = `${SIDE_LEFT_PATH}?build=${build}${retry}`;
        };
        image.addEventListener('load', () => {
            sideLeftRenderSource = null;
            window.drawMap?.();
            window.renderEntities?.();
            window.refreshDirectionalTurnPortraits?.();
        });
        image.addEventListener('error', () => {
            if (attempt >= retryDelays.length) return;
            const delay = retryDelays[attempt];
            attempt += 1;
            setTimeout(assign, delay);
        });
        sideLeftImage = image;
        assign();
        return image;
    }

    function leftRenderSource()"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'braid left loader: expected one match, found {count}')
pattern = re.compile(r"    function withDirectionalBraid\(entity, facing, draw\) \{.*?\n    \}\n\n    function installDirectionalDrawWrapper\(\)", re.S)
replacement = """    function withDirectionalBraid(entity, facing, draw) {
        if (entity?.hairStyle !== STYLE || facing !== 'left') return draw();
        const braid = braidSetFor(entity);
        if (!braid) return draw();
        const originalSide = braid.side;
        const left = leftRenderSource();
        braid.sideLeft = ensureSideLeftImage();
        if (!imageReady(left)) return draw();
        braid.side = left;
        try { return draw(); }
        finally { braid.side = originalSide; }
    }

    function installDirectionalDrawWrapper()"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'braid wrapper: expected one match, found {count}')
p.write_text(text)

# Unify presentation cache identity and bump the two static entry points that iOS
# otherwise tends to keep despite source changes.
p = Path('name.js')
text = p.read_text()
text = replace_once(text, "const PRESENTATION_BUILD = '20260930-canonical-armour-v3';", "const PRESENTATION_BUILD = '20260930-visibility-assets-v1';", 'presentation build')
p.write_text(text)

p = Path('index.html')
text = p.read_text()
text = replace_once(text, 'name.js?v=14', 'name.js?v=15', 'name.js static cache token')
text = replace_once(text, 'characterCreation.js?v=9', 'characterCreation.js?v=10', 'characterCreation static cache token')
p.write_text(text)
