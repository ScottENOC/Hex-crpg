// wrenCharacterArc.js
// Long-horizon character development for Wren Talbot and the Campaign 2 player.
//
// Relationship answers "how are we with each other?" (approval/trust/familiarity).
// This module answers two different questions:
//   1. What values is the PLAYER demonstrating through repeated choices?
//   2. What kind of person is WREN becoming while travelling with them?
//
// Wren never simply copies the protagonist. Trust + familiarity determine how
// much their example influences her; direct harms to her attachment/security
// still land even when trust is low. This lets a principled, pragmatic, cruel,
// or compassionate protagonist all plausibly end the campaign with Wren still
// beside them, but not with the same Wren or the same relationship.
(() => {
    'use strict';

    const BUILD = '20260929-wren-character-arc-v1';
    const MIN_AXIS = -100;
    const MAX_AXIS = 100;

    // personalLoyalty: -100 = principle/institutions before "our people"
    //                   +100 = personal loyalty before abstract principle
    // mercy:           -100 = ruthless / ends justify means
    //                   +100 = restraint / second chances
    // security:        -100 = fear-bound attachment / expects abandonment
    //                   +100 = secure attachment / loyalty is freely chosen
    const WREN_START = Object.freeze({ personalLoyalty: 20, mercy: 15, security: -20 });
    const PLAYER_START = Object.freeze({ personalLoyalty: 0, mercy: 0 });

    // Existing authored story events already have stable one-shot keys in
    // companionRelationshipProgression.js. We observe those keys and add the
    // slower character-development consequences here rather than duplicating
    // quest resolution hooks.
    const STORY_INFLUENCE = Object.freeze({
        'hollowmere_shakedown:fight': {
            player: { personalLoyalty: 3, mercy: 1 },
            wrenModel: { personalLoyalty: 3, mercy: 1 },
            wrenImpact: { security: 2 },
            reason: 'stood up for people Wren considers her own',
        },
        'hollowmere_shakedown:stay_out': {
            player: { personalLoyalty: -2 },
            wrenModel: { personalLoyalty: 1 },
            wrenImpact: { security: -2 },
            reason: 'stood aside while Wren’s community was threatened',
        },
        'hollowmere_shakedown:encourage_pay': {
            player: { personalLoyalty: -3, mercy: -3 },
            wrenModel: { mercy: -1 },
            wrenImpact: { security: -3 },
            reason: 'backed coercion against people Wren knows',
        },
        'goblin_favour:scout': {
            player: { personalLoyalty: -4, mercy: -2 },
            wrenModel: { mercy: -1 },
            wrenImpact: { security: -4 },
            reason: 'betrayed Hollowmere’s safety for outside advantage',
        },
        'goblin_favour:steal': {
            player: { personalLoyalty: -2, mercy: -2 },
            wrenModel: { mercy: -1 },
            wrenImpact: { security: -2 },
            reason: 'preyed on Wren’s community for a bargain',
        },
        'goblin_favour:raid_mine': {
            player: { personalLoyalty: -4, mercy: -5 },
            wrenModel: { mercy: -2 },
            wrenImpact: { security: -4 },
            reason: 'used violence against neighbouring civilians for plunder',
        },
        'goblin_resolution:assault': {
            player: { personalLoyalty: 2, mercy: -2 },
            wrenModel: { personalLoyalty: 2, mercy: -2 },
            wrenImpact: { security: 2 },
            reason: 'protected Hollowmere through decisive violence',
        },
        'goblin_resolution:stealth_succession': {
            player: { personalLoyalty: 2, mercy: 4 },
            wrenModel: { personalLoyalty: 1, mercy: 4 },
            wrenImpact: { security: 3 },
            reason: 'found a restrained solution that still protected Hollowmere',
        },
        'goblin_resolution:goblin_diplomacy': {
            player: { personalLoyalty: 2, mercy: 5 },
            wrenModel: { mercy: 4 },
            wrenImpact: { security: 2 },
            reason: 'solved a threat without needless bloodshed',
        },
        'goblin_resolution:goblin_alliance': {
            player: { personalLoyalty: -2, mercy: 2 },
            wrenImpact: { security: -2 },
            reason: 'accepted continuing risk to Hollowmere to spare the tribe',
        },
        'goblin_resolution:betrayal': {
            player: { personalLoyalty: -12, mercy: -8 },
            // Wren does not learn "betray people" from being betrayed. The
            // experience instead reinforces her own refusal to abandon people.
            wrenModel: { personalLoyalty: 3, mercy: -2 },
            wrenImpact: { security: -12 },
            reason: 'betrayed Wren’s home despite travelling beside her',
        },
        'parents_search_promise': {
            player: { personalLoyalty: 2, mercy: 1 },
            wrenImpact: { security: 1 },
            reason: 'promised to help with something deeply personal to Wren',
        },
        'parents_search_reached_millbrook': {
            player: { personalLoyalty: 5 },
            wrenModel: { personalLoyalty: 2 },
            wrenImpact: { security: 7 },
            reason: 'remembered and kept a personal promise to Wren',
        },
        'parents_investigation:support': {
            player: { personalLoyalty: 5, mercy: 2 },
            wrenModel: { personalLoyalty: 3, mercy: 2 },
            wrenImpact: { security: 7 },
            reason: 'put Wren’s choice ahead of deciding her grief for her',
        },
        'parents_investigation:restore_names': {
            player: { personalLoyalty: -1, mercy: 3 },
            wrenModel: { personalLoyalty: -2, mercy: 3 },
            wrenImpact: { security: 6 },
            reason: 'answered private grief by restoring a public truth',
        },
        'parents_investigation:closure': {
            player: { mercy: 2 },
            wrenModel: { mercy: 1 },
            wrenImpact: { security: 4 },
            reason: 'helped Wren face the truth without directing what came next',
        },
        'player_became_lich': {
            player: { mercy: -20 },
            // Trust is destroyed by this event before the modelling pass. Wren
            // may harden somewhat, but low trust deliberately prevents her from
            // simply becoming a copy of a dark protagonist.
            wrenModel: { mercy: -8 },
            wrenImpact: { security: -15 },
            reason: 'chose undeath despite what it would do to the people beside them',
        },
    });

    const DIALOGUE_CHOICES = Object.freeze({
        people_do_not_give_up: {
            player: { personalLoyalty: 6, mercy: 2 },
            wrenModel: { personalLoyalty: 6, mercy: 2 },
            wrenImpact: { security: 2 },
            relationship: { approval: 2, trust: 2, familiarity: 1 },
            reason: 'told Wren that people should not give up on each other',
        },
        loyalty_has_limits: {
            player: { personalLoyalty: -5, mercy: 2 },
            wrenModel: { personalLoyalty: -6, mercy: 2 },
            wrenImpact: { security: 5 },
            relationship: { approval: 1, trust: 4, familiarity: 2 },
            reason: 'told Wren that loyalty includes challenging someone who is wrong',
        },
        look_after_our_own: {
            player: { personalLoyalty: 7, mercy: -6 },
            wrenModel: { personalLoyalty: 6, mercy: -5 },
            wrenImpact: { security: -1 },
            relationship: { approval: 1, trust: 1, familiarity: 1 },
            reason: 'told Wren that protecting your own matters more than outsiders',
        },
        you_do_not_owe_me: {
            player: { personalLoyalty: -2, mercy: 5 },
            wrenModel: { personalLoyalty: -3, mercy: 3 },
            wrenImpact: { security: 10 },
            relationship: { approval: 3, trust: 6, familiarity: 3 },
            reason: 'made clear that Wren is free to stay because she chooses to',
        },
        truth_even_when_it_hurts: {
            player: { personalLoyalty: -5, mercy: 1 },
            wrenModel: { personalLoyalty: -5, mercy: 1 },
            wrenImpact: { security: 3 },
            relationship: { trust: 2, familiarity: 2 },
            reason: 'said that truth matters even when loyalty makes it painful',
        },
        hurt_ours_no_second_chance: {
            player: { personalLoyalty: 5, mercy: -8 },
            wrenModel: { personalLoyalty: 5, mercy: -7 },
            relationship: { approval: 1, familiarity: 1 },
            reason: 'argued that people who hurt your own forfeit mercy',
        },
        do_not_become_them: {
            player: { mercy: 7 },
            wrenModel: { mercy: 7 },
            wrenImpact: { security: 4 },
            relationship: { trust: 3, familiarity: 2 },
            reason: 'urged Wren not to let cruelty decide who she becomes',
        },
        power_keeps_us_safe: {
            player: { personalLoyalty: 3, mercy: -5 },
            wrenModel: { personalLoyalty: 2, mercy: -5 },
            relationship: { familiarity: 1 },
            reason: 'argued that power matters more than moral cleanliness when protecting your own',
        },
    });

    const clampAxis = value => Math.max(MIN_AXIS, Math.min(MAX_AXIS, Math.round(Number(value) || 0)));
    const party = () => Array.isArray(window.party) ? window.party : [];
    const protagonist = () => party()[0] || null;
    const wren = () => party().find((member, index) => index > 0 && member?.name === 'Wren Talbot') || null;

    function ensurePlayerIdentity() {
        const player = protagonist();
        if (!player) return null;
        const existing = player.campaignIdentity || {};
        player.campaignIdentity = {
            personalLoyalty: clampAxis(existing.personalLoyalty ?? PLAYER_START.personalLoyalty),
            mercy: clampAxis(existing.mercy ?? PLAYER_START.mercy),
            history: Array.isArray(existing.history) ? existing.history : [],
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
        };
        return player.campaignIdentity;
    }

    function ensureWrenArc() {
        const companion = wren();
        if (!companion) return null;
        const existing = companion.characterArc || {};
        companion.characterArc = {
            personalLoyalty: clampAxis(existing.personalLoyalty ?? WREN_START.personalLoyalty),
            mercy: clampAxis(existing.mercy ?? WREN_START.mercy),
            security: clampAxis(existing.security ?? WREN_START.security),
            history: Array.isArray(existing.history) ? existing.history : [],
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            dialogueChoiceKeys: Array.isArray(existing.dialogueChoiceKeys) ? existing.dialogueChoiceKeys : [],
        };
        return companion.characterArc;
    }

    function relationshipSnapshot() {
        const companion = wren();
        if (!companion || typeof window.getCompanionRelationship !== 'function') return null;
        return window.getCompanionRelationship(companion);
    }

    function influenceScale() {
        const rel = relationshipSnapshot();
        if (!rel) return 0.35;
        return Math.max(0.35, Math.min(1,
            0.35 + Number(rel.trust || 0) / 200 + Number(rel.familiarity || 0) / 400
        ));
    }

    function scaledDelta(value, scale) {
        const n = Number(value || 0);
        if (!n) return 0;
        const rounded = Math.round(n * scale);
        if (rounded !== 0) return rounded;
        return n > 0 ? 1 : -1;
    }

    function applyAxisDeltas(target, deltas, scale = 1) {
        if (!target || !deltas) return;
        ['personalLoyalty', 'mercy', 'security'].forEach(axis => {
            if (deltas[axis] === undefined) return;
            target[axis] = clampAxis(Number(target[axis] || 0) + scaledDelta(deltas[axis], scale));
        });
    }

    function pushHistory(target, entry) {
        if (!target) return;
        target.history = Array.isArray(target.history) ? target.history : [];
        target.history.push(entry);
        if (target.history.length > 80) target.history.splice(0, target.history.length - 80);
    }

    function applyDevelopmentEvent(key, spec = {}, source = 'story') {
        const playerIdentity = ensurePlayerIdentity();
        const wrenArc = ensureWrenArc();
        if (!playerIdentity || !wrenArc || !key) return null;
        const stableKey = `${source}:${String(key)}`;
        if (wrenArc.knownEventKeys.includes(stableKey)) return getState();

        wrenArc.knownEventKeys.push(stableKey);
        playerIdentity.knownEventKeys.push(stableKey);
        if (wrenArc.knownEventKeys.length > 120) wrenArc.knownEventKeys.splice(0, wrenArc.knownEventKeys.length - 120);
        if (playerIdentity.knownEventKeys.length > 120) playerIdentity.knownEventKeys.splice(0, playerIdentity.knownEventKeys.length - 120);

        applyAxisDeltas(playerIdentity, spec.player, 1);
        const scale = influenceScale();
        applyAxisDeltas(wrenArc, spec.wrenModel, scale);
        // Security is about what happened TO Wren, not whether she accepts the
        // protagonist as a role model, so these effects are intentionally full.
        applyAxisDeltas(wrenArc, spec.wrenImpact, 1);

        const entry = {
            key: stableKey,
            source,
            reason: spec.reason || String(key),
            worldSeconds: Number(window.worldSeconds || 0),
            influenceScale: scale,
        };
        pushHistory(playerIdentity, { ...entry, values: snapshotAxes(playerIdentity, false) });
        pushHistory(wrenArc, { ...entry, values: snapshotAxes(wrenArc, true) });
        return getState();
    }

    function snapshotAxes(target, includeSecurity) {
        if (!target) return null;
        const out = {
            personalLoyalty: Number(target.personalLoyalty || 0),
            mercy: Number(target.mercy || 0),
        };
        if (includeSecurity) out.security = Number(target.security || 0);
        return out;
    }

    function applyDialogueChoice(choiceId) {
        const companion = wren();
        const arc = ensureWrenArc();
        const spec = DIALOGUE_CHOICES[choiceId];
        if (!companion || !arc || !spec || arc.dialogueChoiceKeys.includes(choiceId)) return false;
        arc.dialogueChoiceKeys.push(choiceId);
        applyDevelopmentEvent(choiceId, spec, 'dialogue');

        const rel = spec.relationship || {};
        const approval = Number(rel.approval || 0);
        const trust = Number(rel.trust || 0);
        const familiarity = Number(rel.familiarity || 0);
        if ((approval || trust) && typeof window.noteWrenDispositionEvent === 'function') {
            window.noteWrenDispositionEvent(`character_arc_dialogue:${choiceId}`, {
                approval,
                trust,
                reason: spec.reason,
            });
        }
        if (familiarity && typeof window.adjustCompanionRelationship === 'function') {
            window.adjustCompanionRelationship(companion, { familiarity }, `character arc dialogue: ${choiceId}`);
        }
        return true;
    }

    function syncStoryInfluence() {
        const companion = wren();
        const arc = ensureWrenArc();
        ensurePlayerIdentity();
        if (!companion || !arc) return;
        const keys = companion.playerRelationship?.knownDispositionEventKeys || [];
        keys.forEach(key => {
            const spec = STORY_INFLUENCE[key];
            if (spec) applyDevelopmentEvent(key, spec, 'story');
        });
    }

    function getWrenStance() {
        const arc = ensureWrenArc();
        if (!arc) return 'unknown';
        const loyal = arc.personalLoyalty >= 25;
        const principled = arc.personalLoyalty <= -20;
        const merciful = arc.mercy >= 25;
        const ruthless = arc.mercy <= -20;
        if (loyal && ruthless) return 'us_against_the_world';
        if (loyal && merciful) return 'steadfast_protector';
        if (principled && merciful) return 'principled_conscience';
        if (principled && ruthless) return 'hard_principlist';
        if (ruthless) return 'pragmatic_survivor';
        if (merciful) return 'compassionate_realist';
        return 'unsettled';
    }

    function getAttachmentState() {
        const arc = ensureWrenArc();
        if (!arc) return 'unknown';
        if (arc.security >= 35) return 'secure';
        if (arc.security <= -35) return 'fear_bound';
        return 'guarded';
    }

    function whyWrenStaysLine() {
        const companion = wren();
        const arc = ensureWrenArc();
        const rel = relationshipSnapshot();
        if (!companion || !arc) return '';

        if ((rel?.trust ?? 0) <= 10) {
            if (arc.personalLoyalty >= 25) {
                return '“Because leaving someone when they’re at their worst is still leaving them. Don’t mistake that for me thinking you’re right.”';
            }
            return '“Because if everyone who remembers who you were walks away, who exactly is left to tell you when you’ve become a monster?”';
        }
        if (arc.security >= 35 && arc.personalLoyalty >= 20) {
            return '“I used to think staying was something I had to prove. It isn’t. I’m here because I choose you. There’s a difference.”';
        }
        if (arc.personalLoyalty >= 40 && arc.mercy <= -15) {
            return '“The world gets very generous with rules when it’s somebody else bleeding. I know who mine are. You’re one of them.”';
        }
        if (arc.personalLoyalty <= -20) {
            return '“Staying doesn’t mean agreeing. Sometimes loyalty is being the one person who’ll stand close enough to tell you no.”';
        }
        if (arc.security <= -30) {
            return 'Wren looks away. “People disappear. They promise they won’t, and then one day there’s just an empty chair. I suppose I decided a long time ago I wouldn’t be the empty chair.”';
        }
        return '“People leave. I don’t. Maybe that’s stubbornness, maybe it’s a character flaw. You’ve travelled with me long enough to know I’ve got both.”';
    }

    function postParentsReflectionLine() {
        const arc = ensureWrenArc();
        if (!arc) return '';
        if (arc.mercy >= 25 && arc.security >= 20) {
            return '“Finding out what happened didn’t make me want revenge as much as I thought it would. Mostly I don’t want Venn to get to decide what sort of person I become.”';
        }
        if (arc.mercy <= -20 && arc.personalLoyalty >= 25) {
            return '“I keep thinking about how many people knew enough to be suspicious and chose quiet. I don’t think I have much patience left for people who hurt ours and ask for understanding after.”';
        }
        if (arc.personalLoyalty <= -20) {
            return '“They deserved more than someone quietly caring about them. They deserved somebody willing to say what happened out loud, even when powerful people wanted silence.”';
        }
        return '“I thought knowing would settle something. It did, sort of. Mostly it left me deciding what I want the knowing to do to me.”';
    }

    function openWhyStayConversation() {
        const companion = wren();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        const arc = ensureWrenArc();
        const firstTime = !arc.dialogueChoiceKeys.some(key => [
            'people_do_not_give_up', 'loyalty_has_limits', 'look_after_our_own', 'you_do_not_owe_me'
        ].includes(key));
        const options = firstTime ? [
            {
                label: '“People shouldn’t give up on each other just because things get hard.”',
                action: () => { applyDialogueChoice('people_do_not_give_up'); window.showDialogue(companion, '“Yeah. That’s more or less the rule I’ve been living by.”', [{ label: 'Stay a while.', action: () => {} }]); },
            },
            {
                label: '“Loyalty has limits. If I’m wrong, I need you to tell me.”',
                action: () => { applyDialogueChoice('loyalty_has_limits'); window.showDialogue(companion, 'Wren studies you. “Careful. I might take that as permission.”', [{ label: 'I mean it.', action: () => {} }]); },
            },
            {
                label: '“You look after your own. Everyone else comes second.”',
                action: () => { applyDialogueChoice('look_after_our_own'); window.showDialogue(companion, '“Our own,” Wren repeats. “Dangerous little phrase, that. I can see the appeal.”', [{ label: 'Exactly.', action: () => {} }]); },
            },
            {
                label: '“You don’t owe me staying. If you stay, I want it to be because you choose to.”',
                action: () => { applyDialogueChoice('you_do_not_owe_me'); window.showDialogue(companion, 'For once Wren has no quick answer. “...All right. I’ll try to remember that.”', [{ label: 'That’s enough.', action: () => {} }]); },
            },
        ] : [{ label: '“I’m glad you’re here.”', action: () => {} }];
        window.showDialogue(companion, whyWrenStaysLine(), options);
        return true;
    }

    function openParentsReflection() {
        const companion = wren();
        const arc = ensureWrenArc();
        const quest = (window.questLog || []).find(q => q?.id === 'wren_parents');
        if (!companion || !arc || quest?.status !== 'completed' || typeof window.showDialogue !== 'function') return false;
        const used = arc.dialogueChoiceKeys.some(key => [
            'truth_even_when_it_hurts', 'hurt_ours_no_second_chance', 'do_not_become_them', 'power_keeps_us_safe'
        ].includes(key));
        const options = used ? [{ label: '“Whatever comes next, we’ll face it.”', action: () => {} }] : [
            { label: '“The truth matters, even when it hurts people we care about.”', action: () => { applyDialogueChoice('truth_even_when_it_hurts'); window.showDialogue(companion, '“Then I suppose I’d better get used to saying uncomfortable things.”', [{ label: 'Probably.', action: () => {} }]); } },
            { label: '“People who hurt ours don’t automatically deserve a second chance.”', action: () => { applyDialogueChoice('hurt_ours_no_second_chance'); window.showDialogue(companion, 'Wren nods slowly. “No. Maybe they don’t.”', [{ label: 'No.', action: () => {} }]); } },
            { label: '“Don’t let cruel people decide who you become.”', action: () => { applyDialogueChoice('do_not_become_them'); window.showDialogue(companion, '“That sounds annoyingly sensible.” A pause. “I’ll think about it.”', [{ label: 'Good.', action: () => {} }]); } },
            { label: '“What happened proves why we need enough power that nobody can do that to ours again.”', action: () => { applyDialogueChoice('power_keeps_us_safe'); window.showDialogue(companion, '“Power as insurance.” Wren frowns. “I hate that I understand the argument.”', [{ label: 'You don’t have to like it.', action: () => {} }]); } },
        ];
        window.showDialogue(companion, postParentsReflectionLine(), options);
        return true;
    }

    function chainHas(fn, flag) {
        let current = fn;
        for (let i = 0; i < 10 && typeof current === 'function'; i++) {
            if (current[flag]) return true;
            current = current.__baseShowDialogue;
        }
        return false;
    }

    function installDialogueHook() {
        if (typeof window.showDialogue !== 'function' || chainHas(window.showDialogue, '__wrenCharacterArcAware')) return false;
        const base = window.showDialogue;
        const wrapped = function(npc, text, options) {
            let nextOptions = options;
            if (npc?.name === 'Wren Talbot' && text === "What's on your mind?" && Array.isArray(options)) {
                const labels = new Set(options.map(option => option?.label));
                nextOptions = [...options];
                const rel = relationshipSnapshot();
                if ((rel?.familiarity ?? 0) >= 35 && !labels.has('Why do you always stay?')) {
                    nextOptions.push({
                        label: (rel?.trust ?? 0) <= 10 ? 'Why are you still here?' : 'Why do you always stay?',
                        action: () => openWhyStayConversation(),
                    });
                }
                const q = (window.questLog || []).find(entry => entry?.id === 'wren_parents');
                if (q?.status === 'completed' && !labels.has('What did finding your parents change for you?')) {
                    nextOptions.push({
                        label: 'What did finding your parents change for you?',
                        action: () => openParentsReflection(),
                    });
                }
            }
            const args = Array.from(arguments);
            if (args.length >= 3 || nextOptions !== undefined) args[2] = nextOptions;
            return base.apply(this, args);
        };
        wrapped.__wrenCharacterArcAware = true;
        // Preserve markers used by older self-healing wrappers so they do not
        // endlessly re-wrap us every refresh cycle.
        if (chainHas(base, '__relationshipProgressionAware')) wrapped.__relationshipProgressionAware = true;
        if (chainHas(base, '__wrenParentsInvestigationAware')) wrapped.__wrenParentsInvestigationAware = true;
        wrapped.__baseShowDialogue = base;
        window.showDialogue = wrapped;
        return true;
    }

    function getState() {
        return {
            player: snapshotAxes(ensurePlayerIdentity(), false),
            wren: snapshotAxes(ensureWrenArc(), true),
            stance: getWrenStance(),
            attachment: getAttachmentState(),
            influenceScale: influenceScale(),
        };
    }

    function refreshHooks() {
        ensurePlayerIdentity();
        ensureWrenArc();
        syncStoryInfluence();
        installDialogueHook();
    }

    window.wrenCharacterArc = {
        build: BUILD,
        axes: {
            personalLoyalty: 'principle-first (-100) ↔ person-first (+100)',
            mercy: 'ruthless (-100) ↔ merciful (+100)',
            security: 'fear-bound (-100) ↔ secure (+100)',
        },
        storyInfluence: STORY_INFLUENCE,
        dialogueChoices: DIALOGUE_CHOICES,
        ensurePlayerIdentity,
        ensureWrenArc,
        applyDevelopmentEvent,
        applyDialogueChoice,
        syncStoryInfluence,
        getWrenStance,
        getAttachmentState,
        whyWrenStaysLine,
        openWhyStayConversation,
        openParentsReflection,
        getState,
        refreshHooks,
    };
    window.getWrenCharacterState = getState;
    window.applyWrenDialogueChoice = applyDialogueChoice;

    refreshHooks();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshHooks, { once: true });
    setInterval(refreshHooks, 1000);
    window.WREN_CHARACTER_ARC_BUILD = BUILD;
})();
