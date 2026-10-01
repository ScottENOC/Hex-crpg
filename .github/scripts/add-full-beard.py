from pathlib import Path
import re

facial = Path('facialHairSystem.js')
text = facial.read_text()

text = text.replace("const BUILD = '20261001-facial-hair-v1';", "const BUILD = '20261001-facial-hair-v2';", 1)

old_styles = """    const FACIAL_HAIR_STYLES = Object.freeze({
        moustache: Object.freeze({
            label: 'Moustache',
            front: 'images/characters/facial_hair/moustache_front.svg',
            side: 'images/characters/facial_hair/moustache_side.svg',
        }),
    });
"""
new_styles = """    const FACIAL_HAIR_STYLES = Object.freeze({
        moustache: Object.freeze({
            label: 'Moustache',
            front: 'images/characters/facial_hair/moustache_front.svg',
            side: 'images/characters/facial_hair/moustache_side.svg',
        }),
        beard_full: Object.freeze({
            label: 'Full beard',
            front: 'images/characters/facial_hair/beard_full_front.png',
            side: 'images/characters/facial_hair/beard_full_side.png',
            // Beards cover substantially more of the face than a moustache, so
            // they need their own placement box instead of being squeezed into
            // the moustache target. Values are normalised to humanoid body bounds.
            targets: Object.freeze({
                front: Object.freeze({ x: 0.310, y: 0.108, w: 0.380, h: 0.255 }),
                side: Object.freeze({ x: 0.350, y: 0.103, w: 0.330, h: 0.270 }),
            }),
        }),
    });
"""
if old_styles not in text:
    raise SystemExit('facial hair style registry changed; refusing blind patch')
text = text.replace(old_styles, new_styles, 1)

old_target = """    function facialHairTarget(view, bounds) {
        // Normalised to the direct humanoid body bounds. The side art is authored
        // facing right; humanoidRenderer mirrors the whole stack for left-facing.
        const t = view === 'side'
            ? { x: 0.445, y: 0.125, w: 0.150, h: 0.090 }
            : { x: 0.385, y: 0.130, w: 0.230, h: 0.085 };
        return {
            left: bounds.left + bounds.width * t.x,
            top: bounds.top + bounds.height * t.y,
            width: bounds.width * t.w,
            height: bounds.height * t.h,
        };
    }
"""
new_target = """    function facialHairTarget(view, bounds, style) {
        // Normalised to the direct humanoid body bounds. The side art is authored
        // facing right; humanoidRenderer mirrors the whole stack for left-facing.
        // Individual styles can provide a larger/smaller target while moustaches
        // and future simple styles retain the original compact default.
        const key = view === 'side' ? 'side' : 'front';
        const fallback = key === 'side'
            ? { x: 0.445, y: 0.125, w: 0.150, h: 0.090 }
            : { x: 0.385, y: 0.130, w: 0.230, h: 0.085 };
        const t = style?.targets?.[key] || fallback;
        return {
            left: bounds.left + bounds.width * t.x,
            top: bounds.top + bounds.height * t.y,
            width: bounds.width * t.w,
            height: bounds.height * t.h,
        };
    }
"""
if old_target not in text:
    raise SystemExit('facialHairTarget changed; refusing blind patch')
text = text.replace(old_target, new_target, 1)

old_draw = "return drawImageContained(ctx, image, facialHairTarget(view, bounds));"
new_draw = "return drawImageContained(ctx, image, facialHairTarget(view, bounds, style));"
if old_draw not in text:
    raise SystemExit('facial hair draw target call changed; refusing blind patch')
text = text.replace(old_draw, new_draw, 1)
facial.write_text(text)

creator = Path('characterCreation.js')
creator_text = creator.read_text()
old_loader = "facialHairScript.src = `facialHairSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || '20261001-facial-hair-v1')}`;"
new_loader = "facialHairScript.src = `facialHairSystem.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || '20261001-facial-hair-v2')}&facial=20261001-beard-v1`;"
if old_loader not in creator_text:
    raise SystemExit('facial hair loader changed; refusing blind patch')
creator.write_text(creator_text.replace(old_loader, new_loader, 1))

index = Path('index.html')
html = index.read_text()
updated, count = re.subn(r'characterCreation\\.js\\?v=[^"\\s<]+', 'characterCreation.js?v=20261001-beard1', html, count=1)
if count != 1:
    raise SystemExit('could not find unique characterCreation.js cache token')
index.write_text(updated)
