// companionPersonalityKnowledge.js
// Player-facing knowledge of companion personality, learned through conversation.
//
// Important separation: these are observations the protagonist has earned, not
// the companion's hidden approval rules. Future dilemmas may consult the real
// personality/arc state; this module only exposes progressively clearer clues so
// the player can make an informed judgement without showing '+5 Wren' previews.
(() => {
    'use strict';
    const root = typeof window !== 'undefined' ? window : globalThis;
    const BUILD = '20261001-personality-knowledge-v1';

    const CLUES = {
        'Wren Talbot': {
            authority: [
                'Wren is wary of people who expect obedience just because of rank.',
                'Wren dislikes inherited or unearned authority, but respects leadership that proves useful and protects people.',
                'Wren responds best to authority that is accountable and chosen; coercive loyalty is likely to push her away.'
            ],
            mercy: [
                'Wren notices when powerful people are cruel to someone who cannot answer back.',
                'Wren has a strong protective streak, especially toward children and people caught in somebody else’s scheme.',
                'Wren can accept hard or pragmatic choices, but gratuitous cruelty and treating vulnerable people as expendable cut deeply against her values.'
            ],
            attachment: [
                'Wren jokes about people leaving more often than the joke seems to require.',
                'Loss and abandonment are tangled together for Wren; reliability matters to her more than she readily admits.',
                'Wren increasingly values freely chosen commitment over loyalty produced by fear, obligation or dependence.'
            ],
            pragmatism: [
                'Wren is not especially impressed by rules merely because they are rules.',
                'Wren can tolerate deception, theft or bending procedure when there is a concrete reason and the cost is owned honestly.',
                'Wren’s pragmatism has limits: she distinguishes breaking a rule to protect people from using people as tools.'
            ]
        },
        'Ser Aldric Thorne': {
            duty: [
                'Aldric takes promises unusually seriously.',
                'Aldric cares about the obligation underneath an oath, not only its literal wording.',
                'Aldric respects honest renegotiation of duty far more than quietly deciding a promise has become inconvenient.'
            ],
            burden: [
                'Aldric’s first instinct is often to carry a difficult responsibility himself.',
                'Aldric respects service and sacrifice, but is learning that sharing a burden need not cheapen it.',
                'Aldric increasingly distinguishes genuine duty from martyrdom performed because accepting help feels uncomfortable.'
            ],
            justice: [
                'Aldric dislikes punishment falling on the easiest subordinate rather than the person who made the decision.',
                'Aldric cares about command responsibility and whether institutions keep the promises they demand from others.',
                'Aldric is likely to favour accountability that identifies the responsible actor over vengeance aimed at an institution indiscriminately.'
            ]
        },
        'Mirabel Quill': {
            curiosity: [
                'Mirabel finds dangerous questions difficult to leave alone.',
                'Mirabel strongly values preserving knowledge, including knowledge that should not be used casually.',
                'Mirabel is most comfortable with dangerous knowledge when it is understood, documented and constrained rather than destroyed or exploited.'
            ],
            roots: [
                'Mirabel is accustomed to keeping her options open and moving on.',
                'Mirabel’s independence is genuine, but so is her uncertainty about belonging anywhere for long.',
                'Mirabel can value commitment when it remains a choice rather than a cage.'
            ]
        },
        'Fenn Oakheart': {
            stewardship: [
                'Fenn cares deeply about preserving living places.',
                'Fenn is learning that doing nothing can be a choice with consequences just as intervention is.',
                'Fenn increasingly judges stewardship by whether people acknowledge and carry the costs of their intervention, rather than by a simple preserve/change rule.'
            ],
            independence: [
                'Fenn often wonders what his teachers would think before saying what he thinks.',
                'Fenn wants to develop judgement of his own without rejecting tradition merely to prove independence.',
                'Fenn responds well when trusted to make and defend his own decision rather than being handed the “correct” answer.'
            ]
        },
        'Reyna Fletcher': {
            trust: [
                'Reyna is much more comfortable relying on herself than on institutions.',
                'Reyna respects competence and evidence more readily than reassurance.',
                'Reyna can learn to trust people and institutions, but reacts badly when trust is demanded without accountability or proof.'
            ],
            justice: [
                'Reyna pays attention to why someone broke a rule, not only the fact that they did.',
                'Reyna distinguishes frightened or coerced people from the people exploiting them.',
                'Reyna is receptive to accountability that preserves useful witnesses and recognises coercion, but dislikes arrangements that merely hide wrongdoing off the books.'
            ]
        },
        'Brother Alden': {
            engagement: [
                'Alden can sound detached even when he has noticed something everyone else missed.',
                'Alden values contemplation, but does not think spiritual detachment excuses ignoring a person in front of you.',
                'Alden increasingly treats engagement with suffering as compatible with his faith rather than a distraction from it.'
            ],
            dignity: [
                'Names and individual histories matter to Alden.',
                'Alden is troubled when institutions turn dead or missing people into convenient numbers.',
                'Alden tends to favour choices that restore individual dignity and memory, even when no practical reward follows.'
            ]
        }
    };

    function state() {
        const player = root.player || (Array.isArray(root.party) ? root.party[0] : null);
        if (!player) return null;
        if (!player.companionPersonalityKnowledge || typeof player.companionPersonalityKnowledge !== 'object') {
            player.companionPersonalityKnowledge = {};
        }
        return player.companionPersonalityKnowledge;
    }

    function learn(name, trait, amount = 1, source = '') {
        const levels = CLUES[name]?.[trait];
        const store = state();
        if (!levels || !store) return null;
        const char = store[name] ||= {};
        const previous = Number(char[trait]?.level) || 0;
        const level = Math.max(previous, Math.min(levels.length, previous + Math.max(1, amount | 0)));
        char[trait] = { level, source: source || char[trait]?.source || '', learnedAt: Number(root.gameTime) || 0 };
        return { name, trait, level, text: levels[level - 1], advanced: level > previous };
    }

    function get(name, trait) {
        const level = Number(state()?.[name]?.[trait]?.level) || 0;
        const text = level ? CLUES[name]?.[trait]?.[Math.min(level, CLUES[name][trait].length) - 1] : null;
        return { level, text };
    }

    function known(name) {
        const traits = CLUES[name] || {};
        return Object.keys(traits).map(trait => ({ trait, ...get(name, trait) })).filter(entry => entry.level > 0);
    }

    function allClues(name) {
        return CLUES[name] ? JSON.parse(JSON.stringify(CLUES[name])) : {};
    }

    const api = { build: BUILD, learn, get, known, allClues };
    root.companionPersonalityKnowledge = api;
    root.learnCompanionPersonality = learn;
    root.getCompanionPersonalityKnowledge = get;
    root.COMPANION_PERSONALITY_KNOWLEDGE_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
