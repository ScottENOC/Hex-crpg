from pathlib import Path

renderer = Path('humanoidRenderer.js')
text = renderer.read_text()

old_rigs = """    const CHARACTER_RIGS = {
        human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16 },
        elf_female:   { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16 },
        human_male:   { bodyW:1.70, bodyH:2.06, yOff:-0.17, heightScale:2.06/2.16 },
    };
"""
new_rigs = """    // All five playable races and both body presentations are compositor-owned.
    // bodyAssetMode is diagnostic metadata: it makes temporary art fallbacks explicit
    // without sending those characters back through the legacy all-in-one renderer.
    const CHARACTER_RIGS = {
        human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        human_male:   { bodyW:1.70, bodyH:2.06, yOff:-0.17, heightScale:2.06/2.16, bodyAssetMode:'directional' },
        elf_female:   { bodyW:1.60, bodyH:1.92, yOff:-0.16, heightScale:1.92/2.16, bodyAssetMode:'directional' },
        elf_male:     { bodyW:2.00, bodyH:2.40, yOff:-0.20, heightScale:2.40/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_female: { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        dwarf_male:   { bodyW:1.60, bodyH:1.92, yOff:-0.07, heightScale:1.92/2.16, bodyAssetMode:'flat-fallback', bodyRender:'visible-fit' },
        goblin_female:{ bodyW:1.45, bodyH:1.70, yOff:-0.12, heightScale:1.70/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
        goblin_male:  { bodyW:1.50, bodyH:1.75, yOff:-0.12, heightScale:1.75/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_female:   { bodyW:1.85, bodyH:2.05, yOff:-0.15, heightScale:2.05/2.16, bodyAssetMode:'directional', bodyRender:'visible-fit' },
        orc_male:     { bodyW:1.90, bodyH:2.10, yOff:-0.15, heightScale:2.10/2.16, bodyAssetMode:'shared-directional-fallback', bodyRender:'visible-fit' },
    };
"""
if old_rigs not in text:
    raise SystemExit('CHARACTER_RIGS block changed; refusing blind patch')
text = text.replace(old_rigs, new_rigs, 1)

old_path_tail = """    };
    CHARACTER_PATHS.human_male.hair = CHARACTER_PATHS.human_female.hair;
    CHARACTER_PATHS.elf_female.hair = CHARACTER_PATHS.human_female.hair;
"""
new_path_tail = """        elf_male: {
            body: { average: {
                // No directional elf-male body has been authored yet. All three
                // facings deliberately use the surviving flat body until that art lands.
                front:'images/characters/elf_male/body.png',
                side:'images/characters/elf_male/body.png',
                back:'images/characters/elf_male/body.png',
            } },
            hair:null,
        },
        dwarf_female: {
            body: { average: {
                front:'images/characters/dwarf_female/body.png',
                side:'images/characters/dwarf_female/body.png',
                back:'images/characters/dwarf_female/body.png',
            } },
            hair:null,
        },
        dwarf_male: {
            body: { average: {
                front:'images/characters/dwarf_male/body.png',
                side:'images/characters/dwarf_male/body.png',
                back:'images/characters/dwarf_male/body.png',
            } },
            hair:null,
        },
        goblin_female: {
            body: { average: {
                front:'images/characters/goblin_female/body_front.png',
                side:'images/characters/goblin_female/body_side.png',
                back:'images/characters/goblin_female/body_back.png',
            } },
            hair:null,
        },
        goblin_male: {
            body: { average: {
                front:'images/characters/goblin_male/body_front.png',
                side:'images/characters/goblin_male/body_side.png',
                back:'images/characters/goblin_male/body_back.png',
            } },
            hair:null,
        },
        orc_female: {
            body: { average: {
                front:'images/characters/orc_female/body_front.png',
                side:'images/characters/orc_female/body_side.png',
                back:'images/characters/orc_female/body_back.png',
            } },
            hair:null,
        },
        orc_male: {
            body: { average: {
                front:'images/characters/orc_male/body_front.png',
                side:'images/characters/orc_male/body_side.png',
                back:'images/characters/orc_male/body_back.png',
            } },
            hair:null,
        },
    };

    // Hair is an appearance layer, never a race/gender permission. Every direct
    // playable humanoid can select every registered hairstyle; NPC generation
    // remains free to weight those styles differently.
    for (const paths of Object.values(CHARACTER_PATHS)) {
        if (!paths.hair) paths.hair = CHARACTER_PATHS.human_female.hair;
    }
"""
if old_path_tail not in text:
    raise SystemExit('CHARACTER_PATHS tail changed; refusing blind patch')
