// npcBuilder.js
// Builds NPCs the same way PCs are built: race + class level(s) -> attribute
// pool -> skills purchased from that pool -> equipment. Mirrors
// characterCreation.js's createCharacterData and the real skill-purchase
// logic (see ui.js doLevelUp / skill-learn flow), but targets a live
// window.Enemy instance instead of a plain party-data object, and is meant
// for hand-authored, static NPC rosters rather than the character creator UI.

const DIRECTIONAL_NPC_ART = {
    npc_town_guard: {
        down:  { key: 'npcTownGuardFront', src: 'images/characters/npc_town_guard/body_front.svg' },
        up:    { key: 'npcTownGuardBack', src: 'images/characters/npc_town_guard/body_back.svg' },
        right: { key: 'npcTownGuardRight', src: 'images/characters/npc_town_guard/body_side.svg' },
        left:  { key: 'npcTownGuardLeft', src: 'images/characters/npc_town_guard/body_side_left.svg' },
    },
    npc_goblin: {
        down:  { key: 'npcGoblinFront', src: 'images/characters/npc_goblin/body_front.svg' },
        up:    { key: 'npcGoblinBack', src: 'images/characters/npc_goblin/body_back.svg' },
        right: { key: 'npcGoblinRight', src: 'images/characters/npc_goblin/body_side.svg' },
        left:  { key: 'npcGoblinLeft', src: 'images/characters/npc_goblin/body_side_left.svg' },
    },
    npc_orc: {
        down:  { key: 'npcOrcFront', src: 'images/characters/npc_orc/body_front.svg' },
        up:    { key: 'npcOrcBack', src: 'images/characters/npc_orc/body_back.svg' },
        right: { key: 'npcOrcRight', src: 'images/characters/npc_orc/body_side.svg' },
        left:  { key: 'npcOrcLeft', src: 'images/characters/npc_orc/body_side_left.svg' },
    },
};

function ensureDirectionalNpcImages() {
    if (!window.gameVisuals || typeof Image === 'undefined') return false;
    Object.values(DIRECTIONAL_NPC_ART).forEach(views => {
        Object.values(views).forEach(({ key, src }) => {
            if (window.gameVisuals[key]) return;
            const img = new Image();
            img.src = src;
            img.addEventListener('load', () => window.drawMap?.());
            window.gameVisuals[key] = img;
        });
    });
    return true;
}

function syncDirectionalNpcArt(ent) {
    if (!ent?.directionalArtKey) return;
    const art = DIRECTIONAL_NPC_ART[ent.directionalArtKey];
    if (!art) return;
    const facing = ['up', 'down', 'left', 'right'].includes(ent.facing) ? ent.facing : 'down';
    const view = art[facing] || art.down;
    ent.customImage = view.key;
}

function buildNPC({ name, title, race, gender, hex, classLevels, skillPicks, equipment, side, factionId, color, voice, dialogueId, expValue, gold, directionalArtKey }) {
    const ent = new window.Enemy(name, color || 'white', hex, 10, 10, expValue || 0);
    ent.title = title;
    ent.gold = gold || 0;
    ent.race = race;
    ent.gender = gender;
    ent.side = side || 'neutral';
    ent.isNPC = true;
    ent.tags = ['humanoid'];
    ent.voice = voice || 'pc_1';
    ent.factionId = factionId || null;
    ent.dialogueId = dialogueId || null;

    // Named directional NPC artwork is opt-in. The ordinary Reddale watchman
    // is the first user of it; matching the semantic title keeps the content
    // roster simple while avoiding accidental reskins of every entity whose AI
    // happens to use patrol behaviour (stewards, soldiers, etc.).
    ent.directionalArtKey = directionalArtKey || (title === 'Town Guard' ? 'npc_town_guard' : null);

    const playerRace = window.party && window.party[0] ? window.party[0].race : race;
    ent.reputation = {
        knowledge: 0,
        standing: window.seedStanding ? window.seedStanding(race, playerRace) : 0
    };

    // Attribute pool: race bonus + class bonus per level taken (same shape as
    // characterCreation.js's createCharacterData).
    const allAttrs = new Set(['strength', 'endurance', 'agility', 'weapons', 'divine', 'nature', 'arcane', 'wildcard', 'monk', 'Way of the open palm']);
    for (const r in window.raceData) for (const a in window.raceData[r].bonus) allAttrs.add(a);
    for (const c in window.classData) for (const a in window.classData[c].bonus) allAttrs.add(a);
    const attributes = {};
    allAttrs.forEach(a => attributes[a] = 0);

    const rb = window.raceData[race].bonus;
    for (const k in rb) attributes[k] += rb[k];
    (classLevels || []).forEach(cls => {
        const cb = window.classData[cls].bonus;
        for (const k in cb) attributes[k] += cb[k];
    });
    ent.attributes = attributes;
    ent.level = (classLevels || []).length || 1;

    // Purchase skills from the pool (mirrors the real spend logic: decrement
    // the skill's tree, falling back to wildcard).
    ent.skills = {};
    (skillPicks || []).forEach(skillKey => {
        const skill = window.skills[skillKey];
        if (!skill) return;
        if (attributes[skill.tree] > 0) attributes[skill.tree]--;
        else if (attributes.wildcard > 0) attributes.wildcard--;
        ent.skills[skillKey] = (ent.skills[skillKey] || 0) + 1;
    });

    ent.hp = 10;
    ent.maxHp = 10;
    ent.applySkills(); // runs each skill's apply(this), e.g. 'health' adds +10 hp/rank
    ent.hp = ent.maxHp;
    // AI-controlled casters build their own spellbook (base/cheapest/
    // priciest/random variants of everything they've learned, up to
    // maxSpellSlots) — the player builds theirs by hand via ui.js instead,
    // so this never runs for window.player. No-ops for a non-caster.
    if (window.autoBuildSpellsForEntity) window.autoBuildSpellsForEntity(ent);

    ent.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
    ent.inventory = [];
    (equipment || []).forEach(itemId => window.equipToMonster(ent, itemId));

    ensureDirectionalNpcImages();
    syncDirectionalNpcArt(ent);
    return ent;
}

// Keep customImage aligned with facing. Standard (non-elite) Goblins and Orcs
// opt in by their untouched template names. Named bosses/hand-authored NPCs are
// deliberately not matched here, so their existing art remains authoritative.
setInterval(() => {
    ensureDirectionalNpcImages();
    for (const ent of window.entities || []) {
        if (!ent) continue;
        if (!ent.directionalArtKey && ent.name === 'Goblin') ent.directionalArtKey = 'npc_goblin';
        if (!ent.directionalArtKey && ent.name === 'Orc') ent.directionalArtKey = 'npc_orc';
        if (ent.directionalArtKey) syncDirectionalNpcArt(ent);
    }
}, 100);

window.DIRECTIONAL_NPC_ART = DIRECTIONAL_NPC_ART;
window.ensureDirectionalNpcImages = ensureDirectionalNpcImages;
window.syncDirectionalNpcArt = syncDirectionalNpcArt;
window.buildNPC = buildNPC;
