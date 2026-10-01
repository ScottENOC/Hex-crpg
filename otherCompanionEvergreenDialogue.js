// otherCompanionEvergreenDialogue.js
// Authored evergreen/reactive topic pools for Mirabel, Fenn, Reyna and Alden.
// Uses companionConversationMemory.js: no generated prose and no repeatable
// relationship rewards. Finite anecdotes exhaust; recurring topics return only
// after in-world cooldowns and can change as the character/story changes.
(() => {
    'use strict';

    const BUILD = '20260930-other-companion-evergreen-v1';
    const MIRABEL = 'Mirabel Quill';
    const FENN = 'Fenn Oakheart';
    const REYNA = 'Reyna Fletcher';
    const ALDEN = 'Brother Alden';

    const api = () => window.companionConversationMemory;
    const quest = id => (window.questLog || []).find(q => q?.id === id) || null;
    const companion = name => (window.party || []).find((m, i) => i > 0 && m?.name === name) || null;
    const has = name => !!companion(name);
    const lowHp = () => (window.party || []).some(m => Number(m?.maxHp || 0) > 0 && Number(m?.hp || 0) / Number(m.maxHp) < 0.45);

    function variant(state, lines) {
        const index = Math.max(0, Number(state?.uses || 0)) % lines.length;
        return { text: lines[index], variantIndex: index };
    }

    function simple(subject, state, lines) {
        return { subject, ...variant(state, lines) };
    }

    function relationshipLines(ctx, state, sets) {
        const friendship = Number(ctx.affinity?.friendship || 0);
        const romance = Number(ctx.affinity?.romanticBond || 0);
        const mode = ctx.romance?.mode;
        const lines = (mode === 'romantic' || mode === 'asexual_romance' || romance >= 50)
            ? sets.romantic
            : friendship >= 55 ? sets.friend : sets.early;
        return { subject: 'the relationship between you', ...variant(state, lines) };
    }

    function mirabelArc() {
        return window.mirabelUnquietConcordance?.getArcState?.() || companion(MIRABEL)?.mirabelCharacterArc || {};
    }

    function fennArc() {
        return window.fennLivingBoundary?.getArcState?.() || companion(FENN)?.fennCharacterArc || {};
    }

    function reynaArc() {
        return window.reynaEmptyBlind?.getArcState?.() || companion(REYNA)?.reynaCharacterArc || {};
    }

    function aldenArc() {
        return window.aldenUncounted?.getArcState?.() || companion(ALDEN)?.aldenCharacterArc || {};
    }

    const MIRABEL_TOPICS = [
        {
            id: 'concordance_aftermath',
            label: state => state.uses ? 'Do you still think about the Concordance?' : 'Are you satisfied with what we did with the Concordance?',
            milestone: true, priority: 95, cooldownDays: 5, maxUses: 2,
            condition: () => quest('mirabel_unquiet_concordance')?.status === 'completed',
            render: (ctx, state) => {
                const result = quest('mirabel_unquiet_concordance')?.resolution;
                if (!state.uses) {
                    const text = {
                        preserve_open: 'Mirabel taps two fingers against her pack. “Satisfied is too neat a word. I still think knowledge survives scrutiny better than prohibition. I also hear Thessaly’s voice every time I imagine some idiot copying the dangerous pages without the warnings.”',
                        preserve_sealed: '“More satisfied than I expected,” Mirabel admits. “The knowledge exists, the warnings exist, and access requires somebody to stop and ask why the restriction is there. I used to think every locked archive was merely a challenge issued by an unimaginative librarian.”',
                        destroy_appendix: 'Mirabel grimaces. “I still hate that we destroyed knowledge. I also know exactly why we did it. Apparently adulthood is accumulating decisions you can defend without ever learning to enjoy them.”',
                        experiment: 'Mirabel’s expression turns intent. “The troublesome part is that it worked. Failure would have made restraint easy. Successful dangerous knowledge is much better at flattering the person holding it.”',
                    }[result];
                    return { subject: 'the Concordance decision', text: text || '“I still think about the Concordance,” Mirabel says. “Mostly because there was no answer that let us remain innocent and informed at the same time.”', variantIndex: 0 };
                }
                const arc = mirabelArc();
                const restraint = Number(arc.restraint || 0);
                return {
                    subject: 'dangerous knowledge', variantIndex: 1,
                    text: restraint >= 15
                        ? '“I have become annoyingly fond of context,” Mirabel says. “Not secrecy for its own sake. Just the idea that knowing how to do something and having a reason to do it are separate achievements.”'
                        : 'Mirabel smiles. “I remain suspicious of people who solve dangerous knowledge by making sure only they are allowed to know it. That is not restraint. That is a monopoly with moral vocabulary.”',
                };
            },
        },
        {
            id: 'relationship_checkin', label: 'And us? Still enjoying the experiment?', priority: 52, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 42 || Number(ctx.affinity?.friendship || 0) >= 45,
            render: (ctx, state) => relationshipLines(ctx, state, {
                romantic: [
                    'Mirabel smiles. “Alarmingly well. I keep making plans three days ahead and discovering you have somehow appeared in them without being formally invited.”',
                    '“I still reserve the right to leave places,” Mirabel says. “The novelty is that I no longer assume leaving people is the same kind of freedom.”',
                    'Mirabel leans against you. “I like that nobody had to promise forever before tomorrow became worth choosing.”',
                ],
                friend: [
                    '“You have become one of the people I can hand an unfinished thought to,” Mirabel says. “That is either friendship or catastrophic loss of scholarly standards.”',
                    'Mirabel grins. “Still friends. Despite your persistent habit of having opinions about my research. Very resilient relationship.”',
                    '“I have stopped mentally calculating how quickly I could leave the party if everyone became tedious,” Mirabel says. “Mostly.”',
                ],
                early: [
                    '“Functional,” Mirabel says. “You have not stolen my books, censored my notes or become unbearably earnest about destiny. Strong start.”',
                    'Mirabel considers you. “I know enough to be curious about the rest. Do not look smug; curiosity is not yet a character reference.”',
                ],
            }),
        },
        {
            id: 'road_smalltalk', label: 'You’re unusually quiet. What are you thinking about?', priority: 18, cooldownDays: 2,
            render: (ctx, state) => simple('life on the road', state, [
                '“Whether carrying six books counts as travelling light if four of them are small,” Mirabel says. “I have decided yes.”',
                'Mirabel squints at the horizon. “Every road promises novelty and then spends six hours being mostly road. There is a lesson in there somewhere.”',
                '“I like camps,” Mirabel says. “Nobody owns the room, everyone knows they are leaving, and yet people still bother making tea. Very civilised.”',
                'Mirabel holds up a page covered in notes. “I have improved travelling enormously by doing research during the boring parts. The horse disagrees.”',
                '“I used to measure a good journey by how much distance I put behind me,” Mirabel says. “I am beginning to suspect that was a suspiciously convenient metric.”',
            ]),
        },
        {
            id: 'thessaly', label: 'What do you really think of Thessaly?', priority: 30, cooldownDays: 7, maxUses: 4,
            condition: () => !!quest('mirabel_unquiet_concordance') || !!window.campaign2CourtWizard,
            render: (ctx, state) => simple('Court Wizard Thessaly', state, [
                '“Thessaly is what happens when a very clever person survives long enough to acquire filing procedures,” Mirabel says. “I mean that with considerably more respect than she would believe.”',
                '“She irritates me because her restrictions are sometimes defensible,” Mirabel says. “It is much easier to rebel against a fool.”',
                'Mirabel smiles thinly. “Thessaly thinks I confuse access with wisdom. I think she occasionally confuses responsibility with control. Unfortunately, we are both right often enough to keep talking.”',
                '“If Thessaly ever gives me unrestricted archive access, check her for enchantment,” Mirabel says. “Or me. One of us will clearly have suffered a personality-altering event.”',
            ]),
        },
        {
            id: 'wren', label: 'Wren makes you laugh more than you admit.', priority: 27, cooldownDays: 6,
            condition: () => has('Wren Talbot'),
            render: (ctx, state) => simple('Wren', state, [
                'Mirabel looks offended. “I admit it perfectly freely. I merely object to rewarding her every time.”',
                '“Wren’s scepticism is useful,” Mirabel says. “If I cannot explain an idea without making it sound like I plan to explode the campsite, perhaps the explanation requires work.”',
                'Mirabel glances toward Wren. “She thinks I am too comfortable with dangerous things. I think she is too comfortable pretending fear is merely common sense. We improve each other’s arguments.”',
                '“She once asked whether a magical echo could complain about being studied,” Mirabel says. “Annoyingly, that became a much better ethical question than the one I had been asking.”',
            ]),
        },
        {
            id: 'old_stories', label: 'Tell me about one of the places you left.', priority: 24, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 35,
            render: (ctx, state) => simple('Mirabel’s past travels', state, [
                '“A river academy south of here,” Mirabel says. “Excellent library, terrible wine, headmaster convinced all useful magic had already been categorised. I left after proving him wrong in three separate and admittedly petty ways.”',
                '“I spent one winter cataloguing a dead hedge-wizard’s house,” Mirabel says. “Ninety percent rubbish, nine percent recipes, one percent genuinely dangerous mirror. Best odds I had encountered all year.”',
                'Mirabel smiles. “There was a village where everyone thought I was a famous elven scholar with the same surname. I corrected them twice. On the third free dinner I decided accuracy had reasonable limits.”',
                '“Once I stayed somewhere six months,” Mirabel says. “I told myself it was because the archive was exceptional. The archive was exceptional. So were the people. Guess which part I refused to write in my notes.”',
            ]),
        },
        {
            id: 'lich_response', label: 'You’ve been taking notes about me.', reactive: true, priority: 110, cooldownDays: 3,
            condition: () => !!window.playerIsLich,
            render: (ctx, state) => simple('the player’s lichdom', state, [
                '“Of course I am,” Mirabel says. “You have become an unprecedented source of first-hand data and a person I care about. Those facts are having a vicious argument in my head.”',
                'Mirabel closes her notebook. “I refuse to turn you into a specimen. I also refuse to pretend what happened is not fascinating. You may need to help me keep those promises compatible.”',
                '“The frightening thing is not that lichdom works,” Mirabel says. “Lots of terrible ideas work. The frightening thing is how quickly success starts trying to make its own justification.”',
            ]),
        },
    ];

    const FENN_TOPICS = [
        {
            id: 'boundary_aftermath', label: state => state.uses ? 'Has the marsh changed how you think about stewardship?' : 'Do you still think we chose correctly at the marsh?',
            milestone: true, priority: 95, cooldownDays: 5, maxUses: 2,
            condition: () => quest('fenn_living_boundary')?.status === 'completed',
            render: (ctx, state) => {
                const result = quest('fenn_living_boundary')?.resolution;
                if (!state.uses) {
                    const text = {
                        preserve_marsh: 'Fenn nods slowly. “I still think the marsh deserved to live. I also think it was too easy to say that while Mac carried most of the cost. Those two thoughts do not cancel each other.”',
                        drain_marsh: '“I still miss what the marsh was becoming,” Fenn says. “But making a decision I regret parts of is different from pretending there was a painless one available.”',
                        managed_spillway: 'Fenn smiles. “The spillway still feels right. Not because compromise is automatically wise. Because we understood what the water was doing and accepted responsibility for continuing to manage what we changed.”',
                        compensate_preserve: '“Keeping the marsh while helping Mac absorb the loss was expensive,” Fenn says. “That may be why I trust the answer. Principles are suspiciously easy when someone else receives the invoice.”',
                    }[result];
                    return { subject: 'the Living Boundary', text: text || '“The marsh taught me there is no untouched choice once people and land are already changing each other,” Fenn says.', variantIndex: 0 };
                }
                const arc = fennArc();
                return {
                    subject: 'stewardship', variantIndex: 1,
                    text: Number(arc.stewardship || 0) >= 10
                        ? '“I used to think intervention was evidence we had already failed,” Fenn says. “Now I think sometimes refusing to intervene is simply another intervention with cleaner hands.”'
                        : '“I am still wary of fixing every living system that makes us uncomfortable,” Fenn says. “Knowing we can manage something does not mean it belongs under management.”',
                };
            },
        },
        {
            id: 'relationship_checkin', label: 'How are we doing?', priority: 50, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 42 || Number(ctx.affinity?.friendship || 0) >= 45,
            render: (ctx, state) => relationshipLines(ctx, state, {
                romantic: [
                    'Fenn smiles. “Good. Close without making a cage of it. I was hoping love could feel like that.”',
                    '“I like that choosing you today does not require pretending tomorrow belongs to either of us,” Fenn says. “Makes today feel more honest.”',
                    'Fenn brushes his hand against yours. “Still here because I want to be. I hope that answer keeps being enough.”',
                ],
                friend: [
                    '“Easy,” Fenn says. “Not shallow. Just easy. There are not many people I can be quiet beside without wondering if I should fill it.”',
                    'Fenn grins. “Friends. Which means I am morally entitled to point out when you are being ridiculous.”',
                    '“You’ve become part of how I think through things,” Fenn says. “Nessa would probably call that community. I am trying not to make it sound alarming.”',
                ],
                early: [
                    '“Promising,” Fenn says. “You listen more often than most people who carry weapons for a living.”',
                    'Fenn shrugs. “We are still learning where the other person bends and where they break. That takes time.”',
                ],
            }),
        },
        {
            id: 'injury_check', label: 'You’re hovering. Who are you worried about?', reactive: true, priority: 70, cooldownDays: 1,
            condition: () => lowHp(),
            render: (ctx, state) => simple('the party’s injuries', state, [
                '“All of you,” Fenn says. “Some injuries heal better if the injured person stops insisting walking is medicinal.”',
                'Fenn points toward the nearest patch of shade. “Sit. Eat. Drink. The forest has survived several hours without your supervision and will probably manage another.”',
                '“Pain is information,” Fenn says. “So is exhaustion. You lot are remarkably committed to treating both as unsolicited advice.”',
            ]),
        },
        {
            id: 'nessa', label: 'Do you still hear Nessa in your head when you make a decision?', priority: 32, cooldownDays: 7,
            condition: () => !!quest('fenn_living_boundary'),
            render: (ctx, state) => {
                const arc = fennArc();
                const lines = Number(arc.independence || 0) >= 10 ? [
                    'Fenn laughs. “Constantly. The difference is I no longer mistake hearing her voice for owing it the final word.”',
                    '“I argue with imaginary Nessa much more efficiently than real Nessa,” Fenn says. “Real Nessa asks follow-up questions.”',
                    'Fenn smiles. “She taught me how to look. She did not ask me to spend my life seeing exactly what she sees.”',
                ] : [
                    'Fenn glances away. “More than I would like. She was right about enough things that disagreeing still feels suspiciously like making an error.”',
                    '“Sometimes I make a choice and immediately wonder how Nessa would have made it better,” Fenn admits. “I am working on asking what I think before I ask what she would think.”',
                    '“The grove gave me a language for the world,” Fenn says. “Finding my own voice in it is slower than learning the words.”',
                ];
                return { subject: 'Nessa and independence', ...variant(state, lines) };
            },
        },
        {
            id: 'road_nature', label: 'What have you noticed today?', priority: 18, cooldownDays: 2,
            render: (ctx, state) => simple('the living world around the party', state, [
                'Fenn thinks for a moment. “Three kinds of bird arguing over the same hedge, fox tracks from before dawn, and somebody in this party stepped on wild mint without noticing.”',
                '“The road is drier than the ground beside it by half a day,” Fenn says. “Useful if it rains tonight. Also there is a beetle on your pack.”',
                'Fenn smiles. “You learn a place faster by asking what eats here than by asking who rules it.”',
                '“Wind shifted an hour ago,” Fenn says. “No revelation. I just like that the world is always doing things whether or not they become quests.”',
                '“There are mushrooms under that fallen log,” Fenn says. “Edible ones. Before you ask, yes, I am certain. Mostly.”',
            ]),
        },
        {
            id: 'grove_stories', label: 'Tell me something embarrassing about growing up in the grove.', priority: 24, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 35,
            render: (ctx, state) => simple('Fenn’s grove childhood', state, [
                'Fenn groans. “I once spent an afternoon protecting a rare ground nest from everyone in the grove. It was Nessa’s abandoned lunch wrapped in leaves.”',
                '“At thirteen I decided shoes were an artificial separation from the earth,” Fenn says. “Three days later I discovered thistles and revised my theology.”',
                'Fenn smiles sheepishly. “I tried to befriend every fox near the grove by leaving food out. I successfully befriended several rats and one extremely confident badger.”',
                '“Nessa once asked me to prune a sick branch,” Fenn says. “I gave her a twenty-minute argument about respecting natural decline. The branch fell on my shelter that night.”',
            ]),
        },
        {
            id: 'aelwen_accord', label: 'What did you make of Aelwen’s forest dispute?', priority: 34, cooldownDays: 7, maxUses: 3,
            condition: () => quest('aelwen_living_accord')?.status === 'completed',
            render: (ctx, state) => simple('the Living Accord', state, [
                '“I liked that nobody pretended roots moving across a boundary stone meant the treaty moved with them,” Fenn says. “Living borders still need honest agreements between people.”',
                'Fenn scratches his chin. “Aelwen and Seraphine were arguing about trees, but mostly they were arguing about whether need creates permission. It does not. It can create a reason to ask again.”',
                '“The interesting part is maintenance,” Fenn says. “A good accord is not the piece of paper. It is the people still checking the markers after everyone who signed it is tired of the subject.”',
            ]),
        },
    ];

    const REYNA_TOPICS = [
        {
            id: 'empty_blind_aftermath', label: state => state.uses ? 'Has Tamsin changed how you think about relying on people?' : 'Do you still think about Tamsin and the trackers?',
            milestone: true, priority: 95, cooldownDays: 5, maxUses: 2,
            condition: () => quest('reyna_empty_blind')?.status === 'completed',
            render: (ctx, state) => {
                const result = quest('reyna_empty_blind')?.resolution;
                if (!state.uses) {
                    const text = {
                        turn_in: 'Reyna nods. “Yes. Mostly because I still do not know whether bringing them in was mercy or simply the least dishonest option. Coercion explained what they did. It did not make the leaked patrols unhappen.”',
                        witness_deal: '“Tamsin is alive, talking, and useful,” Reyna says. “And the Watch had to accept that a witness can be compromised without becoming worthless. I will take that result.”',
                        double_agent: 'Reyna grimaces. “I still think the double-agent plan could work. I also know exactly how much of it depends on three frightened people staying brave while everyone else gets plausible deniability.”',
                        disappear: '“I helped people I cared about vanish instead of making the system prove it could treat them fairly,” Reyna says. “I can defend that. I am less sure I should feel proud of needing to.”',
                    }[result];
                    return { subject: 'the Empty Blind', text: text || '“I still think about the trackers,” Reyna says. “Mostly because there was no clean category for what they became.”', variantIndex: 0 };
                }
                const arc = reynaArc();
                return {
                    subject: 'reliance and institutions', variantIndex: 1,
                    text: Number(arc.interdependence || 0) >= 10
                        ? '“I am getting better at telling the difference between being capable alone and needing to be alone,” Reyna says. “The first is useful. The second can turn into vanity surprisingly fast.”'
                        : 'Reyna shrugs. “I still trust myself first. Maybe that is habit. Maybe experience. The trick is not pretending the distinction never matters.”',
                };
            },
        },
        {
            id: 'relationship_checkin', label: 'How are we doing?', priority: 51, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 42 || Number(ctx.affinity?.friendship || 0) >= 45,
            render: (ctx, state) => relationshipLines(ctx, state, {
                romantic: [
                    'Reyna smiles. “Good. Serious where it matters, free where it does not. I never wanted love to become another word for surveillance.”',
                    '“I choose you,” Reyna says. “That is a statement about me, not a deed to your person.”',
                    'Reyna nudges you. “Still us. Still honest. Those are the two parts I actually care about.”',
                ],
                friend: [
                    '“You are on the short list of people I trust to cover an angle I cannot see,” Reyna says. “That is practically poetry from me.”',
                    'Reyna grins. “Friends. Which means if your plan is stupid I am obligated to tell you before helping anyway.”',
                    '“I like having someone I do not need to impress,” Reyna says. “Turns out competence is less tiring when it is not a performance.”',
                ],
                early: [
                    '“Fine,” Reyna says. “You do your job, I do mine, and neither of us has made the other regret the arrangement.”',
                    'Reyna studies you. “Ask me after we have both had a reason to disappoint each other and chose not to.”',
                ],
            }),
        },
        {
            id: 'injury_check', label: 'You’re counting arrows and bandages at the same time.', reactive: true, priority: 72, cooldownDays: 1,
            condition: () => lowHp(),
            render: (ctx, state) => simple('the party’s injuries', state, [
                '“Because both run out,” Reyna says. “Sit down before I add patience to the list.”',
                'Reyna looks over the party. “Half of you are hurt and the other half are about to become hurt carrying the first half. We stop.”',
                '“A clean retreat is a skill,” Reyna says. “So is resting before retreat becomes the only skill still available.”',
            ]),
        },
        {
            id: 'northwatch', label: 'Do you miss working the border alone?', priority: 28, cooldownDays: 6,
            condition: () => !!quest('eyes_on_border') || !!quest('reyna_empty_blind') || !!window.campaign2NorthwatchCenter,
            render: (ctx, state) => {
                const arc = reynaArc();
                const lines = Number(arc.interdependence || 0) >= 10 ? [
                    '“Parts of it,” Reyna says. “Mostly the silence. Not the part where every mistake became mine because I refused to let anybody stand close enough to share it.”',
                    'Reyna shrugs. “Solo tracking is clean. Real problems rarely are. I am making peace with the inconvenience of other competent people.”',
                    '“I still like a lone blind,” Reyna says. “I just no longer confuse preferring solitude with proving I need nobody.”',
                ] : [
                    '“Yes,” Reyna says immediately. “One set of tracks, one judgement, nobody whispering at the wrong moment.” She pauses. “There were disadvantages too.”',
                    '“Working alone means never wondering whether someone else will fail you,” Reyna says. “It also means nobody is there when you fail yourself. I am aware of the arithmetic.”',
                    'Reyna looks north. “Sometimes I miss knowing exactly whose mistake every mistake would be.”',
                ];
                return { subject: 'solitude and the border', ...variant(state, lines) };
            },
        },
        {
            id: 'wren', label: 'You and Wren seem to understand each other.', priority: 27, cooldownDays: 6,
            condition: () => has('Wren Talbot'),
            render: (ctx, state) => simple('Wren', state, [
                'Reyna smirks. “We both notice exits. She does it because she worries people will leave. I do it because I prefer knowing how I would.”',
                '“Wren talks more than I do,” Reyna says. “Fortunately, some of it is useful.”',
                'Reyna glances toward Wren. “She is loyal enough to make herself miserable if she is not careful. I recognise the shape of a useful habit turning into a bad one.”',
                '“She is good company,” Reyna says. “Do not tell her I said that without charging for the information.”',
            ]),
        },
        {
            id: 'hunting_stories', label: 'Tell me about a hunt that went wrong.', priority: 24, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 35,
            render: (ctx, state) => simple('Reyna’s old hunts', state, [
                '“Boar hunt,” Reyna says. “I had the wind, the trail and a perfect ridge. Then my boot split. The boar escaped. I walked twelve miles with one foot wrapped in my shirt.”',
                '“Tamsin and I once tracked a supposed wolf for two days,” Reyna says. “Turned out to be three different farm dogs with overlapping bad habits.”',
                'Reyna sighs. “I spent a freezing night in a tree because I misjudged a bear’s patience. The bear was much more committed to the argument than I was.”',
                '“Worst miss of my life?” Reyna thinks. “Rabbit at twenty paces. Clean air, stationary target. Arrow went somewhere I still cannot explain. Tamsin mentioned it for six years.”',
            ]),
        },
        {
            id: 'institutions', label: 'Do you trust the Watch any more than you used to?', priority: 34, cooldownDays: 7,
            condition: () => !!quest('reyna_empty_blind'),
            render: (ctx, state) => {
                const arc = reynaArc();
                const trust = Number(arc.institutionalTrust || 0);
                const lines = trust >= 10 ? [
                    '“Ilsa, sometimes,” Reyna says. “The Watch as an idea? Conditionally. Institutions are people plus procedures. Either part can ruin the other.”',
                    '“More than before,” Reyna admits. “Mostly because I have seen one accept information that made its own job messier instead of punishing the messenger for convenience.”',
                    '“Trust with records,” Reyna says. “Trust with witnesses. Trust with oversight. Not trust because somebody put on the right badge.”',
                ] : [
                    '“No,” Reyna says. “I trust particular people inside it. That is not the same thing, and I am not ready to pretend it is.”',
                    '“A uniform can coordinate decent people,” Reyna says. “It can also help cowards distribute responsibility until nobody feels responsible.”',
                    'Reyna shrugs. “If the Watch wants trust, it can keep behaving in ways that earn it. I am not philosophically opposed to being persuaded.”',
                ];
                return { subject: 'institutions and trust', ...variant(state, lines) };
            },
        },
    ];

    const ALDEN_TOPICS = [
        {
            id: 'uncounted_aftermath', label: state => state.uses ? 'Has “The Uncounted” changed how you think about attachment?' : 'Do you still think about the Northwatch dead?',
            milestone: true, priority: 95, cooldownDays: 5, maxUses: 2,
            condition: () => quest('alden_uncounted')?.status === 'completed',
            render: (ctx, state) => {
                const result = quest('alden_uncounted')?.resolution;
                if (!state.uses) {
                    const text = {
                        restore_names: 'Alden nods. “Yes. I used to think insisting on individual names risked mistaking labels for people. I had not considered how easily institutions use the opposite argument to make people disappear.”',
                        quiet_memorial: '“Quiet remembrance still changes the person remembering,” Alden says. “Perhaps that is enough more often than I once believed.”',
                        hunt_missing: '“The missing body demanded urgency,” Alden says. “The other five demanded that urgency not become an excuse to forget them once the danger had a more dramatic shape.”',
                        rites_over_names: 'Alden folds his hands. “I still believe the rites mattered more than the inscription. I am less certain that belief excused us from doing both when both were possible.”',
                    }[result];
                    return { subject: 'the Uncounted dead', text: text || '“I still think about them,” Alden says. “Especially the ease with which a number replaced a set of lives.”', variantIndex: 0 };
                }
                const arc = aldenArc();
                return {
                    subject: 'particular people and universal compassion', variantIndex: 1,
                    text: Number(arc.particularity || 0) >= 10
                        ? '“Universal compassion is a beautiful idea,” Alden says. “I no longer think it is complete if it cannot be interrupted by one particular person needing you to remember their name.”'
                        : '“I still distrust the ego’s desire to make every bond unique and permanent,” Alden says. “But I am learning that detachment can become abstraction long before it becomes wisdom.”',
                };
            },
        },
        {
            id: 'relationship_checkin', label: 'What are we to each other, these days?', priority: 53, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 42 || Number(ctx.affinity?.friendship || 0) >= 45,
            render: (ctx, state) => relationshipLines(ctx, state, {
                romantic: [
                    'Alden smiles softly. “People ask whether love without desire feels incomplete. It does not. What I want from you is presence, honesty and the freedom to keep choosing one another.”',
                    '“I find myself arranging imagined futures with you still in them,” Alden says. “That remains the clearest description of romance I have found for myself.”',
                    'Alden considers. “Close. Committed. Not possessed. I am content with all three statements.”',
                ],
                friend: [
                    '“Friendship,” Alden says. “The word is ordinary enough that people forget how strange it is to choose responsibility for another person’s wellbeing without law or blood requiring it.”',
                    'Alden smiles. “You are one of the people whose absence changes the texture of a room. I think that qualifies as closeness.”',
                    '“I trust our silences,” Alden says. “That is rarer than trusting conversation.”',
                ],
                early: [
                    '“Companions for now,” Alden says. “There is no need to rush every relationship into a final definition.”',
                    'Alden inclines his head. “We are becoming less hypothetical to one another. That seems sufficient progress.”',
                ],
            }),
        },
        {
            id: 'injury_check', label: 'You’ve gone quiet since the fight.', reactive: true, priority: 70, cooldownDays: 1,
            condition: () => lowHp(),
            render: (ctx, state) => simple('the party’s injuries', state, [
                '“Pain narrows attention,” Alden says. “Sometimes useful. At present I would prefer everyone broaden theirs enough to eat, drink and rest.”',
                'Alden sits beside the most injured party member. “There is no virtue in suffering an injury twice: once from the blow and once from refusing care.”',
                '“Mortality is not improved by pretending not to have a body,” Alden says. “Sit.”',
            ]),
        },
        {
            id: 'aldric', label: 'You and Aldric talk about duty very differently.', priority: 29, cooldownDays: 7,
            condition: () => has('Ser Aldric Thorne'),
            render: (ctx, state) => simple('Aldric and duty', state, [
                '“Aldric begins with the promise,” Alden says. “I begin with the attachment beneath it. We often arrive at similar duties by opposite roads.”',
                'Alden smiles. “He worries detachment can become an excuse not to care. I worry devotion can become an excuse not to let go. Both accusations have occasionally been deserved.”',
                '“Aldric’s vows give his care a shape,” Alden says. “My discipline tries to stop care becoming possession. I do not think either method has exclusive rights to wisdom.”',
                'Alden glances toward Aldric. “He is very good at carrying burdens. His next lesson may be discovering which burdens become lighter when handed to someone else without becoming less sacred.”',
            ]),
        },
        {
            id: 'silence', label: 'What do you think about when you’re sitting there silently?', priority: 18, cooldownDays: 2,
            render: (ctx, state) => simple('silence and contemplation', state, [
                '“Often? Nothing especially profound,” Alden says. “The breath. A sound. An itch I am attempting not to dignify with action.”',
                '“People imagine meditation is an absence of thought,” Alden says. “Mostly it is discovering how many thoughts arrive when nobody has invited them.”',
                'Alden smiles. “Today I was wondering whether Wren has ever completed a meal without telling a story halfway through it.”',
                '“Sometimes I rehearse arguments,” Alden admits. “Contemplative traditions contain rather more imaginary debates than the paintings suggest.”',
                '“Silence is useful because it does not automatically agree with you,” Alden says. “Conversation has people polite enough to make that mistake.”',
            ]),
        },
        {
            id: 'monastery_stories', label: 'Tell me something about the monastery that wasn’t solemn.', priority: 24, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 35,
            render: (ctx, state) => simple('Alden’s monastery life', state, [
                'Alden smiles. “Brother Caldus once maintained a vow of silence for six months and then broke it by shouting at a goose. Nobody considered the vow spiritually diminished.”',
                '“We had a novice who hid sweetcakes in the meditation hall because he believed nobody would search somewhere dedicated to renunciation,” Alden says. “His reasoning was excellent. His wrapping was noisy.”',
                '“I learned open-palm forms beside a courtyard plum tree,” Alden says. “For three years I blamed my poor balance on the roots. When they paved the courtyard, my balance remained poor.”',
                'Alden’s eyes brighten. “Once a travelling actor convinced half the novices that the abbot had secretly written a romantic play in his youth. The abbot refused to deny it, which made the rumour immortal.”',
            ]),
        },
        {
            id: 'death_and_necromancy', label: 'Has everything with Ashgrave changed how you think about death?', priority: 38, cooldownDays: 7,
            condition: () => !!quest('necromancer_hunt') || !!quest('necromancer_lichdom') || !!window.phylacteryReturned,
            render: (ctx, state) => simple('death and necromancy', state, [
                '“It has made me less comfortable with easy slogans,” Alden says. “Accepting death is not the same as refusing medicine. Preserving memory is not preserving a soul. The distinctions matter most where fear wants to erase them.”',
                '“Ashgrave treated impermanence as an engineering defect,” Alden says. “That is a powerful temptation: if loss hurts, perhaps the universe is wrong. I do not think pain grants us that conclusion.”',
                'Alden folds his hands. “The dead are not raw material for the living. Nor are they merely lessons. Sometimes the respectful response to a death is simply to let the fact remain difficult.”',
            ]),
        },
        {
            id: 'lich_response', label: 'Does my becoming a lich change what I am to you?', reactive: true, priority: 110, cooldownDays: 3,
            condition: () => !!window.playerIsLich,
            render: (ctx, state) => simple('the player’s lichdom', state, [
                'Alden is quiet for a long moment. “It changes facts about you. I am unwilling to decide in advance that those facts erase the person with whom I have shared all these days.”',
                '“Impermanence is not merely a sentence imposed on us,” Alden says. “It shapes how we value time and release. You have stepped outside part of that condition. I do not yet know what it will ask of you.”',
                'Alden meets your eyes. “If you become cruel, I will call it cruelty. If you remain compassionate, I will not call compassion false merely because your heart no longer beats. The harder judgement is the one made deed by deed.”',
            ]),
        },
    ];

    function install() {
        const memory = api();
        if (!memory || !window.npcDialogueTrees) return false;
        memory.registerTopics(MIRABEL, MIRABEL_TOPICS);
        memory.registerTopics(FENN, FENN_TOPICS);
        memory.registerTopics(REYNA, REYNA_TOPICS);
        memory.registerTopics(ALDEN, ALDEN_TOPICS);
        memory.installDialogueEntry('companion_mirabel_quill', MIRABEL);
        memory.installDialogueEntry('companion_fenn_oakheart', FENN);
        memory.installDialogueEntry('companion_reyna_fletcher', REYNA);
        memory.installDialogueEntry('companion_brother_alden', ALDEN);
        return true;
    }

    window.otherCompanionEvergreenDialogue = {
        build: BUILD,
        mirabelTopics: MIRABEL_TOPICS,
        fennTopics: FENN_TOPICS,
        reynaTopics: REYNA_TOPICS,
        aldenTopics: ALDEN_TOPICS,
        install,
    };
    window.OTHER_COMPANION_EVERGREEN_DIALOGUE_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = window.otherCompanionEvergreenDialogue;

    install();
    if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    if (typeof document !== 'undefined') setTimeout(install, 0);
})();
