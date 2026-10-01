// aldricBrokenVigil.js
// Ser Aldric Thorne's first post-recruitment companion quest.
//
// The quest grows directly from his existing line about the mistake being
// "trusting the wrong company to hold the line with me". It reuses Reddale's
// Ironbond headquarters and Baron rather than creating a disconnected dungeon.
// Ordinary investigation is always sufficient; skills and Ironbond standing
// can uncover the signed withdrawal order sooner and turn inference into proof.
(() => {
    'use strict';

    const BUILD = '20260930-aldric-broken-vigil-v2';
    const ALDRIC_NAME = 'Ser Aldric Thorne';
    const QUEST_ID = 'aldric_broken_vigil';
    const REQUIRED_CLUES = 2;

    const CLUES = Object.freeze({
        company_roster: Object.freeze({
            label: 'Ironbond withdrew the west-road patrol',
            text: 'Ironbond’s old duty roster confirms that six Company blades were assigned to support Aldric on the west road, then recalled together shortly before the goblin attack.'
        }),
        baron_customs: Object.freeze({
            label: 'The recall protected a valuable ore convoy',
            text: 'The Baron’s customs ledger shows an Emberlode ore convoy was due through Reddale that same night. Ironbond reassigned the west-road patrol to protect the cargo after hearing goblins were active nearby.'
        }),
        sealed_dispatch: Object.freeze({
            label: 'The sealed dispatch proves the choice was deliberate',
            text: 'The original Ironbond dispatch explicitly prioritises the ore convoy over the west-road watch and notes that “the paladin remains by his own vow.” The patrol did not desert; Company command knowingly left Aldric behind.'
        }),
    });

    let suppressDecoration = 0;

    const party = () => Array.isArray(window.party) ? window.party : [];
    const aldric = () => party().find((member, index) => index > 0 && member?.name === ALDRIC_NAME) || null;
    const quest = () => (window.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    const maxPartySkill = id => party().reduce((best, member) => Math.max(best, Number(member?.skills?.[id] || 0)), 0);

    function hasStealthTraining() {
        return party().some(member =>
            Number(member?.skills?.stealth_rogue || 0) > 0 ||
            Number(member?.skills?.stealth_agility || 0) > 0
        );
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function relationshipReady() {
        return typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    // Rescue is meaningful evidence of reliability, but it does not make Aldric
    // an old friend. His authored start deliberately keeps familiarity below the
    // ordinary clothing-styling threshold while trust starts somewhat higher.
    function ensureAldricStart() {
        const companion = aldric();
        if (!companion) return false;

        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: 18,
            trust: 30,
            approval: 60,
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
                familiarity: 18,
                trust: 30,
                ...(window.companionAttitude?.[ALDRIC_NAME] === undefined ? { approval: 60 } : {}),
            }, 'authored_start:aldric_rescued_companion');
        } else {
            window.getCompanionRelationship(companion);
        }
        companion.aldricRelationshipStartApplied = true;
        return true;
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Broken Vigil',
                giver: ALDRIC_NAME,
                status: 'active',
                resolution: null,
                description: 'Find out why the Ironbond patrol that promised to hold the west road withdrew and left Aldric alone when the Skarn-tooth goblins attacked.',
                clues: {},
                clueOrder: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            window.showMessage?.('Companion quest added: The Broken Vigil.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        return q;
    }

    function clueCount(q = quest()) {
        return q ? Object.keys(q.clues || {}).length : 0;
    }

    function hasEnoughEvidence(q = quest()) {
        return !!q && !!(q.clues?.sealed_dispatch || (q.clues?.company_roster && q.clues?.baron_customs) || clueCount(q) >= REQUIRED_CLUES);
    }

    function addClue(id, source = null) {
        const spec = CLUES[id];
        if (!spec) return false;
        const q = ensureQuest();
        if (q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: Number(window.worldSeconds || 0) };
        q.clueOrder.push(id);
        q.description = hasEnoughEvidence(q)
            ? 'You know why Ironbond abandoned Aldric’s position. Talk to Aldric about what should happen next.'
            : `Investigate Ironbond’s withdrawal from Aldric’s west-road watch. Evidence found: ${clueCount(q)}/${REQUIRED_CLUES}.`;
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function startQuest() {
        const companion = aldric();
        if (!companion) return false;
        ensureAldricStart();
        const existing = quest();
        if (existing) return existing;
        const q = ensureQuest();

        // Starting a genuinely personal investigation makes the two characters
        // know one another a little better, without treating mere conversation
        // as proof of trust.
        window.noteCompanionConversation?.(companion, 'aldric:broken_vigil_opened', 3);
        return q;
    }

    function explainQuest(companion) {
        startQuest();
        withSuppressedDecoration(() => window.showDialogue(companion,
            '“Ironbond,” Aldric says. “Six of their blades were contracted to hold the west road with me while Hollowmere cleared its outlying farms. They were there at dusk. By dawn they were gone, and the goblins came through the gap.”\n\nHe looks away. “I kept my vow and they tied me to a post for it. I always called those six cowards. Lately I’ve wondered whether I ever learned enough to judge them. If we reach Reddale, I want the duty books.”',
            [
                { label: '“Then we find out who actually broke their word.”', action: () => {} },
                { label: '“I’ll help you get the truth.”', action: () => {} },
            ]
        ));
    }

    function investigateCompany(npc) {
        const q = ensureQuest();
        const options = [];

        if (!q.clues.company_roster) {
            options.push({
                label: 'Show us the old west-road duty roster.',
                action: () => {
                    addClue('company_roster', npc?.name || 'Ironbond duty archive');
                    withSuppressedDecoration(() => window.showDialogue(npc,
                        'Petra’s expression tightens, but she eventually produces a weathered duty book. Six names sit beside “West Road — support Paladin Thorne.” Every one is crossed through at the same hour with the same notation: “priority transfer — Reddale.”\n\n“They didn’t run,” Petra says. “Whatever else happened, someone recalled them.”',
                        [{ label: 'Who gave the order?', action: () => investigateCompany(npc) }]
                    ));
                }
            });
        }

        const canPersuade = maxPartySkill('persuasion') > 0;
        const canRead = maxPartySkill('insight') > 0;
        const trustedByIronbond = Number(window.factions?.ironbond_company?.standing || 0) >= 20;

        if (!q.clues.sealed_dispatch && canPersuade) {
            options.push({
                label: '[Persuasion] If Ironbond did nothing wrong, let Aldric read the order.',
                action: () => {
                    addClue('company_roster', npc?.name || 'Ironbond duty archive');
                    addClue('sealed_dispatch', 'Persuasion — Ironbond archive');
                    withSuppressedDecoration(() => window.showDialogue(npc,
                        'Petra studies Aldric for a long moment, then unlocks a smaller ledger chest. The original dispatch is still there. It orders the west-road patrol onto an ore convoy and, in the margin, dismisses Aldric with six cold words: “paladin remains by his own vow.”',
                        [{ label: 'That is clear enough.', action: () => {} }]
                    ));
                }
            });
        }

        if (!q.clues.sealed_dispatch && canRead) {
            options.push({
                label: '[Insight] You keep saying “recalled”, not “deserted”. Who signed it?',
                action: () => {
                    addClue('company_roster', npc?.name || 'Ironbond duty archive');
                    addClue('sealed_dispatch', 'Insight — Petra Voss');
                    withSuppressedDecoration(() => window.showDialogue(npc,
                        'Petra exhales through her nose. “My predecessor. Not the patrol.” She pulls the sealed dispatch from the archive herself. The order is blunt: protect the ore shipment, abandon the west-road support contract, and leave “the paladin” to his vow.',
                        [{ label: 'Thank you for telling us.', action: () => {} }]
                    ));
                }
            });
        }

        if (!q.clues.sealed_dispatch && trustedByIronbond) {
            options.push({
                label: '[Ironbond standing] We’ve earned enough trust to see the original dispatch.',
                action: () => {
                    addClue('company_roster', npc?.name || 'Ironbond duty archive');
                    addClue('sealed_dispatch', 'Ironbond archive access');
                    withSuppressedDecoration(() => window.showDialogue(npc,
                        'Petra gives a reluctant nod. “You have earned that much.” The sealed order is unambiguous: the west-road patrol was reassigned to protect a lucrative ore convoy. Aldric’s position was knowingly left uncovered.',
                        [{ label: 'We have what we came for.', action: () => {} }]
                    ));
                }
            });
        }

        if (!q.clues.sealed_dispatch && hasStealthTraining()) {
            options.push({
                label: '[Stealth] Come back after hours and copy the sealed dispatch.',
                action: () => {
                    addClue('company_roster', npc?.name || 'Ironbond duty archive');
                    addClue('sealed_dispatch', 'Stealth — copied Ironbond dispatch');
                    withSuppressedDecoration(() => window.showDialogue(npc,
                        'Later, with the guildhouse quiet, you find the corresponding dispatch in a locked ledger chest and copy it without taking the original. It explicitly trades the west-road watch for protection of an ore convoy and notes that Aldric would remain because of his vow.',
                        [{ label: 'Leave everything exactly where it was.', action: () => {} }]
                    ));
                }
            });
        }

        options.push({ label: 'That is all for now.', action: () => {} });
        withSuppressedDecoration(() => window.showDialogue(npc,
            q.clues.company_roster
                ? '“You have the roster,” Petra says. “How much further you push this is your affair.”'
                : 'Petra Voss folds her arms. “Old patrol records? That is a peculiar thing to come digging for.”',
            options
        ));
    }

    function investigateBaron(npc) {
        const q = ensureQuest();
        if (q.clues.baron_customs) {
            withSuppressedDecoration(() => window.showDialogue(npc,
                '“The customs entry has not changed,” the Baron says. “Ironbond moved six armed men from the west road to its ore convoy. Whatever justification they offer, that is what the record says.”',
                [{ label: 'Understood.', action: () => {} }]
            ));
            return;
        }

        addClue('baron_customs', npc?.name || 'Baronial customs ledger');
        withSuppressedDecoration(() => window.showDialogue(npc,
            'The Baron has an old customs ledger brought out. The date is the same night Aldric was taken. An Emberlode ore convoy was due through Reddale before dawn; beside it, a clerk recorded six extra Ironbond guards “transferred from western watch by Company order.”\n\nCorwin taps the line. “They protected their cargo. Your paladin protected people. Only one of those promises was left uncovered.”',
            [{ label: 'That explains the recall.', action: () => {} }]
        ));
    }

    function outcomeSpec(resolution, fullProof) {
        const proofBonus = fullProof ? 2 : 0;
        if (resolution === 'public_accountability') {
            return {
                relationship: { approval: 8, trust: 10 + proofBonus, familiarity: 4 },
                affinity: { friendship: 6, romanticBond: 2 },
                reason: 'helped Aldric put Ironbond’s broken promise on the public record',
                line: 'Aldric nods. “Good. Not because I need vengeance. Because next time a contract says six people are holding a flank, someone should know what that promise costs.”',
            };
        }
        if (resolution === 'spare_patrol') {
            return {
                relationship: { approval: 10, trust: 12 + proofBonus, familiarity: 5 },
                affinity: { friendship: 7, romanticBond: 3 },
                reason: 'held Ironbond command accountable without blaming the patrol that obeyed it',
                line: 'Aldric is quiet, then gives a small, rueful smile. “I spent a long time calling six strangers cowards because anger was simpler than doubt. You’re right. The order belongs to the people who gave it.”',
            };
        }
        if (resolution === 'private_closure') {
            return {
                relationship: { approval: 4, trust: 7 + proofBonus, familiarity: 5 },
                affinity: { friendship: 4, romanticBond: 1 },
                reason: 'helped Aldric learn the truth and choose not to let Ironbond define the rest of his life',
                line: 'Aldric folds the copied record once and puts it away. “Knowing is enough for me, then. I won’t forgive the choice. But I won’t spend the next ten years still standing at that post, either.”',
            };
        }
        return {
            relationship: { approval: -18, trust: -15, familiarity: 4 },
            affinity: { friendship: -10, romanticBond: -6 },
            reason: 'buried the truth about Aldric’s abandonment in exchange for Ironbond money',
            line: 'Aldric stares at you for several seconds. “So that is what my vow was worth in the end. A line item.” His voice stays controlled. “Keep the coin. Don’t ask me to call this settled.”',
        };
    }

    function completeQuest(resolution) {
        const companion = aldric();
        const q = quest();
        if (!companion || !q || q.status === 'completed' || !hasEnoughEvidence(q)) return false;

        const fullProof = !!q.clues.sealed_dispatch;
        const spec = outcomeSpec(resolution, fullProof);
        q.status = 'completed';
        q.resolution = resolution;
        q.fullProof = fullProof;
        q.completedAt = Number(window.worldSeconds || 0);

        if (resolution === 'public_accountability') {
            q.publicRecord = true;
            window.adjustReputation?.(window.factions?.ironbond_company, -5, 10);
            window.adjustSurfacePower?.(-2);
            q.description = 'You established that Ironbond command knowingly abandoned Aldric’s watch and put the broken contract on the public record.';
        } else if (resolution === 'spare_patrol') {
            q.rankAndFileSpared = true;
            window.adjustReputation?.(window.factions?.ironbond_company, -3, 8);
            window.adjustSurfacePower?.(-1);
            q.description = 'You established that Ironbond command abandoned Aldric while keeping blame off the six patrol soldiers who obeyed the recall.';
        } else if (resolution === 'private_closure') {
            q.privateClosure = true;
            q.description = 'Aldric learned why the patrol left and chose to keep the truth private rather than let the old betrayal define him.';
        } else {
            q.evidenceBuried = true;
            const player = party()[0];
            if (player) player.gold = Number(player.gold || 0) + 120;
            window.adjustReputation?.(window.factions?.ironbond_company, 6, 10);
            window.adjustSurfacePower?.(2);
            q.description = 'You buried the evidence of Ironbond’s broken contract in exchange for Company money. Aldric has not mistaken that for closure.';
            window.showMessage?.('Ironbond pays 120 gold to close the matter.');
        }

        window.adjustCompanionRelationship?.(companion, spec.relationship, spec.reason);
        window.adjustCompanionAffinity?.(companion, spec.affinity, spec.reason, `aldric_broken_vigil:${resolution}`);
        window.gainExp?.(fullProof ? 300 : 240);
        window.showMessage?.(`Companion quest complete: The Broken Vigil.${fullProof ? ' Signed order recovered.' : ''}`);
        withSuppressedDecoration(() => window.showDialogue(companion, spec.line, [
            { label: 'Stay with him a moment.', action: () => {} }
        ]));
        return true;
    }

    function resolveWithAldric(companion) {
        const q = quest();
        if (!q || q.status === 'completed' || !hasEnoughEvidence(q)) return false;
        const fullProof = !!q.clues.sealed_dispatch;
        const truth = fullProof
            ? 'The signed order leaves no room for doubt. Ironbond command pulled the six-person patrol off the west road to protect an Emberlode ore convoy and explicitly noted that Aldric would remain because his vow would keep him there.'
            : 'The records line up. Ironbond recalled all six soldiers from Aldric’s west-road watch at the same hour it reinforced a valuable Emberlode ore convoy. The patrol did not simply run; Company command chose the cargo over the position.';

        withSuppressedDecoration(() => window.showDialogue(companion,
            `${truth}\n\nAldric reads the evidence twice. “Then I was wrong about the six. Not about Ironbond.”`,
            [
                { label: '“Put the order on the public record. The Company should answer for it.”', action: () => completeQuest('public_accountability') },
                { label: '“Hold the people who gave the order responsible. Leave the patrol’s names out of it.”', action: () => completeQuest('spare_patrol') },
                { label: '“You know the truth now. You don’t have to keep living at that post.”', action: () => completeQuest('private_closure') },
                { label: '“Ironbond will pay to keep this quiet. Take the settlement and close it.”', action: () => completeQuest('buried_for_money') },
            ]
        ));
        return true;
    }

    function completedFollowup(companion, q) {
        const lines = {
            public_accountability: '“It is in the record now. That matters more than I expected. A vow should bind the person who speaks it — not become an excuse for everyone around them to stop keeping theirs.”',
            spare_patrol: '“I keep thinking about those six soldiers. I’m glad we left their names out of it. Obedience can still be cowardice, but I had no right to decide that before I knew the order they were under.”',
            private_closure: '“Some mornings I still wake up back at that post. Fewer than before. Truth did not fix it. It did make it mine to put down.”',
            buried_for_money: '“I said I would stay. I did not say I would pretend that choice was harmless.”',
        };
        withSuppressedDecoration(() => window.showDialogue(companion, lines[q.resolution] || '“We know what happened. That is something.”', [
            { label: 'Understood.', action: () => {} }
        ]));
    }

    function insertBeforeExit(options, addition) {
        const out = Array.isArray(options) ? [...options] : [];
        if (out.some(option => option?.__aldricBrokenVigilOption)) return out;
        addition.__aldricBrokenVigilOption = true;
        const index = out.findIndex(option => /never mind|goodbye|leave/i.test(String(option?.label || '')));
        if (index >= 0) out.splice(index, 0, addition);
        else out.push(addition);
        return out;
    }

    function decorateDialogue(npc, text, options) {
        if (suppressDecoration > 0 || !npc) return options;
        const name = npc.name;
        const q = quest();

        if (name === ALDRIC_NAME && String(text) === 'You wished to speak with me?') {
            const companion = aldric();
            if (!companion) return options;
            let addition;
            if (!q) {
                addition = {
                    label: 'About the company that left you at the goblin camp...',
                    action: () => explainQuest(companion),
                };
            } else if (q.status === 'completed') {
                addition = {
                    label: 'About the west-road watch...',
                    action: () => completedFollowup(companion, q),
                };
            } else if (hasEnoughEvidence(q)) {
                addition = {
                    label: 'I know why Ironbond pulled the patrol.',
                    action: () => resolveWithAldric(companion),
                };
            } else {
                addition = {
                    label: 'About the west-road patrol...',
                    action: () => withSuppressedDecoration(() => window.showDialogue(companion,
                        '“Reddale,” Aldric says. “Ironbond kept its local duty books there. If there was an order, that is where the paper trail starts.”',
                        [{ label: 'We’ll keep looking.', action: () => {} }]
                    )),
                };
            }
            return insertBeforeExit(options, addition);
        }

        if (q?.status === 'active' && name === 'Guildmaster Petra Voss') {
            return insertBeforeExit(options, {
                label: 'Ask about the patrol that abandoned Aldric’s west-road watch.',
                action: () => investigateCompany(npc),
            });
        }

        if (q?.status === 'active' && name === 'Baron Corwin Aldervale') {
            return insertBeforeExit(options, {
                label: 'Ask what the Baron’s records show about Ironbond’s west-road withdrawal.',
                action: () => investigateBaron(npc),
            });
        }

        return options;
    }

    function chainHas(fn, flag) {
        let current = fn;
        for (let i = 0; i < 16 && typeof current === 'function'; i++) {
            if (current[flag]) return true;
            current = current.__baseShowDialogue;
        }
        return false;
    }

    function installDialogueHook() {
        if (typeof window.showDialogue !== 'function' || chainHas(window.showDialogue, '__aldricBrokenVigilAware')) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            return base.call(this, npc, text, decorateDialogue(npc, text, options));
        };
        wrapped.__aldricBrokenVigilAware = true;
        // Existing relationship/romance modules also periodically repair their
        // showDialogue wrappers. Carry their markers through this outer wrapper
        // so none of the self-healing installers repeatedly wrap one another.
        [
            '__relationshipProgressionAware',
            '__wrenParentsInvestigationAware',
            '__wrenCharacterArcAware',
            '__companionRomanceAware',
        ].forEach(flag => {
            if (chainHas(base, flag)) wrapped[flag] = true;
        });
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function refresh() {
        installDialogueHook();
        ensureAldricStart();
    }

    window.aldricBrokenVigil = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        ensureAldricStart,
        ensureQuest,
        startQuest,
        addClue,
        clueCount,
        hasEnoughEvidence,
        investigateCompany,
        investigateBaron,
        resolveWithAldric,
        completeQuest,
        refresh,
    };
    window.startAldricBrokenVigil = startQuest;

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    const timer = setInterval(refresh, 1000);
    window.addEventListener?.('beforeunload', () => clearInterval(timer), { once: true });
    window.ALDRIC_BROKEN_VIGIL_BUILD = BUILD;
})();
