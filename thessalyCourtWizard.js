// thessalyCourtWizard.js
// Court Wizard Thessaly's first persistent-character story pass.
//
// Thessaly already sits inside two substantial stories: A Noble's Grudge can
// put compromising evidence about her into the hands of Thessaly, Seraphine or
// Lady Corstane; and Mirabel's Concordance chapter brings dangerous restricted
// scholarship directly into Thessaly's archive. This pass gives those choices
// memory and personality rather than inventing another side quest.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-thessaly-court-wizard-v1';
    const THESSALY = 'Court Wizard Thessaly';
    const MIRABEL = 'Mirabel Quill';

    function party() {
        return Array.isArray(root.party) ? root.party : [];
    }

    function quest(id) {
        return (root.questLog || []).find(entry => entry?.id === id) || null;
    }

    function relationship() {
        return root.getPersistentCharacterRelationship?.(THESSALY) || null;
    }

    function vendetta() {
        return quest('wizard_vendetta');
    }

    function concordance() {
        return quest('mirabel_unquiet_concordance');
    }

    function mirabel() {
        return party().find((member, index) => index > 0 && member?.name === MIRABEL) || null;
    }

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(THESSALY, key, delta);
    }

    function vendettaFollowupText() {
        const q = vendetta();
        if (!q || q.status !== 'completed') {
            return 'Thessaly raises one eyebrow. “If this is about court gossip, bring me evidence or bring me wine. I have limited patience for the middle category.”';
        }
        if (q.resolution === 'wizard') {
            return 'Thessaly does not pretend innocence. “No, Corstane was not entirely wrong. That is what made the evidence useful. Some of it was true; some of it was truth with the surrounding facts cut away until it pointed exactly where she wanted.” She studies you. “You gave it to me instead of pretending that meant I had nothing to answer for. I remember both parts.”';
        }
        if (q.resolution === 'queen') {
            return '“You took it to Seraphine.” Thessaly’s mouth tightens. “I disliked that intensely. It was also the correct place to take evidence about a royal officer if you believed it mattered.” After a pause she adds, “Trust is not the same thing as wanting never to be scrutinised. Court wizards who forget that eventually become court problems.”';
        }
        if (q.resolution === 'noble') {
            return 'Thessaly’s expression cools. “You gave Corstane exactly what she wanted: not truth, leverage. Perhaps you thought she deserved it. Perhaps you simply preferred her side.” She folds her hands. “Either way, do not ask me to pretend the choice was neutral because the papers themselves were real.”';
        }
        return '“Someone wanted my decisions turned into a weapon at court,” Thessaly says. “That is not unusual enough to be interesting on its own.”';
    }

    function recordVendettaFollowup() {
        const q = vendetta();
        if (!q || q.status !== 'completed') {
            return root.notePersistentCharacterConversation?.(THESSALY, 'thessaly:vendetta:unfinished', { familiarity: 1 });
        }
        const deltas = q.resolution === 'wizard'
            ? { familiarity: 3, trust: 2, friendship: 4 }
            : q.resolution === 'queen'
                ? { familiarity: 3, trust: 3, friendship: 2 }
                : { familiarity: 2, friendship: 0 };
        return root.notePersistentCharacterConversation?.(
            THESSALY,
            `thessaly:vendetta:followup:${q.resolution || 'unknown'}`,
            deltas
        );
    }

    function concordanceReactionText() {
        const q = concordance();
        if (!q) {
            return '“Mirabel has not brought me anything alarming lately,” Thessaly says. “For Mirabel, I count that as a temporary statistical anomaly.”';
        }
        if (q.status !== 'completed') {
            return '“The Concordance is dangerous because it is clever before it is obviously monstrous,” Thessaly says. “Mirabel understands the first half instinctively. Make sure she does not treat understanding the second half as an insult to the first.”';
        }
        if (q.resolution === 'preserve_sealed') {
            return 'Thessaly nods. “Good. Restriction is not destruction. We keep the method, the warnings, the mistakes and enough context for the next scholar to understand why access has conditions.” She allows herself a thin smile. “Mirabel will complain. Complaining is not evidence the policy failed.”';
        }
        if (q.resolution === 'preserve_open') {
            return 'Thessaly exhales through her nose. “Open access is a beautiful principle right up until the dangerous method is reproducible by the least careful reader in the room.” She taps the desk. “Peer scrutiny makes scholarship stronger. It does not make soul-binding-adjacent geometry harmless.”';
        }
        if (q.resolution === 'destroy_appendix') {
            return '“I would have kept one controlled copy,” Thessaly says. “Destroying a method does not guarantee nobody rediscovers it, and the next person may lack the warnings you burned with it.” She pauses. “Still—you recognised that knowledge can impose obligations. I disagree with the remedy more than the diagnosis.”';
        }
        if (q.resolution === 'experiment') {
            return 'Thessaly goes very still. “You tested it.” The words are not a question. “A failed experiment is a warning. A successful one is often more dangerous: now everyone knows the forbidden thing works.” She looks toward Mirabel if she is present. “Write down exactly what you did, then we discuss who is allowed to repeat it.”';
        }
        return '“The Concordance belongs in an archive with context attached,” Thessaly says. “That sentence is less exciting than most magical disasters, which is why I recommend it.”';
    }

    function concordanceDelta() {
        const q = concordance();
        if (!q || q.status !== 'completed') return { familiarity: 1 };
        if (q.resolution === 'preserve_sealed') return { familiarity: 3, trust: 6, friendship: 3 };
        if (q.resolution === 'preserve_open') return { familiarity: 3, trust: -4, friendship: -1 };
        if (q.resolution === 'destroy_appendix') return { familiarity: 3, trust: 2, friendship: 1 };
        if (q.resolution === 'experiment') return { familiarity: 4, trust: -3, friendship: 1 };
        return { familiarity: 2 };
    }

    function recordConcordanceReaction() {
        const q = concordance();
        const key = q?.status === 'completed'
            ? `thessaly:concordance:${q.resolution || 'unknown'}`
            : 'thessaly:concordance:ongoing';
        const result = record(key, concordanceDelta());
        const companion = mirabel();
        if (companion) root.noteCompanionConversation?.(companion, 'mirabel:thessaly_concordance_reaction', 1);
        return result;
    }

    function dangerousKnowledgeText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return '“Because destroying a book does not destroy the question that produced it.” Thessaly’s tone is clipped. “That is the professional answer. I do not know you well enough for the longer one.”';
        }
        if (rel.friendship < 12) {
            return '“Because institutions become dangerous when they curate themselves into innocence.” Thessaly glances toward the locked archive. “If we keep only the spells we are proud of, the next generation gets to make every old mistake while believing it invented the mistake itself.”';
        }
        return 'Thessaly leans back. “Because I have watched three generations of bright magi independently rediscover ideas their predecessors tried to erase. Secrecy can be necessary. Forgetting is different.” Her expression softens slightly. “I keep dangerous records because somebody should remember both the temptation and the body count.”';
    }

    function recordDangerousKnowledgeConversation() {
        return root.notePersistentCharacterConversation?.(
            THESSALY,
            'thessaly:why_keep_dangerous_knowledge',
            { familiarity: 3, trust: 1, friendship: 4 }
        );
    }

    function showVendettaFollowup(npc) {
        recordVendettaFollowup();
        if (typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc, vendettaFollowupText(), [{ label: 'Understood.', action: () => {} }]);
        return true;
    }

    function showConcordanceReaction(npc) {
        recordConcordanceReaction();
        if (typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc, concordanceReactionText(), [{ label: 'I’ll keep that in mind.', action: () => {} }]);
        return true;
    }

    function showDangerousKnowledgeConversation(npc) {
        recordDangerousKnowledgeConversation();
        if (typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc, dangerousKnowledgeText(), [{ label: 'That is a better reason than curiosity.', action: () => {} }]);
        return true;
    }

    function decorateOptions(npc, options) {
        if (!Array.isArray(options)) return options;
        const decorated = [...options];
        const v = vendetta();
        const c = concordance();
        const rel = relationship();

        if (v?.status === 'completed') {
            decorated.unshift({
                label: v.resolution === 'noble'
                    ? 'About the evidence I gave Lady Corstane...'
                    : v.resolution === 'queen'
                        ? 'About the evidence I took to Seraphine...'
                        : 'About Corstane’s evidence against you...',
                action: () => showVendettaFollowup(npc),
            });
        }

        if (c) {
            decorated.unshift({
                label: c.status === 'completed'
                    ? 'What do you think of what Mirabel and I did with the Concordance?'
                    : 'Mirabel is still working through the Concordance. What worries you about it?',
                action: () => showConcordanceReaction(npc),
            });
        }

        if ((rel?.familiarity ?? 0) >= 8) {
            decorated.unshift({
                label: 'Why keep dangerous knowledge at all?'
                ,action: () => showDangerousKnowledgeConversation(npc),
            });
        }
        return decorated;
    }

    function wrapDialogueTree() {
        const trees = root.npcDialogueTrees;
        const base = trees?.royal_wizard;
        if (typeof base !== 'function' || base.__thessalyPersistentAware) return false;
        const wrapped = function(npc) {
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let firstDialogue = true;
            root.showDialogue = function(speaker, text, options) {
                if (firstDialogue && speaker === npc) {
                    firstDialogue = false;
                    const args = [...arguments];
                    args[2] = decorateOptions(npc, options);
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
        wrapped.__thessalyPersistentAware = true;
        wrapped.__baseThessalyPersistentDialogue = base;
        trees.royal_wizard = wrapped;
        return true;
    }

    function install() {
        wrapDialogueTree();
        return true;
    }

    const api = {
        build: BUILD,
        vendettaFollowupText,
        recordVendettaFollowup,
        concordanceReactionText,
        concordanceDelta,
        recordConcordanceReaction,
        dangerousKnowledgeText,
        recordDangerousKnowledgeConversation,
        showVendettaFollowup,
        showConcordanceReaction,
        showDangerousKnowledgeConversation,
        decorateOptions,
        install,
    };

    root.thessalyCourtWizard = api;
    root.THESSALY_COURT_WIZARD_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
