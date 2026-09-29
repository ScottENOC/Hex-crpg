// npcProgressionModes.js
// Final policy layer for humanoid progression. It distinguishes deliberately
// authored characters from rolled population NPCs and true civilians, and it
// treats leftover spendable NPC points as a generator bug rather than normal
// state. Loaded after npcProgressionPolicy.js + namedNpcProgression.js.
(() => {
    'use strict';

    const MODES = Object.freeze({
        AUTHORED: 'authored',
        POPULATION: 'population',
        CIVILIAN: 'civilian',
    });
    const EXCLUDED_SKILLS = new Set(['learn_unicorn_summon', 'runesmithing', 'leatherworking']);

    function totalPoints(attributes) {
        return Object.values(attributes || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    }

    function classCounts(levels) {
        const out = {};
        (levels || []).forEach(cls => { out[cls] = (out[cls] || 0) + 1; });
        return out;
    }

    function modeForSpec(spec = {}) {
        if (Object.values(MODES).includes(spec.progressionMode)) return spec.progressionMode;
        if (Array.isArray(spec.classLevels)) return spec.classLevels.length ? MODES.AUTHORED : MODES.CIVILIAN;
        return MODES.POPULATION;
    }

    function unwrap(fn) {
        let current = fn;
        const seen = new Set();
        while (typeof current === 'function' && !seen.has(current)) {
            seen.add(current);
            const next = current.__previous || current.__original;
            if (typeof next !== 'function') break;
            current = next;
        }
        return current;
    }

    function emptyAttributes() {
        const keys = new Set(['strength', 'endurance', 'agility', 'weapons', 'divine', 'nature', 'arcane', 'wildcard', 'fighter', 'rogue', 'cleric', 'wizard', 'druid', 'monk', 'Way of the open palm']);
        Object.values(window.raceData || {}).forEach(def => Object.keys(def?.bonus || {}).forEach(k => keys.add(k)));
        Object.values(window.classData || {}).forEach(def => Object.keys(def?.bonus || {}).forEach(k => keys.add(k)));
        const out = {};
        keys.forEach(k => { out[k] = 0; });
        return out;
    }

    function normaliseCivilian(entity) {
        if (!entity) return entity;
        entity.npcProgressionMode = MODES.CIVILIAN;
        entity.npcAuthoredProgression = false;
        entity.npcClassPackage = null;
        entity.classLevels = [];
        entity.classLevelCounts = {};
        entity.class = null;
        entity.level = 1; // engine compatibility: civilian means no class, not level zero physiology
        entity.attributes = emptyAttributes();
        entity.skills = {};
        entity.npcSkillPointBudget = 0;
        entity.npcUnspentSkillPoints = 0;
        entity.npcProgressionWarnings = [];
        entity.currentMana = 0;
        entity.maxMana = 0;
        entity.createdSpells = [];
        entity.hp = entity.maxHp = 10;
        return entity;
    }

    function equippedWeaponIds(entity) {
        return [entity?.equipped?.weapon, entity?.equipped?.offhand]
            .filter(Boolean)
            .filter(id => window.items?.[id]?.type === 'weapon');
    }

    function hasShield(entity) {
        const id = entity?.equipped?.offhand;
        return !!id && window.items?.[id]?.type === 'shield';
    }

    function armorTrainingNeeded(entity) {
        const armor = window.items?.[entity?.equipped?.armor];
        return new Set(window.NPCProgression?.armorTrainingForItem?.(armor) || []);
    }

    function racialTrees() {
        return new Set(Object.values(window.NPCProgression?.RACE_PROFILES || {}).map(p => p?.racialTree).filter(Boolean));
    }

    function contextAllows(entity, skillId, skill) {
        if (!skill || EXCLUDED_SKILLS.has(skillId)) return false;
        if (skill.tree === 'monster_skills') return false;

        const weaponMatch = skill.npcEquipmentWeapon || skillId.match(/^(sword|axe|bow|spear|dagger|club)_/)?.[1];
        if (weaponMatch && !equippedWeaponIds(entity).includes(weaponMatch)) return false;
        if (skill.npcRequiresShield && !hasShield(entity)) return false;
        if (skill.npcRequiresMount && !(entity.riding || entity.npcNeedsRidingSkill)) return false;
        if (skill.npcEquipmentRequirement === 'armor' && !armorTrainingNeeded(entity).has(skillId)) return false;

        const raceTreeSet = racialTrees();
        if (raceTreeSet.has(skill.tree)) {
            const own = window.NPCProgression?.RACE_PROFILES?.[entity.race]?.racialTree;
            if (skill.tree !== own) return false;
        }
        return true;
    }

    function hardLegal(entity, skillId, skill) {
        if (!contextAllows(entity, skillId, skill)) return false;
        const current = entity.skills?.[skillId] || 0;
        if (skill.maxRanks > 0 && current >= skill.maxRanks) return false;
        if (skill.anti_prereq && (entity.skills?.[skill.anti_prereq] || 0) > 0) return false;
        if (skill.prereq && (entity.skills?.[skill.prereq] || 0) <= 0) return false;
        if (typeof skill.prereq_eval === 'function') {
            try { if (!skill.prereq_eval(entity)) return false; } catch (_) { return false; }
        }
        return true;
    }

    function candidateScore(entity, skillId, skill) {
        let score = 0;
        const preferred = Number(entity.npcPreferredSkills?.[skillId]) || 0;
        const current = Number(entity.skills?.[skillId]) || 0;
        if (preferred > current) score += 1000 + (preferred - current) * 20;
        if (skill.npcEquipmentWeapon) score += 180;
        if (skill.npcRequiresShield || skill.npcRequiresMount || skill.npcEquipmentRequirement) score += 160;
        if (current > 0) score += 25; // deepen an existing coherent specialty before branching randomly
        if (/^(health|health_regen|meleeDamage|timePointRate|quickRecovery|initiativeBonus|arcane_mana|divine_mana|nature_mana)$/.test(skillId)) score += 10;
        return score;
    }

    function spendFromPool(entity, pool) {
        const candidates = Object.entries(window.skills || {})
            .filter(([id, skill]) => {
                if (pool === 'wildcard') return hardLegal(entity, id, skill);
                return skill?.tree === pool && hardLegal(entity, id, skill);
            })
            .sort((a, b) => candidateScore(entity, b[0], b[1]) - candidateScore(entity, a[0], a[1]) || a[0].localeCompare(b[0]));
        if (!candidates.length) return false;
        const [skillId, skill] = candidates[0];
        entity.attributes[pool] -= 1;
        entity.skills = entity.skills || {};
        entity.skills[skillId] = (entity.skills[skillId] || 0) + 1;
        if (typeof skill.apply === 'function') skill.apply(entity);
        return true;
    }

    function enforceZeroUnspent(entity) {
        if (!entity || entity.npcProgressionMode === MODES.CIVILIAN || !entity.attributes) return entity;
        let guard = 0;
        let progress = true;
        while (progress && totalPoints(entity.attributes) > 0 && guard++ < 2000) {
            progress = false;
            const pools = Object.entries(entity.attributes)
                .filter(([, points]) => (Number(points) || 0) > 0)
                .map(([tree]) => tree)
                .sort((a, b) => a === 'wildcard' ? 1 : b === 'wildcard' ? -1 : a.localeCompare(b));
            for (const pool of pools) {
                if (spendFromPool(entity, pool)) progress = true;
            }
        }

        const unspentByPool = Object.fromEntries(Object.entries(entity.attributes)
            .filter(([, points]) => (Number(points) || 0) > 0));
        const remaining = totalPoints(entity.attributes);
        entity.npcUnspentSkillPoints = remaining;
        entity.npcProgressionWarnings = (entity.npcProgressionWarnings || []).filter(w => w?.type !== 'unspent_skill_points');
        if (remaining > 0) {
            const warning = { type: 'unspent_skill_points', points: remaining, pools: unspentByPool };
            entity.npcProgressionWarnings.push(warning);
            console.warn('[NPCProgression] No legal skill remained for allocated NPC points', entity.name, warning);
        }
        if (entity.maxHp && entity.hp > entity.maxHp) entity.hp = entity.maxHp;
        return entity;
    }

    function wrapProgressionRebuild() {
        const api = window.NPCProgression;
        if (!api?.rebuildProgression || api.rebuildProgression.__modeInvariant) return;
        const previous = api.rebuildProgression;
        const wrapped = function(entity, options) {
            const out = previous(entity, options);
            return enforceZeroUnspent(out);
        };
        wrapped.__modeInvariant = true;
        wrapped.__previous = previous;
        api.rebuildProgression = wrapped;
    }

    function wrapBuildNPC() {
        if (typeof window.buildNPC !== 'function' || window.buildNPC.__progressionModes) return;
        const previous = window.buildNPC;
        const base = unwrap(previous);
        const wrapped = function(spec = {}) {
            const mode = modeForSpec(spec);
            if (mode === MODES.CIVILIAN && typeof base === 'function' && window.raceData?.[spec.race || 'human']) {
                const entity = base({ ...spec, classLevels: [], skillPicks: [] });
                return normaliseCivilian(entity);
            }
            const entity = previous({ ...spec, progressionMode: mode });
            if (!entity) return entity;
            entity.npcProgressionMode = entity.npcAuthoredProgression ? MODES.AUTHORED : mode;
            return enforceZeroUnspent(entity);
        };
        wrapped.__progressionModes = true;
        wrapped.__previous = previous;
        window.buildNPC = wrapped;
    }

    function wrapCreateMonster() {
        if (typeof window.createMonster !== 'function' || window.createMonster.__progressionModes) return;
        const previous = window.createMonster;
        const wrapped = function(...args) {
            const entity = previous(...args);
            if (!entity?.npcClassPackage) return entity;
            entity.npcProgressionMode = entity.npcAuthoredProgression ? MODES.AUTHORED : MODES.POPULATION;
            return enforceZeroUnspent(entity);
        };
        wrapped.__progressionModes = true;
        wrapped.__previous = previous;
        window.createMonster = wrapped;
    }

    function wrapScaling() {
        if (typeof window.applyClassLevelScaling !== 'function' || window.applyClassLevelScaling.__modeInvariant) return;
        const previous = window.applyClassLevelScaling;
        const wrapped = function(entity, levels) {
            const out = previous(entity, levels);
            enforceZeroUnspent(entity);
            return out;
        };
        wrapped.__modeInvariant = true;
        wrapped.__previous = previous;
        window.applyClassLevelScaling = wrapped;
    }

    function initialise() {
        if (!window.NPCProgression) return;
        wrapProgressionRebuild();
        wrapBuildNPC();
        wrapCreateMonster();
        wrapScaling();
    }

    window.NPC_PROGRESSION_MODES = MODES;
    window.getNpcProgressionMode = modeForSpec;
    window.enforceNpcZeroUnspent = enforceZeroUnspent;
    window.normaliseCivilianNpc = normaliseCivilian;
    window.initialiseNpcProgressionModes = initialise;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
