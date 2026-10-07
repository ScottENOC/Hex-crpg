// Mirabel's Disguise Self flavour and private role-play menu.
// Dialogue ownership stays in campaign2Dialogue.js; this module only supplies
// the reusable actions so it cannot replace or wrap the game's dialogue engine.
(() => {
    'use strict';

    const BUILD = '20261008-mirabel-disguise-self-v2';

    function party() { return Array.isArray(window.party) ? window.party : []; }
    function player() { return party()[0] || window.player || null; }
    function mirabel() { return party().find((p, i) => i > 0 && p?.name === 'Mirabel Quill') || null; }

    function knowsSpell(entity) {
        return !!(entity?.skills?.learn_disguise_self ||
            entity?.skills?.disguise_self ||
            window.hasSpellUnlocked?.(entity, 'disguise_self'));
    }

    function appearanceOf(target) {
        const a = target?.appearance || {};
        return {
            gender: target?.gender || a.gender || 'female',
            bodyType: target?.bodyType || a.bodyType || 'average',
            hairStyle: target?.hairStyle || a.hairStyle || 'brown_1',
            hairHue: Number(target?.hairHue ?? a.hairHue ?? 25),
            hairSaturation: Number(target?.hairSaturation ?? a.hairSaturation ?? 70),
            hairValue: Number(target?.hairValue ?? a.hairValue ?? 55),
            skinToneSlider: Number(target?.skinToneSlider ?? a.skinToneSlider ?? 45)
        };
    }

    function castAppearance(caster, target) {
        if (!caster || !target || typeof window.tryCastSpell !== 'function') return false;
        const spell = {
            name: 'Disguise Self',
            baseId: 'disguise_self',
            type: 'buff',
            manaCost: 8,
            coreManaCost: 8,
            tpCost: 10,
            range: 1,
            disguiseProfile: { appearance: appearanceOf(target) }
        };
        return window.tryCastSpell(caster, spell, caster, caster.hex, true);
    }

    function as(target) {
        const m = mirabel();
        if (!m || !target) return false;
        return castAppearance(m, target);
    }

    function clearEntity(entity) {
        if (!entity) return false;
        const active = (window.activeSpells || []).find(s =>
            s.baseId === 'disguise_self' && s.targetEntityId === entity.id
        );
        if (active && typeof window.cancelSpell === 'function') {
            window.cancelSpell(active.spellInstanceId);
            return true;
        }
        return !!window.disguiseSelfSystem?.clear?.(entity);
    }

    function clear() {
        return clearEntity(mirabel());
    }

    function relationshipState() {
        const m = mirabel();
        return m ? window.getCompanionRomanceState?.(m) : null;
    }

    function isRomantic() {
        const state = relationshipState();
        return ['dating', 'committed', 'strained'].includes(state?.agreement?.state);
    }

    function partyTargets() {
        return party().filter((p, i) => i > 0 && p?.name !== 'Mirabel Quill');
    }

    function show(text, options) {
        const m = mirabel();
        if (!m || typeof window.showDialogue !== 'function') return false;
        window.showDialogue(m, text, options);
        return true;
    }

    function prankMenu() {
        const targets = partyTargets();
        const options = targets.map(target => ({
            label: `“I want to be ${target.name}.”`,
            action: () => {
                as(target);
                show(
                    `Mirabel becomes ${target.name}, looks down at herself, and immediately adopts a wildly exaggerated version of their mannerisms. “Perfect. I am going to be unbearable.”`,
                    [
                        { label: '“Please do not cause a diplomatic incident.”', action: () => {} },
                        { label: '“Go on, then.”', action: () => show('“Finally, someone who respects scholarship.”', [{ label: 'Right.', action: () => {} }]) }
                    ]
                );
            }
        }));
        options.push({
            label: '“Be me.”',
            action: () => {
                as(player());
                show('Mirabel takes your appearance and gives you an exaggeratedly serious stare. “Oh. I see why everyone keeps asking you to make decisions.”', [
                    { label: '“You are enjoying this.”', action: () => show('“Immensely.”', [{ label: 'I can tell.', action: () => {} }]) }
                ]);
            }
        });
        options.push({ label: 'Back.', action: () => openDisguiseMenu() });
        return show('“Choose a victim,” Mirabel says brightly. “I mean subject. A very important distinction.”', options);
    }

    function flirtMenu() {
        const targets = partyTargets();
        const options = targets.map(target => ({
            label: `Pretend to be ${target.name}.`,
            action: () => {
                as(target);
                show(
                    `Wearing ${target.name}'s face, Mirabel gives you an unmistakably Mirabel-ish smile. “Imagine I walk into camp like this and start flirting with people in their voice.”`,
                    [
                        { label: '“You would.”', action: () => show('“Of course I would. The experiment practically conducts itself.”', [{ label: 'Naturally.', action: () => {} }]) },
                        { label: '“You are a menace.”', action: () => {} }
                    ]
                );
            }
        }));
        options.push({ label: 'Back.', action: () => openDisguiseMenu() });
        return show('“There is a particular joy in saying something outrageous while wearing somebody else’s face.”', options);
    }

    function privateRoleplayMenu() {
        if (!isRomantic()) return false;
        const m = mirabel();
        const p = player();
        const both = knowsSpell(m) && knowsSpell(p);
        const targets = partyTargets();
        const options = [
            {
                label: '“You could impersonate someone we both know.”',
                action: () => {
                    const choices = targets.map(target => ({
                        label: `Mirabel as ${target.name}`,
                        action: () => {
                            as(target);
                            show(`Mirabel takes ${target.name}'s appearance, then smiles in a way only Mirabel could. “All right. The rest stays between us.”`, [
                                { label: '“That is the idea.”', action: () => {} }
                            ]);
                        }
                    }));
                    choices.push({ label: 'Back.', action: () => privateRoleplayMenu() });
                    show('“A little theatre, a little trust,” Mirabel says. “No pretending that the disguise changes who we are.”', choices);
                }
            },
            {
                label: '“You could impersonate me.”',
                action: () => {
                    as(p);
                    show('Mirabel becomes you and studies her borrowed expression. “Interesting. I understand your face considerably better than I expected.”', [
                        { label: '“And?”', action: () => show('“I am keeping my conclusions to myself.”', [{ label: 'Fair.', action: () => {} }]) }
                    ]);
                }
            }
        ];
        if (both) {
            options.push({
                label: '“I could impersonate you.”',
                action: () => {
                    castAppearance(p, m);
                    show('Mirabel stares at you wearing her face, then bursts out laughing. “Oh. That is much more interesting when you do it.”', [
                        { label: '“You suggested it.”', action: () => show('“I know. I am delighted with myself.”', [{ label: 'As usual.', action: () => {} }]) }
                    ]);
                }
            });
            options.push({
                label: '“We could both choose someone else.”',
                action: () => show('Mirabel grins. “Two disguises, two borrowed identities, and one very private game of mistaken identity. Now that is an experiment.”', [
                    { label: '“Private.”', action: () => {} }
                ])
            });
        }
        options.push({ label: 'Back.', action: () => openDisguiseMenu() });
        return show('Mirabel lowers her voice. “If we are going to play with identity, we might as well admit that it can be fun when we both know exactly what game we are playing.”', options);
    }

    function openDisguiseMenu() {
        if (!mirabel() || !knowsSpell(mirabel())) return false;
        const options = [
            { label: '“Try a prank.”', action: () => prankMenu() },
            { label: '“Flirt while disguised as someone else.”', action: () => flirtMenu() }
        ];
        if (isRomantic()) options.push({ label: '“What about private role-play?”', action: () => privateRoleplayMenu() });
        options.push({ label: '“Drop the disguise.”', action: () => { clear(); show('Mirabel lets the borrowed appearance fall away. “Back to being myself. For now.”', [{ label: 'Probably wise.', action: () => {} }]); } });
        options.push({ label: 'Never mind.', action: () => {} });
        return show('“Disguise Self,” Mirabel says. “A spell for infiltration, impersonation, and vastly more interesting experiments.”', options);
    }

    window.mirabelDisguiseSelfDialogue = { build: BUILD, openDisguiseMenu, privateRoleplayMenu };
    window.MIRABEL_DISGUISE_SELF_BUILD = BUILD;
})();