text = text.replace(old_path_tail, new_path_tail, 1)

old_body_draw = """            const bodySource = imageReady(bodyImage) ? bodyImage : sourceBody;
            const bodyTarget = BODY_VISIBLE_TARGETS[key]?.[view];
            const bodyDrawn = bodyTarget
                ? !!drawVisibleFit(ctx, bodySource, bounds, bodyTarget)
                : drawCropped(ctx, bodySource, layout.bodyCrop, layout.bodyDest, bounds);
"""
new_body_draw = """            const bodySource = imageReady(bodyImage) ? bodyImage : sourceBody;
            const bodyTarget = BODY_VISIBLE_TARGETS[key]?.[view];
            // Human directional sheets retain their measured crop. Rigs whose
            // source framing differs (and temporary one-view fallbacks) alpha-trim
            // then fit the visible body to the compositor bounds instead of forcing
            // them through human-specific crop coordinates.
            const useVisibleBodyFit = !!bodyTarget || CHARACTER_RIGS[key]?.bodyRender === 'visible-fit';
            const bodyDrawn = useVisibleBodyFit
                ? !!drawVisibleFit(ctx, bodySource, bounds, bodyTarget || {x:0,y:0,w:1,h:1})
                : drawCropped(ctx, bodySource, layout.bodyCrop, layout.bodyDest, bounds);
"""
if old_body_draw not in text:
    raise SystemExit('body draw block changed; refusing blind patch')
text = text.replace(old_body_draw, new_body_draw, 1)

old_export = """    window.DIRECTIONAL_CHARACTER_PATHS = CHARACTER_PATHS;
    window.DIRECTIONAL_CHARACTER_ASSETS = CHARACTER_ASSETS;
"""
new_export = """    window.DIRECTIONAL_CHARACTER_PATHS = CHARACTER_PATHS;
    window.DIRECTIONAL_CHARACTER_ASSETS = CHARACTER_ASSETS;
    window.DIRECT_HUMANOID_RIGS = CHARACTER_RIGS;
    window.DIRECT_HUMANOID_RIG_KEYS = Object.freeze(Object.keys(CHARACTER_RIGS));
    window.DIRECT_HUMANOID_BODY_STATUS = Object.freeze(Object.fromEntries(
        Object.entries(CHARACTER_RIGS).map(([key, rig]) => [key, rig.bodyAssetMode || 'directional'])
    ));
"""
if old_export not in text:
    raise SystemExit('renderer export block changed; refusing blind patch')
text = text.replace(old_export, new_export, 1)
renderer.write_text(text)

main = Path('main.js')
main_text = main.read_text()
old_preload = """        // Only legacy-rendered race/gender combinations belong here. Human
        // female, human male and elf female are owned by humanoidRenderer.js,
        // which loads their directional body/hair art directly.
        const raceGenderImages = {
            elf_male: [{key: 'elfMaleBase', src: 'images/elfmale.png'}, {key: 'elfMaleHair', src: 'images/elfmalehair.png'}],
            dwarf_female: [{key: 'dwarfFemaleBase', src: 'images/dwarffemale.png'}, {key: 'dwarfFemaleHair', src: 'images/dwarffemalehair.png'}],
            dwarf_male: [{key: 'dwarfMaleBase', src: 'images/dwarfmale.png'}, {key: 'dwarfMaleHair', src: 'images/dwarfmalehair.png'}],
        };
"""
new_preload = """        // All five playable races × both body presentations are now owned by
        // humanoidRenderer.js. Keeping this map empty also prevents speculative
        // creator loading from requesting the deleted root-level elf/dwarf files.
        const raceGenderImages = {};
"""
if old_preload not in main_text:
    raise SystemExit('main.js raceGenderImages block changed; refusing blind patch')
main.write_text(main_text.replace(old_preload, new_preload, 1))

index = Path('index.html')
html = index.read_text()
for old, new in [
    ('humanoidRenderer.js?v=2', 'humanoidRenderer.js?v=3'),
    ('main.js?v=6', 'main.js?v=7'),
]:
    if new not in html:
        if old not in html:
            raise SystemExit(f'Expected cache token {old} not found')
        html = html.replace(old, new, 1)
index.write_text(html)

# The copied body files now make the placeholder directory entries unnecessary.
for placeholder in [
    Path('images/characters/elf_male/.gitkeep'),
    Path('images/characters/dwarf_male/.gitkeep'),
    Path('images/characters/dwarf_female/.gitkeep'),
]:
    if placeholder.exists():
        placeholder.unlink()
