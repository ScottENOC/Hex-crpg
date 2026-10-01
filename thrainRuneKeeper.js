// thrainRuneKeeper.js
// Thrain Emberhand's persistent-character pass.
//
// No new quest is needed. Thrain already has a personal arc in the runesmithing
// chain and an independent policy voice in Balrik's Last Hold. The through-line
// is tradition as custody rather than ownership: dwarven inheritance matters,
// but birthright carries obligations, outsiders can earn trust, and preserving a
// craft is not the same thing as freezing it in place.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-thrain-rune-keeper-v1';
    const THRAIN = 'Thrain Emberhand';
    const DIALOGUE_ID = 'deepholds_runesmith';
    let suppressDecoration = 0;

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const player = () => (Array.isArray(root.party) && root.party[0]) || root.player || null;
    const relationship = () => root.getPersistentCharacterRelationship?.(THRAIN) || null;

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(THRAIN, key, delta);
    }

    function note(key, delta) {
        return root.notePersistentCharacterConversation?.(THRAIN, key, delta);
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function lastHoldDelta(resolution) {
        // Balrik's quest already records these same relationship consequences.
        // This helper is exported for authoring/tests only; syncStoryEvents does
        // not duplicate them. Stable event ownership stays in balrikLastHold.js.
        if (resolution === 'bounded_reclamation') return { trust: 8, friendship: 5 };
        if (resolution === 'survey_only') return { trust: 6, friendship: 4 };
        if (resolution === 'seal_below') return { trust: 3, friendship: 2 };
        return {};
    }

    function syncStoryEvents() {
        const trustQuest = quest('kragmoor_runesmith_trust');
        if (trustQuest?.status === 'completed') {
            record('thrain:forge_trusts_stranger:completed', { familiarity: 4, trust: 6, friendship: 3 });
        }

        const teachQuest = quest('kragmoor_runesmith_teach');
        if (teachQuest?.status === 'completed' || Number(player()?.skills?.runesmithing || 0) > 0) {
            const inherited = player()?.race === 'dwarf';
            record(
                inherited ? 'thrain:forge_remembers_own:taught_dwarf' : 'thrain:forge_remembers_own:taught_outsider',
                inherited
                    ? { familiarity: 4, trust: 6, friendship: 4 }
                    : { familiarity: 5, trust: 9, friendship: 5 }
            );
        }
        return relationship();
    }

    function trustQuestText() {
        const q = quest('kragmoor_runesmith_trust');
        if (q?.status === 'completed') {
            return 'Thrain turns a starmetal shaving between two blackened fingers. “The shard was never the point. Plenty of fools can find rare metal. You brought it back without boasting, cheating me, or getting yourself killed for the story.” He snorts. “That told me more than the ore did.”';
        }
        if (q?.status === 'active') {
            return '“Starmetal is difficult enough to find that it filters out most liars,” Thrain says. “The rest it filters by patience. I am not asking whether you are lucky enough to touch rare metal. I am asking whether you can be trusted to bring something valuable to a forge without deciding that makes you a master.”';
        }
        return '“Trust in a forge is practical,” Thrain says. “You stand beside heat, expensive metal and work that can kill someone years after you finish it. I do not need to like you before I work beside you. I need to believe you understand consequences.”';
    }

    function teachingText() {
        const q = quest('kragmoor_runesmith_teach');
        const learned = q?.status === 'completed' || Number(player()?.skills?.runesmithing || 0) > 0;
        const isDwarf = player()?.race === 'dwarf';

        if (!learned && isDwarf) {
            return 'Thrain folds his arms. “A dwarf should not have to petition a surface guild for the bones of a craft our halls kept alive. That is what I mean by birthright.” His eyes narrow. “Do not confuse birthright with competence. The forge will correct that misunderstanding faster than I can.”';
        }
        if (!learned) {
            return '“Runesmithing is dwarven craft,” Thrain says. “That is history, not an insult.” He pauses. “History is also full of things becoming coffins because the people guarding them decided nobody outside the family could ever be worthy. Earn my trust first. Then we can argue about where the boundary belongs.”';
        }
        if (isDwarf) {
            return '“Being dwarf-born opened the door sooner,” Thrain says. “Good. A people ought to be able to hand its own craft to its own children without making them prove they deserve their grandparents.” He points at the forge. “After the door, though, the work judges you. Blood does not straighten a bad rune.”';
        }
        return 'Thrain studies you across the forge. “I did not teach you because I decided runesmithing had stopped being dwarven. I taught you because you learned how to carry a dwarven craft without treating it like loot.” He taps the anvil. “Tradition survives by choosing its heirs carefully. Blood is one way. Conduct is another.”';
    }

    function lastHoldText() {
        const q = quest('balrik_last_hold');
        if (!q || q.status !== 'completed') {
            return '“The old warning matters,” Thrain says. “So does the fact somebody carved it instead of collapsing the whole stair behind them. Warnings are meant for descendants who may know more than you did. Otherwise you write a tombstone.”';
        }
        if (q.resolution === 'bounded_reclamation') {
            return 'Thrain nods toward the lower galleries. “That is the policy I would have chosen. Measure first. Work the safe seam this side of the ward. Stop where we said we would stop.” His expression hardens. “The test is not whether the first cart comes back full. It is whether the twentieth crew still respects a limit written before any of them saw what lies beyond it.”';
        }
        if (q.resolution === 'survey_only') {
            return '“Survey without extraction was sensible,” Thrain says. “Knowledge does not become greed merely because miners gathered it.” He smiles faintly. “And if the survey says leave the place shut, we will have a better reason than fear inherited without context.”';
        }
        if (q.resolution === 'seal_below') {
            return 'Thrain shrugs. “I would have surveyed it. Balrik chose survival over another gamble, and a king of the last Deephold has earned the right to be difficult to impress with promises of recovery.” He looks toward the sealed stair. “Just do not teach the children that closing one dangerous door means doors are bad.”';
        }
        return '“Whatever policy we chose, the warning still belongs beside it,” Thrain says. “A rule without its reason becomes superstition in a generation.”';
    }

    function philosophyText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return 'Thrain gives you a flat look. “Everyone wants the old secrets before they have learned the new basics. Make something that does not break first. Philosophy after.”';
        }
        if (rel.friendship < 15) {
            return '“Tradition is a chain of custody,” Thrain says. “Someone taught me what not to cut, what not to heat, which rune a clever apprentice always thinks can be shortened. I pass that on because dead smiths cannot correct the next clever apprentice themselves.”';
        }
        return 'Thrain rests both hands on the anvil. “Dwarves can be idiots about tradition. We call something sacred when sometimes we mean nobody living wants responsibility for changing it.” He grunts. “But outsiders can be idiots too. They see a closed door and assume the moral achievement is opening it. The hard part is knowing which door protects a people and which one merely protects an old habit.”';
    }

    function inheritanceText() {
        const isDwarf = player()?.race === 'dwarf';
        if (isDwarf) {
            return '“There is value in knowing a craft belongs to your people,” Thrain says. “Not because the mountain stamped our names on iron at creation. Because generations of dwarves kept the knowledge alive through halls that fell, migrations, bad kings and worse winters.” He gestures toward you. “Inheritance means you receive that labour before you have earned it. Your job is to become worthy of what you were given.”';
        }
        return '“When I say the craft is ours, I am not claiming the universe forbids your hands from learning it,” Thrain says. “I mean dwarves paid the cost of keeping it alive. If you learn it, respect that history. Add to the craft if you can. Do not scrape the maker’s mark off and announce you invented the anvil.”';
    }

    function showResponse(npc, key, text, delta = { familiarity: 2, friendship: 2 }) {
        note(key, delta);
        withSuppressedDecoration(() => root.showDialogue?.(npc, text, [{ label: 'Fair enough.', action: () => {} }]));
    }

    function decorateTopLevel(npc, options) {
        if (!Array.isArray(options) || suppressDecoration) return options;
        syncStoryEvents();
        const decorated = options.map(option => ({ ...option }));
        const labels = new Set(decorated.map(option => option?.label));
        const trustQuest = quest('kragmoor_runesmith_trust');
        const teachQuest = quest('kragmoor_runesmith_teach');
        const lastHold = quest('balrik_last_hold');
        const rel = relationship();

        if (trustQuest && !labels.has('Was the starmetal really a test of ore?')) {
            decorated.push({
                label: 'Was the starmetal really a test of ore?',
                action: () => showResponse(npc, `thrain:reflection:trust_quest:${trustQuest.status}`, trustQuestText(), { familiarity: 2, trust: 1, friendship: 2 }),
            });
        }
        if ((teachQuest || Number(player()?.skills?.runesmithing || 0) > 0) && !labels.has('What does it mean for a craft to be a birthright?')) {
            decorated.push({
                label: 'What does it mean for a craft to be a birthright?',
                action: () => showResponse(npc, `thrain:reflection:teaching:${player()?.race === 'dwarf' ? 'dwarf' : 'outsider'}`, teachingText(), { familiarity: 3, friendship: 3 }),
            });
        }
        if (lastHold?.status === 'completed' && !labels.has('What do you think of Balrik’s decision below the hold?')) {
            decorated.push({
                label: 'What do you think of Balrik’s decision below the hold?',
                action: () => showResponse(npc, `thrain:reflection:last_hold:${lastHold.resolution}`, lastHoldText(), { familiarity: 2, friendship: 3 }),
            });
        }
        if ((rel?.familiarity ?? 0) >= 8 && !labels.has('What is tradition actually for?')) {
            decorated.push({
                label: 'What is tradition actually for?',
                action: () => showResponse(npc, 'thrain:philosophy:tradition', philosophyText(), { familiarity: 3, trust: 1, friendship: 4 }),
            });
        }
        if ((rel?.friendship ?? 0) >= 12 && !labels.has('Do you really think runesmithing belongs to dwarves?')) {
            decorated.push({
                label: 'Do you really think runesmithing belongs to dwarves?',
                action: () => showResponse(npc, `thrain:philosophy:inheritance:${player()?.race === 'dwarf' ? 'dwarf' : 'outsider'}`, inheritanceText(), { familiarity: 2, friendship: 3 }),
            });
        }
        return decorated;
    }

    function install() {
        const trees = root.npcDialogueTrees;
        const base = trees?.[DIALOGUE_ID];
        if (typeof base !== 'function' || base.__thrainRuneKeeperAware) return false;
        const wrapped = function(npc) {
            syncStoryEvents();
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let first = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && first && speaker?.name === THRAIN) {
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
        wrapped.__thrainRuneKeeperAware = true;
        wrapped.__baseThrainRuneKeeperDialogue = base;
        trees[DIALOGUE_ID] = wrapped;
        return true;
    }

    const api = {
        build: BUILD,
        syncStoryEvents,
        lastHoldDelta,
        trustQuestText,
        teachingText,
        lastHoldText,
        philosophyText,
        inheritanceText,
        decorateTopLevel,
        install,
    };

    root.thrainRuneKeeper = api;
    root.THRAIN_RUNE_KEEPER_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
