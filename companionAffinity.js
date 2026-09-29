// companionAffinity.js
// Friendship, romantic feeling and physical attraction are deliberately
// separate from approval/trust/familiarity.
//
// Approval:       do I like/agree with what you just did?
// Trust:          do I believe you are safe/reliable when it matters?
// Familiarity:    how well do I know you?
// Friendship:     how emotionally close are we as friends?
// Romantic bond:  do I have romantic feelings for you?
// Attraction:     do I experience physical/sexual attraction to you?
//
// Sexual/romantic orientation is authored per companion as HARD CAPS. Player
// choices can move a meter within its cap but can never rewrite the cap. This
// is important: affection is not mind control and enough dialogue cannot turn
// an exclusively straight/gay companion into something they are not.
(() => {
    'use strict';

    const BUILD = '20260929-companion-affinity-v1';
    const MIN = 0;
    const MAX = 100;

    const PROFILES = Object.freeze({
        'Wren Talbot': Object.freeze({
            orientationLabel: 'straight',
            // Wren is canonically straight, but not at the absolute end of the
            // spectrum. A feminine-presenting protagonist can become someone
            // she deeply loves romantically while her physical attraction stays
            // below the threshold at which she would want sexual intimacy.
            attractionCaps: Object.freeze({ masculine: 100, feminine: 30, androgynous: 45, unknown: 35 }),
            romanticCaps: Object.freeze({ masculine: 100, feminine: 85, androgynous: 90, unknown: 75 }),
            physicalInterestThreshold: 50,
            physicalIntimacyThreshold: 60,
            friendshipStart: 38,
            romanticBondStart: 0,
            initialAttractionFraction: 0.18,
            // Small, one-shot "noticed competence" bonuses. These are taste,
            // not a build tax: story/dialogue matter much more than skill spend.
            skillTreeAttraction: Object.freeze({ strength: 2, agility: 2, rogue: 2, nature: 1 }),
            skillAttraction: Object.freeze({
                keen_perception: 1,
                insight: 1,
                druid_knowledge_nature: 1,
                elf_knowledge_nature: 1,
                knowledge_religion: 1,
            }),
        }),
    });

    const WREN_STORY_AFFINITY = Object.freeze({
        'hollowmere_shakedown:fight': Object.freeze({ friendship: 3, attraction: 2, reason: 'stood up for Hollowmere under pressure' }),
        'hollowmere_shakedown:stay_out': Object.freeze({ friendship: -2, attraction: -1, reason: 'stood aside while Hollowmere was threatened' }),
        'hollowmere_shakedown:encourage_pay': Object.freeze({ friendship: -4, romanticBond: -2, attraction: -2, reason: 'backed Ironbond coercion against Wren’s home' }),
        'goblin_favour:scout': Object.freeze({ friendship: -6, romanticBond: -3, attraction: -2, reason: 'scouted Wren’s home for raiders' }),
        'goblin_favour:steal': Object.freeze({ friendship: -4, romanticBond: -2, attraction: -1, reason: 'stole from Wren’s community for raiders' }),
        'goblin_favour:raid_mine': Object.freeze({ friendship: -5, romanticBond: -3, attraction: -2, reason: 'raided civilians for plunder' }),
        'goblin_resolution:assault': Object.freeze({ friendship: 3, attraction: 2, reason: 'protected Hollowmere decisively' }),
        'goblin_resolution:stealth_succession': Object.freeze({ friendship: 4, attraction: 3, reason: 'protected Hollowmere with nerve and restraint' }),
        'goblin_resolution:goblin_diplomacy': Object.freeze({ friendship: 4, attraction: 1, reason: 'protected Hollowmere without needless bloodshed' }),
        'goblin_resolution:goblin_alliance': Object.freeze({ friendship: -3, romanticBond: -1, reason: 'accepted continuing danger to Wren’s home' }),
        'goblin_resolution:betrayal': Object.freeze({ friendship: -18, romanticBond: -14, attraction: -12, reason: 'betrayed Wren and Hollowmere' }),
        'parents_search_promise': Object.freeze({ friendship: 2, romanticBond: 1, reason: 'offered to help with Wren’s missing parents' }),
        'parents_search_reached_millbrook': Object.freeze({ friendship: 6, romanticBond: 4, reason: 'remembered and kept a deeply personal promise' }),
        'parents_investigation:support': Object.freeze({ friendship: 8, romanticBond: 6, reason: 'stood beside Wren without taking her grief away from her' }),
        'parents_investigation:restore_names': Object.freeze({ friendship: 7, romanticBond: 5, reason: 'helped restore Wren’s parents’ names' }),
        'parents_investigation:closure': Object.freeze({ friendship: 6, romanticBond: 4, reason: 'helped Wren find closure' }),
        // Love/attachment need not vanish because someone becomes horrifying.
        // Attraction and closeness take a huge hit, but the remaining romantic
        // bond can become part of a tragic dark-path relationship.
        'player_became_lich': Object.freeze({ friendship: -22, romanticBond: -18, attraction: -30, reason: 'chose lichdom despite its cost to the people beside them' }),
    });

    const WREN_DIALOGUE_AFFINITY = Object.freeze({
        people_do_not_give_up: Object.freeze({ friendship: 4, romanticBond: 2, reason: 'affirmed that people should not give up on each other' }),
        loyalty_has_limits: Object.freeze({ friendship: 5, romanticBond: 2, reason: 'invited Wren to challenge the player when they are wrong' }),
        look_after_our_own: Object.freeze({ friendship: 2, romanticBond: 1, attraction: 1, reason: 'defined the pair as people who protect their own' }),
        you_do_not_owe_me: Object.freeze({ friendship: 7, romanticBond: 5, reason: 'made Wren’s loyalty a free choice rather than an obligation' }),
        truth_even_when_it_hurts: Object.freeze({ friendship: 4, romanticBond: 2, reason: 'valued truth even when it hurts' }),
        hurt_ours_no_second_chance: Object.freeze({ friendship: 1, attraction: 1, reason: 'shared Wren’s protective anger' }),
        do_not_become_them: Object.freeze({ friendship: 5, romanticBond: 3, reason: 'urged Wren not to let cruelty define her' }),
        power_keeps_us_safe: Object.freeze({ friendship: 1, attraction: 2, reason: 'made a forceful case for power as protection' }),
    });

    const clamp = value => Math.max(MIN, Math.min(MAX, Math.round(Number(value) || 0)));
    const party = () => Array.isArray(window.party) ? window.party : [];
    const protagonist = () => party()[0] || null;

    function canonicalCompanion(entityOrName) {
        const name = typeof entityOrName === 'string' ? entityOrName : entityOrName?.name;
        if (!name) return null;
        return party().find((member, index) => index > 0 && member?.name === name) || null;
    }

    function profileFor(entityOrName) {
        const name = typeof entityOrName === 'string' ? entityOrName : entityOrName?.name;
        return PROFILES[name] || null;
    }

    // Presentation is intentionally separate from identity/pronouns. Today the
    // game mostly has male/female character art, so gender is the compatibility
    // fallback. Future character creation can set bodyPresentation explicitly
    // without changing any companion orientation data.
    function presentationFor(entity = protagonist()) {
        const explicit = String(entity?.bodyPresentation || entity?.presentation || '').toLowerCase();
        if (['masculine', 'feminine', 'androgynous'].includes(explicit)) return explicit;
        const body = String(entity?.bodyType || entity?.gender || '').toLowerCase();
        if (body === 'male' || body === 'masculine') return 'masculine';
        if (body === 'female' || body === 'feminine') return 'feminine';
        return 'unknown';
    }

    function identityFor(entity = protagonist()) {
        // Pronouns are deliberately not consulted here. If a future companion
        // has a romantic (rather than physical) gender preference, this gives
        // that profile a clean identity hook without inferring identity from
        // pronouns or body art.
        return entity?.genderIdentity || entity?.gender || null;
    }

    function compatibilityFor(companionOrName, player = protagonist()) {
        const profile = profileFor(companionOrName);
        const presentation = presentationFor(player);
        if (!profile) {
            return {
                orientationLabel: 'unspecified', presentation, genderIdentity: identityFor(player),
                attractionCap: 100, romanticCap: 100,
                physicalInterestThreshold: 50, physicalIntimacyThreshold: 60,
            };
        }
        return {
            orientationLabel: profile.orientationLabel,
            presentation,
            genderIdentity: identityFor(player),
            attractionCap: clamp(profile.attractionCaps?.[presentation] ?? profile.attractionCaps?.unknown ?? 100),
            romanticCap: clamp(profile.romanticCaps?.[presentation] ?? profile.romanticCaps?.unknown ?? 100),
            physicalInterestThreshold: Number(profile.physicalInterestThreshold ?? 50),
            physicalIntimacyThreshold: Number(profile.physicalIntimacyThreshold ?? 60),
        };
    }

    function ensureAffinity(companionOrName) {
        const companion = canonicalCompanion(companionOrName);
        if (!companion) return null;
        const profile = profileFor(companion);
        const compatibility = compatibilityFor(companion);
        const existing = companion.playerAffinity || {};
        const initialAttraction = Math.min(
            compatibility.attractionCap,
            Math.round(compatibility.attractionCap * Number(profile?.initialAttractionFraction ?? 0.12))
        );
        companion.playerAffinity = {
            friendship: clamp(existing.friendship ?? profile?.friendshipStart ?? 10),
            romanticBond: Math.min(compatibility.romanticCap, clamp(existing.romanticBond ?? profile?.romanticBondStart ?? 0)),
            attraction: Math.min(compatibility.attractionCap, clamp(existing.attraction ?? initialAttraction)),
            romanceState: existing.romanceState || 'unspoken',
            physicalBoundary: existing.physicalBoundary || 'unspoken',
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            skillMilestoneKeys: Array.isArray(existing.skillMilestoneKeys) ? existing.skillMilestoneKeys : [],
            history: Array.isArray(existing.history) ? existing.history : [],
        };
        return companion.playerAffinity;
    }

    function relationshipFor(companion) {
        return typeof window.getCompanionRelationship === 'function'
            ? window.getCompanionRelationship(companion)
            : { familiarity: 0, trust: 0, approval: 50 };
    }

    function positiveScale(kind, companion, affinity) {
        const rel = relationshipFor(companion) || {};
        const familiarity = Number(rel.familiarity || 0);
        const trust = Number(rel.trust || 0);
        if (kind === 'friendship') return Math.min(1.2, 0.55 + familiarity / 250 + trust / 400);
        if (kind === 'romanticBond') return Math.min(1.25, 0.35 + familiarity / 220 + trust / 220 + Number(affinity.friendship || 0) / 300);
        if (kind === 'attraction') return Math.min(1.1, 0.55 + familiarity / 300 + Number(affinity.friendship || 0) / 400);
        return 1;
    }

    function scaled(delta, scale) {
        const n = Number(delta || 0);
        if (!n || n < 0) return Math.round(n);
        const out = Math.round(n * scale);
        return out === 0 ? 1 : out;
    }

    function snapshot(companionOrName) {
        const companion = canonicalCompanion(companionOrName);
        const affinity = ensureAffinity(companion);
        if (!companion || !affinity) return null;
        const compatibility = compatibilityFor(companion);
        return {
            friendship: affinity.friendship,
            romanticBond: affinity.romanticBond,
            attraction: affinity.attraction,
            romanceState: affinity.romanceState,
            physicalBoundary: affinity.physicalBoundary,
            orientationLabel: compatibility.orientationLabel,
            presentation: compatibility.presentation,
            genderIdentity: compatibility.genderIdentity,
            attractionCap: compatibility.attractionCap,
            romanticCap: compatibility.romanticCap,
            physicalInterestThreshold: compatibility.physicalInterestThreshold,
            physicalIntimacyThreshold: compatibility.physicalIntimacyThreshold,
            canDevelopPhysicalInterest: compatibility.attractionCap >= compatibility.physicalInterestThreshold,
            canDevelopPhysicalIntimacy: compatibility.attractionCap >= compatibility.physicalIntimacyThreshold,
        };
    }

    function adjustAffinity(companionOrName, deltas = {}, reason = null, eventKey = null) {
        const companion = canonicalCompanion(companionOrName);
        const affinity = ensureAffinity(companion);
        if (!companion || !affinity) return null;
        const key = eventKey ? String(eventKey) : null;
        if (key && affinity.knownEventKeys.includes(key)) return snapshot(companion);
        if (key) {
            affinity.knownEventKeys.push(key);
            if (affinity.knownEventKeys.length > 160) affinity.knownEventKeys.splice(0, affinity.knownEventKeys.length - 160);
        }

        const compatibility = compatibilityFor(companion);
        for (const kind of ['friendship', 'romanticBond', 'attraction']) {
            if (deltas[kind] === undefined) continue;
            const delta = scaled(deltas[kind], positiveScale(kind, companion, affinity));
            const cap = kind === 'romanticBond' ? compatibility.romanticCap
                : kind === 'attraction' ? compatibility.attractionCap : MAX;
            affinity[kind] = Math.max(MIN, Math.min(cap, clamp(Number(affinity[kind] || 0) + delta)));
        }

        affinity.history.push({
            key,
            reason: reason || key || 'affinity change',
            worldSeconds: Number(window.worldSeconds || 0),
            friendship: affinity.friendship,
            romanticBond: affinity.romanticBond,
            attraction: affinity.attraction,
        });
        if (affinity.history.length > 100) affinity.history.splice(0, affinity.history.length - 100);
        return snapshot(companion);
    }

    function setRomanceState(companionOrName, state, reason = null) {
        const companion = canonicalCompanion(companionOrName);
        const affinity = ensureAffinity(companion);
        if (!affinity) return null;
        affinity.romanceState = String(state || 'unspoken');
        affinity.history.push({
            key: `romance_state:${affinity.romanceState}`,
            reason: reason || `romance state: ${affinity.romanceState}`,
            worldSeconds: Number(window.worldSeconds || 0),
            friendship: affinity.friendship,
            romanticBond: affinity.romanticBond,
            attraction: affinity.attraction,
        });
        return snapshot(companion);
    }

    function romanceReadiness(companionOrName) {
        const companion = canonicalCompanion(companionOrName);
        const state = snapshot(companion);
        const rel = companion ? relationshipFor(companion) : null;
        if (!state || !rel) return null;
        const emotionallyClose = state.friendship >= 50 && rel.familiarity >= 45 && rel.trust >= 35;
        const romanticFeelings = state.romanticBond >= 25;
        const physicallyInterested = state.attraction >= state.physicalInterestThreshold;
        return {
            ...state,
            emotionallyClose,
            romanticFeelings,
            physicallyInterested,
            physicalPathPossible: state.canDevelopPhysicalInterest,
            // Emotional romance can be possible even where physical desire is
            // orientation-limited. Explicit consent/status still matters; this
            // is only availability data, never permission inferred from meters.
            romanticConversationPossible: emotionallyClose && state.romanticCap >= 25,
        };
    }

    function syncWrenStoryAffinity() {
        const companion = canonicalCompanion('Wren Talbot');
        if (!companion) return;
        ensureAffinity(companion);
        const dispositionKeys = companion.playerRelationship?.knownDispositionEventKeys || [];
        dispositionKeys.forEach(key => {
            const spec = WREN_STORY_AFFINITY[key];
            if (spec) adjustAffinity(companion, spec, spec.reason, `story:${key}`);
        });

        const dialogueKeys = companion.characterArc?.dialogueChoiceKeys || [];
        dialogueKeys.forEach(key => {
            const spec = WREN_DIALOGUE_AFFINITY[key];
            if (spec) adjustAffinity(companion, spec, spec.reason, `dialogue:${key}`);
        });
    }

    function treeRank(player, treeName) {
        if (!player?.skills || !window.skills) return 0;
        return Object.entries(player.skills).reduce((total, [id, rank]) => {
            return total + (window.skills[id]?.tree === treeName ? Number(rank || 0) : 0);
        }, 0);
    }

    function syncSkillAttraction(companionOrName = 'Wren Talbot') {
        const companion = canonicalCompanion(companionOrName);
        const player = protagonist();
        const affinity = ensureAffinity(companion);
        const profile = profileFor(companion);
        if (!companion || !player || !affinity || !profile) return;

        // A few broad competence milestones, rather than +attraction every time
        // a point is clicked. This keeps build preference as flavour instead of
        // turning optimal romance into a character-build puzzle.
        Object.entries(profile.skillTreeAttraction || {}).forEach(([tree, amount]) => {
            const rank = treeRank(player, tree);
            [3, 6, 10].forEach(threshold => {
                const key = `tree:${tree}:${threshold}`;
                if (rank < threshold || affinity.skillMilestoneKeys.includes(key)) return;
                affinity.skillMilestoneKeys.push(key);
                adjustAffinity(companion, { attraction: amount }, `noticed ${tree} competence`, `skill:${key}`);
            });
        });
        Object.entries(profile.skillAttraction || {}).forEach(([skillId, amount]) => {
            const rank = Number(player.skills?.[skillId] || 0);
            if (rank <= 0) return;
            const key = `skill:${skillId}`;
            if (affinity.skillMilestoneKeys.includes(key)) return;
            affinity.skillMilestoneKeys.push(key);
            adjustAffinity(companion, { attraction: amount }, `noticed ${skillId.replaceAll('_', ' ')} competence`, `skill:${key}`);
        });
    }

    function ensureAll() {
        party().slice(1).forEach(member => ensureAffinity(member));
        syncWrenStoryAffinity();
        syncSkillAttraction('Wren Talbot');
    }

    window.companionAffinity = {
        build: BUILD,
        profiles: PROFILES,
        profileFor,
        presentationFor,
        identityFor,
        compatibilityFor,
        ensureAffinity,
        getAffinity: snapshot,
        adjustAffinity,
        setRomanceState,
        romanceReadiness,
        syncWrenStoryAffinity,
        syncSkillAttraction,
        refresh: ensureAll,
    };
    window.getCompanionAffinity = snapshot;
    window.adjustCompanionAffinity = adjustAffinity;
    window.getCompanionRomanceReadiness = romanceReadiness;

    ensureAll();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureAll, { once: true });
    setInterval(ensureAll, 1000);
    window.COMPANION_AFFINITY_BUILD = BUILD;
})();
