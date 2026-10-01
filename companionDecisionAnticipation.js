// companionDecisionAnticipation.js
// Knowledge-gated, qualitative anticipation of companion reactions to major choices.
//
// This layer never reads hidden relationship/personality scores and never changes
// Approval/Friendship/Trust. It only combines choices' authored moral themes with
// personality clues the player has actually learned.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20261001-companion-decision-anticipation-v1';

    const THEME_LABELS = Object.freeze({
        accountable_authority: 'making authority answer publicly for what it did',
        agency: 'leaving the decision with the person most directly affected',
        repair: 'repairing harm rather than treating punishment as the only form of justice',
        proportionality: 'separating accountability from maximum punishment',
        institutional_coverup: 'protecting an institution by leaving harmed people outside the record',
        practical_protection: 'accepting an ugly practical compromise to protect other people',
        expendable_people: 'making particular people carry the cost of a larger calculation',
        honour_duty: 'taking a promise seriously even when keeping it is costly',
        honest_renegotiation: 'changing an obligation openly rather than quietly discarding it',
        shared_burden: 'spreading a real obligation across more than one pair of shoulders',
        martyrdom: 'treating unnecessary self-sacrifice as proof that a duty is serious',
        abandon_promise: 'walking away from a promise without renegotiating it',
        preserve_knowledge: 'preserving difficult knowledge rather than erasing it',
        scrutiny: 'keeping dangerous knowledge open to scrutiny and context',
        contextual_limits: 'putting explicit limits around dangerous knowledge',
        destroy_knowledge: 'destroying knowledge because of what someone might do with it',
        knowledge_risk: 'accepting real risk in order to learn whether a dangerous method works',
        risk_reduction: 'reducing the chance that dangerous knowledge can be used carelessly',
        adaptive_stewardship: 'actively managing a living system instead of pretending either intervention or inaction is neutral',
        preserve_ecosystem: 'protecting a new living system that has already begun to function',
        ecosystem_loss: 'sacrificing a living system to restore a human use',
        externalised_cost: 'letting one neighbour carry most of the cost of a principled choice',
        shared_cost: 'making the beneficiaries of a choice share its cost and maintenance',
        human_need: 'treating an immediate human livelihood as a real part of the ecological decision',
        institutional_process: 'putting wrongdoing through a formal institution rather than settling it privately',
        correctable_institution: 'using an institution while requiring it to protect witnesses and confront its own failures',
        repair_after_failure: 'judging people partly by what they do after they have failed',
        trust_gamble: 'asking frightened people to carry a high-risk plan because they remain useful',
        people_as_tools: 'using vulnerable people chiefly as instruments for a larger plan',
        private_solution: 'solving the problem outside institutions because the system may not be trustworthy',
        protect_vulnerable: 'protecting people whose choices were shaped by fear or coercion',
        individual_dignity: 'refusing to let particular people disappear into a category or number',
        active_compassion: 'letting compassion create a concrete obligation to act',
        urgent_harm: 'prioritising an immediate ongoing danger over symbolic or institutional repair',
        names_secondary: 'treating names and individual records as less important than a broader duty or rite',
        accept_mortality: 'accepting limits around bodies, death and what can be preserved',
        detachment: 'stepping back from particular attachments in favour of a more universal view',
    });

    // Traits point to themes that tend to resonate with, or press against, what
    // the player has learned. These are not hidden approval rules: the quest's
    // real relationship consequences remain wherever the authored quest owns them.
    const TRAIT_RULES = Object.freeze({
        'Wren Talbot': {
            authority: { resonate: ['accountable_authority', 'agency'], tension: ['institutional_coverup'] },
            mercy: { resonate: ['repair', 'proportionality', 'protect_vulnerable'], tension: ['expendable_people'] },
            attachment: { resonate: ['agency'], tension: [] },
            pragmatism: { resonate: ['practical_protection'], tension: ['expendable_people', 'people_as_tools'] },
        },
        'Ser Aldric Thorne': {
            duty: { resonate: ['honour_duty', 'honest_renegotiation'], tension: ['abandon_promise'] },
            burden: { resonate: ['shared_burden'], tension: ['martyrdom'] },
            justice: { resonate: ['accountable_authority', 'institutional_process', 'correctable_institution', 'proportionality'], tension: ['institutional_coverup'] },
        },
        'Mirabel Quill': {
            curiosity: { resonate: ['preserve_knowledge', 'scrutiny', 'knowledge_risk'], tension: ['destroy_knowledge'] },
            roots: { resonate: ['agency'], tension: [] },
            responsibility: { resonate: ['scrutiny', 'contextual_limits', 'risk_reduction'], tension: ['knowledge_risk', 'people_as_tools'] },
        },
        'Fenn Oakheart': {
            stewardship: { resonate: ['adaptive_stewardship', 'preserve_ecosystem', 'human_need'], tension: ['ecosystem_loss'] },
            independence: { resonate: ['agency', 'honest_renegotiation'], tension: [] },
            reciprocity: { resonate: ['shared_cost'], tension: ['externalised_cost'] },
        },
        'Reyna Fletcher': {
            trust: { resonate: ['repair_after_failure', 'correctable_institution'], tension: ['trust_gamble'] },
            justice: { resonate: ['accountable_authority', 'institutional_process', 'correctable_institution'], tension: ['institutional_coverup'] },
            interdependence: { resonate: ['shared_burden', 'shared_cost'], tension: ['trust_gamble'] },
        },
        'Brother Alden': {
            engagement: { resonate: ['active_compassion', 'protect_vulnerable'], tension: ['detachment'] },
            dignity: { resonate: ['individual_dignity', 'repair'], tension: ['expendable_people', 'names_secondary'] },
            impermanence: { resonate: ['accept_mortality'], tension: [] },
        },
    });

    const DECISIONS = Object.freeze({
        wren_crown_quiet_hand: {
            companion: 'Wren Talbot',
            choices: {
                public_inquiry: ['accountable_authority'],
                restore_names: ['repair', 'proportionality', 'accountable_authority'],
                wren_decides: ['agency'],
                bury_for_stability: ['practical_protection', 'institutional_coverup', 'expendable_people'],
            },
        },
        aldric_measure_of_oath: {
            companion: 'Ser Aldric Thorne',
            choices: {
                literal_return: ['honour_duty', 'martyrdom'],
                bounded_service: ['honour_duty', 'honest_renegotiation', 'shared_burden'],
                formal_release: ['honest_renegotiation', 'agency'],
                aldric_decides: ['agency', 'honour_duty'],
                walk_away: ['abandon_promise'],
            },
        },
        mirabel_unquiet_concordance: {
            companion: 'Mirabel Quill',
            choices: {
                preserve_open: ['preserve_knowledge', 'scrutiny', 'knowledge_risk'],
                preserve_sealed: ['preserve_knowledge', 'contextual_limits', 'scrutiny'],
                destroy_appendix: ['destroy_knowledge', 'risk_reduction'],
                experiment: ['knowledge_risk', 'scrutiny'],
            },
        },
        fenn_living_boundary: {
            companion: 'Fenn Oakheart',
            choices: {
                preserve_marsh: ['preserve_ecosystem', 'externalised_cost'],
                drain_marsh: ['human_need', 'ecosystem_loss'],
                managed_spillway: ['adaptive_stewardship', 'shared_cost', 'human_need', 'preserve_ecosystem'],
                compensate_preserve: ['preserve_ecosystem', 'shared_cost'],
            },
        },
        reyna_empty_blind: {
            companion: 'Reyna Fletcher',
            choices: {
                turn_in: ['institutional_process', 'accountable_authority'],
                witness_deal: ['correctable_institution', 'repair_after_failure', 'protect_vulnerable'],
                double_agent: ['trust_gamble', 'people_as_tools', 'practical_protection'],
                let_disappear: ['private_solution', 'protect_vulnerable'],
            },
        },
        alden_uncounted: {
            companion: 'Brother Alden',
            choices: {
                restore_names: ['individual_dignity', 'active_compassion', 'accountable_authority'],
                quiet_memorial: ['individual_dignity', 'repair'],
                hunt_missing: ['active_compassion', 'urgent_harm', 'names_secondary'],
                rites_over_names: ['accept_mortality', 'names_secondary', 'detachment'],
            },
        },
    });

    const party = () => Array.isArray(root.party) ? root.party : [];
    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;

    function knowledgeLevel(name, trait) {
        try { return Number(root.companionPersonalityKnowledge?.get?.(name, trait)?.level || 0); }
        catch (_) { return 0; }
    }

    function learnTo(name, trait, target, source) {
        const current = knowledgeLevel(name, trait);
        const capped = Math.max(0, Math.min(3, Number(target) || 0));
        if (capped <= current) return false;
        root.learnCompanionPersonality?.(name, trait, capped - current, source);
        return true;
    }

    // The current Wren quest stores these outcome ids as `wren_decides` and
    // `bury_for_stability`. Early clue code used the older draft ids
    // `wren_chose` / `buried_for_stability`. Patch the evergreen sync API once
    // so current and old saves both receive the clue they actually heard.
    function syncCurrentWrenResolution() {
        const companion = party().find((member, index) => index > 0 && member?.name === 'Wren Talbot');
        const crownUses = Number(companion?.playerRelationship?.conversationMemory?.topics?.crown_aftermath?.uses || 0);
        if (crownUses < 1) return false;
        const resolution = quest('wren_crown_quiet_hand')?.resolution;
        const chose = resolution === 'wren_decides' || resolution === 'wren_chose';
        const buried = resolution === 'bury_for_stability' || resolution === 'buried_for_stability';
        if (!chose && !buried) return false;
        learnTo('Wren Talbot', 'authority', chose ? 3 : 2, 'crown_aftermath');
        if (buried) learnTo('Wren Talbot', 'pragmatism', 3, 'crown_aftermath');
        return true;
    }

    function installWrenResolutionCompatibility() {
        const evergreen = root.companionEvergreenPersonalityClues;
        if (!evergreen || typeof evergreen.sync !== 'function') return false;
        if (evergreen.sync.__currentWrenResolutionAliases) return true;
        const original = evergreen.sync;
        const wrapped = function syncWithCurrentWrenResolution(name) {
            const result = original.apply(this, arguments);
            if (name === 'Wren Talbot') syncCurrentWrenResolution();
            return result;
        };
        wrapped.__currentWrenResolutionAliases = true;
        wrapped.__previous = original;
        evergreen.sync = wrapped;
        return true;
    }

    function outcomeId(option) {
        if (typeof option?.decisionOutcome === 'string' && option.decisionOutcome) return option.decisionOutcome;
        if (!option || typeof option.action !== 'function') return null;
        try {
            const source = Function.prototype.toString.call(option.action);
            const match = source.match(/\bcompleteQuest\(\s*['"]([^'"]+)['"]\s*\)/);
            return match ? match[1] : null;
        } catch (_) { return null; }
    }

    function activeDecision(npc, options) {
        if (!npc?.name || !Array.isArray(options) || options.length < 2) return null;
        for (const [questId, spec] of Object.entries(DECISIONS)) {
            if (spec.companion !== npc.name) continue;
            const q = quest(questId);
            if (!q || q.status === 'completed') continue;
            const recognised = options
                .map((option, index) => ({ option, index, outcome: outcomeId(option) }))
                .filter(item => item.outcome && spec.choices[item.outcome]);
            if (recognised.length >= 2) return { questId, spec, recognised };
        }
        return null;
    }

    function knownMap(name) {
        try {
            root.companionEvergreenPersonalityClues?.sync?.(name);
            const known = root.companionPersonalityKnowledge?.known?.(name) || [];
            return new Map(known.map(item => [item.trait, item]));
        } catch (_) { return new Map(); }
    }

    function overlap(values, themes) {
        const set = new Set(themes || []);
        return (values || []).filter(value => set.has(value));
    }

    function analyseChoice(decision, outcome) {
        const themes = decision.spec.choices[outcome] || [];
        const members = party().filter((member, index) => index > 0 && member?.name && TRAIT_RULES[member.name]);
        const impressions = [];

        for (const member of members) {
            const known = knownMap(member.name);
            const rules = TRAIT_RULES[member.name] || {};
            const evidence = [];
            let hasResonance = false;
            let hasTension = false;
            let maxLevel = 0;

            for (const [trait, rule] of Object.entries(rules)) {
                const clue = known.get(trait);
                if (!clue?.level) continue;
                const resonate = overlap(rule.resonate, themes);
                const tension = overlap(rule.tension, themes);
                if (!resonate.length && !tension.length) continue;
                hasResonance ||= !!resonate.length;
                hasTension ||= !!tension.length;
                maxLevel = Math.max(maxLevel, Number(clue.level || 0));
                evidence.push({ trait, clue, resonate, tension });
            }

            if (!evidence.length) {
                if (member.name === decision.spec.companion) {
                    impressions.push({ name: member.name, unknown: true, maxLevel: 0, primary: true });
                }
                continue;
            }
            impressions.push({
                name: member.name,
                evidence,
                direction: hasResonance && hasTension ? 'mixed' : (hasTension ? 'tension' : 'resonance'),
                maxLevel,
                primary: member.name === decision.spec.companion,
            });
        }

        impressions.sort((a, b) => Number(b.primary) - Number(a.primary) || b.maxLevel - a.maxLevel);
        return impressions.slice(0, 4);
    }

    function uniqueThemeLabels(evidence, key) {
        const seen = new Set();
        const labels = [];
        for (const item of evidence || []) for (const theme of item[key] || []) {
            const label = THEME_LABELS[theme] || theme.replaceAll('_', ' ');
            if (!seen.has(label)) { seen.add(label); labels.push(label); }
        }
        return labels;
    }

    function impressionText(impression) {
        if (impression.unknown) return `${impression.name}: You do not know them well enough to read this choice with confidence.`;
        const clues = impression.evidence
            .slice()
            .sort((a, b) => Number(b.clue.level || 0) - Number(a.clue.level || 0))
            .slice(0, impression.maxLevel >= 3 ? 2 : 1);
        const learned = clues.map(item => item.clue.text).filter(Boolean).join(' ');
        const resonate = uniqueThemeLabels(impression.evidence, 'resonate');
        const tension = uniqueThemeLabels(impression.evidence, 'tension');
        const rough = impression.maxLevel <= 1 ? 'Your read is still rough. ' : '';

        if (impression.direction === 'mixed') {
            return `${impression.name}: ${rough}Two things you have learned pull in different directions here. The choice involves ${resonate[0] || 'something that fits their values'}, but also ${tension[0] || 'something that may trouble them'}. ${learned}`;
        }
        if (impression.direction === 'tension') {
            return `${impression.name}: ${rough}This choice touches ${tension[0] || 'something'} in a way that may sit uneasily with what you know about them. ${learned}`;
        }
        return `${impression.name}: ${rough}This choice touches ${resonate[0] || 'something'} in a way that seems consistent with what you know about them. ${learned}`;
    }

    function shortLabel(label) {
        const clean = String(label || 'Choice').replace(/^[“"]|[”"]$/g, '').trim();
        return clean.length <= 76 ? clean : `${clean.slice(0, 73).trimEnd()}…`;
    }

    function showChoiceReview(decision, item, returnToDecision, showReviewMenu) {
        const impressions = analyseChoice(decision, item.outcome);
        const body = impressions.length
            ? impressions.map(impressionText).join('\n\n')
            : 'You have not learned enough relevant information about your companions to read much into this choice yet.';
        const text = `${item.option.label}\n\n${body}\n\nThese are inferences from what you have actually learned, not guarantees of how anyone will react.`;
        root.showDialogue?.({ name: 'Your judgement' }, text, [
            { label: 'Consider another choice.', action: showReviewMenu },
            { label: 'Back to the decision.', action: returnToDecision },
        ]);
        return true;
    }

    function showDecisionReview(npc, message, options, decision) {
        const returnToDecision = () => root.showDialogue?.(npc, message, options);
        const showMenu = () => {
            const reviewOptions = decision.recognised.map(item => ({
                label: shortLabel(item.option.label),
                action: () => showChoiceReview(decision, item, returnToDecision, showMenu),
            }));
            reviewOptions.push({ label: 'Back to the decision.', action: returnToDecision });
            root.showDialogue?.(
                { name: 'Your judgement' },
                'Which choice do you want to think through? These notes use only personality clues you have actually learned from your companions.',
                reviewOptions
            );
        };
        showMenu();
        return true;
    }

    function decorateOptions(npc, message, options) {
        if (!Array.isArray(options) || options.some(option => option?.__companionDecisionAnticipation)) return options;
        const decision = activeDecision(npc, options);
        if (!decision) return options;
        const next = [...options];
        const review = {
            label: 'Consider your companions.',
            __companionDecisionAnticipation: true,
            action: () => showDecisionReview(npc, message, options, decision),
        };
        const exitIndex = next.findIndex(option => /not yet|never mind|leave|later/i.test(String(option?.label || '')));
        if (exitIndex >= 0) next.splice(exitIndex, 0, review);
        else next.push(review);
        return next;
    }

    function install() {
        installWrenResolutionCompatibility();
        const current = root.showDialogue;
        if (typeof current !== 'function') return false;
        if (current.__companionDecisionAnticipation) return true;
        const wrapped = function showDialogueWithCompanionAnticipation(npc, message, options) {
            return current.call(this, npc, message, decorateOptions(npc, message, options));
        };
        wrapped.__companionDecisionAnticipation = true;
        wrapped.__previous = current;
        root.showDialogue = wrapped;
        return true;
    }

    const api = {
        build: BUILD,
        themes: THEME_LABELS,
        traitRules: TRAIT_RULES,
        decisions: DECISIONS,
        outcomeId,
        activeDecision,
        analyseChoice,
        impressionText,
        decorateOptions,
        showDecisionReview,
        syncCurrentWrenResolution,
        installWrenResolutionCompatibility,
        install,
    };
    root.companionDecisionAnticipation = api;
    root.COMPANION_DECISION_ANTICIPATION_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (!install() && typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        setTimeout(install, 0);
    }
})();