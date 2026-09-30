// persistentCharacterDialogueHooks.js
// Narrow bridge from existing authored Campaign 2 dialogue/quest functions into
// the persistent-character relationship layer. This deliberately does not turn
// every important NPC into a romance or invent generic procedural dialogue.
// It gives existing scenes memory now, while leaving deeper character-specific
// writing to be added one person at a time.
(() => {
    'use strict';

    const BUILD = '20260930-persistent-character-dialogue-hooks-v2';

    const DIALOGUE_CHARACTERS = Object.freeze({
        silverhart_queen: 'Queen Seraphine Corrin',
        elf_queen: "Queen Aelwen Sil'thandriel",
        dwarf_king: 'King Balrik Deepholm',
        royal_wizard: 'Court Wizard Thessaly',
        elder_nessa_wren: 'Elder Nessa Wren',
        reddale_guildmaster: 'Guildmaster Petra Voss',
        high_cleric: 'High Cleric Adelram',
        deepholds_runesmith: 'Thrain Emberhand',
        reddale_captain: 'Captain Ilsa Rennick',
    });

    function noteAudience(characterName, dialogueId) {
        window.notePersistentCharacterConversation?.(
            characterName,
            `audience:${dialogueId}`,
            { familiarity: 1 }
        );
    }

    function seraphinePersonalResponse(npc) {
        const rel = window.getPersistentCharacterRelationship?.(npc) || { trust: 0, friendship: 0 };
        let line;
        if (rel.trust < 20) {
            line = "Concern is kind. It's also how half this court tries to get a ruler to lower her guard. I'm managing — that will have to do for now.";
        } else if (rel.friendship < 15) {
            line = "Tired. There — you've extracted a state secret. The crown is mostly paperwork, funerals, and people asking for certainty from someone who has very little of it to spare.";
        } else if (rel.friendship < 35) {
            line = "Tired, and angrier than I ought to be some days. You asked about me rather than the crown, though. I noticed. Court teaches you to notice things like that.";
        } else {
            line = "Tired. Frightened, occasionally. Don't repeat that last part — half this court would turn a bad night's sleep into a succession crisis. Still... it's good to be asked as Seraphine once in a while.";
        }
        window.notePersistentCharacterConversation?.(
            npc,
            'seraphine:personal_burden',
            { familiarity: 2, trust: 1, friendship: 4 }
        );
        window.showDialogue(npc, line, [{ label: "Your secret's safe with me.", action: () => {} }]);
    }

    function decorateSeraphineTopLevel(npc, options) {
        if (!Array.isArray(options)) return options;
        const topicKeys = new Map([
            ['What of the greenskins?', 'seraphine:topic:greenskins'],
            ['What of the Ironbond Company?', 'seraphine:topic:ironbond'],
            ['Rumors of necromancy in Reddale?', 'seraphine:topic:necromancy'],
        ]);
        const decorated = options.map(option => {
            const key = topicKeys.get(option?.label);
            if (!key || typeof option.action !== 'function') return option;
            const baseAction = option.action;
            return {
                ...option,
                action: function() {
                    window.notePersistentCharacterConversation?.(npc, key, { familiarity: 1 });
                    return baseAction.apply(this, arguments);
                },
            };
        });

        const rel = window.getPersistentCharacterRelationship?.(npc);
        if ((rel?.familiarity ?? 0) >= 9 && !decorated.some(o => o?.label === 'And you, Your Majesty? How are you holding up?')) {
            decorated.push({
                label: 'And you, Your Majesty? How are you holding up?',
                action: () => seraphinePersonalResponse(npc),
            });
        }
        return decorated;
    }

    function wrapDialogueTree(dialogueId, characterName) {
        const trees = window.npcDialogueTrees;
        const base = trees?.[dialogueId];
        if (typeof base !== 'function' || base.__persistentCharacterAware) return false;
        const wrapped = function(npc) {
            noteAudience(characterName, dialogueId);
            if (dialogueId !== 'silverhart_queen' || typeof window.showDialogue !== 'function') {
                return base.apply(this, arguments);
            }

            // The Queen's existing tree owns all of its political/quest logic.
            // Intercept only the one top-level showDialogue call made during
            // that synchronous tree build, decorate its options, then restore
            // immediately. Nested option actions run later against the normal
            // showDialogue function, so this is intentionally a tiny surface.
            const originalShowDialogue = window.showDialogue;
            let firstQueenDialogue = true;
            window.showDialogue = function(speaker, text, options) {
                if (firstQueenDialogue && speaker?.name === characterName) {
                    firstQueenDialogue = false;
                    const args = [...arguments];
                    args[2] = decorateSeraphineTopLevel(npc, options);
                    return originalShowDialogue.apply(this, args);
                }
                return originalShowDialogue.apply(this, arguments);
            };
            try {
                return base.apply(this, arguments);
            } finally {
                window.showDialogue = originalShowDialogue;
            }
        };
        wrapped.__persistentCharacterAware = true;
        wrapped.__basePersistentCharacterDialogue = base;
        trees[dialogueId] = wrapped;
        return true;
    }

    function wrapWizardVendetta() {
        const base = window.resolveWizardVendetta;
        if (typeof base !== 'function' || base.__persistentCharacterAware) return false;
        const wrapped = function(resolution) {
            const questBefore = (window.questLog || []).find(q => q.id === 'wizard_vendetta');
            const wasComplete = questBefore?.status === 'completed';
            const result = base.apply(this, arguments);
            const questAfter = (window.questLog || []).find(q => q.id === 'wizard_vendetta');
            if (wasComplete || questAfter?.status !== 'completed') return result;

            if (resolution === 'queen') {
                window.recordPersistentCharacterEvent?.(
                    'Queen Seraphine Corrin',
                    'wizard_vendetta:evidence_to_crown',
                    { familiarity: 2, trust: 7, friendship: 2 }
                );
                window.recordPersistentCharacterEvent?.(
                    'Court Wizard Thessaly',
                    'wizard_vendetta:evidence_to_crown',
                    { familiarity: 2, trust: -8, friendship: -4 }
                );
            } else if (resolution === 'wizard') {
                window.recordPersistentCharacterEvent?.(
                    'Court Wizard Thessaly',
                    'wizard_vendetta:warned_thessaly',
                    { familiarity: 2, trust: 9, friendship: 4 }
                );
            } else if (resolution === 'noble') {
                window.recordPersistentCharacterEvent?.(
                    'Court Wizard Thessaly',
                    'wizard_vendetta:evidence_to_corstane',
                    { familiarity: 2, trust: -12, friendship: -6 }
                );
            }
            return result;
        };
        wrapped.__persistentCharacterAware = true;
        wrapped.__baseResolveWizardVendetta = base;
        window.resolveWizardVendetta = wrapped;
        return true;
    }

    function install() {
        if (!window.persistentCharacterRelationships || !window.npcDialogueTrees) return false;
        Object.entries(DIALOGUE_CHARACTERS).forEach(([dialogueId, characterName]) => {
            wrapDialogueTree(dialogueId, characterName);
        });
        wrapWizardVendetta();
        return true;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();

    window.refreshPersistentCharacterDialogueHooks = install;
    window.PERSISTENT_CHARACTER_DIALOGUE_HOOKS_BUILD = BUILD;
})();
