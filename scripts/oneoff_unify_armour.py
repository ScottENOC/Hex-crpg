from pathlib import Path
import re

path = Path('humanoidRenderer.js')
text = path.read_text()

# Put the new matched front/back SVG pairs under the renderer's ownership.
pattern = re.compile(r"(    const SHIELD_PATHS = \{.*?^    \};\n)\n    const REAR_EQUIPMENT_PATHS = \{\n        helmet:'images/nasalHelm_back\.svg',\n        armour:\{.*?^        \},\n    \};", re.M | re.S)
replacement = r"\1\n    // Armour is renderer-owned directional art, just like shields. Front and\n    // side share the authored front face; back uses the matching rear face.\n    // Keeping each pair together prevents mixing legacy PNG fronts with newer SVG backs.\n    const ARMOUR_PATHS = {\n        light:{front:'images/humanlightarmour_front.svg',back:'images/humanlightarmour_back.svg'},\n        medium:{front:'images/humanmediumarmour_front.svg',back:'images/humanmediumarmour_back.svg'},\n        heavy:{front:'images/humanheavyarmour_front.svg',back:'images/humanheavyarmour_back.svg'},\n    };\n\n    const REAR_EQUIPMENT_PATHS = {\n        helmet:'images/nasalHelm_back.svg',\n    };"
text, n = pattern.subn(replacement, text, count=1)
if n != 1:
    raise RuntimeError(f'armour path table replacement matched {n} times')

pattern = re.compile(r"    const SHIELD_ASSETS = Object\.fromEntries\(Object\.entries\(SHIELD_PATHS\).*?^    \};\n\n    function facingFromHexDelta", re.M | re.S)
replacement = """    const SHIELD_ASSETS = Object.fromEntries(Object.entries(SHIELD_PATHS)
        .map(([visual, paths]) => [visual, {front:loadImage(paths.front), back:loadImage(paths.back)}]));
    const ARMOUR_ASSETS = Object.fromEntries(Object.entries(ARMOUR_PATHS)
        .map(([tier, paths]) => [tier, {front:loadImage(paths.front), back:loadImage(paths.back)}]));
    const REAR_EQUIPMENT_ASSETS = {
        // Compatibility aliases for existing readiness checks and legacy consumers.
        shield:SHIELD_ASSETS.round.back,
        helmet:loadImage(REAR_EQUIPMENT_PATHS.helmet),
        armour:Object.fromEntries(Object.entries(ARMOUR_ASSETS)
            .map(([tier, views]) => [tier, views.back])),
    };

    function facingFromHexDelta"""
text, n = pattern.subn(replacement, text, count=1)
if n != 1:
    raise RuntimeError(f'armour preload replacement matched {n} times')

pattern = re.compile(r"    function armourImage\(entity, view\) \{.*?^    \}\n\n    function helmetImage", re.M | re.S)
replacement = """    function armourImage(entity, view) {
        const id = entity.equipped?.armor;
        if (!id) return null;
        const item = window.items?.[id];
        const reduction = Number(item?.reduction || 0);
        const visuals = window.gameVisuals || {};
        const tier = reduction >= 3 ? 'heavy' : reduction >= 2 ? 'medium' : 'light';
        const authored = view === 'back' ? ARMOUR_ASSETS[tier]?.back : ARMOUR_ASSETS[tier]?.front;
        // The old PNG remains a load-failure fallback only. Normal rendering uses a
        // matched SVG pair, and gold tint is applied after choosing the view so the
        // same recolour path is used for front, side and back.
        const legacy = tier === 'heavy' ? visuals.humanHeavy : tier === 'medium' ? visuals.humanMedium : visuals.humanLight;
        let image = imageReady(authored) ? authored : legacy;
        if (!image) return null;
        if (entity.goldGear && window.getGoldTintedSprite) image = window.getGoldTintedSprite(image) || image;
        return image;
    }

    function helmetImage"""
text, n = pattern.subn(replacement, text, count=1)
if n != 1:
    raise RuntimeError(f'armourImage replacement matched {n} times')

needle = "    window.SHIELD_VISUAL_ASSETS = SHIELD_ASSETS;\n"
if text.count(needle) != 1:
    raise RuntimeError('shield asset export marker not unique')
text = text.replace(needle, needle + "    window.ARMOUR_VISUAL_ASSETS = ARMOUR_ASSETS;\n", 1)

path.write_text(text)
