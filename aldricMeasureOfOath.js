// aldricMeasureOfOath.js
// Ser Aldric Thorne, Chapter 2: The Measure of an Oath.
//
// The Broken Vigil taught Aldric that a vow binds the person who speaks it; it
// must not become an excuse for everyone else to abandon their obligations.
// This chapter turns that insight back on him. The Order of the Silver Vigil
// has a real, honourable need for him at Saint Orra's Hospice and invokes an
// obedience promise Aldric genuinely made. Nobody is secretly corrupt. The
// question is whether fidelity means literal obedience, negotiated service, or
// openly asking to be released from a promise whose context has changed.
(() => {
    'use strict';

    const BUILD = '20260930-aldric-measure-of-oath-v1';
    const QUEST_ID = 'aldric_measure_of_oath';
    const PREVIOUS_ID = 'aldric_broken_vigil';
    const ALDRIC = 'Ser Aldric Thorne';
    const PRECEPTOR = 'Preceptor Garran Vey';
    const PRECEPTOR_DIALOGUE = 'aldric_silver_vigil_preceptor';

    const CLUES = Object.freeze({
        hospice_need: {
            label: 'Saint Orra’s Hospice genuinely needs a warden',
            text: 'Border fighting has left Saint Orra’s road hospice short of experienced healers and protectors. The Order is not punishing Aldric or trying to remove him from the party; it wants a proven fighter-cleric to take permanent charge.'
        },
        obedience_vow: {
            label: 'Aldric really did promise to serve where the Order sends him',
            text: 'Aldric’s initiation vow includes obedience to lawful assignments of the Silver Vigil. The summons is within the ordinary meaning of the promise he made.'
        },
        adelram_counsel: {
            label: 'A vow can be amended openly without pretending it never mattered',
            text: 'High Cleric Adelram distinguishes breaking a promise for convenience from asking the other party to amend or release it. A vow can remain morally serious without becoming permanent ownership of the person who made it.'
        },
        service_options: {
            label: 'The hospice needs continuity more than Aldric specifically',
            text: 'Garran admits the practical need can be met by a bounded rotation plus training local healers. Permanent wardenship is the Order’s preferred answer, not the only answer consistent with the hospice’s needs.'
        },
    });

    let suppress = 0;
    const party = () => Array.isArray(window.party) ? window.party : [];
    const player = () => party()[0] || null;
    const aldric = () => party().find((m, i) => i > 0 && m?.name === ALDRIC) || null;
    const questById = id => (window.questLog || []).find(q => q?.id === id) || null;
    const quest = () => questById(QUEST_ID);
    const previous = () => questById(PREVIOUS_ID);
    const now = () => Number(window.worldSeconds || 0);
    const maxPartySkill = id => party().reduce((best, m) => Math.max(best, Number(m?.skills?.[id] || 0)), 0);
    const clamp = v => Math.max(-100, Math.min(100, Math.round(Number(v) || 0)));

    function canStart() {
        return !!aldric() && previous()?.status === 'completed';
    }

    function withSuppressed(fn) {
        suppress++;
        try { return fn(); }
        finally { suppress--; }
    }

    function ensureArc() {
        const companion = aldric();
        if (!companion) return null;
        const existing = companion.aldricCharacterArc || {};
        if (!existing.seededFromBrokenVigil) {
            const resolution = previous()?.resolution;
            const seeds = {
                public_accountability: { discernment: 10, sharedBurden: 5 },
                spare_patrol: { discernment: 12, sharedBurden: 10 },
                private_closure: { discernment: 5, sharedBurden: 3 },
                buried_for_money: { discernment: -6, sharedBurden: -5 },
            };
            const seed = seeds[resolution] || { discernment: 0, sharedBurden: 0 };
            companion.aldricCharacterArc = {
                discernment: clamp(existing.discernment ?? (-15 + seed.discernment)),
                sharedBurden: clamp(existing.sharedBurden ?? (-20 + seed.sharedBurden)),
                history: Array.isArray(existing.history) ? existing.history : [],
                knownKeys: Array.isArray(existing.knownKeys) ? existing.knownKeys : [],
                seededFromBrokenVigil: true,
            };
        } else {
            companion.aldricCharacterArc = {
                discernment: clamp(existing.discernment ?? -15),
                sharedBurden: clamp(existing.sharedBurden ?? -20),
                history: Array.isArray(existing.history) ? existing.history : [],
                knownKeys: Array.isArray(existing.knownKeys) ? existing.knownKeys : [],
                seededFromBrokenVigil: true,
            };
        }
        return companion.aldricCharacterArc;
    }

    function adjustArc(key, deltas, reason) {
        const arc = ensureArc();
        if (!arc || !key || arc.knownKeys.includes(key)) return false;
        arc.knownKeys.push(key);
        arc.discernment = clamp(arc.discernment + Number(deltas?.discernment || 0));
        arc.sharedBurden = clamp(arc.sharedBurden + Number(deltas?.sharedBurden || 0));
        arc.history.push({ key, reason, at: now(), discernment: arc.discernment, sharedBurden: arc.sharedBurden });
        if (arc.history.length > 60) arc.history.splice(0, arc.history.length - 60);
        return true;
    }

    function ensureQuest({ announce = true } = {}) {
        if (!canStart()) return null;
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Measure of an Oath',
                giver: ALDRIC,
                status: 'active',
                stage: 'hear_summons',
                resolution: null,
                description: 'Aldric has been summoned by the Order of the Silver Vigil to take permanent charge of Saint Orra’s road hospice. Hear the Order’s claim and decide what his old obedience vow requires now.',
                clues: {},
                clueOrder: [],
                choiceKeys: [],
                offeredAt: now(),
            };
            window.questLog.push(q);
            if (announce) window.showMessage?.('Companion quest added: The Measure of an Oath.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        q.choiceKeys = q.choiceKeys || [];
        ensureArc();
        return q;
    }

    function readyToResolve(q = quest()) {
        return !!q?.clues?.hospice_need && !!q?.clues?.obedience_vow && !!q?.clues?.adelram_counsel && !!q?.clues?.service_options;
    }

    function addClue(id, source = null) {
        const q = ensureQuest({ announce: false });
        const spec = CLUES[id];
        if (!q || !spec || q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: now() };
        q.clueOrder.push(id);
        if (readyToResolve(q)) {
            q.stage = 'reckoning';
            q.description = 'Aldric now knows the Order’s need is real, his old vow genuinely applies, and an honest amendment is possible. Talk to Aldric about what he chooses to promise now.';
        } else if (q.clues.hospice_need && q.clues.obedience_vow && !q.clues.adelram_counsel) {
            q.stage = 'seek_counsel';
            q.description = 'The summons is legitimate and Aldric’s obedience vow applies. Speak with High Cleric Adelram about whether keeping a vow always means keeping its original form.';
        } else {
            q.stage = 'hear_order';
            q.description = 'Speak with Preceptor Garran Vey at the Grand Cathedral and understand exactly what the Silver Vigil is asking of Aldric.';
        }
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function applyRelationship(key, relationship, affinity, reason) {
        const q = quest();
        const companion = aldric();
        if (!q || !companion || q.choiceKeys.includes(key)) return false;
        q.choiceKeys.push(key);
        if (relationship) window.adjustCompanionRelationship?.(companion, relationship, reason);
        if (affinity) window.adjustCompanionAffinity?.(companion, affinity, reason, `aldric_measure:${key}`);
        return true;
    }

    function showIntro() {
        const companion = aldric();
        const q = ensureQuest();
        if (!companion || !q) return false;
        q.introSeen = true;
        q.stage = 'hear_order';
        withSuppressed(() => window.showDialogue?.(companion,
            'Aldric holds out a letter with the seal already broken. “The Silver Vigil has summoned me to Saint Orra’s Hospice. Permanent wardenship.” He rubs his thumb across the Order’s mark. “It is not punishment. The border war emptied two posts and the road is worse than it was.”\n\nHe looks uncomfortable in a way Ironbond never managed. “When I took the Vigil’s vows, I promised to serve where lawfully sent. I meant it.”',
            [
                { label: '“Then we hear the Order out before deciding what the promise requires.”', action: () => {
                    adjustArc('intro:discern_first', { discernment: 4, sharedBurden: 2 }, 'agreed to take Aldric’s vow seriously without deciding its meaning for him');
                    applyRelationship('intro:discern_first', { approval: 3, trust: 4, familiarity: 3 }, { friendship: 3, romanticBond: 1 }, 'treated Aldric’s vow as a real obligation rather than a nuisance');
                } },
                { label: '“Whatever you choose, it should be your choice rather than mine or theirs.”', action: () => {
                    adjustArc('intro:agency', { discernment: 3, sharedBurden: 5 }, 'separated Aldric’s responsibility for his vow from other people owning his decision');
                    applyRelationship('intro:agency', { approval: 3, trust: 6, familiarity: 3 }, { friendship: 4, romanticBond: 2 }, 'made clear Aldric would not be coerced from either side');
                } },
            ]
        ));
        return true;
    }

    function openPreceptor(npc) {
        const q = ensureQuest({ announce: false });
        if (!q) return false;
        if (!q.clues.hospice_need || !q.clues.obedience_vow) {
            addClue('hospice_need', PRECEPTOR);
            addClue('obedience_vow', PRECEPTOR);
            withSuppressed(() => window.showDialogue?.(npc,
                'Garran Vey greets Aldric with genuine warmth before getting to business. “Saint Orra’s lost its senior healer to the Northwatch levy and its warden to a fever. Caravans still come. Wounded still come. Bandits know exactly how thin the road is.”\n\nAldric asks the question directly. “And you invoke my obedience vow?”\n\n“I do,” Garran says. “Not as a threat. As a promise you made to go where the Vigil most needs you.”',
                [
                    { label: '“Does the hospice need Aldric, or does it need a competent warden?”', action: () => revealServiceOptions(npc, 'ordinary') },
                    { label: '“We understand the summons.”', action: () => {} },
                ]
            ));
            return true;
        }
        if (!q.clues.service_options) return revealServiceOptions(npc, 'ordinary');
        withSuppressed(() => window.showDialogue?.(npc, 'Garran folds his arms. “My preference remains that Aldric take the hospice. Preference is not the same word as necessity, and I have said so plainly.”', [{ label: 'That matters.', action: () => {} }]));
        return true;
    }

    function revealServiceOptions(npc, mode = 'ordinary') {
        const q = ensureQuest({ announce: false });
        if (!q) return false;
        const skilled = mode === 'skill' || maxPartySkill('persuasion') > 0 || maxPartySkill('divine') > 0;
        addClue('service_options', skilled ? 'Silver Vigil rule and practical staffing discussion' : PRECEPTOR);
        const prefix = skilled
            ? 'Pressed on the distinction between the Order’s preference and the hospice’s actual need, Garran concedes it immediately.'
            : 'Garran considers the question instead of taking offence.';
        withSuppressed(() => window.showDialogue?.(npc,
            `${prefix} “A permanent warden is cleanest. It is not the only way. Aldric could serve a fixed rotation while training two local healers and a road sergeant. And if he believes his life has genuinely moved beyond ordinary assignment, he can petition release from that part of the vow. Openly. I may dislike the answer; I will not pretend our own rule does not allow it.”`,
            [{ label: 'So this is a choice, not a trap.', action: () => {} }]
        ));
        return true;
    }

    function openAdelram(npc) {
        const q = ensureQuest({ announce: false });
        if (!q?.clues?.obedience_vow) return false;
        if (!q.clues.adelram_counsel) addClue('adelram_counsel', npc?.name || 'High Cleric Adelram');
        withSuppressed(() => window.showDialogue?.(npc,
            'Adelram listens without interrupting. “A vow is not serious because it is impossible to change. Marriage vows can be released. Monastic vows can be dispensed. Offices can be resigned. What makes the promise serious is that you do not quietly declare yourself free the moment it becomes inconvenient.”\n\nAldric frowns. “So asking release is not breaking it?”\n\n“It is asking the other party whether the form of your duty still serves the thing you promised yourself to.” Adelram glances at you. “And asking others to share a burden is not the same as abandoning it.”',
            [{ label: 'That is clearer than I expected from a priest.', action: () => window.showDialogue?.(npc, 'Adelram smiles. “Do not spread it around.”', [{ label: 'Your secret is safe.', action: () => {} }]) }]
        ));
        return true;
    }

    function selfDecision() {
        const arc = ensureArc() || {};
        if (Number(arc.discernment || 0) >= 0 || Number(arc.sharedBurden || 0) >= 0) return 'bounded_service';
        return 'literal_return';
    }

    function outcomeSpec(outcome) {
        if (outcome === 'literal_return') return {
            arc: { discernment: -12, sharedBurden: -8 },
            relationship: { approval: 5, trust: 3, familiarity: 4 },
            affinity: { friendship: 3, romanticBond: 1 },
            reason: 'affirmed Aldric’s original obedience vow in its most literal form',
        };
        if (outcome === 'bounded_service') return {
            arc: { discernment: 18, sharedBurden: 20 },
            relationship: { approval: 9, trust: 11, familiarity: 5 },
            affinity: { friendship: 7, romanticBond: 3 },
            reason: 'helped Aldric keep the purpose of his vow while openly sharing and reshaping the burden',
        };
        if (outcome === 'formal_release') return {
            arc: { discernment: 22, sharedBurden: 8 },
            relationship: { approval: 4, trust: 10, familiarity: 6 },
            affinity: { friendship: 6, romanticBond: 3 },
            reason: 'supported Aldric in openly seeking release from an obedience promise whose context had changed',
        };
        if (outcome === 'aldric_decides') return {
            arc: { discernment: 8, sharedBurden: 12 },
            relationship: { approval: 7, trust: 13, familiarity: 6 },
            affinity: { friendship: 8, romanticBond: 4 },
            reason: 'refused to turn Aldric’s vow into another decision made for him',
        };
        return {
            arc: { discernment: -6, sharedBurden: -6 },
            relationship: { approval: -12, trust: -10, familiarity: 4 },
            affinity: { friendship: -7, romanticBond: -5 },
            reason: 'urged Aldric to ignore a real promise without release, amendment, or honest accounting',
        };
    }

    function completeQuest(outcome) {
        const q = quest();
        const companion = aldric();
        if (!q || !companion || q.status === 'completed' || !readyToResolve(q)) return false;
        let effective = outcome;
        if (outcome === 'aldric_decides') {
            effective = selfDecision();
            q.aldricDecision = effective;
        }
        const spec = outcomeSpec(outcome);
        adjustArc(`resolution:${outcome}`, spec.arc, spec.reason);
        applyRelationship(`resolution:${outcome}`, spec.relationship, spec.affinity, spec.reason);

        q.status = 'completed';
        q.resolution = outcome;
        q.effectiveResolution = effective;
        q.completedAt = now();

        if (effective === 'literal_return') {
            q.futureWardenship = true;
            q.description = 'Aldric reaffirmed the original obedience vow. When the present border crisis is concluded, he intends to take permanent wardenship of Saint Orra’s Hospice.';
        } else if (effective === 'bounded_service') {
            q.vowAmended = true;
            q.description = 'The Silver Vigil accepted an amended service: Aldric will serve a fixed hospice rotation and train local healers and guards, sharing the burden instead of treating permanent self-sacrifice as the only faithful answer.';
        } else if (effective === 'formal_release') {
            q.formallyReleased = true;
            q.description = 'Aldric openly petitioned release from the Vigil’s assignment-obedience clause. The Order released him while his broader vows of faith and service remain his own.';
        } else {
            q.unresolvedBreach = true;
            q.description = 'Aldric refused the summons without asking release or amendment. He remains with the party, but the unresolved promise sits badly with him.';
        }

        window.gainExp?.(300);
        window.showMessage?.('Companion quest complete: The Measure of an Oath.');
        setTimeout(showAftermath, 0);
        return true;
    }

    function openReckoning() {
        const companion = aldric();
        const q = quest();
        if (!companion || !readyToResolve(q)) return false;
        withSuppressed(() => window.showDialogue?.(companion,
            'Aldric reads the summons again. “That is almost worse.” At your look, he explains. “Ironbond was easy once we knew the truth. They broke their word. Garran has not. The hospice needs help. I did make the vow. And he is offering me an honest way to change it.”\n\nHe folds the letter. “So now I cannot hide behind being wronged. I have to decide what I actually meant.”',
            [
                { label: '“You promised to go where sent. Keep the vow as you made it, and take the hospice when the present crisis is over.”', action: () => completeQuest('literal_return') },
                { label: '“Keep the duty, not necessarily the original shape. Take a rotation and train people who can carry it with you.”', action: () => completeQuest('bounded_service') },
                { label: '“Your life has changed. Ask openly to be released from the assignment clause, and keep the vows that still belong to you.”', action: () => completeQuest('formal_release') },
                { label: '“It is your vow. You decide what keeping it means, and I will not make the choice for you.”', action: () => completeQuest('aldric_decides') },
                { label: '“Just refuse. You owe the Order nothing after everything you’ve been through.”', action: () => completeQuest('walk_away') },
            ]
        ));
        return true;
    }

    function showAftermath() {
        const companion = aldric();
        const q = quest();
        if (!companion || !q) return false;
        const interpretation = window.companionRomance?.interpretRelationship?.(companion);
        const agreement = window.companionRomance?.ensureAgreement?.(companion);
        const romantic = interpretation?.mode === 'romantic' || Number(interpretation?.romanticBond || 0) >= 45;
        let line;
        if (romantic && agreement && ['dating', 'committed'].includes(agreement.state)) {
            line = 'Later, Aldric finds you alone. “You mattered in that decision. Of course you did.” He takes your hand. “But I will not make you responsible for whether I keep my word. Loving someone is not a loophole out of duty, and duty is not a weapon I get to use against the people who love me. I think I am finally learning both halves at once.”';
        } else if (romantic) {
            line = 'Later, Aldric says, “There is something between us I take seriously. That made the summons harder, not easier. I am glad you did not ask me to prove what I feel by breaking something else I once meant.”';
        } else if (Number(interpretation?.friendship || 0) >= 45) {
            line = 'Later, Aldric gives you a tired smile. “A friend who tells you every obligation is nonsense is easy to find. A friend who helps you work out which obligations are still yours is rarer. Thank you.”';
        } else {
            line = 'Later, Aldric says, “I used to think the cleanest promise was the one that left no room for judgement. I am beginning to suspect that was mostly a way of being certain.”';
        }
        withSuppressed(() => window.showDialogue?.(companion, line, [{ label: 'Stay with him a moment.', action: () => {} }]));
        return true;
    }

    function openAldricHub(npc = aldric()) {
        const q = ensureQuest({ announce: false });
        if (!npc || !q) return false;
        if (!q.introSeen) return showIntro();
        if (q.stage === 'reckoning') return openReckoning();
        const options = [];
        if (!q.clues.hospice_need || !q.clues.obedience_vow) options.push('Preceptor Garran Vey is waiting at the Grand Cathedral to explain the Silver Vigil’s summons.');
        if (q.clues.obedience_vow && !q.clues.adelram_counsel) options.push('High Cleric Adelram may have a useful view on whether a vow can be amended without being discarded.');
        if (!q.clues.service_options && q.clues.hospice_need) options.push('Ask Garran whether Saint Orra’s needs permanent Aldric specifically, or durable service more generally.');
        withSuppressed(() => window.showDialogue?.(npc, options.join('\n\n') || q.description, [
            { label: 'Review what we know.', action: () => window.showDialogue?.(npc, (q.clueOrder || []).map(id => `• ${CLUES[id]?.label || id}`).join('\n') || 'We have not heard the Order out yet.', [{ label: 'Back.', action: () => openAldricHub(npc) }]) }
        ]));
        return true;
    }

    function openHexNear(center, offset = { q: 0, r: 0 }) {
        if (!center) return null;
        const start = { q: Math.round(center.q + offset.q), r: Math.round(center.r + offset.r) };
        const queue = [start];
        const seen = new Set();
        while (queue.length && seen.size < 80) {
            const h = queue.shift();
            const key = `${h.q},${h.r}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const terrain = window.getTerrainAt?.(h.q, h.r)?.name;
            const occupied = (window.entities || []).some(e => e?.alive && e.hex?.q === h.q && e.hex?.r === h.r);
            if (!occupied && !['Wall','Water','Palisade Wall','Keep Wall','Stone Wall'].includes(terrain)) return h;
            queue.push(...(window.getNeighbors?.(h.q, h.r) || []));
        }
        return start;
    }

    function ensurePreceptor() {
        const q = quest();
        if (!q || q.status !== 'active' || typeof window.Entity !== 'function') return null;
        const existing = (window.entities || []).find(e => e?.name === PRECEPTOR);
        if (existing) return existing;
        const adelram = (window.entities || []).find(e => e?.name === 'High Cleric Adelram');
        const center = adelram?.hex || window.campaign2GrandCathedralCenter || window.campaign2SilverhartCenter || window.campaign2PalaceThroneCenter;
        const hex = openHexNear(center, { q: 2, r: 1 });
        if (!hex) return null;
        const e = new window.Entity(PRECEPTOR, '#646b78', hex, 10);
        e.side = 'neutral';
        e.isNPC = true;
        e.race = 'human';
        e.gender = 'male';
        e.dialogueId = PRECEPTOR_DIALOGUE;
        e.noAttack = true;
        e.tags = ['humanoid', 'silverhart', 'silver_vigil', 'quest_npc'];
        e.visualQ = e.startQ = hex.q;
        e.visualR = e.startR = hex.r;
        window.entities.push(e);
        return e;
    }

    function questMenu(npc, prompt, questOptions, original) {
        withSuppressed(() => window.showDialogue?.(npc, prompt, [
            ...questOptions,
            { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) },
        ]));
        return true;
    }

    function installAldricHook() {
        const trees = window.npcDialogueTrees;
        const original = trees?.companion_ser_aldric;
        if (typeof original !== 'function' || original.__aldricMeasureAware) return false;
        const wrapped = function(npc) {
            if (!canStart()) return original.call(this, npc);
            const q = quest();
            if (q?.status === 'completed') return original.call(this, npc);
            return questMenu(npc, q ? 'Aldric keeps the Silver Vigil summons folded inside his prayer book.' : 'Aldric has received a sealed summons from the Order of the Silver Vigil.', [
                { label: q ? 'Talk about the Vigil’s summons.' : '“What did the Silver Vigil want?”', action: () => {
                    ensureQuest();
                    openAldricHub(npc);
                } },
            ], original);
        };
        wrapped.__aldricMeasureAware = true;
        wrapped.__previous = original;
        trees.companion_ser_aldric = wrapped;
        return true;
    }

    function installAdelramHook() {
        const trees = window.npcDialogueTrees;
        const original = trees?.high_cleric;
        if (typeof original !== 'function' || original.__aldricMeasureAware) return false;
        const wrapped = function(npc) {
            const q = quest();
            if (!q || q.status !== 'active' || !q.clues?.obedience_vow || q.clues?.adelram_counsel) return original.call(this, npc);
            return questMenu(npc, 'Adelram notices the Silver Vigil seal in Aldric’s hand before either of you explains.', [
                { label: 'Ask whether an obedience vow can be changed without simply being broken.', action: () => openAdelram(npc) },
            ], original);
        };
        wrapped.__aldricMeasureAware = true;
        wrapped.__previous = original;
        trees.high_cleric = wrapped;
        return true;
    }

    function installPreceptorTree() {
        window.npcDialogueTrees = window.npcDialogueTrees || {};
        window.npcDialogueTrees[PRECEPTOR_DIALOGUE] = npc => openPreceptor(npc);
    }

    function refresh() {
        if (!window.npcDialogueTrees) return false;
        installPreceptorTree();
        installAldricHook();
        installAdelramHook();
        ensurePreceptor();
        return true;
    }

    window.aldricMeasureOfOath = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        canStart,
        ensureArc,
        adjustArc,
        ensureQuest,
        addClue,
        readyToResolve,
        showIntro,
        openPreceptor,
        revealServiceOptions,
        openAdelram,
        openReckoning,
        completeQuest,
        showAftermath,
        openAldricHub,
        ensurePreceptor,
        refresh,
    };

    refresh();
    if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    if (typeof document !== 'undefined') setInterval(refresh, 1500);
    window.ALDRIC_MEASURE_OF_OATH_BUILD = BUILD;
})();
