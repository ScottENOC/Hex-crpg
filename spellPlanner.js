// spellPlanner.js
//
// Auto-builds a spellbook (entity.createdSpells) for AI-controlled casters
// (NPCs/monsters — never the human player, who builds spells by hand via
// ui.js's spell-builder). Mirrors that same builder's cost formula
// (renderSpellStats/createSpell in ui.js) so an NPC's "created" spells are
// exactly as valid/affordable as anything a player could build with the
// same skills.
//
// Order, per the design: for every base spell the entity has actually
// learned (a real learn_<id> skill, same gate the player uses), first the
// plain base version, then a cheapest-possible version, then a
// most-expensive-possible version, then random combinations filling any
// remaining slots — capped at entity.maxSpellSlots (base 8, +2 per
// <school>_spell_slots skill, stacking across arcane/divine/nature up to 14).

function getSpellDialLimits(entity, base) {
    const school = base.school;
    const options = (entity.unlockedCastingOptions && entity.unlockedCastingOptions[school]) || {};
    const skills = entity.skills || {};
    return {
        school,
        quickened: !!options.quickened,
        slowed: !!options.slowed,
        maxRange: options.extraRange || 0,
        maxMagnitude: options.extraMagnitude || 0,
        maxRadius: (base.baseRadius !== undefined) ? (skills[`${school}_expand`] || 0) : 0,
        maxTargets: (base.type !== 'aoe_debuff' && base.type !== 'summon') ? (skills[`${school}_targets`] || 0) : 0,
        cap: (entity.manaCaps && entity.manaCaps[school]) || 10,
    };
}

// Exact port of ui.js's renderSpellStats cost formula (arcane-only
// efficiency skills are a real, existing asymmetry there — not a bug this
// planner should paper over).
function computeSpellVariant(entity, baseId, base, speed, magBonus, rangeBonus, radBonus, targetBonus) {
    const school = base.school;
    let manaCost = base.baseMana;
    let tpCost = 10;
    let effRange = 0, effMag = 0, effSpeed = 0;
    if (school === 'arcane') {
        const skills = entity.skills || {};
        effRange = skills['arcane_eff_range'] || 0;
        effMag = skills['arcane_eff_magnitude'] || 0;
        effSpeed = skills['arcane_eff_speed'] || 0;
    }
    if (speed === 'quickened') { tpCost = 5; manaCost += Math.max(0, 5 - effSpeed); }
    if (speed === 'slowed') { tpCost = 20; manaCost -= 4; }
    manaCost += Math.max(0, rangeBonus - effRange);
    manaCost += (magBonus * Math.max(0, 5 - effMag));
    manaCost += (radBonus * 10);
    manaCost += (targetBonus * 15);
    manaCost = Math.max(1, manaCost);
    const coreManaCost = base.baseMana + (magBonus * Math.max(0, 5 - effMag)) + (radBonus * 10) + (targetBonus * 15);
    const magnitude = base.baseMagnitude * (1 + magBonus);
    const range = (base.baseRange || 1) + rangeBonus;
    const radius = (base.baseRadius || 0) + radBonus;
    return {
        name: base.name, school, baseId, type: base.type,
        manaCost, coreManaCost, tpCost, magnitude, range, radius, extraTargets: targetBonus,
    };
}

function variantKey(v) {
    return `${v.baseId}|${v.tpCost}|${v.manaCost}|${v.range}|${v.radius}|${v.extraTargets}`;
}

