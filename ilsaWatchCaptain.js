// ilsaWatchCaptain.js
// Captain Ilsa Rennick's first persistent-character pass.
//
// Ilsa already anchors Reddale's missing patrol, Eyes on the Border, the
// necromancer investigation, and the institutional side of Reyna's Empty Blind.
// Her theme is command under uncertainty: law and intelligence only work when
// frightened people can still tell the Watch the truth. Punishment matters, but
// a system that makes surrender or confession suicidal manufactures its own
// blind spots.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-ilsa-watch-captain-v1';
    const ILSA = 'Captain Ilsa Rennick';
    const DIALOGUE_ID = 'reddale_captain';
    let suppressDecoration = 0;

    const quest = id => (root.questLog || []).find(entry => entry?.id === id) || null;
    const relationship = () => root.getPersistentCharacterRelationship?.(ILSA) || null;

    function record(key, delta) {
        return root.recordPersistentCharacterEvent?.(ILSA, key, delta);
    }

    function note(key, delta) {
        return root.notePersistentCharacterConversation?.(ILSA, key, delta);
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function emptyBlindDelta(resolution) {
        if (resolution === 'witness_deal') return { familiarity: 4, trust: 8, friendship: 5 };
        if (resolution === 'turn_in') return { familiarity: 3, trust: 4, friendship: 2 };
        if (resolution === 'double_agent') return { familiarity: 3, trust: -5, friendship: -1 };
        if (resolution === 'let_disappear') return { familiarity: 3, trust: -8, friendship: -3 };
        return {};
    }

    function syncStoryEvents() {
        const missing = quest('reddale_missing_watch');
        if (missing?.status === 'completed') record('ilsa:missing_watch:resolved', { familiarity: 2, trust: 4, friendship: 2 });

        const eyes = quest('eyes_on_border');
        if (eyes?.status === 'completed') record('ilsa:eyes_on_border:resolved', { familiarity: 2, trust: 4, friendship: 2 });

        const reyna = quest('reyna_empty_blind');
        if (reyna?.status === 'completed' && reyna.resolution) {
            record(`ilsa:empty_blind:${reyna.resolution}`, emptyBlindDelta(reyna.resolution));
        }

        if (quest('disciple_exposed')?.status === 'completed') {
            record('ilsa:disciple:reported_with_evidence', { familiarity: 2, trust: 5, friendship: 2 });
        }

        const hunt = quest('necromancer_hunt');
        if (hunt?.status === 'completed') record('ilsa:necromancer_hunt:crypt_resolved', { familiarity: 3, trust: 6, friendship: 2 });

        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            record('ilsa:lichdom:allied_with_ashgrave', { familiarity: 4, trust: -35, friendship: -18 });
        } else if (lich?.status === 'completed') {
            record('ilsa:lichdom:ashgrave_stopped', { familiarity: 3, trust: 10, friendship: 4 });
        }
        return relationship();
    }

    function emptyBlindText() {
        const q = quest('reyna_empty_blind');
        if (!q || q.status !== 'completed') {
            return 'Ilsa rubs at one eyebrow. “A Watch can punish betrayal. Harder question is whether people believe they can come back after the first bad choice. If the answer is always a rope, they stop coming back and start hiding the next mistake too.”';
        }
        if (q.resolution === 'witness_deal') {
            return '“The witness deal was worth making,” Ilsa says. “Not because Tamsin and the others did nothing wrong. They leaked routes after the first coercion ended. But protection bought us testimony, current intelligence and a way to stop the leak without teaching every frightened informant that surrender is suicide.”';
        }
        if (q.resolution === 'turn_in') {
            return 'Ilsa nods. “A public trial was defensible. People died because of those routes, and coercion does not erase everything chosen afterward. My job then is to make sure the court hears the coercion as loudly as it hears the dead soldiers.”';
        }
        if (q.resolution === 'double_agent') {
            return 'Ilsa’s jaw tightens. “Clever operation. Also an unregistered intelligence network built from traumatised civilians who already proved they make bad decisions when isolated.” She exhales. “If it works, everyone calls it ingenuity. If it fails, the Watch finds out after the bodies arrive.”';
        }
        if (q.resolution === 'let_disappear') {
            return '“I understand why Reyna wanted them gone,” Ilsa says. “I even understand why you helped.” She does not soften. “But disappearing witnesses also disappears what they know. Mercy for three people can still leave every patrol east of Reddale blind.”';
        }
        return '“The trackers were frightened, compromised and useful all at once,” Ilsa says. “Real cases are irritating that way.”';
    }

    function necromancerText() {
        const lich = quest('necromancer_lichdom');
        if (root.necromancerAllied || root.playerIsLich || lich?.resolution === 'allied') {
            return 'Ilsa looks at you as though recalculating every previous conversation. “You were the person I sent because you could get close enough to end Ashgrave. You used that access to join him.” Her voice stays level. “That is not a theological disagreement. It is an operational fact I now have to plan around.”';
        }
        if (lich?.status === 'completed') {
            return '“Ashgrave is finished, then,” Ilsa says. “Good. I will still keep the reports. Threats like that become legends quickly, and legends are terrible intelligence. Next time I want names, dates, routes and exactly what failed to kill him the first time.”';
        }
        if (quest('necromancer_hunt')?.status === 'completed') {
            return '“Clearing the crypt did not end the problem,” Ilsa says. “That is the lesson I care about. We saw one ritual site and wanted it to be the whole story. Commanders love complete stories because complete stories let us stop allocating patrols.”';
        }
        if (quest('disciple_exposed')?.status === 'completed') {
            return '“Mirella was useful evidence because she was a thread, not because arresting one disciple made the cult disappear,” Ilsa says. “A Watch gets into trouble when every arrest is treated as proof the case is over.”';
        }
        return '“If something supernatural is killing people, I still need ordinary facts,” Ilsa says. “Where. When. Who saw it. Which road. Which body. Fear is not improved by vague reports.”';
    }

    function philosophyText() {
        const rel = relationship() || { trust: 0, friendship: 0 };
        if (rel.trust < 15) {
            return 'Ilsa gives you a dry look. “My philosophy is that Reddale should still be standing tomorrow morning. The rest is easier to discuss after you have proved you are not creating extra work for the Watch.”';
        }
        if (rel.friendship < 15) {
            return '“Law is useful when it makes people more willing to bring you the truth,” Ilsa says. “If every mistake means the maximum punishment, people do not become more honest. They become better at hiding mistakes until the consequences are too large to hide.”';
        }
        return 'Ilsa leans back. “Captains like to say civilians should have come to us sooner. Sometimes that is true.” She grimaces. “Sometimes we have spent years teaching them exactly what will happen if they do. You cannot build an institution around fear and then act surprised when frightened people avoid it.”';
    }

    function reynaText() {
        const q = quest('reyna_empty_blind');
        const state = root.reynaEmptyBlind?.getArcState?.() || null;
        if (!q || q.status !== 'completed') return null;
        if (state?.institutions === 'institutionally_engaged' || state?.institutions === 'conditional_trust') {
            return 'Ilsa gives a short laugh. “Reyna asking an institution for help before the crisis is already half a miracle. Do not tell her I said that.” Then she sobers. “She is learning that relying on someone is not the same thing as surrendering judgement.”';
        }
        if (state?.institutions === 'deeply_distrustful') {
            return '“Reyna is excellent at surviving systems she does not trust,” Ilsa says. “That is not the same skill as changing them. If she assumes every structure will fail her, she will keep proving she can operate alone—and keep carrying every failure alone too.”';
        }
        return '“Reyna notices what formal patrols miss,” Ilsa says. “I value that. I would value it more if she stopped treating coordination as a character flaw.”';
    }

    function commandText() {
        const rel = relationship() || { trust: 0 };
        if (rel.trust < 25) {
            return '“Command is deciding with incomplete information and then being responsible for the result,” Ilsa says. “Anyone who tells you certainty comes with the rank is selling uniforms.”';
        }
        return '“The worst temptation in command is confusing decisiveness with being right,” Ilsa says. “You still have to choose before all the facts arrive. The discipline is keeping enough humility afterward to change the plan when the facts prove you wrong.”';
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
        const reyna = quest('reyna_empty_blind');
        const necro = quest('disciple_exposed') || quest('necromancer_hunt') || quest('necromancer_lichdom') || root.playerIsLich;
        const rel = relationship();

        if (reyna?.status === 'completed' && !labels.has('About Reyna’s missing trackers…')) {
            decorated.push({ label: 'About Reyna’s missing trackers…', action: () => showResponse(npc, `ilsa:reflection:empty_blind:${reyna.resolution}`, emptyBlindText(), { familiarity: 2, friendship: 3 }) });
        }
        if (necro && !labels.has('What did the necromancer case teach the Watch?')) {
            decorated.push({ label: 'What did the necromancer case teach the Watch?', action: () => showResponse(npc, 'ilsa:reflection:necromancer', necromancerText(), { familiarity: 2, friendship: 3 }) });
        }
        if ((rel?.familiarity ?? 0) >= 8 && !labels.has('What do you think the Watch is actually for?')) {
            decorated.push({ label: 'What do you think the Watch is actually for?', action: () => showResponse(npc, 'ilsa:philosophy:law_and_truth', philosophyText(), { familiarity: 3, trust: 1, friendship: 4 }) });
        }
        if ((rel?.familiarity ?? 0) >= 10 && !labels.has('How do you make decisions when you do not know enough?')) {
            decorated.push({ label: 'How do you make decisions when you do not know enough?', action: () => showResponse(npc, 'ilsa:philosophy:command_uncertainty', commandText(), { familiarity: 2, friendship: 2 }) });
        }
        if (reyna?.status === 'completed' && !labels.has('What do you make of Reyna?')) {
            decorated.push({ label: 'What do you make of Reyna?', action: () => {
                const text = reynaText();
                if (text) showResponse(npc, 'ilsa:reyna:institutional_trust', text, { familiarity: 2, friendship: 3 });
            }});
        }
        return decorated;
    }

    function install() {
        const trees = root.npcDialogueTrees;
        const base = trees?.[DIALOGUE_ID];
        if (typeof base !== 'function' || base.__ilsaWatchCaptainAware) return false;
        const wrapped = function(npc) {
            syncStoryEvents();
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let first = true;
            root.showDialogue = function(speaker, text, options) {
                if (!suppressDecoration && first && speaker?.name === ILSA) {
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
        wrapped.__ilsaWatchCaptainAware = true;
        wrapped.__baseIlsaDialogue = base;
        trees[DIALOGUE_ID] = wrapped;
        return true;
    }

    const api = { build: BUILD, syncStoryEvents, emptyBlindDelta, emptyBlindText, necromancerText, philosophyText, reynaText, commandText, decorateTopLevel, install };
    root.ilsaWatchCaptain = api;
    root.ILSA_WATCH_CAPTAIN_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
