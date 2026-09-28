// Policy layer for npcProgression.js: keep population package rolls genuinely
// discrete, and recalculate old hand-authored NPC levels from their old spent
// skill ranks instead of preserving inflated legacy class counts.
(() => {
    'use strict';
    const MAX_LEVEL = 8;

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

    function countSkillPicks(picks) {
        if (Array.isArray(picks)) return picks.length;
        return Object.values(picks || {}).reduce((sum, rank) => sum + (Number(rank) || 0), 0);
    }

    function classPackageFromLevels(levels) {
        const classes = [];
        (levels || []).forEach(cls => { if (cls && !classes.includes(cls)) classes.push(cls); });
        if (!classes.length) classes.push('fighter');
        return { id: classes.join('/'), classes, primary: classes[0] };
    }

    function armorStrengthRequirement(equipmentIds) {
        let need = 0;
        (equipmentIds || []).forEach(itemId => {
            const item = window.items?.[itemId];
            const req = window.NPCProgression?.armorTrainingForItem?.(item)?.length || 0;
            need = Math.max(need, req);
        });
        return need;
    }

    function minimumEquipmentLevel(race, packageDef, equipmentIds) {
        const need = armorStrengthRequirement(equipmentIds);
        if (!need) return 1;
        for (let level = 1; level <= MAX_LEVEL; level++) {
            const levels = window.NPCProgression.expandClassPackage(packageDef, level);
            const attrs = window.NPCProgression.buildAttributes(race, levels);
            if ((attrs.strength || 0) + (attrs.wildcard || 0) >= need) return level;
        }
        return null;
    }

    function makeEquipmentLegalPackage(race, packageDef, equipmentIds) {
        let minLevel = minimumEquipmentLevel(race, packageDef, equipmentIds);
        if (minLevel != null) return { ...packageDef, minimumEquipmentLevel: minLevel };

        // Preserve the authored priority class but add Fighter when the build's
        // supplied armour can never be trained legally otherwise. This is a
        // class choice, not a free proficiency: the NPC still has to reach the
        // Fighter level and spend the Strength points on Light -> Medium -> Heavy.
        if (!packageDef.classes.includes('fighter')) {
            const classes = [...packageDef.classes, 'fighter'];
            const augmented = { id: classes.join('/'), classes, primary: packageDef.primary };
            minLevel = minimumEquipmentLevel(race, augmented, equipmentIds);
            if (minLevel != null) return { ...augmented, minimumEquipmentLevel: minLevel };
        }
        return { ...packageDef, minimumEquipmentLevel: 1 };
    }

    function choosePopulationPackage(race, equipmentIds, seed) {
        const progression = window.NPCProgression;
        const rows = progression?.RACE_PROFILES?.[race]?.packages || [['fighter', 1]];
        const eligible = [];
        rows.forEach(([id, weight]) => {
            const classes = String(id).split('/').filter(Boolean);
            const packageDef = { id, classes, primary: classes[0] || 'fighter' };
            const minLevel = minimumEquipmentLevel(race, packageDef, equipmentIds);
            if (minLevel != null) eligible.push({ packageDef: { ...packageDef, minimumEquipmentLevel: minLevel }, weight: Number(weight || 0) });
        });
        const pool = eligible.length ? eligible : rows.map(([id, weight]) => {
            const classes = String(id).split('/').filter(Boolean);
            return { packageDef: makeEquipmentLegalPackage(race, { id, classes, primary: classes[0] || 'fighter' }, equipmentIds), weight: Number(weight || 0) };
        });
        const rng = seededRandom(seed);
        const total = pool.reduce((sum, row) => sum + row.weight, 0) || 1;
        let roll = rng() * total;
        for (const row of pool) {
            roll -= row.weight;
            if (roll <= 0) return row.packageDef;
        }
        return pool[pool.length - 1].packageDef;
    }

    function preferredMapFromSpec(spec) {
        const map = {};
        if (Array.isArray(spec?.skillPicks)) {
            spec.skillPicks.forEach(id => { map[id] = (map[id] || 0) + 1; });
        } else if (spec?.preferredSkills && typeof spec.preferredSkills === 'object') {
            Object.assign(map, spec.preferredSkills);
        } else if (spec?.skillPicks && typeof spec.skillPicks === 'object') {
            Object.assign(map, spec.skillPicks);
        }
        return map;
    }

    function rebuild(entity, packageDef, level, preferredSkills, seed) {
        const classLevels = window.NPCProgression.expandClassPackage(packageDef, level);
        entity.npcClassPackage = { id: packageDef.id, classes: [...packageDef.classes], primary: packageDef.primary };
        window.NPCProgression.rebuildProgression(entity, {
            race: entity.race,
            classLevels,
            preferredSkills: preferredSkills || entity.npcPreferredSkills || {},
            seed,
            baseHp: 10,
        });
        return entity;
    }

    function wrapGenericMonsterPopulationRolls() {
        if (typeof window.createMonster !== 'function' || window.createMonster.__npcPopulationPolicy) return;
        const previous = window.createMonster;
        const wrapped = function(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
            const entity = previous(type, hex, customSkills, customEquipment, side);
            if (!entity?.npcClassPackage || customSkills) return entity;

            const equipmentIds = Object.values(entity.equipped || {}).filter(Boolean);
            const seed = `${window.currentCampaign || 'game'}:${type}:${hex?.q ?? 0},${hex?.r ?? 0}:population-package`;
            const packageDef = choosePopulationPackage(entity.race, equipmentIds, seed);
            const minimum = packageDef.minimumEquipmentLevel || 1;
            const target = Math.max(1, Number(entity.npcLegacySkillPointTarget) || 1);
            const level = window.NPCProgression.inferLevel(entity.race, packageDef, target, minimum);
            rebuild(entity, packageDef, level, entity.npcPreferredSkills || {}, `${seed}:skills`);
            return entity;
        };
        wrapped.__npcPopulationPolicy = true;
        wrapped.__previous = previous;
        window.createMonster = wrapped;
    }

    function wrapLegacyNamedNpcLevels() {
        if (typeof window.buildNPC !== 'function' || window.buildNPC.__npcLegacyLevelPolicy) return;
        const previous = window.buildNPC;
        const wrapped = function(spec = {}) {
            const entity = previous(spec);
            if (!entity?.npcClassPackage || !Array.isArray(spec.classLevels) || spec.classLevels.length === 0) return entity;

            let packageDef = classPackageFromLevels(spec.classLevels);
            const equipmentIds = Array.isArray(spec.equipment) ? spec.equipment : [];
            packageDef = makeEquipmentLegalPackage(entity.race, packageDef, equipmentIds);
            const preferredSkills = preferredMapFromSpec(spec);
            const target = Math.max(1, countSkillPicks(preferredSkills));
            const gearMinimum = packageDef.minimumEquipmentLevel || 1;
            // A multiclass package must reach at least one level in every class;
            // after that the package cycles from its priority class, so a
            // Fighter/Cleric 3 becomes Fighter 2 / Cleric 1.
            const minimum = Math.max(packageDef.classes.length, gearMinimum);
            const level = spec.level || window.NPCProgression.inferLevel(entity.race, packageDef, target, minimum);

            entity.npcLegacySkillPointTarget = target;
            if (entity.level !== level || entity.npcClassPackage.id !== packageDef.id) {
                rebuild(entity, packageDef, level, preferredSkills,
                    `${window.currentCampaign || 'game'}:${spec.name || spec.title || 'NPC'}:${entity.race}:legacy-conversion`);
            } else {
                entity.npcClassPackage = packageDef;
            }
            return entity;
        };
        wrapped.__npcLegacyLevelPolicy = true;
        wrapped.__previous = previous;
        window.buildNPC = wrapped;
    }

    function initialise() {
        if (!window.NPCProgression) return;
        wrapGenericMonsterPopulationRolls();
        wrapLegacyNamedNpcLevels();
    }

    window.NPCProgressionPolicy = {
        choosePopulationPackage,
        minimumEquipmentLevel,
        makeEquipmentLegalPackage,
        classPackageFromLevels,
        initialise,
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
