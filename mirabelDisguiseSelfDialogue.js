// mirabelDisguiseSelfDialogue.js
// Mirabel Quill's Disguise Self companion dialogue: playful impersonation,
// party pranks, and consensual romantic role-play. Mechanical spell logic
// remains in disguiseSelfSystem.js; this file only chooses and applies
// appearance profiles through that public API.
(() => {
    'use strict';

    const BUILD = '20261008-mirabel-disguise-self-v1';
    const MIRABEL_NAME = 'Mirabel Quill';
    const PERSONAL_DIALOGUE_ID = 'companion_mirabel_quill';

    const party = () => Array.isArray(window.party) ? window.party : [];
    const protagonist = () => party()[0] || window.player || null;
    const mirabel = () => party().find((member, index) => index > 0 && member?.name === MIRABEL_NAME) || null;

    function hasSpell(entity) {
        if (!entity) return false;
        const skills = entity.skills || {};
        const unlocked = entity.unlockedBaseSpells || entity.knownSpells || entity.spellsKnown || [];
        return !!(
            skills.learn_disguise_self ||
            skills.disguise_self ||
            skills.disguise_self?.rank ||
            (Array.isArray(unlocked) && unlocked.includes('disguise_self'))
        );
    }

    function systemReady() {
        return !!window.disguiseSelfSystem &&
            typeof window.disguiseSelfSystem.apply === 'function' &&
            typeof window.disguiseSelfSystem.clear === 'function';
    }

    function appearanceOf(target) {
        const a = target?.appearance || {};
        return {
            gender: target?.gender || target?.bodyPresentation || a.gender || 'female',
            bodyType: target?.bodyType || a.bodyType || 'average',
            hairStyle: target?.hairStyle || a.hairStyle || 'brown_1',
            hairHue: Number(target?.hairHue ?? a.hairHue ?? 25),
            hairSaturation: Number(target?.hairSaturation ?? a.hairSaturation ?? 70),
            hairValue: Number(target?.hairValue ?? a.hairValue ?? 55),
            skinToneSlider: Number(target?.skinToneSlider ?? a.skinToneSlider ?? 45),
        };
    }

    function disguiseAs(caster, target) {
        if (!caster || !target || !systemReady()) return false;
        window.disguiseSelfSystem.apply(caster, { appearance: appearanceOf(target) });
        return true;
    }

    function clearDisguise(caster) {
        if (!caster || !systemReady()) return false;
        window.disguiseSelfSystem.clear(caster);
        return true;
    }

    function partyTarget(name) {
        return party().find(member => member?.name === name) || null;
    }

    function activePartyTargets() {
        return party().filter(member => member && member !== protagonist());
    }

    function relationshipState() {
        const m = mirabel();
        if (!m) return null;
        if (typeof window.getCompanionRomanceState === 'function') {
            return window.getCompanionRomanceState(m);
        }
        const affinity = window.getCompanionAffinity?.(m) || m.playerAffinity || {};
        return {
            affinity,
            agreement: m.playerRelationship?.romanceAgreement || null,
        };
    }

    function inRelationship() {
        const state = relationshipState();
        const agreementState = state?.agreement?.state;
        if (['dating', 'committed', 'strained'].includes(agreementState)) return true;
        return ['dating', 'committed', 'strained'].includes(state?.affinity?.romanceState);
    }

    function playerHasSpell() {
        return hasSpell(protagonist());
    }

    function show(text, options) {
        const m = mirabel();
        if (!m || typeof window.showDialogue !== 'function') return false;
        window.showDialogue(m, text, options);
        return true;
    }

    function prankMenu() {
        const m = mirabel();
        if (!m) return false;
        const targets = activePartyTargets();
        const options = targets.slice(0, 5).map(target => ({
            label: `“I want to be ${target.name}.”`,
            action: () => {
                if (!disguiseAs(m, target)) {
                    show('Mirabel taps her fingers together. “I can do the theory. The spell itself appears to be having an administrative crisis.”', [
                        { label: 'We will try again later.', action: () => {} },
                    ]);
                    return;
                }
                show(
                    `Mirabel studies her new face in an imaginary mirror. “${target.name}.” She adopts their mannerisms for a moment, then grins. “Oh, this is going to be irresponsible.”`,
                    [
                        { label: '“Go on, then.”', action: () => {} },
                        { label: '“Maybe do not traumatise them.”', action: () => show('“No promises. I am a scholar. Experimentation is practically a civic duty.”', [{ label: 'Right.', action: () => {} }]) },
                    ]
                );
            },
        }));
        options.push({
            label: '“Be me.”',
            action: () => {
                if (!disguiseAs(m, protagonist())) return;
                show('Mirabel becomes an almost perfect version of you, then immediately ruins the effect by giving herself an exaggeratedly thoughtful expression. “Oh dear. I understand why everyone listens to you now.”', [
                    { label: '“You are enjoying this.”', action: () => show('“Immensely.”', [{ label: 'I can tell.', action: () => {} }]) },
                ]);
            },
        });
        options.push({ label: '“Never mind.”', action: () => {} });
        return show('Mirabel’s eyes light up. “Choose someone. Anyone. I have a spell and absolutely no professional reason not to misuse it.”', options);
    }

    function flirtPrankMenu() {
        const targets = activePartyTargets();
        const options = targets.slice(0, 5).map(target => ({
            label: `Impersonate ${target.name} and flirt with someone.`,
            action: () => {
                if (!disguiseAs(mirabel(), target)) return;
                show(
                    `Mirabel slips into ${target.name}’s appearance and gives you a look that is unmistakably Mirabel’s despite the borrowed face. “Now imagine I walk into camp and start flirting with everyone in their voice.”`,
                    [
                        { label: '“You absolutely would.”', action: () => show('“Obviously. The important question is whether I can keep a straight face.”', [{ label: 'You cannot.', action: () => {} }]) },
                        { label: '“Please do not start a diplomatic incident.”', action: () => {} },
                    ]
                );
            },
        }));
        options.push({ label: 'Back.', action: () => openDisguiseMenu() });
        return show('“There is a particular joy,” Mirabel says, “in saying something outrageous while wearing somebody else’s face.”', options);
    }

    function romanticRoleplayMenu() {
        const m = mirabel();
        if (!m || !inRelationship()) return false;
        const both = playerHasSpell() && hasSpell(m);
        const targets = activePartyTargets().filter(x => x.name !== MIRABEL_NAME);

        const options = [];
        options.push({
            label: '“You could pretend to be someone we both know.”',
            action: () => {
                const choices = targets.slice(0, 5).map(target => ({
                    label: `Mirabel as ${target.name}`,
                    action: () => {
                        if (!disguiseAs(m, target)) return;
                        show(
                            `Mirabel takes ${target.name}’s appearance, then looks back at you with her own mischievous smile. “All right. For tonight, I am someone else. The rest can stay between us.”`,
                            [
                                { label: '“That is exactly the point.”', action: () => {} },
                                { label: '“You are enjoying the experiment.”', action: () => show('“I am a wizard. Of course I am.”', [{ label: 'Fair.', action: () => {} }]) },
                            ]
                        );
                    },
                }));
                choices.push({ label: 'Back.', action: () => romanticRoleplayMenu() });
                show('“Someone we both know,” Mirabel says. “Someone neither of us has to explain. A little theatre, a little trust, and no need to take the disguise seriously.”', choices);
            },
        });
        options.push({
            label: '“You could impersonate me.”',
            action: () => {
                if (!disguiseAs(m, protagonist())) return;
                show('Mirabel becomes you and studies your expression. “Interesting. I think I have finally discovered how you manage to look so unbearably confident.”', [
                    { label: '“And?”', action: () => show('“I am not telling you. I intend to use the advantage.”', [{ label: 'Naturally.', action: () => {} }]) },
                ]);
            },
        });
        if (both) {
            options.push({
                label: '“Or I could impersonate you.”',
                action: () => {
                    if (!disguiseAs(protagonist(), m)) return;
                    show('Mirabel goes quiet for a beat, then laughs. “Oh. That is much more interesting when it is you wearing my face.”', [
                        { label: '“You suggested it.”', action: () => show('“I know. I am delighted by my own terrible ideas.”', [{ label: 'As you should be.', action: () => {} }]) },
                    ]);
                },
            });
            options.push({
                label: '“We could both choose someone else.”',
                action: () => show('Mirabel’s grin turns wicked. “Now that is a proper experiment. Two people, two disguises, one very private game of mistaken identity.”', [
                    { label: '“Strictly private.”', action: () => {} },
                ]),
            });
        }
        options.push({ label: '“Maybe another time.”', action: () => {} });
        return show('Mirabel lowers her voice. “If we are going to play with identity, we might as well admit that it can be fun when we both know exactly what game we are playing.”', options);
    }

    function openDisguiseMenu() {
        const m = mirabel();
        if (!m || !hasSpell(m)) return false;
        const options = [
            { label: '“Try a prank.”', action: () => prankMenu() },
            { label: '“Flirt while disguised as someone else.”', action: () => flirtPrankMenu() },
        ];
        if (inRelationship()) {
            options.push({ label: '“What about using it for private role-play?”', action: () => romanticRoleplayMenu() });
        }
        options.push({
            label: '“Drop the disguise.”',
            action: () => {
                clearDisguise(m);
                show('Mirabel lets her borrowed appearance fall away. “Back to being myself. For now.”', [{ label: 'Probably wise.', action: () => {} }]);
            },
        });
        options.push({ label: 'Never mind.', action: () => {} });
        return show('“Disguise Self,” Mirabel says. “A spell for infiltration, impersonation, and — if one has imagination — vastly more interesting experiments.”', options);
    }

    function install() {
        const trees = window.npcDialogueTrees;
        if (!trees || typeof window.showDialogue !== 'function') return false;
        const m = mirabel();
        if (!m || !hasSpell(m)) return false;

        const existing = trees[PERSONAL_DIALOGUE_ID];
        if (existing?.__mirabelDisguiseSelf) return true;

        const tree = function(npc) {
            const companion = mirabel() || npc;
            const options = [];
            if (hasSpell(companion)) {
                options.push({ label: 'About Disguise Self…', action: () => openDisguiseMenu() });
            }
            if (typeof existing === 'function') {
                options.push({ label: 'Other business.', action: () => existing.call(this, npc) });
            } else {
                options.push({ label: 'Never mind.', action: () => {} });
            }
            window.showDialogue(companion, '“Mm? You have my attention. Most of it.”', options);
        };
        tree.__mirabelDisguiseSelf = true;
        tree.__previousMirabelDialogue = existing;
        trees[PERSONAL_DIALOGUE_ID] = tree;
        m.dialogueId = PERSONAL_DIALOGUE_ID;
        return true;
    }

    function refresh() {
        install();
    }

    window.mirabelDisguiseSelfDialogue = {
        build: BUILD,
        refresh,
        openDisguiseMenu,
        romanticRoleplayMenu,
    };

    refresh();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    }
    setInterval(refresh, 1000);
    window.MIRABEL_DISGUISE_SELF_BUILD = BUILD;
})();
