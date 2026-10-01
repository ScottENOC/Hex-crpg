// aldricIndependentRecruitment.js
// Ser Aldric's physical rescue should not silently conscript him into the party.
//
// The original Campaign 2 implementation used rescuePaladin() for both acts:
// cutting a bound prisoner loose and recruiting a full companion. That made
// Aldric the odd one out once other unrecruited companions gained alternative
// recruitment locations. This wrapper separates those concepts without editing
// the large campaign dialogue file:
//   tied captive -> free Aldric -> recruit now OR let him travel independently
//   deferred Aldric -> Reddale -> Captain Ilsa once the Vessel-Seeker hunt opens
//
// As with companionWorldAgency.js, he can move and gather context but never
// resolves Broken Vigil, the necromancer hunt, or another plot off-screen.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20261001-aldric-independent-recruitment-v3';
    const NAME = 'Ser Aldric Thorne';
    const LEGACY_ATTITUDE_NAME = 'Ser Aldric';
    const DIALOGUE_ID = 'ser_aldric_captive';
    let suppressWrapper = 0;

    function party() { return Array.isArray(root.party) ? root.party : []; }
    function protagonist() { return party()[0] || root.player || null; }
    function isRecruited() { return party().some(member => member?.name === NAME); }
    function quest(id) { return (root.questLog || []).find(q => q?.id === id) || null; }
    function entity() { return (root.entities || []).find(e => e?.name === NAME && e.side !== 'player') || null; }

    // Older companion dialogue still asks companionAttitude for "Ser Aldric",
    // while recruitment, patience and the canonical character all use the full
    // name. Keep one source of truth and make the legacy key a live alias so
    // approval gates, old saves and newer systems cannot drift apart.
    function syncAttitudeAlias() {
        const attitudes = root.companionAttitude;
        if (!attitudes || typeof attitudes !== 'object') return false;
        const descriptor = Object.getOwnPropertyDescriptor(attitudes, LEGACY_ATTITUDE_NAME);
        const legacyValue = attitudes[LEGACY_ATTITUDE_NAME];
        if (attitudes[NAME] === undefined && legacyValue !== undefined) attitudes[NAME] = legacyValue;
        if (!descriptor || descriptor.configurable) {
            Object.defineProperty(attitudes, LEGACY_ATTITUDE_NAME, {
                configurable: true,
                enumerable: true,
                get() { return attitudes[NAME]; },
                set(value) { attitudes[NAME] = value; },
            });
        }
        return true;
    }

    function state() {
        const pc = protagonist();
        if (!pc) return { stage: 'origin', freed: false, history: [] };
        if (!pc.companionWorldAgency || typeof pc.companionWorldAgency !== 'object') {
            pc.companionWorldAgency = { version: 1, characters: {} };
        }
        pc.companionWorldAgency.characters = pc.companionWorldAgency.characters || {};
        if (!pc.companionWorldAgency.characters[NAME]) {
            pc.companionWorldAgency.characters[NAME] = {
                stage: 'origin', freed: false, deferred: false, history: [],
            };
        }
        return pc.companionWorldAgency.characters[NAME];
    }

    function setStage(stage, reason = 'story') {
        const s = state();
        if (s.stage === stage) return false;
        s.stage = stage;
        s.changedAt = Number(root.worldSeconds || 0);
        s.history = Array.isArray(s.history) ? s.history : [];
        s.history.push({ stage, reason, at: s.changedAt });
        if (s.history.length > 12) s.history.splice(0, s.history.length - 12);
        return true;
    }

    function anchorFor(stage) {
        if (stage === 'reddale') {
            const petra = (root.entities || []).find(e => e?.name === 'Guildmaster Petra Voss' && e.hex);
            return petra?.hex ? { ...petra.hex } : root.campaign2ReddaleGuildhouseCenter ? { ...root.campaign2ReddaleGuildhouseCenter } : null;
        }
        if (stage === 'hunt') {
            const ilsa = (root.entities || []).find(e => e?.name === 'Captain Ilsa Rennick' && e.hex);
            return ilsa?.hex ? { ...ilsa.hex } : root.campaign2ReddaleGuildhouseCenter ? { ...root.campaign2ReddaleGuildhouseCenter } : null;
        }
        return null;
    }

    function candidates(anchor) {
        if (!anchor) return [];
        if (typeof root.getNeighbors === 'function') return [...root.getNeighbors(anchor.q, anchor.r), anchor];
        return [
            { q: anchor.q + 1, r: anchor.r }, { q: anchor.q - 1, r: anchor.r },
            { q: anchor.q, r: anchor.r + 1 }, { q: anchor.q, r: anchor.r - 1 }, anchor,
        ];
    }

    function isPassable(hex, moving) {
        if (!hex) return false;
        const occupied = (root.entities || []).some(e => e !== moving && e?.alive !== false && e?.hex?.q === hex.q && e?.hex?.r === hex.r);
        if (occupied) return false;
        if (typeof root.getTerrainAt === 'function') {
            const terrain = root.getTerrainAt(hex.q, hex.r);
            if (terrain?.impassable) return false;
            const name = String(terrain?.name || terrain || '').toLowerCase();
            if (name.includes('water') || name.includes('wall') || name.includes('mountain')) return false;
        }
        return true;
    }

    function place() {
        if (isRecruited()) return false;
        const npc = entity();
        const s = state();
        if (!npc || !['reddale', 'hunt'].includes(s.stage)) return false;
        const destination = candidates(anchorFor(s.stage)).find(hex => isPassable(hex, npc));
        if (!destination) return false;
        npc.hex = { ...destination };
        npc.visualQ = destination.q; npc.visualR = destination.r;
        npc.startQ = destination.q; npc.startR = destination.r;
        npc.destination = null; npc.moveCooldown = 0;
        npc.aiState = 'idle';
        return true;
    }

    function freeAldric(npc = entity(), { depart = false, reason = 'player_freed' } = {}) {
        if (!npc || isRecruited()) return false;
        const s = state();
        if (!npc.tiedUp && s.freed) return false;
        npc.tiedUp = false;
        npc.side = 'neutral';
        npc.isNPC = true;
        npc.aiControlled = false;
        npc.aiState = 'idle';
        npc.dialogueId = DIALOGUE_ID;
        delete npc.combatDirective;
        s.freed = true;
        s.freedAt = Number(root.worldSeconds || 0);
        if (s.stage === 'origin') setStage(depart ? 'reddale' : 'camp', reason);
        if (depart) {
            s.deferred = true;
            if (s.stage !== 'reddale') setStage('reddale', reason);
            place();
        }
        root.showMessage?.(depart
            ? `${NAME} is free. He says he will head for Reddale and look into why Ironbond left the west road exposed.`
            : `${NAME} is free of the goblin ropes.`);
        return true;
    }

    function deferAldric(npc = entity(), reason = 'player_deferred_recruitment') {
        if (!npc || isRecruited()) return false;
        const s = state();
        s.freed = true;
        s.deferred = true;
        npc.tiedUp = false;
        setStage('reddale', reason);
        place();
        root.showMessage?.(`${NAME} heads for Reddale. He says Petra Voss may know why Ironbond support vanished from the west road.`);
        return true;
    }

    function advanceFromStory() {
        if (isRecruited()) return false;
        const s = state();
        const hunt = quest('necromancer_hunt');
        if (s.stage === 'reddale' && hunt && hunt.status !== 'completed') {
            setStage('hunt', 'vessel_seeker_hunt');
            place();
            return true;
        }
        return false;
    }

    function recruitAldric(npc = entity()) {
        if (!npc || isRecruited() || typeof root.buildCanonicalCompanionData !== 'function' || typeof root.finishRecruiting !== 'function') return false;
        const companion = root.buildCanonicalCompanionData(NAME, { levelOverride: npc.level || 2 });
        if (!companion) return false;
        companion.hp = Math.min(companion.maxHp, Math.max(1, Number(npc.hp) || companion.hp));
        for (const itemId of npc.inventory || []) {
            if (!companion.inventory.includes(itemId)) companion.inventory.push(itemId);
        }
        root.finishRecruiting(companion, npc);
        syncAttitudeAlias();
        const s = state();
        s.freed = true;
        s.recruited = true;
        setStage('recruited', 'joined_party');
        return true;
    }

    function showPostFree(npc) {
        if (typeof root.showDialogue !== 'function') return false;
        suppressWrapper++;
        try {
            root.showDialogue(npc,
                'Aldric works feeling back into his wrists. “My thanks. I meant what I said: I intend to see this business through. If you want another sword beside you, I can come now. Otherwise I’ll start in Reddale. Somebody there signed the promises that failed on this road.”', [
                    { label: 'Come with me.', action: () => recruitAldric(npc) },
                    { label: 'Go to Reddale. I may find you there.', action: () => deferAldric(npc) },
                ]);
        } finally {
            suppressWrapper--;
        }
        return true;
    }

    function alternativeText() {
        const s = state();
        if (s.stage === 'hunt') {
            return 'Aldric has shifted his attention from Ironbond’s old west-road order to Captain Rennick’s Vessel-Seeker investigation. He has compared names and patrol reports, but he has not entered the crypt or decided anyone’s fate without you.\n\n“Still room for another sword? I’d rather face what Rennick found with people I know than pretend this is ordinary Company business.”';
        }
        return 'Aldric made it to Reddale and has been asking after the Company order that stripped support from the west road. He has confirmed there are records worth seeing, but he has not confronted Petra, exposed anyone, or resolved The Broken Vigil without you.\n\n“I said I owed you a debt. I haven’t forgotten. If you want me with you, say the word.”';
    }

    function showAlternativeRecruitment(npc) {
        if (typeof root.showDialogue !== 'function') return false;
        suppressWrapper++;
        try {
            root.showDialogue(npc, alternativeText(), [
                { label: 'Join me.', action: () => recruitAldric(npc) },
                { label: 'Keep digging for now.', action: () => {} },
            ]);
        } finally {
            suppressWrapper--;
        }
        return true;
    }

    function showCaptiveDialogue(npc) {
        if (isRecruited()) return false;
        const s = state();
        if (!npc.tiedUp && ['reddale', 'hunt'].includes(s.stage)) return showAlternativeRecruitment(npc);
        if (!npc.tiedUp || s.freed) return showPostFree(npc);
        suppressWrapper++;
        try {
            root.showDialogue(npc,
                'Please... cut me loose. I came out here to deal with this goblin problem myself, and, well — here we are. Whatever you decide to do about them, I intend to see them gone from this land. I’ll owe you a debt either way.', [
                    { label: 'I’ll free you now.', action: () => { freeAldric(npc); showPostFree(npc); } },
                    { label: 'Not yet.', action: () => {} },
                ]);
        } finally {
            suppressWrapper--;
        }
        return true;
    }

    function sync() {
        syncAttitudeAlias();
        if (isRecruited()) {
            const s = state();
            s.recruited = true;
            if (s.stage !== 'recruited') setStage('recruited', 'party_sync');
            return s;
        }
        advanceFromStory();
        place();
        return state();
    }

    function installWorldHook() {
        const base = root.setupVillageScene;
        if (typeof base !== 'function' || base.__aldricIndependentRecruitmentAware) return false;
        const wrapped = function() {
            const result = base.apply(this, arguments);
            sync();
            return result;
        };
        wrapped.__aldricIndependentRecruitmentAware = true;
        wrapped.__baseAldricIndependentRecruitmentSetup = base;
        root.setupVillageScene = wrapped;
        return true;
    }

    function installLoadHook() {
        const base = root.loadGame;
        if (typeof base !== 'function' || base.__aldricAttitudeAliasAware) return false;
        const wrapped = function() {
            const result = base.apply(this, arguments);
            // loadGame restores companionAttitude after world setup, replacing
            // the object that carried our accessor. Re-attach it immediately.
            syncAttitudeAlias();
            return result;
        };
        wrapped.__aldricAttitudeAliasAware = true;
        wrapped.__baseAldricIndependentRecruitmentLoad = base;
        root.loadGame = wrapped;
        return true;
    }

    function install() {
        if (!root.npcDialogueTrees || typeof root.showDialogue !== 'function') return false;
        syncAttitudeAlias();
        root.npcDialogueTrees[DIALOGUE_ID] = function(npc) {
            if (suppressWrapper) return false;
            return showCaptiveDialogue(npc);
        };

        // Campaign resolution branches still call rescuePaladin(). From this
        // point that means exactly what the name says: free the prisoner. It no
        // longer means "also add him to the party". Because those calls happen
        // without a recruitment conversation, Aldric heads to Reddale afterward.
        root.rescuePaladin = function() {
            const npc = entity();
            if (!npc || isRecruited()) return false;
            return freeAldric(npc, { depart: true, reason: 'camp_resolution_freed' });
        };
        root.recruitAldric = recruitAldric;

        installWorldHook();
        installLoadHook();
        sync();
        if (typeof document !== 'undefined' && !root.__aldricIndependentRecruitmentTimer) {
            root.__aldricIndependentRecruitmentTimer = setInterval(sync, 15000);
        }
        return true;
    }

    const api = {
        build: BUILD, state, setStage, freeAldric, deferAldric, advanceFromStory,
        place, recruitAldric, alternativeText, showCaptiveDialogue, syncAttitudeAlias,
        sync, installWorldHook, installLoadHook, install,
    };
    root.aldricIndependentRecruitment = api;
    root.ALDRIC_INDEPENDENT_RECRUITMENT_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();