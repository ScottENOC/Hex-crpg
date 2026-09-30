// companionObservedPersonality.js
// Personality clues learned from watching companions act, rather than asking them to explain themselves.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20261001-companion-observed-personality-v1';

    const EVENTS = Object.freeze({
        'wren:chooses_own_reckoning': {
            companion: 'Wren Talbot',
            when: () => {
                const q = quest('wren_crown_quiet_hand');
                return q?.status === 'completed' && q?.resolution === 'wren_decides';
            },
            clues: () => {
                const q = quest('wren_crown_quiet_hand');
                const effective = q?.effectiveResolution || q?.wrenDecision;
                const clues = [{ trait: 'authority', amount: 1 }];
                if (effective === 'restore_names') clues.push({ trait: 'mercy', amount: 1 });
                return clues;
            },
            description: 'You watched Wren take ownership of what justice for her parents should mean once the choice was genuinely hers.',
        },
        'aldric:chooses_own_oath': {
            companion: 'Ser Aldric Thorne',
            when: () => {
                const q = quest('aldric_measure_of_oath');
                return q?.status === 'completed' && q?.resolution === 'aldric_decides';
            },
            clues: () => [{ trait: 'duty', amount: 1 }, { trait: 'burden', amount: 1 }],
            description: 'You watched Aldric decide for himself what an old vow still required of him when nobody else could make the choice cleanly.',
        },
        'mirabel:copies_restricted_appendix': {
            companion: 'Mirabel Quill',
            when: () => !!quest('mirabel_unquiet_concordance')?.clues?.restricted_appendix,
            clues: () => [{ trait: 'curiosity', amount: 1 }, { trait: 'responsibility', amount: 1 }],
            description: 'You watched Mirabel copy the dangerous appendix carefully, linger over the clever parts, and still recognise why someone had restricted them.',
        },
        'fenn:traces_compromise_channel': {
            companion: 'Fenn Oakheart',
            when: () => !!quest('fenn_living_boundary')?.clues?.old_channel,
            clues: () => [{ trait: 'stewardship', amount: 1 }, { trait: 'reciprocity', amount: 1 }],
            description: 'You watched Fenn trace the old channel and immediately look for a way to reduce the farm’s loss without simply erasing the new marsh.',
        },
        'reyna:hears_tamsin_before_judging': {
            companion: 'Reyna Fletcher',
            when: () => !!quest('reyna_empty_blind')?.clues?.coercion,
            clues: () => [{ trait: 'interdependence', amount: 1 }],
            description: 'You watched Reyna hear an old partner’s ugly confession through before deciding what should happen, then focus on the fact that Tamsin had tried to face the disaster alone.',
        },
        'alden:refuses_to_forget_uncounted': {
            companion: 'Brother Alden',
            when: () => !!quest('alden_uncounted')?.clues?.alden_memory,
            clues: () => [{ trait: 'dignity', amount: 1 }, { trait: 'engagement', amount: 1 }],
            description: 'You watched Alden turn a troubling memory into an investigation because six dead people had been reduced to categories or omitted entirely.',
        },
    });

    function quest(id) {
        return (root.questLog || []).find(entry => entry?.id === id) || null;
    }

    function player() {
        return (Array.isArray(root.party) && root.party[0]) || root.player || null;
    }

    function observationStore() {
        const p = player();
        if (!p) return null;
        return p.companionPersonalityObservations ||= {};
    }

    function normaliseClues(value) {
        return (Array.isArray(value) ? value : (value ? [value] : []))
            .map(clue => typeof clue === 'string' ? { trait: clue, amount: 1 } : clue)
            .filter(clue => clue?.trait);
    }

    function observe(eventId, spec = EVENTS[eventId]) {
        if (!eventId || !spec?.companion) return null;
        const store = observationStore();
        if (!store) return null;
        if (store[eventId]) return { eventId, repeated: true, advanced: false, results: [] };

        let visible = false;
        try { visible = typeof spec.when === 'function' ? !!spec.when() : !!spec.when; }
        catch (_) { visible = false; }
        if (!visible) return null;

        let clues = [];
        try { clues = normaliseClues(typeof spec.clues === 'function' ? spec.clues() : spec.clues); }
        catch (_) { clues = []; }
        if (!clues.length) return null;

        const results = clues.map(clue => root.learnCompanionPersonality?.(
            spec.companion,
            clue.trait,
            Math.max(1, Number(clue.amount || 1)),
            `observed:${eventId}`
        )).filter(Boolean);

        store[eventId] = {
            companion: spec.companion,
            at: Number(root.worldSeconds || root.gameTime || 0),
            description: String(spec.description || ''),
            clues: clues.map(clue => ({ trait: clue.trait, amount: Math.max(1, Number(clue.amount || 1)) })),
        };

        return {
            eventId,
            companion: spec.companion,
            repeated: false,
            advanced: results.some(result => result?.advanced),
            results,
        };
    }

    function sync() {
        const observed = [];
        for (const [eventId, spec] of Object.entries(EVENTS)) {
            const result = observe(eventId, spec);
            if (result && !result.repeated) observed.push(result);
        }
        return observed;
    }

    function evidence(name = null) {
        const store = observationStore() || {};
        return Object.entries(store)
            .map(([eventId, entry]) => ({ eventId, ...entry }))
            .filter(entry => !name || entry.companion === name)
            .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
    }

    function install() {
        sync();
        const current = root.showDialogue;
        if (typeof current !== 'function') return false;
        if (current.__companionObservedPersonality) return true;
        const wrapped = function showDialogueWithObservedPersonality() {
            sync();
            return current.apply(this, arguments);
        };
        wrapped.__companionObservedPersonality = true;
        wrapped.__previous = current;
        root.showDialogue = wrapped;
        return true;
    }

    const api = { build: BUILD, events: EVENTS, observe, sync, evidence, install };
    root.companionObservedPersonality = api;
    root.observeCompanionPersonality = observe;
    root.COMPANION_OBSERVED_PERSONALITY_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (!install() && typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        setTimeout(install, 0);
    }
})();
