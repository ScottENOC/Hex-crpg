// petraIronbondFactor.js
// Guildmaster Petra Voss's first persistent-character pass.
//
// Petra already occupies the most interesting Ironbond fault-line in Campaign 2.
// She can open old Company records for Aldric, admit that a predecessor let Harl
// Venn launder murder money through the factorhouse, and still argue that today's
// clerks and carters should not be destroyed for yesterday's management. That
// argument is partly humane and partly very convenient for the person currently
// sitting behind the Company desk. This module lets her remember the player's
// choices and admit that tension instead of flattening her into either a villain
// or a spotless internal reformer.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-petra-ironbond-factor-v1';
    const PETRA = 'Guildmaster Petra Voss';
    const DIALOGUE_ID = 'reddale_guildmaster';
    let suppressDecoration = 0;

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const relationship = () => root.getPersistentCharacterRelationship?.(PETRA) || null;

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(PETRA, key, delta);
    }

    function note(key, delta) {
        return root.notePersistentCharacterConversation?.(PETRA, key, delta);
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function priceOfSilenceDelta(resolution) {
        if (resolution === 'protect_petra') return { familiarity: 4, trust: 8, friendship: 5 };
        if (resolution === 'proof') return { familiarity: 3, trust: 5, friendship: 3 };
        if (resolution === 'vengeance') return { familiarity: 3, trust: -2, friendship: 0 };
        if (resolution === 'leverage') return { familiarity: 3, trust: -8, friendship: -4 };
        return {};
    }

    function brokenVigilDelta(resolution) {
        if (resolution === 'spare_patrol') return { familiarity: 3, trust: 5, friendship: 4 };
        if (resolution === 'public_accountability') return { familiarity: 3, trust: 3, friendship: 2 };
        if (resolution === 'private_closure') return { familiarity: 2, trust: 2, friendship: 2 };
        if (resolution === 'buried_for_money') return { familiarity: 3, trust: -5, friendship: -3 };
        return {};
    }

    function syncStoryEvents() {
        const wren = quest('wren_price_of_silence');
        if (wren?.status === 'completed' && wren.resolution) {
            record(`petra:price_of_silence:${wren.resolution}`, priceOfSilenceDelta(wren.resolution));
        }

        const aldric = quest('aldric_broken_vigil');
        if (aldric?.status === 'completed' && aldric.resolution) {
            record(`petra:broken_vigil:${aldric.resolution}`, brokenVigilDelta(aldric.resolution));
        }

        const pitch = quest('ironbond_pitch');
        if (pitch?.status === 'completed') {
            record('petra:ironbond_pitch:hollowmere_stocked', { familiarity: 2, trust: 2, friendship: 1 });
        }
        return relationship();
    }

    function priceOfSilenceText() {
        const q = quest('wren_price_of_silence');
        if (!q || q.status !== 'completed') {
            return 'Petra rests a hand on the old ledger chest. “There are records in this office I would prefer had never needed writing. That is not the same thing as preferring they disappear.”';
        }
        if (q.resolution === 'protect_petra') {
            return 'Petra studies you for a moment. “You distinguished witness from culprit. I noticed.” She looks back toward the clerks’ room. “Do not mistake that for absolving Ironbond. My predecessor let Company paper hide a murder payment. You simply decided the useful response was to keep the current office alive long enough to expose who actually authorised it.”';
        }
        if (q.resolution === 'proof') {
            return '“Evidence first was the right instinct,” Petra says. “Not because evidence is gentle. It usually is not. But if you mean to accuse a Company, a crown office or a dead factor, the record has to survive everyone’s desire for a cleaner story.”';
        }
        if (q.resolution === 'vengeance') {
            return 'Petra’s expression hardens. “Wanting the person who authorised that payment punished is not difficult to understand. Wanting blood before you know whose hand signed it is how institutions learn to feed you a convenient corpse and call the matter closed.”';
        }
        if (q.resolution === 'leverage') {
            return '“You used the murder trail against Ironbond before following it upward,” Petra says. “Perhaps the Company deserved the pressure. But leverage changes what evidence is for. The moment truth becomes a bargaining chip, everyone in the room starts asking what it can buy instead of what it proves.”';
        }
        return '“Venn’s payment passed through this office,” Petra says. “Whatever else happens, I am not going to pretend changing the name on the door changed that fact.”';
    }

    function brokenVigilText() {
        const q = quest('aldric_broken_vigil');
        if (!q || q.status !== 'completed') {
            return '“The west-road records are ugly,” Petra says. “Not because six guards ran. Because somebody with a better chair decided a cargo contract mattered more than the promise those guards had already made.”';
        }
        if (q.resolution === 'spare_patrol') {
            return 'Petra nods. “That was the distinction the record required. The patrol obeyed a recall; command broke the promise. A Company that cannot tell the difference between an employee and the decision made above them eventually punishes the easiest people to replace.”';
        }
        if (q.resolution === 'public_accountability') {
            return '“Putting the order on the public record made my month considerably worse,” Petra says dryly. “It was still defensible. If Ironbond wants contracts treated as promises when payment is due, it has to survive the same principle when one of its own signatures breaks them.”';
        }
        if (q.resolution === 'private_closure') {
            return '“Aldric chose not to make the order a public war,” Petra says. “That was his right. Private closure does not erase the Company record, though. I kept the dispatch. The next factor does not get to inherit ignorance just because the injured man decided to move on.”';
        }
        if (q.resolution === 'buried_for_money') {
            return 'Petra’s face goes still. “If someone paid to bury the order, then we repeated the oldest Company sin in the book: turning responsibility into a price.” She taps the desk once. “Do not assume Ironbond benefiting from silence means I think buying it was sound.”';
        }
        return '“The important part was separating the people on the road from the person who moved them,” Petra says. “Institutions become very good at letting consequences fall downward.”';
    }

    function crownInfiltrationText() {
        const revealed = !!root.ironbondArc?.crownInfiltrationRevealed;
        if (!revealed) {
            return 'Petra’s smile is thin. “Every large organisation has people who say the rot is somewhere else. I prefer ledgers. They are less comforting.”';
        }
        return 'Petra folds her arms. “Yes. There are people inside Ironbond who have treated influence as ownership and contracts as camouflage.” She glances toward the factorhouse floor. “That does not make every clerk, guard and carter part of the scheme. Reform that cannot distinguish the institution from every person trapped inside it is just demolition with better vocabulary.”';
    }

    function philosophyText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return 'Petra gives you a level look. “Ironbond pays me to run a factorhouse, not to provide visiting adventurers with a moral autobiography. Judge the contracts in front of you.”';
        }
        if (rel.friendship < 15) {
            return '“A Company is useful precisely because it outlives the people in it,” Petra says. “That is also what makes it dangerous. Debts survive. Assets survive. Somehow wrongdoing is forever becoming ‘old management’ the moment responsibility would be inconvenient.”';
        }
        return 'Petra looks through the open office door at the clerks beyond it. “I tell myself they should not lose their livelihoods for things my predecessor did. Often that is true.” She gives a humourless little smile. “Conveniently, it also protects the desk I am sitting behind. That is why I keep the old records. If my argument is honest, it should survive evidence that makes me uncomfortable.”';
    }

    function factorStance() {
        const wren = quest('wren_price_of_silence');
        const aldric = quest('aldric_broken_vigil');
        const exposed = !!root.ironbondArc?.crownInfiltrationRevealed;
        let reformEvidence = 0;
        let defensiveEvidence = 0;

        if (wren?.status === 'completed') {
            if (wren.resolution === 'protect_petra' || wren.resolution === 'proof') reformEvidence += 2;
            if (wren.resolution === 'leverage') defensiveEvidence += 1;
        }
        if (aldric?.status === 'completed') {
            if (aldric.resolution === 'spare_patrol' || aldric.resolution === 'public_accountability') reformEvidence += 2;
            if (aldric.resolution === 'buried_for_money') defensiveEvidence += 2;
        }
        if (exposed) reformEvidence += 1;

        if (reformEvidence >= 4) return 'internal_reformer';
        if (defensiveEvidence >= 2 && reformEvidence === 0) return 'company_defensive';
        if (reformEvidence >= 2) return 'pragmatic_reformer';
        return 'pragmatic_factor';
    }

    function stanceText() {
        const stance = factorStance();
        if (stance === 'internal_reformer') {
            return '“I am not interested in saving Ironbond’s reputation by hiding what Ironbond did,” Petra says. “I am interested in saving the parts worth keeping by making the rest impossible to deny.”';
        }
        if (stance === 'company_defensive') {
            return '“You and I have mostly met across threats to the Company,” Petra says. “That makes trust difficult. It does not make every criticism false, and I would be an idiot to pretend otherwise.”';
        }
        if (stance === 'pragmatic_reformer') {
            return '“I am trying to leave the next factor fewer sealed boxes labelled ‘not our problem’,” Petra says. “Call that reform if you like. I mostly call it reducing the number of disasters waiting in the archive.”';
        }
        return '“Ironbond moves food, ore, wages and armed escorts across places the crown barely reaches,” Petra says. “That usefulness buys us power. Pretending the second part does not follow from the first is how factors become little kings.”';
    }

    function showResponse(npc, key, text, delta = { familiarity: 2, friendship: 2 }) {
        note(key, delta);
        withSuppressedDecoration(() => root.showDialogue?.(npc, text, [{ label: 'Understood.', action: () => {} }]));
    }

    function decorateTopLevel(npc, options) {
        if (!Array.isArray(options) || suppressDecoration) return options;
        syncStoryEvents();
        const decorated = options.map(option => ({ ...option }));
        const labels = new Set(decorated.map(option => option?.label));
        const wren = quest('wren_price_of_silence');
        const aldric = quest('aldric_broken_vigil');
        const rel = relationship();

        if (wren?.status === 'completed' && !labels.has('About Venn’s payment trail…')) {
            decorated.push({
                label: 'About Venn’s payment trail…',
                action: () => showResponse(npc, `petra:reflection:price_of_silence:${wren.resolution}`, priceOfSilenceText(), { familiarity: 2, friendship: 3 }),
            });
        }
        if (aldric?.status === 'completed' && !labels.has('About Aldric’s west-road order…')) {
            decorated.push({
                label: 'About Aldric’s west-road order…',
                action: () => showResponse(npc, `petra:reflection:broken_vigil:${aldric.resolution}`, brokenVigilText(), { familiarity: 2, friendship: 3 }),
            });
        }
        if (root.ironbondArc?.crownInfiltrationRevealed && !labels.has('You said the Company might be rotten at the core. What then?')) {
            decorated.push({
                label: 'You said the Company might be rotten at the core. What then?',
                action: () => showResponse(npc, 'petra:reflection:crown_infiltration', crownInfiltrationText(), { familiarity: 2, trust: 1, friendship: 2 }),
            });
        }
        if ((rel?.familiarity ?? 0) >= 8 && !labels.has('Why stay with Ironbond if you know what it has done?')) {
            decorated.push({
                label: 'Why stay with Ironbond if you know what it has done?',
                action: () => showResponse(npc, 'petra:philosophy:institutional_memory', philosophyText(), { familiarity: 3, trust: 1, friendship: 4 }),
            });
        }
        if ((wren?.status === 'completed' || aldric?.status === 'completed' || root.ironbondArc?.crownInfiltrationRevealed) && !labels.has('So what are you actually trying to make Ironbond become?')) {
            decorated.push({
                label: 'So what are you actually trying to make Ironbond become?',
                action: () => showResponse(npc, `petra:stance:${factorStance()}`, stanceText(), { familiarity: 2, friendship: 3 }),
            });
        }
        return decorated;
    }

    function install() {
        const trees = root.npcDialogueTrees;
        const base = trees?.[DIALOGUE_ID];
        if (typeof base !== 'function' || base.__petraIronbondFactorAware) return false;
        const wrapped = function(npc) {
            syncStoryEvents();
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let firstPetraDialogue = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && firstPetraDialogue && speaker?.name === PETRA) {
                    firstPetraDialogue = false;
                    const args = [...arguments];
                    args[2] = decorateTopLevel(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try { return base.apply(this, arguments); }
            finally { root.showDialogue = originalShowDialogue; }
        };
        wrapped.__petraIronbondFactorAware = true;
        wrapped.__basePetraIronbondFactorDialogue = base;
        trees[DIALOGUE_ID] = wrapped;
        return true;
    }

    const api = {
        build: BUILD,
        syncStoryEvents,
        priceOfSilenceDelta,
        brokenVigilDelta,
        priceOfSilenceText,
        brokenVigilText,
        crownInfiltrationText,
        philosophyText,
        factorStance,
        stanceText,
        decorateTopLevel,
        install,
    };

    root.petraIronbondFactor = api;
    root.PETRA_IRONBOND_FACTOR_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
