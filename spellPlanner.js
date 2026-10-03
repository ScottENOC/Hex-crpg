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

// BURST-capable: a single-target damage/heal spell whose school has the
// <school>_burst skill can be built as an area burst instead (see skills.js's
// arcane_burst/divine_burst/nature_burst) — centered on a clicked hex, not
// the caster, same as the game's other AOE types (dragon breath, entangle).
function isBurstCapable(base, options) {
    return !!options.burst && (base.type === 'damage' || base.type === 'heal');
}

function getSpellDialLimits(entity, base) {
    const school = base.school;
    const options = (entity.unlockedCastingOptions && entity.unlockedCastingOptions[school]) || {};
    const skills = entity.skills || {};
    const burstCapable = isBurstCapable(base, options);
    // SUBTLE (skills.js's subtle_spell, rogue tree) — universal across
    // schools, unlike burst, since it's a rogue skill about HOW you cast.
    // Never available for damage (a Firebolt can't be subtle).
    const subtleCapable = !!skills.subtle_spell && base.type !== 'damage';
    // TOUCH (skills.js's <school>_touch) — the inverse of the range dial:
    // caps range at 1 for a mana discount instead of paying more to reach
    // further. Only meaningful when the base spell's range is already > 1.
    const touchCapable = !!options.touch && (base.baseRange || 1) > 1;
    return {
        school,
        quickened: !!options.quickened,
        slowed: !!options.slowed,
        maxRange: options.extraRange || 0,
        maxMagnitude: options.extraMagnitude || 0,
        maxRadius: (base.baseRadius !== undefined || burstCapable) ? (skills[`${school}_expand`] || 0) : 0,
        maxTargets: (base.type !== 'aoe_debuff' && base.type !== 'summon') ? (skills[`${school}_targets`] || 0) : 0,
        cap: (entity.manaCaps && entity.manaCaps[school]) || 10,
        burstCapable,
        subtleCapable,
        touchCapable,
    };
}

// Exact port of ui.js's renderSpellStats cost formula (arcane-only
// efficiency skills are a real, existing asymmetry there — not a bug this
// planner should paper over).
function computeSpellVariant(entity, baseId, base, speed, magBonus, rangeBonus, radBonus, targetBonus, burst = false, subtle = false, touch = false) {
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
    // TOUCH (skills.js's <school>_touch): caps range at 1 for a discount,
    // mutually exclusive with the range-bonus dial by construction.
    if (touch) manaCost -= 3; else manaCost += Math.max(0, rangeBonus - effRange);
    manaCost += (magBonus * Math.max(0, 5 - effMag));
    manaCost += (radBonus * 10);
    manaCost += (targetBonus * 15);
    // BURST: converts a single-target damage/heal spell into an area burst
    // centered on a clicked hex (see skills.js's <school>_burst) — a flat
    // surcharge for the conversion itself, on top of the existing radius
    // dial cost (radBonus*10 above) for scaling it further.
    if (burst) manaCost += 8;
    // SUBTLE (skills.js's subtle_spell): doesn't break stealth when cast.
    if (subtle) { manaCost += 6; tpCost += 5; }
    manaCost = Math.max(1, manaCost);
    const coreManaCost = base.baseMana + (touch ? -3 : Math.max(0, rangeBonus - effRange)) + (magBonus * Math.max(0, 5 - effMag)) + (radBonus * 10) + (targetBonus * 15) + (burst ? 8 : 0) + (subtle ? 6 : 0);
    const magnitude = base.baseMagnitude * (1 + magBonus);
    const range = touch ? 1 : ((base.baseRange || 1) + rangeBonus);
    const radius = burst ? (1 + radBonus) : ((base.baseRadius || 0) + radBonus);
    const type = burst ? (base.type === 'heal' ? 'aoe_heal' : 'aoe_damage') : base.type;
    return {
        name: base.name, school, baseId, type,
        manaCost, coreManaCost, tpCost, magnitude, range, radius, extraTargets: targetBonus, subtle, touch,
    };
}

