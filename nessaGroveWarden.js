// nessaGroveWarden.js
// Elder Nessa Wren's first persistent-character pass.
//
// Nessa already has enough story around her to support character depth without
// inventing another quest. The Silver Trail establishes her respect for the
// unicorn's agency; Fenn's Living Boundary tests whether stewardship means
// preservation, intervention or accepting a cost honestly; and Aelwen's Living
// Accord asks how ecological change differs from a political border being
// quietly redefined. This module lets Nessa remember those choices and makes
// her own philosophy visible without turning her into a generic nature oracle.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-nessa-grove-warden-v1';
    const NESSA = 'Elder Nessa Wren';
    const FENN = 'Fenn Oakheart';
    const DIALOGUE_ID = 'elder_nessa_wren';
    let suppressDecoration = 0;

    const party = () => Array.isArray(root.party) ? root.party : [];
    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const fenn = () => party().find((member, index) => index > 0 && member?.name === FENN) || null;
    const relationship = () => root.getPersistentCharacterRelationship?.(NESSA) || null;

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(NESSA, key, delta);
    }

    function note(key, delta) {
        return root.notePersistentCharacterConversation?.(NESSA, key, delta);
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function livingBoundaryDelta(resolution) {
        if (resolution === 'managed_spillway') return { familiarity: 3, trust: 7, friendship: 4 };
        if (resolution === 'compensate_preserve') return { familiarity: 3, trust: 5, friendship: 3 };
        if (resolution === 'preserve_marsh') return { familiarity: 2, trust: 3, friendship: 2 };
        if (resolution === 'drain_marsh') return { familiarity: 2, trust: -4, friendship: -1 };
        return {};
    }

    function livingAccordDelta(resolution) {
        if (resolution === 'joint_stewardship') return { familiarity: 3, trust: 6, friendship: 4 };
        if (resolution === 'marked_buffer') return { familiarity: 2, trust: 4, friendship: 2 };
        if (resolution === 'press_silverhart') return { familiarity: 2, trust: -3, friendship: -1 };
        return {};
    }

    function syncStoryEvents() {
        const boundary = quest('fenn_living_boundary');
        if (boundary?.status === 'completed' && boundary.resolution) {
            record(`nessa:living_boundary:${boundary.resolution}`, livingBoundaryDelta(boundary.resolution));
        }

        const accord = quest('aelwen_living_accord');
        if (accord?.status === 'completed' && accord.resolution) {
            record(`nessa:living_accord:${accord.resolution}`, livingAccordDelta(accord.resolution));
        }

        const trail = quest('unicorn_tracking');
        if (trail?.status === 'completed') {
            record('nessa:silver_trail:earned_unicorn_trust', { familiarity: 3, trust: 5, friendship: 3 });
        }
        return relationship();
    }

    function livingBoundaryText() {
        const q = quest('fenn_living_boundary');
        if (!q || q.status !== 'completed') {
            return 'Nessa looks toward the low ground beyond the grove. “The marsh is young enough that everyone is still tempted to call their preferred future the natural one. Give it time. Most arguments become more honest once people admit they are choosing.”';
        }
        if (q.resolution === 'managed_spillway') {
            return 'Nessa nods toward the maintained channel. “That is stewardship as I understand it. Not pristine. Not conquered. A promise that somebody must keep making: enough water for the marsh, enough dry ground for the farm, and no pretending the balance maintains itself.”';
        }
        if (q.resolution === 'compensate_preserve') {
            return '“You kept the marsh and took some of the cost onto yourself,” Nessa says. “Good. Too many people call preservation virtuous only because somebody else is paying for it. Mac still lost a piece of the meadow. At least you did not ask him to carry that loss alone.”';
        }
        if (q.resolution === 'preserve_marsh') {
            return 'Nessa is pleased, but not triumphant. “The marsh deserved the chance to become what it was becoming. Mac’s winter does not become imaginary because I agree with the choice, though. If we preserve a place, we inherit responsibility for the people our preservation presses against.”';
        }
        if (q.resolution === 'drain_marsh') {
            return 'Nessa’s mouth tightens. “I would not have drained it.” After a moment she adds, “But you heard what would be lost before you chose. Fenn heard it too, and then had to own a judgement I disliked. That matters. A druid who only makes choices his elder approves of has learned obedience, not stewardship.”';
        }
        return '“The water changed,” Nessa says. “Then people changed it again. What matters now is whether anyone remembers that both steps had consequences.”';
    }

    function livingAccordText() {
        const q = quest('aelwen_living_accord');
        if (!q || q.status !== 'completed') {
            return '“A forest edge and a border stone are not the same thing,” Nessa says. “Water, roots and animals move without asking permission. Courts do not get to use that as an excuse to move a promise the same way.”';
        }
        if (q.resolution === 'joint_stewardship') {
            return 'Nessa smiles faintly. “A flexible border can work when the flexibility itself is part of the promise. Both sides mark the trees, both sides remember why. That is very different from one side crossing the stones until habit becomes ownership.”';
        }
        if (q.resolution === 'marked_buffer') {
            return '“Not every living system needs an elegant agreement,” Nessa says. “Sometimes a clear line protects the relationship better than a clever one. If both courts maintain the markers, the forest can be complicated inside a boundary the foresters cannot pretend to misunderstand.”';
        }
        if (q.resolution === 'press_silverhart') {
            return 'Nessa studies you for a moment. “Need explains trespass. It does not transform trespass into consent. Aelwen was right to refuse a bargain in which Silverhart’s timber shortage quietly became authority over her forest.”';
        }
        return '“Whatever the courts wrote down, the useful part is whether both sides still recognise the same promise next year.”';
    }

    function silverTrailText() {
        const trail = quest('unicorn_tracking');
        if (trail?.status === 'completed') {
            return '“You found her, and she chose what happened next,” Nessa says. “That is the part I cared about. I could point you toward tracks. I could not give you another creature’s trust as though it were one of the grove’s possessions.”';
        }
        if (trail?.status === 'active') {
            return '“Read the ground and follow if you wish,” Nessa says. “Do not mistake finding her for earning anything from her. A trail tells you where a creature went. It does not tell you what she owes the person clever enough to follow it.”';
        }
        return '“Wild things are not rewards for passing a druid’s test,” Nessa says. “At best we can teach you how to approach without making yourself the centre of the encounter.”';
    }

    function philosophyText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return 'Nessa’s expression is calm and closed. “The Old Faith is not a confession booth for travellers who want the forest to tell them they are good people. Tend what is in front of you. The philosophy can wait.”';
        }
        if (rel.friendship < 15) {
            return '“People hear ‘Old Faith’ and imagine worship of untouched wilderness,” Nessa says. “That would be easier. We prune, burn, divert water, heal animals, bury the dead and sometimes kill what is spreading harm. The rule is not ‘never intervene’. The rule is that intervention makes you responsible for what follows.”';
        }
        return 'Nessa is quiet for a while. “Elders have our own vanity. We can call fear ‘patience’ and habit ‘tradition’ until nobody younger is permitted to disagree without being accused of disrespecting the land.” She glances toward Fenn if he is nearby. “I would rather he become a druid who can tell me I am wrong and explain the cost than one who preserves my judgement after I am dead.”';
    }

    function fennText() {
        const companion = fenn();
        if (!companion) return null;
        const state = root.fennLivingBoundary?.getArcState?.() || null;
        if (!state) {
            return 'Nessa watches Fenn for a moment. “He is listening differently. Less like someone waiting for the grove to give him the correct answer.”';
        }
        if (state.voice === 'grove_bound') {
            return '“He still asks himself what I would decide before he asks what he believes,” Nessa says. “That is understandable. It is also something he will have to outgrow if he means to be useful beyond this grove.”';
        }
        if (state.voice === 'self_directed') {
            return 'Nessa’s smile is small and unmistakably proud. “He has started bringing me conclusions instead of requests for permission. Some of them annoy me. Good. I did not teach him for all these years so he could become a younger copy of me.”';
        }
        return '“He is finding his own judgement,” Nessa says. “The difficult part is learning that independence does not mean reflexively doing the opposite of your teacher. It means the answer is yours to defend when the cost arrives.”';
    }

    function showResponse(npc, key, text, delta = { familiarity: 2, friendship: 2 }) {
        note(key, delta);
        withSuppressedDecoration(() => root.showDialogue?.(npc, text, [{ label: 'I understand.', action: () => {} }]));
    }

    function decorateTopLevel(npc, options) {
        if (!Array.isArray(options) || suppressDecoration) return options;
        syncStoryEvents();
        const decorated = options.map(option => ({ ...option }));
        const labels = new Set(decorated.map(option => option?.label));
        const boundary = quest('fenn_living_boundary');
        const accord = quest('aelwen_living_accord');
        const trail = quest('unicorn_tracking');
        const rel = relationship();

        if (boundary?.status === 'completed' && !labels.has('What do you make of what happened with the marsh?')) {
            decorated.push({
                label: 'What do you make of what happened with the marsh?',
                action: () => showResponse(npc, `nessa:reflection:living_boundary:${boundary.resolution}`, livingBoundaryText(), { familiarity: 2, friendship: 3 }),
            });
        }
        if (accord?.status === 'completed' && !labels.has('What do you think of the new forest accord?')) {
            decorated.push({
                label: 'What do you think of the new forest accord?',
                action: () => showResponse(npc, `nessa:reflection:living_accord:${accord.resolution}`, livingAccordText(), { familiarity: 2, friendship: 2 }),
            });
        }
        if (trail && !labels.has('You were very careful not to promise me the unicorn.')) {
            decorated.push({
                label: 'You were very careful not to promise me the unicorn.',
                action: () => showResponse(npc, `nessa:reflection:silver_trail:${trail.status}`, silverTrailText(), { familiarity: 2, trust: 1, friendship: 2 }),
            });
        }
        if ((rel?.familiarity ?? 0) >= 8 && !labels.has('What does the Old Faith actually ask of you?')) {
            decorated.push({
                label: 'What does the Old Faith actually ask of you?',
                action: () => showResponse(npc, 'nessa:philosophy:stewardship', philosophyText(), { familiarity: 3, trust: 1, friendship: 4 }),
            });
        }
        if (fenn() && boundary?.status === 'completed' && !labels.has('How do you think Fenn is changing?')) {
            decorated.push({
                label: 'How do you think Fenn is changing?',
                action: () => {
                    const text = fennText();
                    if (text) showResponse(npc, 'nessa:fenn:growing_independence', text, { familiarity: 2, friendship: 3 });
                },
            });
        }
        return decorated;
    }

    function install() {
        const trees = root.npcDialogueTrees;
        const base = trees?.[DIALOGUE_ID];
        if (typeof base !== 'function' || base.__nessaGroveWardenAware) return false;
        const wrapped = function(npc) {
            syncStoryEvents();
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let firstNessaDialogue = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && firstNessaDialogue && speaker?.name === NESSA) {
                    firstNessaDialogue = false;
                    const args = [...arguments];
                    args[2] = decorateTopLevel(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try { return base.apply(this, arguments); }
            finally { root.showDialogue = originalShowDialogue; }
        };
        wrapped.__nessaGroveWardenAware = true;
        wrapped.__baseNessaGroveWardenDialogue = base;
        trees[DIALOGUE_ID] = wrapped;
        return true;
    }

    const api = {
        build: BUILD,
        syncStoryEvents,
        livingBoundaryDelta,
        livingAccordDelta,
        livingBoundaryText,
        livingAccordText,
        silverTrailText,
        philosophyText,
        fennText,
        decorateTopLevel,
        install,
    };

    root.nessaGroveWarden = api;
    root.NESSA_GROVE_WARDEN_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
