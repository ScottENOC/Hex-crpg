// companionConversationMemory.js
// Reusable authored-conversation memory for companions.
//
// The goal is not procedural dialogue generation. Authors register topics with
// explicit conditions, cooldowns, priorities and renderers. The system remembers
// what was discussed, selects only the most salient currently-relevant subjects,
// and stores that memory on the companion's existing playerRelationship object so
// normal party save/load persists it automatically.
(() => {
    'use strict';

    const BUILD = '20260930-companion-conversation-memory-v1';
    const DAY = 24 * 60 * 60;
    const DEFAULT_LIMIT = 4;
    const registry = new Map();

    const now = () => Number(window.worldSeconds || 0);
    const party = () => Array.isArray(window.party) ? window.party : [];
    const quest = id => (window.questLog || []).find(q => q?.id === id) || null;

    function canonicalCompanion(entityOrName) {
        const name = typeof entityOrName === 'string' ? entityOrName : entityOrName?.name;
        if (!name) return null;
        return party().find((member, index) => index > 0 && member?.name === name) || null;
    }

    function ensureMemory(entityOrName) {
        const companion = canonicalCompanion(entityOrName);
        if (!companion) return null;
        // This call also performs any relationship migration/seed logic.
        window.getCompanionRelationship?.(companion);
        companion.playerRelationship = companion.playerRelationship || { familiarity: 10, trust: 10, history: [], knownConversationKeys: [] };
        const existing = companion.playerRelationship.conversationMemory || {};
        companion.playerRelationship.conversationMemory = {
            version: 1,
            topics: existing.topics && typeof existing.topics === 'object' ? existing.topics : {},
            history: Array.isArray(existing.history) ? existing.history : [],
            lastMeaningful: existing.lastMeaningful || null,
        };
        return companion.playerRelationship.conversationMemory;
    }

    function topicState(companion, topicId) {
        const memory = ensureMemory(companion);
        if (!memory) return null;
        memory.topics[topicId] = memory.topics[topicId] || { uses: 0, lastAt: null, lastVariant: -1 };
        return memory.topics[topicId];
    }

    function contextFor(entityOrName) {
        const companion = canonicalCompanion(entityOrName);
        if (!companion) return null;
        const relationship = window.getCompanionRelationship?.(companion) || {};
        const affinity = window.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
        const romance = window.companionRomance?.interpretRelationship?.(companion) || null;
        return {
            companion,
            player: party()[0] || null,
            party: party(),
            partyNames: new Set(party().map(m => m?.name).filter(Boolean)),
            relationship,
            affinity,
            romance,
            worldSeconds: now(),
            quest,
            memory: ensureMemory(companion),
        };
    }

    function registerTopics(companionName, topics) {
        if (!companionName || !Array.isArray(topics)) return false;
        const current = registry.get(companionName) || new Map();
        for (const topic of topics) {
            if (!topic?.id || typeof topic.render !== 'function') continue;
            current.set(String(topic.id), { ...topic, id: String(topic.id) });
        }
        registry.set(companionName, current);
        return true;
    }

    function numberValue(value, ctx, state, fallback = 0) {
        try {
            const result = typeof value === 'function' ? value(ctx, state) : value;
            return Number.isFinite(Number(result)) ? Number(result) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function boolValue(value, ctx, state, fallback = true) {
        if (value === undefined) return fallback;
        try { return typeof value === 'function' ? !!value(ctx, state) : !!value; }
        catch (_) { return false; }
    }

    function isAvailable(topic, ctx, state) {
        if (!topic || !ctx || !state) return false;
        if (!boolValue(topic.condition, ctx, state, true)) return false;
        const maxUses = topic.maxUses == null ? Infinity : Math.max(0, Number(topic.maxUses));
        if (state.uses >= maxUses) return false;
        if (state.uses > 0 && state.lastAt != null) {
            const cooldown = numberValue(topic.cooldownSeconds, ctx, state,
                numberValue(topic.cooldownDays, ctx, state, 0) * DAY);
            if (cooldown > 0 && ctx.worldSeconds - Number(state.lastAt || 0) < cooldown) return false;
        }
        return true;
    }

    function salience(topic, ctx, state) {
        let score = numberValue(topic.priority, ctx, state, 20);
        if (state.uses === 0) score += 15;
        score -= Math.min(18, state.uses * 3);
        if (topic.reactive) score += 10;
        if (topic.milestone) score += 18;
        return score;
    }

    function availableTopics(entityOrName, limit = DEFAULT_LIMIT) {
        const ctx = contextFor(entityOrName);
        if (!ctx) return [];
        const topics = registry.get(ctx.companion.name);
        if (!topics) return [];
        const available = [];
        for (const topic of topics.values()) {
            const state = topicState(ctx.companion, topic.id);
            if (!isAvailable(topic, ctx, state)) continue;
            available.push({ topic, state, ctx, score: salience(topic, ctx, state) });
        }
        available.sort((a, b) => b.score - a.score || a.topic.id.localeCompare(b.topic.id));
        return available.slice(0, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    }

    function displayLabel(topic, ctx, state) {
        try {
            const label = typeof topic.label === 'function' ? topic.label(ctx, state) : topic.label;
            return String(label || 'Talk about something.');
        } catch (_) {
            return 'Talk about something.';
        }
    }

    function recordUse(companion, topic, state, rendered) {
        const memory = ensureMemory(companion);
        if (!memory) return;
        state.uses = Number(state.uses || 0) + 1;
        state.lastAt = now();
        state.lastVariant = Number(rendered?.variantIndex ?? state.lastVariant ?? -1);
        const entry = {
            topicId: topic.id,
            subject: String(rendered?.subject || topic.subject || topic.id),
            at: state.lastAt,
            use: state.uses,
        };
        memory.lastMeaningful = entry;
        memory.history.push(entry);
        if (memory.history.length > 40) memory.history.splice(0, memory.history.length - 40);
    }

    function defaultOptions(companion) {
        return [
            { label: 'Talk about something else.', action: () => openHub(companion) },
            { label: 'That’s enough for now.', action: () => {} },
        ];
    }

    function playTopic(entityOrName, topicId) {
        const ctx = contextFor(entityOrName);
        const companion = ctx?.companion;
        const topic = registry.get(companion?.name)?.get(String(topicId));
        if (!ctx || !companion || !topic) return false;
        const state = topicState(companion, topic.id);
        if (!isAvailable(topic, ctx, state)) return false;
        let rendered;
        try { rendered = topic.render(ctx, state) || {}; }
        catch (_) { return false; }
        if (!rendered.text) return false;
        recordUse(companion, topic, state, rendered);
        const options = Array.isArray(rendered.options) && rendered.options.length
            ? [...rendered.options, ...(rendered.noReturn ? [] : [{ label: 'Talk about something else.', action: () => openHub(companion) }])]
            : defaultOptions(companion);
        window.showDialogue?.(companion, rendered.text, options);
        return true;
    }

    function openHub(entityOrName, limit = DEFAULT_LIMIT) {
        const companion = canonicalCompanion(entityOrName);
        if (!companion) return false;
        const subjects = availableTopics(companion, limit);
        if (!subjects.length) {
            window.showDialogue?.(companion,
                companion.name === 'Ser Aldric Thorne'
                    ? 'Aldric considers it, then gives a small shake of his head. “Nothing urgent. Quiet company is not a problem.”'
                    : '“Nothing clever comes to mind,” Wren says. “We can just be quiet for a bit. That’s allowed.”',
                [{ label: 'Stay a while.', action: () => {} }]
            );
            return true;
        }
        const options = subjects.map(({ topic, state, ctx }) => ({
            label: displayLabel(topic, ctx, state),
            action: () => playTopic(companion, topic.id),
        }));
        options.push({ label: 'Never mind.', action: () => {} });
        window.showDialogue?.(companion, 'What do you want to talk about?', options);
        return true;
    }

    function lastMeaningful(entityOrName) {
        return ensureMemory(entityOrName)?.lastMeaningful || null;
    }

    function installDialogueEntry(dialogueId, companionName) {
        const trees = window.npcDialogueTrees;
        const original = trees?.[dialogueId];
        if (typeof original !== 'function') return false;
        const marker = `__conversationMemory_${dialogueId}`;
        if (original[marker]) return true;
        const wrapped = function(npc) {
            if (typeof window.showDialogue !== 'function') return original.apply(this, arguments);
            const baseShow = window.showDialogue;
            let first = true;
            window.showDialogue = function(speaker, text, options) {
                if (first && speaker?.name === companionName && Array.isArray(options)) {
                    first = false;
                    const available = availableTopics(companionName, DEFAULT_LIMIT);
                    if (available.length && !options.some(o => o?.__conversationMemoryEntry)) {
                        const addition = {
                            label: 'Talk for a while.',
                            __conversationMemoryEntry: true,
                            action: () => openHub(companionName),
                        };
                        const next = [...options];
                        const exit = next.findIndex(o => /never mind|goodbye|leave/i.test(String(o?.label || '')));
                        if (exit >= 0) next.splice(exit, 0, addition);
                        else next.push(addition);
                        return baseShow.call(this, speaker, text, next);
                    }
                }
                return baseShow.apply(this, arguments);
            };
            try { return original.apply(this, arguments); }
            finally { window.showDialogue = baseShow; }
        };
        wrapped[marker] = true;
        wrapped.__previous = original;
        trees[dialogueId] = wrapped;
        return true;
    }

    const api = {
        build: BUILD,
        daySeconds: DAY,
        registerTopics,
        ensureMemory,
        topicState,
        contextFor,
        availableTopics,
        playTopic,
        openHub,
        lastMeaningful,
        installDialogueEntry,
    };
    window.companionConversationMemory = api;
    window.COMPANION_CONVERSATION_MEMORY_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
