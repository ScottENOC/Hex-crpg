// companionRelationshipProgression.js
// Rules for how player<->companion familiarity and trust develop.
//
// Familiarity answers "how well do we know each other?" and can grow from
// genuinely new personal conversations plus slow shared time in the party.
// Trust answers "how safe/reliable has this person proved to be?" and only
// changes through explicit authored events (promises kept/broken, support in a
// crisis, betrayal, protecting something important, etc.). Approval remains
// the existing companionAttitude meter and is deliberately independent.
(() => {
    'use strict';

    const BUILD = '20260929-companion-relationship-progression-v2';
    const UNIQUE_DIALOGUE_GAIN = 2;
    const UNIQUE_DIALOGUE_CAP = 60;
    const SHARED_DAY_GAIN = 1;
    const SHARED_DAY_CAP = 50;

    // Wren and the player are already drinking together and talking about her
    // life when Campaign 2 opens. They are not strangers, but neither are they
    // yet close confidants. Familiarity 35 intentionally clears the ordinary
    // styling threshold (30); trust 25 remains well below revealing controls.
    //
    // Wren is also the Campaign 2 anchor companion: the player cannot lock
    // themselves out of having every companion. This protects party presence,
    // not the relationship. She can reach 0 approval and 0 trust and stay.
    const AUTHORED_STARTS = Object.freeze({
        'Wren Talbot': Object.freeze({ familiarity: 35, trust: 25, anchor: true }),
    });

    const WREN_SHAKEDOWN_EVENTS = Object.freeze({
        fight: Object.freeze({ approval: 10, trust: 8, reason: 'stood with Hollowmere against the Ironbond shakedown' }),
        stay_out: Object.freeze({ approval: -4, trust: -3, reason: 'stood aside while Ironbond threatened the Hollow Tankard' }),
        encourage_pay: Object.freeze({ approval: -10, trust: -6, reason: 'backed Ironbond while they extorted Garrick' }),
    });

    const WREN_GOBLIN_FAVOUR_EVENTS = Object.freeze({
        scout: Object.freeze({ approval: -12, trust: -12, reason: 'gave Hollowmere scouting information to the goblins' }),
        steal: Object.freeze({ approval: -8, trust: -6, reason: 'stole from Hollowmere folk for the goblins' }),
        raid_mine: Object.freeze({ approval: -15, trust: -12, reason: 'helped the goblins raid Emberlode for plunder' }),
    });

    const WREN_GOBLIN_RESOLUTION_EVENTS = Object.freeze({
        assault: Object.freeze({ approval: 10, trust: 8, reason: 'broke the Skarn-tooth threat to Hollowmere' }),
        stealth_succession: Object.freeze({ approval: 12, trust: 8, reason: 'ended the Skarn-tooth threat without a massacre' }),
        goblin_diplomacy: Object.freeze({ approval: 8, trust: 6, reason: 'got the Skarn-tooth tribe away from Hollowmere peacefully' }),
        goblin_alliance: Object.freeze({ approval: -10, trust: -8, reason: 'let a raiding tribe settle permanently on Hollowmere\'s doorstep' }),
        betrayal: Object.freeze({ approval: -40, trust: -35, reason: 'betrayed Hollowmere to the goblins' }),
    });

    const WREN_PARENTS_LINE = 'Went north a couple years back — work in Millbrook, they said.';

    function canonicalCompanion(entity) {
        if (!entity || !Array.isArray(window.party) || window.party.length < 2) return null;
        if (window.party.includes(entity)) {
            return entity === window.party[0] ? null : entity;
        }
        if (!entity.name) return null;
        return window.party.find((member, index) => index > 0 && member?.name === entity.name) || null;
    }

    function companionByName(name) {
        if (!Array.isArray(window.party)) return null;
        return window.party.find((member, index) => index > 0 && member?.name === name) || null;
    }

    function wren() {
        return companionByName('Wren Talbot');
    }

    function relationshipApiReady() {
        return !!window.companionRelationships &&
            typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    function authoredStartFor(entity) {
        return entity?.name ? AUTHORED_STARTS[entity.name] || null : null;
    }

    function isAnchorCompanion(entityOrName) {
        const name = typeof entityOrName === 'string' ? entityOrName : entityOrName?.name;
        const entity = typeof entityOrName === 'string' ? companionByName(entityOrName) : entityOrName;
        return !!(entity?.companionAnchor || AUTHORED_STARTS[name]?.anchor);
    }

    function applyAuthoredStart(entity) {
        const companion = canonicalCompanion(entity) || entity;
        const authored = authoredStartFor(companion);
        if (!companion || !authored) return false;

        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: authored.familiarity,
            trust: authored.trust,
        };
        if (authored.anchor) companion.companionAnchor = true;

        if (!relationshipApiReady()) return false;

        const rel = companion.playerRelationship;
        const history = Array.isArray(rel?.history) ? rel.history : [];
        const looksLikeUntouchedGenericSeed = !rel || (
            Number(rel.familiarity ?? 10) === 10 &&
            Number(rel.trust ?? 10) === 10 &&
            history.length === 0
        );

        // New games get the authored start through companionRelationshipStart.
        // This upgrade path also fixes development saves created during the
        // brief generic-10/10 implementation without overwriting real progress.
        if (looksLikeUntouchedGenericSeed) {
            window.setCompanionRelationship(companion, {
                familiarity: authored.familiarity,
                trust: authored.trust,
            }, 'authored_start:wren_tavern_acquaintance');
        } else {
            window.getCompanionRelationship(companion); // ensure/migrate shape
        }
        return true;
    }

    function ensureAuthoredStarts() {
        if (!Array.isArray(window.party)) return;
        window.party.slice(1).forEach(applyAuthoredStart);
    }

    function tinyHash(text) {
        const s = String(text || '');
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(36);
    }

    function noteUniqueCompanionDialogue(entity, text) {
        const companion = canonicalCompanion(entity);
        if (!companion || !relationshipApiReady() || !text) return false;

        // Only personal companion-talk trees count. Story narration that merely
        // happens to use a companion as speaker should not silently grind this.
        const dialogueId = String(companion.dialogueId || entity?.dialogueId || '');
        if (!dialogueId.startsWith('companion_')) return false;

        // Clothing-boundary refusals use showDialogue too. They are feedback,
        // not relationship farming, and companionRelationships timestamps them
        // immediately before opening the modal.
        const feedbackAt = Number(companion.companionBoundaryFeedback?.at || 0);
        if (feedbackAt && Date.now() - feedbackAt < 500) return false;

        const rel = window.getCompanionRelationship(companion);
        if (!rel || rel.familiarity >= UNIQUE_DIALOGUE_CAP) return false;
        const gain = Math.min(UNIQUE_DIALOGUE_GAIN, UNIQUE_DIALOGUE_CAP - rel.familiarity);
        if (gain <= 0) return false;
        window.noteCompanionConversation(companion, `personal_dialogue:${tinyHash(text)}`, gain);
        return true;
    }

    // Explicit, idempotent trust events. Narrative code should call this at the
    // moment behaviour actually proves or damages reliability. Reusing a key is
    // a no-op, so save/load or repeated dialogue cannot farm the same promise.
    function noteTrustEvent(entity, key, delta, reason = null) {
        const companion = canonicalCompanion(entity) || entity;
        if (!companion || !key || !relationshipApiReady()) return null;
        const rel = window.companionRelationships.ensureRelationship(companion);
        if (!Array.isArray(rel.knownTrustEventKeys)) rel.knownTrustEventKeys = [];
        const stableKey = String(key);
        if (rel.knownTrustEventKeys.includes(stableKey)) return window.getCompanionRelationship(companion);
        rel.knownTrustEventKeys.push(stableKey);
        if (rel.knownTrustEventKeys.length > 80) rel.knownTrustEventKeys.splice(0, rel.knownTrustEventKeys.length - 80);
        return window.adjustCompanionRelationship(
            companion,
            { trust: Number(delta) || 0 },
            reason || `trust:${stableKey}`
        );
    }

    // Approval and trust often move together for a consequential story beat,
    // but not by definition. This helper is for authored moments where both
    // genuinely apply. The event key makes both changes one-shot.
    function noteDispositionEvent(entity, key, event = {}) {
        const companion = canonicalCompanion(entity) || entity;
        if (!companion || !key || !relationshipApiReady()) return null;
        const rel = window.companionRelationships.ensureRelationship(companion);
        if (!Array.isArray(rel.knownDispositionEventKeys)) rel.knownDispositionEventKeys = [];
        const stableKey = String(key);
        if (rel.knownDispositionEventKeys.includes(stableKey)) return window.getCompanionRelationship(companion);
        rel.knownDispositionEventKeys.push(stableKey);
        if (rel.knownDispositionEventKeys.length > 80) rel.knownDispositionEventKeys.splice(0, rel.knownDispositionEventKeys.length - 80);

        const reason = event.reason || stableKey;
        const approval = Number(event.approval || 0);
        const trust = Number(event.trust || 0);
        if (approval && typeof window.adjustCompanionAttitude === 'function' && companion.name) {
            window.adjustCompanionAttitude(companion.name, approval, reason);
        }
        if (trust) noteTrustEvent(companion, `disposition:${stableKey}`, trust, reason);
        else window.setCompanionRelationship(companion, {}, `disposition:${stableKey}`);
        return window.getCompanionRelationship(companion);
    }

    function noteWrenDispositionEvent(key, event) {
        const companion = wren();
        if (!companion) return null;
        return noteDispositionEvent(companion, key, event);
    }

    function promiseWrenParentSearch() {
        const companion = wren();
        if (!companion || companion.wrenParentsSearchPromised) return false;
        companion.wrenParentsSearchPromised = true;
        noteWrenDispositionEvent('parents_search_promise', {
            approval: 2,
            trust: 1,
            reason: 'promised to help look for Wren\'s parents in Millbrook',
        });
        if (typeof window.showDialogue === 'function') {
            window.showDialogue(companion,
                "Thanks. I know it might be nothing by now. I just... don't want to keep wondering forever.",
                [{ label: "We'll ask around when we get there.", action: () => {} }]
            );
        }
        return true;
    }

    function decorateWrenDialogue(npc, text, options) {
        const companion = canonicalCompanion(npc);
        if (!companion || companion.name !== 'Wren Talbot') return { text, options };
        let nextText = text;
        let nextOptions = Array.isArray(options) ? options : options;
        const rel = relationshipApiReady() ? window.getCompanionRelationship(companion) : null;

        // Surface the fact that the anchor companion can remain physically in
        // the party while the relationship is badly damaged.
        if (text === "What's on your mind?" && rel?.trust <= 10) {
            nextText = "Go on. I'm listening. Don't mistake that for everything being alright between us.";
        } else if (String(text).startsWith('Tired. Of the road, mostly. Not of you') && rel?.trust <= 15) {
            nextText = "I'm still here. That's what I can promise right now. Don't ask me to pretend things are fine.";
        } else if (String(text).startsWith('Makes my skin crawl a bit') && rel?.trust < 40) {
            nextText = "Magic still makes my skin crawl. Right now I'm less worried about the magic than whether I can trust the person holding it.";
        }

        if (String(text).startsWith(WREN_PARENTS_LINE)) {
            companion.wrenParentsShared = true;
            if (!companion.wrenParentsSearchPromised && Array.isArray(options)) {
                nextOptions = [
                    ...options,
                    {
                        label: "If we're going north, we'll ask around in Millbrook.",
                        action: () => promiseWrenParentSearch(),
                    },
                ];
            }
        }
        return { text: nextText, options: nextOptions };
    }

    function installShowDialogueHook() {
        if (typeof window.showDialogue !== 'function' || window.showDialogue.__relationshipProgressionAware) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            let decorated = { text, options };
            try {
                noteUniqueCompanionDialogue(npc, text);
                decorated = decorateWrenDialogue(npc, text, options);
            } catch (_) { /* relationship flavor must never block dialogue */ }
            const args = Array.from(arguments);
            args[1] = decorated.text;
            if (args.length >= 3 || decorated.options !== undefined) args[2] = decorated.options;
            return base.apply(this, args);
        };
        wrapped.__relationshipProgressionAware = true;
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function installCharacterCreationHook() {
        if (typeof window.createCharacterData !== 'function' || window.createCharacterData.__relationshipStartsAware) return false;
        const base = window.createCharacterData;
        const wrapped = function() {
            const character = base.apply(this, arguments);
            const authored = authoredStartFor(character);
            if (authored) {
                character.companionRelationshipStart = {
                    ...(character.companionRelationshipStart || {}),
                    familiarity: authored.familiarity,
                    trust: authored.trust,
                };
                if (authored.anchor) character.companionAnchor = true;
            }
            return character;
        };
        wrapped.__relationshipStartsAware = true;
        wrapped.__baseCreateCharacterData = base;
        window.createCharacterData = wrapped;
        return true;
    }

    function installDepartureHook() {
        if (typeof window.handleCompanionDeparture !== 'function' || window.handleCompanionDeparture.__anchorCompanionAware) return false;
        const base = window.handleCompanionDeparture;
        const wrapped = function(name) {
            if (isAnchorCompanion(name)) {
                const companion = companionByName(name);
                if (companion && !companion.anchorDepartureRefusedShown) {
                    companion.anchorDepartureRefusedShown = true;
                    if (typeof window.showMessage === 'function') {
                        window.showMessage(`${name} is furious with you, but stays. Whatever else is broken between you, she is not leaving you completely alone.`);
                    }
                }
                return false;
            }
            return base.apply(this, arguments);
        };
        wrapped.__anchorCompanionAware = true;
        wrapped.__baseHandleCompanionDeparture = base;
        window.handleCompanionDeparture = wrapped;
        return true;
    }

    function installShakedownHook() {
        if (typeof window.resolveShakedown !== 'function' || window.resolveShakedown.__wrenRelationshipAware) return false;
        const base = window.resolveShakedown;
        const wrapped = function(branch) {
            const result = base.apply(this, arguments);
            const event = WREN_SHAKEDOWN_EVENTS[branch];
            if (event) noteWrenDispositionEvent(`hollowmere_shakedown:${branch}`, event);
            return result;
        };
        wrapped.__wrenRelationshipAware = true;
        wrapped.__baseResolveShakedown = base;
        window.resolveShakedown = wrapped;
        return true;
    }

    function installGoblinFavorHook() {
        if (typeof window.resolveGoblinFavor !== 'function' || window.resolveGoblinFavor.__wrenRelationshipAware) return false;
        const base = window.resolveGoblinFavor;
        const wrapped = function(kind) {
            const result = base.apply(this, arguments);
            const event = WREN_GOBLIN_FAVOUR_EVENTS[kind];
            if (event) noteWrenDispositionEvent(`goblin_favour:${kind}`, event);
            return result;
        };
        wrapped.__wrenRelationshipAware = true;
        wrapped.__baseResolveGoblinFavor = base;
        window.resolveGoblinFavor = wrapped;
        return true;
    }

    function playerWorldEntity() {
        return (window.entities || []).find(entity => entity?.side === 'player' && !entity?.rider) || null;
    }

    function nearMillbrook() {
        const playerEntity = playerWorldEntity();
        const center = window.campaign2MillbrookCenter;
        return !!(playerEntity?.hex && center && typeof window.distance === 'function' && window.distance(playerEntity.hex, center) <= 10);
    }

    function checkWrenStoryState() {
        const companion = wren();
        if (!companion || !relationshipApiReady()) return;
        applyAuthoredStart(companion);

        // If the player explicitly promised to investigate in Millbrook, merely
        // reaching the village with Wren is the first fulfilled commitment: it
        // means the promise wasn't forgotten as soon as the dialogue closed.
        if (companion.wrenParentsSearchPromised && !companion.wrenParentsReachedMillbrook && nearMillbrook()) {
            companion.wrenParentsReachedMillbrook = true;
            noteWrenDispositionEvent('parents_search_reached_millbrook', {
                approval: 5,
                trust: 10,
                reason: 'kept the promise to bring Wren to Millbrook and ask about her parents',
            });
            if (typeof window.showMessage === 'function') {
                window.showMessage('Wren looks around Millbrook, suddenly much quieter. “You remembered. Thanks. Let’s ask around.”');
            }
        }

        // Existing goblin outcomes are excellent relationship signals because
        // Hollowmere is Wren's home. They are deliberately not copies of Ser
        // Aldric's morality values: Wren cares first about whether the player
        // protected or endangered people she actually knows.
        const goblinQuest = (window.questLog || []).find(quest => quest?.id === 'goblin_threat');
        const resolution = goblinQuest?.resolution;
        const goblinEvent = resolution ? WREN_GOBLIN_RESOLUTION_EVENTS[resolution] : null;
        if (goblinEvent) noteWrenDispositionEvent(`goblin_resolution:${resolution}`, goblinEvent);

        // Becoming a lich is the strongest currently-authored betrayal of the
        // relationship. Wren remains because she is the anchor companion, but
        // that guarantee must not imply consent, approval or trust.
        if (window.playerIsLich || window.lichFalloutTriggered) {
            noteWrenDispositionEvent('player_became_lich', {
                approval: -50,
                trust: -100,
                reason: 'chose lichdom and dragged Wren into its consequences',
            });
        }
    }

    // Shared time makes people less unfamiliar, not automatically more
    // trusting. One point per completed in-game day, capped at 50 so simply
    // waiting can never substitute for personal conversation or story events.
    function tickSharedFamiliarity() {
        if (!relationshipApiReady() || !Array.isArray(window.party) || window.party.length < 2) return;
        const day = Math.floor(Number(window.worldSeconds || 0) / 86400);
        window.party.slice(1).forEach(companion => {
            applyAuthoredStart(companion);
            const rel = window.companionRelationships.ensureRelationship(companion);
            if (!rel) return;
            if (!Number.isFinite(rel.sharedPartyDay)) {
                rel.sharedPartyDay = day;
                return;
            }
            if (day <= rel.sharedPartyDay) return;
            const elapsed = day - rel.sharedPartyDay;
            rel.sharedPartyDay = day;
            if (rel.familiarity >= SHARED_DAY_CAP) return;
            const gain = Math.min(elapsed * SHARED_DAY_GAIN, SHARED_DAY_CAP - rel.familiarity);
            if (gain > 0) {
                window.adjustCompanionRelationship(companion, { familiarity: gain }, `shared_time:${day}`);
            }
        });
    }

    function refreshHooks() {
        installCharacterCreationHook();
        installShowDialogueHook();
        installDepartureHook();
        installShakedownHook();
        installGoblinFavorHook();
        ensureAuthoredStarts();
        tickSharedFamiliarity();
        checkWrenStoryState();
    }

    window.companionRelationshipProgression = {
        build: BUILD,
        authoredStarts: AUTHORED_STARTS,
        uniqueDialogueGain: UNIQUE_DIALOGUE_GAIN,
        uniqueDialogueCap: UNIQUE_DIALOGUE_CAP,
        sharedDayGain: SHARED_DAY_GAIN,
        sharedDayCap: SHARED_DAY_CAP,
        applyAuthoredStart,
        isAnchorCompanion,
        noteUniqueCompanionDialogue,
        noteTrustEvent,
        noteDispositionEvent,
        noteWrenDispositionEvent,
        promiseWrenParentSearch,
        checkWrenStoryState,
        tickSharedFamiliarity,
        refreshHooks,
    };
    window.noteCompanionTrustEvent = noteTrustEvent;
    window.noteCompanionDispositionEvent = noteDispositionEvent;
    window.noteWrenDispositionEvent = noteWrenDispositionEvent;

    refreshHooks();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshHooks, { once: true });

    // Script order is intentionally tolerant: data.js loads this module early,
    // while createCharacterData/showDialogue/story functions are declared by
    // later scripts. A cheap one-second refresh picks those hooks up, notices
    // party members added after start, advances coarse shared-time familiarity,
    // and observes a handful of idempotent story-state transitions.
    setInterval(refreshHooks, 1000);

    window.COMPANION_RELATIONSHIP_PROGRESSION_BUILD = BUILD;
})();