// PC-style progression for humanoid NPCs: race -> discrete class package -> legal skill spending.
(() => {
    'use strict';
    const BASE_HP = 10;
    const MAX_INFERRED_LEVEL = 8;
    const NON_PLAYER_RACES = {
        ogre:     { bonus: { strength: 4, endurance: 4, weapons: 1 } },
        troll:    { bonus: { strength: 3, endurance: 4 } },
        minotaur: { bonus: { strength: 3, endurance: 2, weapons: 1 } },
        harpy:    { bonus: { agility: 3, endurance: 1 } },
        revenant: { bonus: { strength: 2, endurance: 3 } },
        skeleton: { bonus: { strength: 1, endurance: 2, weapons: 1 } },
        zombie:   { bonus: { strength: 2, endurance: 4 } },
    };
    Object.entries(NON_PLAYER_RACES).forEach(([race, def]) => {
        if (!window.raceData[race]) window.raceData[race] = def;
    });
    const RACE_PROFILES = {
        human: {
            racialTree: null,
            packages: [
                ['fighter', 18], ['rogue', 16], ['cleric', 12], ['wizard', 12], ['druid', 10], ['monk', 8],
                ['fighter/rogue', 8], ['fighter/cleric', 6], ['rogue/wizard', 5], ['fighter/wizard', 3], ['rogue/druid', 2],
            ],
        },
        dwarf: {
            racialTree: 'dwarf',
            packages: [['fighter', 45], ['fighter/cleric', 25], ['cleric', 15], ['fighter/monk', 10], ['rogue', 5]],
        },
        elf: {
            racialTree: 'elf',
            packages: [['wizard', 30], ['rogue/wizard', 25], ['rogue', 20], ['fighter/wizard', 10], ['druid', 10], ['fighter', 5]],
        },
        goblin: {
            racialTree: 'goblin',
            packages: [['rogue', 25], ['rogue/fighter', 25], ['rogue/wizard', 25], ['wizard', 12.5], ['fighter/cleric', 12.5]],
        },
        orc: {
            racialTree: 'orc',
            packages: [['fighter', 55], ['fighter/rogue', 20], ['fighter/cleric', 15], ['fighter/druid', 5], ['cleric', 5]],
        },
        ogre: {
            racialTree: null,
            packages: [['fighter', 65], ['fighter/rogue', 10], ['fighter/cleric', 10], ['fighter/druid', 10], ['monk', 5]],
            innateSkills: {},
        },
        troll: {
            racialTree: null,
            packages: [['fighter', 60], ['fighter/druid', 20], ['fighter/cleric', 10], ['rogue', 10]],
            innateSkills: { regeneration: 1 },
        },
        minotaur: {
            racialTree: null,
            packages: [['fighter', 70], ['fighter/rogue', 15], ['fighter/cleric', 10], ['monk', 5]],
            innateSkills: { gore_charge: 1 },
        },
        harpy: {
            racialTree: null,
            packages: [['rogue', 35], ['rogue/wizard', 30], ['wizard', 20], ['rogue/druid', 10], ['fighter/rogue', 5]],
            innateSkills: { siren_song: 1 },
        },
        revenant: {
            racialTree: null,
            packages: [['fighter', 55], ['fighter/cleric', 30], ['cleric', 10], ['fighter/rogue', 5]],
            innateSkills: { revenant_revive: 1 },
        },
        skeleton: {
            racialTree: null,
            packages: [['fighter', 60], ['fighter/rogue', 20], ['fighter/cleric', 10], ['rogue', 10]],
        },
        zombie: {
            racialTree: null,
            packages: [['fighter', 80], ['fighter/cleric', 20]],
        },
    };
    const MONSTER_RACE = {
        goblin: 'goblin',
        elite_goblin: 'goblin',
        wolf_rider_goblin: 'goblin',
        orc: 'orc',
        bandit: 'human',
        horse_archer: 'human',
        troll: 'troll',
        ogre: 'ogre',
        harpy: 'harpy',
        minotaur: 'minotaur',
        revenant: 'revenant',
        skeleton: 'skeleton',
        zombie: 'zombie',
    };
    const CUSTOM_IMAGE_TYPES = new Set(['elite_goblin', 'harpy', 'wraith', 'basilisk', 'minotaur']);
    const TREE_PRIORITIES = {
        strength: ['meleeDamage', 'shove', 'iron_grip'],
        endurance: ['health', 'health_regen'],
        agility: ['riding', 'fastMovement', 'keen_perception', 'stealth_agility', 'sure_footed', 'timePointRate', 'sidestep', 'sidestep_mastery'],
        weapons: [],
        fighter: ['battle_reflexes', 'protector'],
        rogue: ['stealth_rogue', 'quickRecovery', 'initiativeBonus', 'speedy_stealth', 'subtle_spell', 'dagger_quick_draw', 'assassinate'],
        wizard: ['firebolt_hit', 'arcane_eff_range', 'arcane_eff_magnitude', 'arcane_eff_speed'],
        cleric: ['divine_judgment', 'holy_ground', 'cleric_trigger_damage', 'cleric_trigger_mana', 'cleric_trigger_vision', 'cleric_trigger_dmg_red', 'cleric_trigger_heal_red', 'extended_sentence', 'armistice'],
        druid: ['druid_foliage_expertise', 'druid_knowledge_nature'],
        monk: ['swift_step', 'trip_reaction', 'agile_climber', 'disarm'],
        arcane: ['learn_firebolt', 'arcane_mana', 'arcane_regen', 'learn_counterspell', 'arcane_expand', 'arcane_targets'],
        divine: ['learn_heal', 'divine_mana', 'divine_regen', 'learn_smite_evil', 'learn_divine_protection', 'learn_divine_silence', 'learn_sanctuary', 'knowledge_religion'],
        nature: ['learn_summon_animal', 'nature_mana', 'nature_regen', 'learn_entangle', 'learn_calm_animal', 'learn_wild_fury'],
        goblin: ['goblin_quick_reflexes', 'goblin_opportunist', 'goblin_low_light_eyes', 'goblin_pack_hunter', 'goblin_keen_senses'],
        orc: ['orc_brute_strength', 'orc_thick_hide', 'orc_ferocity', 'orc_momentum', 'orc_relentless'],
        elf: ['elf_vision', 'elf_darkvision', 'elf_bow_range', 'keen_hearing', 'whisper_step', 'elf_foliage_expertise', 'elf_knowledge_nature', 'elven_grace', 'ageless_patience'],
    };
    const SOFT_CAPS = {
        health: 4,
        health_regen: 2,
        meleeDamage: 3,
        timePointRate: 3,
        quickRecovery: 4,
        initiativeBonus: 3,
        arcane_mana: 3,
        divine_mana: 3,
        nature_mana: 3,
        arcane_regen: 2,
        divine_regen: 2,
        nature_regen: 2,
    };
    const EXCLUDED_SKILLS = new Set(['learn_unicorn_summon', 'runesmithing', 'leatherworking']);
    const CLASS_SPELL_MUST_HAVE = {
        wizard: 'learn_firebolt',
        cleric: 'learn_heal',
        druid: 'learn_summon_animal',
    };
    function hashString(input) {
        let h = 2166136261 >>> 0;
        const s = String(input || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }
    function seededRandom(seed) {
        let state = hashString(seed) || 0x9e3779b9;
        return () => {
            state += 0x6D2B79F5;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function packageClasses(packageId) {
        return String(packageId || 'fighter').split('/').filter(Boolean);
    }
    function pickWeightedPackage(race, rng = Math.random) {
        const profile = RACE_PROFILES[race] || RACE_PROFILES.human;
        const rows = profile.packages || [['fighter', 1]];
        const total = rows.reduce((s, [, weight]) => s + Number(weight || 0), 0) || 1;
        let roll = rng() * total;
        for (const [id, weight] of rows) {
            roll -= Number(weight || 0);
            if (roll <= 0) return { id, classes: packageClasses(id), primary: packageClasses(id)[0] };
        }
        const id = rows[rows.length - 1][0];
        return { id, classes: packageClasses(id), primary: packageClasses(id)[0] };
    }
    function expandClassPackage(packageDef, level) {
        const classes = Array.isArray(packageDef?.classes) && packageDef.classes.length ? packageDef.classes : ['fighter'];
        const result = [];
        const target = Math.max(1, Math.floor(level || 1));
        for (let i = 0; i < target; i++) result.push(classes[i % classes.length]);
        return result;
    }
    function classCounts(classLevels) {
        const out = {};
        (classLevels || []).forEach(cls => { out[cls] = (out[cls] || 0) + 1; });
        return out;
    }
    function sumRanks(skillMap) {
        return Object.values(skillMap || {}).reduce((sum, rank) => sum + (Number(rank) || 0), 0);
    }
    function allAttributeKeys() {
        const keys = new Set(['strength', 'endurance', 'agility', 'weapons', 'divine', 'nature', 'arcane', 'wildcard', 'fighter', 'rogue', 'cleric', 'wizard', 'druid', 'monk', 'Way of the open palm']);
        Object.values(window.raceData || {}).forEach(def => Object.keys(def?.bonus || {}).forEach(k => keys.add(k)));
        Object.values(window.classData || {}).forEach(def => Object.keys(def?.bonus || {}).forEach(k => keys.add(k)));
        return keys;
    }
    function hasRacialTree(race) {
        const profile = RACE_PROFILES[race];
        const tree = profile?.racialTree;
        if (!tree) return null;
        return Object.values(window.skills || {}).some(skill => skill?.tree === tree) ? tree : null;
    }
    function buildAttributes(race, classLevels) {
        const attrs = {};
        allAttributeKeys().forEach(k => { attrs[k] = 0; });
        const rb = window.raceData?.[race]?.bonus || {};
        Object.entries(rb).forEach(([k, v]) => { attrs[k] = (attrs[k] || 0) + (Number(v) || 0); });
        (classLevels || []).forEach(cls => {
            const cb = window.classData?.[cls]?.bonus || {};
            Object.entries(cb).forEach(([k, v]) => { attrs[k] = (attrs[k] || 0) + (Number(v) || 0); });
        });
        const racialTree = hasRacialTree(race);
        const primary = classLevels?.[0] || 'fighter';
        if (!racialTree) {
            if ((attrs.wildcard || 0) > 0) attrs.wildcard -= 1;
            attrs[primary] = (attrs[primary] || 0) + 1;
        }
        return attrs;
    }
    function totalAttributePoints(attrs) {
        return Object.values(attrs || {}).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0);
    }
    function projectedBudget(race, packageDef, level) {
        return totalAttributePoints(buildAttributes(race, expandClassPackage(packageDef, level)));
    }
    function inferLevel(race, packageDef, legacyPointTarget, minimum = 1) {
        const target = Math.max(1, Number(legacyPointTarget) || 1);
        let bestLevel = Math.max(1, minimum || 1);
        let bestDiff = Infinity;
        for (let level = bestLevel; level <= MAX_INFERRED_LEVEL; level++) {
            const diff = Math.abs(projectedBudget(race, packageDef, level) - target);
            if (diff < bestDiff) {
                bestDiff = diff;
                bestLevel = level;
            }
        }
        return bestLevel;
    }
    function classFromSkillTree(tree) {
        if (tree === 'fighter') return 'fighter';
        if (tree === 'rogue') return 'rogue';
        if (tree === 'wizard' || tree === 'arcane') return 'wizard';
        if (tree === 'cleric' || tree === 'divine') return 'cleric';
        if (tree === 'druid' || tree === 'nature') return 'druid';
        if (tree === 'monk' || tree === 'Way of the open palm') return 'monk';
        return null;
    }
    function inferPackageFromPreferredSkills(preferredSkills) {
        const scores = {};
        Object.entries(preferredSkills || {}).forEach(([skillId, rank]) => {
            const cls = classFromSkillTree(window.skills?.[skillId]?.tree);
            if (cls) scores[cls] = (scores[cls] || 0) + Math.max(1, Number(rank) || 1);
        });
        const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (!rows.length) return null;
        const primary = rows[0][0];
        const classes = [primary];
        if (rows[1] && rows[1][1] >= Math.max(1, rows[0][1] * 0.5)) classes.push(rows[1][0]);
        return { id: classes.join('/'), classes, primary };
    }
    function armorTrainingForItem(item) {
        if (!item || item.type !== 'armor' || item.subType === 'barding') return [];
        const reduction = Number(item.reduction || 0);
        if (reduction >= 3) return ['light_armor_training', 'medium_armor_training', 'heavy_armor_training'];
        if (reduction >= 2) return ['light_armor_training', 'medium_armor_training'];
        if (reduction >= 1) return ['light_armor_training'];
        return [];
    }
    function equipmentRequirements(entity) {
        const required = [];
        const armor = window.items?.[entity?.equipped?.armor];
        required.push(...armorTrainingForItem(armor));
        if (entity?.riding || entity?.npcNeedsRidingSkill) required.push('riding');
        return [...new Set(required)];
    }
    function weaponPriorities(entity) {
        const weaponId = entity?.equipped?.weapon;
        if (!weaponId || !window.items?.[weaponId] || window.items[weaponId].type !== 'weapon') return [];
        const ids = [`${weaponId}_hit`, `${weaponId}_dmg`, `${weaponId}_parry`, `${weaponId}_riposte`];
        return ids.filter(id => !!window.skills?.[id]);
    }
    function shieldPriorities(entity) {
        const offhand = window.items?.[entity?.equipped?.offhand];
        return offhand?.type === 'shield' ? ['shield_proficiency', 'shield_bash', 'shield_other'] : [];
    }
    function isSkillContextuallySuitable(entity, skillId) {
        const skill = window.skills?.[skillId];
        if (!skill) return false;
        const armorTraining = new Set(['light_armor_training', 'medium_armor_training', 'heavy_armor_training']);
        if (armorTraining.has(skillId)) {
            const armor = window.items?.[entity?.equipped?.armor];
            return armorTrainingForItem(armor).includes(skillId);
        }
        if (['shield_proficiency', 'shield_bash', 'shield_other'].includes(skillId)) {
            return window.items?.[entity?.equipped?.offhand]?.type === 'shield';
        }
        if (skillId === 'riding' || skillId === 'riding_druid' || skillId === 'riding_paladin') {
            return !!(entity?.riding || entity?.npcNeedsRidingSkill);
        }
        const weaponMatch = skillId.match(/^(sword|axe|bow|spear|dagger|club)_(?:hit|dmg|parry|parry_cost|parry_chance|riposte|feint)/);
        if (weaponMatch) return entity?.equipped?.weapon === weaponMatch[1];
        const racialTrees = new Set(['dwarf', 'elf', 'goblin', 'orc']);
        if (racialTrees.has(skill.tree)) return skill.tree === hasRacialTree(entity?.race);
        return true;
    }
    function skillRankAllowed(entity, skillId, ignoreSoftCap = false) {
        const skill = window.skills?.[skillId];
        if (!skill || EXCLUDED_SKILLS.has(skillId) || !isSkillContextuallySuitable(entity, skillId)) return false;
        const current = entity.skills?.[skillId] || 0;
        if (skill.maxRanks > 0 && current >= skill.maxRanks) return false;
        if (!ignoreSoftCap && SOFT_CAPS[skillId] != null && current >= SOFT_CAPS[skillId]) return false;
        if (skill.anti_prereq && (entity.skills?.[skill.anti_prereq] || 0) > 0) return false;
        if (skill.prereq && (entity.skills?.[skill.prereq] || 0) <= 0) return false;
        if (typeof skill.prereq_eval === 'function') {
            try { if (!skill.prereq_eval(entity)) return false; } catch (_) { return false; }
        }
        return true;
    }
    function spendPoolForSkill(entity, skillId) {
        const skill = window.skills?.[skillId];
        if (!skill) return null;
        const tree = skill.tree;
        if ((entity.attributes?.[tree] || 0) > 0) return tree;
        if ((entity.attributes?.wildcard || 0) > 0) return 'wildcard';
        if (tree === 'misc') {
            const candidate = Object.keys(entity.attributes || {}).find(k => (entity.attributes[k] || 0) > 0);
            return candidate || null;
        }
        return null;
    }
    function spendOne(entity, skillId, { ignoreSoftCap = false } = {}) {
        if (!skillRankAllowed(entity, skillId, ignoreSoftCap)) return false;
        const pool = spendPoolForSkill(entity, skillId);
        if (!pool) return false;
        entity.attributes[pool] -= 1;
        entity.skills[skillId] = (entity.skills[skillId] || 0) + 1;
        const skill = window.skills[skillId];
        if (typeof skill.apply === 'function') skill.apply(entity);
        return true;
    }
    function spendWithPrereqs(entity, skillId, options = {}, seen = new Set()) {
        if (seen.has(skillId)) return false;
        seen.add(skillId);
        const skill = window.skills?.[skillId];
        if (!skill || EXCLUDED_SKILLS.has(skillId)) return false;
        if (skill.prereq && (entity.skills?.[skill.prereq] || 0) <= 0) {
            spendWithPrereqs(entity, skill.prereq, options, seen);
        }
        return spendOne(entity, skillId, options);
    }
    function applyInnateSkills(entity, race, legacyPreferred = {}) {
        const innate = { ...(RACE_PROFILES[race]?.innateSkills || {}) };
        Object.keys(innate).forEach(id => {
            if ((legacyPreferred[id] || 0) > innate[id]) innate[id] = legacyPreferred[id];
        });
        entity.npcInnateSkills = { ...innate };
        Object.entries(innate).forEach(([skillId, rank]) => {
            for (let i = 0; i < rank; i++) {
                entity.skills[skillId] = (entity.skills[skillId] || 0) + 1;
                const skill = window.skills?.[skillId];
                if (skill?.apply) skill.apply(entity);
            }
        });
    }
    function classMustHaves(classLevels) {
        const classes = new Set(classLevels || []);
        const required = [];
        classes.forEach(cls => {
            if (CLASS_SPELL_MUST_HAVE[cls]) required.push(CLASS_SPELL_MUST_HAVE[cls]);
            if (cls === 'monk') required.push('unarmed_hit');
        });
        return required;
    }
    function annotateSkillMetadata() {
        Object.entries(CLASS_SPELL_MUST_HAVE).forEach(([cls, id]) => {
            const skill = window.skills?.[id];
            if (!skill) return;
            skill.npcMustHaveFor = Array.from(new Set([...(skill.npcMustHaveFor || []), cls]));
        });
        ['light_armor_training', 'medium_armor_training', 'heavy_armor_training'].forEach(id => {
            if (window.skills?.[id]) window.skills[id].npcEquipmentRequirement = 'armor';
        });
    }
    function orderedPriorities(entity, race, classLevels, preferredSkills, archetypeSkills = []) {
        const out = [];
        const add = id => { if (id && window.skills?.[id] && !out.includes(id)) out.push(id); };
        Object.entries(preferredSkills || {})
            .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
            .forEach(([id]) => add(id));
        archetypeSkills.forEach(add);
        weaponPriorities(entity).forEach(add);
        shieldPriorities(entity).forEach(add);
        const classSet = new Set(classLevels || []);
        classSet.forEach(cls => (TREE_PRIORITIES[cls] || []).forEach(add));
        if (classSet.has('wizard')) (TREE_PRIORITIES.arcane || []).forEach(add);
        if (classSet.has('cleric')) (TREE_PRIORITIES.divine || []).forEach(add);
        if (classSet.has('druid')) (TREE_PRIORITIES.nature || []).forEach(add);
        const racialTree = hasRacialTree(race);
        (TREE_PRIORITIES[racialTree] || []).forEach(add);
        ['strength', 'endurance', 'agility', 'weapons'].forEach(tree => (TREE_PRIORITIES[tree] || []).forEach(add));
        return out;
    }
    function spendAllNpcPoints(entity, race, classLevels, preferredSkills = {}, archetypeSkills = [], rng = Math.random) {
        entity.skills = {};
        applyInnateSkills(entity, race, preferredSkills);
        const required = [...equipmentRequirements(entity), ...classMustHaves(classLevels)];
        required.forEach(id => spendWithPrereqs(entity, id, { ignoreSoftCap: true }));
        Object.entries(preferredSkills || {}).forEach(([skillId, wantedRank]) => {
            if (entity.npcInnateSkills?.[skillId]) return;
            const target = Math.max(0, Number(wantedRank) || 0);
            let guard = 0;
            while ((entity.skills[skillId] || 0) < target && guard++ < 20) {
                if (!spendWithPrereqs(entity, skillId, { ignoreSoftCap: true })) break;
            }
        });
        const priorities = orderedPriorities(entity, race, classLevels, preferredSkills, archetypeSkills);
        let progress = true;
        let passes = 0;
        while (progress && totalAttributePoints(entity.attributes) > 0 && passes++ < 60) {
            progress = false;
            for (const skillId of priorities) {
                if (spendWithPrereqs(entity, skillId)) progress = true;
                if (totalAttributePoints(entity.attributes) <= 0) break;
            }
        }
        let safety = 0;
        while (totalAttributePoints(entity.attributes) > 0 && safety++ < 300) {
            let bought = false;
            const pools = Object.entries(entity.attributes)
                .filter(([, points]) => points > 0)
                .map(([tree]) => tree)
                .sort(() => rng() - 0.5);
            for (const tree of pools) {
                const candidates = Object.keys(window.skills || {}).filter(id => {
                    const skill = window.skills[id];
                    if (EXCLUDED_SKILLS.has(id)) return false;
                    if (tree !== 'wildcard' && skill?.tree !== tree) return false;
                    return skillRankAllowed(entity, id);
                });
                if (!candidates.length) continue;
                const id = candidates[Math.floor(rng() * candidates.length)];
                if (spendWithPrereqs(entity, id)) {
                    bought = true;
                    break;
                }
            }
            if (!bought) break;
        }
    }
    function legalizeEquipment(entity) {
        entity.npcEquipmentLegalityWarnings = [];
        const armorId = entity?.equipped?.armor;
        const armor = window.items?.[armorId];
        if (armor && armor.type === 'armor' && armor.subType !== 'barding') {
            const missing = armorTrainingForItem(armor).filter(id => !(entity.skills?.[id] > 0));
            if (missing.length) {
                entity.npcEquipmentLegalityWarnings.push({ itemId: armorId, missing: [...missing] });
                entity.equipped.armor = null;
            }
        }
        if (entity.npcNeedsRidingSkill && !(entity.skills?.riding > 0)) {
            entity.npcEquipmentLegalityWarnings.push({ itemId: 'mount', missing: ['riding'] });
        }
    }
    function resetSkillDerivedStats(entity, baseHp = BASE_HP) {
        entity.hp = baseHp;
        entity.maxHp = baseHp;
        entity.baseDamage = 1;
        entity.baseReduction = 0;
        entity.toHitMelee = 0;
        entity.toHitRanged = 0;
        entity.toHitSpell = 0;
        entity.passiveDodge = 0;
        entity.timePointsPerTick = 1;
        entity.currentMana = 0;
        entity.maxMana = 0;
        entity.visionBonus = entity.npcTemplateVisionBonus || 0;
        entity.unlockedBaseSpells = [];
        entity.unlockedCastingOptions = {};
        entity.manaCaps = { arcane: 10, divine: 10, nature: 10 };
        entity.createdSpells = entity.npcFixedSpells ? entity.npcFixedSpells.map(s => ({ ...s })) : [];
        ['canDeflectArrows', 'lifeDrainOnMeleeHit', 'witheringTouchStacks', 'commandsUndead', 'hasSoulAnchor', 'toHitVsAnimal', 'canRunesmith', 'canLeatherwork']
            .forEach(key => { if (key in entity) delete entity[key]; });
    }
    function rebuildProgression(entity, { race, classLevels, preferredSkills = {}, archetypeSkills = [], seed = '', baseHp = BASE_HP } = {}) {
        const hpRatio = entity.maxHp > 0 ? Math.max(0, entity.hp / entity.maxHp) : 1;
        resetSkillDerivedStats(entity, baseHp);
        entity.race = race;
        entity.classLevels = [...classLevels];
        entity.level = classLevels.length || 1;
        entity.class = classLevels[0] || 'fighter';
        entity.classLevelCounts = classCounts(classLevels);
        entity.attributes = buildAttributes(race, classLevels);
        entity.npcSkillPointBudget = totalAttributePoints(entity.attributes);
        entity.npcPreferredSkills = { ...preferredSkills };
        const rng = seededRandom(seed || `${entity.name}:${race}:${entity.level}`);
        spendAllNpcPoints(entity, race, classLevels, preferredSkills, archetypeSkills, rng);
        legalizeEquipment(entity);
        entity.npcUnspentSkillPoints = totalAttributePoints(entity.attributes);
        entity.hp = Math.max(1, Math.min(entity.maxHp, Math.round(entity.maxHp * (Number.isFinite(hpRatio) ? hpRatio : 1))));
        if (hpRatio >= 0.999) entity.hp = entity.maxHp;
        if (window.autoBuildSpellsForEntity && (!entity.createdSpells || entity.createdSpells.length === 0)) {
            window.autoBuildSpellsForEntity(entity);
        }
        return entity;
    }
    function equipmentCanBeSupported(race, packageDef, level, equipmentIds) {
        const attrs = buildAttributes(race, expandClassPackage(packageDef, level));
        let strengthNeeded = 0;
        (equipmentIds || []).forEach(itemId => {
            const item = window.items?.[itemId];
            strengthNeeded = Math.max(strengthNeeded, armorTrainingForItem(item).length);
        });
        return (attrs.strength || 0) + (attrs.wildcard || 0) >= strengthNeeded;
    }
    function minimumLevelForEquipment(race, packageDef, equipmentIds) {
        for (let level = 1; level <= MAX_INFERRED_LEVEL; level++) {
            if (equipmentCanBeSupported(race, packageDef, level, equipmentIds)) return level;
        }
        return null;
    }
    function selectPackage({ race, preferredSkills = {}, equipmentIds = [], levelHint = 1, seed = '' }) {
        const inferred = inferPackageFromPreferredSkills(preferredSkills);
        if (inferred) {
            const legalAt = minimumLevelForEquipment(race, inferred, equipmentIds);
            if (legalAt != null) return { ...inferred, minimumEquipmentLevel: legalAt };
            if (inferred.primary !== 'fighter') {
                const augmented = {
                    id: `${inferred.primary}/fighter`,
                    classes: [inferred.primary, 'fighter'],
                    primary: inferred.primary,
                };
                const augmentedLegalAt = minimumLevelForEquipment(race, augmented, equipmentIds);
                if (augmentedLegalAt != null) return { ...augmented, minimumEquipmentLevel: augmentedLegalAt };
            }
        }
        const rng = seededRandom(seed);
        for (let i = 0; i < 10; i++) {
            const pick = pickWeightedPackage(race, rng);
            if (equipmentCanBeSupported(race, pick, levelHint, equipmentIds)) return pick;
        }
        return pickWeightedPackage(race, rng);
    }
    function legacyMonsterPointTarget(template, preferredSkills) {
        const skills = preferredSkills && Object.keys(preferredSkills).length ? preferredSkills : (template.skills || {});
        const hpEquivalent = Math.max(0, ((Number(template.hp) || BASE_HP) - BASE_HP) / 10);
        return Math.max(1, sumRanks(skills) + hpEquivalent);
    }
    function chooseArchetype(equipmentMode) {
        const pool = equipmentMode === 'savage' ? window.SAVAGE_ARCHETYPES : window.COMBAT_ARCHETYPES;
        if (!Array.isArray(pool) || !pool.length) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    function equipMonsterLoadout(monster, equipmentSpec) {
        let archetype = null;
        if (equipmentSpec === 'random' || equipmentSpec === 'savage') {
            archetype = chooseArchetype(equipmentSpec);
            if (archetype) {
                window.equipToMonster(monster, archetype.weapon);
                if (archetype.offhand) window.equipToMonster(monster, archetype.offhand, !!archetype.offhandIsWeapon);
                if (archetype.helmet) window.equipToMonster(monster, archetype.helmet);
            }
        } else if (Array.isArray(equipmentSpec)) {
            equipmentSpec.forEach(itemId => window.equipToMonster(monster, itemId));
        }
        return archetype;
    }
    function createPcStyleHumanoidMonster(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
        const template = window.monsterTemplates[type];
        const race = MONSTER_RACE[type];
        if (!template || !race) return null;
        const monster = new window.Enemy(template.name, template.color, hex, 3, BASE_HP, template.expValue);
        monster.side = side;
        monster.canLoot = template.canLoot !== undefined ? template.canLoot : true;
        monster.riderSize = template.riderSize || 0;
        monster.mountSize = template.mountSize || 0;
        monster.tags = Array.from(new Set([...(template.tags || []), 'humanoid']));
        monster.voice = template.voice || null;
        monster.npcTemplateVisionBonus = template.visionBonus || 0;
        monster.visionBonus = monster.npcTemplateVisionBonus;
        monster.behaviorType = template.behaviorType || 'wander';
        monster.isFlying = !!template.isFlying;
        monster.dragonSizeTier = template.dragonSizeTier || 0;
        monster.isSkirmisher = !!template.isSkirmisher;
        monster.extraHexes = (template.extraHexes || []).map(x => ({ ...x }));
        monster.npcFixedSpells = (template.createdSpells || []).map(s => ({ ...s }));
        monster.createdSpells = monster.npcFixedSpells.map(s => ({ ...s }));
        monster.race = race;
        monster.gender = template.gender || 'male';
        monster.npcMonsterType = type;
        if (type === 'harpy') monster.hasUsedSong = false;
        if (type === 'revenant') monster.revenantRevived = false;
        if (CUSTOM_IMAGE_TYPES.has(type)) monster.customImage = type;
        const equipmentSpec = customEquipment || template.defaultEquipment;
        const archetype = equipMonsterLoadout(monster, equipmentSpec);
        const equipmentIds = [...(monster.inventory || [])];
        const preferredSkills = { ...(customSkills || template.skills || {}) };
        const seedBase = `${window.currentCampaign || 'game'}:${type}:${hex?.q ?? 0},${hex?.r ?? 0}:${Object.keys(preferredSkills).sort().join(',')}`;
        let packageDef = selectPackage({ race, preferredSkills, equipmentIds, levelHint: 1, seed: `${seedBase}:package` });
        const legacyTarget = legacyMonsterPointTarget(template, preferredSkills);
        let level = inferLevel(race, packageDef, legacyTarget, packageDef.minimumEquipmentLevel || 1);
        if (!equipmentCanBeSupported(race, packageDef, level, equipmentIds)) {
            packageDef = selectPackage({ race, preferredSkills, equipmentIds, levelHint: level, seed: `${seedBase}:gear-package` });
            level = inferLevel(race, packageDef, legacyTarget, packageDef.minimumEquipmentLevel || 1);
        }
        const classLevels = expandClassPackage(packageDef, level);
        monster.npcClassPackage = { id: packageDef.id, classes: [...packageDef.classes], primary: packageDef.primary };
        monster.npcLegacySkillPointTarget = legacyTarget;
        monster.npcNeedsRidingSkill = !!template.isRider;
        rebuildProgression(monster, {
            race,
            classLevels,
            preferredSkills,
            archetypeSkills: archetype?.skills || [],
            seed: `${seedBase}:skills`,
            baseHp: BASE_HP,
        });
        if (template.isRider && template.mountType) {
            const mount = window.createMonster(template.mountType, hex, null, null, side);
            monster.riding = mount;
            mount.rider = monster;
            monster.npcNeedsRidingSkill = true;
            if (!(monster.skills?.riding > 0)) {
                rebuildProgression(monster, {
                    race, classLevels, preferredSkills,
                    archetypeSkills: archetype?.skills || [], seed: `${seedBase}:skills`, baseHp: BASE_HP,
                });
            }
            if (window.entities) window.entities.push(mount);
        }
        monster.gold = Math.floor(Math.random() * 5) + 5;
        return monster;
    }
    function wrapCreateMonster() {
        if (typeof window.createMonster !== 'function' || window.createMonster.__pcStyleNpcProgression) return;
        const original = window.createMonster;
        const wrapped = function(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
            if (MONSTER_RACE[type]) {
                const built = createPcStyleHumanoidMonster(type, hex, customSkills, customEquipment, side);
                if (built) return built;
            }
            return original(type, hex, customSkills, customEquipment, side);
        };
        wrapped.__pcStyleNpcProgression = true;
        wrapped.__original = original;
        window.createMonster = wrapped;
    }
    function wrapBuildNPC() {
        if (typeof window.buildNPC !== 'function' || window.buildNPC.__pcStyleNpcProgression) return;
        const original = window.buildNPC;
        const wrapped = function(spec = {}) {
            const race = spec.race || 'human';
            if (!window.raceData[race]) return original(spec);
            const preferredSkills = { ...(spec.preferredSkills || spec.skillPicks || {}) };
            const preferredMap = {};
            if (Array.isArray(spec.skillPicks)) {
                spec.skillPicks.forEach(id => { preferredMap[id] = (preferredMap[id] || 0) + 1; });
            } else {
                Object.assign(preferredMap, preferredSkills);
            }
            const equipmentIds = Array.isArray(spec.equipment) ? spec.equipment : [];
            const seedBase = `${window.currentCampaign || 'game'}:${spec.name || spec.title || 'NPC'}:${race}:${spec.hex?.q ?? 0},${spec.hex?.r ?? 0}`;
            let classLevels;
            let packageDef;
            if (Array.isArray(spec.classLevels) && spec.classLevels.length) {
                classLevels = [...spec.classLevels];
                const unique = [];
                classLevels.forEach(cls => { if (!unique.includes(cls)) unique.push(cls); });
                packageDef = { id: unique.join('/'), classes: unique, primary: classLevels[0] };
            } else {
                packageDef = selectPackage({ race, preferredSkills: preferredMap, equipmentIds, levelHint: Math.max(1, spec.level || 1), seed: `${seedBase}:package` });
                const legacyTarget = Math.max(1, sumRanks(preferredMap));
                const level = spec.level || inferLevel(race, packageDef, legacyTarget, packageDef.minimumEquipmentLevel || 1);
                classLevels = expandClassPackage(packageDef, level);
            }
            const ent = original({ ...spec, classLevels, skillPicks: [] });
            ent.npcClassPackage = { id: packageDef.id, classes: [...packageDef.classes], primary: packageDef.primary };
            ent.npcLegacySkillPointTarget = totalAttributePoints(buildAttributes(race, classLevels));
            rebuildProgression(ent, {
                race,
                classLevels,
                preferredSkills: preferredMap,
                seed: `${seedBase}:skills`,
                baseHp: BASE_HP,
            });
            return ent;
        };
        wrapped.__pcStyleNpcProgression = true;
        wrapped.__original = original;
        window.buildNPC = wrapped;
    }
    function wrapClassLevelScaling() {
        if (typeof window.applyClassLevelScaling !== 'function' || window.applyClassLevelScaling.__pcStyleNpcProgression) return;
        const original = window.applyClassLevelScaling;
        const wrapped = function(monster, bonusLevels) {
            if (!monster?.npcClassPackage || !Array.isArray(monster.classLevels)) return original(monster, bonusLevels);
            const extra = Math.max(0, Math.floor(bonusLevels || 0));
            if (!extra) return;
            const newTotal = monster.classLevels.length + extra;
            const newLevels = expandClassPackage(monster.npcClassPackage, newTotal);
            const oldExp = monster.expValue || 0;
            rebuildProgression(monster, {
                race: monster.race,
                classLevels: newLevels,
                preferredSkills: monster.npcPreferredSkills || {},
                seed: `${monster.npcMonsterType || monster.name}:${monster.hex?.q ?? 0},${monster.hex?.r ?? 0}:scaled:${newTotal}`,
                baseHp: BASE_HP,
            });
            monster.classLevelsGranted = (monster.classLevelsGranted || 0) + extra;
            monster.expValue = Math.round(oldExp * (1 + extra * 0.25));
        };
        wrapped.__pcStyleNpcProgression = true;
        wrapped.__original = original;
        window.applyClassLevelScaling = wrapped;
    }
    function describeBuild(entity) {
        if (!entity) return null;
        return {
            name: entity.name,
            race: entity.race,
            level: entity.level,
            classPackage: entity.npcClassPackage?.id || null,
            classLevels: [...(entity.classLevels || [])],
            classCounts: classCounts(entity.classLevels || []),
            skills: { ...(entity.skills || {}) },
            unspent: { ...(entity.attributes || {}) },
            unspentTotal: totalAttributePoints(entity.attributes || {}),
            equipmentWarnings: [...(entity.npcEquipmentLegalityWarnings || [])],
            legacySkillPointTarget: entity.npcLegacySkillPointTarget ?? null,
            generatedSkillPointBudget: entity.npcSkillPointBudget ?? null,
        };
    }
    function initialise() {
        annotateSkillMetadata();
        wrapCreateMonster();
        wrapBuildNPC();
        wrapClassLevelScaling();
    }
    window.NPCProgression = {
        RACE_PROFILES,
        MONSTER_RACE,
        pickWeightedPackage,
        expandClassPackage,
        buildAttributes,
        inferLevel,
        inferPackageFromPreferredSkills,
        rebuildProgression,
        describeBuild,
        armorTrainingForItem,
        totalAttributePoints,
        initialise,
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