function variantKey(v) {
    return `${v.baseId}|${v.type}|${v.tpCost}|${v.manaCost}|${v.range}|${v.radius}|${v.extraTargets}`;
}

// Fills dials in cheapest-per-unit order (range=1/pt, magnitude≈5/pt,
// radius=10/pt, targets=15/pt) to spend as much of the mana cap as
// possible without exceeding it — a simple, good-enough greedy for
// "the most expensive version this entity could build".
function buildMostExpensiveVariant(entity, baseId, base, limits, burst = false, subtle = false) {
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
            const v = computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB, burst, subtle);
            if (v.manaCost > limits.cap) { dial.set(trial - 1); break; }
        }
    }
    return computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB, burst, subtle);
}

function buildCheapestVariant(entity, baseId, base, limits, burst = false) {
    const speed = limits.slowed ? 'slowed' : 'default';
    return computeSpellVariant(entity, baseId, base, speed, 0, 0, 0, 0, burst);
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
    const burst = limits.burstCapable && Math.random() < 0.5;
    return computeSpellVariant(entity, baseId, base, speed, magB, rangeB, radB, targB, burst);
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
    // Phase 3b: burst-mode versions (base and most-expensive) of every
    // burst-capable known spell — an AI caster with the <school>_burst
    // skill gets both the plain single-target build and an area-burst
    // build in its prepared spellbook, so the attack-spell selector
    // (aiProcess) actually has an AOE option to weigh against clustered
    // opponents rather than only ever building single-target versions.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        const limits = limitsByBaseId[baseId];
        if (!limits.burstCapable) continue;
        tryAdd(computeSpellVariant(entity, baseId, base, 'default', 0, 0, 0, 0, true));
        if (entity.createdSpells.length >= maxSlots) break;
        tryAdd(buildMostExpensiveVariant(entity, baseId, base, limits, true));
    }
    // Phase 3c: a Subtle (skills.js's subtle_spell, rogue tree) build of
    // every subtle-capable known spell — a rogue/caster multiclass NPC
    // gets a stealth-preserving version of its non-damaging spells too.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        if (!limitsByBaseId[baseId].subtleCapable) continue;
        tryAdd(computeSpellVariant(entity, baseId, base, 'default', 0, 0, 0, 0, false, true));
    }
    // Phase 3d: a Touch (skills.js's <school>_touch) build of every
    // touch-capable known spell — an NPC caster with the skill gets a
    // cheaper adjacent-only version alongside its normal-range build.
    for (const { baseId, base } of known) {
        if (entity.createdSpells.length >= maxSlots) break;
        if (!limitsByBaseId[baseId].touchCapable) continue;
        tryAdd(computeSpellVariant(entity, baseId, base, 'default', 0, 0, 0, 0, false, false, true));
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

// REAL-TIME IDLE BEHAVIOURS
// Player preference, not save-state: like graphics/UI settings, this lives in
// localStorage. Absent key means ON so new/existing installs get Auto Heal by
// default. The controller only makes decisions in exploration; actual casts go
// through tryCastSpell so cast time, mana payment, visuals and messages remain
// owned by the normal spell pipeline.
const AUTO_HEAL_STORAGE_KEY = 'rpg_idle_auto_heal';
const AUTO_HEAL_APPROACH_HEXES = 5;

function isAutoHealEnabled() {
    try {
        return !window.localStorage || window.localStorage.getItem(AUTO_HEAL_STORAGE_KEY) !== 'false';
    } catch (_) {
        return true;
    }
}

function setAutoHealEnabled(enabled) {
    const value = !!enabled;
    try {
        if (window.localStorage) window.localStorage.setItem(AUTO_HEAL_STORAGE_KEY, value ? 'true' : 'false');
    } catch (_) {}
    const checkbox = window.document && window.document.getElementById('idle-auto-heal');
    if (checkbox) checkbox.checked = value;
}

function hasIdleInstruction(entity) {
    if (!entity) return true;
    return !!entity.destination || !!entity.pendingCast || (entity.castCooldown || 0) > 0;
}

function isHealingSpell(spell) {
    return !!spell && spell.baseId === 'heal' && (spell.type === 'heal' || spell.type === 'aoe_heal');
}

function getAutoHealManaCost(caster, spell) {
    const base = Math.max(0, Number(spell && spell.manaCost) || 0);
    const penalty = typeof window.getArmorSpellPenalty === 'function'
        ? Math.max(0, Number(window.getArmorSpellPenalty(caster, spell)) || 0)
        : 0;
    return base + penalty;
}

function healEfficiency(caster, spell) {
    const mana = Math.max(1, getAutoHealManaCost(caster, spell));
    const healing = Math.max(0, Number(spell && spell.magnitude) || 0);
    return healing / mana;
}

function alreadyReceivingAutoHeal(target, party, caster) {
    return party.some(member => member !== target && member !== caster && (
        (member.pendingCast && member.pendingCast.target === target && isHealingSpell(member.pendingCast.spell)) ||
        member._autoHealTarget === target
    ));
}

function getAutoHealApproachDestination(caster, target, spell) {
    if (!window.distance) return undefined;
    const range = Math.max(1, Number(spell && spell.range) || 1);
    const directDistance = window.distance(caster.hex, target.hex);
    if (directDistance <= range) return null;
    if (directDistance > range + AUTO_HEAL_APPROACH_HEXES || typeof window.findPath !== 'function') return undefined;

    // Use the real movement path, not just straight-line hex distance. If a
    // wall/detour means reaching casting range would take >5 actual steps,
    // Auto Heal leaves the character alone. Path[0] is the caster's hex.
    const path = window.findPath(caster.hex, target.hex, undefined, caster, true);
    if (!path || path.length < 2) return undefined;
    const furthestStep = Math.min(AUTO_HEAL_APPROACH_HEXES, path.length - 1);
    for (let step = 1; step <= furthestStep; step++) {
        const hex = path[step];
        if (window.distance(hex, target.hex) <= range) return { q: hex.q, r: hex.r };
    }
    return undefined;
}

function selectAutoHealAction(caster, party = window.entities || []) {
    if (!caster || !caster.alive || caster.side !== 'player' || caster.aiControlled || caster.rider || hasIdleInstruction(caster)) return null;
    if (!(caster.maxMana > 0) || !(caster.currentMana > 0)) return null;

    const prepared = (caster.createdSpells || []).filter(spell =>
        isHealingSpell(spell) && Number.isFinite(spell.manaCost) && spell.manaCost > 0 &&
        caster.currentMana >= getAutoHealManaCost(caster, spell) &&
        Number.isFinite(spell.magnitude) && spell.magnitude > 0);
    if (!prepared.length) return null;

    const manaPct = caster.currentMana / caster.maxMana;
    const candidates = [];
    for (const target of party) {
        if (!target || !target.alive || target.side !== 'player' || target.aiControlled || target.rider || !(target.maxHp > 0)) continue;
        if (target.hp >= target.maxHp || hasIdleInstruction(target)) continue;
        if ((target.hp / target.maxHp) >= manaPct) continue;
        if (alreadyReceivingAutoHeal(target, party, caster)) continue;

        const distance = window.distance ? window.distance(caster.hex, target.hex) : Infinity;
        const usable = prepared.map(spell => {
            const range = Math.max(1, Number(spell.range) || 1);
            if (distance > range + AUTO_HEAL_APPROACH_HEXES) return null;
            const approachDestination = getAutoHealApproachDestination(caster, target, spell);
            if (distance > range && !approachDestination) return null;
            return { spell, approachDestination };
        }).filter(Boolean);
        if (!usable.length) continue;

        usable.sort((a, b) => {
            const eff = healEfficiency(caster, b.spell) - healEfficiency(caster, a.spell);
            if (Math.abs(eff) > 1e-9) return eff;
            const aCost = getAutoHealManaCost(caster, a.spell);
            const bCost = getAutoHealManaCost(caster, b.spell);
            if (aCost !== bCost) return aCost - bCost;
            return (b.spell.magnitude || 0) - (a.spell.magnitude || 0);
        });
        candidates.push({ target, spell: usable[0].spell, approachDestination: usable[0].approachDestination });
    }

    // "Fewest hitpoints" deliberately means absolute current HP, not health
    // percentage. Percentage is only the mana-conservation gate above.
    candidates.sort((a, b) => {
        if (a.target.hp !== b.target.hp) return a.target.hp - b.target.hp;
        const ap = a.target.hp / a.target.maxHp;
        const bp = b.target.hp / b.target.maxHp;
        return ap - bp;
    });
    if (!candidates.length) return null;
    return { caster, target: candidates[0].target, spell: candidates[0].spell, approachDestination: candidates[0].approachDestination };
}

function processAutoHeal() {
    if (!isAutoHealEnabled()) return false;
    if (window.isInCombat || window.currentTurnEntity || window.isPausedForReaction || window.isResting || window.isSleeping) return false;
    if (window.multiplayer && window.multiplayer.roomCode && !window.multiplayer.isHost) return false;
    if (!Array.isArray(window.entities) || typeof window.tryCastSpell !== 'function') return false;

    const party = window.entities.filter(entity => entity && entity.alive && entity.side === 'player' && !entity.rider && !entity.aiControlled);
    let startedAny = false;
    for (const caster of party) {
        const action = selectAutoHealAction(caster, party);
        if (!action) {
            if (!caster.destination && !caster.pendingCast) caster._autoHealTarget = null;
            continue;
        }
        if (action.approachDestination) {
            caster._autoHealTarget = action.target;
            caster.destination = { ...action.approachDestination };
            startedAny = true;
            continue;
        }
        caster._autoHealTarget = null;
        const started = window.tryCastSpell(action.caster, action.spell, action.target, action.target.hex);
        if (started !== false) startedAny = true;
    }
    return startedAny;
}

function installIdleBehaviourSettingsUI() {
    if (!window.document) return;
    const settingsContent = window.document.getElementById('settings-content');
    if (!settingsContent || window.document.getElementById('idle-auto-heal')) return;

    const heading = window.document.createElement('h3');
    heading.textContent = 'Idle Behaviours';
    const group = window.document.createElement('div');
    group.className = 'form-group';
    const label = window.document.createElement('label');
    const checkbox = window.document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'idle-auto-heal';
    checkbox.checked = isAutoHealEnabled();
    checkbox.addEventListener('change', () => setAutoHealEnabled(checkbox.checked));
    label.appendChild(checkbox);
    label.appendChild(window.document.createTextNode(' Auto Heal while idle'));
    group.appendChild(label);

    const help = window.document.createElement('small');
    help.style.color = '#aaa';
    help.textContent = 'Outside combat, idle healers may walk up to 5 hexes to get within normal spell range, then heal nearby idle party members when the target\'s health % is below the caster\'s mana %.';
    group.appendChild(help);

    const graphicsHeading = Array.from(settingsContent.querySelectorAll('h3'))
        .find(node => node.textContent.trim() === 'Graphics');
    settingsContent.insertBefore(heading, graphicsHeading || null);
    settingsContent.insertBefore(group, graphicsHeading || null);
}

window.idleBehaviours = {
    isAutoHealEnabled,
    setAutoHealEnabled,
    hasIdleInstruction,
    getAutoHealManaCost,
    healEfficiency,
    getAutoHealApproachDestination,
    selectAutoHealAction,
    processAutoHeal,
    installSettingsUI: installIdleBehaviourSettingsUI,
};
window.setAutoHealEnabled = setAutoHealEnabled;

if (window.document && typeof window.document.addEventListener === 'function') {
    window.document.addEventListener('DOMContentLoaded', () => {
        installIdleBehaviourSettingsUI();
        if (!window._idleBehaviourInterval && typeof window.setInterval === 'function') {
            window._idleBehaviourInterval = window.setInterval(processAutoHeal, 250);
        }
    });
}
