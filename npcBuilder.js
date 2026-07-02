// npcBuilder.js
// Builds NPCs the same way PCs are built: race + class level(s) -> attribute
// pool -> skills purchased from that pool -> equipment. Mirrors
// characterCreation.js's createCharacterData and the real skill-purchase
// logic (see ui.js doLevelUp / skill-learn flow), but targets a live
// window.Enemy instance instead of a plain party-data object, and is meant
// for hand-authored, static NPC rosters rather than the character creator UI.

function buildNPC({ name, title, race, gender, hex, classLevels, skillPicks, equipment, side, factionId, color, voice, dialogueId, expValue, gold }) {
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

    ent.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
    ent.inventory = [];
    (equipment || []).forEach(itemId => window.equipToMonster(ent, itemId));

    return ent;
}

window.buildNPC = buildNPC;