// Fills dials in cheapest-per-unit order (range=1/pt, magnitude≈5/pt,
// radius=10/pt, targets=15/pt) to spend as much of the mana cap as
// possible without exceeding it — a simple, good-enough greedy for
// "the most expensive version this entity could build".
function buildMostExpensiveVariant(entity, baseId, base, limits) {
    const speed = limits.quickened ? 'quickened' : 'default';
    let rangeB = 0, magB = 0, radB = 0, targB = 0;
    const dialOrder = [
        { get: () => rangeB, set: v => rangeB = v, max: limits.maxRange },
        { get: () => magB, set: v => magB = v, max: limits.maxMagnitude },
        { get: () => radB, set: v => radB = v, max: limits.maxRadius },
        { get: () => targB, set: v => targB = v, max: limits.maxTargets },
    ];
    for (const dial of dialOrder) {
        for (let i = 0; i < dial.max; i++) {
            const trial = dial.get() + 1;
            dial.set(trial);
            const v = computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB);
            if (v.manaCost > limits.cap) { dial.set(trial - 1); break; }
        }
    }
    return computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB);
}

function buildCheapestVariant(entity, baseId, base, limits) {
    const speed = limits.slowed ? 'slowed' : 'default';
    return computeSpellVariant(entity, baseId, base, speed, 0, 0, 0, 0);
}

function buildRandomVariant(entity, baseId, base, limits) {
    const speedPool = ['default'];
    if (limits.quickened) speedPool.push('quickened');
    if (limits.slowed) speedPool.push('slowed');
    const speed = speedPool[Math.floor(Math.random() * speedPool.length)];
    const rangeB = Math.floor(Math.random() * (limits.maxRange + 1));
    const magB = Math.floor(Math.random() * (limits.maxMagnitude + 1));
    const radB = Math.floor(Math.random() * (limits.maxRadius + 1));
    const targB = Math.floor(Math.random() * (limits.maxTargets + 1));
    return computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB);
}

// Known spells = base spells with a real learn_<id> skill the entity has
// actually taken (same gate the player is under) — excludes monster-only
// spells like dragon_breath/temporal_rift (no learn_ skill exists for
// those; they're hand-baked onto their specific templates instead) and
// summon-type spells (a different, animal-choice-driven cost shape not
// worth folding into this generic dial system).
function getKnownSpellBases(entity) {
    const skills = entity.skills || {};
    const known = [];
    for (const baseId in window.baseSpells) {
        const base = window.baseSpells[baseId];
        if (base.type === 'summon') continue;
        if (skills[`learn_${baseId}`]) known.push({ baseId, base });
    }
    return known;
}

function autoBuildSpellsForEntity(entity) {
    const known = getKnownSpellBases(entity);
    if (known.length === 0) return;
    const maxSlots = entity.maxSpellSlots || 8;
    entity.createdSpells = [];
    const seen = new Set();
    const tryAdd = (v) => {
        if (!v || entity.createdSpells.length >= maxSlots) return false;
        const key = variantKey(v);
        if (seen.has(key)) return false;
        seen.add(key);
        entity.createdSpells.push(v);
        return true;
    };

    const limitsByBaseId = {};
    known.forEach(({ baseId, base }) => { limitsByBaseId[baseId] = getSpellDialLimits(entity, base); });

    // Phase 1: base version of every known spell.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        tryAdd(computeSpellVariant(entity, baseId, base, 'default', 0, 0, 0, 0));
    }
    // Phase 2: cheapest version of every known spell.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        tryAdd(buildCheapestVariant(entity, baseId, base, limitsByBaseId[baseId]));
    }
    // Phase 3: most expensive version of every known spell.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        tryAdd(buildMostExpensiveVariant(entity, baseId, base, limitsByBaseId[baseId]));
    }
    // Phase 4: random combinations filling any remaining slots. Bounded
    // attempt count — with no metamagic skills at all there's only ever
    // one possible variant per spell (base/cheap/expensive all collapse
    // to the same thing), so this must be able to give up rather than
    // spin forever trying to find a new unique combination that doesn't
    // exist.
    let attempts = 0;
    const maxAttempts = maxSlots * 25;
    while (entity.createdSpells.length < maxSlots && attempts < maxAttempts) {
        attempts++;
        const { baseId, base } = known[attempts % known.length];
        tryAdd(buildRandomVariant(entity, baseId, base, limitsByBaseId[baseId]));
    }
}

window.autoBuildSpellsForEntity = autoBuildSpellsForEntity;
