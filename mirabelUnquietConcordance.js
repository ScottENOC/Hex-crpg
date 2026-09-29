// mirabelUnquietConcordance.js
// Mirabel Quill's first post-recruitment companion quest.
//
// The book she joined the party to recover from the spider ruin becomes the
// inciting object rather than being forgotten after recruitment. Its harmless
// scholarship about post-mortem magical "echoes" sits one conceptual step away
// from the soul-binding techniques used by the Vessel-Seeker. The player can
// investigate it without any specialist skill; Arcane/Wizard, Persuasion,
// Stealth, Religion and existing necromancer evidence add shortcuts or context.
(() => {
    'use strict';

    const BUILD = '20260930-mirabel-unquiet-concordance-v1';
    const MIRABEL_NAME = 'Mirabel Quill';
    const QUEST_ID = 'mirabel_unquiet_concordance';
    const PERSONAL_DIALOGUE_ID = 'companion_mirabel_quill';

    const CLUES = Object.freeze({
        ruin_folio: Object.freeze({
            label: 'The spider-ruin folio is part of the Concordance of Last Echoes',
            text: 'The damaged book Mirabel recovered is a surviving section of the Concordance of Last Echoes, a serious magical study of the impressions people and creatures leave behind after death. Several pages point to a restricted Silverhart appendix that is missing from this copy.'
        }),
        dealer_provenance: Object.freeze({
            label: 'The Concordance was withdrawn from ordinary sale',
            text: 'Corvin Ashe recognises the title. Silverhart copies were withdrawn from ordinary sale after later scholars used its echo-preservation method as the basis for increasingly dangerous binding experiments.'
        }),
        court_catalogue: Object.freeze({
            label: 'The royal archive still holds the restricted appendix',
            text: 'Court Wizard Thessaly confirms the royal archive keeps the missing appendix under restriction. The original method anchors a fading magical echo into a prepared object; the dangerous later work begins when an echo stops being treated as an echo and starts being treated as a person to be held.'
        }),
        cult_parallel: Object.freeze({
            label: 'The theory overlaps with the Vessel-Seeker’s soul-binding work',
            text: 'Comparing the Concordance with known necromantic signs makes the family resemblance obvious. The book is not itself a necromantic manual, but its anchoring geometry is one of the conceptual building blocks a phylactery-maker could extend into true soul binding.'
        }),
        restricted_appendix: Object.freeze({
            label: 'You obtained a transcription of the restricted appendix',
            text: 'You now have the missing appendix: enough to preserve the scholarship, restrict or destroy the dangerous method, or deliberately test a constrained form of it.'
        }),
    });

    const party = () => Array.isArray(window.party) ? window.party : [];
    const mirabel = () => party().find((member, index) => index > 0 && member?.name === MIRABEL_NAME) || null;
    const quest = () => (window.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    const maxPartySkill = id => party().reduce((best, member) => Math.max(best, Number(member?.skills?.[id] || 0)), 0);

    function clampAxis(value) {
        const n = Number(value);
        return Math.max(-100, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0));
    }

    function treeRank(member, treeName) {
        if (!member?.skills || !window.skills) return 0;
        return Object.entries(member.skills).reduce((total, [id, rank]) => {
            return total + (window.skills[id]?.tree === treeName ? Number(rank || 0) : 0);
        }, 0);
    }

    function partyTreeRank(treeName) {
        return party().reduce((best, member) => Math.max(best, treeRank(member, treeName)), 0);
    }

    function hasWizardTraining() {
        if (typeof window.getPartyMaxClassLevel === 'function' && window.getPartyMaxClassLevel('wizard') > 0) return true;
        return partyTreeRank('wizard') > 0 || partyTreeRank('arcane') > 0;
    }

    function hasReligionTraining() {
        return party().some(member =>
            Number(member?.skills?.knowledge_religion || 0) > 0 ||
            (typeof window.hasKnowledgeReligion === 'function' && window.hasKnowledgeReligion(member))
        );
    }

    function hasStealthTraining() {
        return party().some(member =>
            Number(member?.skills?.stealth_rogue || 0) > 0 ||
            Number(member?.skills?.stealth_agility || 0) > 0
        );
    }

    function relationshipReady() {
        return typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    function ensureMirabelStart() {
        const companion = mirabel();
        if (!companion) return false;
        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: 14,
            trust: 16,
            approval: 55,
        };
        if (!relationshipReady()) return false;

        const current = companion.playerRelationship;
        const history = Array.isArray(current?.history) ? current.history : [];
        const untouchedGeneric = !current || (
            Number(current.familiarity ?? 10) === 10 &&
            Number(current.trust ?? 10) === 10 &&
            history.length === 0
        );
        if (untouchedGeneric) {
            window.setCompanionRelationship(companion, {
                familiarity: 14,
                trust: 16,
                ...(window.companionAttitude?.[MIRABEL_NAME] === undefined ? { approval: 55 } : {}),
            }, 'authored_start:mirabel_spider_ruin_recruitment');
        } else {
            window.getCompanionRelationship(companion);
        }
        return true;
    }

    function ensureArc() {
        const companion = mirabel();
        if (!companion) return null;
        const existing = companion.mirabelCharacterArc || {};
        companion.mirabelCharacterArc = {
            // Negative restraint = curiosity/knowledge first. Positive =
            // deliberate limits and responsibility around dangerous knowledge.
            restraint: clampAxis(existing.restraint ?? -20),
            // Negative rootedness = reflexive mobility/avoidance of dependence.
            // Positive = willingness to choose people/places and stay invested.
            rootedness: clampAxis(existing.rootedness ?? -25),
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            dialogueChoiceKeys: Array.isArray(existing.dialogueChoiceKeys) ? existing.dialogueChoiceKeys : [],
            history: Array.isArray(existing.history) ? existing.history : [],
        };
        return companion.mirabelCharacterArc;
    }

    function applyArcChange(key, delta = {}, reason = null) {
        const arc = ensureArc();
        if (!arc || !key) return null;
        const stableKey = String(key);
        if (arc.knownEventKeys.includes(stableKey)) return getArcState();
        arc.knownEventKeys.push(stableKey);
        if (arc.knownEventKeys.length > 100) arc.knownEventKeys.splice(0, arc.knownEventKeys.length - 100);
        arc.restraint = clampAxis(arc.restraint + Number(delta.restraint || 0));
        arc.rootedness = clampAxis(arc.rootedness + Number(delta.rootedness || 0));
        arc.history.push({
            key: stableKey,
            reason: reason || stableKey,
            worldSeconds: Number(window.worldSeconds || 0),
            restraint: arc.restraint,
            rootedness: arc.rootedness,
        });
        if (arc.history.length > 80) arc.history.splice(0, arc.history.length - 80);
        return getArcState();
    }

    function getArcState() {
        const arc = ensureArc();
        if (!arc) return null;
        let scholarship = 'curious_scholar';
        if (arc.restraint <= -45) scholarship = 'unfettered_scholar';
        else if (arc.restraint >= 45) scholarship = 'cautious_scholar';
        else if (arc.restraint >= 15) scholarship = 'responsible_scholar';

        let attachment = 'itinerant';
        if (arc.rootedness >= 35) attachment = 'rooted';
        else if (arc.rootedness >= 5) attachment = 'choosing_to_stay';
        else if (arc.rootedness <= -45) attachment = 'flight_bound';
        return {
            restraint: arc.restraint,
            rootedness: arc.rootedness,
            scholarship,
            attachment,
        };
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Unquiet Concordance',
                giver: MIRABEL_NAME,
                status: 'active',
                resolution: null,
                description: 'Trace the damaged magical folio Mirabel recovered from the spider ruin and find the missing Silverhart appendix it references.',
                clues: {},
                clueOrder: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            window.showMessage?.('Companion quest added: The Unquiet Concordance.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        return q;
    }

    function clueCount(q = quest()) {
        return q ? Object.keys(q.clues || {}).length : 0;
    }

    function canResolve(q = quest()) {
        return !!(q && q.status === 'active' && q.clues?.restricted_appendix);
    }

    function addClue(id, source = null) {
        const spec = CLUES[id];
        if (!spec) return false;
        const q = ensureQuest();
        if (q.clues[id]) return false;
        q.clues[id] = {
            found: true,
            source,
            text: spec.text,
            at: Number(window.worldSeconds || 0),
        };
        q.clueOrder.push(id);
        q.description = canResolve(q)
            ? 'You have the restricted appendix. Decide with Mirabel what should happen to the dangerous parts of the Concordance.'
            : 'Trace the Concordance of Last Echoes through Silverhart and find its missing restricted appendix.';
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function startQuest() {
        const companion = mirabel();
        if (!companion) return false;
        ensureMirabelStart();
        ensureArc();
        const q = ensureQuest();
        if (!q.clues.ruin_folio) {
            addClue('ruin_folio', 'book recovered from the spider ruin');
            window.noteCompanionConversation?.(companion, 'mirabel:unquiet_concordance_opened', 3);
        }
        return q;
    }

    function showQuestOpening() {
        const companion = mirabel();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        startQuest();
        window.showDialogue(companion,
            'Mirabel produces the battered book she took from the spider ruin. “I thought this was a reagent catalogue. Better. It is part of the Concordance of Last Echoes — old work on the magical impressions living things leave behind when they die.”\n\nShe taps a run of missing page numbers. “Unfortunately, every interesting argument points to an appendix somebody very deliberately removed from ordinary copies. Silverhart will have one.”',
            [
                { label: '“Then we find the missing appendix.”', action: () => {} },
                { label: '“Anything about trapping souls?”', action: () => {
                    if (hasReligionTraining() || window.discipleSuspected || window.phylacteryReturned || window.player?.inventory?.includes('phylactery_shard')) {
                        addClue('cult_parallel', 'existing necromancy knowledge');
                        window.showDialogue(companion, 'Mirabel’s expression sharpens. “Not directly. That is the important distinction. But yes — the geometry is related. This preserves an echo. Give a less scrupulous mage enough time and they might start asking what else can be made to stay.”', [{ label: 'That is what worries me.', action: () => {} }]);
                    } else {
                        window.showDialogue(companion, '“Not in these pages. Echoes, impressions, residual magic. It is scholarship, not a resurrection manual.” She pauses. “Though I admit I would like to see what the missing author thought needed locking away.”', [{ label: 'So would I.', action: () => {} }]);
                    }
                } },
            ]
        );
        return true;
    }

    function recordDealerProvenance(npc = null) {
        startQuest();
        addClue('dealer_provenance', npc?.name || 'Corvin Ashe');
        if (npc && typeof window.showDialogue === 'function') {
            window.showDialogue(npc,
                'Corvin turns the copied title page sideways. “Haven’t seen one of these in years. Concordance of Last Echoes. The crown never banned the harmless chapters; it simply stopped letting ordinary dealers sell the appendix after some bright young magi decided ‘preserve an echo’ sounded like an invitation to see how much of a dead person they could keep.”',
                [{ label: 'The royal archive still has it?', action: () => window.showDialogue(npc, '“Almost certainly. Thessaly’s tower keeps things too dangerous to sell and too useful to burn.”', [{ label: 'Good to know.', action: () => {} }]) }]
            );
        }
        return true;
    }

    function recordCourtCatalogue(npc = null) {
        startQuest();
        addClue('court_catalogue', npc?.name || 'Court Wizard Thessaly');
        if (npc && typeof window.showDialogue === 'function') {
            window.showDialogue(npc,
                'Thessaly recognises the citation immediately. “The original appendix is restricted, not forbidden. There is a difference. It describes how to anchor a fading magical echo into a prepared vessel. Useful for investigation, memorial magic, sometimes medicine. Dangerous when an idiot decides an echo and a soul are the same thing.”',
                [{ label: 'We want to read it.', action: () => {} }]
            );
        }
        return true;
    }

    function obtainRestrictedAppendix(source = 'royal archive', npc = null) {
        const q = startQuest();
        if (!q || q.clues.restricted_appendix) return false;
        addClue('restricted_appendix', source);
        if (npc && typeof window.showDialogue === 'function') {
            window.showDialogue(npc,
                'A supervised transcription takes most of an hour. Mirabel copies the equations twice and the cautions once. When she reaches the final diagram her quill stops. “Oh,” she says softly. “That really is clever.” Then, after another moment: “And I can see exactly why someone locked it up.”',
                [{ label: 'We should talk about what we do with it.', action: () => {} }]
            );
        }
        return true;
    }

    function recordCultParallel(source = 'necromancy evidence') {
        startQuest();
        return addClue('cult_parallel', source);
    }

    function ordinaryArchiveReady(q = quest()) {
        return !!(q?.clues?.dealer_provenance && q?.clues?.court_catalogue);
    }

    function investigateDealer(npc) {
        const q = startQuest();
        if (!q) return false;
        if (!q.clues.dealer_provenance) return recordDealerProvenance(npc);
        window.showDialogue(npc,
            '“The royal archive is still your best chance,” Corvin says. “I sell magic. Thessaly keeps the things magic sellers are not supposed to.”',
            [{ label: 'Understood.', action: () => {} }]
        );
        return true;
    }

    function investigateThessaly(npc) {
        const q = startQuest();
        if (!q) return false;
        if (!q.clues.court_catalogue) {
            recordCourtCatalogue(npc);
            return true;
        }
        if (q.clues.restricted_appendix) {
            window.showDialogue(npc, '“You have your transcription. What you do with it is now a question of judgement, not access.”', [{ label: 'Fair.', action: () => {} }]);
            return true;
        }

        const options = [];
        if (ordinaryArchiveReady(q)) {
            options.push({
                label: 'Ask to make a supervised transcription with Mirabel.',
                action: () => obtainRestrictedAppendix('supervised royal archive transcription', npc),
            });
        }
        if (hasWizardTraining()) {
            options.push({
                label: '[Wizard/Arcane] Demonstrate that you understand the anchoring theorem well enough to read it safely.',
                action: () => obtainRestrictedAppendix('Arcane competence — royal archive', npc),
            });
        }
        if (maxPartySkill('persuasion') > 0) {
            options.push({
                label: '[Persuasion] Ask Thessaly to judge Mirabel by what she does with the knowledge, not by what someone else once did.',
                action: () => obtainRestrictedAppendix('Persuasion — royal archive', npc),
            });
        }
        options.push({ label: 'Leave it for now.', action: () => {} });
        window.showDialogue(npc,
            'Thessaly folds her arms. “Restricted means I need a reason to believe this will remain scholarship when it leaves my tower.”',
            options
        );
        return true;
    }

    function stealRestrictedAppendix() {
        const q = startQuest();
        if (!q || q.clues.restricted_appendix || !hasStealthTraining()) return false;
        obtainRestrictedAppendix('Stealth — copied after hours from the royal archive');
        window.showDialogue?.(mirabel(),
            'Mirabel checks the copied diagrams against the folio by lamplight. “For the record, I was absolutely going to suggest asking again before we burgled the Court Wizard.” A pause. “For the other record, this is an excellent copy.”',
            [{ label: 'You are welcome.', action: () => {} }]
        );
        return true;
    }

    function resolutionSpec(resolution) {
        if (resolution === 'preserve_open') {
            return {
                relationship: { approval: 8, trust: 5, familiarity: 4 },
                affinity: { friendship: 6, romanticBond: 2, attraction: 2 },
                arc: { restraint: -18, rootedness: 1 },
                reason: 'trusted Mirabel to preserve dangerous scholarship without restricting access',
                line: 'Mirabel smiles slowly. “Good. Knowledge is not safer because fewer people can challenge it. We keep the whole thing — warnings, mistakes, brilliance and all.”',
            };
        }
        if (resolution === 'preserve_sealed') {
            return {
                relationship: { approval: 6, trust: 10, familiarity: 5 },
                affinity: { friendship: 7, romanticBond: 3, attraction: 1 },
                arc: { restraint: 16, rootedness: 3 },
                reason: 'helped Mirabel preserve the Concordance while accepting responsibility for who can use its dangerous appendix',
                line: 'Mirabel looks unhappy for perhaps three seconds, then nods. “Keep the work. Control the dangerous copy. Fine. I dislike that this is sensible, which is usually how I recognise good advice.”',
            };
        }
        if (resolution === 'destroy_appendix') {
            return {
                relationship: { approval: -5, trust: 4, familiarity: 5 },
                affinity: { friendship: 2, romanticBond: 1 },
                arc: { restraint: 28, rootedness: 2 },
                reason: 'drew a hard boundary around soul-binding-adjacent magic even though Mirabel wanted the knowledge preserved',
                line: 'Mirabel watches the dangerous pages burn without pretending she likes it. “I think you are wrong.” She glances at you. “I also know exactly why you did it. Those are not the same thing as not trusting you.”',
            };
        }
        return {
            relationship: { approval: 10, trust: 6, familiarity: 4 },
            affinity: { friendship: 5, romanticBond: 2, attraction: 4 },
            arc: { restraint: -28, rootedness: 2 },
            reason: 'joined Mirabel in testing a constrained echo-anchoring experiment',
            line: 'The dead spider’s fading magical trace catches in the prepared shard for less than a heartbeat: movement without thought, memory without a mind. Mirabel is grinning before the light has even gone. “That was either excellent scholarship or the first sentence of a cautionary tale.”',
        };
    }

    function adjustResolutionRelationship(companion, resolution, spec) {
        if (typeof window.noteCompanionDispositionEvent === 'function') {
            window.noteCompanionDispositionEvent(companion, `mirabel_concordance:${resolution}`, {
                approval: spec.relationship.approval,
                trust: spec.relationship.trust,
                reason: spec.reason,
            });
        } else {
            window.adjustCompanionRelationship?.(companion, {
                approval: spec.relationship.approval,
                trust: spec.relationship.trust,
            }, spec.reason);
        }
        window.adjustCompanionRelationship?.(companion, { familiarity: spec.relationship.familiarity }, spec.reason);
        window.adjustCompanionAffinity?.(companion, spec.affinity, spec.reason, `mirabel_concordance:${resolution}`);
        applyArcChange(`resolution:${resolution}`, spec.arc, spec.reason);
    }

    function completeQuest(resolution) {
        const companion = mirabel();
        const q = quest();
        if (!companion || !q || !canResolve(q) || q.status === 'completed') return false;
        if (!['preserve_open', 'preserve_sealed', 'destroy_appendix', 'experiment'].includes(resolution)) return false;

        const spec = resolutionSpec(resolution);
        q.status = 'completed';
        q.resolution = resolution;
        q.completedAt = Number(window.worldSeconds || 0);
        q.appendixDestroyed = resolution === 'destroy_appendix';
        q.archivePolicy = resolution === 'preserve_open' ? 'open_copy' : resolution === 'preserve_sealed' ? 'sealed_copy' : null;
        q.echoExperimented = resolution === 'experiment';
        if (q.echoExperimented) window.mirabelEchoTechniqueLearned = true;
        q.description = resolution === 'destroy_appendix'
            ? 'The harmless Concordance survives, but you and Mirabel destroyed the restricted echo-anchoring appendix.'
            : resolution === 'experiment'
                ? 'You preserved the Concordance and successfully tested a constrained form of its echo-anchoring method.'
                : resolution === 'preserve_sealed'
                    ? 'You preserved the whole Concordance, keeping the dangerous appendix under deliberate restriction.'
                    : 'You preserved the whole Concordance without restricting the recovered appendix.';

        adjustResolutionRelationship(companion, resolution, spec);
        window.gainExp?.(250);
        window.showMessage?.('Companion quest complete: The Unquiet Concordance.');
        window.showDialogue?.(companion, spec.line, [{ label: 'Stay with Mirabel a while.', action: () => {} }]);
        setTimeout(() => showAftermath(), 0);
        return true;
    }

    function openResolution() {
        const companion = mirabel();
        const q = quest();
        if (!companion || !canResolve(q) || typeof window.showDialogue !== 'function') return false;
        const cultLine = q.clues.cult_parallel
            ? ' You have also seen enough necromancy to know how easily the anchoring geometry can be extended toward soul binding.'
            : '';
        window.showDialogue(companion,
            `Mirabel spreads the copied appendix beside the ruined folio. “So. This can preserve a fading echo. Not a soul, not a person — but close enough to tempt exactly the wrong sort of clever mind.”${cultLine}\n\nShe looks at you. “What do we do with it?”`,
            [
                { label: '“Keep the whole thing. Knowledge needs scrutiny, not a locked door.”', action: () => completeQuest('preserve_open') },
                { label: '“Preserve it, but keep the dangerous appendix restricted.”', action: () => completeQuest('preserve_sealed') },
                { label: '“Keep the harmless scholarship. Destroy the binding method.”', action: () => completeQuest('destroy_appendix') },
                { label: '“Before deciding, we test the method under controlled conditions.”', action: () => completeQuest('experiment') },
            ]
        );
        return true;
    }

    function clueSummary(q = quest()) {
        if (!q?.clueOrder?.length) return 'You have not traced the folio yet.';
        return q.clueOrder.map(id => `• ${CLUES[id]?.label || id}`).join('\n');
    }

    function openQuestHub() {
        const companion = mirabel();
        const q = startQuest();
        if (!companion || !q || typeof window.showDialogue !== 'function') return false;
        if (canResolve(q)) return openResolution();
        const options = [
            { label: 'Review what we know.', action: () => window.showDialogue(companion, clueSummary(q), [{ label: 'Back.', action: () => openQuestHub() }]) },
        ];
        if (hasStealthTraining() && q.clues.court_catalogue && !q.clues.restricted_appendix) {
            options.push({ label: '[Stealth] “We could copy Thessaly’s appendix after hours.”', action: () => stealRestrictedAppendix() });
        }
        if ((window.player?.inventory?.includes('phylactery_shard') || window.phylacteryReturned) && !q.clues.cult_parallel) {
            options.push({ label: 'Compare the Concordance with what we know about the phylactery.', action: () => {
                recordCultParallel('phylactery evidence');
                window.showDialogue(companion, 'Mirabel overlays the diagrams mentally, expression losing some of its amusement. “There. Same anchoring logic, pushed much further. The Concordance is not necromancy. But someone building a phylactery could absolutely have learned from this family of work.”', [{ label: 'That changes the stakes.', action: () => {} }]);
            } });
        }
        options.push({ label: 'Keep looking in Silverhart.', action: () => window.showMessage?.('Corvin Ashe can identify the book’s provenance; Court Wizard Thessaly controls the royal magical archive.') });
        window.showDialogue(companion, 'Mirabel has filled the margins of the ruined folio with increasingly impatient notes.', options);
        return true;
    }

    function applyDialogueChoice(key, arcDelta, affinityDelta, relationshipDelta, response) {
        const companion = mirabel();
        const arc = ensureArc();
        if (!companion || !arc || arc.dialogueChoiceKeys.includes(key)) return false;
        arc.dialogueChoiceKeys.push(key);
        applyArcChange(`dialogue:${key}`, arcDelta, `Mirabel conversation: ${key}`);
        if (affinityDelta) window.adjustCompanionAffinity?.(companion, affinityDelta, `Mirabel conversation: ${key}`, `mirabel_dialogue:${key}`);
        if (relationshipDelta) window.adjustCompanionRelationship?.(companion, relationshipDelta, `Mirabel conversation: ${key}`);
        if (response) window.showDialogue?.(companion, response, [{ label: 'Mm.', action: () => {} }]);
        return true;
    }

    function openMovingOnConversation() {
        const companion = mirabel();
        const arc = ensureArc();
        if (!companion || !arc || typeof window.showDialogue !== 'function') return false;
        const already = arc.dialogueChoiceKeys.some(key => key.startsWith('staying_'));
        if (already) {
            const state = getArcState();
            const line = state.rootedness >= 5
                ? '“I still like roads,” Mirabel says. “I am merely beginning to accept that choosing to stay somewhere is not the same thing as failing to leave.”'
                : '“I still travel light. It is easier to decide what you want when you know you can walk away from it.”';
            window.showDialogue(companion, line, [{ label: 'Fair.', action: () => {} }]);
            return true;
        }
        window.showDialogue(companion,
            'Mirabel shrugs. “Staying turns into expectations. Expectations turn into obligations. Roads are wonderfully honest: they only ask that you keep walking.”',
            [
                {
                    label: '“Staying because you choose to isn’t the same as being trapped.”',
                    action: () => applyDialogueChoice('staying_is_choice', { rootedness: 8 }, { friendship: 4, romanticBond: 1 }, { familiarity: 2 }, 'Mirabel studies you. “Annoyingly precise distinction. I’ll allow it.”'),
                },
                {
                    label: '“There’s nothing wrong with leaving before people start making claims on you.”',
                    action: () => applyDialogueChoice('staying_keep_moving', { rootedness: -8 }, { friendship: 2 }, { familiarity: 1 }, '“Exactly.” Mirabel points at you. “Someone in this party understands sensible luggage.”'),
                },
                {
                    label: '“Maybe you just haven’t found anything worth staying for yet.”',
                    action: () => applyDialogueChoice('staying_flirt', { rootedness: 3 }, { friendship: 2, romanticBond: 2, attraction: 2 }, { familiarity: 1 }, 'Mirabel’s smile becomes very deliberate. “Careful. That almost sounded like an offer to become a counterexample.”'),
                },
            ]
        );
        return true;
    }

    function aftermathMode() {
        const companion = mirabel();
        if (!companion) return 'none';
        const affinity = window.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
        const rel = window.getCompanionRelationship?.(companion) || {};
        const friendship = Number(affinity.friendship || 0);
        const romance = Number(affinity.romanticBond || 0);
        const attraction = Number(affinity.attraction || 0);
        if (romance >= 30 && friendship >= 40 && Number(rel.trust || 0) >= 25) return 'romantic';
        if (friendship >= 45 && attraction >= 30 && romance < 25) return 'friends_with_benefits';
        if (attraction >= 40 && friendship < 45 && romance < 20) return 'casual';
        if (friendship >= 45) return 'close_friend';
        return 'scholarly';
    }

    function showAftermath() {
        const companion = mirabel();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        const mode = aftermathMode();
        if (mode === 'romantic') {
            window.showDialogue(companion,
                'Mirabel closes the folio, then does not move away. “Wanting you is not the alarming part, by the way. I am perfectly capable of wanting people.” She grimaces. “The alarming part is that I caught myself wondering where we might be a month from now, and you were still in the sentence.”',
                [
                    { label: '“You don’t have to promise forever to choose tomorrow.”', action: () => applyDialogueChoice('aftermath_choose_tomorrow', { rootedness: 8 }, { friendship: 3, romanticBond: 4 }, { trust: 2 }, '“Tomorrow,” Mirabel repeats. “I can work with tomorrow.”') },
                    { label: '“I’d like you in my future too.”', action: () => applyDialogueChoice('aftermath_future_together', { rootedness: 10 }, { friendship: 3, romanticBond: 5, attraction: 1 }, { trust: 3 }, 'Mirabel goes very still. “That is an appallingly effective thing to say to someone who prides herself on not needing plans.”') },
                    { label: '“Then don’t plan. We can enjoy what this is without making it permanent.”', action: () => applyDialogueChoice('aftermath_no_future_claim', { rootedness: -4 }, { friendship: 2, attraction: 2 }, null, 'Mirabel’s shoulders loosen. “That, at least, is a language I already speak.”') },
                ]
            );
            return true;
        }
        if (mode === 'friends_with_benefits') {
            window.showDialogue(companion,
                'Mirabel nudges your knee with hers. “I like you. I fancy you. Neither fact has to become ownership, prophecy or a conversation about matching curtains.” Her eyebrow lifts. “If we ever decide to enjoy both facts at once, I am capable of being uncomplicated about it.”',
                [
                    { label: '“So am I.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'friends_with_benefits', 'Mirabel and the player explicitly agreed that friendship and physical intimacy need not imply exclusivity or romance') },
                    { label: '“I’d rather keep this as friendship.”', action: () => window.showDialogue(companion, '“Then friendship it is. See? Spectacularly survivable conversation.”', [{ label: 'Good.', action: () => {} }]) },
                ]
            );
            return true;
        }
        if (mode === 'casual') {
            window.showDialogue(companion,
                'Mirabel catches you looking and smiles. “If you are trying to work out whether I am flirting with you, yes. If you are trying to work out whether that means I am secretly planning our shared retirement, absolutely not.”',
                [
                    { label: '“One night doesn’t need a five-year plan.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'casual_physical_interest', 'Mirabel and the player explicitly acknowledged casual mutual physical interest') },
                    { label: '“Flirting is enough.”', action: () => window.showDialogue(companion, '“Also acceptable.”', [{ label: 'Thought so.', action: () => {} }]) },
                ]
            );
            return true;
        }
        if (mode === 'close_friend') {
            window.showDialogue(companion,
                'Mirabel rests the folio against your shoulder while she writes one last note. “I am getting alarmingly used to having someone I can hand half-finished thoughts to without first proving they deserve them.”',
                [{ label: '“I’ll try not to make you regret it.”', action: () => window.adjustCompanionRelationship?.(companion, { trust: 2 }, 'accepted Mirabel’s confidence without making demands of it') }]
            );
            return true;
        }
        window.showDialogue(companion,
            'Mirabel packs the Concordance carefully. “Not bad. I joined you for access to one ruin and somehow acquired a research partner. Try not to become intolerable about the promotion.”',
            [{ label: 'No promises.', action: () => {} }]
        );
        return true;
    }

    function installPersonalDialogueTree() {
        const trees = window.npcDialogueTrees;
        if (!trees || trees[PERSONAL_DIALOGUE_ID]?.__mirabelConcordancePersonal) return false;
        const existing = trees[PERSONAL_DIALOGUE_ID];
        const tree = function(npc) {
            const companion = mirabel() || npc;
            const q = quest();
            const rel = window.getCompanionRelationship?.(companion) || {};
            const options = [];
            if (!q) {
                options.push({ label: 'About that book from the spider ruin…', action: () => showQuestOpening() });
            } else if (q.status === 'active') {
                options.push({ label: 'About the Concordance…', action: () => openQuestHub() });
            } else {
                options.push({ label: 'About the Concordance…', action: () => {
                    const state = getArcState();
                    const line = state.scholarship === 'unfettered_scholar'
                        ? '“Still brilliant,” Mirabel says. “Still dangerous. Those are not opposites.”'
                        : state.scholarship === 'cautious_scholar'
                            ? '“I still hate losing knowledge. I have simply stopped pretending that possessing a method and being entitled to use it are the same thing.”'
                            : '“I think we handled it like adults, which is disappointing but difficult to argue with.”';
                    window.showDialogue(companion, line, [{ label: 'High praise.', action: () => {} }]);
                } });
            }
            if (Number(rel.familiarity || 0) >= 20) {
                options.push({ label: 'Why don’t you ever stay anywhere long?', action: () => openMovingOnConversation() });
            }
            options.push({ label: 'Never mind.', action: () => {} });
            window.showDialogue(companion, '“Mm? You have my attention. Most of it.”', options);
        };
        tree.__mirabelConcordancePersonal = true;
        tree.__previousMirabelPersonal = existing;
        trees[PERSONAL_DIALOGUE_ID] = tree;
        return true;
    }

    function ensureMirabelDialogueIdentity() {
        const companion = mirabel();
        if (!companion) return false;
        companion.dialogueId = PERSONAL_DIALOGUE_ID;
        for (const entity of (window.entities || [])) {
            if (entity?.name === MIRABEL_NAME && entity.side === 'player') entity.dialogueId = PERSONAL_DIALOGUE_ID;
        }
        return true;
    }

    function questMenu(npc, prompt, options, original) {
        const merged = [...options, { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) }];
        window.showDialogue(npc, prompt, merged);
        return true;
    }

    function installNpcWrapper(id, marker, builder) {
        const trees = window.npcDialogueTrees;
        const original = trees?.[id];
        if (typeof original !== 'function' || original[marker]) return false;
        const wrapped = function(npc) {
            const q = quest();
            if (!q || q.status !== 'active') return original.call(this, npc);
            return builder(npc, original) || original.call(this, npc);
        };
        wrapped[marker] = true;
        wrapped.__previous = original;
        trees[id] = wrapped;
        return true;
    }

    function installNpcHooks() {
        installNpcWrapper('silverhart_magic_dealer', '__mirabelConcordanceDealer', (npc, original) => {
            const q = quest();
            const options = [];
            if (!q.clues.dealer_provenance) options.push({ label: 'Ask about the Concordance of Last Echoes.', action: () => investigateDealer(npc) });
            return options.length ? questMenu(npc, 'Corvin’s expression changes when Mirabel shows him the damaged title page.', options, original) : false;
        });

        installNpcWrapper('royal_wizard', '__mirabelConcordanceThessaly', (npc, original) => {
            const q = quest();
            const options = [];
            if (!q.clues.court_catalogue) {
                options.push({ label: 'Ask Thessaly about the Concordance’s missing appendix.', action: () => investigateThessaly(npc) });
            } else if (!q.clues.restricted_appendix) {
                if (ordinaryArchiveReady(q)) options.push({ label: 'Ask to make a supervised transcription of the appendix.', action: () => obtainRestrictedAppendix('supervised royal archive transcription', npc) });
                if (hasWizardTraining()) options.push({ label: '[Wizard/Arcane] Demonstrate that you can handle the restricted theorem.', action: () => obtainRestrictedAppendix('Arcane competence — royal archive', npc) });
                if (maxPartySkill('persuasion') > 0) options.push({ label: '[Persuasion] Ask Thessaly to trust Mirabel with a supervised copy.', action: () => obtainRestrictedAppendix('Persuasion — royal archive', npc) });
            }
            return options.length ? questMenu(npc, 'Thessaly’s attention sharpens when Mirabel names the Concordance.', options, original) : false;
        });

        installNpcWrapper('reddale_disciple', '__mirabelConcordanceDisciple', (npc, original) => {
            const q = quest();
            if (q.clues.cult_parallel) return false;
            if (!(hasReligionTraining() || window.discipleSuspected)) return false;
            return questMenu(npc, 'Mirella’s eyes linger on the geometry in Mirabel’s copied page a fraction too long.', [
                { label: 'Ask what she recognises in the diagram.', action: () => {
                    recordCultParallel('Mirella Thorn’s reaction');
                    window.showDialogue(npc, 'Mirella smiles too quickly. “Old preservation work. Harmless.” Mirabel waits until you are outside before murmuring, “She knew which line I was going to point at before I pointed at it. That is not harmless familiarity.”', [{ label: 'Noted.', action: () => {} }]);
                } }
            ], original);
        });
    }

    function syncExistingNecromancyEvidence() {
        const q = quest();
        if (!q || q.status !== 'active' || q.clues.cult_parallel) return false;
        if (window.player?.inventory?.includes('phylactery_shard')) return recordCultParallel('phylactery shard');
        if (window.phylacteryReturned) return recordCultParallel('returned phylactery evidence');
        return false;
    }

    function refresh() {
        if (!mirabel()) return;
        ensureMirabelStart();
        ensureArc();
        ensureMirabelDialogueIdentity();
        installPersonalDialogueTree();
        installNpcHooks();
        syncExistingNecromancyEvidence();
    }

    window.mirabelUnquietConcordance = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        ensureMirabelStart,
        ensureArc,
        getArcState,
        applyArcChange,
        ensureQuest,
        startQuest,
        addClue,
        clueCount,
        canResolve,
        ordinaryArchiveReady,
        showQuestOpening,
        recordDealerProvenance,
        recordCourtCatalogue,
        obtainRestrictedAppendix,
        recordCultParallel,
        investigateDealer,
        investigateThessaly,
        stealRestrictedAppendix,
        openQuestHub,
        openResolution,
        completeQuest,
        openMovingOnConversation,
        aftermathMode,
        showAftermath,
        refresh,
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.MIRABEL_UNQUIET_CONCORDANCE_BUILD = BUILD;
})();
