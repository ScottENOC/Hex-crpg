// adelramCathedralShepherd.js
// High Cleric Adelram's first persistent-character pass.
//
// Adelram already sits at three important pressure points in Campaign 2: he
// recognises the Crimson Court evidence, opens the Cathedral's burial records
// during Alden's Uncounted investigation, and belongs naturally in the
// necromancer/lich storyline. His theme is faith under uncertainty: ritual and
// doctrine matter, but they cannot become excuses to stop asking what happened
// to particular people.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-adelram-cathedral-shepherd-v1';
    const ADEL = 'High Cleric Adelram';
    const DIALOGUE_ID = 'high_cleric';
    let suppressDecoration = 0;

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const relationship = () => root.getPersistentCharacterRelationship?.(ADEL) || null;

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(ADEL, key, delta);
    }

    function note(key, delta) {
        return root.notePersistentCharacterConversation?.(ADEL, key, delta);
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function uncountedDelta(resolution) {
        if (resolution === 'restore_names') return { familiarity: 4, trust: 7, friendship: 5 };
        if (resolution === 'quiet_memorial') return { familiarity: 3, trust: 6, friendship: 4 };
        if (resolution === 'hunt_missing') return { familiarity: 3, trust: 5, friendship: 2 };
        if (resolution === 'rites_over_names') return { familiarity: 2, trust: 2, friendship: 1 };
        return {};
    }

    function syncStoryEvents() {
        const crimson = quest('crimson_court');
        if (crimson?.status === 'completed' && root.vampireLeadConfirmed) {
            record('adelram:crimson_court:evidence_returned', { familiarity: 3, trust: 5, friendship: 2 });
        }

        const uncounted = quest('alden_uncounted');
        if (uncounted?.status === 'completed' && uncounted.resolution) {
            record(`adelram:uncounted:${uncounted.resolution}`, uncountedDelta(uncounted.resolution));
        }

        const hunt = quest('necromancer_hunt');
        if (hunt?.status === 'completed') {
            record('adelram:necromancer_hunt:crypt_resolved', { familiarity: 3, trust: 5, friendship: 2 });
        }

        if (root.phylacteryReturned) {
            record('adelram:phylactery:secured_by_crown', { familiarity: 2, trust: 6, friendship: 2 });
        }

        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            record('adelram:lichdom:allied_with_ashgrave', { familiarity: 4, trust: -30, friendship: -15 });
        } else if (lich?.status === 'completed') {
            record('adelram:lichdom:ashgrave_stopped', { familiarity: 3, trust: 9, friendship: 4 });
        }
        return relationship();
    }

    function crimsonText() {
        const q = quest('crimson_court');
        if (q?.status === 'completed' && root.vampireLeadConfirmed) {
            return 'Adelram folds his hands. “What mattered about that fang was not that an old book predicted it perfectly. It did not. What mattered was that the old description gave us one more question to ask of the evidence in front of us. Faith that refuses correction becomes superstition with better furniture.”';
        }
        return '“The old vampire texts are warnings, not maps,” Adelram says. “If we find evidence that contradicts them, we change our understanding. The gods are not honoured by pretending our scribes never made mistakes.”';
    }

    function uncountedText() {
        const q = quest('alden_uncounted');
        if (!q || q.status !== 'completed') {
            return 'Adelram looks toward the burial books. “A rite can commend the dead to the gods. It cannot tell a widow where her husband went, or explain why a body vanished between two entries in a ledger. Those are earthly questions, and therefore still ours.”';
        }
        if (q.resolution === 'restore_names') {
            return '“Restoring the names was right,” Adelram says. “Not because the gods would otherwise fail to recognise them. Because institutions do. A person who becomes ‘unknown auxiliary, sixth body’ is much easier for the living to lose twice.”';
        }
        if (q.resolution === 'quiet_memorial') {
            return '“A quiet memorial is still memory,” Adelram says. “Not every correction requires a public quarrel. What mattered was that the Cathedral stopped pretending one collective line was the same thing as six lives.”';
        }
        if (q.resolution === 'hunt_missing') {
            return 'Adelram nods. “The missing body was the urgent danger. I agreed. But urgency is a poor excuse for permanent forgetting. When the danger passes, the other five still deserve a record better than ‘unclaimed’.”';
        }
        if (q.resolution === 'rites_over_names') {
            return 'Adelram is thoughtful. “The rites mattered. I would never say otherwise. But Alden’s discomfort was justified. Saying the soul matters more than the name can be true and still become a very convenient sentence for the clerk who lost the name.”';
        }
        return '“The Cathedral corrected what it could,” Adelram says. “The uncomfortable part is admitting how easy it was not to notice until Alden asked.”';
    }

    function necromancyText() {
        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            return 'Adelram’s voice is controlled. “You chose to learn from Ashgrave rather than end him. Do not ask me to call that curiosity. Power over death is precisely where every comforting distinction becomes dangerous: study becomes use, use becomes need, and need starts rewriting what you thought you would never do.”';
        }
        if (lich?.status === 'completed') {
            return '“Ashgrave forced a useful distinction on us,” Adelram says. “Death is not the enemy simply because we fear it. The horror was turning other lives into material for one person’s refusal to accept his own ending.”';
        }
        if (root.phylacteryReturned) {
            return '“Sealing the phylactery was prudent,” Adelram says. “Destroying a thing is not automatically wiser than understanding how to keep it from being used. But custody creates a duty. If the Cathedral or Crown ever starts calling possession the same thing as safety, remind us of this conversation.”';
        }
        if (quest('necromancer_hunt')) {
            return '“Necromancy tempts people because it offers certainty where grief does not,” Adelram says. “One more conversation. One more day. One more chance to refuse an ending. That does not make every person who studies death a monster. It does mean they need people around them who will say when study has become appetite.”';
        }
        return '“The dead deserve rites. The living deserve truth. Confusing those duties helps neither.”';
    }

    function philosophyText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return 'Adelram inclines his head. “The Cathedral can offer doctrine to strangers. Doubt is usually something people earn the right to hear.”';
        }
        if (rel.friendship < 15) {
            return '“Faith is not certainty,” Adelram says. “If I already knew what every loss meant, prayer would be bookkeeping. Faith is choosing obligations when explanation is incomplete: bury the dead, protect the living, tell the truth you can prove, and admit what you cannot.”';
        }
        return 'Adelram smiles without much amusement. “Clergy have a dangerous vocabulary for avoiding ordinary responsibility. Providence. Mystery. The soul beyond the body. All true ideas, used badly often enough.” He taps the burial register. “Sometimes a missing corpse is not a mystery. Sometimes somebody failed to count to six.”';
    }

    function aldenText() {
        const q = quest('alden_uncounted');
        if (!q || q.status !== 'completed') return null;
        if (q.resolution === 'restore_names' || q.resolution === 'quiet_memorial') {
            return '“Alden is learning that detachment need not mean abstraction,” Adelram says. “There is a difference between loving without possession and refusing to become attached enough to be hurt. Monks are as capable as priests of giving fear a respectable name.”';
        }
        if (q.resolution === 'hunt_missing') {
            return '“He chose the living danger first,” Adelram says. “That was defensible. The question for him is what happens after urgency passes. A contemplative life can become an endless series of reasons not to return to the people one postponed.”';
        }
        return '“Alden is asking a useful question,” Adelram says. “Whether universal compassion is still compassion if it never slows down long enough to learn a particular person’s name.”';
    }

    function showResponse(npc, key, text, delta = { familiarity: 2, friendship: 2 }) {
        note(key, delta);
        withSuppressedDecoration(() => root.showDialogue?.(npc, text, [{ label: 'Thank you.', action: () => {} }]));
    }

    function decorateTopLevel(npc, options) {
        if (!Array.isArray(options) || suppressDecoration) return options;
        syncStoryEvents();
        const decorated = options.map(option => ({ ...option }));
        const labels = new Set(decorated.map(option => option?.label));
        const uncounted = quest('alden_uncounted');
        const necro = quest('necromancer_hunt') || quest('necromancer_lichdom') || root.phylacteryReturned || root.playerIsLich;
        const rel = relationship();

        if ((quest('crimson_court') || root.vampireLeadConfirmed) && !labels.has('About the Crimson Court evidence…')) {
            decorated.push({ label: 'About the Crimson Court evidence…', action: () => showResponse(npc, 'adelram:reflection:crimson_court', crimsonText(), { familiarity: 2, trust: 1, friendship: 2 }) });
        }
        if (uncounted?.status === 'completed' && !labels.has('About the Northwatch dead…')) {
            decorated.push({ label: 'About the Northwatch dead…', action: () => showResponse(npc, `adelram:reflection:uncounted:${uncounted.resolution}`, uncountedText(), { familiarity: 2, friendship: 3 }) });
        }
        if (necro && !labels.has('What do you actually think about necromancy?')) {
            decorated.push({ label: 'What do you actually think about necromancy?', action: () => showResponse(npc, 'adelram:reflection:necromancy', necromancyText(), { familiarity: 2, friendship: 3 }) });
        }
        if ((rel?.familiarity ?? 0) >= 8 && !labels.has('Do you ever doubt your own doctrine?')) {
            decorated.push({ label: 'Do you ever doubt your own doctrine?', action: () => showResponse(npc, 'adelram:philosophy:faith_and_uncertainty', philosophyText(), { familiarity: 3, trust: 1, friendship: 4 }) });
        }
        if (uncounted?.status === 'completed' && !labels.has('What do you make of Alden?')) {
            decorated.push({ label: 'What do you make of Alden?', action: () => {
                const text = aldenText();
                if (text) showResponse(npc, 'adelram:alden:detachment', text, { familiarity: 2, friendship: 3 });
            }});
        }
        return decorated;
    }

    function install() {
        const trees = root.npcDialogueTrees;
        const base = trees?.[DIALOGUE_ID];
        if (typeof base !== 'function' || base.__adelramShepherdAware) return false;
        const wrapped = function(npc) {
            syncStoryEvents();
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let first = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && first && speaker?.name === ADEL) {
                    first = false;
                    const args = [...arguments];
                    args[2] = decorateTopLevel(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try { return base.apply(this, arguments); }
            finally { root.showDialogue = originalShowDialogue; }
        };
        wrapped.__adelramShepherdAware = true;
        wrapped.__baseAdelramDialogue = base;
        trees[DIALOGUE_ID] = wrapped;
        return true;
    }

    const api = { build: BUILD, syncStoryEvents, uncountedDelta, crimsonText, uncountedText, necromancyText, philosophyText, aldenText, decorateTopLevel, install };
    root.adelramCathedralShepherd = api;
    root.ADEL_RAM_CATHEDRAL_SHEPHERD_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
