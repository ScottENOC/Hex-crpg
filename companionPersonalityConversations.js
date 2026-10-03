// companionPersonalityConversations.js
// Conversations that teach the player how each companion tends to judge future
// choices. These are clues, not tooltip spoilers: the companion explains values,
// tensions and exceptions in-character; no approval score or preferred button is
// exposed. The existing conversation-memory layer handles cooldown/exhaustion.
(() => {
    'use strict';

    const BUILD = '20260930-companion-personality-conversations-v1';
    const api = () => window.companionConversationMemory;
    const q = id => (window.questLog || []).find(entry => entry?.id === id) || null;
    const has = name => (window.party || []).some((m, i) => i > 0 && m?.name === name);

    function variant(state, subject, lines) {
        const index = Math.max(0, Number(state?.uses || 0)) % lines.length;
        return { subject, text: lines[index], variantIndex: index };
    }

    const pools = {
        'Wren Talbot': [
            {
                id: 'values_mercy_truth', label: 'What makes you decide somebody deserves another chance?',
                priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Wren’s instincts about mercy and accountability', [
                    'Wren thinks for a moment. “Depends what they do once they’re caught. Somebody scared, cornered, trying to get out? I can forgive a lot. Somebody hurting people because it’s convenient and then calling it necessity? Much harder.”',
                    '“Mercy isn’t pretending nothing happened,” Wren says. “If someone owns it, repairs what they can, and stops doing it, give them room. If they just want the consequences gone, that’s not the same thing.”',
                    'Wren shrugs. “I’m softer on people who were trapped than people who did the trapping. Probably not a perfect philosophy, but there it is.”',
                ]),
            },
            {
                id: 'values_loyalty_independence', label: 'What does loyalty actually mean to you?',
                priority: 43, cooldownDays: 7, maxUses: 3,
                render: (ctx, state) => variant(state, 'Wren’s view of loyalty', [
                    '“Staying because you choose to,” Wren says. “Not because somebody made leaving impossible. If I have to cage you to keep you loyal, you aren’t loyal. You’re stuck.”',
                    'Wren rubs her thumb over a knuckle. “I notice when people come back. Sounds small. Isn’t, to me. Promises matter, but choosing somebody again when you could walk away matters more.”',
                    '“Don’t agree with me just because you think I want it,” Wren says. “I’d rather have an argument with somebody who respects me than obedience from somebody trying to manage my mood.”',
                ]),
            },
        ],
        'Ser Aldric Thorne': [
            {
                id: 'values_duty_mercy', label: 'When should duty bend?', priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Aldric’s view of duty', [
                    'Aldric considers the question carefully. “A duty should survive examination of what it was meant to protect. Keeping the words while betraying the purpose is not honour. Nor is discarding a promise merely because keeping it has become costly.”',
                    '“I respect sacrifice,” Aldric says, “but I am learning to distrust needless sacrifice. If five people can carry a burden safely, insisting one person must break beneath it is vanity, not virtue.”',
                    '“There are times an order is wrong,” Aldric says. “But disobedience should come with responsibility. I have little patience for people who invoke conscience only when conscience is convenient.”',
                ]),
            },
            {
                id: 'values_justice', label: 'What do you think justice owes an enemy?', priority: 42, cooldownDays: 7, maxUses: 3,
                render: (ctx, state) => variant(state, 'Aldric’s view of justice', [
                    '“Restraint once they are no longer a threat,” Aldric says. “A sword drawn in defence is one thing. Punishment delivered in anger after the danger has passed is another.”',
                    'Aldric’s expression hardens. “Mercy does not require gullibility. Protect others first. But if surrender can safely be accepted, I would rather answer for sparing a prisoner than for killing one because it was simpler.”',
                    '“Institutions matter when they make justice less dependent on whoever happens to be holding the sword,” Aldric says. “They cease to deserve deference when they exist chiefly to excuse the powerful.”',
                ]),
            },
        ],
        'Mirabel Quill': [
            {
                id: 'values_knowledge', label: 'Is there knowledge you think people shouldn’t pursue?', priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Mirabel’s view of dangerous knowledge', [
                    'Mirabel tilts her head. “Shouldn’t pursue? Rarely. Shouldn’t use carelessly? Constantly. Ignorance is a poor safety mechanism; context, scrutiny and knowing when not to act are much better ones.”',
                    '“I dislike destroying knowledge because somebody might misuse it,” Mirabel says. “I also dislike pretending curiosity absolves the curious. If your experiment can hurt people, their risk belongs in your calculation whether or not they understand the theory.”',
                    'Mirabel smiles faintly. “A locked door makes me want to know what is behind it. Maturity, apparently, is learning that opening it and walking through it are separate decisions.”',
                ]),
            },
            {
                id: 'values_freedom', label: 'What makes a commitment worth keeping?', priority: 42, cooldownDays: 7, maxUses: 3,
                render: (ctx, state) => variant(state, 'Mirabel’s view of freedom and commitment', [
                    '“Choice,” Mirabel says immediately. “A commitment renewed because you still want it means something. Staying because leaving has been made shameful or impossible is merely captivity with nicer stationery.”',
                    '“I distrust permanent answers reached under pressure,” Mirabel says. “Give me an honest temporary promise over a grand eternal one somebody was cornered into making.”',
                    'Mirabel glances at you. “Freedom includes the freedom to stay. Took me an embarrassingly long time to notice that.”',
                ]),
            },
        ],
        'Fenn Oakheart': [
            {
                id: 'values_stewardship', label: 'When should people interfere with nature?', priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Fenn’s view of stewardship', [
                    'Fenn looks toward the nearest patch of green. “People are nature too. The question isn’t whether we touch a place. We always do. It’s whether we understand enough to take responsibility for what our touch changes.”',
                    '“Leaving something alone can be wise,” Fenn says. “It can also be an excuse to ignore suffering we could prevent. I care more about whether a place can keep living than whether it looks untouched.”',
                    'Fenn smiles. “I like answers where farms, woods and rivers all get to keep functioning. Not because compromise is automatically good. Because systems that only work by ruining their neighbour tend not to work for long.”',
                ]),
            },
            {
                id: 'values_authority', label: 'How much do you trust tradition?', priority: 42, cooldownDays: 7, maxUses: 3,
                render: (ctx, state) => variant(state, 'Fenn’s view of tradition and judgement', [
                    '“Tradition is stored experience,” Fenn says. “Worth listening to. But if nobody remembers why a rule exists, I’d rather examine it than worship the shape it left behind.”',
                    '“Nessa taught me nearly everything I know,” Fenn says. “That doesn’t mean the respectful answer is always to copy her. Good teachers are supposed to leave you able to disagree intelligently.”',
                    'Fenn scratches his jaw. “I trust people more when they can explain what they’re protecting. ‘Because we have always done it’ tells me history, not purpose.”',
                ]),
            },
        ],
        'Reyna Fletcher': [
            {
                id: 'values_trust', label: 'What does someone have to do before you trust them?', priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Reyna’s view of trust', [
                    'Reyna answers without hesitation. “Be useful when it’s inconvenient. Tell me bad news before I discover it myself. And don’t make promises you need applause for keeping.”',
                    '“Trust isn’t believing somebody won’t fail,” Reyna says. “It’s knowing what they do after they fail. Hide it, blame someone else, disappear? I remember. Come back and help fix it? I remember that too.”',
                    'Reyna checks the fletching on an arrow. “I’m learning that doing everything yourself is not the same as being safe. But I still prefer people who prove reliability in small things before asking for a large gamble.”',
                ]),
            },
            {
                id: 'values_institutions', label: 'Can an institution ever earn your trust?', priority: 42, cooldownDays: 7, maxUses: 3,
                render: (ctx, state) => variant(state, 'Reyna’s view of institutions', [
                    '“Maybe,” Reyna says. “If it admits mistakes before someone forces it to, protects people who bring bad news, and punishes its own when they abuse the badge. Otherwise it’s just a larger target that writes paperwork.”',
                    '“A good system lets ordinary people do the right thing without needing a hero in the room,” Reyna says. “I’ll respect that. I won’t respect a crest because the crest says I should.”',
                    'Reyna shrugs. “I don’t need institutions to be perfect. I need them to be correctable. If every failure gets buried to protect confidence, eventually there’s nothing underneath the confidence.”',
                ]),
            },
        ],
        'Brother Alden': [
            {
                id: 'values_compassion', label: 'Does compassion ever require taking sides?', priority: 46, cooldownDays: 6, maxUses: 3,
                render: (ctx, state) => variant(state, 'Alden’s view of compassion', [
                    'Alden folds his hands. “Detachment is useful if it frees us from pride and anger. It becomes cowardice if we use it to remain serene while somebody else is being harmed.”',
                    '“To see every person as equally human does not mean every action is equally harmless,” Alden says. “Sometimes compassion for the vulnerable requires opposing the person hurting them.”',
                    'Alden smiles slightly. “I once thought avoiding attachment made judgement purer. Now I wonder whether knowing particular people is one of the ways abstractions become morally real.”',
                ]),
            },
            {
                id: 'values_names', label: 'Why do names matter so much to you now?', priority: 43, cooldownDays: 7, maxUses: 3,
                condition: () => !!q('alden_uncounted'),
                render: (ctx, state) => variant(state, 'Alden’s view of individual lives', [
                    '“Because ‘six dead’ is true and still incomplete,” Alden says. “A number tells us the scale of loss. A name reminds us that nobody experienced themselves as one-sixth of a tragedy.”',
                    '“Universal compassion should not erase particulars,” Alden says. “If a policy saves a thousand people by quietly sacrificing ten, I want to know the ten had names before deciding the arithmetic settles everything.”',
                    'Alden looks thoughtful. “I am more suspicious now of tidy solutions that require us not to look closely at who pays for them.”',
                ]),
            },
        ],
    };

    function install() {
        if (!api()?.registerTopics) return false;
        for (const [name, topics] of Object.entries(pools)) api().registerTopics(name, topics);
        window.companionPersonalityConversations = { build: BUILD, pools };
        return true;
    }

    if (!install()) document.addEventListener('DOMContentLoaded', install, { once: true });
})();
