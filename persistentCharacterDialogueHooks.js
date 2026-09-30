// persistentCharacterDialogueHooks.js
// Narrow bridge from existing authored Campaign 2 dialogue/quest functions into
// the persistent-character relationship layer. This deliberately does not turn
// every important NPC into a romance or invent generic procedural dialogue.
// It gives existing scenes memory now, while leaving deeper character-specific
// writing to be added one person at a time.
(() => {
    'use strict';

    const BUILD = '20260930-persistent-character-dialogue-hooks-v1';

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

    function wrapDialogueTree(dialogueId, characterName) {
        const trees = window.npcDialogueTrees;
        const base = trees?.[dialogueId];
        if (typeof base !== 'function' || base.__persistentCharacterAware) return false;
        const wrapped = function(npc) {
            noteAudience(characterName, dialogueId);
            return base.apply(this, arguments);
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
