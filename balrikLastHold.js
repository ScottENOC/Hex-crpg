// balrikLastHold.js
// King Balrik Deepholm's first persistent-character story pass.
//
// This grows directly from existing Kragmoor content. Completing "What Nests
// Below" opens the deliberately sealed Sunken Deep, whose warning says the old
// dwarves "dug too greedily, and too deep". Balrik's problem is therefore not
// a new dungeon or a generic good/evil choice: it is whether the last surviving
// Deephold should protect what remains, study what was lost, or cautiously begin
// reclaiming useful ground without repeating the older halls' mistake.
//
// Thrain Emberhand can give an independent dwarven craft perspective, while a
// recruited Mirabel can read the situation through the curiosity/restraint arc
// established in her own companion chapter.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-balrik-last-hold-v1';
    const BALRIK = 'King Balrik Deepholm';
    const THRAIN = 'Thrain Emberhand';
    const MIRABEL = 'Mirabel Quill';
    const QUEST_ID = 'balrik_last_hold';

    function party() {
        return Array.isArray(root.party) ? root.party : [];
    }

    function quest() {
        return (root.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    }

    function infestationQuest() {
        return (root.questLog || []).find(entry => entry?.id === 'deepholds_infestation') || null;
    }

    function mirabel() {
        return party().find((member, index) => index > 0 && member?.name === MIRABEL) || null;
    }

    function relationship(name) {
        return root.getPersistentCharacterRelationship?.(name) || null;
    }

    function record(name, key, delta) {
        return root.recordPersistentCharacterEvent?.(name, key, delta);
    }

    function canStart() {
        return infestationQuest()?.status === 'completed' && root.campaign2SunkenDeepWarningRead === true;
    }

    function markWarningRead() {
        const firstRead = root.campaign2SunkenDeepWarningRead !== true;
        root.campaign2SunkenDeepWarningRead = true;
        if (firstRead && infestationQuest()?.status === 'completed') {
            root.showMessage?.('The old warning in the Sunken Deep may be worth showing King Balrik.');
        }
        return true;
    }

    function ensureQuest() {
        root.questLog = root.questLog || [];
        let q = quest();
        if (q || !canStart()) return q;
        q = {
            id: QUEST_ID,
            title: 'The Last Hold',
            giver: BALRIK,
            status: 'active',
            resolution: null,
            stage: 'report_warning',
            description: 'Show King Balrik the warning carved below Kragmoor and decide what the Deepholds should do with the reopened Sunken Deep.',
            warningReported: false,
            thrainCounselHeard: false,
            mirabelCounselHeard: false,
            offeredAt: Number(root.worldSeconds || 0),
        };
        root.questLog.push(q);
        root.showMessage?.('Quest added: The Last Hold.');
        return q;
    }

    function reportWarning() {
        const q = ensureQuest();
        if (!q || q.status !== 'active') return q;
        if (!q.warningReported) {
            q.warningReported = true;
            q.stage = 'choose_policy';
            q.description = 'Balrik recognises the Sunken Deep as exactly the kind of forgotten risk Kragmoor was taught not to repeat. Decide whether to seal it, survey it, or permit tightly bounded reclamation.';
            record(BALRIK, 'last_hold:warning_reported', { familiarity: 3, trust: 4, friendship: 2 });
        }
        return q;
    }

    function thrainCounselText() {
        return 'Thrain turns the warning over in silence before answering. “A smith who never tests a seam becomes a museum keeper. A miner who ignores a warning becomes a memorial.” He taps the old transcription. “If Balrik asks me: send three careful folk, not thirty hungry ones. Measure. Ward. Stop the instant the mountain tells you to stop.”';
    }

    function noteThrainCounsel() {
        const q = quest() || ensureQuest();
        if (!q || q.status !== 'active' || !q.warningReported) return null;
        if (!q.thrainCounselHeard) {
            q.thrainCounselHeard = true;
            record(THRAIN, 'last_hold:asked_for_counsel', { familiarity: 2, trust: 3, friendship: 2 });
        }
        return q;
    }

    function mirabelCounselText() {
        const state = root.mirabelUnquietConcordance?.getArcState?.() || null;
        if (!state) {
            return 'Mirabel studies the copied runes. “A warning is evidence, not an argument for permanent ignorance. I would survey it properly before deciding whether it deserves another century behind a wall.”';
        }
        if (state.scholarship === 'unfettered_scholar') {
            return 'Mirabel is almost offended by the idea of sealing the place unread. “Someone went to extraordinary trouble to warn the future, which rather implies they expected the future to be clever enough to understand the warning. Study it first. Otherwise we are preserving their fear more carefully than their knowledge.”';
        }
        if (state.scholarship === 'responsible_scholar' || state.scholarship === 'cautious_scholar') {
            return 'Mirabel reads the warning twice. “Survey, but write the stopping conditions before anyone goes down. No extraction beyond the warded line, no improvising because a crystal looks valuable, and no pretending curiosity makes us immune to the people who carved this.”';
        }
        return 'Mirabel folds the rubbing carefully. “I want to know what is down there. That does not mean opening every door. A controlled survey buys information without making ignorance or greed the policy.”';
    }

    function noteMirabelCounsel() {
        const q = quest() || ensureQuest();
        const companion = mirabel();
        if (!q || q.status !== 'active' || !q.warningReported || !companion) return null;
        if (!q.mirabelCounselHeard) {
            q.mirabelCounselHeard = true;
            root.noteCompanionConversation?.(companion, 'mirabel:balrik_last_hold', 2);
        }
        return q;
    }

    function canResolve() {
        const q = quest();
        return !!(q && q.status === 'active' && q.warningReported);
    }

    function resolutionSpec(resolution) {
        if (resolution === 'seal_below') {
            return {
                balrik: { familiarity: 3, trust: 7, friendship: 4 },
                thrain: { trust: 3, friendship: 2 },
                world: {
                    mode: 'sealed',
                    survey: false,
                    extraction: false,
                    wardedThreshold: true,
                },
                text: 'Balrik nods once. “Then we keep the hold we have instead of gambling it against a hole our dead were frightened enough to wall shut.” He looks toward the lower stairs. “I do not call that cowardice. Kragmoor has buried too many places that called caution cowardice.”',
            };
        }
        if (resolution === 'survey_only') {
            return {
                balrik: { familiarity: 4, trust: 10, friendship: 6 },
                thrain: { trust: 6, friendship: 4 },
                world: {
                    mode: 'survey',
                    survey: true,
                    extraction: false,
                    wardedThreshold: true,
                },
                text: 'Balrik considers it for a long moment. “Three surveyors. Thrain chooses them. They map, test the wards, and bring nothing back merely because it shines.” A faint smile touches his beard. “That sounds almost disappointingly sensible. Good. Sensible kingdoms tend to outlive exciting ones.”',
            };
        }
        if (resolution === 'bounded_reclamation') {
            return {
                balrik: { familiarity: 4, trust: 7, friendship: 4 },
                thrain: { trust: 8, friendship: 5 },
                world: {
                    mode: 'bounded_reclamation',
                    survey: true,
                    extraction: true,
                    extractionLimit: 'upper_safe_seam_only',
                    wardedThreshold: true,
                },
                text: 'Balrik drums his fingers on the table. “Survey first. Reinforce the upper gallery. If Thrain marks a seam this side of the old ward as safe, we work that seam and not one pace farther.” He meets your eye. “Reclaiming is not the same as forgetting. If it becomes the same, I close the stair myself.”',
            };
        }
        return null;
    }

    function resolve(resolution) {
        const q = quest();
        const spec = resolutionSpec(resolution);
        if (!q || !spec || !canResolve()) return null;
        if (q.status === 'completed') return q;

        q.status = 'completed';
        q.resolution = resolution;
        q.stage = 'completed';
        q.completedAt = Number(root.worldSeconds || 0);
        q.description = resolution === 'seal_below'
            ? 'Balrik ordered the Sunken Deep re-sealed. Kragmoor will protect the surviving hold rather than reopen a danger its ancestors deliberately buried.'
            : resolution === 'survey_only'
                ? 'Balrik authorised a small survey of the Sunken Deep with strict stopping rules and no extraction beyond the old wards.'
                : 'Balrik authorised a survey and tightly bounded reclamation of the safe upper seam, with the old warded threshold left untouched.';

        root.campaign2SunkenDeepPolicy = {
            ...spec.world,
            resolution,
            decidedAt: q.completedAt,
        };
        record(BALRIK, `last_hold:resolution:${resolution}`, spec.balrik);
        record(THRAIN, `last_hold:resolution:${resolution}`, spec.thrain);
        root.showMessage?.('Quest complete: The Last Hold.');
        return { quest: q, text: spec.text };
    }

    function showWarningReport(npc) {
        const q = reportWarning();
        if (!q || typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc,
            'Balrik reads the rubbing without moving for several breaths. “That phrasing is older than my crown. We kept the lesson and lost the place it came from.” He sets the page flat. “The northern halls went quiet one by one while every king swore his own disaster was temporary. Kragmoor is what remained.”\n\nHe looks toward the lower levels. “I will not seal it from reflex, and I will not open it from pride. Tell me what you think we should actually do.”',
            [{ label: 'Let me think — and speak to people who know the stone.', action: () => {} }]
        );
        return true;
    }

    function showThrainCounsel(npc) {
        const q = noteThrainCounsel();
        if (!q || typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc, thrainCounselText(), [{ label: 'Careful folk, clear limits.', action: () => {} }]);
        return true;
    }

    function showMirabelCounsel() {
        const companion = mirabel();
        const q = noteMirabelCounsel();
        if (!companion || !q || typeof root.showDialogue !== 'function') return false;
        root.showDialogue(companion, mirabelCounselText(), [{ label: 'I’ll carry that to Balrik.', action: () => {} }]);
        return true;
    }

    function showResolution(npc) {
        if (!canResolve() || typeof root.showDialogue !== 'function') return false;
        const q = quest();
        const options = [
            {
                label: 'Re-seal the Sunken Deep. Kragmoor has survived by knowing what not to risk.',
                action: () => {
                    const result = resolve('seal_below');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Then it is decided.', action: () => {} }]);
                },
            },
            {
                label: 'Authorise a small survey, with no extraction and written stopping conditions.',
                action: () => {
                    const result = resolve('survey_only');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Then it is decided.', action: () => {} }]);
                },
            },
            {
                label: 'Survey it, reinforce the safe upper gallery, and reclaim only what lies this side of the old wards.',
                action: () => {
                    const result = resolve('bounded_reclamation');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Then it is decided.', action: () => {} }]);
                },
            },
        ];
        if (mirabel() && !q.mirabelCounselHeard) {
            options.splice(1, 0, {
                label: '[Mirabel] Ask how she would approach the old warning.',
                action: showMirabelCounsel,
            });
        }
        const counsel = [];
        if (q.thrainCounselHeard) counsel.push('Thrain’s caution is part of the discussion.');
        if (q.mirabelCounselHeard) counsel.push('Mirabel’s assessment is part of the discussion.');
        const suffix = counsel.length ? `\n\n${counsel.join(' ')}` : '';
        root.showDialogue(npc,
            `Balrik has the warning rubbing beside the mine plans. “Keeping one hold alive is not the same as never opening another door. But I want a policy I can explain to the grandchildren of the folk I send below.”${suffix}`,
            options
        );
        return true;
    }

    function showBalrikMemory(npc) {
        const rel = relationship(BALRIK) || { trust: 0, friendship: 0 };
        let line;
        if (rel.trust < 16) {
            line = 'Balrik’s expression closes. “A king can explain a policy without opening every old wound that made it necessary. For now, the policy is enough.”';
        } else if (rel.friendship < 12) {
            line = '“When I say Kragmoor is the last hold, that is not a boast.” Balrik looks past you toward the mountain wall. “The northern halls did not all fall in glorious battles. Some emptied. Some starved. Some made one clever gamble too many. We took their survivors in and learned to count survival as an achievement.”';
        } else {
            line = 'Balrik is quiet before he answers. “There are old maps in the vault with three dwarven crowns stamped across them. Children look at them and think they are history. I look at them and remember people arriving at Kragmoor with everything they owned tied to their backs.” He gives a small, humourless smile. “So yes. I am suspicious of grand recoveries. I am also tired of teaching our young that survival is the only future they are allowed to imagine.”';
        }
        root.notePersistentCharacterConversation?.(BALRIK, 'balrik:last_hold_memory', { familiarity: 3, trust: 1, friendship: 4 });
        root.showDialogue(npc, line, [{ label: 'That makes the choice clearer.', action: () => {} }]);
        return true;
    }

    function decorateBalrikOptions(npc, options) {
        if (!Array.isArray(options)) return options;
        const decorated = [...options];
        const q = quest();
        if (canStart() && !q) {
            decorated.unshift({
                label: 'I found an old warning below the reopened gallery.',
                action: () => showWarningReport(npc),
            });
        } else if (q?.status === 'active') {
            decorated.unshift({
                label: q.warningReported ? 'About the Sunken Deep — we should decide what Kragmoor does next.' : 'I brought the warning from the Sunken Deep.',
                action: () => q.warningReported ? showResolution(npc) : showWarningReport(npc),
            });
        } else if (q?.status === 'completed') {
            const rel = relationship(BALRIK);
            if ((rel?.familiarity ?? 0) >= 8) {
                decorated.unshift({
                    label: 'When you say Kragmoor is the last hold, what do you remember?',
                    action: () => showBalrikMemory(npc),
                });
            }
        }
        return decorated;
    }

    function decorateThrainOptions(npc, options) {
        if (!Array.isArray(options)) return options;
        const q = quest();
        if (!q || q.status !== 'active' || !q.warningReported || q.thrainCounselHeard) return options;
        return [{
            label: 'Balrik is deciding what to do with the Sunken Deep. What would you advise?',
            action: () => showThrainCounsel(npc),
        }, ...options];
    }

    function wrapDialogueTree(dialogueId, decorator) {
        const trees = root.npcDialogueTrees;
        const base = trees?.[dialogueId];
        if (typeof base !== 'function' || base.__balrikLastHoldAware) return false;
        const wrapped = function(npc) {
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let firstDialogue = true;
            root.showDialogue = function(speaker, text, options) {
                if (firstDialogue && speaker === npc) {
                    firstDialogue = false;
                    const args = [...arguments];
                    args[2] = decorator(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try {
                return base.apply(this, arguments);
            } finally {
                root.showDialogue = originalShowDialogue;
            }
        };
        wrapped.__balrikLastHoldAware = true;
        wrapped.__baseBalrikLastHoldDialogue = base;
        trees[dialogueId] = wrapped;
        return true;
    }

    function wrapWarningReader() {
        const base = root.readSunkenDeepWarning;
        if (typeof base !== 'function' || base.__balrikLastHoldAware) return false;
        const wrapped = function() {
            const result = base.apply(this, arguments);
            markWarningRead();
            return result;
        };
        wrapped.__balrikLastHoldAware = true;
        wrapped.__baseBalrikLastHoldWarning = base;
        root.readSunkenDeepWarning = wrapped;
        return true;
    }

    function install() {
        wrapWarningReader();
        if (root.npcDialogueTrees) {
            wrapDialogueTree('dwarf_king', decorateBalrikOptions);
            wrapDialogueTree('deepholds_runesmith', decorateThrainOptions);
        }
        return true;
    }

    const api = {
        build: BUILD,
        questId: QUEST_ID,
        canStart,
        markWarningRead,
        ensureQuest,
        reportWarning,
        noteThrainCounsel,
        thrainCounselText,
        noteMirabelCounsel,
        mirabelCounselText,
        canResolve,
        resolutionSpec,
        resolve,
        showWarningReport,
        showThrainCounsel,
        showMirabelCounsel,
        showResolution,
        showBalrikMemory,
        install,
    };

    root.balrikLastHold = api;
    root.BALRIK_LAST_HOLD_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
