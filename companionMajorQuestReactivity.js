// companionMajorQuestReactivity.js
// Party-specific reactions to major Campaign 2 quest beats.
//
// Companion personal quests should feed the main story instead of living in
// isolated lanes. This first pass focuses on the Vessel-Seeker / Ashgrave arc:
// Aldric's Broken Vigil affects how he judges followers versus commanders,
// Mirabel's Concordance work changes what magical risks she notices, Fenn's
// stewardship shapes how he talks about death and intervention, Wren's loyalty /
// mercy state changes her emphasis, Reyna can bring lessons from the border, and
// Alden's uncounted Northwatch dead make corpse-taking personal rather than abstract.
(() => {
    'use strict';

    const BUILD = '20260930-companion-major-quest-reactivity-v2';
    let suppressDecoration = 0;

    const party = () => Array.isArray(window.party) ? window.party : [];
    const member = name => party().find((p, index) => index > 0 && p?.name === name) || null;
    const quest = id => (window.questLog || []).find(q => q?.id === id) || null;

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function lineForAldric(stage) {
        const companion = member('Ser Aldric Thorne');
        if (!companion) return null;
        const broken = quest('aldric_broken_vigil');
        if (stage === 'hunt') {
            if (broken?.resolution === 'spare_patrol') {
                return '“End the thing commanding this,” Aldric says. “But if there are frightened servants, coerced acolytes or people obeying because they think they have no choice, do not confuse them with the hand giving the order. I have made that mistake once already.”';
            }
            if (broken?.resolution === 'public_accountability') {
                return '“Whatever is happening in that crypt should come into the light,” Aldric says. “Names, orders, victims. Kill what we must. Record what happened. Evil grows very comfortably in a story nobody can inspect afterward.”';
            }
            if (broken?.resolution === 'buried_for_coin') {
                return 'Aldric’s answer is clipped. “I will help end it. Do not mistake that for believing every truth survives once money enters the room.”';
            }
            return '“If a necromancer is building a body that refuses death, we end the ritual first,” Aldric says. “Afterward we sort out who served willingly and who was dragged behind it.”';
        }
        if (stage === 'lich') {
            return 'Aldric’s hand tightens around his shield strap. “Do not fight the body and call the job finished. Find whatever anchors him here—phylactery, vessel, oath, whatever name the magic uses. Break that, then break him.”';
        }
        if (stage === 'parley') {
            return 'Aldric does not look at Ashgrave. He looks at you. “If you choose his path, I will not follow you down it. Decide with that understood.”';
        }
        return null;
    }

    function lineForMirabel(stage) {
        const companion = member('Mirabel Quill');
        if (!companion) return null;
        const state = window.mirabelUnquietConcordance?.getArcState?.();
        const mq = quest('mirabel_unquiet_concordance');
        if (stage === 'hunt') {
            if (mq?.resolution === 'experiment' || window.mirabelEchoTechniqueLearned) {
                return 'Mirabel is already sketching the geometry in the air. “The Concordance anchored echoes. This is further along the same road—an echo treated as substance, substance treated as a person, then a person treated as something you can nail to the world. I want to see the ritual before we destroy it.”';
            }
            if (state?.restraint >= 15 || mq?.resolution === 'destroy_appendix') {
                return 'Mirabel’s expression is unusually sober. “The dangerous part will look clever. That is how dangerous magic gets written down in the first place. We learn enough to dismantle it and no more than we can justify keeping.”';
            }
            return '“There is a family resemblance to the Concordance,” Mirabel says. “Not the same work. Worse work built from some of the same questions. Which means I may be able to recognise what matters before the room starts glowing.”';
        }
        if (stage === 'lich') {
            return '“If Ashgrave is truly a lich, the body is an inconvenience, not the problem,” Mirabel says. “Find the storage mechanism for the soul. Then we can discuss whether smashing it, unbinding it or stealing its design is the least terrible idea.”';
        }
        if (stage === 'parley') {
            const cautious = state?.restraint >= 15;
            return cautious
                ? 'Mirabel’s voice is low. “He is going to make knowledge sound like permission. It is not.”'
                : 'Mirabel stares at Ashgrave with naked intellectual hunger, then looks away first. “I understand why the offer is tempting. That is not the same as saying take it.”';
        }
        return null;
    }

    function lineForFenn(stage) {
        const companion = member('Fenn Oakheart');
        if (!companion) return null;
        const state = window.fennLivingBoundary?.getArcState?.();
        if (stage === 'hunt') {
            if (state?.stewardship >= 10) {
                return 'Fenn rubs his thumb across his palm. “Death is part of a living system. So is medicine, burial, memory, even magic. The wrongness here is not that someone intervened. It is that they turned dead people into material that cannot choose what happens to them.”';
            }
            return '“Things die,” Fenn says. “That is not cruelty. Refusing to let them finish dying because you want to use what remains—that feels different. Like damming a river until the water forgets there was ever somewhere else to go.”';
        }
        if (stage === 'lich') {
            return '“Whatever holds him here is the blockage,” Fenn says. “The body is just where the pressure shows. Find the thing stopping death from moving on.”';
        }
        if (stage === 'parley') {
            return 'Fenn’s voice is quiet. “Living forever is not the same as living well. Do not let him sell you one as proof of the other.”';
        }
        return null;
    }

    function lineForWren(stage) {
        const companion = member('Wren Talbot');
        if (!companion) return null;
        const state = window.getWrenCharacterState?.() || {};
        const loyalty = Number(state.personalLoyalty || 0);
        const mercy = Number(state.mercy || 0);
        if (stage === 'hunt') {
            if (loyalty >= 25 && mercy < 0) {
                return 'Wren’s answer is immediate. “Find whoever is doing this to people and stop them. If someone in the crypt was forced into it, fine, they get one chance to prove it. Everyone else made their choice.”';
            }
            if (mercy >= 20) {
                return '“End the ritual,” Wren says, “but keep your eyes open for people who are still people. Cults are good at making frightened idiots look like monsters right up until somebody gives them a door out.”';
            }
            return '“I do not know enough to have a clever theory,” Wren says. “I know I would rather find the person pulling the strings than spend all day cutting strings.”';
        }
        if (stage === 'lich') {
            return 'Wren folds her arms. “Destroy the thing keeping him here. Preferably before he gives a speech about how death is for unimaginative people.”';
        }
        if (stage === 'parley') {
            const secure = String(state.attachment || '').includes('secure') || Number(state.security || 0) >= 35;
            return secure
                ? 'Wren’s face has gone very still. “If you do this, I am not going to call it harmless just because I stay. And do not you dare make staying my permission.”'
                : 'Wren looks frightened and furious at once. “Do not make me find out what ‘I do not leave’ costs here.”';
        }
        return null;
    }

    function lineForReyna(stage) {
        const companion = member('Reyna Fletcher');
        if (!companion) return null;
        const rq = quest('reyna_empty_blind');
        if (stage === 'hunt') {
            if (rq?.resolution === 'witness_deal') {
                return '“If there are cultists who want out, give them a way to talk,” Reyna says. “People stay inside bad choices when they think the only thing waiting outside is a rope.”';
            }
            if (rq?.resolution === 'double_agent') {
                return 'Reyna checks her bowstring. “A frightened insider is more useful than a dead one if they can still feed us the wrong route on purpose. Ask questions before arrows, at least once.”';
            }
            return '“Crypts have sight-lines like anywhere else,” Reyna says. “Find the exits, find what they are protecting, then decide who actually needs an arrow.”';
        }
        if (stage === 'lich') {
            return '“If the body gets back up, stop shooting the body,” Reyna says. “Find the thing it keeps coming back to.”';
        }
        if (stage === 'parley') {
            return 'Reyna glances from Ashgrave to you. “You can want what he knows without pretending you owe him yourself in exchange.”';
        }
        return null;
    }

    function lineForAlden(stage) {
        const companion = member('Brother Alden');
        if (!companion) return null;
        const aq = quest('alden_uncounted');
        const state = window.aldenUncounted?.getArcState?.();
        if (stage === 'hunt') {
            if (aq?.clues?.necromancy_parallel || window.aldenNecromancerBodyTrail) {
                return 'Alden’s expression hardens. “One of Northwatch’s uncounted dead vanished between the fort and the cathedral. At the time it was easy to call that paperwork. It is less easy now. If this cult has been acquiring bodies, I want to know whether that person became one of them.”';
            }
            if (state?.particularity >= 10) {
                return '“Do not let the dead become ingredients simply because we cannot name them,” Alden says. “If there are records, tokens, anything that tells us who was used here, preserve them before we destroy the ritual.”';
            }
            return 'Alden folds his hands. “A body is not the whole person. That does not make it ownerless. Whatever the necromancer believes, death is not consent.”';
        }
        if (stage === 'lich') {
            return '“A phylactery is attachment made literal,” Alden says. “Not love. Not memory. A refusal to permit the self to end. Find the object he has made into a chain and break the chain before the body.”';
        }
        if (stage === 'parley') {
            return state?.engagement >= 10
                ? 'Alden steps closer rather than retreating. “I understand wanting more time. I understand fearing an ending. Understanding a desire does not require obeying it. If you choose this, choose it knowing what he has made other people into to get there.”'
                : 'Alden’s voice stays level. “The monastery taught that clinging creates suffering. He is offering you the most absolute form of clinging I can imagine.”';
        }
        return null;
    }

    function counselLines(stage) {
        return [
            ['Ser Aldric Thorne', lineForAldric(stage)],
            ['Mirabel Quill', lineForMirabel(stage)],
            ['Fenn Oakheart', lineForFenn(stage)],
            ['Wren Talbot', lineForWren(stage)],
            ['Reyna Fletcher', lineForReyna(stage)],
            ['Brother Alden', lineForAlden(stage)],
        ].filter(([, text]) => !!text).map(([name, text]) => ({ name, text }));
    }

    function showCounsel(stage, originalNpc = null) {
        const lines = counselLines(stage);
        if (!lines.length || typeof window.showDialogue !== 'function') return false;
        const options = lines.map(line => ({
            label: `Hear ${line.name === 'Ser Aldric Thorne' ? 'Aldric' : line.name === 'Brother Alden' ? 'Alden' : line.name.split(' ')[0]}.`,
            action: () => {
                const speaker = member(line.name) || { name: line.name };
                withSuppressedDecoration(() => window.showDialogue(speaker, line.text, [
                    { label: 'Back to the discussion.', action: () => showCounsel(stage, originalNpc) }
                ]));
            }
        }));
        options.push({ label: 'Enough. I have heard what I need.', action: () => {} });
        const host = originalNpc || member(lines[0].name) || { name: 'Party' };
        withSuppressedDecoration(() => window.showDialogue(host, 'Your companions exchange looks. Everyone seems to have an opinion.', options));
        return true;
    }

    function appendCounselOption(npc, text, options) {
        if (suppressDecoration || !Array.isArray(options) || !options.length) return options;
        const name = String(npc?.name || '');
        const body = String(text || '');
        let stage = null;

        if (name === 'Captain Ilsa Rennick' && body.includes('That disciple was one thread')) stage = 'hunt';
        else if (name === 'Captain Ilsa Rennick' && body.includes('Corvin Ashgrave. That')) stage = 'lich';
        else if ((npc?.isLichBoss || name.includes('Corvin Ashgrave')) && body.includes('Say what you actually want')) stage = 'parley';
        if (!stage || !counselLines(stage).length) return options;

        const label = stage === 'parley'
            ? 'Look to your companions before answering.'
            : 'Ask the companions what they make of this.';
        if (options.some(option => option?.label === label)) return options;
        const extra = { label, action: () => showCounsel(stage, npc) };
        const last = options[options.length - 1];
        if (last && /not yet|never mind|leave|\.\.\./i.test(String(last.label || ''))) {
            return [...options.slice(0, -1), extra, last];
        }
        return [...options, extra];
    }

    function chainHas(fn, flag) {
        let current = fn;
        for (let i = 0; i < 24 && typeof current === 'function'; i++) {
            if (current[flag]) return true;
            current = current.__baseShowDialogue;
        }
        return false;
    }

    function installDialogueHook() {
        if (typeof window.showDialogue !== 'function' || chainHas(window.showDialogue, '__companionMajorQuestReactivityAware')) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            const args = Array.from(arguments);
            args[2] = appendCounselOption(npc, text, options);
            return base.apply(this, args);
        };
        wrapped.__companionMajorQuestReactivityAware = true;
        [
            '__relationshipProgressionAware', '__wrenParentsInvestigationAware', '__wrenCharacterArcAware',
            '__companionRomanceAware', '__wrenPriceOfSilenceAware', '__aldricBrokenVigilAware',
            '__mirabelUnquietConcordanceAware', '__fennLivingBoundaryAware'
        ].forEach(flag => { if (chainHas(base, flag)) wrapped[flag] = true; });
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function applyHuntCompletionReactivity() {
        const hunt = quest('necromancer_hunt');
        if (!hunt || hunt.status !== 'completed' || hunt.companionReactivityApplied) return false;
        const witnesses = party().slice(1).map(p => p?.name).filter(Boolean);
        hunt.companionReactivityApplied = true;
        hunt.companionWitnesses = witnesses;

        const aldric = member('Ser Aldric Thorne');
        if (aldric) {
            window.adjustCompanionRelationship?.(aldric, { approval: 6, trust: 7, familiarity: 2 }, 'helped Aldric end the Vessel-Seeker crypt threat');
            window.adjustCompanionAffinity?.(aldric, { friendship: 4, romanticBond: 1 }, 'faced the Vessel-Seeker threat together', 'major_quest:necromancer_hunt:aldric');
        }
        const mirabel = member('Mirabel Quill');
        if (mirabel) {
            window.adjustCompanionRelationship?.(mirabel, { approval: 4, trust: 5, familiarity: 2 }, 'survived the Vessel-Seeker crypt and tested Mirabel’s theories against reality');
            window.adjustCompanionAffinity?.(mirabel, { friendship: 3 }, 'shared dangerous magical fieldwork', 'major_quest:necromancer_hunt:mirabel');
        }
        const fenn = member('Fenn Oakheart');
        if (fenn) {
            window.adjustCompanionRelationship?.(fenn, { approval: 4, trust: 4, familiarity: 2 }, 'ended a necromantic threat together');
            window.adjustCompanionAffinity?.(fenn, { friendship: 2 }, 'faced the crypt together', 'major_quest:necromancer_hunt:fenn');
        }
        const reynaCompanion = member('Reyna Fletcher');
        if (reynaCompanion) {
            window.adjustCompanionRelationship?.(reynaCompanion, { approval: 4, trust: 4, familiarity: 2 }, 'cleared the Vessel-Seeker crypt together');
            window.adjustCompanionAffinity?.(reynaCompanion, { friendship: 2 }, 'faced the crypt together', 'major_quest:necromancer_hunt:reyna');
        }
        const aldenCompanion = member('Brother Alden');
        if (aldenCompanion) {
            window.adjustCompanionRelationship?.(aldenCompanion, { approval: 6, trust: 6, familiarity: 2 }, 'faced the misuse of the dead in the Vessel-Seeker crypt together');
            window.adjustCompanionAffinity?.(aldenCompanion, { friendship: 3, romanticBond: 1 }, 'faced the necromancer threat together', 'major_quest:necromancer_hunt:alden');
        }
        return true;
    }

    function syncMirabelNecromancyLink() {
        const hunt = quest('necromancer_hunt');
        const mq = quest('mirabel_unquiet_concordance');
        if (!member('Mirabel Quill') || !hunt || !mq || mq.status !== 'active' || mq.clues?.cult_parallel) return false;
        return !!window.mirabelUnquietConcordance?.recordCultParallel?.('active Vessel-Seeker investigation');
    }

    function syncAldenNecromancyLink() {
        const hunt = quest('necromancer_hunt');
        const aq = quest('alden_uncounted');
        if (!member('Brother Alden') || !hunt || !aq || !aq.clues?.cathedral_receipt || aq.clues?.necromancy_parallel) return false;
        const linked = !!window.aldenUncounted?.syncNecromancyParallel?.();
        if (linked) {
            hunt.aldenBodyTrail = true;
            hunt.description = String(hunt.description || '') + ' Alden’s Northwatch burial records suggest at least one missing corpse may belong to the same pattern.';
        }
        return linked;
    }

    function refresh() {
        installDialogueHook();
        syncMirabelNecromancyLink();
        syncAldenNecromancyLink();
        applyHuntCompletionReactivity();
    }

    window.companionMajorQuestReactivity = {
        build: BUILD,
        counselLines,
        showCounsel,
        appendCounselOption,
        syncMirabelNecromancyLink,
        syncAldenNecromancyLink,
        applyHuntCompletionReactivity,
        refresh,
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.COMPANION_MAJOR_QUEST_REACTIVITY_BUILD = BUILD;
})();