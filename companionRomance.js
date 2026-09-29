// companionRomance.js
// Turns affinity numbers into authored relationship meaning without treating
// meters as consent. Sex, romance, commitment and exclusivity are separate.
(() => {
    'use strict';

    const BUILD = '20260929-companion-romance-v1';
    const party = () => Array.isArray(window.party) ? window.party : [];
    const companionByName = name => party().find((member, index) => index > 0 && member?.name === name) || null;

    const VOICE_LINES = Object.freeze({
        'Wren Talbot': Object.freeze({
            love_desire_conflict: '“I know what I feel for you. Knowing what to do with it is the difficult part.”',
            close_friend: '“You’re stuck with me. Friendship has its hazards.”',
            romantic: '“I’m here because I choose you. Don’t make me regret saying that out loud.”',
        }),
        'Ser Aldric Thorne': Object.freeze({
            restrained_attraction: '“Finding someone attractive is not the same thing as making them a promise. I try not to confuse the two.”',
            close_friend: '“I trust you at my back. That is not a small thing to me.”',
            romantic: '“If I give you my heart, I mean to do it honestly and without keeping another in reserve.”',
        }),
        'Fenn Oakheart': Object.freeze({
            casual_hookup: '“We can enjoy a night without asking it to become a lifetime.”',
            friends_with_benefits: '“We’re friends, we want each other, and nobody needs to pretend that makes the friendship less real.”',
            romantic: '“Love doesn’t become smaller because it isn’t fenced in.”',
            close_friend: '“You’re easy company. I mean that as a much bigger compliment than it sounds.”',
        }),
        'Reyna Fletcher': Object.freeze({
            casual_hookup: '“One night doesn’t have to become a ballad. Sometimes it can just be a very good night.”',
            friends_with_benefits: '“We’re friends. We fancy each other. I don’t see why either fact needs to make the other complicated.”',
            romantic: '“I’m serious about you. Serious doesn’t mean I own you.”',
            close_friend: '“You’re one of the few people I’d choose beside me when the arrows start flying.”',
        }),
        'Mirabel Quill': Object.freeze({
            casual_hookup: '“Desire is simple. It’s all the things people decide it has to mean afterwards that get tedious.”',
            friends_with_benefits: '“I can stay for this without promising forever. Apparently I’m learning.”',
            romantic: '“I always thought leaving was the easy part. You’ve made staying considerably more dangerous.”',
            close_friend: '“I keep telling myself I travel light. You’re becoming inconvenient evidence to the contrary.”',
        }),
        'Brother Alden': Object.freeze({
            asexual_romance: '“I don’t desire you sexually. I do choose you. Neither statement makes the other less true.”',
            close_friend: '“Peace is easier around some people. I’ve noticed it is easier around you.”',
            romantic: '“What I want is closeness, constancy, and a life shared honestly. I have never needed desire to know love.”',
        }),
    });

    function profileFor(companionOrName) {
        return window.companionAffinity?.profileFor?.(companionOrName) || null;
    }

    function affinityFor(companionOrName) {
        return window.getCompanionAffinity?.(companionOrName) || null;
    }

    function relationshipFor(companionOrName) {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        return companion && typeof window.getCompanionRelationship === 'function'
            ? window.getCompanionRelationship(companion)
            : null;
    }

    function ensureAgreement(companionOrName) {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        const profile = profileFor(companion);
        if (!companion || !profile) return null;
        window.companionAffinity?.ensureAffinity?.(companion);
        const existing = companion.playerAffinity?.agreement || {};
        const style = profile.relationshipStyle || {};
        companion.playerAffinity.agreement = {
            state: existing.state || 'none',
            romanticExclusivity: existing.romanticExclusivity || style.romanticExclusivity || 'unspoken',
            sexualExclusivity: existing.sexualExclusivity || style.sexualExclusivity || 'unspoken',
            groupRelationships: existing.groupRelationships ?? !!style.groupRelationships,
            establishedWorldSeconds: Number(existing.establishedWorldSeconds || 0),
            breaches: Array.isArray(existing.breaches) ? existing.breaches : [],
            reconciliationUsed: !!existing.reconciliationUsed,
        };
        return companion.playerAffinity.agreement;
    }

    function setAgreement(companionOrName, updates = {}) {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        const agreement = ensureAgreement(companion);
        if (!companion || !agreement) return null;
        Object.assign(agreement, updates);
        if (updates.state && updates.state !== 'none' && !agreement.establishedWorldSeconds) {
            agreement.establishedWorldSeconds = Number(window.worldSeconds || 0);
        }
        return { ...agreement };
    }

    function commitRelationship(companionOrName, state = 'committed') {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        const profile = profileFor(companion);
        if (!companion || !profile) return null;
        const style = profile.relationshipStyle || {};
        setAgreement(companion, {
            state,
            romanticExclusivity: style.romanticExclusivity || 'unspoken',
            sexualExclusivity: style.sexualExclusivity || 'unspoken',
            groupRelationships: !!style.groupRelationships,
        });
        window.companionAffinity?.setRomanceState?.(companion, state, `relationship ${state}`);
        return getRelationshipState(companion);
    }

    function interpretRelationship(companionOrName) {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        const profile = profileFor(companion);
        const affinity = affinityFor(companion);
        const rel = relationshipFor(companion) || {};
        if (!companion || !profile || !affinity) return null;

        const f = Number(affinity.friendship || 0);
        const r = Number(affinity.romanticBond || 0);
        const a = Number(affinity.attraction || 0);
        const style = profile.relationshipStyle || {};
        let mode = 'early';

        if (companion.name === 'Brother Alden' && r >= 55 && f >= 50) {
            mode = 'asexual_romance';
        } else if (companion.name === 'Wren Talbot' && affinity.presentation === 'feminine' && r >= 60 && a <= 30 && f >= 60) {
            mode = 'love_desire_conflict';
        } else if (companion.name === 'Ser Aldric Thorne' && a >= 50 && r < 30) {
            mode = 'restrained_attraction';
        } else if (r >= 60 && f >= 50) {
            mode = 'romantic';
        } else if (a >= 60 && r < 25 && f < 45 && style.casualSex) {
            mode = 'casual_hookup';
        } else if (a >= 50 && r < 35 && f >= 55 && style.friendsWithBenefits) {
            mode = 'friends_with_benefits';
        } else if (f >= 65 && r < 40) {
            mode = 'close_friend';
        } else if (r >= 35 && a <= 30) {
            mode = 'romantic_low_desire';
        } else if (a >= 40) {
            mode = 'attracted';
        }

        return {
            companion: companion.name,
            mode,
            friendship: f,
            romanticBond: r,
            attraction: a,
            trust: Number(rel.trust || 0),
            familiarity: Number(rel.familiarity || 0),
            style,
            line: VOICE_LINES[companion.name]?.[mode] || null,
        };
    }

    function getRelationshipState(companionOrName) {
        const companion = typeof companionOrName === 'string' ? companionByName(companionOrName) : companionOrName;
        if (!companion) return null;
        return {
            affinity: affinityFor(companion),
            agreement: ensureAgreement(companion),
            interpretation: interpretRelationship(companion),
        };
    }

    function applyRelationshipPenalty(companion, affinityDelta, trustDelta, reason) {
        if (affinityDelta && typeof window.adjustCompanionAffinity === 'function') {
            window.adjustCompanionAffinity(companion, affinityDelta, reason);
        }
        if (trustDelta && typeof window.adjustCompanionRelationship === 'function') {
            window.adjustCompanionRelationship(companion, { trust: trustDelta }, reason);
        }
    }

    function recordOutsideConnection(partnerOrName, otherName, kind, { disclosed = true } = {}) {
        const companion = typeof partnerOrName === 'string' ? companionByName(partnerOrName) : partnerOrName;
        const profile = profileFor(companion);
        const agreement = ensureAgreement(companion);
        if (!companion || !profile || !agreement) return null;

        const active = ['dating', 'committed', 'strained'].includes(agreement.state);
        const romanticViolation = active && kind === 'romance' && agreement.romanticExclusivity === 'exclusive';
        const sexualViolation = active && kind === 'sex' && agreement.sexualExclusivity === 'exclusive';
        const cnmDeception = active && !disclosed && (agreement.romanticExclusivity === 'open' || agreement.sexualExclusivity === 'open');
        const breach = romanticViolation || sexualViolation || cnmDeception;

        const event = {
            otherName: String(otherName || 'someone else'), kind: String(kind || 'unknown'),
            disclosed: !!disclosed, breach, worldSeconds: Number(window.worldSeconds || 0),
        };
        if (!breach) return { allowed: true, breach: false, agreement: { ...agreement }, event };

        agreement.breaches.push(event);
        const response = profile.relationshipStyle?.breachResponse;
        const reason = cnmDeception
            ? `hid another ${kind} connection from ${companion.name}`
            : `broke ${companion.name}’s ${kind === 'sex' ? 'sexual' : 'romantic'} exclusivity agreement`;

        if (response === 'cnm') {
            agreement.state = 'strained';
            applyRelationshipPenalty(companion, { friendship: -6, romanticBond: -3 }, -8, reason);
        } else if (response === 'aldric') {
            agreement.state = 'ended';
            window.companionAffinity?.setRomanceState?.(companion, 'ended_breach', reason);
            applyRelationshipPenalty(companion, { friendship: -10, romanticBond: -15 }, -20, reason);
        } else if (response === 'alden') {
            // Alden explicitly permits a committed partner to seek sex elsewhere;
            // only a second romantic commitment violates what he asked for.
            agreement.state = 'ended';
            window.companionAffinity?.setRomanceState?.(companion, 'ended_breach', reason);
            applyRelationshipPenalty(companion, { friendship: -8, romanticBond: -12 }, -18, reason);
        } else if (response === 'wren') {
            const security = Number(companion.characterArc?.security || 0);
            if (security >= 35) {
                agreement.state = 'ended';
                window.companionAffinity?.setRomanceState?.(companion, 'ended_breach', reason);
                applyRelationshipPenalty(companion, { friendship: -10, romanticBond: -10 }, -22, reason);
            } else {
                // Fear-bound Wren stays even when staying is making her unhappy.
                // Later character development can give her the security to end it.
                agreement.state = 'strained';
                window.companionAffinity?.setRomanceState?.(companion, 'strained_breach', reason);
                applyRelationshipPenalty(companion, { friendship: -10, romanticBond: -8 }, -25, reason);
            }
        }

        return { allowed: false, breach: true, agreement: { ...agreement }, event };
    }

    function wrenConflictState() {
        const wren = companionByName('Wren Talbot');
        const affinity = affinityFor(wren);
        const rel = relationshipFor(wren) || {};
        if (!wren || !affinity) return null;
        const security = Number(wren.characterArc?.security || 0);
        const active = affinity.presentation === 'feminine'
            && affinity.friendship >= 60
            && affinity.romanticBond >= 60
            && Number(rel.familiarity || 0) >= 45
            && Number(rel.trust || 0) >= 35;
        return {
            active,
            security,
            attachment: security >= 35 ? 'secure' : security <= -20 ? 'fear_bound' : 'guarded',
            attraction: affinity.attraction,
            romanticBond: affinity.romanticBond,
            friendship: affinity.friendship,
            attractionBand: window.companionAffinity?.attractionBand?.(affinity.attraction) || 'unknown',
        };
    }

    function endWrenMismatchRomance(wren, secure) {
        setAgreement(wren, { state: 'ended' });
        window.companionAffinity?.setRomanceState?.(wren, 'ended_mismatch', 'accepted that love and compatibility were not the same thing');
        if (secure) {
            window.showDialogue(wren,
                'Wren closes her eyes for a moment, then nods. “That hurts. But you’re right to say it instead of asking either of us to become someone else. I’ll still be here. Just... let me be sad about it for a while.”',
                [{ label: 'I’m not going anywhere.', action: () => {} }]);
        } else {
            window.showDialogue(wren,
                'Wren looks like she wants to argue, then swallows it. “I hate this. But I don’t want love to become something either of us has to perform.”',
                [{ label: 'Neither do I.', action: () => {} }]);
        }
    }

    function openWrenConflictConversation() {
        const wren = companionByName('Wren Talbot');
        const state = wrenConflictState();
        if (!wren || !state?.active || typeof window.showDialogue !== 'function') return false;

        const attractionPhrase = state.attraction > 0
            ? 'And I am attracted to you — some. I notice you. I want to be close to you.'
            : 'But the physical part simply isn’t there for me, and I don’t want to lie about that.';
        const text = `Wren takes longer than usual to speak. “I know I love you. That’s the bit I’m not confused about. ${attractionPhrase} But I’ve wanted men before, and this isn’t the same kind of wanting. I don’t know whether what I can give is enough for you, and I’m not going to promise I’ll wake up tomorrow wanting something I don’t.”`;

        window.showDialogue(wren, text, [
            {
                label: '“What you feel is enough for me. I want this if you do.”',
                action: () => {
                    commitRelationship(wren, 'committed');
                    wren.playerAffinity.physicalBoundary = 'mutual_slow';
                    window.showDialogue(wren,
                        'Her shoulders loosen. “Then yes. I want us. I just need us to be honest about what ‘us’ actually is, instead of chasing somebody else’s version of it.”',
                        [{ label: 'We can do that.', action: () => {} }]);
                },
            },
            {
                label: '“I need a partner who wants me in the same way.”',
                action: () => {
                    if (state.attachment === 'secure') {
                        endWrenMismatchRomance(wren, true);
                        return;
                    }
                    setAgreement(wren, { state: 'strained' });
                    window.companionAffinity?.setRomanceState?.(wren, 'strained_mismatch', 'afraid that limited attraction would cost the relationship');
                    window.showDialogue(wren,
                        'Wren’s answer comes too quickly. “I can try harder. I can make it work.” Then she hears herself and looks away. “Gods. That sounded wrong, didn’t it?”',
                        [
                            { label: '“You shouldn’t have to prove desire. We should stop before we hurt each other.”', action: () => endWrenMismatchRomance(wren, false) },
                            { label: '“We don’t have to decide tonight.”', action: () => { window.companionAffinity?.setRomanceState?.(wren, 'uncertain_mismatch', 'left the question open without demanding an answer'); } },
                        ]);
                },
            },
            {
                label: '“We don’t have to solve this tonight.”',
                action: () => {
                    window.companionAffinity?.setRomanceState?.(wren, 'uncertain_mismatch', 'gave Wren time to understand love and desire separately');
                    window.showDialogue(wren,
                        '“Thank you.” Wren exhales. “For once, I’d like to let a difficult thing be difficult without immediately wrestling it to the ground.”',
                        [{ label: 'Take your time.', action: () => {} }]);
                },
            },
        ]);
        return true;
    }

    function chainHas(fn, flag) {
        let current = fn;
        for (let i = 0; i < 12 && typeof current === 'function'; i++) {
            if (current[flag]) return true;
            current = current.__baseShowDialogue;
        }
        return false;
    }

    function installDialogueHook() {
        if (typeof window.showDialogue !== 'function' || chainHas(window.showDialogue, '__companionRomanceAware')) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            let nextOptions = options;
            const rootWrenTalk = npc?.name === 'Wren Talbot'
                && Array.isArray(options)
                && (text === "What's on your mind?" || /Go on\. I’m listening|Go on\. I'm listening/.test(String(text)));
            if (rootWrenTalk && wrenConflictState()?.active) {
                const labels = new Set(options.map(option => option?.label));
                if (!labels.has('Can we talk about us?')) {
                    nextOptions = [...options, { label: 'Can we talk about us?', action: () => openWrenConflictConversation() }];
                }
            }
            const args = Array.from(arguments);
            if (args.length >= 3 || nextOptions !== undefined) args[2] = nextOptions;
            return base.apply(this, args);
        };
        wrapped.__companionRomanceAware = true;
        ['__relationshipProgressionAware', '__wrenParentsInvestigationAware', '__wrenCharacterArcAware'].forEach(flag => {
            if (chainHas(base, flag)) wrapped[flag] = true;
        });
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function ensureAll() {
        party().slice(1).forEach(companion => {
            if (profileFor(companion)) ensureAgreement(companion);
        });
        installDialogueHook();
    }

    window.companionRomance = {
        build: BUILD,
        voiceLines: VOICE_LINES,
        ensureAgreement,
        setAgreement,
        commitRelationship,
        interpretRelationship,
        getRelationshipState,
        recordOutsideConnection,
        wrenConflictState,
        openWrenConflictConversation,
        refresh: ensureAll,
    };
    window.getCompanionRomanceState = getRelationshipState;
    window.recordCompanionOutsideConnection = recordOutsideConnection;

    ensureAll();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureAll, { once: true });
    setInterval(ensureAll, 1000);
    window.COMPANION_ROMANCE_BUILD = BUILD;
})();