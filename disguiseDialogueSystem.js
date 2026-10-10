// disguiseDialogueSystem.js
// Dialogue/quest consequences for Disguise Self impersonation.
// The spell is not a mind-control effect: NPCs know it exists, and a face
// alone is evidence, not proof of identity.
(() => {
    'use strict';

    const BUILD = '20261010-disguise-dialogue-risk-v2';
    let rawShowDialogue = null;

    function player() {
        const mainName = window.party?.[0]?.name;
        return (window.entities || []).find(e => e && e.side === 'player' && e.name === mainName)
            || window.player
            || window.party?.[0]
            || null;
    }
    function disguise() { return player()?.disguiseSelf || null; }
    function activeTarget() {
        const d = disguise();
        return d?.targetName ? d : null;
    }

    function targetEntity(d) {
        return window.entities?.find(e => e.alive && e.name === d.targetName) || null;
    }

    function royalGuard(entity) {
        if (!entity) return false;
        if (String(entity.title || '').toLowerCase().includes('royal guard')) return true;
        const d = entity.disguiseSelf;
        return !!(d && /royal guard/i.test(d.targetTitle || ''));
    }

    function royalGuardEscortCount() {
        return (window.party || []).filter(member => {
            if (!member) return false;
            if (royalGuard(member)) return true;
            const d = member.disguiseSelf;
            if (!d) return false;
            const gear = d.visualEquipment || {};
            return !!(
                /royal guard/i.test(d.targetTitle || '') ||
                (d.targetFactionId === 'silverhart_kingdom' &&
                 (gear.heavy_armor || gear.light_armor) &&
                 (gear.sword || gear.spear))
            );
        }).length;
    }

    function importance(d) {
        const title = String(d.targetTitle || '').toLowerCase();
        if (/queen|king|chancellor|commander|high cleric/.test(title)) return 30;
        if (/captain|guildmaster|wizard|ambassador|elder/.test(title)) return 20;
        if (/guard|sergeant|reeve/.test(title)) return 12;
        return 4;
    }

    function suspicionScore(npc, d) {
        let score = 8 + importance(d);
        const npcFaction = npc?.factionId;
        if (d.targetFactionId && npcFaction && d.targetFactionId === npcFaction) score += 16;

        const target = targetEntity(d);
        if (target) {
            score += 45;
            if (target === npc) score += 50;
        }

        const title = String(d.targetTitle || '').toLowerCase();
        const npcTitle = String(npc?.title || '').toLowerCase();

        // A queen wandering into a room alone is exactly the kind of thing
        // court staff have learned not to accept at face value.
        if (/queen|king/.test(title) && !royalGuardEscortCount()) score += 22;
        if (/queen|king/.test(title) && /guard|sergeant|captain|chancellor/.test(npcTitle)) score += 15;

        // Royal Guard escorts make a royal story more plausible, but never
        // make the disguise automatically safe.
        if (royalGuardEscortCount() > 0 && /queen|king|chancellor/.test(title)) {
            score -= Math.min(24, 12 + royalGuardEscortCount() * 6);
        }

        if (d.exposedTo?.[npc.name]) score += 35;
        return Math.max(0, Math.min(95, score));
    }

    function socialBonus(response, npc, d) {
        let bonus = 0;
        const title = String(d.targetTitle || '').toLowerCase();
        if (response === 'authority' && /queen|king|chancellor|commander|captain|guildmaster/.test(title)) bonus += 20;
        if (response === 'escort' && royalGuardEscortCount() > 0) bonus += 25;
        if (response === 'routine' && !/queen|king|chancellor/.test(title)) bonus += 8;
        if (response === 'humble' && /queen|king|chancellor/.test(title)) bonus += 5;
        return bonus;
    }

    function questReaction(kind, npc, d) {
        const targetName = d.targetName;
        const targetFaction = d.targetFactionId;
        (window.questLog || []).filter(q => q.status === 'active').forEach(q => {
            if (q.giver === targetName || q.guardName === targetName || q.factionId === targetFaction) {
                q.disguiseInteraction = q.disguiseInteraction || [];
                q.disguiseInteraction.push({
                    kind,
                    target: targetName,
                    npc: npc?.name || null,
                    at: window.worldSeconds || 0
                });
                if (kind === 'discovered') q.disguiseCompromised = true;
                if (kind === 'authority_success') q.disguiseAuthorityUsed = true;
            }
        });

        const mission = window.activeStealthMission;
        if (kind === 'discovered' && mission && targetFaction && mission.factionSpiedOn === targetFaction) {
            window.failStealthMission?.(npc.name + ' realised the identity you were impersonating was false.');
        }

        if (kind === 'authority_success' && mission && targetFaction && mission.factionSpiedOn === targetFaction) {
            mission.disguiseAuthorityUsed = true;
            const guard = window.entities?.find(e => e.name === mission.guardName && e.alive);
            if (guard) guard.bribed = true;
            window.showMessage('Your borrowed authority is enough to make the guard stand aside — for now.');
        }
    }

    function markPassed(npc, d) {
        d.dialogueChecks = d.dialogueChecks || {};
        d.dialogueChecks[npc.name] = { passed: true, at: window.worldSeconds || 0 };
    }

    function markDiscovered(npc, d) {
        d.exposedTo = d.exposedTo || {};
        d.exposedTo[npc.name] = true;
        questReaction('discovered', npc, d);
    }

    function challenge(npc, originalArgs, score) {
        const d = activeTarget();
        if (!d) return false;

        const title = d.targetTitle || d.targetName;
        const escortCount = royalGuardEscortCount();
        const target = targetEntity(d);
        const actualTargetHere = !!target;

        const options = [
            { label: 'Answer confidently.', action: () => resolveAttempt('routine') },
            { label: "Invoke " + title + "'s authority.", action: () => resolveAttempt('authority') }
        ];

        if (escortCount > 0) {
            options.push({
                label: 'Let your Royal Guard escort answer for you.',
                action: () => resolveAttempt('escort')
            });
        }

        options.push({
            label: 'Drop the disguise and explain.',
            action: () => {
                markDiscovered(npc, d);
                window.disguiseSelfSystem?.clear?.(player());
                rawShowDialogue?.(npc,
                    "The disguise falls away. " + npc.name + "'s expression hardens. \"So it really was Disguise Self.\"",
                    [
                        { label: '"I was trying to get through without hurting anyone."', action: () => {} },
                        { label: '"I should have been honest."', action: () => {} }
                    ]);
            }
        });

        rawShowDialogue?.(npc,
            actualTargetHere
                ? 'Something is very wrong. ' + d.targetName + ' is here — and so are you wearing their face.'
                : '"You look exactly like ' + d.targetName + '." ' + npc.name + ' studies you carefully. "That proves remarkably little. Disguise Self is real, and I know it when I see it."',
            options);

        function resolveAttempt(response) {
            const bonus = socialBonus(response, npc, d);
            const roll = Math.floor(Math.random() * 100) + 1;
            const effective = Math.max(5, Math.min(95, 100 - score + bonus));
            const success = !actualTargetHere && roll <= effective;

            if (success) {
                markPassed(npc, d);
                rawShowDialogue?.(npc,
                    response === 'escort'
                        ? 'The guard beside you gives a crisp nod. ' + npc.name + ' relaxes — the whole scene suddenly makes more sense.'
                        : 'For a long moment ' + npc.name + ' watches you. Then the suspicion eases. "Very well. If you are ' + d.targetName + ', you have business here."',
                    originalArgs[2] || [{ label: 'Continue.', action: () => {} }]
                );
                return;
            }

            markDiscovered(npc, d);
            const escortText = royalGuardEscortCount()
                ? 'Your guards make the moment more convincing, but not convincing enough.'
                : 'Without an escort, there is nowhere for the story to hide.';
            rawShowDialogue?.(npc,
                    "The answer lands badly. " + npc.name + "'s hand moves toward their weapon. " + escortText,
                [
                    {
                        label: 'Keep bluffing.',
                        action: () => {
                            const secondRoll = Math.floor(Math.random() * 100) + 1;
                            if (secondRoll <= 35 + bonus) {
                                questReaction('authority_success', npc, d);
                                rawShowDialogue?.(npc, 'The hesitation is enough. "All right. Go on — but I will be watching you."', originalArgs[2] || []);
                            } else {
                                rawShowDialogue?.(npc, '"You are not who you claim to be. Guards!"', [{ label: 'Retreat.', action: () => {} }]);
                            }
                        }
                    },
                    {
                        label: 'Drop the disguise.',
                        action: () => {
                            window.disguiseSelfSystem?.clear?.(player());
                            rawShowDialogue?.(npc, '"At least you had the sense to stop before this became a fight."', originalArgs[2] || []);
                        }
                    }
                ]);
            }
        }
        return true;

    function maybeChallenge(npc, args) {
        const d = activeTarget();
        if (!d || !npc || !npc.name) return false;
        if (d.dialogueChecks?.[npc.name]?.passed) return false;
        if (d.exposedTo?.[npc.name]) return false;

        const score = suspicionScore(npc, d);
        const target = targetEntity(d);

        if (target === npc) return challenge(npc, args, 100);

        if (Math.random() * 100 < score) return challenge(npc, args, score);
        markPassed(npc, d);
        return false;
    }

    function install() {
        if (window.__disguiseDialogueRiskInstalled || typeof window.showDialogue !== 'function') return;
        const original = window.showDialogue;
        // Keep a reference to the real dialogue renderer before wrapping it.
        // Challenge/response branches must bypass this wrapper to avoid recursively
        // challenging the same NPC, but still need to display their dialogue.
        rawShowDialogue = original.bind(window);

        window.showDialogue = function(npc, message, options) {
            const d = activeTarget();

            if (d && maybeChallenge(npc, [npc, message, options])) return;

            if (d && npc && Array.isArray(options)) {
                const score = suspicionScore(npc, d);
                const title = String(d.targetTitle || '').toLowerCase();
                if (!d.exposedTo?.[npc.name] &&
                    /queen|king|chancellor|commander|captain|guildmaster|guard/.test(title) &&
                    d.dialogueChecks?.[npc.name]?.passed &&
                    !options.some(o => o?.__disguiseAuthority)) {
                    options = options.concat([{
                        __disguiseAuthority: true,
                        label: 'Use ' + d.targetName + "'s authority.",
                        action: () => {
                            const roll = Math.floor(Math.random() * 100) + 1;
                            const chance = Math.max(15, Math.min(90, 65 + (100 - score) / 3 + royalGuardEscortCount() * 5));
                            if (roll <= chance) {
                                questReaction('authority_success', npc, d);
                                rawShowDialogue?.(npc, "You invoke " + d.targetName + "'s authority. " + npc.name + " reluctantly steps aside.", [
                                    { label: 'Proceed.', action: () => {} }
                                ]);
                            } else {
                                markDiscovered(npc, d);
                                rawShowDialogue?.(npc, 'The authority play goes too far. ' + npc.name + ' starts asking questions you cannot safely answer.', [
                                    { label: 'Back away.', action: () => {} }
                                ]);
                            }
                        }
                    }]);
                }
            }

            return original.call(this, npc, message, options);
        };

        window.__disguiseDialogueRiskInstalled = true;
    }

    window.disguiseDialogueSystem = {
        BUILD,
        suspicionScore,
        royalGuardEscortCount,
        maybeChallenge,
        install
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', install, { once: true });
        } else {
            setTimeout(install, 0);
        }
    }
})();
