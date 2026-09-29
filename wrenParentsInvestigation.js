// wrenParentsInvestigation.js
// Wren Talbot's Millbrook personal quest: a multi-route investigation where
// ordinary questioning always works, while Knowledge, Insight/Persuasion,
// Perception and Stealth open parallel shortcuts and richer evidence.
(() => {
    'use strict';

    const BUILD = '20260929-wren-parents-investigation-v1';
    const QUEST_ID = 'wren_parents';
    const MIN_CLUES_TO_RESOLVE = 4;
    const PARENTS = Object.freeze({ mother: 'Mara Talbot', father: 'Galen Talbot' });

    const CLUES = Object.freeze({
        petra_memory: {
            label: 'Petra remembers the Talbots',
            text: 'Petra remembers Mara and Galen Talbot taking winter ledger work for foreman Harl Venn. They vanished days after accusing him of shorting Millbrook relief grain.'
        },
        village_gossip: {
            label: 'The miller saw Venn’s wagon',
            text: 'An old miller remembers Venn’s wagon heading toward the north switchback after midnight with two passengers. It returned before dawn without them.'
        },
        chapel_register: {
            label: 'Two unknown spouses were buried together',
            text: 'The old chapel register records an unidentified married couple recovered after the spring thaw and buried together beside the north wall.'
        },
        north_switchback: {
            label: 'The north-road scene was an ambush',
            text: 'The surviving signs at the old switchback fit an ambush, not an accident: a stopped wagon, a struggle, then two bodies moved off the road.'
        },
        insight_coverup: {
            label: 'Petra admits the old village leadership buried the story',
            text: 'Petra admits the old reeve was frightened of Venn’s employers and ordered the deaths recorded as unknown travelers instead of asking questions.'
        },
        council_ledger: {
            label: 'The council ledger links the dates',
            text: 'The council ledger places two unidentified bodies at the north switchback in the same week Mara and Galen disappeared.'
        },
        erased_names: {
            label: 'Scraped-out names remain in the ledger',
            text: 'A careful look catches shallow letter-strokes under the scraping: M. Talbot and G. Talbot were written into the ledger, then deliberately removed.'
        },
        hidden_freight_tally: {
            label: 'A hidden freight tally proves motive and payment',
            text: 'A duplicate freight tally shows Venn skimming relief grain and a payment to two hired hands marked “two witnesses — silence.” It is the missing proof.'
        },
    });

    function party() {
        return Array.isArray(window.party) ? window.party : [];
    }

    function wren() {
        return party().find((member, index) => index > 0 && member?.name === 'Wren Talbot') || null;
    }

    function petra() {
        return (window.entities || []).find(entity => entity?.name === 'Petra Hollis') || null;
    }

    function maxPartySkill(skillId) {
        return party().reduce((best, member) => Math.max(best, Number(member?.skills?.[skillId] || 0)), 0);
    }

    function hasKnowledgeNature() {
        return party().some(member =>
            (typeof window.hasKnowledgeNature === 'function' && window.hasKnowledgeNature(member)) ||
            member?.skills?.druid_knowledge_nature ||
            member?.skills?.elf_knowledge_nature
        );
    }

    function hasKnowledgeReligion() {
        return party().some(member =>
            (typeof window.hasKnowledgeReligion === 'function' && window.hasKnowledgeReligion(member)) ||
            member?.skills?.knowledge_religion
        );
    }

    function hasStealthTraining() {
        return party().some(member =>
            Number(member?.skills?.stealth_rogue || 0) > 0 ||
            Number(member?.skills?.stealth_agility || 0) > 0
        );
    }

    function quest() {
        return (window.questLog || []).find(entry => entry.id === QUEST_ID) || null;
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Long Silence',
                giver: 'Wren Talbot',
                status: 'active',
                resolution: null,
                description: 'Find out what happened to Wren’s parents, Mara and Galen Talbot, after they came to Millbrook for work and stopped writing home.',
                clues: {},
                clueOrder: [],
                offeredAt: window.worldSeconds || 0,
            };
            window.questLog.push(q);
            if (typeof window.showMessage === 'function') {
                window.showMessage('Companion quest added: The Long Silence.');
            }
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        return q;
    }

    function clueCount(q = quest()) {
        return q ? Object.keys(q.clues || {}).length : 0;
    }

    function addClue(id, source = null) {
        const spec = CLUES[id];
        if (!spec) return false;
        const q = ensureQuest();
        if (q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: window.worldSeconds || 0 };
        q.clueOrder.push(id);
        q.description = clueCount(q) >= MIN_CLUES_TO_RESOLVE
            ? 'You have enough evidence to reconstruct what happened to Mara and Galen Talbot. Talk it through with Wren.'
            : `Investigate what happened to Wren’s parents in Millbrook. Evidence found: ${clueCount(q)}/${MIN_CLUES_TO_RESOLVE}.`;
        if (typeof window.showMessage === 'function') {
            window.showMessage(`Clue found: ${spec.label}.`);
        }
        return true;
    }

    function showResult(npc, text, clueId, source) {
        addClue(clueId, source);
        window.showDialogue(npc, text, [
            { label: 'Keep investigating.', action: () => openInvestigation(npc) }
        ]);
    }

    function ordinaryPetra(npc) {
        showResult(
            npc,
            '“Mara and Galen Talbot?” Petra frowns, then nods slowly. “Yes. They took winter ledger work for Harl Venn, the freight foreman. Nice pair. Too honest for that job, maybe. They accused him of relief grain going missing, then they were gone within the week.”',
            'petra_memory',
            'Petra Hollis'
        );
    }

    function ordinaryVillagers(npc) {
        showResult(
            npc,
            'You spend an hour asking older Millbrook residents. Most remember nothing useful, but the retired miller does: Venn’s wagon went north after midnight with two people riding in back. It came home before dawn empty.',
            'village_gossip',
            'Millbrook residents'
        );
    }

    function ordinaryChapel(npc) {
        showResult(
            npc,
            'The chapel’s oldest burial book is badly water-stained. One entry survives clearly enough: “two unknown travelers, man and wife, recovered after thaw; buried together beside the north wall.” The date is only days after the Talbots vanished.',
            'chapel_register',
            'Millbrook chapel register'
        );
    }

    function ordinaryTrail(npc) {
        showResult(
            npc,
            'At the old north switchback, the place is too weathered to tell a clean story, but the old villagers’ directions lead to a collapsed roadside cairn and the remains of a wagon pull-off. Whatever happened here was hidden away from the main road.',
            'north_switchback',
            'Old north switchback'
        );
    }

    function insightRoute(npc) {
        showResult(
            npc,
            'You let Petra finish, then wait. She looks toward the chapel instead of at Wren. “Fine. There was more. Two bodies came out of the thaw that spring. The old reeve called them strangers and told everyone to leave it alone. Venn had friends with money. People were frightened.”',
            'insight_coverup',
            'Insight'
        );
    }

    function persuasionRoute(npc) {
        showResult(
            npc,
            'Petra hesitates, then unlocks the council chest. “You didn’t hear this from me.” The old ledger records two unidentified adults recovered at the north switchback in exactly the week Mara and Galen disappeared.',
            'council_ledger',
            'Persuasion'
        );
    }

    function religionRoute(npc) {
        showResult(
            npc,
            'The burial shorthand means more to you than it would to most. The priest used the old paired-knot notation reserved for spouses whose names were unknown, and noted a mended wedding cord embroidered with a single “T”. This was not a random pair of travelers.',
            'chapel_register',
            'Knowledge: Religion'
        );
    }

    function natureRoute(npc) {
        showResult(
            npc,
            'Years have softened the site, but not erased it. The wagon stopped deliberately on level ground; old axe scars mark where someone fought beside it, and the disturbed slope below is consistent with two bodies dragged away after the struggle. This was an ambush, not a crash or animal attack.',
            'north_switchback',
            'Knowledge: Nature'
        );
    }

    function perceptionRoute(npc) {
        showResult(
            npc,
            'The council ledger looks ordinary until the light catches shallow scratches in the parchment. Beneath the scraped-out “unknown” entry you can still make out the first strokes of two names: M. Talbot and G. Talbot.',
            'erased_names',
            'Keen Perception'
        );
    }

    function stealthRoute(npc) {
        showResult(
            npc,
            'After dark you slip into the sealed records store without waking the neighbouring cottages. Behind a false stack of spoiled invoices is Venn’s duplicate freight tally: missing relief grain, false weights, and one final payment to two hired hands marked “two witnesses — silence.”',
            'hidden_freight_tally',
            'Stealth'
        );
    }

    function evidenceSummary(q) {
        const ids = q?.clueOrder || [];
        if (!ids.length) return 'You have not found anything solid yet.';
        return ids.map(id => `• ${CLUES[id]?.label || id}`).join('\n');
    }

    function resolveWithWren(npc) {
        const companion = wren();
        const q = quest();
        if (!companion || !q || q.status === 'completed' || clueCount(q) < MIN_CLUES_TO_RESOLVE) return;

        const hasProof = !!q.clues.hidden_freight_tally;
        const hasCoverup = !!(q.clues.insight_coverup || q.clues.erased_names || q.clues.council_ledger);
        const fullTruth = hasProof || (clueCount(q) >= 5 && hasCoverup);

        const truth = fullTruth
            ? 'The pieces finally fit. Mara and Galen discovered Harl Venn was stealing Millbrook’s winter relief grain. They meant to expose him. Venn paid men to stop them at the north switchback; the old reeve buried the scandal along with their names.'
            : 'The pieces are enough. Mara and Galen did not abandon Wren. They disappeared after challenging Harl Venn, and the unidentified married couple buried after the thaw were almost certainly them. Someone in old Millbrook made sure the record stayed vague.';

        const options = [
            {
                label: '“Whatever you want to do with this, I’m with you.”',
                action: () => completeQuest(companion, q, fullTruth, 'support')
            },
            {
                label: '“We can put their names back in the register.”',
                action: () => completeQuest(companion, q, fullTruth, 'restore_names')
            },
            {
                label: '“At least you finally know what happened.”',
                action: () => completeQuest(companion, q, fullTruth, 'closure')
            },
        ];

        window.showDialogue(companion,
            `${truth}\n\nWren is quiet for a long time. “All those years I thought maybe they chose not to come back.”`,
            options
        );
    }

    function completeQuest(companion, q, fullTruth, resolution) {
        if (q.status === 'completed') return;
        q.status = 'completed';
        q.resolution = resolution;
        q.fullTruth = !!fullTruth;
        q.completedAt = window.worldSeconds || 0;
        q.description = fullTruth
            ? 'You uncovered the truth about Mara and Galen Talbot and gave Wren the closure she had been denied.'
            : 'You found enough evidence to establish that Mara and Galen Talbot died near Millbrook and did not abandon Wren.';

        let event;
        let line;
        if (resolution === 'support') {
            event = {
                approval: fullTruth ? 7 : 5,
                trust: fullTruth ? 18 : 14,
                reason: 'stood beside Wren while uncovering the truth about her parents',
            };
            line = 'Wren nods once, eyes fixed on the chapel wall. “Then we do it my way. But… stay for this bit.”';
        } else if (resolution === 'restore_names') {
            event = {
                approval: fullTruth ? 8 : 6,
                trust: fullTruth ? 16 : 13,
                reason: 'helped restore Mara and Galen Talbot’s names to Millbrook’s record',
            };
            line = '“Yeah,” Wren says. “They get their names back. Whatever else happened, they get that.”';
            q.namesRestored = true;
        } else {
            event = {
                approval: fullTruth ? 4 : 3,
                trust: fullTruth ? 14 : 11,
                reason: 'helped Wren learn what happened to her parents',
            };
            line = 'Wren lets out a breath she seems to have been holding for years. “Knowing hurts. Not knowing was worse.”';
        }

        if (typeof window.noteWrenDispositionEvent === 'function') {
            window.noteWrenDispositionEvent(`parents_investigation:${resolution}`, event);
        }
        if (typeof window.adjustCompanionRelationship === 'function') {
            window.adjustCompanionRelationship(companion, { familiarity: fullTruth ? 5 : 3 }, 'shared Wren parent investigation');
        }
        if (typeof window.gainExp === 'function') window.gainExp(fullTruth ? 300 : 200);
        if (typeof window.showMessage === 'function') {
            window.showMessage(`Companion quest complete: The Long Silence.${fullTruth ? ' Full truth uncovered.' : ''}`);
        }
        window.showDialogue(companion, line, [{ label: 'Stay with her a while.', action: () => {} }]);
    }

    function openInvestigation(npc = petra()) {
        const companion = wren();
        if (!companion || !npc) return false;
        const q = ensureQuest();

        if (q.status === 'completed') {
            window.showDialogue(npc,
                q.namesRestored
                    ? 'Petra has had the chapel and council records amended: Mara and Galen Talbot are no longer listed as unknown.'
                    : 'Petra keeps her voice low. “I’m sorry it took this long for the truth to come out.”',
                [{ label: 'Thank you.', action: () => {} }]
            );
            return true;
        }

        const options = [];
        if (!q.clues.petra_memory) {
            options.push({ label: 'Ask Petra what she remembers.', action: () => ordinaryPetra(npc) });
        }
        if (q.clues.petra_memory && !q.clues.village_gossip) {
            options.push({ label: 'Ask around among Millbrook’s older residents.', action: () => ordinaryVillagers(npc) });
        }
        if (q.clues.village_gossip && !q.clues.chapel_register) {
            options.push({ label: 'Search the old chapel burial book.', action: () => ordinaryChapel(npc) });
        }
        if (q.clues.chapel_register && !q.clues.north_switchback) {
            options.push({ label: 'Walk the old north switchback and look for the site.', action: () => ordinaryTrail(npc) });
        }

        if (maxPartySkill('insight') > 0 && !q.clues.insight_coverup) {
            options.push({ label: '[Insight] Petra is leaving something out.', action: () => insightRoute(npc) });
        }
        if (maxPartySkill('persuasion') > 0 && !q.clues.council_ledger) {
            options.push({ label: '[Persuasion] Convince Petra to open the old council records.', action: () => persuasionRoute(npc) });
        }
        if (hasKnowledgeReligion() && !q.clues.chapel_register) {
            options.push({ label: '[Knowledge: Religion] Read the chapel burial notation properly.', action: () => religionRoute(npc) });
        }
        if (hasKnowledgeNature() && !q.clues.north_switchback) {
            options.push({ label: '[Knowledge: Nature] Reconstruct what happened at the north switchback.', action: () => natureRoute(npc) });
        }
        if (maxPartySkill('keen_perception') > 0 && !q.clues.erased_names) {
            options.push({ label: '[Keen Perception] Examine the old ledger for alterations.', action: () => perceptionRoute(npc) });
        }
        if (hasStealthTraining() && !q.clues.hidden_freight_tally) {
            options.push({ label: '[Stealth] Slip into the sealed records store after dark.', action: () => stealthRoute(npc) });
        }

        if (clueCount(q) >= MIN_CLUES_TO_RESOLVE) {
            options.unshift({
                label: `Put the evidence together with Wren. (${clueCount(q)} clues)`,
                action: () => resolveWithWren(npc)
            });
        }

        options.push({
            label: 'Review the evidence.',
            action: () => window.showDialogue(companion, evidenceSummary(q), [
                { label: 'Back to the investigation.', action: () => openInvestigation(npc) }
            ])
        });
        options.push({ label: 'Leave it for now.', action: () => {} });

        const line = clueCount(q)
            ? `You have ${clueCount(q)} pieces of evidence. There are several ways to keep digging.`
            : 'Petra’s expression changes when Wren gives her surname. “Talbot? I haven’t heard that name in years.”';

        window.showDialogue(npc, line, options);
        return true;
    }

    function eligibleForInvestigation() {
        const companion = wren();
        if (!companion) return false;
        if (quest()) return true;
        return !!(companion.wrenParentsShared || companion.wrenParentsSearchPromised || companion.wrenParentsReachedMillbrook);
    }

    function installPetraHook() {
        const trees = window.npcDialogueTrees;
        if (!trees || typeof trees.petra_hollis !== 'function' || trees.petra_hollis.__wrenParentsAware) return false;
        const base = trees.petra_hollis;
        const wrapped = function(npc) {
            if (!eligibleForInvestigation()) return base.apply(this, arguments);
            const q = quest();
            const options = [
                {
                    label: q?.status === 'completed' ? 'About the Talbots…' : 'We’re looking for Wren’s parents.',
                    action: () => openInvestigation(npc),
                },
                {
                    label: 'I wanted to ask about something else.',
                    action: () => base.call(this, npc),
                },
            ];
            const line = q?.status === 'completed'
                ? 'Petra gives Wren a quieter look than usual. “What do you need?”'
                : 'Petra looks from you to Wren. “All right. Ask.”';
            window.showDialogue(npc, line, options);
        };
        wrapped.__wrenParentsAware = true;
        wrapped.__basePetraHollis = base;
        trees.petra_hollis = wrapped;
        return true;
    }

    function installWrenDialogueHook() {
        if (typeof window.showDialogue !== 'function' || window.showDialogue.__wrenParentsInvestigationAware) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            const companion = wren();
            let nextOptions = options;
            if (companion && npc?.name === 'Wren Talbot' && text === "What's on your mind?" && Array.isArray(options)) {
                const q = quest();
                if (q?.status === 'active') {
                    nextOptions = [
                        ...options,
                        {
                            label: 'About the search for your parents…',
                            action: () => {
                                const p = petra();
                                if (p) openInvestigation(p);
                                else window.showDialogue(companion, 'We should ask around once we are back in Millbrook.', [{ label: 'Right.', action: () => {} }]);
                            },
                        },
                    ];
                } else if (q?.status === 'completed') {
                    nextOptions = [
                        ...options,
                        {
                            label: 'About your parents…',
                            action: () => window.showDialogue(
                                companion,
                                q.namesRestored
                                    ? '“Seeing their names in the book was strange. Good strange. Like they were real again, not just a story I kept telling myself.”'
                                    : '“I’m still working out what to do with knowing. But I’d rather have the truth than another ten years of guessing.”',
                                [{ label: 'I’m here.', action: () => {} }]
                            ),
                        },
                    ];
                }
            }
            const args = Array.from(arguments);
            if (args.length >= 3 || nextOptions !== undefined) args[2] = nextOptions;
            return base.apply(this, args);
        };
        wrapped.__wrenParentsInvestigationAware = true;
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function maybeStartAtMillbrook() {
        const companion = wren();
        if (!companion || quest()?.status === 'completed') return;
        if (!companion.wrenParentsReachedMillbrook) return;
        ensureQuest();
    }

    function refreshHooks() {
        installPetraHook();
        installWrenDialogueHook();
        maybeStartAtMillbrook();
    }

    window.wrenParentsInvestigation = {
        build: BUILD,
        questId: QUEST_ID,
        parents: PARENTS,
        clues: CLUES,
        minCluesToResolve: MIN_CLUES_TO_RESOLVE,
        ensureQuest,
        addClue,
        clueCount,
        openInvestigation,
        resolveWithWren,
        refreshHooks,
        skillAccess: {
            insight: () => maxPartySkill('insight') > 0,
            persuasion: () => maxPartySkill('persuasion') > 0,
            religion: hasKnowledgeReligion,
            nature: hasKnowledgeNature,
            perception: () => maxPartySkill('keen_perception') > 0,
            stealth: hasStealthTraining,
        },
    };

    refreshHooks();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshHooks, { once: true });
    setInterval(refreshHooks, 1000);

    window.WREN_PARENTS_INVESTIGATION_BUILD = BUILD;
})();