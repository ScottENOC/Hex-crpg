// companionRelationshipProgression.js
// First-pass rules for how player<->companion familiarity and trust develop.
//
// Familiarity answers "how well do we know each other?" and can grow from
// genuinely new personal conversations plus slow shared time in the party.
// Trust answers "how safe/reliable has this person proved to be?" and only
// changes through explicit authored events (promises kept/broken, support in a
// crisis, betrayal, protecting something important, etc.). Approval remains
// the existing companionAttitude meter and is deliberately independent.
(() => {
    'use strict';

    const BUILD = '20260929-companion-relationship-progression-v1';
    const UNIQUE_DIALOGUE_GAIN = 2;
    const UNIQUE_DIALOGUE_CAP = 60;
    const SHARED_DAY_GAIN = 1;
    const SHARED_DAY_CAP = 50;

    // Wren and the player are already drinking together and talking about her
    // life when Campaign 2 opens. They are not strangers, but neither are they
    // yet close confidants. Familiarity 35 intentionally clears the ordinary
    // styling threshold (30); trust 25 remains well below revealing controls.
    const AUTHORED_STARTS = Object.freeze({
        'Wren Talbot': Object.freeze({ familiarity: 35, trust: 25 }),
    });

    function canonicalCompanion(entity) {
        if (!entity || !Array.isArray(window.party) || window.party.length < 2) return null;
        if (window.party.includes(entity)) {
            return entity === window.party[0] ? null : entity;
        }
        if (!entity.name) return null;
        return window.party.find((member, index) => index > 0 && member?.name === entity.name) || null;
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

    function applyAuthoredStart(entity) {
        const companion = canonicalCompanion(entity) || entity;
        const authored = authoredStartFor(companion);
        if (!companion || !authored) return false;

        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            ...authored,
        };

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
            window.setCompanionRelationship(companion, authored, 'authored_start:wren_tavern_acquaintance');
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

    function installShowDialogueHook() {
        if (typeof window.showDialogue !== 'function' || window.showDialogue.__relationshipProgressionAware) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text) {
            try { noteUniqueCompanionDialogue(npc, text); } catch (_) { /* relationship flavor must never block dialogue */ }
            return base.apply(this, arguments);
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
                    ...authored,
                };
            }
            return character;
        };
        wrapped.__relationshipStartsAware = true;
        wrapped.__baseCreateCharacterData = base;
        window.createCharacterData = wrapped;
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
        ensureAuthoredStarts();
        tickSharedFamiliarity();
    }

    window.companionRelationshipProgression = {
        build: BUILD,
        authoredStarts: AUTHORED_STARTS,
        uniqueDialogueGain: UNIQUE_DIALOGUE_GAIN,
        uniqueDialogueCap: UNIQUE_DIALOGUE_CAP,
        sharedDayGain: SHARED_DAY_GAIN,
        sharedDayCap: SHARED_DAY_CAP,
        applyAuthoredStart,
        noteUniqueCompanionDialogue,
        noteTrustEvent,
        tickSharedFamiliarity,
        refreshHooks,
    };
    window.noteCompanionTrustEvent = noteTrustEvent;

    refreshHooks();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshHooks, { once: true });

    // Script order is intentionally tolerant: data.js loads this module early,
    // while createCharacterData/showDialogue are declared by later scripts.
    // A cheap one-second refresh also picks up party members added after game
    // start and advances the coarse once-per-in-game-day familiarity rule.
    setInterval(refreshHooks, 1000);

    window.COMPANION_RELATIONSHIP_PROGRESSION_BUILD = BUILD;
})();