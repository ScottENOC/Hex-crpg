from pathlib import Path
p = Path('main.js')
text = p.read_text()
old = """    // Legacy flat-sprite preview is retained only for combinations not yet
    // owned by humanoidRenderer.js. Direct humanoids install their own
    // directional creator preview and therefore must not request old flat art.
    const APPEARANCE_BASE_SRC = {
        elf_male: 'images/elfmale.png',
        dwarf_female: 'images/dwarffemale.png', dwarf_male: 'images/dwarfmale.png'
    };
    const APPEARANCE_HAIR_SRC = {
        elf_male: 'images/elfmalehair.png',
        dwarf_female: 'images/dwarffemalehair.png', dwarf_male: 'images/dwarfmalehair.png'
    };
"""
new = """    // All playable race/body presentations are direct-renderer owned. These
    // maps remain as empty compatibility inputs for the legacy preview helper,
    // which now only serves non-playable/custom art paths.
    const APPEARANCE_BASE_SRC = {};
    const APPEARANCE_HAIR_SRC = {};
"""
if old not in text:
    raise SystemExit('Legacy appearance preview map changed; refusing blind patch')
p.write_text(text.replace(old, new, 1))
