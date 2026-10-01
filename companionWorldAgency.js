// companionWorldAgency.js
// Lightweight off-party movement for recruitable companions.
//
// This is intentionally NOT a life simulator and does not resolve companion or
// main-plot quests off-screen. Once the player has reached a companion's normal
// recruitment moment and explicitly says "not now", that companion can move to
// a small number of authored alternative recruitment locations. Later story
// beats can move them again, carrying only conversational context. The decisive
// choices, rewards and quest completion still require the player.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-companion-world-agency-v1';

    const PROFILES = Object.freeze({
        'Reyna Fletcher': Object.freeze({
            dialogueId: 'reyna_fletcher',
            firstStage: 'reddale',
            stages: Object.freeze({
                reddale: { anchorName: 'Captain Ilsa Rennick', fallbackKey: 'campaign2ReddaleGuildhouseCenter' },
                northwatch: { fallbackKey: 'campaign2NorthwatchCenter' },
            }),
        }),
        'Mirabel Quill': Object.freeze({
            dialogueId: 'mirabel_quill',
            firstStage: 'reddale',
            stages: Object.freeze({
                reddale: { anchorName: 'Guildmaster Petra Voss', fallbackKey: 'campaign2ReddaleGuildhouseCenter' },
                silverhart_archive: { anchorName: 'Court Wizard Thessaly', fallbackKey: 'campaign2PalaceThroneCenter' },
            }),
        }),
        'Fenn Oakheart': Object.freeze({
            dialogueId: 'fenn_oakheart',
            firstStage: 'farmstead',
            stages: Object.freeze({
                farmstead: { anchorName: 'Old Mac', fallbackKey: 'campaign2FarmHouseCenter' },
                sylvan_court: { anchorName: "Queen Aelwen Sil'thandriel", fallbackKey: 'campaign2DruidGroveCenter' },
            }),
        }),
        'Brother Alden': Object.freeze({
            dialogueId: 'brother_alden',
            firstStage: 'cathedral',
            stages: Object.freeze({
                cathedral: { anchorName: 'High Cleric Adelram', fallbackKey: 'campaign2CathedralCenter' },
            }),
        }),
    });

    const STAGE_COPY = Object.freeze({
        'Reyna Fletcher': Object.freeze({
            reddale: 'Reyna has moved on from Old Mac’s farm and is resupplying in Reddale, still following the border trouble on her own.',
            northwatch: 'Reyna followed the trail east to Northwatch. She has suspicions about the missing trackers, but not enough to settle what happened without you.',
        }),
        'Mirabel Quill': Object.freeze({
            reddale: 'Mirabel brought the recovered folio into Reddale to ask after its provenance. She has learned enough to know the book matters, not enough to resolve its dangerous questions.',
            silverhart_archive: 'Mirabel has taken the folio to Silverhart and is comparing notes around Thessaly’s archive. The Concordance still needs the player-led investigation and final choice.',
        }),
        'Fenn Oakheart': Object.freeze({
            farmstead: 'Fenn is spending time around Old Mac’s farm, curious about the changing water and the tension between pasture and grove.',
            sylvan_court: 'Fenn has gone to the Sylvan Court to listen to how the elves think about old boundaries and managed forests. He has not resolved the dispute for anyone.',
        }),
        'Brother Alden': Object.freeze({
            cathedral: 'Alden has gone to Silverhart’s Grand Cathedral to look at Northwatch’s memorial and burial records. He has noticed questions, not solved The Uncounted without you.',
        }),
    });

    function party() { return Array.isArray(root.party) ? root.party : []; }
    function protagonist() { return party()[0] || root.player || null; }
    function quest(id) { return (root.questLog || []).find(q => q?.id === id) || null; }
    function isRecruited(name) { return party().some(member => member?.name === name); }
    function entity(name) { return (root.entities || []).find(e => e?.name === name && e.side !== 'player') || null; }

    function store() {
        const pc = protagonist();
        if (!pc) return { version: 1, characters: {} };
        if (!pc.companionWorldAgency || typeof pc.companionWorldAgency !== 'object') {
            pc.companionWorldAgency = { version: 1, characters: {} };
        }
        if (!pc.companionWorldAgency.characters) pc.companionWorldAgency.characters = {};
        return pc.companionWorldAgency;
    }

    function getState(name) {
        const profile = PROFILES[name];
        if (!profile) return null;
        const s = store();
        if (!s.characters[name]) {
            s.characters[name] = { stage: 'origin', deferred: false, history: [] };
        }
        return s.characters[name];
    }

    function setStage(name, stage, reason = 'story') {
        const profile = PROFILES[name];
        const state = getState(name);
        if (!profile || !state || (stage !== 'origin' && !profile.stages[stage])) return false;
        if (state.stage === stage) return false;
        state.stage = stage;
        state.changedAt = Number(root.worldSeconds || 0);
        state.history = Array.isArray(state.history) ? state.history : [];
        state.history.push({ stage, reason, at: state.changedAt });
        if (state.history.length > 12) state.history.splice(0, state.history.length - 12);
        return true;
    }

    function anchorHex(name, stage) {
        const spec = PROFILES[name]?.stages?.[stage];
        if (!spec) return null;
        if (spec.anchorName) {
            const anchor = (root.entities || []).find(e => e?.name === spec.anchorName && e.hex);
            if (anchor?.hex) return { ...anchor.hex };
        }
        const fallback = spec.fallbackKey ? root[spec.fallbackKey] : null;
        return fallback ? { ...fallback } : null;
    }

    function candidateHexes(anchor) {
        if (!anchor) return [];
        if (typeof root.getNeighbors === 'function') {
            return [...root.getNeighbors(anchor.q, anchor.r), anchor];
        }
        return [
            { q: anchor.q + 1, r: anchor.r }, { q: anchor.q - 1, r: anchor.r },
            { q: anchor.q, r: anchor.r + 1 }, { q: anchor.q, r: anchor.r - 1 }, anchor,
        ];
    }

    function passable(hex, movingEntity) {
        if (!hex) return false;
        const occupied = (root.entities || []).some(e => e !== movingEntity && e?.alive !== false && e?.hex?.q === hex.q && e?.hex?.r === hex.r);
        if (occupied) return false;
        if (typeof root.getTerrainAt === 'function') {
            const terrain = String(root.getTerrainAt(hex.q, hex.r) || '').toLowerCase();
            if (terrain.includes('water') || terrain.includes('wall') || terrain.includes('mountain')) return false;
        }
        return true;
    }

    function place(name) {
        if (isRecruited(name)) return false;
        const state = getState(name);
        const ent = entity(name);
        if (!state || state.stage === 'origin' || !ent) return false;
        const anchor = anchorHex(name, state.stage);
        const destination = candidateHexes(anchor).find(hex => passable(hex, ent));
        if (!destination) return false;
        ent.hex = { ...destination };
        ent.visualQ = destination.q; ent.visualR = destination.r;
        ent.startQ = destination.q; ent.startR = destination.r;
        ent.destination = null;
        ent.moveCooldown = 0;
        ent.aiState = 'idle';
        if (name === 'Brother Alden') delete ent.combatDirective;
        return true;
    }

    function defer(name) {
        const profile = PROFILES[name];
        const state = getState(name);
        if (!profile || !state || isRecruited(name)) return false;
        state.deferred = true;
        const changed = setStage(name, profile.firstStage, 'player_deferred_recruitment');
        place(name);
        const destinations = {
            'Reyna Fletcher': 'Reddale',
            'Mirabel Quill': 'Reddale',
            'Fenn Oakheart': "Old Mac’s farm",
            'Brother Alden': 'Silverhart’s Grand Cathedral',
        };
        root.showMessage?.(`${name} says you can find ${name.split(' ')[0] === 'Brother' ? 'him' : name} around ${destinations[name]} if you change your mind.`);
        return changed || true;
    }

    function advanceFromStory() {
        const moved = [];
        const advance = (name, from, to, condition, reason) => {
            const state = getState(name);
            if (!state || state.stage !== from || isRecruited(name) || !condition) return;
            if (setStage(name, to, reason)) moved.push(name);
        };

        advance('Reyna Fletcher', 'reddale', 'northwatch', !!quest('eyes_on_border'), 'border_investigation_reached_northwatch');
        advance('Mirabel Quill', 'reddale', 'silverhart_archive',
            !!quest('necromancer_hunt') || quest('wizard_vendetta')?.status === 'completed',
            'arcane_leads_reached_silverhart');
        advance('Fenn Oakheart', 'farmstead', 'sylvan_court',
            quest('silver_accord')?.status === 'completed',
            'forest_diplomacy_reached_sylvan_court');

        moved.forEach(place);
        return moved;
    }

    function sync() {
        advanceFromStory();
        Object.keys(PROFILES).forEach(name => {
            if (isRecruited(name)) {
                const state = getState(name);
                if (state) state.recruited = true;
                return;
            }
            place(name);
        });
        return store();
    }

    function recruitmentText(name) {
        const state = getState(name);
        if (!state || state.stage === 'origin') return null;
        const context = STAGE_COPY[name]?.[state.stage] || '';
        if (name === 'Reyna Fletcher') {
            return `${context}\n\nReyna hooks a thumb through her belt. “I meant what I said before. I’m still travelling, and I’d rather do the dangerous parts with people I know can handle themselves. Offer still stands.”`;
        }
        if (name === 'Mirabel Quill') {
            return `${context}\n\nMirabel closes the book around one finger. “I have generated more questions than answers. Very scholarly of me. If you still want a wizard along, I’m available.”`;
        }
        if (name === 'Fenn Oakheart') {
            const herbCount = (root.player?.inventory || []).filter(id => id === 'herbs').length;
            return `${context}\n\nFenn smiles. “I’m still willing to come. I’m also still serious about the three clean bundles of herbs. ${herbCount >= 3 ? 'You have them.' : 'Bring them when you’re ready.'}”`;
        }
        if (name === 'Brother Alden') {
            return `${context}\n\nAlden looks up from the records. “Northwatch taught me I have had enough stationary duty for a while. If the offer to travel together still exists, so does my answer.”`;
        }
        return context;
    }

    function recruitAlden(npc) {
        if (!npc || isRecruited('Brother Alden') || typeof root.buildCanonicalCompanionData !== 'function') return false;
        const companion = root.buildCanonicalCompanionData('Brother Alden', { levelOverride: npc.level || 1 });
        if (!companion) return false;
        companion.hp = Math.min(companion.maxHp, Math.max(1, npc.hp || companion.hp));
        for (const id of npc.inventory || []) if (!companion.inventory.includes(id)) companion.inventory.push(id);
        root.party.push(companion);
        root.wireSharedInventory?.(companion);
        npc.side = 'player';
        npc.isNPC = false;
        npc.aiControlled = false;
        npc.classLevels = [...(companion.classLevelSequence || [])];
        npc.classLevelCounts = { ...(companion.classLevelCounts || {}) };
        delete npc.combatDirective;
        root.companionAttitude = root.companionAttitude || {};
        root.companionAttitude[npc.name] = 60;
        root.updatePartyTabs?.();
        root.showMessage?.(`${npc.name} joins your party.`);
        getState('Brother Alden').recruited = true;
        return true;
    }

    function recruitFromAlternative(name, npc) {
        if (name === 'Fenn Oakheart') {
            const inventory = root.player?.inventory || [];
            if (inventory.filter(id => id === 'herbs').length < 3) {
                root.showMessage?.('Fenn still wants three bundles of herbs gathered cleanly.');
                return false;
            }
            let removed = 0;
            root.player.inventory = inventory.filter(id => {
                if (id === 'herbs' && removed < 3) { removed++; return false; }
                return true;
            });
            root.recruitFenn?.();
        } else if (name === 'Reyna Fletcher') root.recruitReyna?.();
        else if (name === 'Mirabel Quill') root.recruitMirabel?.();
        else if (name === 'Brother Alden') return recruitAlden(npc);
        const recruited = isRecruited(name);
        if (recruited) getState(name).recruited = true;
        return recruited;
    }

    function showAlternativeRecruitment(name, npc) {
        const text = recruitmentText(name);
        if (!text || typeof root.showDialogue !== 'function') return false;
        const options = [];
        const canJoin = name !== 'Fenn Oakheart' || (root.player?.inventory || []).filter(id => id === 'herbs').length >= 3;
        if (canJoin) options.push({ label: name === 'Fenn Oakheart' ? 'Give the herbs, and join me.' : 'Join me.', action: () => recruitFromAlternative(name, npc) });
        options.push({ label: 'Maybe later.', action: () => {} });
        root.showDialogue(npc, text, options);
        return true;
    }

    function wrapDialogueTree(name, profile) {
        const trees = root.npcDialogueTrees;
        const base = trees?.[profile.dialogueId];
        if (typeof base !== 'function' || base.__companionWorldAgencyAware) return false;
        const wrapped = function(npc) {
            sync();
            const state = getState(name);
            if (!isRecruited(name) && state?.stage !== 'origin') return showAlternativeRecruitment(name, npc);
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let first = true;
            root.showDialogue = function(speaker, text, options) {
                if (first && speaker === npc && Array.isArray(options)) {
                    first = false;
                    const hasJoin = options.some(o => /join me|join us|give the herbs, and join/i.test(String(o?.label || '')));
                    if (hasJoin) {
                        options = options.map(option => {
                            if (!/not right now|not this time/i.test(String(option?.label || ''))) return option;
                            const originalAction = option.action;
                            return {
                                ...option,
                                action: function() {
                                    const result = originalAction?.apply(this, arguments);
                                    defer(name);
                                    return result;
                                },
                            };
                        });
                    }
                    const args = [...arguments];
                    args[2] = options;
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try { return base.apply(this, arguments); }
            finally { root.showDialogue = originalShowDialogue; }
        };
        wrapped.__companionWorldAgencyAware = true;
        wrapped.__baseCompanionWorldAgencyDialogue = base;
        trees[profile.dialogueId] = wrapped;
        return true;
    }

    function installWorldHook() {
        const base = root.setupVillageScene;
        if (typeof base !== 'function' || base.__companionWorldAgencyAware) return false;
        const wrapped = function() {
            const result = base.apply(this, arguments);
            sync();
            return result;
        };
        wrapped.__companionWorldAgencyAware = true;
        wrapped.__baseCompanionWorldAgencySetup = base;
        root.setupVillageScene = wrapped;
        return true;
    }

    function install() {
        if (!root.npcDialogueTrees) return false;
        Object.entries(PROFILES).forEach(([name, profile]) => wrapDialogueTree(name, profile));
        installWorldHook();
        sync();
        if (typeof document !== 'undefined' && !root.__companionWorldAgencyTimer) {
            root.__companionWorldAgencyTimer = setInterval(sync, 15000);
        }
        return true;
    }

    const api = { build: BUILD, profiles: PROFILES, getState, setStage, defer, advanceFromStory, anchorHex, place, sync, recruitmentText, recruitFromAlternative, showAlternativeRecruitment, install };
    root.companionWorldAgency = api;
    root.COMPANION_WORLD_AGENCY_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
