// persistentCharacterCrossReactivity.js
// Cross-character reactions for the persistent non-companion cast.
//
// The individual character passes deliberately remain authoritative for each
// person's own story. This module only fills the strongest missing connective
// tissue between them. It does NOT make every major NPC comment on every quest.
// Existing direct links are left alone:
//   Aelwen <-> Seraphine <-> Nessa: The Living Accord
//   Balrik <-> Thrain: The Last Hold
//   Thessaly <-> Mirabel: The Unquiet Concordance
//   Adelram <-> Alden: The Uncounted
//   Ilsa <-> Reyna: The Empty Blind
//
// The missing circles are:
//   1) Silverhart court: Seraphine, Thessaly and Adelram responding to the same
//      necromancy / dangerous-knowledge problem from political, scholarly and
//      religious perspectives.
//   2) Reddale / Ironbond: Seraphine, Petra and Ilsa responding to corporate
//      wrongdoing without collapsing "institution", "employee", "witness" and
//      "culprit" into one category.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-persistent-cross-reactivity-v1';
    let suppressDecoration = 0;

    const SERAPHINE = 'Queen Seraphine Corrin';
    const THESSALY = 'Court Wizard Thessaly';
    const ADEL = 'High Cleric Adelram';
    const PETRA = 'Guildmaster Petra Voss';
    const ILSA = 'Captain Ilsa Rennick';

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const relationship = name => root.getPersistentCharacterRelationship?.(name) || null;

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function note(name, key, delta = { familiarity: 2, friendship: 2 }) {
        return root.notePersistentCharacterConversation?.(name, key, delta);
    }

    function hasNecromancyNetworkContext() {
        return !!(
            quest('necromancer_hunt') || quest('necromancer_lichdom') ||
            root.phylacteryReturned || root.playerIsLich || root.necromancerAllied ||
            root.vampireLeadConfirmed
        );
    }

    function hasReddaleInstitutionContext() {
        return !!(
            root.ironbondArc?.crownInfiltrationRevealed ||
            quest('wren_price_of_silence')?.status === 'completed' ||
            quest('aldric_broken_vigil')?.status === 'completed' ||
            quest('reyna_empty_blind')?.status === 'completed'
        );
    }

    function seraphineCourtText() {
        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            return 'Seraphine’s expression hardens. “Thessaly wants every mechanism Ashgrave taught you documented because ignorance will not make the knowledge vanish. Adelram wants every line around its use stated plainly because knowledge is not permission.” She folds her hands. “They sound like opposite instincts until you notice both are trying to stop fascination becoming policy. I need both.”';
        }
        if (root.phylacteryReturned) {
            return '“Thessaly wants a technical record of the phylactery. Adelram says custody is an obligation, not proof of safety.” Seraphine gives a tired half-smile. “For once I solved an argument by refusing to let either institution own the answer. Crown inventory, Cathedral witness, wizardly containment record. If one of them stops asking questions, the other two should notice.”';
        }
        if (lich?.status === 'completed' || quest('necromancer_hunt')?.status === 'completed') {
            return '“Thessaly records how Ashgrave’s magic worked. Adelram records who it was done to,” Seraphine says. “I have learned not to call those competing priorities. A kingdom that remembers only the mechanism repeats the cruelty. A kingdom that remembers only the horror forgets how to recognise the mechanism next time.”';
        }
        if (root.vampireLeadConfirmed) {
            return 'Seraphine glances toward the Cathedral quarter. “Adelram’s old text gave us a useful question. The evidence corrected the text. Thessaly calls that scholarship; Adelram calls it humility. Court life rarely gives me two experts saying nearly the same sensible thing in different vocabularies. I am trying to enjoy it.”';
        }
        return '“I keep a court wizard and a high cleric partly because neither one is allowed to be the kingdom’s entire theory of the supernatural,” Seraphine says. “Certainty is safer when somebody competent is paid to disagree with it.”';
    }

    function thessalyAdelramText() {
        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            return 'Thessaly’s usual irony disappears. “Adelram is not frightened of knowledge. He is frightened of appetite learning to call itself study. In Ashgrave’s case that distinction matters.” She taps a closed folio. “I still want the method recorded. He still wants hard limits around anyone using it. Those positions are irritatingly compatible.”';
        }
        if (root.phylacteryReturned) {
            return '“Adelram and I disagree about custody mostly because we are responsible for different failure modes,” Thessaly says. “I worry someone will destroy the evidence and force the next mage to rediscover it blind. He worries someone will preserve it until preservation quietly becomes permission. Both have happened before.”';
        }
        if (root.vampireLeadConfirmed) {
            return 'Thessaly smiles slightly. “Adelram brought you an old description, you brought back contradictory evidence, and he changed his interpretation. That is scholarship wearing vestments. I approve, which I assume will annoy him pleasantly.”';
        }
        return '“Adelram and I disagree often,” Thessaly says. “The useful part is that he distinguishes a moral objection from an empirical claim. I can argue with the first and test the second.”';
    }

    function adelramThessalyText() {
        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            return 'Adelram is quiet before answering. “Thessaly understands the temptation better than most priests do. That is precisely why I listen when she says an idea is dangerous even though she wants it documented.” He meets your eye. “Keeping a record of Ashgrave’s path is not walking it. Pretending there is no difference would make honest scholarship impossible.”';
        }
        if (root.phylacteryReturned) {
            return '“Thessaly wants enough of the phylactery understood that nobody mistakes ignorance for containment,” Adelram says. “I want enough restraint that understanding never becomes entitlement. We are each suspicious of the other’s professional vice. That is not a bad arrangement for something this dangerous.”';
        }
        if (root.vampireLeadConfirmed) {
            return 'Adelram’s mouth quirks. “Thessaly called my revised interpretation ‘scholarship wearing vestments’. I decided not to object, mostly because she was correct.”';
        }
        return '“I do not need every mage to share my theology,” Adelram says. “I need them to recognise that capability is not the same thing as permission. Thessaly usually does.”';
    }

    function petraStance() {
        return root.petraIronbondFactor?.factorStance?.() || 'pragmatic_factor';
    }

    function seraphineIronbondText() {
        const exposed = !!root.ironbondArc?.crownInfiltrationRevealed;
        const stance = petraStance();
        if (!exposed) {
            return 'Seraphine folds one hand over the other. “Petra understands how Ironbond actually moves money and people. Ilsa understands what can be proved in a court. I do not need those to be the same expertise, and I do not intend to let either institution investigate itself.”';
        }
        if (stance === 'internal_reformer' || stance === 'pragmatic_reformer') {
            return '“Ilsa gets the criminal investigation. Petra keeps the factorhouse operating and preserves the Company records,” Seraphine says. “Petra’s usefulness is not absolution, and Ilsa’s warrants are not a licence to turn every clerk into a conspirator. I need the guilty exposed without making the innocent pay simply because they share a payroll.”';
        }
        if (stance === 'company_defensive') {
            return 'Seraphine’s expression cools. “Petra is closing ranks. That makes her less useful as an internal reformer and more important as the custodian of records I do not want disappearing.” She taps the desk. “Ilsa gets independent access. Ironbond does not investigate Ironbond.”';
        }
        return '“Ironbond is too useful to treat as a single villain and too powerful to treat as an ordinary merchant,” Seraphine says. “Ilsa follows crimes. Petra keeps the ordinary machinery from collapsing. I keep both of them from deciding their own institution is the only one entitled to define the problem.”';
    }

    function petraIlsaText() {
        const exposed = !!root.ironbondArc?.crownInfiltrationRevealed;
        const reyna = quest('reyna_empty_blind');
        if (exposed) {
            return 'Petra nods toward the street. “Rennick wants chain of custody, named allegations and records she can put in front of a magistrate. Good. So do I.” Her mouth twists. “For different reasons, perhaps. But an investigation that cannot distinguish evidence from embarrassment is useless to both of us.”';
        }
        if (reyna?.status === 'completed' && reyna.resolution === 'witness_deal') {
            return '“Rennick’s deal with those trackers was sensible,” Petra says. “Protection did not make them innocent. It made them available to tell the truth.” She raises an eyebrow. “Institutions survive longer when they learn that witness, employee and culprit are not synonyms.”';
        }
        if (reyna?.status === 'completed' && (reyna.resolution === 'double_agent' || reyna.resolution === 'let_disappear')) {
            return 'Petra exhales. “Off-books arrangements feel efficient because they spare everyone the paperwork of accountability.” She glances toward the Company archive. “That is also how plausible deniability acquires a filing system. I understand why Rennick dislikes it.”';
        }
        const aldric = quest('aldric_broken_vigil');
        if (aldric?.status === 'completed') {
            return '“Rennick and I agree on one unfashionable point,” Petra says. “Responsibility should travel upward as readily as punishment travels down. The west-road guards were easier to blame than the person who signed the recall. Easy is not the same thing as accurate.”';
        }
        return '“Rennick is inconvenient in exactly the way a competent Watch captain should be,” Petra says. “She wants a name attached to every accusation and a record attached to every name.”';
    }

    function ilsaPetraText() {
        const exposed = !!root.ironbondArc?.crownInfiltrationRevealed;
        const stance = petraStance();
        if (exposed && (stance === 'internal_reformer' || stance === 'pragmatic_reformer')) {
            return 'Ilsa folds her arms. “Petra preserving records is useful. Petra knowing which records matter is even more useful. Neither fact makes her clean by association.” She shrugs. “Witnesses can be compromised. Sources can have interests. You account for that; you do not throw away what they know.”';
        }
        if (exposed && stance === 'company_defensive') {
            return '“If Petra closes ranks, I treat the factorhouse like a contested scene,” Ilsa says. “That means independent copies, outside witnesses and no asking the Company to certify its own innocence. I would prefer her cooperation. Preference is not a control measure.”';
        }
        const wren = quest('wren_price_of_silence');
        if (wren?.status === 'completed' && wren.resolution === 'protect_petra') {
            return '“Protecting Petra while she gave evidence was sensible,” Ilsa says. “Protected witness does not mean innocent witness. It means you decided keeping her alive and talking mattered more than pretending every person inside Ironbond had the same role.”';
        }
        const aldric = quest('aldric_broken_vigil');
        if (aldric?.status === 'completed' && (aldric.resolution === 'public_accountability' || aldric.resolution === 'spare_patrol')) {
            return 'Ilsa gives a short nod. “Petra kept the recall order instead of losing it into Company memory. That matters. An institution cannot correct a decision it has conveniently stopped recording.”';
        }
        return '“Petra is useful because she understands the Company from inside,” Ilsa says. “That is a reason to listen carefully, not a reason to stop verifying.”';
    }

    function networkAudit() {
        return {
            alreadyIntegrated: [
                'aelwen-seraphine-nessa',
                'balrik-thrain',
                'thessaly-mirabel',
                'adelram-alden',
                'ilsa-reyna',
            ],
            silverhartCourtActive: hasNecromancyNetworkContext(),
            reddaleInstitutionActive: hasReddaleInstitutionContext(),
            crownIronbondActive: !!root.ironbondArc?.crownInfiltrationRevealed,
        };
    }

    function showResponse(npc, characterName, key, text, delta = { familiarity: 2, friendship: 2 }) {
        note(characterName, key, delta);
        withSuppressedDecoration(() => root.showDialogue?.(npc, text, [{ label: 'Understood.', action: () => {} }]));
    }

    function decorateSeraphine(npc, options) {
        if (!Array.isArray(options) || suppressDecoration) return options;
        const decorated = options.map(option => ({ ...option }));
        const labels = new Set(decorated.map(option => option?.label));
        if (hasNecromancyNetworkContext() && !labels.has('How are Thessaly and Adelram handling the supernatural threats?')) {
            decorated.push({
                label: 'How are Thessaly and Adelram handling the supernatural threats?',
                action: () => showResponse(npc, SERAPHINE, 'cross:court:thessaly_adelram', seraphineCourtText(), { familiarity: 2, trust: 1, friendship: 2 }),
            });
        }
        if (hasReddaleInstitutionContext() && !labels.has('How are you handling Petra, Ilsa and Ironbond?')) {
            decorated.push({
                label: 'How are you handling Petra, Ilsa and Ironbond?',
                action: () => showResponse(npc, SERAPHINE, `cross:ironbond:${petraStance()}`, seraphineIronbondText(), { familiarity: 2, trust: 1, friendship: 2 }),
            });
        }
        return decorated;
    }

    function decorateThessaly(npc, options) {
        if (!Array.isArray(options) || suppressDecoration || !hasNecromancyNetworkContext()) return options;
        const decorated = options.map(option => ({ ...option }));
        if (!decorated.some(option => option?.label === 'What do you make of Adelram’s view of all this?')) {
            decorated.push({
                label: 'What do you make of Adelram’s view of all this?',
                action: () => showResponse(npc, THESSALY, 'cross:court:adelram', thessalyAdelramText(), { familiarity: 2, friendship: 2 }),
            });
        }
        return decorated;
    }

    function decorateAdelram(npc, options) {
        if (!Array.isArray(options) || suppressDecoration || !hasNecromancyNetworkContext()) return options;
        const decorated = options.map(option => ({ ...option }));
        if (!decorated.some(option => option?.label === 'What do you make of Thessaly’s approach?')) {
            decorated.push({
                label: 'What do you make of Thessaly’s approach?',
                action: () => showResponse(npc, ADEL, 'cross:court:thessaly', adelramThessalyText(), { familiarity: 2, friendship: 2 }),
            });
        }
        return decorated;
    }

    function decoratePetra(npc, options) {
        if (!Array.isArray(options) || suppressDecoration || !hasReddaleInstitutionContext()) return options;
        const decorated = options.map(option => ({ ...option }));
        if (!decorated.some(option => option?.label === 'What do you make of Captain Rennick’s approach?')) {
            decorated.push({
                label: 'What do you make of Captain Rennick’s approach?',
                action: () => showResponse(npc, PETRA, 'cross:reddale:ilsa', petraIlsaText(), { familiarity: 2, friendship: 2 }),
            });
        }
        return decorated;
    }

    function decorateIlsa(npc, options) {
        if (!Array.isArray(options) || suppressDecoration || !hasReddaleInstitutionContext()) return options;
        const decorated = options.map(option => ({ ...option }));
        if (!decorated.some(option => option?.label === 'What do you make of Petra Voss?')) {
            decorated.push({
                label: 'What do you make of Petra Voss?',
                action: () => showResponse(npc, ILSA, 'cross:reddale:petra', ilsaPetraText(), { familiarity: 2, friendship: 2 }),
            });
        }
        return decorated;
    }

    function wrapDialogueTree(dialogueId, characterName, decorator, flag) {
        const trees = root.npcDialogueTrees;
        const base = trees?.[dialogueId];
        if (typeof base !== 'function' || base[flag]) return false;
        const wrapped = function(npc) {
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let first = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && first && speaker?.name === characterName) {
                    first = false;
                    const args = [...arguments];
                    args[2] = decorator(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try { return base.apply(this, arguments); }
            finally { root.showDialogue = originalShowDialogue; }
        };
        wrapped[flag] = true;
        wrapped.__basePersistentCrossDialogue = base;
        trees[dialogueId] = wrapped;
        return true;
    }

    function install() {
        if (!root.npcDialogueTrees) return false;
        wrapDialogueTree('silverhart_queen', SERAPHINE, decorateSeraphine, '__persistentCrossSeraphineAware');
        wrapDialogueTree('royal_wizard', THESSALY, decorateThessaly, '__persistentCrossThessalyAware');
        wrapDialogueTree('high_cleric', ADEL, decorateAdelram, '__persistentCrossAdelramAware');
        wrapDialogueTree('reddale_guildmaster', PETRA, decoratePetra, '__persistentCrossPetraAware');
        wrapDialogueTree('reddale_captain', ILSA, decorateIlsa, '__persistentCrossIlsaAware');
        return true;
    }

    const api = {
        build: BUILD,
        hasNecromancyNetworkContext,
        hasReddaleInstitutionContext,
        networkAudit,
        seraphineCourtText,
        thessalyAdelramText,
        adelramThessalyText,
        seraphineIronbondText,
        petraIlsaText,
        ilsaPetraText,
        decorateSeraphine,
        decorateThessaly,
        decorateAdelram,
        decoratePetra,
        decorateIlsa,
        install,
    };

    root.persistentCharacterCrossReactivity = api;
    root.PERSISTENT_CHARACTER_CROSS_REACTIVITY_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
