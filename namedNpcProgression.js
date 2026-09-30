// namedNpcProgression.js
// Explicit progression for named humanoids whose identity used to live in a
// renamed monster template + ad-hoc skills dictionary. Generic humanoids still
// use NPCProgression's weighted population packages; these named characters do
// not reroll their class identity between spawns.
(() => {
    'use strict';

    const META_KEY = '__authoredNamedNpcProgression';

    const ARENA_BUILDS = {
        'Grishnak': {
            race: 'orc', gender: 'male', classLevels: ['wizard'], baseType: 'orc',
            skillPicks: [
                'learn_firebolt', 'learn_counterspell',
                'arcane_mana', 'arcane_mana', 'arcane_regen', 'firebolt_hit',
                'health', 'health'
            ]
        },
        'Sir Alistair': {
            race: 'human', gender: 'male', classLevels: ['fighter', 'fighter', 'cleric'],
            skillPicks: [
                'health', 'health', 'sword_hit', 'sword_dmg',
                'heavy_armor_training', 'shield_proficiency', 'shield_bash',
                'learn_heal', 'divine_mana', 'divine_mana'
            ]
        },
        'Viper': {
            race: 'goblin', gender: 'male', classLevels: ['rogue', 'fighter'], baseType: 'elite_goblin',
            skillPicks: [
                'stealth_rogue', 'stealth_rogue', 'stealth_agility',
                'sneak_attack_dmg', 'sneak_attack_dmg', 'sneak_attack_dmg',
                'speedy_stealth', 'dagger_hit', 'dagger_dmg', 'health'
            ]
        },
        'Krog the Unstoppable': {
            race: 'troll', gender: 'male', classLevels: ['fighter'], baseType: 'troll',
            skillPicks: [
                'health', 'health', 'health', 'health', 'health',
                'meleeDamage', 'meleeDamage', 'meleeDamage',
                'shove', 'club_hit', 'regeneration'
            ]
        },
        'Sylvara the Huntress': {
            race: 'goblin', gender: 'female', classLevels: ['druid'], baseType: 'goblin',
            // elf_bow_range was an old illegal cross-race grant. Preserve the
            // huntress identity through real bow/riding/nature picks instead.
            skillPicks: [
                'learn_summon_animal', 'learn_tiger_summon',
                'nature_mana', 'nature_mana', 'bow_hit', 'riding_druid',
                'health', 'health'
            ]
        }
    };

    const CAMPAIGN_MONSTER_BUILDS = [
        {
            globalKey: 'campaign2GoblinChief',
            build: {
                race: 'goblin', classLevels: ['fighter'],
                skillPicks: [
                    'health', 'health', 'health',
                    'axe_hit', 'axe_hit', 'axe_dmg',
                    // Chief Skarnub was stealth-trained, but Rogue-tree ranks
                    // would require a second class level and roughly double his
                    // point budget. Agility stealth keeps that identity legally.
                    'stealth_agility', 'stealth_agility'
                ]
            }
        },
        {
            globalKey: 'campaign2GoblinLieutenant',
            build: {
                race: 'goblin', classLevels: ['rogue', 'fighter'],
                skillPicks: [
                    'health', 'dagger_hit', 'dagger_hit',
                    'stealth_rogue', 'stealth_rogue', 'stealth_agility'
                ]
            }
        },
        {
            globalKey: 'campaign2GoblinShaman',
            build: {
                race: 'goblin', classLevels: ['cleric'],
                skillPicks: ['health', 'health', 'learn_heal', 'divine_mana', 'club_hit']
            }
        },
        {
            globalKey: 'campaign2OrcWarlord',
            build: {
                race: 'orc', classLevels: ['fighter'],
                skillPicks: [
                    'health', 'health', 'health', 'health',
                    'meleeDamage', 'meleeDamage', 'meleeDamage',
                    'axe_hit', 'axe_hit', 'axe_dmg', 'axe_dmg'
                ]
            }
        }
    ];

    function toPreferredMap(picks) {
        const map = {};
        if (Array.isArray(picks)) {
            picks.forEach(id => { map[id] = (map[id] || 0) + 1; });
        } else if (picks && typeof picks === 'object') {
            Object.entries(picks).forEach(([id, rank]) => { map[id] = Number(rank) || 0; });
        }
        return map;
    }

    function sumRanks(map) {
        return Object.values(map || {}).reduce((sum, rank) => sum + (Number(rank) || 0), 0);
    }

    function packageFromLevels(classLevels) {
        const classes = [];
        (classLevels || []).forEach(cls => { if (cls && !classes.includes(cls)) classes.push(cls); });
        if (!classes.length) classes.push('fighter');
        return { id: classes.join('/'), classes, primary: classLevels?.[0] || classes[0] };
    }

    function restoreEquipment(entity, equipmentIds) {
        entity.inventory = entity.inventory || [];
        entity.equipped = entity.equipped || { weapon: null, offhand: null, armor: null, helmet: null };
        (equipmentIds || []).forEach(itemId => {
            const item = window.items?.[itemId];
            if (!item) return;
            if (!entity.inventory.includes(itemId)) entity.inventory.push(itemId);
            if (item.type === 'armor' && item.subType !== 'barding') entity.equipped.armor = itemId;
            else if (item.type === 'helmet') entity.equipped.helmet = itemId;
            else if (item.type === 'shield') entity.equipped.offhand = itemId;
            else if (item.type === 'weapon') {
                if (!entity.equipped.weapon || entity.equipped.weapon === itemId) entity.equipped.weapon = itemId;
                else if (item.canOffhand && !entity.equipped.offhand) entity.equipped.offhand = itemId;
            }
        });
    }

    function preserveTemplateIdentity(entity, baseType) {
        if (!baseType) return;
        const template = window.monsterTemplates?.[baseType];
        if (!template) return;
        entity.riderSize = template.riderSize || entity.riderSize || 0;
        entity.mountSize = template.mountSize || entity.mountSize || 0;
        if (template.extraHexes) entity.extraHexes = template.extraHexes.map(h => ({ ...h }));
        entity.tags = Array.from(new Set([...(entity.tags || []), ...(template.tags || []), 'humanoid']));
        if (template.voice) entity.voice = template.voice;
        if (template.isFlying) entity.isFlying = true;
        if (template.behaviorType) entity.behaviorType = template.behaviorType;
        entity.npcMonsterType = baseType;
    }

    function applyAuthoredBuild(entity, build, equipmentIds, seed) {
        if (!entity || !build || !window.NPCProgression) return entity;
        const preferredSkills = toPreferredMap(build.skillPicks);
        const classLevels = [...build.classLevels];
        restoreEquipment(entity, equipmentIds || []);
        preserveTemplateIdentity(entity, build.baseType);
        entity.npcClassPackage = packageFromLevels(classLevels);
        entity.npcLegacySkillPointTarget = sumRanks(preferredSkills);
        window.NPCProgression.rebuildProgression(entity, {
            race: build.race,
            classLevels,
            preferredSkills,
            seed,
            baseHp: 10,
        });
        entity.npcAuthoredProgression = true;
        return entity;
    }

    function configureArenaBosses() {
        if (typeof arenaBosses === 'undefined') return;
        Object.entries(ARENA_BUILDS).forEach(([name, build]) => {
            const config = arenaBosses[name];
            if (!config) return;
            config.race = build.race;
            config.gender = config.gender || build.gender || 'male';
            config.classLevels = [...build.classLevels];
            config.skillPicks = [...build.skillPicks];
            if (config.expValue == null && config.base && window.monsterTemplates?.[config.base]) {
                config.expValue = window.monsterTemplates[config.base].expValue || 0;
            }
        });
    }

    function configureCampaignNamedMonsters() {
        CAMPAIGN_MONSTER_BUILDS.forEach(({ globalKey, build }) => {
            const spec = window[globalKey];
            if (!spec || !spec.customSkills) return;
            spec.race = build.race;
            spec.classLevels = [...build.classLevels];
            spec.skillPicks = [...build.skillPicks];
            spec.equipment = [...(spec.customEquipment || [])];
            spec.authoredProgression = true;
            Object.defineProperty(spec.customSkills, META_KEY, {
                value: { ...build, sourceKey: globalKey },
                configurable: true,
                enumerable: false,
                writable: false,
            });
        });
    }

    function wrapCreateMonster() {
        if (typeof window.createMonster !== 'function' || window.createMonster.__namedNpcProgression) return;
        const previous = window.createMonster;
        const wrapped = function(type, hex, customSkills = null, customEquipment = null, side = 'enemy') {
            const entity = previous(type, hex, customSkills, customEquipment, side);
            const build = customSkills?.[META_KEY];
            if (!build) return entity;
            return applyAuthoredBuild(
                entity,
                { ...build, baseType: build.baseType || type },
                Array.isArray(customEquipment) ? customEquipment : [],
                `${window.currentCampaign || 'game'}:${build.sourceKey || type}:${hex?.q ?? 0},${hex?.r ?? 0}:authored`
            );
        };
        wrapped.__namedNpcProgression = true;
        wrapped.__previous = previous;
        window.createMonster = wrapped;
    }

    function wrapBuildNPC() {
        if (typeof window.buildNPC !== 'function' || window.buildNPC.__namedNpcProgression) return;
        const previous = window.buildNPC;
        const wrapped = function(spec = {}) {
            const entity = previous(spec);
            const build = ARENA_BUILDS[spec.name];
            if (!build) return entity;
            return applyAuthoredBuild(
                entity,
                build,
                Array.isArray(spec.equipment) ? spec.equipment : [],
                `${window.currentCampaign || 'game'}:${spec.name}:authored`
            );
        };
        wrapped.__namedNpcProgression = true;
        wrapped.__previous = previous;
        window.buildNPC = wrapped;
    }

    function initialise() {
        if (!window.NPCProgression) return;
        configureArenaBosses();
        configureCampaignNamedMonsters();
        wrapCreateMonster();
        wrapBuildNPC();
    }

    window.AUTHORED_NAMED_NPC_BUILDS = {
        arena: ARENA_BUILDS,
        campaignMonsterKeys: CAMPAIGN_MONSTER_BUILDS.map(row => row.globalKey),
    };
    window.applyAuthoredNamedNpcBuild = applyAuthoredBuild;
    window.initialiseNamedNpcProgression = initialise;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
