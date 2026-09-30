// wrenAldricEvergreenDialogue.js
// Pilot authored topic pools for the companion conversation-memory system.
//
// These are intentionally mixtures of:
//   * milestone follow-ups that appear because the story changed;
//   * reactive subjects that become salient because of the current party state;
//   * evergreen conversations that can return after long in-world cooldowns;
//   * finite personal-history anecdotes that eventually exhaust rather than loop.
//
// The system selects among authored material. It never fabricates dialogue.
(() => {
    'use strict';

    const BUILD = '20260930-wren-aldric-evergreen-v1';
    const WREN = 'Wren Talbot';
    const ALDRIC = 'Ser Aldric Thorne';
    const DAY = 86400;

    const memoryApi = () => window.companionConversationMemory;
    const q = id => (window.questLog || []).find(entry => entry?.id === id) || null;
    const member = name => (window.party || []).find((m, i) => i > 0 && m?.name === name) || null;
    const has = name => !!member(name);
    const lowHp = () => (window.party || []).some(m => Number(m?.maxHp || 0) > 0 && Number(m?.hp || 0) / Number(m.maxHp) < 0.45);

    function variant(state, lines) {
        const index = Math.max(0, Number(state?.uses || 0)) % lines.length;
        return { text: lines[index], variantIndex: index };
    }

    function simple(subject, state, lines) {
        return { subject, ...variant(state, lines) };
    }

    function wrenCrownOutcome(ctx, state) {
        const quest = q('wren_crown_quiet_hand');
        const security = Number(ctx.companion?.characterArc?.security || 0);
        const resolution = quest?.resolution;
        const first = {
            public_truth: 'Wren rubs at the edge of her journal. “I thought hearing the Crown admit it would feel bigger. Trumpets, maybe. Mostly I feel tired. But Mum and Dad are names again, not a line somebody hid in a transport account. I’ll take that.”',
            sworn_truth: '“Vane said it out loud,” Wren says. “No clever code. No ‘witness settlement’. Mum and Dad. Murdered, then hidden because admitting it was inconvenient.” She exhales. “That matters more than I expected.”',
            wren_chose: 'Wren gives you a crooked look. “You know the bit I keep coming back to? You could have told me what justice was supposed to look like. You didn’t. You made me choose what happened to my own dead.”',
            buried_for_stability: 'Wren is quiet for long enough that the silence becomes uncomfortable. “I understand the argument. Grain moved. People ate. And apparently that was enough to make Mum and Dad administratively inconvenient.”',
        }[resolution] || 'Wren looks down at her hands. “At least we know the whole shape of it now. Venn killed them. Other people decided the truth was too expensive.”';
        if ((state?.uses || 0) === 0) return { subject: 'her parents after Silverhart', text: first, variantIndex: 0 };
        return {
            subject: 'what closure means now',
            variantIndex: 1,
            text: security >= 30
                ? '“I used to think losing somebody meant they’d left you,” Wren says. “Stupid when you say it plainly. Mum and Dad didn’t leave. They were taken. I’m trying to stop treating every goodbye like proof I wasn’t worth staying for.”'
                : 'Wren stares ahead. “Knowing they didn’t leave should make this easier. It does, a bit. My head knows the difference. The rest of me is taking longer to catch up.”',
        };
    }

    function wrenRelationship(ctx, state) {
        const mode = ctx.romance?.mode;
        const security = Number(ctx.companion?.characterArc?.security || 0);
        let lines;
        if (mode === 'romantic' || mode === 'love_desire_conflict' || Number(ctx.affinity?.romanticBond || 0) >= 50) {
            lines = security >= 30 ? [
                'Wren smiles without looking at you. “You know what’s new? Missing you when you walk ten paces away without immediately inventing a tragedy to explain it. Very mature of me.”',
                '“I’m getting better at wanting you here without needing you here,” Wren says. “That sounded less romantic out loud. I mean it as a good thing.”',
                'Wren nudges your shoulder. “Still choosing me?” She catches herself and snorts. “No, don’t answer that like it’s a test. Old habit.”',
            ] : [
                '“Sometimes I still check whether you’re angry before I’ve even worked out if anything happened,” Wren admits. “I know that’s mine to unlearn. Just… be patient when you can.”',
                'Wren twists a loose thread around one finger. “I’m trying very hard not to turn loving somebody into a full-time attempt to stop them leaving.”',
                '“If I get clingy, tell me,” Wren says. “Not cruelly. I will absolutely be unbearable about it. But tell me.”',
            ];
        } else if (Number(ctx.affinity?.friendship || 0) >= 55) {
            lines = [
                '“You’re annoyingly easy to have around,” Wren says. “That is friendship, apparently. Nobody warned me.”',
                'Wren grins. “At some point you stopped being the person I was travelling with and became the person I save stories for. Horrifying.”',
                '“If we survive all this, you’re still buying the first round,” Wren says. “Friendship has rules.”',
            ];
        } else {
            lines = [
                'Wren shrugs. “We’re alright, aren’t we? Still learning which bits of you are habits and which bits are warning signs.”',
                '“You’re less mysterious than when we started,” Wren says. “Not necessarily better. Just less mysterious.”',
            ];
        }
        return { subject: 'the relationship between you', ...variant(state, lines) };
    }

    const WREN_TOPICS = [
        {
            id: 'crown_aftermath',
            label: state => state.uses ? 'Does knowing the truth feel different now?' : 'How are you feeling about your parents now?',
            milestone: true,
            priority: 95,
            cooldownDays: 4,
            maxUses: 2,
            condition: () => q('wren_crown_quiet_hand')?.status === 'completed',
            render: wrenCrownOutcome,
        },
        {
            id: 'injury_check', label: 'You keep looking everyone over. What is it?', reactive: true,
            priority: 75, cooldownDays: 1, condition: () => lowHp(),
            render: (ctx, state) => simple('the party being hurt', state, [
                '“Counting,” Wren says. “Who’s limping, who’s pretending not to limp, who needs a potion and who needs five minutes without somebody shouting ‘we should press on’.”',
                'Wren points at the worst-looking member of the party. “That. That is why I’m staring. Heroes are apparently allergic to admitting they’re bleeding.”',
                '“Nobody gets to die because stopping for an hour felt inefficient,” Wren says. “I’ve had enough stupid losses for one lifetime.”',
            ]),
        },
        {
            id: 'relationship_checkin', label: 'How are we doing?', priority: 55, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 50 || Number(ctx.affinity?.friendship || 0) >= 50,
            render: wrenRelationship,
        },
        {
            id: 'hollowmere', label: 'Do you miss Hollowmere?', priority: 35, cooldownDays: 5,
            condition: () => !!window.hollowmereEventFired || !!q('goblin_threat') || !!q('goblin_problem'),
            render: (ctx, state) => simple('Hollowmere', state, [
                '“Course I do,” Wren says. “Not every minute. Sometimes I miss Garrick’s stew and then remember Garrick’s stew.”',
                '“I miss knowing which floorboard creaks outside the Tankard kitchen,” Wren says. “Tiny useless things. That’s mostly what home is, I think.”',
                'Wren smiles. “I miss Hollowmere most when somewhere else starts feeling familiar. Like my brain thinks there’s only supposed to be room for one place.”',
                '“I’ll go back,” Wren says. “That’s different from saying I have to stay there forever for it to still be home.”',
            ]),
        },
        {
            id: 'road_smalltalk', label: 'How are you finding the road?', priority: 18, cooldownDays: 2,
            render: (ctx, state) => simple('life on the road', state, [
                '“Feet hurt. Pack’s too heavy. Saw a bird earlier that looked personally offended by Aldric.” Wren grins. “Good day, really.”',
                '“I’ve learned three things travelling,” Wren says. “Dry socks matter, every inn lies about its beds, and nobody ever packs enough cheese.”',
                'Wren stretches. “I used to think adventurers were constantly doing heroic things. Turns out most of it is walking toward the next heroic thing.”',
                '“Road’s fine,” Wren says. “Ask me again after it rains. I reserve the right to become philosophically opposed to mud.”',
                '“I like waking up somewhere new more than I expected,” Wren says. “Don’t tell anyone. I have a reputation for complaining.”',
            ]),
        },
        {
            id: 'aldric', label: 'What do you make of Aldric?', priority: 32, cooldownDays: 6,
            condition: () => has(ALDRIC),
            render: (ctx, state) => {
                const measure = q('aldric_measure_of_oath');
                const lines = measure?.status === 'completed' ? [
                    '“He’s better since that business with the Vigil,” Wren says. “Still heroic enough to be exhausting, but at least now he knows sharing a burden isn’t the same as dropping it.”',
                    'Wren lowers her voice. “Aldric could turn fetching water into a sacred obligation. I think he’s learning he’s allowed to ask somebody else to carry the second bucket.”',
                    '“I trust him,” Wren says. “Which is annoying, because he makes being decent look like a full-time administrative position.”',
                ] : [
                    '“He’s solid,” Wren says. “Possibly literally. Have you seen the amount of armour?”',
                    '“Aldric worries me when he starts talking about what he owes,” Wren says. “People like him can make a prison out of being good.”',
                    'Wren shrugs. “If Aldric says he’ll hold a door, that door is held. Useful quality. Slightly terrifying person to make a promise to.”',
                ];
                return { subject: 'Aldric', ...variant(state, lines) };
            },
        },
        {
            id: 'mirabel', label: 'You and Mirabel still disagree about magic, don’t you?', priority: 28, cooldownDays: 6, maxUses: 4,
            condition: () => has('Mirabel Quill'),
            render: (ctx, state) => simple('Mirabel and magic', state, [
                '“I don’t dislike magic,” Wren says. “I dislike things exploding because somebody said ‘this is probably safe’ with too much enthusiasm. Mirabel understands the distinction. Mostly.”',
                'Wren glances toward Mirabel. “She’s clever enough to make dangerous ideas sound reasonable. I think that’s why I listen when she says something is actually dangerous.”',
                '“We disagree less than we used to,” Wren says. “Apparently ‘magic is terrifying’ and ‘magic is fascinating’ can both be true. Awful compromise.”',
                'Wren grins. “If Mirabel ever says ‘interesting’ in that particular voice, start walking away before you ask what she found.”',
            ]),
        },
        {
            id: 'old_hollowmere_stories', label: 'Tell me something I don’t know about you.', priority: 25, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 40,
            render: (ctx, state) => simple('old stories about Wren', state, [
                'Wren groans. “Fine. I once spent two weeks telling everyone in Hollowmere I could talk to crows. I could not. One crow happened to steal Oskar’s breakfast immediately after I insulted him, and the lie got out of hand.”',
                '“When I was twelve I tried to sleep on the Tankard roof because I’d decided being indoors was childish,” Wren says. “It rained. Garrick left me up there until morning on principle.”',
                'Wren looks embarrassed. “I used to practise heroic speeches behind the mill. Full sword-pointed-at-the-horizon nonsense. If you ever repeat that, I’ll deny everything.”',
                '“Mum taught me cards,” Wren says. “Dad taught me cheating at cards. They disagreed quite strongly about which lesson was more useful.”',
            ]),
        },
        {
            id: 'lich_tension', label: 'You’ve been watching me since the lich ritual.', reactive: true,
            priority: 110, cooldownDays: 3,
            condition: () => !!window.playerIsLich,
            render: (ctx, state) => simple('the player becoming a lich', state, [
                '“Yes,” Wren says flatly. “Because you changed something enormous about yourself and I’m still working out what parts of you came back with us.”',
                'Wren folds her arms. “I can care about you and still hate what you chose. Apparently I get to contain more than one thought at a time.”',
                '“I’m not going to ask every morning whether you’re still you,” Wren says. “But I am going to notice what you do with forever.”',
            ]),
        },
    ];

    function aldricMeasureOutcome(ctx, state) {
        const quest = q('aldric_measure_of_oath');
        const resolution = quest?.resolution;
        const arc = ctx.companion?.aldricCharacterArc || {};
        const lines = {
            literal_return: 'Aldric rests a hand on the Silver Vigil seal. “I chose the promise as I originally spoke it. I do not regret taking vows seriously. I am less certain that seriousness always requires the narrowest possible reading.”',
            bounded_service: '“The hospice will have service, and then people trained to continue it,” Aldric says. “A year ago I might have called that compromise. Now I think a promise that only works while one person destroys himself keeping it was badly designed.”',
            formal_release: 'Aldric is quiet before answering. “I asked to be released, and the Order released me. I expected relief to feel like guilt. Mostly it feels like discovering that an honest promise can end honestly.”',
            aldric_decides: '“You made me choose,” Aldric says. “I resented that for perhaps half a minute.” A small smile. “Then I realised that was the point. It is difficult to call something my vow while demanding someone else decide what it means.”',
            ignore_order: 'Aldric’s jaw tightens. “I still think there was an honest way through that did not require pretending the promise meant nothing. I would rather be released from a duty than train myself to stop noticing duties when they become inconvenient.”',
        };
        if ((state?.uses || 0) === 0) return { subject: 'the Silver Vigil oath', text: lines[resolution] || '“I am still thinking about what the Vigil asked of me,” Aldric says. “The answer mattered less than learning to ask what the promise was actually for.”', variantIndex: 0 };
        return {
            subject: 'what duty means now', variantIndex: 1,
            text: Number(arc.sharedBurden || 0) >= 15
                ? '“I used to admire the person who could carry the whole burden alone,” Aldric says. “Now I suspect that is sometimes merely pride wearing armour. A duty that survives us needs more than one pair of shoulders.”'
                : '“I still have to remind myself that asking for help is not the first step toward abandoning the task,” Aldric says. “Old instincts do not vanish because one conversation was persuasive.”',
        };
    }

    function aldricRelationship(ctx, state) {
        const mode = ctx.romance?.mode;
        let lines;
        if (mode === 'romantic' || Number(ctx.affinity?.romanticBond || 0) >= 50) {
            lines = [
                'Aldric meets your eyes. “We are well. And if we are not, I would rather hear an uncomfortable truth from you than preserve harmony by guessing.”',
                '“I do not need reassurance every day,” Aldric says. “I do need honesty when something changes. Those are different things.”',
                'Aldric smiles faintly. “I have discovered that commitment is less like swearing one great vow and more like keeping a hundred small appointments with the same person.”',
            ];
        } else if (Number(ctx.affinity?.friendship || 0) >= 55) {
            lines = [
                '“I trust you,” Aldric says simply. “That sentence has acquired more weight for me than it once had.”',
                'Aldric considers. “We disagree often enough that I am reasonably confident the friendship is real.”',
                '“You are one of the people I would ask to tell me when I am being a fool,” Aldric says. “That is not permission to enjoy it excessively.”',
            ];
        } else {
            lines = [
                '“We are learning one another,” Aldric says. “I prefer that to assuming familiarity before it is earned.”',
                'Aldric nods once. “No complaint. No grand declaration either. Those tend to be worth more after time has tested them.”',
            ];
        }
        return { subject: 'the relationship between you', ...variant(state, lines) };
    }

    const ALDRIC_TOPICS = [
        {
            id: 'measure_aftermath', label: state => state.uses ? 'Has your idea of duty changed?' : 'How do you feel about the Vigil’s summons now?',
            milestone: true, priority: 95, cooldownDays: 5, maxUses: 2,
            condition: () => q('aldric_measure_of_oath')?.status === 'completed', render: aldricMeasureOutcome,
        },
        {
            id: 'broken_vigil', label: 'Do you still think about the west road?', priority: 42, cooldownDays: 7, maxUses: 4,
            condition: () => q('aldric_broken_vigil')?.status === 'completed',
            render: (ctx, state) => simple('the Broken Vigil', state, [
                '“Less often,” Aldric says. “For years I replayed the moment the line failed and supplied six cowards where I lacked six explanations. Knowing the order changed the memory.”',
                '“I was proud of keeping my vow,” Aldric says. “Too proud, perhaps. It made it easy to think anyone who left must be weaker than I was.”',
                'Aldric exhales. “The worst part was not that Ironbond broke faith. It was how eagerly I let anger simplify people I had never bothered to understand.”',
                '“I would still hold the road,” Aldric says. “I would simply ask harder questions about who else promised to hold it with me.”',
            ]),
        },
        {
            id: 'injury_watch', label: 'You’re checking everyone’s wounds again.', reactive: true,
            priority: 72, cooldownDays: 1, condition: () => lowHp(),
            render: (ctx, state) => simple('the party’s injuries', state, [
                '“Yes,” Aldric says. “People become remarkably philosophical about injuries when the alternative is admitting they need bandages.”',
                'Aldric gestures for the worst-injured party member to sit. “Courage is not measured by how efficiently you convert blood into distance travelled.”',
                '“We stop,” Aldric says. “Whatever is chasing us can enjoy the tactical advantage of facing people who are not dying of preventable stupidity.”',
            ]),
        },
        {
            id: 'relationship_checkin', label: 'How are we doing?', priority: 52, cooldownDays: 7,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 45 || Number(ctx.affinity?.friendship || 0) >= 45,
            render: aldricRelationship,
        },
        {
            id: 'road_discipline', label: 'Do you ever actually relax on the road?', priority: 18, cooldownDays: 2,
            render: (ctx, state) => simple('life on the road', state, [
                'Aldric looks genuinely puzzled. “I am relaxed.” He is, at that moment, sharpening a sword while checking the camp perimeter.',
                '“Routine is restful,” Aldric says. “Weapon cleaned, watch arranged, pack dry. Chaos requires much more energy.”',
                'Aldric smiles. “I can relax perfectly well. I simply prefer to do it after ensuring none of us will wake to discover the horses gone.”',
                '“I once tried travelling without a morning routine,” Aldric says. “I disliked it so much that I became more disciplined out of spite.”',
                'Aldric considers the question. “Perhaps I should learn a hobby that cannot be described as maintenance.”',
            ]),
        },
        {
            id: 'wren', label: 'What do you make of Wren?', priority: 31, cooldownDays: 6,
            condition: () => has(WREN),
            render: (ctx, state) => {
                const crown = q('wren_crown_quiet_hand');
                const lines = crown?.status === 'completed' ? [
                    '“She is stronger now,” Aldric says, then shakes his head. “No. That is unfair. She was strong before. She is less frightened that strength requires holding everything tightly enough that nothing can leave.”',
                    'Aldric smiles. “Wren makes irreverence look like a survival skill. I am beginning to suspect it is one.”',
                    '“She has a good instinct for the moment principle starts becoming an excuse,” Aldric says. “Usually expressed with significantly more swearing than the Vigil used in its manuals.”',
                ] : [
                    '“Quick mind. Quicker mouth,” Aldric says. “And more loyalty than she knows what to do with.”',
                    'Aldric glances toward Wren. “She jokes when something matters too much. I pray when something matters too much. I am not convinced mine is inherently more sophisticated.”',
                    '“I trust her in a fight,” Aldric says. “Outside one, I trust her to tell me exactly what she thinks of my decisions. Repeatedly.”',
                ];
                return { subject: 'Wren', ...variant(state, lines) };
            },
        },
        {
            id: 'alden', label: 'You and Alden have very different kinds of faith.', priority: 28, cooldownDays: 7, maxUses: 4,
            condition: () => has('Brother Alden'),
            render: (ctx, state) => simple('Alden and faith', state, [
                '“Alden begins where I usually end,” Aldric says. “He asks what attachment itself is doing to the mind. I usually ask what the attached person is owed. Both questions are useful.”',
                'Aldric smiles. “He can sit silently for an hour without appearing uncomfortable. I can stand guard silently for an hour. We each suspect the other is somehow doing the easier version.”',
                '“Detachment can prevent selfishness,” Aldric says. “So can commitment. Either can also become a respectable word for fear if you are not careful.”',
                '“Alden reminds me that devotion does not have to sound like an oath,” Aldric says. “I suspect I remind him that sometimes a promise benefits from being said aloud.”',
            ]),
        },
        {
            id: 'vigil_stories', label: 'Tell me something about the Silver Vigil that isn’t about vows.', priority: 24, cooldownDays: 4, maxUses: 4,
            condition: ctx => Number(ctx.relationship?.familiarity || 0) >= 35,
            render: (ctx, state) => simple('old Silver Vigil stories', state, [
                'Aldric thinks. “My first winter patrol, I spent three hours tracking what I was certain was a wounded traveller. It was a goat with a blanket caught on its horns. The goat was not grateful for rescue.”',
                '“The Vigil has a hymn for dawn departures,” Aldric says. “Forty-seven verses. Nobody has sung all forty-seven since a prior threatened to assign latrine duty to the next person who tried.”',
                'Aldric’s mouth twitches. “I once lost a formal theological debate to a nine-year-old girl at Saint Orra’s because she asked why an omniscient god needed us to report anything in prayer. I still do not have a better answer than I did then.”',
                '“My shield was stolen during initiation,” Aldric says. “Traditional prank. I found it hanging over the refectory door with flowers painted around the Vigil sun. They made me keep the flowers for a month.”',
            ]),
        },
        {
            id: 'shared_burden', label: 'Are you getting any better at letting other people help?', priority: 36, cooldownDays: 6,
            condition: ctx => !!ctx.companion?.aldricCharacterArc,
            render: (ctx, state) => {
                const shared = Number(ctx.companion?.aldricCharacterArc?.sharedBurden || 0);
                const lines = shared >= 15 ? [
                    'Aldric nods. “Yes. I still notice the impulse to take the heaviest part automatically. Now I sometimes ask whether doing so actually helps, or merely lets me feel indispensable.”',
                    '“Delegation,” Aldric says solemnly. “A miraculous discipline in which other competent people perform tasks and the world inexplicably continues.”',
                    '“Better,” Aldric says. “Not perfect. I have begun to understand that being needed and being useful are not identical.”',
                ] : [
                    'Aldric grimaces. “Intellectually? Yes. In practice I still discover I have volunteered for three watches and the heaviest pack before anyone notices.”',
                    '“Ask me after I manage to watch somebody else carry a responsibility badly without immediately taking it away from them,” Aldric says.',
                    '“I am trying,” Aldric says. “Unfortunately, knowing one has a martyrdom problem does not immediately make martyrdom less efficient.”',
                ];
                return { subject: 'sharing burdens', ...variant(state, lines) };
            },
        },
        {
            id: 'lich_response', label: 'What do you think I’ve become?', reactive: true,
            priority: 110, cooldownDays: 3, condition: () => !!window.playerIsLich,
            render: (ctx, state) => simple('the player becoming a lich', state, [
                'Aldric takes his time. “Someone I care about who chose a form of undeath I was taught to oppose. Neither half of that sentence cancels the other.”',
                '“I will judge what you do,” Aldric says. “I will also not pretend the method by which you gained this power is morally irrelevant simply because I know your name.”',
                'Aldric meets your eyes. “Immortality does not reduce your obligations. If anything, it removes one of the excuses mortals use for postponing them.”',
            ]),
        },
    ];

    function install() {
        const api = memoryApi();
        if (!api || !window.npcDialogueTrees) return false;
        api.registerTopics(WREN, WREN_TOPICS);
        api.registerTopics(ALDRIC, ALDRIC_TOPICS);
        api.installDialogueEntry('companion_wren_talbot', WREN);
        api.installDialogueEntry('companion_ser_aldric', ALDRIC);
        return true;
    }

    window.wrenAldricEvergreenDialogue = { build: BUILD, wrenTopics: WREN_TOPICS, aldricTopics: ALDRIC_TOPICS, install };
    window.WREN_ALDRIC_EVERGREEN_DIALOGUE_BUILD = BUILD;
    if (typeof module !== 'undefined' && module.exports) module.exports = window.wrenAldricEvergreenDialogue;

    install();
    if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    if (typeof document !== 'undefined') setTimeout(install, 0);
})();
