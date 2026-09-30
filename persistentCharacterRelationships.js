// persistentCharacterRelationships.js
// Relationship depth for important non-companion characters.
//
// Recruitability is deliberately separate from character depth. A companion
// gets party/combat/inventory behaviour in addition to relationship state; a
// persistent character can be just as socially nuanced without ever joining
// the party.
//
// Existing NPC reputation remains authoritative for the broad "approval"
// question. npc.reputation.standing is -100..100, while this API exposes the
// same 0..100 approval scale used by companion-facing code. The deeper axes
// below are stored separately and persist even when an NPC is not currently
// spawned in window.entities.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-persistent-character-relationships-v1';
    const MIN = 0;
    const MAX = 100;
    const HISTORY_LIMIT = 40;

    // affinityMode is an authoring-depth marker, not an orientation label.
    // "full" means Friendship/Romantic Bond/Attraction are currently live
    // authored dimensions. "friendship" intentionally leaves the romance and
    // attraction fields dormant at zero until/if we decide that character
    // merits deeper treatment later. Changing a profile from friendship->full
    // therefore needs no save migration or new data shape.
    const PROFILES = Object.freeze({
        'Queen Seraphine Corrin': Object.freeze({
            id: 'seraphine_corrin', title: 'Queen of the Silverhart Kingdom',
            race: 'human', gender: 'female', home: 'Silverhart', factionId: 'silverhart_kingdom',
            role: 'sovereign', affinityMode: 'full',
            familiarityStart: 5, trustStart: 10, friendshipStart: 0,
        }),
        "Queen Aelwen Sil'thandriel": Object.freeze({
            id: 'aelwen_silthandriel', title: 'Queen of the Silver Leaf',
            race: 'elf', gender: 'female', home: "Sil'thandriel", factionId: 'elven_realm',
            role: 'sovereign', affinityMode: 'friendship',
            familiarityStart: 2, trustStart: 5, friendshipStart: 0,
        }),
        'King Balrik Deepholm': Object.freeze({
            id: 'balrik_deepholm', title: 'King Under the Mountain',
            race: 'dwarf', gender: 'male', home: 'Kragmoor', factionId: 'dwarven_kingdom',
            role: 'sovereign', affinityMode: 'friendship',
            familiarityStart: 2, trustStart: 5, friendshipStart: 0,
        }),
        'Court Wizard Thessaly': Object.freeze({
            id: 'court_wizard_thessaly', title: "The Queen's Court Wizard",
            race: 'elf', gender: 'female', home: 'Silverhart', factionId: 'silverhart_kingdom',
            role: 'court_wizard', affinityMode: 'friendship',
            familiarityStart: 4, trustStart: 6, friendshipStart: 0,
        }),
        'Elder Nessa Wren': Object.freeze({
            id: 'nessa_wren', title: 'Warden of the Emberwood Grove',
            race: 'elf', gender: 'female', home: 'Emberwood Grove', factionId: null,
            role: 'druid_elder', affinityMode: 'friendship',
            familiarityStart: 4, trustStart: 7, friendshipStart: 2,
        }),
        'Guildmaster Petra Voss': Object.freeze({
            id: 'petra_voss', title: 'Ironbond Factor',
            race: 'human', gender: 'female', home: 'Reddale', factionId: 'ironbond_company',
            role: 'merchant_factor', affinityMode: 'friendship',
            familiarityStart: 4, trustStart: 4, friendshipStart: 0,
        }),
        'High Cleric Adelram': Object.freeze({
            id: 'adelram', title: 'High Cleric of the Grand Cathedral',
            race: 'human', gender: 'male', home: 'Silverhart', factionId: 'silverhart_kingdom',
            role: 'high_cleric', affinityMode: 'friendship',
            familiarityStart: 3, trustStart: 7, friendshipStart: 0,
        }),
        'Thrain Emberhand': Object.freeze({
            id: 'thrain_emberhand', title: 'Master Runesmith',
            race: 'dwarf', gender: 'male', home: 'Kragmoor', factionId: 'dwarven_kingdom',
            role: 'master_runesmith', affinityMode: 'friendship',
            familiarityStart: 3, trustStart: 6, friendshipStart: 1,
        }),
        'Captain Ilsa Rennick': Object.freeze({
            id: 'ilsa_rennick', title: 'Captain of the Watch',
            race: 'human', gender: 'female', home: 'Reddale', factionId: 'silverhart_kingdom',
            role: 'watch_captain', affinityMode: 'friendship',
            familiarityStart: 4, trustStart: 8, friendshipStart: 1,
        }),
    });

    const clamp = value => Math.max(MIN, Math.min(MAX, Math.round(Number(value) || 0)));
    const standingToApproval = standing => clamp((Number(standing || 0) + 100) / 2);
    const approvalToStanding = approval => Math.max(-100, Math.min(100, clamp(approval) * 2 - 100));

    function nameFor(entityOrName) {
        return typeof entityOrName === 'string' ? entityOrName : entityOrName?.name;
    }

    function profileFor(entityOrName) {
        return PROFILES[nameFor(entityOrName)] || null;
    }

    function stateStore() {
        if (!root.persistentCharacterRelationshipState || typeof root.persistentCharacterRelationshipState !== 'object') {
            root.persistentCharacterRelationshipState = {};
        }
        return root.persistentCharacterRelationshipState;
    }

    function findEntity(entityOrName) {
        if (entityOrName && typeof entityOrName === 'object') return entityOrName;
        const name = nameFor(entityOrName);
        if (!name) return null;
        const candidates = [
            ...(Array.isArray(root.entities) ? root.entities : []),
            ...(Array.isArray(root.party) ? root.party : []),
        ];
        return candidates.find(entity => entity?.name === name) || null;
    }

    function seedFor(profile) {
        return {
            approval: null,
            pendingApproval: false,
            familiarity: clamp(profile?.familiarityStart ?? 0),
            trust: clamp(profile?.trustStart ?? 0),
            friendship: clamp(profile?.friendshipStart ?? 0),
            romanticBond: 0,
            attraction: 0,
            knownConversationKeys: [],
            knownEventKeys: [],
            history: [],
        };
    }

    function normaliseState(state, profile) {
        state = state && typeof state === 'object' ? state : seedFor(profile);
        if (state.approval !== null && state.approval !== undefined) state.approval = clamp(state.approval);
        else state.approval = null;
        state.pendingApproval = !!state.pendingApproval;
        state.familiarity = clamp(state.familiarity ?? profile?.familiarityStart ?? 0);
        state.trust = clamp(state.trust ?? profile?.trustStart ?? 0);
        state.friendship = clamp(state.friendship ?? profile?.friendshipStart ?? 0);
        state.romanticBond = clamp(state.romanticBond ?? 0);
        state.attraction = clamp(state.attraction ?? 0);
        if (!Array.isArray(state.knownConversationKeys)) state.knownConversationKeys = [];
        if (!Array.isArray(state.knownEventKeys)) state.knownEventKeys = [];
        if (!Array.isArray(state.history)) state.history = [];
        return state;
    }

    function syncApproval(state, entity) {
        if (!state) return;
        const reputation = entity?.reputation;
        if (!reputation || reputation.standing === undefined) return;
        if (state.pendingApproval && state.approval !== null) {
            reputation.standing = approvalToStanding(state.approval);
            state.pendingApproval = false;
        } else {
            state.approval = standingToApproval(reputation.standing);
        }
    }

    function ensure(entityOrName) {
        const name = nameFor(entityOrName);
        const profile = profileFor(name);
        if (!name || !profile) return null;
        const store = stateStore();
        store[name] = normaliseState(store[name], profile);
        syncApproval(store[name], findEntity(entityOrName));
        return store[name];
    }

    function snapshot(entityOrName) {
        const name = nameFor(entityOrName);
        const profile = profileFor(name);
        const state = ensure(entityOrName);
        if (!profile || !state) return null;
        return {
            name,
            profileId: profile.id,
            affinityMode: profile.affinityMode,
            approval: state.approval ?? 50,
            familiarity: state.familiarity,
            trust: state.trust,
            friendship: state.friendship,
            romanticBond: state.romanticBond,
            attraction: state.attraction,
        };
    }

    function dimensionAllowed(profile, key) {
        if (key === 'romanticBond' || key === 'attraction') return profile?.affinityMode === 'full';
        return ['approval', 'familiarity', 'trust', 'friendship'].includes(key);
    }

    function appendHistory(state, entry) {
        state.history.push(entry);
        if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
    }

    function setApproval(state, entity, value) {
        state.approval = clamp(value);
        if (entity?.reputation && entity.reputation.standing !== undefined) {
            entity.reputation.standing = approvalToStanding(state.approval);
            state.pendingApproval = false;
        } else {
            state.pendingApproval = true;
        }
    }

    function setRelationship(entityOrName, patch = {}, reason = 'authored persistent-character change') {
        const name = nameFor(entityOrName);
        const profile = profileFor(name);
        const state = ensure(entityOrName);
        if (!profile || !state) return null;
        const before = snapshot(entityOrName);
        const entity = findEntity(entityOrName);
        for (const key of ['approval', 'familiarity', 'trust', 'friendship', 'romanticBond', 'attraction']) {
            if (patch[key] === undefined || !dimensionAllowed(profile, key)) continue;
            if (key === 'approval') setApproval(state, entity, patch[key]);
            else state[key] = clamp(patch[key]);
        }
        const after = snapshot(entityOrName);
        if (reason && JSON.stringify(before) !== JSON.stringify(after)) appendHistory(state, { reason: String(reason), ...after });
        return after;
    }

    function adjustRelationship(entityOrName, delta = {}, reason = 'authored persistent-character change') {
        const current = snapshot(entityOrName);
        if (!current) return null;
        const patch = {};
        for (const key of ['approval', 'familiarity', 'trust', 'friendship', 'romanticBond', 'attraction']) {
            if (delta[key] === undefined) continue;
            patch[key] = Number(current[key] || 0) + Number(delta[key] || 0);
        }
        return setRelationship(entityOrName, patch, reason);
    }

    function noteConversation(entityOrName, key, delta = { familiarity: 1 }) {
        const state = ensure(entityOrName);
        if (!state || !key) return snapshot(entityOrName);
        const stableKey = String(key);
        if (state.knownConversationKeys.includes(stableKey)) return snapshot(entityOrName);
        state.knownConversationKeys.push(stableKey);
        if (state.knownConversationKeys.length > 100) state.knownConversationKeys.splice(0, state.knownConversationKeys.length - 100);
        return adjustRelationship(entityOrName, delta, `conversation:${stableKey}`);
    }

    function recordEvent(entityOrName, key, delta = {}) {
        const state = ensure(entityOrName);
        if (!state || !key) return snapshot(entityOrName);
        const stableKey = String(key);
        if (state.knownEventKeys.includes(stableKey)) return snapshot(entityOrName);
        state.knownEventKeys.push(stableKey);
        if (state.knownEventKeys.length > 120) state.knownEventKeys.splice(0, state.knownEventKeys.length - 120);
        return adjustRelationship(entityOrName, delta, `event:${stableKey}`);
    }

    function isPersistentCharacter(entityOrName) {
        return !!profileFor(entityOrName);
    }

    function roster() {
        return Object.entries(PROFILES).map(([name, profile]) => ({ name, ...profile }));
    }

    const api = {
        build: BUILD,
        profiles: PROFILES,
        profileFor,
        roster,
        isPersistentCharacter,
        ensure,
        getRelationship: snapshot,
        setRelationship,
        adjustRelationship,
        noteConversation,
        recordEvent,
        standingToApproval,
        approvalToStanding,
    };

    root.persistentCharacterRelationships = api;
    root.getPersistentCharacterProfile = profileFor;
    root.getPersistentCharacterRelationship = snapshot;
    root.setPersistentCharacterRelationship = setRelationship;
    root.adjustPersistentCharacterRelationship = adjustRelationship;
    root.notePersistentCharacterConversation = noteConversation;
    root.recordPersistentCharacterEvent = recordEvent;
    root.PERSISTENT_CHARACTER_RELATIONSHIPS_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
