// fennLivingBoundary.js
// Fenn Oakheart's first post-recruitment companion quest.
//
// A storm-felled alder has changed drainage between Emberwood Grove and Old
// Mac's pasture. The new reed-marsh is already becoming useful habitat and
// filtering the grove's spring, but it is also waterlogging Mac's lower meadow
// and threatening his hay and sheep. There is no mandatory skill gate: hearing
// both sides is enough to resolve the conflict. Nature/Perception expertise adds
// hydrology context and strengthens the managed solution.
(() => {
    'use strict';

    const BUILD = '20260930-fenn-living-boundary-v1';
    const FENN_NAME = 'Fenn Oakheart';
    const QUEST_ID = 'fenn_living_boundary';
    const PERSONAL_DIALOGUE_ID = 'companion_fenn_oakheart';
    const COMPENSATION_COST = 60;

    const CLUES = Object.freeze({
        changed_flow: Object.freeze({
            label: 'The grove spring has changed course',
            text: 'Fenn has noticed that water leaving Emberwood Grove is spreading south instead of following its old narrow drainage line. A storm-felled alder appears to have changed the flow.'
        }),
        flooded_pasture: Object.freeze({
            label: "Old Mac's lower pasture is waterlogged",
            text: 'The new flow has saturated Old Mac’s lower meadow. If it stays wet through the season, he will lose much of his hay crop and have less safe grazing for the sheep.'
        }),
        young_marsh: Object.freeze({
            label: 'The blockage has created a young reed-marsh',
            text: 'Elder Nessa explains that the new wet ground is already holding frogs, insects and medicinal plants, and slowing dirty runoff before it reaches the grove spring. Removing it completely would restore the old drainage but destroy an emerging habitat.'
        }),
        old_channel: Object.freeze({
            label: 'The old channel could carry a controlled spillway',
            text: 'Careful reading of the banks shows the former drainage line still exists beneath the reeds. A narrow maintained spillway could lower the pasture water without draining the entire marsh, though both farm and grove would have to accept a changed boundary.'
        }),
    });

    let suppressDecoration = 0;

    const party = () => Array.isArray(window.party) ? window.party : [];
    const fenn = () => party().find((member, index) => index > 0 && member?.name === FENN_NAME) || null;
    const quest = () => (window.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    const maxPartySkill = id => party().reduce((best, member) => Math.max(best, Number(member?.skills?.[id] || 0)), 0);

    function clampAxis(value) {
        const n = Number(value);
        return Math.max(-100, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0));
    }

    function hasNatureTraining() {
        return party().some(member =>
            Number(member?.skills?.druid_knowledge_nature || 0) > 0 ||
            Number(member?.skills?.elf_knowledge_nature || 0) > 0 ||
            Number(member?.skills?.knowledge_nature || 0) > 0 ||
            (typeof window.hasKnowledgeNature === 'function' && window.hasKnowledgeNature(member))
        );
    }

    function hasPerceptionTraining() {
        return maxPartySkill('keen_perception') > 0;
    }

    function relationshipReady() {
        return typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    function ensureFennStart() {
        const companion = fenn();
        if (!companion) return false;
        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: 15,
            trust: 18,
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
                familiarity: 15,
                trust: 18,
                ...(window.companionAttitude?.[FENN_NAME] === undefined ? { approval: 55 } : {}),
            }, 'authored_start:fenn_grove_recruitment');
        } else {
            window.getCompanionRelationship(companion);
        }
        return true;
    }

    function ensureArc() {
        const companion = fenn();
        if (!companion) return null;
        const existing = companion.fennCharacterArc || {};
        companion.fennCharacterArc = {
            // Negative = preserve natural processes with minimal intervention.
            // Positive = active stewardship/coexistence, including reshaping a
            // landscape when that can meet human and ecological needs together.
            stewardship: clampAxis(existing.stewardship ?? -15),
            // Negative = defer to grove doctrine/elders. Positive = confidence
            // in making and owning his own judgement outside the grove.
            independence: clampAxis(existing.independence ?? -20),
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            dialogueChoiceKeys: Array.isArray(existing.dialogueChoiceKeys) ? existing.dialogueChoiceKeys : [],
            history: Array.isArray(existing.history) ? existing.history : [],
        };
        return companion.fennCharacterArc;
    }

    function getArcState() {
        const arc = ensureArc();
        if (!arc) return null;
        let landEthic = 'balancing';
        if (arc.stewardship <= -40) landEthic = 'preservationist';
        else if (arc.stewardship >= 40) landEthic = 'interventionist_steward';
        else if (arc.stewardship >= 10) landEthic = 'pragmatic_steward';

        let voice = 'grove_taught';
        if (arc.independence <= -40) voice = 'grove_bound';
        else if (arc.independence >= 40) voice = 'self_directed';
        else if (arc.independence >= 10) voice = 'finding_his_voice';
        return {
            stewardship: arc.stewardship,
            independence: arc.independence,
            landEthic,
            voice,
        };
    }

    function applyArcChange(key, delta = {}, reason = null) {
        const arc = ensureArc();
        if (!arc || !key) return null;
        const stableKey = String(key);
        if (arc.knownEventKeys.includes(stableKey)) return getArcState();
        arc.knownEventKeys.push(stableKey);
        if (arc.knownEventKeys.length > 100) arc.knownEventKeys.splice(0, arc.knownEventKeys.length - 100);
        arc.stewardship = clampAxis(arc.stewardship + Number(delta.stewardship || 0));
        arc.independence = clampAxis(arc.independence + Number(delta.independence || 0));
        arc.history.push({
            key: stableKey,
            reason: reason || stableKey,
            worldSeconds: Number(window.worldSeconds || 0),
            stewardship: arc.stewardship,
            independence: arc.independence,
        });
        if (arc.history.length > 80) arc.history.splice(0, arc.history.length - 80);
        return getArcState();
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Living Boundary',
                giver: FENN_NAME,
                status: 'active',
                resolution: null,
                description: 'Find out what the changed drainage from Emberwood Grove is doing to Old Mac’s pasture, and decide with Fenn where the new boundary between farm and wetland should lie.',
                clues: {},
                clueOrder: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            window.showMessage?.('Companion quest added: The Living Boundary.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        return q;
    }

    function clueCount(q = quest()) {
        return q ? Object.keys(q.clues || {}).length : 0;
    }

    function canResolve(q = quest()) {
        return !!(q && q.status === 'active' && q.clues?.flooded_pasture && q.clues?.young_marsh);
    }

    function addClue(id, source = null) {
        const spec = CLUES[id];
        if (!spec) return false;
        const q = ensureQuest();
        if (q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: Number(window.worldSeconds || 0) };
        q.clueOrder.push(id);
        q.description = canResolve(q)
            ? 'You understand what both the pasture and the new marsh stand to lose. Talk to Fenn and decide what to do with the changed watercourse.'
            : 'Hear what the changed watercourse means for both Old Mac’s pasture and Emberwood Grove.';
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function startQuest() {
        const companion = fenn();
        if (!companion) return false;
        ensureFennStart();
        ensureArc();
        const q = ensureQuest();
        if (!q.clues.changed_flow) {
            addClue('changed_flow', 'Fenn’s observation of the grove spring');
            window.noteCompanionConversation?.(companion, 'fenn:living_boundary_opened', 3);
        }
        return q;
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function showQuestOpening() {
        const companion = fenn();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        startQuest();
        const options = [
            { label: '“We should hear what both sides are losing.”', action: () => {} },
            { label: '“A new marsh is still nature. Why interfere?”', action: () => withSuppressedDecoration(() => window.showDialogue(companion,
                'Fenn rubs a thumb over a leaf stem. “Maybe we shouldn’t. But Mac’s sheep are nature too, if we’re being honest, and so is the old man trying to keep them fed. I’d rather know the cost before pretending doing nothing has none.”',
                [{ label: 'Fair.', action: () => {} }]
            )) },
        ];
        if (hasNatureTraining() || hasPerceptionTraining()) {
            options.splice(1, 0, {
                label: hasNatureTraining() ? '[Knowledge: Nature] The old channel may still be under the reeds.' : '[Keen Perception] The old waterline may still be visible.',
                action: () => {
                    addClue('old_channel', hasNatureTraining() ? 'Knowledge: Nature' : 'Keen Perception');
                    withSuppressedDecoration(() => window.showDialogue(companion,
                        'You and Fenn trace the bank until the reeds thin. The former channel is still there, shallow but continuous. Fenn crouches over it. “A narrow spillway could take the worst water off the pasture without emptying the whole marsh. Not free. Not untouched. But possible.”',
                        [{ label: 'Keep that option in mind.', action: () => {} }]
                    ));
                },
            });
        }
        withSuppressedDecoration(() => window.showDialogue(companion,
            'Fenn has been quiet since the road passed near Emberwood. “The spring is running differently. Storm brought an alder down across the old channel, and the water’s spread into the low ground south of the grove. Nessa calls it a marsh now.”\n\nHe glances toward the farm road. “That low ground keeps going. Straight into Mac’s pasture. I grew up being told that when water finds a new course, you listen before you move it back. I’m starting to think listening includes the people standing in it.”',
            options
        ));
        return true;
    }

    function investigateFarm(npc = null) {
        const q = startQuest();
        if (!q) return false;
        if (!q.clues.flooded_pasture) addClue('flooded_pasture', npc?.name || "Old Mac's pasture");
        withSuppressedDecoration(() => window.showDialogue(npc || fenn(),
            'Mac points toward the lower meadow. Water gleams between the grass stems where the ground should be firm. “Pretty from a distance. Useless for hay. Another month and I’ll be buying winter feed I can’t afford, assuming the sheep don’t start rotting their feet first.”\n\nHe squints toward the tree line. “I’m not asking to pave the grove. I’m asking for the ditch that kept my field dry for thirty years.”',
            [{ label: 'We’ll hear the grove out as well.', action: () => {} }]
        ));
        return true;
    }

    function investigateGrove(npc = null) {
        const q = startQuest();
        if (!q) return false;
        if (!q.clues.young_marsh) addClue('young_marsh', npc?.name || 'Elder Nessa Wren');
        withSuppressedDecoration(() => window.showDialogue(npc || fenn(),
            'Nessa does not pretend the marsh is ancient. “It is one season old. That does not make it imaginary.” She lists what has already appeared there: frogs, sedges, medicinal watermint, dragonflies, nesting reed birds. “The slow water is also catching farm runoff before it reaches our spring. Cut the alder out and scour the old ditch clean, and Mac gets his meadow back. We lose what has begun here.”',
            [{ label: 'So doing nothing has a cost, and undoing it has a cost.', action: () => {} }]
        ));
        return true;
    }

    function applyNpcReputation(name, standingDelta, knowledgeDelta = 5) {
        const npc = (window.entities || []).find(entity => entity?.name === name);
        if (npc?.reputation && typeof window.adjustReputation === 'function') {
            window.adjustReputation(npc.reputation, standingDelta, knowledgeDelta);
        }
    }

    function outcomeSpec(resolution, hasChannelKnowledge) {
        const channelBonus = hasChannelKnowledge ? 2 : 0;
        if (resolution === 'preserve_marsh') {
            return {
                relationship: { approval: 6, trust: 6, familiarity: 4 },
                affinity: { friendship: 5, romanticBond: 1 },
                arc: { stewardship: -15, independence: -4 },
                line: 'Fenn watches the reeds move in the breeze. “Nessa will say we listened. Mac will say we listened to everyone except him.” He exhales. “I think preserving something can still be the right choice. I just don’t want to call the cost nothing.”',
            };
        }
        if (resolution === 'drain_marsh') {
            return {
                relationship: { approval: -6, trust: 3, familiarity: 5 },
                affinity: { friendship: -2, romanticBond: -1 },
                arc: { stewardship: 18, independence: 10 },
                line: 'Fenn is unhappy, but not evasive. “I wouldn’t have chosen to lose the marsh. But Mac’s winter is real, and you heard Nessa before deciding.” He looks back at the water. “If I’m going to disagree with you, I’d rather disagree about an honest choice than a convenient one.”',
            };
        }
        if (resolution === 'compensate_preserve') {
            return {
                relationship: { approval: 9, trust: 9 + channelBonus, familiarity: 5 },
                affinity: { friendship: 7, romanticBond: 2 },
                arc: { stewardship: -8, independence: 7 },
                line: 'Fenn smiles at last. “Keep the marsh, help Mac move the pressure somewhere else. Expensive answer.” He nudges your shoulder. “I’m learning you have a weakness for expensive answers that let two stubborn people both keep breathing.”',
            };
        }
        return {
            relationship: { approval: 11, trust: 12 + channelBonus, familiarity: 6 },
            affinity: { friendship: 8, romanticBond: 3, attraction: 1 },
            arc: { stewardship: 12, independence: 13 },
            line: hasChannelKnowledge
                ? 'Fenn looks over the narrow spillway, then the standing reeds beyond it. “Not restored. Not untouched. Managed.” He smiles, a little surprised by the word. “The grove taught me change isn’t the same thing as damage. I suppose that applies when people are part of the change too.”'
                : 'Fenn watches the first controlled flow pull away from the pasture without emptying the marsh. “Messier than Nessa wanted. Less dry than Mac wanted.” A grin. “Which may be how you know nobody was simply ignored.”',
        };
    }

    function completeQuest(resolution) {
        const companion = fenn();
        const q = quest();
        if (!companion || !q || q.status === 'completed' || !canResolve(q)) return false;
        const valid = new Set(['preserve_marsh', 'drain_marsh', 'managed_spillway', 'compensate_preserve']);
        if (!valid.has(resolution)) return false;

        if (resolution === 'compensate_preserve') {
            const player = party()[0];
            if (!player || Number(player.gold || 0) < COMPENSATION_COST) {
                window.showMessage?.(`You need ${COMPENSATION_COST} gold to help Mac fence and seed higher ground.`);
                return false;
            }
            player.gold -= COMPENSATION_COST;
        }

        const hasChannelKnowledge = !!q.clues.old_channel;
        const spec = outcomeSpec(resolution, hasChannelKnowledge);
        q.status = 'completed';
        q.resolution = resolution;
        q.completedAt = Number(window.worldSeconds || 0);
        q.hydrologyUnderstood = hasChannelKnowledge;
        q.pastureProtected = resolution === 'drain_marsh' || resolution === 'managed_spillway' || resolution === 'compensate_preserve';
        q.marshPreserved = resolution !== 'drain_marsh';

        window.fennWetlandOutcome = resolution;
        window.campaign2WetlandState = {
            outcome: resolution,
            pastureProtected: q.pastureProtected,
            marshPreserved: q.marshPreserved,
            managedFlow: resolution === 'managed_spillway',
            compensatedFarm: resolution === 'compensate_preserve',
        };

        window.adjustCompanionRelationship?.(companion, spec.relationship, `fenn_living_boundary:${resolution}`);
        window.adjustCompanionAffinity?.(companion, spec.affinity, `resolved the living boundary: ${resolution}`, `fenn_living_boundary:${resolution}`);
        applyArcChange(`living_boundary:${resolution}`, spec.arc, `resolved the living boundary: ${resolution}`);

        if (resolution === 'preserve_marsh') {
            applyNpcReputation('Old Mac', -10, 8);
            applyNpcReputation('Elder Nessa Wren', 10, 8);
        } else if (resolution === 'drain_marsh') {
            applyNpcReputation('Old Mac', 10, 8);
            applyNpcReputation('Elder Nessa Wren', -12, 8);
        } else if (resolution === 'managed_spillway') {
            applyNpcReputation('Old Mac', 6, 8);
            applyNpcReputation('Elder Nessa Wren', 6, 8);
        } else {
            applyNpcReputation('Old Mac', 10, 8);
            applyNpcReputation('Elder Nessa Wren', 8, 8);
        }

        withSuppressedDecoration(() => window.showDialogue(companion, spec.line, [
            { label: '“And what do you think now?”', action: () => openAftermath() },
            { label: 'Leave it there for now.', action: () => {} },
        ]));
        window.showMessage?.('Companion quest completed: The Living Boundary.');
        return true;
    }

    function resolutionDialogue() {
        const companion = fenn();
        const q = quest();
        if (!companion || !q || !canResolve(q)) return false;
        const options = [
            {
                label: 'Leave the new marsh alone. Mac will have to adapt.',
                action: () => completeQuest('preserve_marsh'),
            },
            {
                label: 'Reopen the old drainage fully. Mac needs his pasture.',
                action: () => completeQuest('drain_marsh'),
            },
            {
                label: q.clues.old_channel
                    ? 'Use the old channel as a controlled spillway and keep the marsh core.'
                    : 'Cut a narrow spillway: drain the pasture enough, but keep the marsh core.',
                action: () => completeQuest('managed_spillway'),
            },
            {
                label: `Keep the marsh and pay ${COMPENSATION_COST} gold to fence and seed higher ground for Mac.`,
                action: () => completeQuest('compensate_preserve'),
            },
            { label: 'Not yet.', action: () => {} },
        ];
        withSuppressedDecoration(() => window.showDialogue(companion,
            'Fenn draws three lines in the dirt: the old ditch, the new wetland, the edge of Mac’s meadow. “There isn’t a choice where nothing changes. We can protect the marsh and make Mac carry the loss. We can give the pasture back and erase what grew here. Or we can deliberately manage the water and accept that neither side gets the landscape it had in mind.”',
            options
        ));
        return true;
    }

    function applyReflectionChoice(key) {
        const companion = fenn();
        const arc = ensureArc();
        if (!companion || !arc || arc.dialogueChoiceKeys.includes(key)) return false;
        arc.dialogueChoiceKeys.push(key);
        const choices = {
            people_are_nature: {
                arc: { stewardship: 8, independence: 4 },
                affinity: { friendship: 3, romanticBond: 1 },
                line: 'Fenn nods slowly. “That sounds obvious when you say it. The grove talks about people as though we’re weather visiting from somewhere else. We build, cut, burn, mend, plant. Still animals. Still here.”',
            },
            some_places_beyond_us: {
                arc: { stewardship: -9, independence: 2 },
                affinity: { friendship: 2 },
                line: '“Yes.” Fenn looks relieved rather than triumphant. “Not because people are poison. Just because not every living thing needs to justify itself by being useful to us.”',
            },
            own_judgement: {
                arc: { independence: 12, stewardship: 2 },
                affinity: { friendship: 4, romanticBond: 1 },
                line: 'Fenn gives you a crooked look. “Dangerous advice to give someone travelling with you.” Then he sobers. “But I think you’re right. Nessa taught me how to see. She doesn’t get to decide forever what I do with the view.”',
            },
        };
        const spec = choices[key];
        if (!spec) return false;
        applyArcChange(`reflection:${key}`, spec.arc, spec.line);
        window.adjustCompanionAffinity?.(companion, spec.affinity, `Fenn reflection: ${key}`, `fenn_reflection:${key}`);
        withSuppressedDecoration(() => window.showDialogue(companion, spec.line, [{ label: 'Stay with him a while.', action: () => {} }]));
        return true;
    }

    function openAftermath() {
        const companion = fenn();
        if (!companion) return false;
        const affinity = window.getCompanionAffinity?.(companion) || { friendship: 0, romanticBond: 0, attraction: 0 };
        const rel = window.getCompanionRelationship?.(companion) || { trust: 0, familiarity: 0 };
        let text;
        const options = [];

        if (affinity.romanticBond >= 45 && rel.trust >= 35) {
            text = 'Fenn studies you with none of Mirabel’s alarm or Wren’s guardedness. “I care about you. Properly. I don’t mean I want a fence around you, or that caring about someone else would make this smaller. I mean I have started measuring roads partly by whether you’re on them.” He smiles. “That feels worth saying plainly.”';
            options.push({ label: '“I want this to keep growing too.”', action: () => {
                window.adjustCompanionAffinity?.(companion, { romanticBond: 4, friendship: 2 }, 'reciprocated Fenn’s romantic feelings', 'fenn_aftermath:romance_reciprocated');
                window.companionAffinity?.setRomanceState?.(companion, 'mutual_interest', 'Fenn and the player acknowledged mutual romantic feelings');
            }});
            options.push({ label: '“I care about you, but I don’t want romance.”', action: () => {
                window.companionAffinity?.setRomanceState?.(companion, 'friends_by_choice', 'player chose friendship with Fenn');
                window.adjustCompanionAffinity?.(companion, { friendship: 3 }, 'answered Fenn honestly about friendship', 'fenn_aftermath:friendship_boundary');
            }});
        } else if (affinity.friendship >= 50 && affinity.attraction >= 35 && affinity.romanticBond < 30) {
            text = 'Fenn leans back on his hands. “We’re friends. I fancy you. Neither of those facts has to pretend to be the other.” His grin is easy, but not careless. “If you ever want something physical without inventing a grand destiny around it, I’d rather talk about it than play coy.”';
            options.push({ label: '“Friends, and maybe more sometimes. I like that.”', action: () => {
                window.companionAffinity?.setRomanceState?.(companion, 'friends_with_benefits_open', 'player and Fenn agreed friendship and physical intimacy need not imply romance');
                window.adjustCompanionAffinity?.(companion, { friendship: 2, attraction: 2 }, 'agreed on an honest friends-with-benefits possibility', 'fenn_aftermath:fwb');
            }});
            options.push({ label: '“Friends is enough for me.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'friends_by_choice', 'player kept the relationship platonic') });
        } else if (affinity.attraction >= 50 && affinity.friendship < 40 && affinity.romanticBond < 25) {
            text = 'Fenn catches you looking and laughs softly. “There’s attraction here. I don’t think we need to call it fate to admit that.” He raises an eyebrow. “If we ever act on it, honesty first. No promises smuggled in afterward.”';
            options.push({ label: '“Agreed.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'casual_interest', 'Fenn and the player acknowledged casual attraction') });
        } else if (affinity.friendship >= 45) {
            text = 'Fenn bumps his shoulder lightly against yours. “I’m glad I left the grove. Not because it was wrong. Because I didn’t know how many kinds of right there were until I had someone to argue with about them.”';
            options.push({ label: '“I’m glad you came.”', action: () => window.adjustCompanionAffinity?.(companion, { friendship: 3 }, 'affirmed close friendship with Fenn', 'fenn_aftermath:close_friend') });
        } else {
            text = 'Fenn looks back toward the grove road. “I thought travelling would mostly teach me about places. Turns out people are harder terrain.”';
        }

        const arc = ensureArc();
        if (arc && arc.dialogueChoiceKeys.length < 3) {
            if (!arc.dialogueChoiceKeys.includes('people_are_nature')) options.push({ label: '“People are part of nature too. We don’t stand outside it.”', action: () => applyReflectionChoice('people_are_nature') });
            if (!arc.dialogueChoiceKeys.includes('some_places_beyond_us')) options.push({ label: '“Some places should stay beyond our management.”', action: () => applyReflectionChoice('some_places_beyond_us') });
            if (!arc.dialogueChoiceKeys.includes('own_judgement')) options.push({ label: '“Nessa taught you. She doesn’t have to remain your answer.”', action: () => applyReflectionChoice('own_judgement') });
        }
        options.push({ label: 'Leave it there.', action: () => {} });
        withSuppressedDecoration(() => window.showDialogue(companion, text, options));
        return true;
    }

    function companionDialogue(npc) {
        const companion = fenn() || npc;
        if (!companion) return;
        const q = quest();
        const options = [];
        if (!q) {
            options.push({ label: 'You’ve been thinking about the grove. What is it?', action: () => showQuestOpening() });
        } else if (q.status === 'active' && canResolve(q)) {
            options.push({ label: 'About the pasture and the new marsh…', action: () => resolutionDialogue() });
        } else if (q.status === 'active') {
            options.push({ label: 'About the changed watercourse…', action: () => withSuppressedDecoration(() => window.showDialogue(companion,
                q.clues.flooded_pasture
                    ? '“We know what Mac stands to lose. I still want Nessa’s account of what the marsh is doing before we choose.”'
                    : q.clues.young_marsh
                        ? '“We know why Nessa wants the marsh. We owe Mac the courtesy of hearing what the water is doing to his winter.”'
                        : '“Talk to Mac. Talk to Nessa. Then we can decide without pretending one of them is scenery.”',
                [{ label: 'Right.', action: () => {} }]
            )) });
        } else if (q.status === 'completed') {
            options.push({ label: 'What did the marsh change for you?', action: () => openAftermath() });
        }
        options.push({ label: 'How are you finding the road?', action: () => withSuppressedDecoration(() => window.showDialogue(companion,
            '“Louder than the grove. More interesting too. I miss knowing the names of every bird outside my window. I don’t miss knowing exactly what tomorrow will look like.”',
            [{ label: 'Fair enough.', action: () => {} }]
        )) });
        options.push({ label: 'Nothing right now.', action: () => {} });
        withSuppressedDecoration(() => window.showDialogue(companion, '“What’s on your mind?”', options));
    }

    function appendWorldQuestOption(npc, text, options) {
        if (suppressDecoration || !Array.isArray(options)) return options;
        const q = quest();
        if (!q || q.status !== 'active') return options;
        const labels = new Set(options.map(option => option?.label));
        const name = String(npc?.name || '');
        let extra = null;

        if ((name === 'Old Mac' || name === String(window.campaign2OldMac?.name || '')) && !q.clues.flooded_pasture) {
            extra = { label: 'Fenn wanted to ask about the water in your lower pasture.', action: () => investigateFarm(npc) };
        } else if (name === 'Elder Nessa Wren' && !q.clues.young_marsh) {
            extra = { label: 'Fenn wanted your view of the new marsh below the spring.', action: () => investigateGrove(npc) };
        }
        if (!extra || labels.has(extra.label)) return options;
        return [...options, extra];
    }

    function chainHas(fn, flag) {
        let current = fn;
        for (let i = 0; i < 20 && typeof current === 'function'; i++) {
            if (current[flag]) return true;
            current = current.__baseShowDialogue;
        }
        return false;
    }

    function installDialogueHook() {
        if (typeof window.showDialogue !== 'function' || chainHas(window.showDialogue, '__fennLivingBoundaryAware')) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            const args = Array.from(arguments);
            args[2] = appendWorldQuestOption(npc, text, options);
            return base.apply(this, args);
        };
        wrapped.__fennLivingBoundaryAware = true;
        [
            '__relationshipProgressionAware', '__wrenParentsInvestigationAware', '__wrenCharacterArcAware',
            '__companionRomanceAware', '__wrenPriceOfSilenceAware', '__aldricBrokenVigilAware',
            '__mirabelUnquietConcordanceAware'
        ].forEach(flag => {
            if (chainHas(base, flag)) wrapped[flag] = true;
        });
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function installPersonalDialogue() {
        if (!window.npcDialogueTrees) return false;
        window.npcDialogueTrees[PERSONAL_DIALOGUE_ID] = companionDialogue;
        return true;
    }

    function refresh() {
        installDialogueHook();
        installPersonalDialogue();
        const companion = fenn();
        if (!companion) return;
        ensureFennStart();
        ensureArc();
        // The recruitment placeholder uses fenn_oakheart. Once he is a real
        // party member, give him a persistent post-recruitment conversation.
        if (!companion.dialogueId || companion.dialogueId === 'fenn_oakheart') companion.dialogueId = PERSONAL_DIALOGUE_ID;
        const entity = (window.entities || []).find(e => e?.name === FENN_NAME && e?.side === 'player');
        if (entity && (!entity.dialogueId || entity.dialogueId === 'fenn_oakheart')) entity.dialogueId = PERSONAL_DIALOGUE_ID;
    }

    window.fennLivingBoundary = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        compensationCost: COMPENSATION_COST,
        ensureFennStart,
        ensureArc,
        getArcState,
        applyArcChange,
        ensureQuest,
        startQuest,
        addClue,
        clueCount,
        canResolve,
        investigateFarm,
        investigateGrove,
        completeQuest,
        resolutionDialogue,
        openAftermath,
        applyReflectionChoice,
        refresh,
        skillAccess: {
            nature: hasNatureTraining,
            perception: hasPerceptionTraining,
        },
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.FENN_LIVING_BOUNDARY_BUILD = BUILD;
})();