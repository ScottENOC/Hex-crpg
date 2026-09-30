// companionEvergreenPersonalityClues.js
// Personality knowledge revealed by ordinary/evergreen companion conversations.
//
// Keep this separate from the hidden personality model: these rules only tag
// lines the player has actually heard. They never change Approval/Friendship/Trust.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-evergreen-personality-clues-v1';
    const WREN = 'Wren Talbot';
    const ALDRIC = 'Ser Aldric Thorne';
    const decorated = new WeakSet();

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const companion = name => (root.party || []).find((member, index) => index > 0 && member?.name === name) || null;
    const normalise = value => Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);

    function cluesFor(name, topicId, result) {
        const variant = Number(result?.variantIndex ?? -1);

        if (name === WREN) {
            if (topicId === 'crown_aftermath' && variant === 0) {
                const resolution = quest('wren_crown_quiet_hand')?.resolution;
                const authorityDepth = resolution === 'wren_chose' ? 3 : (resolution === 'buried_for_stability' ? 2 : 1);
                const clues = [{ trait: 'authority', amount: authorityDepth }];
                if (resolution === 'buried_for_stability') clues.push({ trait: 'pragmatism', amount: 3 });
                return clues;
            }
            if (topicId === 'injury_check' && variant === 2) {
                return [{ trait: 'pragmatism', amount: 3 }];
            }
        }

        if (name === ALDRIC) {
            if (topicId === 'shared_burden') {
                return [{ trait: 'burden', amount: 1 }];
            }
            if (topicId === 'measure_aftermath') {
                const resolution = quest('aldric_measure_of_oath')?.resolution;
                if (variant === 0 && resolution === 'bounded_service') return [{ trait: 'burden', amount: 2 }];
                if (variant === 1) return [{ trait: 'burden', amount: 1 }];
            }
        }

        return [];
    }

    function decorateTopic(name, topic) {
        if (!topic || typeof topic.render !== 'function' || decorated.has(topic)) return topic;
        const original = topic.render;
        topic.render = function decoratedPersonalityRender(ctx, state) {
            const result = original.apply(this, arguments);
            if (!result || typeof result !== 'object') return result;
            const extra = cluesFor(name, String(topic.id || ''), result);
            if (!extra.length) return result;
            return { ...result, personalityClues: [...normalise(result.personalityClues), ...extra] };
        };
        decorated.add(topic);
        return topic;
    }

    function decorateTopics(name, topics) {
        if (!Array.isArray(topics)) return topics;
        for (const topic of topics) decorateTopic(name, topic);
        return topics;
    }

    function currentLevel(name, trait) {
        try { return Number(root.companionPersonalityKnowledge?.get?.(name, trait)?.level || 0); }
        catch (_) { return 0; }
    }

    function learnTo(name, trait, target, source) {
        target = Math.max(0, Number(target) || 0);
        const current = currentLevel(name, trait);
        if (target <= current) return false;
        root.learnCompanionPersonality?.(name, trait, target - current, source);
        return true;
    }

    // Backfill observations for saves that heard these lines before the tags were
    // added. Only states that prove the revealing variant was heard are used.
    function sync(name) {
        const c = companion(name);
        const topics = c?.playerRelationship?.conversationMemory?.topics || {};
        if (!c) return false;

        if (name === WREN) {
            const crownUses = Number(topics.crown_aftermath?.uses || 0);
            if (crownUses >= 1) {
                const resolution = quest('wren_crown_quiet_hand')?.resolution;
                const authorityDepth = resolution === 'wren_chose' ? 3 : (resolution === 'buried_for_stability' ? 2 : 1);
                learnTo(name, 'authority', authorityDepth, 'crown_aftermath');
                if (resolution === 'buried_for_stability') learnTo(name, 'pragmatism', 3, 'crown_aftermath');
            }
            // injury_check cycles 0 -> 1 -> 2, so three uses proves the strong
            // “nobody dies for efficiency” line has been heard at least once.
            if (Number(topics.injury_check?.uses || 0) >= 3) learnTo(name, 'pragmatism', 3, 'injury_check');
        }

        if (name === ALDRIC) {
            let burdenDepth = Math.min(3, Number(topics.shared_burden?.uses || 0));
            const measureUses = Number(topics.measure_aftermath?.uses || 0);
            const resolution = quest('aldric_measure_of_oath')?.resolution;
            if (measureUses >= 1 && resolution === 'bounded_service') burdenDepth = Math.max(burdenDepth, 2);
            if (measureUses >= 2) burdenDepth = Math.max(burdenDepth, resolution === 'bounded_service' ? 3 : 1);
            if (burdenDepth > 0) learnTo(name, 'burden', burdenDepth, 'evergreen_burden');
        }
        return true;
    }

    function install() {
        const api = root.companionConversationMemory;
        if (!api || typeof api.registerTopics !== 'function') return false;

        if (!api.registerTopics.__evergreenPersonalityClueDecorator) {
            const originalRegister = api.registerTopics;
            const wrapped = function registerTopicsWithPersonalityClues(name, topics) {
                decorateTopics(name, topics);
                return originalRegister.apply(this, arguments);
            };
            wrapped.__evergreenPersonalityClueDecorator = true;
            wrapped.__previous = originalRegister;
            api.registerTopics = wrapped;
        }

        // If the evergreen module won the script-loading race, its topics were
        // already copied into the registry. Decorate the authored source objects
        // and register them once more so the registry receives the wrapped renderers.
        const evergreen = root.wrenAldricEvergreenDialogue;
        if (evergreen) {
            if (Array.isArray(evergreen.wrenTopics)) {
                decorateTopics(WREN, evergreen.wrenTopics);
                api.registerTopics(WREN, evergreen.wrenTopics);
            }
            if (Array.isArray(evergreen.aldricTopics)) {
                decorateTopics(ALDRIC, evergreen.aldricTopics);
                api.registerTopics(ALDRIC, evergreen.aldricTopics);
            }
        }

        sync(WREN);
        sync(ALDRIC);
        return true;
    }

    const api = { build: BUILD, cluesFor, decorateTopic, decorateTopics, sync, install };
    root.companionEvergreenPersonalityClues = api;
    root.COMPANION_EVERGREEN_PERSONALITY_CLUES_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    install();
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    }
    if (typeof document !== 'undefined') setTimeout(install, 0);
})();
