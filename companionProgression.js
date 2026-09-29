// companionProgression.js
// One canonical authored build per recruitable humanoid. The same race,
// ordered class history, equipment and skill preferences are used while the
// character is an NPC and after recruitment, so joining the party no longer
// quietly turns them into a different mechanical character.
(() => {
    'use strict';

    const BUILDS = {
        'Ser Aldric Thorne': {
            race: 'human', gender: 'male', classLevels: ['fighter', 'cleric'],
            skillPicks: ['health', 'sword_hit', 'sword_dmg', 'sword_parry', 'learn_heal'],
            equipment: ['sword', 'wooden_shield'],
            dialogueId: 'companion_ser_aldric',
        },
        'Nix Sharpear': {
            race: 'goblin', gender: 'male', classLevels: ['rogue', 'fighter'],
            skillPicks: ['health', 'dagger_hit', 'dagger_hit', 'dagger_dmg', 'stealth_rogue', 'stealth_rogue', 'stealth_agility'],
            equipment: ['dagger', 'light_armor'],
            extraInventory: ['bow', 'torch'],
            factionId: 'goblin_tribe', dialogueId: 'companion_nix_sharpear',
        },
        'Warlord Grukk Ironhide': {
            race: 'orc', gender: 'male', classLevels: ['fighter'],
            skillPicks: ['health', 'health', 'health', 'health', 'meleeDamage', 'meleeDamage', 'meleeDamage', 'axe_hit', 'axe_hit', 'axe_dmg', 'axe_dmg'],
            equipment: ['axe', 'heavy_armor', 'wooden_shield'],
            factionId: 'orc_raiders', dialogueId: 'companion_orc_warlord',
        },
        'Reyna Fletcher': {
            race: 'human', gender: 'female', classLevels: ['fighter'],
            skillPicks: ['health', 'bow_hit', 'bow_dmg', 'fastMovement'],
            equipment: ['bow'], extraInventory: ['sword'],
        },
        'Mirabel Quill': {
            race: 'elf', gender: 'female', classLevels: ['wizard'],
            skillPicks: ['health', 'learn_firebolt', 'arcane_mana', 'firebolt_hit', 'firebolt_dmg'],
            equipment: ['dagger'],
        },
        'Fenn Oakheart': {
            race: 'human', gender: 'male', classLevels: ['druid'],
            skillPicks: ['health', 'learn_summon_animal', 'barkskin_active', 'wild_shape_adaptation'],
            equipment: ['club'],
        },
        'Brother Alden': {
            race: 'human', gender: 'male', classLevels: ['monk'],
            skillPicks: ['unarmed_hit', 'unarmed_dmg', 'swift_step', 'trip_reaction'],
            equipment: [], dialogueId: 'brother_alden',
        },
        'Snik Fangtooth': {
            race: 'goblin', gender: 'male', classLevels: ['rogue'],
            skillPicks: ['dagger_hit', 'dagger_dmg', 'stealth_rogue', 'quickRecovery', 'initiativeBonus'],
            equipment: ['dagger'], extraInventory: ['bow', 'torch'], customImage: 'goblin',
        },
    };

    const CAMPAIGN_SPEC_KEYS = {
        'Ser Aldric Thorne': 'campaign2Paladin',
        'Nix Sharpear': 'campaign2GoblinLieutenant',
        'Warlord Grukk Ironhide': 'campaign2OrcWarlord',
        'Reyna Fletcher': 'campaign2ArcherCompanion',
        'Mirabel Quill': 'campaign2WizardCompanion',
        'Fenn Oakheart': 'campaign2DruidCompanion',
    };

    function preferredMap(picks) {
        const out = {};
        (picks || []).forEach(id => { out[id] = (out[id] || 0) + 1; });
        return out;
    }

    function counts(levels) {
        const out = {};
        (levels || []).forEach(cls => { out[cls] = (out[cls] || 0) + 1; });
        return out;
    }

    function packageFromLevels(levels) {
        const classes = [];
        (levels || []).forEach(cls => { if (cls && !classes.includes(cls)) classes.push(cls); });
        return { id: classes.join('/'), classes, primary: levels?.[0] || classes[0] || null };
    }

    function classSequenceFor(build, levelOverride) {
        const base = [...(build.classLevels || [])];
        if (!levelOverride || levelOverride === base.length) return base;
        const packageDef = packageFromLevels(base);
        if (!packageDef.classes.length) return [];
        return window.NPCProgression.expandClassPackage(packageDef, Math.max(1, Math.floor(levelOverride)));
    }

    function equipLoadout(target, build) {
        const clothing = {
            shirt: target.equipped?.shirt || null,
            pants: target.equipped?.pants || null,
            bra: target.equipped?.bra || null,
            underwear: target.equipped?.underwear || null,
        };
        target.inventory = [];
        target.equipped = {
            weapon: null, offhand: null, armor: null, helmet: null,
            ...clothing,
        };
        (build.equipment || []).forEach(itemId => window.equipToMonster(target, itemId));
        (build.extraInventory || []).forEach(itemId => {
            if (window.items?.[itemId] && !target.inventory.includes(itemId)) target.inventory.push(itemId);
        });
    }

    function copyIdentity(target, build) {
        target.race = build.race;
        target.gender = build.gender;
        if (build.factionId) target.factionId = build.factionId;
        if (build.dialogueId) target.dialogueId = build.dialogueId;
        if (build.customImage) target.customImage = build.customImage;
        target.npcProgressionMode = window.NPC_PROGRESSION_MODES?.AUTHORED || 'authored';
        target.npcAuthoredProgression = true;
    }

    function applyEntityBuild(entity, name, { levelOverride = null } = {}) {
        const build = BUILDS[name];
        if (!entity || !build || !window.NPCProgression) return entity;
        const sequence = classSequenceFor(build, levelOverride);
        equipLoadout(entity, build);
        entity.npcClassPackage = packageFromLevels(sequence);
        copyIdentity(entity, build);
        window.NPCProgression.rebuildProgression(entity, {
            race: build.race,
            classLevels: sequence,
            preferredSkills: preferredMap(build.skillPicks),
            seed: `canonical-companion:${name}:${sequence.join(',')}`,
            baseHp: 10,
        });
        entity.npcClassPackage = packageFromLevels(sequence);
        entity.npcProgressionMode = window.NPC_PROGRESSION_MODES?.AUTHORED || 'authored';
        entity.npcAuthoredProgression = true;
        window.enforceNpcZeroUnspent?.(entity);
        return entity;
    }

    function buildCompanionData(name, { levelOverride = null } = {}) {
        const build = BUILDS[name];
        if (!build || !window.NPCProgression || !window.createCharacterData) return null;
        const sequence = classSequenceFor(build, levelOverride);
        const primary = sequence[0] || build.classLevels[0];
        const data = window.createCharacterData(build.race, primary, name, build.gender, build.voice || 'pc_1');
        equipLoadout(data, build);
        data.npcClassPackage = packageFromLevels(sequence);
        copyIdentity(data, build);
        window.NPCProgression.rebuildProgression(data, {
            race: build.race,
            classLevels: sequence,
            preferredSkills: preferredMap(build.skillPicks),
            seed: `canonical-companion:${name}:${sequence.join(',')}`,
            baseHp: 10,
        });
        window.enforceNpcZeroUnspent?.(data);

        // Party data historically stores classLevels as class -> count. Keep
        // that contract for dialogue/respec code while retaining the real
        // ordered history separately for NPC/Monster-Manual style inspection.
        data.classLevelSequence = [...sequence];
        data.classLevels = counts(sequence);
        data.classLevelCounts = counts(sequence);
        data.level = sequence.length || 1;
        data.class = primary;
        data.npcProgressionMode = window.NPC_PROGRESSION_MODES?.AUTHORED || 'authored';
        data.npcAuthoredProgression = true;
        data.npcUnspentSkillPoints = Object.values(data.attributes || {}).reduce((s, n) => s + (Number(n) || 0), 0);
        return data;
    }

    function syncCampaignSpecs() {
        Object.entries(CAMPAIGN_SPEC_KEYS).forEach(([name, globalKey]) => {
            const spec = window[globalKey];
            const build = BUILDS[name];
            if (!spec || !build) return;
            spec.race = build.race;
            spec.gender = build.gender;
            spec.classLevels = [...build.classLevels];
            spec.skillPicks = [...build.skillPicks];
            spec.equipment = [...(build.equipment || [])];
            spec.progressionMode = 'authored';
        });
    }

    function upgradePlacedCompanions() {
        for (const [name] of Object.entries(CAMPAIGN_SPEC_KEYS)) {
            const entity = (window.entities || []).find(e => e.name === name && e.side !== 'player');
            if (!entity) continue;
            const state = {
                side: entity.side,
                isNPC: entity.isNPC,
                tiedUp: entity.tiedUp,
                aiState: entity.aiState,
                aiControlled: entity.aiControlled,
                dialogueId: entity.dialogueId,
                factionId: entity.factionId,
                title: entity.title,
                hex: entity.hex,
                color: entity.color,
            };
            applyEntityBuild(entity, name);
            Object.entries(state).forEach(([key, value]) => {
                if (value !== undefined) entity[key] = value;
            });
        }
    }

    function finishCanonicalRecruit(name, placeholder) {
        const companion = buildCompanionData(name);
        if (!companion || !placeholder || typeof window.finishRecruiting !== 'function') return false;
        window.finishRecruiting(companion, placeholder);
        return true;
    }

    function installRecruitmentOverrides() {
        window.rescuePaladin = function() {
            const name = 'Ser Aldric Thorne';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name && e.tiedUp);
            if (!entity) return;
            finishCanonicalRecruit(name, entity);
        };
        window.recruitGoblinCompanion = function() {
            const name = 'Nix Sharpear';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name);
            if (entity) finishCanonicalRecruit(name, entity);
        };
        window.recruitOrcCompanion = function() {
            const name = 'Warlord Grukk Ironhide';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name);
            if (entity) finishCanonicalRecruit(name, entity);
        };
        window.recruitReyna = function() {
            const name = 'Reyna Fletcher';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name && e.isNPC);
            if (entity) finishCanonicalRecruit(name, entity);
        };
        window.recruitMirabel = function() {
            const name = 'Mirabel Quill';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name && e.isNPC);
            if (entity) finishCanonicalRecruit(name, entity);
        };
        window.recruitFenn = function() {
            const name = 'Fenn Oakheart';
            if ((window.party || []).some(p => p.name === name)) return;
            const entity = (window.entities || []).find(e => e.name === name && e.isNPC);
            if (entity) finishCanonicalRecruit(name, entity);
        };
    }

    function installWorldSetupHook() {
        if (typeof window.setupVillageScene !== 'function' || window.setupVillageScene.__canonicalCompanions) return;
        const previous = window.setupVillageScene;
        const wrapped = function(...args) {
            const out = previous.apply(this, args);
            syncCampaignSpecs();
            upgradePlacedCompanions();
            return out;
        };
        wrapped.__canonicalCompanions = true;
        wrapped.__previous = previous;
        window.setupVillageScene = wrapped;
    }

    function installBrotherAldenOverride() {
        window.spawnBrotherAlden = function() {
            if ((window.entities || []).some(e => e.name === 'Brother Alden')) return;
            const keepRegion = window.campaign2NorthwatchKeepRegion;
            const center = window.campaign2NorthwatchCenter;
            if (!center) return;
            const spawnHex = keepRegion?.floorHexes?.[0] || { q: center.q, r: center.r + 1 };
            const avg = (window.party?.length)
                ? window.party.reduce((sum, c) => sum + (Number(c.level) || 1), 0) / window.party.length
                : 1;
            const data = buildCompanionData('Brother Alden', { levelOverride: Math.max(1, Math.round(avg)) });
            if (!data) return;
            const ent = new window.Entity(data.name, 'red', spawnHex, (data.attributes?.agility || 10) + 10);
            Object.assign(ent, data);
            ent.classLevels = [...data.classLevelSequence];
            ent.classLevelCounts = counts(ent.classLevels);
            ent.hex = { ...spawnHex };
            ent.visualQ = ent.hex.q; ent.visualR = ent.hex.r;
            ent.startQ = ent.hex.q; ent.startR = ent.hex.r;
            ent.destination = null; ent.moveCooldown = 0;
            ent.side = 'neutral';
            ent.factionTag = 'northwatch_human';
            ent.isNPC = false;
            ent.aiState = 'idle';
            ent.aiControlled = true;
            ent.timePoints = 100;
            ent.dialogueId = 'brother_alden';
            const allowed = keepRegion
                ? new Set([...(keepRegion.floorHexes || []), ...(keepRegion.gapHexes || [])].map(h => `${h.q},${h.r}`))
                : new Set();
            ent.combatDirective = {
                hostileTo: 'enemy', outnumberWeight: 2,
                constraints: { stayWithinHexes: allowed },
                priorities: [{ type: 'insideRegion', hexes: allowed }],
            };
            window.entities.push(ent);
            window.drawMap?.();
            window.renderEntities?.();
        };

        if (window.npcDialogueTrees) {
            window.npcDialogueTrees.brother_alden = (npc) => {
                if (!npc.offersToJoin) {
                    window.showDialogue(npc, 'Brother Alden gives you a brief nod, still watching the walls. "Questions can wait — help however you can."');
                    return;
                }
                if ((window.party || []).some(p => p.name === 'Brother Alden')) {
                    window.showDialogue(npc, '"Glad to be fighting alongside you now."');
                    return;
                }
                window.showDialogue(npc, 'Brother Alden lowers his guard, breathing hard but very much alive. "Brother Alden, of the Silverhart monastery — posted here to help hold the wall. And hold it we did, thanks to you. I\'ve nowhere pressing to be, and I don\'t much fancy more garrison duty after this. Would you have me along?"', [
                    { label: 'Join us, Brother Alden.', action: () => {
                        const companion = buildCompanionData('Brother Alden', { levelOverride: npc.level || 1 });
                        if (!companion) return;
                        // Keep the exact battle-worn HP and any dynamically
                        // acquired inventory while retaining canonical progression.
                        companion.hp = Math.min(companion.maxHp, Math.max(1, npc.hp || companion.hp));
                        for (const id of npc.inventory || []) if (!companion.inventory.includes(id)) companion.inventory.push(id);
                        window.party.push(companion);
                        window.wireSharedInventory?.(companion);
                        npc.side = 'player';
                        npc.isNPC = false;
                        npc.aiControlled = false;
                        npc.classLevels = [...companion.classLevelSequence];
                        npc.classLevelCounts = counts(npc.classLevels);
                        delete npc.combatDirective;
                        window.companionAttitude[npc.name] = 60;
                        window.updatePartyTabs?.();
                        window.showMessage(`${npc.name} joins your party.`);
                    }},
                    { label: 'Not this time.', action: () => window.showMessage(`${npc.name} nods and stays behind to help rebuild the garrison.`) }
                ]);
            };
        }
    }

    function installStarFortOverride() {
        window.grantStarFortCompanion = function(side) {
            const name = side === 'greenskin' ? 'Snik Fangtooth' : 'Brother Alden';
            if ((window.party || []).some(p => p.name === name)) return;
            const spawnHex = window.campaign2NorthwatchGateHex || (window.entities || []).find(e => e.side === 'player')?.hex;
            if (!spawnHex) return;
            const companion = buildCompanionData(name);
            if (!companion) return;
            window.party.push(companion);
            window.wireSharedInventory?.(companion);
            const ent = new window.Entity(companion.name, 'red', spawnHex, (companion.attributes?.agility || 10) + 10);
            ent.side = 'player';
            Object.assign(ent, companion);
            ent.hex = { ...spawnHex };
            ent.visualQ = ent.hex.q; ent.visualR = ent.hex.r;
            ent.startQ = ent.hex.q; ent.startR = ent.hex.r;
            ent.destination = null; ent.moveCooldown = 0;
            window.entities.push(ent);
            window.companionAttitude[name] = 60;
            window.updatePartyTabs?.();
            window.showMessage(`${name} joins your party.`);
            window.drawMap?.();
            window.renderEntities?.();
        };
    }

    function initialise() {
        if (!window.NPCProgression || !window.NPC_PROGRESSION_MODES) return;
        syncCampaignSpecs();
        installRecruitmentOverrides();
        installWorldSetupHook();
        installBrotherAldenOverride();
        installStarFortOverride();
    }

    window.CANONICAL_COMPANION_BUILDS = BUILDS;
    window.buildCanonicalCompanionData = buildCompanionData;
    window.applyCanonicalCompanionEntityBuild = applyEntityBuild;
    window.upgradePlacedCanonicalCompanions = upgradePlacedCompanions;
    window.initialiseCompanionProgression = initialise;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
