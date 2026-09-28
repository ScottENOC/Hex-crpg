// ambientChatterContext.js
// Context layer for ambient NPC-to-NPC chatter. Keeps background speech
// physically plausible (no conversations through walls), lets authored
// incidents silence smalltalk before combat actually starts, and gives fresh
// local events a short aftermath window before weather/daily-life chatter
// resumes.
(() => {
    'use strict';

    const INSTALL_RETRY_MS = 250;
    const INCIDENT_POLL_MS = 250;
    const DEFAULT_POST_SILENCE_SECONDS = 6;
    const DEFAULT_AFTERMATH_SECONDS = 10 * 60;
    const DEFAULT_AFTERMATH_MENTIONS = 4;
    const HOLLOWMERE_INCIDENT_ID = 'hollowmere_shakedown';
    const FRESH_TOPIC_PREFIX = 'fresh-incident:';

    const activeIncidents = new Map();
    const recentIncidents = new Map();
    let installed = false;
    let originalCheck = null;
    let hollowmereWasFired = !!window.hollowmereEventFired;

    function nowSeconds() {
        return Number(window.worldSeconds || window.worldTimeSeconds || 0);
    }

    function leader() {
        return (window.entities || []).find(e => e?.alive && e.side === 'player' && !e.rider) || window.player || null;
    }

    function settlementForPlayer() {
        const player = leader();
        if (!player?.hex) return null;
        return window.AmbientChatterV2?.settlementForHex?.(player.hex) || null;
    }

    function canPlayerHearNpc(npc) {
        if (!npc?.hex) return false;
        // Reuse the game's party-aware LOS/visibility calculation. For normal
        // conversational speech, a wall that blocks sight also blocks hearing.
        if (typeof window.isVisibleToPlayer === 'function') {
            return !!window.isVisibleToPlayer(npc.hex);
        }

        const party = (window.entities || []).filter(e => e?.alive && e.side === 'player' && e.hex);
        if (typeof window.hasLineOfSight === 'function') {
            return party.some(p => window.hasLineOfSight(p.hex, npc.hex));
        }
        return party.some(p => (window.distance?.(p.hex, npc.hex) ?? Infinity) <= 8);
    }

    function affectsCurrentPlayer(incident) {
        if (!incident) return false;
        return !incident.settlement || settlementForPlayer() === incident.settlement;
    }

    function beginIncident(id, options = {}) {
        if (!id) return null;
        const incident = {
            id,
            settlement: options.settlement || null,
            startedAt: nowSeconds(),
            meta: options.meta || null,
        };
        recentIncidents.delete(id);
        activeIncidents.set(id, incident);
        window.ambientChatterAccum = 0;
        return incident;
    }

    function endIncident(id, options = {}) {
        const active = activeIncidents.get(id);
        activeIncidents.delete(id);
        if (!active && options.requireActive) return null;

        const endedAt = nowSeconds();
        const incident = {
            id,
            settlement: options.settlement || active?.settlement || null,
            variant: options.variant || 'default',
            endedAt,
            aftermathReadyAt: endedAt + (options.postSilenceSeconds ?? DEFAULT_POST_SILENCE_SECONDS),
            expiresAt: endedAt + (options.aftermathSeconds ?? DEFAULT_AFTERMATH_SECONDS),
            mentionsLeft: options.mentions ?? DEFAULT_AFTERMATH_MENTIONS,
            usedTopics: new Set(),
            meta: options.meta || active?.meta || null,
        };
        recentIncidents.set(id, incident);
        window.ambientChatterAccum = 0;
        return incident;
    }

    function clearIncident(id) {
        activeIncidents.delete(id);
        recentIncidents.delete(id);
    }

    function pruneRecent() {
        const now = nowSeconds();
        for (const [id, incident] of recentIncidents) {
            if (incident.mentionsLeft <= 0 || now > incident.expiresAt) recentIncidents.delete(id);
        }
    }

    function freshIncidentForPlayer() {
        pruneRecent();
        const now = nowSeconds();
        return [...recentIncidents.values()].find(incident =>
            incident.mentionsLeft > 0
            && now >= incident.aftermathReadyAt
            && now <= incident.expiresAt
            && affectsCurrentPlayer(incident)
        ) || null;
    }

    function shouldSuppress() {
        if (window.isInCombat) return true;
        if ([...activeIncidents.values()].some(affectsCurrentPlayer)) return true;
        const now = nowSeconds();
        return [...recentIncidents.values()].some(incident =>
            affectsCurrentPlayer(incident) && now < incident.aftermathReadyAt
        );
    }

    function freshTopicId(variant, index) {
        return `${FRESH_TOPIC_PREFIX}${HOLLOWMERE_INCIDENT_ID}:${variant}:${index}`;
    }

    const HOLLOWMERE_FIGHT_AFTERMATH = [
        ["I was under a table when the steel came out.", "Best seat in the house, as it turned out."],
        ["Three Ironbond men walked in expecting coin.", "Aye. They did not expect the room to choose a side."],
        ["Garrick's still finding broken cups.", "Better cups than more graves. Though we got those too."],
        ["Think Ironbond lets what happened here go?", "Not a chance. That's the part nobody's saying loudly."],
    ];

    const HOLLOWMERE_PEACE_AFTERMATH = [
        ["Whole room went quiet when Ironbond named the price.", "And quieter when Garrick paid it."],
        ["No blood, at least.", "No. Just coin, pride, and everyone remembering who owns the road."],
        ["I thought somebody was going to swing.", "So did I. Never been so relieved to hear a purse hit a bar."],
        ["Dray walked out smiling.", "That was the part I liked least."],
    ];

    function registerAftermathExchanges() {
        const exchanges = window.AmbientChatterV2?.exchanges || window.ambientChatterExchanges;
        if (!Array.isArray(exchanges)) return false;
        if (exchanges.some(ex => String(ex.id || '').startsWith('ambient_context_hollowmere_'))) return true;

        const addVariant = (variant, linesList) => {
            linesList.forEach((lines, index) => {
                const topic = freshTopicId(variant, index);
                exchanges.push({
                    id: `ambient_context_hollowmere_${variant}_${index + 1}`,
                    topic,
                    lines,
                    priority: 1000,
                    settlements: ['hollowmere'],
                    condition: () => {
                        const incident = recentIncidents.get(HOLLOWMERE_INCIDENT_ID);
                        return !!incident
                            && incident.variant === variant
                            && incident.mentionsLeft > 0
                            && nowSeconds() >= incident.aftermathReadyAt
                            && nowSeconds() <= incident.expiresAt;
                    },
                });
            });
        };
        addVariant('fight', HOLLOWMERE_FIGHT_AFTERMATH);
        addVariant('peace', HOLLOWMERE_PEACE_AFTERMATH);
        return true;
    }

    function freshTopicsFor(incident) {
        if (!incident) return [];
        const exchanges = window.AmbientChatterV2?.exchanges || [];
        const prefix = `${FRESH_TOPIC_PREFIX}${incident.id}:${incident.variant}:`;
        return exchanges.filter(ex => String(ex.topic || '').startsWith(prefix)).map(ex => ex.topic);
    }

    function runContextAwareCheck(delta) {
        syncHollowmereIncident();
        if (shouldSuppress()) {
            window.ambientChatterAccum = 0;
            return;
        }
        if (typeof originalCheck !== 'function') return;

        // Keep the existing pairing/personality/cooldown engine, but make its
        // dormant-NPC gate also reject NPCs whose speech the party cannot hear.
        const priorDormant = window.isDormantAmbientNpc;
        window.isDormantAmbientNpc = (npc, partyHexes) => {
            if (priorDormant && priorDormant(npc, partyHexes)) return true;
            return !canPlayerHearNpc(npc);
        };

        const fresh = freshIncidentForPlayer();
        const priorTopics = window.ambientChatterRecentTopics;
        const lastBefore = window.lastAmbientChatter;
        try {
            if (fresh) {
                const freshTopics = new Set(freshTopicsFor(fresh));
                const allExchanges = window.AmbientChatterV2?.exchanges || [];
                const ordinaryTopics = allExchanges
                    .map(ex => ex.topic)
                    .filter(topic => topic && !freshTopics.has(topic));
                // The stock selector normally avoids repeating topics. During
                // a fresh incident, temporarily make ordinary smalltalk count
                // as "recent" so unused aftermath beats win first.
                window.ambientChatterRecentTopics = [
                    ...new Set([...ordinaryTopics, ...fresh.usedTopics]),
                ];
            }
            originalCheck(delta);
        } finally {
            if (fresh && window.lastAmbientChatter !== lastBefore) {
                const topic = window.lastAmbientChatter?.topic;
                const validTopics = new Set(freshTopicsFor(fresh));
                if (validTopics.has(topic) && !fresh.usedTopics.has(topic)) {
                    fresh.usedTopics.add(topic);
                    fresh.mentionsLeft = Math.max(0, fresh.mentionsLeft - 1);
                }
            }
            if (priorDormant) window.isDormantAmbientNpc = priorDormant;
            else delete window.isDormantAmbientNpc;
            window.ambientChatterRecentTopics = priorTopics;
            pruneRecent();
        }
    }

    function syncHollowmereIncident() {
        const fired = !!window.hollowmereEventFired;
        if (!hollowmereWasFired && fired) {
            beginIncident(HOLLOWMERE_INCIDENT_ID, { settlement: 'hollowmere' });
        }
        hollowmereWasFired = fired;

        const active = activeIncidents.get(HOLLOWMERE_INCIDENT_ID);
        if (!active) return;

        if (window.hollowmereFightTriggered) {
            if (window.hollowmereVictoryBonusGiven) {
                endIncident(HOLLOWMERE_INCIDENT_ID, {
                    variant: 'fight', settlement: 'hollowmere',
                    postSilenceSeconds: 8, aftermathSeconds: 10 * 60, mentions: 4,
                });
            }
            return;
        }

        // Both non-violent branches send Dray and the enforcers outside, so
        // this is a clean marker that the confrontation itself has ended.
        if (window.hollowmereSoldiersWaitingOutside) {
            endIncident(HOLLOWMERE_INCIDENT_ID, {
                variant: 'peace', settlement: 'hollowmere',
                postSilenceSeconds: 6, aftermathSeconds: 10 * 60, mentions: 4,
            });
        }
    }

    function install() {
        if (installed) return true;
        if (!window.AmbientChatterV2 || typeof window.checkAmbientNpcChatter !== 'function') return false;
        originalCheck = window.checkAmbientNpcChatter;
        registerAftermathExchanges();
        window.checkAmbientNpcChatter = runContextAwareCheck;
        installed = true;
        return true;
    }

    function resetForTests() {
        activeIncidents.clear();
        recentIncidents.clear();
        hollowmereWasFired = !!window.hollowmereEventFired;
        window.ambientChatterAccum = 0;
    }

    window.AmbientChatterContext = {
        install,
        beginIncident,
        endIncident,
        clearIncident,
        canPlayerHearNpc,
        shouldSuppress,
        freshIncidentForPlayer,
        syncHollowmereIncident,
        resetForTests,
        get installed() { return installed; },
        get activeIncidentIds() { return [...activeIncidents.keys()]; },
        get recentIncidentIds() { return [...recentIncidents.keys()]; },
        constants: {
            HOLLOWMERE_INCIDENT_ID,
            DEFAULT_POST_SILENCE_SECONDS,
            DEFAULT_AFTERMATH_SECONDS,
            DEFAULT_AFTERMATH_MENTIONS,
        },
    };

    const installTimer = setInterval(() => {
        if (install()) clearInterval(installTimer);
    }, INSTALL_RETRY_MS);
    install();
    setInterval(syncHollowmereIncident, INCIDENT_POLL_MS);
})();
