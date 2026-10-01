// aelwenLivingAccord.js
// Queen Aelwen Sil'thandriel's first persistent-character story pass.
//
// This is deliberately not a companion quest and not a romance declaration.
// It uses the existing Silver Accord and the already-established complaint
// about Silverhart woodcutters to give Aelwen a distinct personality: long
// memory, reciprocity, and a belief that a border can adapt only when both
// sides consciously agree to the change.
//
// The quest also demonstrates why persistent characters matter. Aelwen and
// Seraphine each retain their own agency and personal relationship with the
// player, while Fenn/Nessa can offer genuinely different counsel based on
// existing character development.
(() => {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20260930-aelwen-living-accord-v1';
    const AELWEN = "Queen Aelwen Sil'thandriel";
    const SERAPHINE = 'Queen Seraphine Corrin';
    const NESSA = 'Elder Nessa Wren';
    const FENN = 'Fenn Oakheart';
    const QUEST_ID = 'aelwen_living_accord';

    function party() {
        return Array.isArray(root.party) ? root.party : [];
    }

    function protagonist() {
        return party()[0] || root.player || null;
    }

    function quest() {
        return (root.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    }

    function silverAccord() {
        return (root.questLog || []).find(entry => entry?.id === 'silver_accord') || null;
    }

    function fenn() {
        return party().find((member, index) => index > 0 && member?.name === FENN) || null;
    }

    function canStart() {
        return silverAccord()?.status === 'completed';
    }

    function relationship(name) {
        return root.getPersistentCharacterRelationship?.(name) || null;
    }

    function record(name, key, delta) {
        return root.recordPersistentCharacterEvent?.(name, key, delta);
    }

    function ensureQuest() {
        root.questLog = root.questLog || [];
        let q = quest();
        if (q || !canStart()) return q;
        q = {
            id: QUEST_ID,
            title: 'The Living Accord',
            giver: AELWEN,
            status: 'active',
            resolution: null,
            stage: 'hear_silverhart',
            description: "Queen Aelwen says Silverhart woodcutters have crossed the old forest boundary often enough that the Silver Accord needs practical terms. Hear Seraphine's position, then return to Aelwen.",
            aelwenPositionHeard: true,
            silverhartPositionHeard: false,
            nessaCounselHeard: false,
            fennCounselHeard: false,
            offeredAt: Number(root.worldSeconds || 0),
        };
        root.questLog.push(q);
        record(AELWEN, 'living_accord:raised_terms', { familiarity: 2, trust: 2, friendship: 1 });
        root.showMessage?.('Quest added: The Living Accord.');
        return q;
    }

    function noteAelwenPosition() {
        const q = ensureQuest();
        if (!q) return null;
        q.aelwenPositionHeard = true;
        q.stage = q.silverhartPositionHeard ? 'return_to_aelwen' : 'hear_silverhart';
        return q;
    }

    function noteSeraphinePosition() {
        const q = quest();
        if (!q || q.status !== 'active') return null;
        q.silverhartPositionHeard = true;
        q.stage = 'return_to_aelwen';
        q.description = 'Seraphine will accept either a clearly marked no-cut buffer or a jointly managed harvest system. Return to Aelwen with Silverhart’s position.';
        record(SERAPHINE, 'living_accord:heard_aelwen_terms', { familiarity: 2, trust: 2, friendship: 1 });
        return q;
    }

    function noteNessaCounsel() {
        const q = quest();
        if (!q || q.status !== 'active') return null;
        if (!q.nessaCounselHeard) {
            q.nessaCounselHeard = true;
            record(NESSA, 'living_accord:asked_for_counsel', { familiarity: 2, trust: 2, friendship: 2 });
        }
        return q;
    }

    function fennCounselText() {
        const state = root.fennLivingBoundary?.getArcState?.() || null;
        if (!state) {
            return 'Fenn studies the old boundary stones for a while. “A line only works if both sides know what it means. If people need timber and the Court needs the forest protected, mark what can be taken together instead of pretending one side will eventually stop caring.”';
        }
        if (state.landEthic === 'preservationist') {
            return 'Fenn folds his arms. “Some places need a line people simply do not cross. If the Court keeps having to renegotiate every time Silverhart wants another tree, that is not much of a boundary.”';
        }
        if (state.landEthic === 'interventionist_steward' || state.landEthic === 'pragmatic_steward') {
            return 'Fenn looks from Aelwen to the map. “Managed use is still management. Mark stormfall first, agree a greenwood quota if you truly need one, and have both sides choose the trees. The important part is that neither side gets to quietly redefine the bargain alone.”';
        }
        return 'Fenn taps the edge of the map. “You can preserve a forest and still admit people live beside it. I would start with stormfall, mark anything else together, and make the boundary something both sides have to maintain.”';
    }

    function noteFennCounsel() {
        const q = quest() || ensureQuest();
        if (!q || q.status !== 'active' || !fenn()) return null;
        if (!q.fennCounselHeard) {
            q.fennCounselHeard = true;
            root.noteCompanionConversation?.(fenn(), 'fenn:aelwen_living_accord', 2);
        }
        return q;
    }

    function canResolve() {
        const q = quest();
        return !!(q && q.status === 'active' && q.aelwenPositionHeard && q.silverhartPositionHeard);
    }

    function resolutionSpec(resolution) {
        if (resolution === 'marked_buffer') {
            return {
                aelwen: { trust: 7, friendship: 4, familiarity: 2 },
                seraphine: { trust: 3, friendship: 1 },
                text: 'Aelwen considers the proposed buffer in silence, then nods. “A line that both courts can point to is inelegant. It is also difficult to misunderstand. I will have my rangers mark it beside Silverhart’s foresters.”',
                world: { mode: 'marked_buffer', greenwoodHarvest: false, jointManagement: true },
            };
        }
        if (resolution === 'joint_stewardship') {
            return {
                aelwen: { trust: 9, friendship: 6, familiarity: 3 },
                seraphine: { trust: 5, friendship: 2 },
                text: 'Aelwen’s expression softens by a fraction. “A living boundary, then. Stormfall first. Greenwood only when both sets of wardens mark it, and never because one court quietly decided need was the same thing as permission.” She folds the map. “That can last.”',
                world: { mode: 'joint_stewardship', greenwoodHarvest: true, jointManagement: true },
            };
        }
        if (resolution === 'press_silverhart') {
            return {
                aelwen: { trust: -10, friendship: -5, familiarity: 2 },
                seraphine: { trust: -1 },
                text: 'Aelwen does not raise her voice. “No. Silverhart needing timber does not make our trees Silverhart’s.” She slides the map back across the table. “You were asked to carry terms between sovereigns, not surrender one side’s claim for the sake of convenience. The old boundary stands. My rangers will enforce it.”',
                world: { mode: 'old_boundary_enforced', greenwoodHarvest: false, jointManagement: false },
            };
        }
        return null;
    }

    function resolve(resolution) {
        const q = quest();
        const spec = resolutionSpec(resolution);
        if (!q || !spec || !canResolve()) return null;
        if (q.status === 'completed') return q;

        q.status = 'completed';
        q.resolution = resolution;
        q.completedAt = Number(root.worldSeconds || 0);
        q.stage = 'completed';
        q.description = resolution === 'press_silverhart'
            ? 'Aelwen rejected a proposal that treated Silverhart’s timber need as overriding the Sylvan Court’s boundary. The old border remains in force.'
            : resolution === 'marked_buffer'
                ? 'Silverhart and the Sylvan Court will jointly mark a clear no-cut buffer along the disputed forest edge.'
                : 'Silverhart and the Sylvan Court will jointly manage limited harvesting: stormfall first, with any greenwood marked by both sides.';
        q.forestTerms = { ...spec.world };

        record(AELWEN, `living_accord:resolution:${resolution}`, spec.aelwen);
        record(SERAPHINE, `living_accord:resolution:${resolution}`, spec.seraphine);
        root.campaign2ForestAccordState = { ...spec.world, resolution };
        root.showMessage?.('Quest complete: The Living Accord.');
        return { quest: q, text: spec.text };
    }

    function showAelwenOpening(npc) {
        const q = ensureQuest();
        if (!q || typeof root.showDialogue !== 'function') return false;
        noteAelwenPosition();
        const options = [
            {
                label: '“What exactly has Silverhart been doing?”',
                action: () => root.showDialogue(npc,
                    '“Three crews this spring crossed stones that have marked the border longer than Silverhart has had its current dynasty. Some took stormfall. Some did not bother with the distinction.” Aelwen rests two fingers on the map. “I do not want blood over timber. I also will not teach a neighboring crown that an old promise expires when everyone who made it has died.”',
                    [{ label: 'I’ll hear Seraphine’s side.', action: () => {} }]
                ),
            },
        ];
        if (fenn()) {
            options.push({
                label: '[Fenn] “What do you make of it?”',
                action: () => {
                    noteFennCounsel();
                    root.showDialogue(fenn(), fennCounselText(), [{ label: 'Something to carry into the negotiation.', action: () => {} }]);
                },
            });
        }
        options.push({ label: '“I’ll speak to Seraphine.”', action: () => {} });
        root.showDialogue(npc,
            'Aelwen has the old border map open before her. “Elarion’s Accord is useful. Seals usually are. The harder question is whether anyone behaves differently after the wax cools.”\n\nShe points to the forest edge. “Silverhart’s woodcutters have crossed this line often enough that I would rather settle the practice now than let some frightened ranger settle it with an arrow later.”',
            options
        );
        return true;
    }

    function showSeraphinePosition(npc) {
        const q = noteSeraphinePosition();
        if (!q || typeof root.showDialogue !== 'function') return false;
        root.showDialogue(npc,
            'Seraphine reads Aelwen’s terms twice. “She is not wrong about the trespass. She is also not repairing Northwatch after every raid.” She rubs at the bridge of her nose. “I can order a clearly marked no-cut buffer, or I can put my foresters beside her rangers and let them mark stormfall and a limited amount of greenwood together. What I will not do is pretend the disputed belt belongs entirely to whichever court needs it most that season.”',
            [{ label: 'I’ll take that back to her.', action: () => {} }]
        );
        return true;
    }

    function showNessaCounsel(npc) {
        const q = noteNessaCounsel();
        if (!q || typeof root.showDialogue !== 'function') return false;
        const wetland = root.campaign2WetlandState;
        const line = wetland?.managedFlow
            ? 'Nessa gives a small, knowing smile. “You have already seen that a boundary can move without becoming meaningless. The marsh changed because water changed. This border changes only if people agree to change it. Those are not the same thing.”'
            : 'Nessa traces an imaginary line with one finger. “Forests survive use. They do not survive being treated as ownerless whenever somebody finds a need. If the courts want a flexible boundary, make the flexibility explicit and make both sides responsible for it.”';
        root.showDialogue(npc, line, [{ label: 'I’ll remember that.', action: () => {} }]);
        return true;
    }

    function showAelwenResolution(npc) {
        if (!canResolve() || typeof root.showDialogue !== 'function') return false;
        const q = quest();
        const options = [
            {
                label: 'Propose a jointly marked no-cut buffer.',
                action: () => {
                    const result = resolve('marked_buffer');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Then we have terms.', action: () => {} }]);
                },
            },
            {
                label: 'Propose joint stewardship: stormfall first, limited greenwood marked by both sides.',
                action: () => {
                    const result = resolve('joint_stewardship');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Then we have terms.', action: () => {} }]);
                },
            },
            {
                label: 'Tell Aelwen Silverhart’s need for timber should take priority.',
                action: () => {
                    const result = resolve('press_silverhart');
                    if (result) root.showDialogue(npc, result.text, [{ label: 'Understood.', action: () => {} }]);
                },
            },
        ];
        const counsel = [];
        if (q.fennCounselHeard) counsel.push('Fenn’s view is part of what you are carrying into the room.');
        if (q.nessaCounselHeard) counsel.push('Nessa’s counsel is part of what you are carrying into the room.');
        const suffix = counsel.length ? `\n\n${counsel.join(' ')}` : '';
        root.showDialogue(npc,
            `Aelwen listens to Seraphine’s position without interrupting. “Good. She has given us choices rather than excuses. What do you think is most likely to survive the next generation of officials?”${suffix}`,
            options
        );
        return true;
    }

    function showAelwenLongMemory(npc) {
        const rel = relationship(AELWEN) || { trust: 0, friendship: 0 };
        let line;
        if (rel.trust < 15) {
            line = '“I remember because someone must.” Aelwen’s tone is not hostile, but the door closes there. “Long memory is not intimacy. It is one of the duties of my office.”';
        } else if (rel.friendship < 12) {
            line = '“I was young when some of those stones were set.” Aelwen glances toward the forest beyond the court. “The human envoys who argued over every pace are dead. Their children are dead. The trees are not. That is why I care about institutions that can remember longer than a person can.”';
        } else {
            line = 'Aelwen smiles, faintly. “I remember the first human envoy who complained that the stones were too fussy. He promised nobody would need them once both sides knew the line.” She looks back at you. “He meant it. That is the dangerous thing about short memories — the people making the promise are often perfectly sincere.”';
        }
        root.notePersistentCharacterConversation?.(AELWEN, 'aelwen:long_memory', { familiarity: 3, trust: 1, friendship: 4 });
        root.showDialogue(npc, line, [{ label: 'I see why the details matter to you.', action: () => {} }]);
        return true;
    }

    function decorateAelwen(npc, options) {
        if (!Array.isArray(options)) return options;
        const q = quest();
        const accord = silverAccord();
        const decorated = [...options];

        if (accord?.status === 'completed' && !q) {
            decorated.unshift({ label: '“You said the Accord has to change behaviour. What comes next?”', action: () => showAelwenOpening(npc) });
        } else if (q?.status === 'active' && q.silverhartPositionHeard) {
            decorated.unshift({ label: '“I’ve spoken with Seraphine about the forest boundary.”', action: () => showAelwenResolution(npc) });
        } else if (q?.status === 'active') {
            decorated.unshift({ label: '“About the forest boundary...”', action: () => showAelwenOpening(npc) });
        }

        const rel = relationship(AELWEN);
        if ((rel?.familiarity ?? 0) >= 7 && !decorated.some(option => option?.label === '“You remember these borders personally, don’t you?”')) {
            decorated.push({ label: '“You remember these borders personally, don’t you?”', action: () => showAelwenLongMemory(npc) });
        }
        return decorated;
    }

    function decorateSeraphine(npc, options) {
        if (!Array.isArray(options)) return options;
        const q = quest();
        if (!q || q.status !== 'active' || q.silverhartPositionHeard) return options;
        return [
            { label: '“Queen Aelwen sent me about the forest boundary.”', action: () => showSeraphinePosition(npc) },
            ...options,
        ];
    }

    function decorateNessa(npc, options) {
        if (!Array.isArray(options)) return options;
        const q = quest();
        if (!q || q.status !== 'active' || q.nessaCounselHeard) return options;
        return [
            { label: '“Aelwen and Seraphine are arguing over the forest boundary. What do you think?”', action: () => showNessaCounsel(npc) },
            ...options,
        ];
    }

    function wrapTree(dialogueId, characterName, decorator) {
        const trees = root.npcDialogueTrees;
        const base = trees?.[dialogueId];
        if (typeof base !== 'function' || base.__aelwenLivingAccordAware) return false;
        const wrapped = function(npc) {
            if (typeof root.showDialogue !== 'function') return base.apply(this, arguments);
            const originalShowDialogue = root.showDialogue;
            let firstTopLevel = true;
            root.showDialogue = function(speaker, text, options) {
                if (firstTopLevel && speaker?.name === characterName) {
                    firstTopLevel = false;
                    const args = [...arguments];
                    args[2] = decorator(npc, options);
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
        wrapped.__aelwenLivingAccordAware = true;
        // Preserve the generic persistent-character marker so a later refresh
        // does not stack another copy of that wrapper around this one.
        if (base.__persistentCharacterAware) wrapped.__persistentCharacterAware = true;
        wrapped.__baseAelwenLivingAccord = base;
        trees[dialogueId] = wrapped;
        return true;
    }

    function install() {
        if (!root.npcDialogueTrees) return false;
        wrapTree('elf_queen', AELWEN, decorateAelwen);
        wrapTree('silverhart_queen', SERAPHINE, decorateSeraphine);
        wrapTree('elder_nessa_wren', NESSA, decorateNessa);
        return true;
    }

    const api = {
        build: BUILD,
        questId: QUEST_ID,
        canStart,
        ensureQuest,
        getQuest: quest,
        noteAelwenPosition,
        noteSeraphinePosition,
        noteNessaCounsel,
        noteFennCounsel,
        fennCounselText,
        canResolve,
        resolve,
        showAelwenOpening,
        showSeraphinePosition,
        showNessaCounsel,
        showAelwenResolution,
        showAelwenLongMemory,
        refreshHooks: install,
    };

    root.aelwenLivingAccord = api;
    root.AELWEN_LIVING_ACCORD_BUILD = BUILD;

    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
        else install();
    }
})();
