// npcSocialFacing.js
// Makes stationary settlement NPCs look less like a formation. Movement remains
// authoritative in facingSystem.js; this layer only seeds varied idle facings
// and turns an ambient-chatter pair toward one another when their exchange starts.
(() => {
    'use strict';

    const FACINGS = ['up', 'right', 'down', 'left'];
    const PULSE_MS = 350;
    let lastConversationSignature = null;

    function hash(text) {
        let h = 2166136261;
        text = String(text || 'npc');
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function facingFromHexDelta(dq, dr) {
        if (!dq && !dr) return null;
        const dx = 1.5 * dq;
        const dy = Math.sqrt(3) * (dr + dq / 2);
        if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
        return dy >= 0 ? 'down' : 'up';
    }

    function faceToward(entity, other) {
        if (!entity?.hex || !other?.hex) return false;
        const facing = facingFromHexDelta(other.hex.q - entity.hex.q, other.hex.r - entity.hex.r);
        if (!facing) return false;
        entity.facing = facing;
        return true;
    }

    function giveInitialFacing(entity) {
        if (!entity?.alive || entity.side !== 'neutral' || !entity.isNPC || entity.rider) return false;
        if (entity.__socialInitialFacingApplied) return false;
        entity.__socialInitialFacingApplied = true;
        if (!entity.destination) {
            const seed = entity.generatedCivilianSeed || entity.id || `${entity.name}|${entity.hex?.q},${entity.hex?.r}`;
            entity.facing = FACINGS[hash(seed) % FACINGS.length];
        }
        return true;
    }

    function conversationSignature(convo) {
        if (!convo?.pair || convo.pair.length < 2) return null;
        return `${convo.exchangeId || ''}|${convo.pair[0]}|${convo.pair[1]}|${Number(window.worldSeconds || 0)}`;
    }

    function applyLatestConversationFacing() {
        const convo = window.lastAmbientChatter;
        if (!convo?.pair || convo.pair.length < 2) return false;
        const marker = convo;
        if (marker === window.__lastSocialFacingConversation) return false;
        window.__lastSocialFacingConversation = marker;
        const entities = window.entities || [];
        const a = entities.find(e => e?.alive && e.name === convo.pair[0]);
        const b = entities.find(e => e?.alive && e.name === convo.pair[1] && e !== a);
        if (!a || !b) return false;
        faceToward(a, b);
        faceToward(b, a);
        lastConversationSignature = conversationSignature(convo);
        return true;
    }

    function pulse() {
        for (const entity of window.entities || []) giveInitialFacing(entity);
        applyLatestConversationFacing();
    }

    window.NPCSocialFacing = {
        pulse,
        faceToward,
        giveInitialFacing,
        facingFromHexDelta,
        get lastConversationSignature() { return lastConversationSignature; },
        FACINGS: [...FACINGS],
    };

    window.__npcSocialFacingTimer = setInterval(pulse, PULSE_MS);
    pulse();

    function loadOnce(datasetKey, src) {
        const selector = `script[data-${datasetKey.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}]`;
        if (document.querySelector(selector)) return;
        const script = document.createElement('script');
        script.src = `${src}?build=${encodeURIComponent(window.PRESENTATION_BUILD || 'npc-routines-v1')}`;
        script.dataset[datasetKey] = 'true';
        script.async = false;
        document.head.appendChild(script);
    }

    // Low-cost authored roadside sites, followed by sparse named travellers.
    // Dynamic scripts marked async=false execute in insertion order, so the
    // persistence adapter sees the traffic API once it arrives.
    loadOnce('roadsideWorldTextureV2', 'roadsideWorldTextureV2.js');
    loadOnce('persistentRoadTravellers', 'persistentRoadTravellers.js');
    loadOnce('roadTravellerPersistence', 'roadTravellerPersistence.js');
})();
