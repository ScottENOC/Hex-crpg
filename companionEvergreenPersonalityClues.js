// companionEvergreenPersonalityClues.js
// Personality knowledge revealed by ordinary/evergreen companion conversations.
//
// Keep this separate from the hidden personality model: these rules only tag
// lines the player has actually heard. They never change Approval/Friendship/Trust.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-evergreen-personality-clues-v2';
    const WREN = 'Wren Talbot';
    const ALDRIC = 'Ser Aldric Thorne';
    const MIRABEL = 'Mirabel Quill';
    const FENN = 'Fenn Oakheart';
    const REYNA = 'Reyna Fletcher';
    const ALDEN = 'Brother Alden';
    const COMPANIONS = [WREN, ALDRIC, MIRABEL, FENN, REYNA, ALDEN];
    const decorated = new WeakSet();

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const companion = name => (root.party || []).find((member, index) => index > 0 && member?.name === name) || null;
    const normalise = value => Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);
    const uses = (topics, id) => Math.max(0, Number(topics?.[id]?.uses || 0));

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

        if (name === MIRABEL) {
            if (topicId === 'concordance_aftermath') {
                if (variant === 0) {
                    const resolution = quest('mirabel_unquiet_concordance')?.resolution;
                    const depth = ({ preserve_open: 1, preserve_sealed: 2, destroy_appendix: 2, experiment: 3 })[resolution] || 1;
                    return [{ trait: 'responsibility', amount: depth }];
                }
                if (variant === 1) return [{ trait: 'responsibility', amount: 1 }];
            }
            if (topicId === 'thessaly' && (variant === 1 || variant === 2)) {
                return [{ trait: 'responsibility', amount: 1 }];
            }
            if (topicId === 'lich_response' && variant >= 0 && variant <= 2) {
                return [{ trait: 'responsibility', amount: 1 }];
            }
            if ((topicId === 'road_smalltalk' && variant === 4) || (topicId === 'old_stories' && variant === 3)) {
                return [{ trait: 'roots', amount: 1 }];
            }
        }

        if (name === FENN) {
            if (topicId === 'boundary_aftermath') {
                if (variant === 0) {
                    const resolution = quest('fenn_living_boundary')?.resolution;
                    const reciprocityDepth = ({ preserve_marsh: 1, drain_marsh: 1, managed_spillway: 2, compensate_preserve: 3 })[resolution] || 1;
                    return [{ trait: 'stewardship', amount: 1 }, { trait: 'reciprocity', amount: reciprocityDepth }];
                }
                if (variant === 1) return [{ trait: 'stewardship', amount: 1 }];
            }
            if (topicId === 'nessa' && variant >= 0 && variant <= 2) {
                return [{ trait: 'independence', amount: 1 }];
            }
            if (topicId === 'aelwen_accord' && variant >= 0 && variant <= 2) {
                return [{ trait: 'reciprocity', amount: 1 }];
            }
        }

        if (name === REYNA) {
            if (topicId === 'empty_blind_aftermath') {
                if (variant === 0) return [{ trait: 'justice', amount: 1 }];
                if (variant === 1) return [{ trait: 'interdependence', amount: 1 }];
            }
            if (topicId === 'northwatch' && variant >= 0 && variant <= 2) {
                return [{ trait: 'interdependence', amount: 1 }];
            }
            if (topicId === 'institutions' && variant >= 0 && variant <= 2) {
                return [{ trait: 'justice', amount: 1 }];
            }
        }

        if (name === ALDEN) {
            if (topicId === 'uncounted_aftermath') {
                if (variant === 0) {
                    const resolution = quest('alden_uncounted')?.resolution;
                    const dignityDepth = resolution === 'restore_names' ? 2 : 1;
                    return [{ trait: 'dignity', amount: dignityDepth }];
                }
                if (variant === 1) return [{ trait: 'dignity', amount: 1 }, { trait: 'engagement', amount: 1 }];
            }
            if (topicId === 'aldric' && variant >= 0 && variant <= 2) {
                return [{ trait: 'engagement', amount: 1 }];
            }
            if ((topicId === 'death_and_necromancy' || topicId === 'lich_response') && variant >= 0 && variant <= 2) {
                return [{ trait: 'impermanence', amount: 1 }];
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
            const crownUses = uses(topics, 'crown_aftermath');
            if (crownUses >= 1) {
                const resolution = quest('wren_crown_quiet_hand')?.resolution;
                const authorityDepth = resolution === 'wren_chose' ? 3 : (resolution === 'buried_for_stability' ? 2 : 1);
                learnTo(name, 'authority', authorityDepth, 'crown_aftermath');
                if (resolution === 'buried_for_stability') learnTo(name, 'pragmatism', 3, 'crown_aftermath');
            }
            // injury_check cycles 0 -> 1 -> 2, so three uses proves the strong
            // “nobody dies for efficiency” line has been heard at least once.
            if (uses(topics, 'injury_check') >= 3) learnTo(name, 'pragmatism', 3, 'injury_check');
        }

        if (name === ALDRIC) {
            let burdenDepth = Math.min(3, uses(topics, 'shared_burden'));
            const measureUses = uses(topics, 'measure_aftermath');
            const resolution = quest('aldric_measure_of_oath')?.resolution;
            if (measureUses >= 1 && resolution === 'bounded_service') burdenDepth = Math.max(burdenDepth, 2);
            if (measureUses >= 2) burdenDepth = Math.max(burdenDepth, resolution === 'bounded_service' ? 3 : 1);
            if (burdenDepth > 0) learnTo(name, 'burden', burdenDepth, 'evergreen_burden');
        }

        if (name === MIRABEL) {
            let responsibilityEvidence = 0;
            const concordanceUses = uses(topics, 'concordance_aftermath');
            if (concordanceUses >= 1) {
                const resolution = quest('mirabel_unquiet_concordance')?.resolution;
                responsibilityEvidence = ({ preserve_open: 1, preserve_sealed: 2, destroy_appendix: 2, experiment: 3 })[resolution] || 1;
                if (concordanceUses >= 2) responsibilityEvidence += 1;
            }
            const thessalyUses = uses(topics, 'thessaly');
            if (thessalyUses >= 2) responsibilityEvidence += 1;
            if (thessalyUses >= 3) responsibilityEvidence += 1;
            responsibilityEvidence += Math.min(3, uses(topics, 'lich_response'));
            if (responsibilityEvidence > 0) learnTo(name, 'responsibility', Math.min(3, responsibilityEvidence), 'evergreen_responsibility');

            const rootsEvidence = (uses(topics, 'road_smalltalk') >= 5 ? 1 : 0) + (uses(topics, 'old_stories') >= 4 ? 1 : 0);
            if (rootsEvidence > 0) learnTo(name, 'roots', Math.min(3, rootsEvidence), 'evergreen_roots');
        }

        if (name === FENN) {
            const boundaryUses = uses(topics, 'boundary_aftermath');
            if (boundaryUses > 0) learnTo(name, 'stewardship', Math.min(2, boundaryUses), 'boundary_aftermath');

            let reciprocityEvidence = Math.min(3, uses(topics, 'aelwen_accord'));
            if (boundaryUses >= 1) {
                const resolution = quest('fenn_living_boundary')?.resolution;
                reciprocityEvidence += ({ preserve_marsh: 1, drain_marsh: 1, managed_spillway: 2, compensate_preserve: 3 })[resolution] || 1;
            }
            if (reciprocityEvidence > 0) learnTo(name, 'reciprocity', Math.min(3, reciprocityEvidence), 'evergreen_reciprocity');

            const independenceEvidence = Math.min(3, uses(topics, 'nessa'));
            if (independenceEvidence > 0) learnTo(name, 'independence', independenceEvidence, 'nessa');
        }

        if (name === REYNA) {
            const justiceEvidence = Math.min(3, uses(topics, 'institutions') + (uses(topics, 'empty_blind_aftermath') >= 1 ? 1 : 0));
            if (justiceEvidence > 0) learnTo(name, 'justice', justiceEvidence, 'evergreen_justice');

            const interdependenceEvidence = Math.min(3, uses(topics, 'northwatch') + (uses(topics, 'empty_blind_aftermath') >= 2 ? 1 : 0));
            if (interdependenceEvidence > 0) learnTo(name, 'interdependence', interdependenceEvidence, 'evergreen_interdependence');
        }

        if (name === ALDEN) {
            const uncountedUses = uses(topics, 'uncounted_aftermath');
            let dignityEvidence = 0;
            if (uncountedUses >= 1) dignityEvidence = quest('alden_uncounted')?.resolution === 'restore_names' ? 2 : 1;
            if (uncountedUses >= 2) dignityEvidence += 1;
            if (dignityEvidence > 0) learnTo(name, 'dignity', Math.min(3, dignityEvidence), 'uncounted_aftermath');

            const engagementEvidence = Math.min(3, Math.min(3, uses(topics, 'aldric')) + (uncountedUses >= 2 ? 1 : 0));
            if (engagementEvidence > 0) learnTo(name, 'engagement', engagementEvidence, 'evergreen_engagement');

            const impermanenceEvidence = Math.min(3, uses(topics, 'death_and_necromancy') + uses(topics, 'lich_response'));
            if (impermanenceEvidence > 0) learnTo(name, 'impermanence', impermanenceEvidence, 'evergreen_impermanence');
        }
        return true;
    }

    function registerExistingPack(api, pack, specs) {
        if (!pack) return;
        for (const [name, key] of specs) {
            const topics = pack[key];
            if (!Array.isArray(topics)) continue;
            decorateTopics(name, topics);
            api.registerTopics(name, topics);
        }
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

        // If either evergreen module won the script-loading race, its topics were
        // already copied into the registry. Decorate the authored source objects
        // and register them once more so the registry receives wrapped renderers.
        registerExistingPack(api, root.wrenAldricEvergreenDialogue, [
            [WREN, 'wrenTopics'], [ALDRIC, 'aldricTopics']
        ]);
        registerExistingPack(api, root.otherCompanionEvergreenDialogue, [
            [MIRABEL, 'mirabelTopics'], [FENN, 'fennTopics'],
            [REYNA, 'reynaTopics'], [ALDEN, 'aldenTopics']
        ]);

        for (const name of COMPANIONS) sync(name);
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
