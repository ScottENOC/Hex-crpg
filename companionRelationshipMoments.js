// companionRelationshipMoments.js
// Authored everyday relationship moments for the six core companions.
//
// The hidden relationship systems remain authoritative. This module only turns
// their state into lived-in dialogue and camp texture: it never awards
// friendship/romance/attraction points and never treats attraction as consent.
(function (root) {
'use strict';

const BUILD = '20261001-companion-relationship-moments-v1';
const DAY = 86400;
const TOPIC_ID = 'relationship_everyday_moment';
const DIALOGUE_IDS = Object.freeze({
  'Wren Talbot': 'companion_wren_talbot',
  'Ser Aldric Thorne': 'companion_ser_aldric',
  'Mirabel Quill': 'companion_mirabel_quill',
  'Fenn Oakheart': 'companion_fenn_oakheart',
  'Reyna Fletcher': 'companion_reyna_fletcher',
  'Brother Alden': 'companion_brother_alden',
});
const CORE_NAMES = Object.freeze(Object.keys(DIALOGUE_IDS));
const GENERIC_ROOTS = new Set(['Mirabel Quill', 'Fenn Oakheart', 'Reyna Fletcher', 'Brother Alden']);
let topicsInstalled = false;
let campListenerInstalled = false;
let refreshTimer = null;

const POOLS = Object.freeze({
  'Wren Talbot': Object.freeze({
    early: Object.freeze([
      'Wren falls into step beside you. “You know, when I agreed to travel with you, I assumed you would become less strange once I knew you better. So far the evidence is mixed.”',
      '“You can ask me things, you know,” Wren says. “Not everything. I reserve the right to tell you to mind your own business. But you can ask.”',
      'Wren studies you for a beat. “I still haven’t decided whether you’re reassuringly competent or just very convincing while improvising.”',
      '“Quiet company is allowed,” Wren says, settling nearby. “I checked. There isn’t a rule saying we have to fill every silence with a tragic backstory.”',
    ]),
    friend: Object.freeze([
      'Wren nudges a loose stone with her boot. “At some point you became the person I save stories for. Annoying development, really. Now things happen and I think, wait until I tell you.”',
      '“If this adventuring business collapses,” Wren says, “I think we could make a respectable living sitting in taverns and judging everyone who walks through the door.”',
      'Wren drops down beside you with a sigh. “I don’t need anything. I’m just sitting here. Apparently friendship can involve being deliberately in someone’s vicinity.”',
      '“I like that I can be in a foul mood around you without having to turn it into a performance,” Wren says. “Don’t look pleased. That was almost a compliment.”',
      'Wren grins. “You’ve reached the stage where I’ll tell you when you’re being an idiot instead of politely watching the consequences. Treasure it.”',
    ]),
    attracted: Object.freeze([
      'Wren catches herself looking at you and immediately raises an eyebrow. “What? I’m allowed to notice things.”',
      '“You’re doing that thing again,” Wren says. When you ask what thing, she looks away too quickly. “Nothing. Never mind. Deeply irritating face, that’s all.”',
      'Wren’s teasing lands a little softer than usual. “Careful. Keep looking pleased with yourself and I might start thinking you’re doing it on purpose.”',
      '“There is a difference between liking somebody and finding them distracting,” Wren says. “You, unfortunately, seem determined to make me research the overlap.”',
    ]),
    romantic: Object.freeze([
      'Wren sits close enough that the choice is obvious, but leaves the last little distance to you. “I like this bit,” she says. “No crisis. No grand declaration. Just knowing we’re here.”',
      '“I used to think love was mostly the terrifying part where somebody gains the ability to ruin you,” Wren says. “Turns out there’s also this very inconvenient part where being near them makes an ordinary day better.”',
      'Wren smiles down at her hands. “I’m trying to get used to wanting you here without turning that into needing proof you’ll never leave. I think I’m getting better.”',
      '“I know what I feel,” Wren says. “I’m less interested now in forcing it to look like somebody else’s relationship. Ours gets to be ours.”',
      'Wren glances sideways at you. “Still strange, this. Good strange. Don’t make me repeat that where anyone can hear.”',
    ]),
    committed: Object.freeze([
      '“You know what I like about us?” Wren says. “I can miss you without immediately assuming it means I’ve lost you. That feels embarrassingly revolutionary.”',
      'Wren settles beside you with the ease of habit. “There. Better. I wasn’t unhappy before. You’re just one of the things that makes a place feel more like mine.”',
      '“I’m choosing you today,” Wren says lightly, then grows more serious. “Not because I promised once and now we’re trapped by grammar. Because I am.”',
      'Wren watches the road ahead. “If we ever stop fitting, we say so. Properly. Until then, you’re stuck with me because I keep deciding to be here.”',
      '“No relationship test tonight,” Wren says. “No asking whether you still care, no inventing catastrophes. I’m simply going to enjoy the outrageous fact that you do.”',
    ]),
    strained: Object.freeze([
      'Wren keeps a careful distance. “I can still care about you and be angry. I’m trying not to turn either feeling into a lie about the other.”',
      '“I don’t want reassurance if nothing has actually changed,” Wren says. “I want us to be honest enough that reassurance means something when it comes.”',
      'Wren exhales through her nose. “I’m here. That is not the same as saying everything is fine. We can let both things be true for a while.”',
    ]),
    campFriend: Object.freeze([
      'By the fire, Wren produces a badly squashed piece of food from somewhere in her pack. “Emergency ration,” she says, breaking it in two. “The emergency is that I don’t want to eat it alone.”',
      'Wren sits on the far side of the fire and starts rating everyone’s camp-making technique with the confidence of someone who did none of the difficult jobs.',
      'Once the camp quiets, Wren tells you a completely inconsequential Hollowmere story and keeps adding details whenever you think it has finished.',
    ]),
    campRomantic: Object.freeze([
      'Wren lingers beside you after the others settle. “I like camps,” she admits. “Everyone stops moving long enough that I can remember we’re people, not just a collection of urgent problems.”',
      'Wren chooses a place near yours for the night, looks at you as if daring you to make it significant, then smiles when you wisely do not.',
      'The fire burns low while Wren talks quietly about nothing important. She seems pleased that nothing important needs saying.',
    ]),
    campCommitted: Object.freeze([
      'Wren settles into the familiar space beside you. “Wake me if you have a nightmare,” she murmurs. “Or if you’re cold. Or if you discover a compelling reason we should both eat cheese at three in the morning.”',
      'As the camp winds down, Wren looks around at the tents, the fire and the familiar faces. “Not a bad little life, in the gaps between disasters.”',
      'Wren catches your eye across the fire and smiles without checking what the smile means. The lack of anxiety seems to please her almost as much as your company.',
    ]),
    campWatch: Object.freeze([
      'Wren takes watch with exaggerated dignity. “Sleep. I promise to wake you for anything more threatening than a judgmental owl.”',
      'On watch, Wren keeps glancing back toward the sleeping camp. When she sees you awake, she whispers, “Go back to sleep. One of us should make sensible decisions.”',
    ]),
    campCold: Object.freeze([
      'Wren eyes the cold, then the available shelter. “Any objections to choosing survival over personal space can be submitted in writing once my fingers work again.”',
      '“This weather is making an extremely persuasive argument for sharing warmth,” Wren says. “I resent being reasoned with by temperature.”',
    ]),
  }),

  'Ser Aldric Thorne': Object.freeze({
    early: Object.freeze([
      'Aldric inclines his head when you sit nearby. “I am accustomed to silence on watch. Companionable silence is a different thing. I find I prefer it.”',
      '“You need not have a reason to speak with me,” Aldric says. “Though I admit I am still learning how conversations without an agenda are meant to begin.”',
      'Aldric considers you with solemn attention. “We have entrusted one another with our lives rather quickly. I would rather not let that become an excuse to remain strangers.”',
      '“I have discovered that travelling together reveals a person more efficiently than formal introductions,” Aldric says. “Mostly through their opinions about rain.”',
    ]),
    friend: Object.freeze([
      'Aldric’s expression softens. “There are people I respect, and people I rely upon. It is rarer that the same person becomes someone whose company I simply enjoy.”',
      '“I am aware I can make relaxation sound like a duty,” Aldric says. “So I shall phrase this carefully: I am glad you are here, and nothing presently requires fixing.”',
      'Aldric gives you a small smile. “You have become one of the people before whom I do not feel obliged to appear certain. That is a greater comfort than I expected.”',
      '“If you ever require help,” Aldric says, “you may simply ask. You need not first construct a morally impeccable argument for deserving it. I am attempting to follow the same rule myself.”',
      'Aldric sits beside you. “I had friends in the Vigil with whom I shared years and knew almost nothing beyond duty. I do not intend to repeat that mistake.”',
    ]),
    attracted: Object.freeze([
      'Aldric catches your eye, pauses, then looks away with almost comic deliberateness. “I am attempting not to make admiration more complicated than it needs to be.”',
      '“You are distracting,” Aldric says, then closes his eyes briefly. “That was not intended as criticism. Nor, perhaps, should I have said it aloud.”',
      'Aldric’s composure survives until you smile at him. “Yes,” he says, apparently answering a question you did not ask. “I had noticed.”',
      '“Attraction is not a promise,” Aldric says. “But pretending it does not exist would also be dishonest. I would prefer honesty, even when it makes me slightly less dignified.”',
    ]),
    romantic: Object.freeze([
      'Aldric sits with you in thoughtful silence. “I have spent much of my life believing love should prove itself through sacrifice. I am beginning to think constancy in ordinary days may be the harder discipline.”',
      '“I do not want to court you as though presenting a case before a tribunal,” Aldric says. “So: I care for you. I enjoy your company. I would like more of both.”',
      'Aldric’s smile is quiet. “I know how to make vows. I am less practised at letting affection exist before it becomes one. Perhaps that is worth learning.”',
      '“There is a temptation to make every strong feeling into an obligation,” Aldric says. “I would rather what grows between us remain something we both choose.”',
      'Aldric looks almost embarrassed by his own happiness. “I had not expected tenderness to feel so much like relief.”',
    ]),
    committed: Object.freeze([
      '“I meant what I promised you,” Aldric says. “But I hope you never mistake that promise for a chain. I want you beside me because you remain willing to be there.”',
      'Aldric sits close, shoulders finally free of their habitual tension. “It is pleasant to be with someone before whom I do not have to stand at attention.”',
      '“I used to imagine devotion as enduring hardship together,” Aldric says. “No one mentioned sharing uneventful afternoons. I think the omission was serious.”',
      'Aldric gives you a warm, unguarded look. “I am still learning that accepting care is not the same as neglecting duty.”',
      '“Whatever else the day requires,” Aldric says, “this part does not: I love you. There. No oath. No ceremony. Simply true.”',
    ]),
    strained: Object.freeze([
      'Aldric’s voice is careful. “I do not believe commitment obliges us to pretend injury did not occur. If we repair this, I want the repair to be honest.”',
      '“I am angry,” Aldric says. “And I still care for you. Honour requires me to tell the truth about both, not select whichever is easier.”',
      'Aldric keeps his hands folded. “Trust can be rebuilt. That does not mean it can be commanded to return on schedule.”',
    ]),
    campFriend: Object.freeze([
      'Aldric finishes checking the camp perimeter, then sits beside the fire. “There. I have verified we may relax. Yes, I hear how absurd that sounds.”',
      'At camp, Aldric tells you a Silver Vigil story that begins as a moral lesson and ends with three novices, a goat and a stolen ceremonial banner.',
      'Aldric passes you the better portion of the evening meal, then firmly denies having done so when you point it out.',
    ]),
    campRomantic: Object.freeze([
      'Aldric stays beside you after his equipment is set aside. Without the armour and the formal posture, he looks younger. “This,” he says, “is becoming my favourite part of the day.”',
      'The campfire catches Aldric watching you. He does not look away this time. “I am allowed to enjoy what is good without first finding a duty attached to it. I have been informed.”',
      'Aldric asks where you would prefer him to settle for the night rather than assuming. The small courtesy seems entirely deliberate.',
    ]),
    campCommitted: Object.freeze([
      'When the camp is finally quiet, Aldric lets himself rest near you with no armour, no shield and no visible plan for the next hour. It may be the most trusting thing he does all day.',
      'Aldric looks around the settled camp. “I used to think home was a place duty assigned you to defend. I am revising the definition.”',
      'Before sleep, Aldric murmurs, “If I wake first, I shall make breakfast.” After a pause: “This is not a threat. I have improved.”',
    ]),
    campWatch: Object.freeze([
      'Aldric takes watch as naturally as breathing. When you offer to share it, he hesitates, then nods. “Company would be welcome. That is not the same as needing relief, and I am learning the distinction.”',
      'From watch, Aldric checks the sleeping party once, then deliberately turns his attention outward. “They have trusted us with the night. We should let them keep the sleep.”',
    ]),
    campCold: Object.freeze([
      'Aldric assesses the shelter with military seriousness. “Tonight, dignity ranks below avoiding hypothermia. Share space as needed.”',
      '“Cold is a poor reason to insist on formality,” Aldric says, making room near the warmest shelter. “Come closer if you need to. No explanation required.”',
    ]),
  }),

  'Mirabel Quill': Object.freeze({
    early: Object.freeze([
      'Mirabel looks up from her notes. “You have interrupted a fascinating line of thought.” She closes the book. “Fortunately, I have several others. Sit.”',
      '“I collect questions,” Mirabel says. “People are usually more interesting once you know which questions they refuse to answer.”',
      'Mirabel studies you with frank curiosity. “Travelling with someone is excellent research. Relax. I have not yet begun taking formal notes.”',
      '“Tell me something useless about yourself,” Mirabel says. “Important facts are always rehearsed. Useless ones are where people become specific.”',
    ]),
    friend: Object.freeze([
      'Mirabel closes her book before you say anything. “See? Growth. There was a time I would have made you compete with the footnotes.”',
      '“I have begun mentally addressing observations to you,” Mirabel says. “That is either friendship or an alarming decline in my internal privacy.”',
      'Mirabel leans back. “You are one of very few people with whom I can say ‘I have a terrible idea’ and trust the response will be a question rather than immediate confiscation.”',
      '“I like travelling with someone who can disagree without becoming tedious about it,” Mirabel says. “This is rarer than scholars would have you believe.”',
      'Mirabel produces a folded scrap of paper. “I wrote down something because I knew it would make you laugh. Do not make this emotionally significant.”',
    ]),
    attracted: Object.freeze([
      'Mirabel’s gaze lingers. “I am trying to decide whether you are aware of the effect you are having or merely benefiting from it accidentally.”',
      '“Physical attraction is terribly inconvenient for concentration,” Mirabel says. “Before you become smug, note that inconvenience and complaint are not synonyms.”',
      'Mirabel smiles. “You know, I had a perfectly coherent thought before you came over here. I hope you are pleased with yourself.”',
      '“I dislike coyness,” Mirabel says. “So, for the sake of intellectual honesty: yes, I find you attractive. No, that is not a request. See how easy clarity can be?”',
    ]),
    casual: Object.freeze([
      'Mirabel raises a brow. “I continue to think people make desire unnecessarily bureaucratic. Wanting one another can be true without requiring us to predict the next decade.”',
      '“I like this,” Mirabel says. “The honesty, particularly. No smuggled promises. No pretending affection is absent merely because we have not named it forever.”',
      'Mirabel grins. “We are adults capable of enjoying each other and subsequently discussing breakfast like civilised people. Revolutionary, apparently.”',
      '“If either of us wants the terms to change, we say so,” Mirabel says. “I refuse to make emotional guesswork a compulsory research method.”',
    ]),
    romantic: Object.freeze([
      'Mirabel turns a page without reading it. “I always assumed the dangerous part of attachment was losing freedom. It never occurred to me that choosing to stay could feel like gaining something.”',
      '“You have become inconveniently important,” Mirabel says. “I keep finding futures with you in them before I remember I am supposed to be suspicious of futures.”',
      'Mirabel’s expression softens. “I do not love you because you make me less curious. I love that I can run toward a question and still want to come back to you afterwards.”',
      '“There is a version of me that would have left the moment this became serious,” Mirabel says. “I am increasingly glad she is not making all my decisions.”',
      'Mirabel smiles. “Staying is not the opposite of freedom. I know. I am annoyed it took falling for someone to make the argument convincing.”',
    ]),
    committed: Object.freeze([
      'Mirabel settles beside you with a book, not speaking for several minutes. “This counts,” she says eventually. “Shared silence. I checked.”',
      '“I reserve the right to chase absurd ideas,” Mirabel says. “I also reserve the right to come home to you afterwards. I am becoming very fond of the second right.”',
      'Mirabel looks at you over the top of a page. “You know the terrible thing about a stable relationship? I am running out of dramatic reasons to flee it.”',
      '“I do not promise never to change,” Mirabel says. “I promise not to make you guess whether I changed. That seems more useful.”',
      'Mirabel smiles, utterly without irony. “I choose you. Frequently. Sometimes while you are being extremely irritating.”',
    ]),
    strained: Object.freeze([
      'Mirabel rubs at an ink stain on her thumb. “I can analyse this until neither of us is recognisable. I would rather begin with the simpler fact that I am hurt.”',
      '“Freedom includes the freedom to leave,” Mirabel says. “It also includes choosing not to flee the first difficult conversation. I am still here.”',
      'Mirabel meets your eyes. “Do not give me a clever explanation if what I need is the truth.”',
    ]),
    campFriend: Object.freeze([
      'Mirabel declares the campfire “an underappreciated laboratory” and spends ten minutes testing which bits of supper burn in the most interesting colours.',
      'Once camp is settled, Mirabel reads aloud from a dreadful adventure romance until everyone nearby begins offering increasingly hostile literary criticism.',
      'Mirabel sits by the fire annotating her notes, occasionally reading a sentence to you solely because she knows it will provoke an argument.',
    ]),
    campRomantic: Object.freeze([
      'Mirabel chooses the bedroll nearest yours, glances over and says, “This is not symbolism. It is logistics with pleasant side effects.”',
      'The fire burns low while Mirabel talks about places she once planned to visit alone. Lately, the pronoun in those plans has become “we” without either of you announcing the change.',
      'Mirabel closes her book early. “I could read,” she says, “but I have decided you are currently the more interesting text. Do not make that line unbearable.”',
    ]),
    campCommitted: Object.freeze([
      'Mirabel arranges her things beside yours with the unconscious efficiency of someone who has stopped treating departure as the default state.',
      'Before sleep, Mirabel says, “If I wake with an extraordinary idea, I promise to wait until dawn before involving you.” A pause. “Unless it is truly extraordinary.”',
      'Mirabel watches the camp settle. “I used to love the moment before leaving somewhere. Now I think I may prefer the moment I realise I am staying.”',
    ]),
    campWatch: Object.freeze([
      'Mirabel takes watch with a notebook balanced on one knee. “I am watching,” she assures you. “The fact that the darkness is also giving me an idea is entirely incidental.”',
      'On watch, Mirabel points out constellations with increasingly dubious invented names until you accuse her of making them up. She looks delighted to have been caught.',
    ]),
    campCold: Object.freeze([
      'Mirabel looks at the frost, then at the tents. “Excellent. Tonight nature itself is arguing against unnecessary personal space.”',
      '“For the record,” Mirabel says, moving toward the warmer shelter, “sharing warmth is thermodynamics. Any additional emotional implications are optional.”',
    ]),
  }),

  'Fenn Oakheart': Object.freeze({
    early: Object.freeze([
      'Fenn sits nearby and watches the wind move through the grass. “You don’t have to talk,” he says. “Most good company doesn’t require constant evidence.”',
      '“Travelling tells you odd things about people,” Fenn says. “How they wake up. Whether they notice birds. What they do when nobody is impressed.”',
      'Fenn offers you a small piece of fruit. “Peace offering.” When you ask what for, he shrugs. “Nothing. That’s why it’s peaceful.”',
      '“I’m still learning your rhythms,” Fenn says. “Everyone has them. When they need noise, when they need space, when they need somebody nearby pretending not to watch.”',
    ]),
    friend: Object.freeze([
      'Fenn settles beside you with an easy smile. “There you are. I was starting to think I’d have to enjoy this perfectly good patch of shade alone.”',
      '“I like friendships that survive silence,” Fenn says. “Means you can spend time together without constantly proving the friendship is still there.”',
      'Fenn hands you something he found on the road: a strangely shaped seedpod. “Made me think of you.” He pauses. “I am not going to explain why. It gets worse if I do.”',
      '“You know you can tell me when you’re tired of being the person everyone asks things of,” Fenn says. “I’m quite capable of not needing anything for an hour.”',
      'Fenn smiles. “Some people make a journey shorter. Not because they walk faster. You’re one of those.”',
    ]),
    attracted: Object.freeze([
      'Fenn looks you over without embarrassment, then smiles when you notice. “I wasn’t being subtle. I was being polite enough not to make it your problem.”',
      '“You’re attractive,” Fenn says, as casually as commenting on the weather. “That doesn’t obligate either of us to do anything. It just seemed silly to pretend I hadn’t noticed.”',
      'Fenn’s grin turns mischievous. “If you keep doing that, I may have to develop less wholesome thoughts about an otherwise perfectly respectable afternoon.”',
      '“Desire’s not complicated by itself,” Fenn says. “People get complicated. Better to ask what they want than decide the feeling answered for them.”',
    ]),
    casual: Object.freeze([
      'Fenn smiles. “I like that we can enjoy what this is without insulting it by pretending it has to become something else.”',
      '“Friends can want each other,” Fenn says. “Lovers can have other loves. The important part is that nobody has to guess what agreements they are actually living under.”',
      'Fenn bumps his knee lightly against yours, then leaves it there only after your expression answers the question. “See? Communication. Very advanced magic.”',
      '“If this changes, we talk,” Fenn says. “If it doesn’t, we still talk. I am suspicious of relationships maintained mainly through strategic silence.”',
    ]),
    romantic: Object.freeze([
      'Fenn looks contentedly at nothing in particular. “I don’t need love to be a fence. I like it better as a place you can come back to.”',
      '“You matter to me,” Fenn says. “Not in the dramatic way where that means everyone else matters less. You have your own shape in my life. I like the shape.”',
      'Fenn smiles at you. “I thought falling in love would feel like losing balance. Mostly it feels like noticing another path I want to keep walking.”',
      '“I don’t want to own your future,” Fenn says. “I do want to be invited into some of it.”',
      'Fenn rests his hands behind his head. “This is nice. I know that is not a grand romantic speech. I think I trust nice more than grand.”',
    ]),
    committed: Object.freeze([
      '“I keep choosing this,” Fenn says. “You, me, whatever shape we make together. The choosing matters more to me than pretending the shape can never change.”',
      'Fenn smiles when you sit down. “Good. I had nothing particular to say and wanted you here anyway.”',
      '“If I ever make freedom sound like an excuse not to show up for you, call me on it,” Fenn says. “Open doors are no use if nobody comes through them.”',
      'Fenn looks at you with quiet affection. “Love should make a life larger. I think ours does.”',
      '“You feel like someone I can grow beside,” Fenn says. “Not toward. Not away from. Beside.”',
    ]),
    strained: Object.freeze([
      'Fenn is quiet for a while. “I don’t believe in holding people by force. That doesn’t mean being hurt makes letting go easy.”',
      '“We need to say what actually happened,” Fenn says. “Not the version that makes either of us obviously right.”',
      'Fenn looks tired rather than angry. “Openness only works with honesty. Otherwise it is just loneliness with better vocabulary.”',
    ]),
    campFriend: Object.freeze([
      'Fenn takes over a corner of the fire and turns supper into something surprisingly edible with three herbs nobody remembers seeing him collect.',
      'Once camp is settled, Fenn lies back and identifies night sounds until half the party is arguing over whether one of them was actually just Aldric’s stomach.',
      'Fenn sits with you near the fire, content to let the conversation wander without ever seeming worried about reaching a point.',
    ]),
    campRomantic: Object.freeze([
      'Fenn settles near you and exhales. “Best thing about camp,” he says, “is everyone finally stops trying to arrive somewhere.”',
      'Fenn checks whether you want company before choosing the place beside you. The question is casual; the fact that he always asks is not.',
      'Under the night sky, Fenn talks about places he would like to show you rather than places he merely wants to visit.',
    ]),
    campCommitted: Object.freeze([
      'Fenn arranges his bedroll close to yours where the shelter allows it, still asking with a glance rather than treating familiarity as permission.',
      'As the campfire settles to embers, Fenn smiles. “I could get used to this. Not the dirt. The us.”',
      'Fenn wakes just enough to check that the camp is safe, sees you nearby, and relaxes again almost immediately.',
    ]),
    campWatch: Object.freeze([
      'Fenn takes watch barefoot, claiming he can feel people moving through the ground better that way. Whether true or not, he looks entirely at home in the dark.',
      'On watch, Fenn speaks barely above a whisper. “Night has its own volume. Feels rude to argue with it.”',
    ]),
    campCold: Object.freeze([
      'Fenn gestures everyone toward the best shelter. “Cold doesn’t care how independent we feel. Share warmth first; rediscover personal principles in the morning.”',
      '“Closer is warmer,” Fenn says simply. “Ask first, then stop pretending shivering is noble.”',
    ]),
  }),

  'Reyna Fletcher': Object.freeze({
    early: Object.freeze([
      'Reyna checks the road before looking at you. “You wanted to talk? Good. Talk. I can listen and watch the tree line at the same time.”',
      '“I don’t dislike company,” Reyna says. “I dislike company that needs entertaining. You’ve been tolerable so far.”',
      'Reyna sits where she can see both you and the approaches. “Habit. Don’t take it personally. If I stop doing it around you, then you may take it personally.”',
      '“People tell you a lot by what they do while waiting,” Reyna says. “You’re not bad at waiting. That’s rarer than it sounds.”',
    ]),
    friend: Object.freeze([
      'Reyna passes you a freshly sharpened knife. “Yours was embarrassing me.” When you thank her, she shrugs. “I have standards for the people standing beside me.”',
      '“I trust you enough to complain properly,” Reyna says. “Strangers get the polite version. Congratulations.”',
      'Reyna sits down nearby. “No problem. No report. No tactical reason. I just felt like being here. Try not to make it weird.”',
      '“If I go quiet after something bad, don’t assume I want to be alone,” Reyna says. “Sometimes I just want someone who knows how to shut up in company.”',
      'Reyna gives you a quick smile. “You’re one of the people I count automatically now. Headcount, exits, arrows, you. Useful to know where the important things are.”',
    ]),
    attracted: Object.freeze([
      'Reyna looks you over, entirely unapologetic. “Yes, I was looking. No, I haven’t confused looking with permission. We can both survive the information.”',
      '“You’re attractive,” Reyna says. “There. Saved us three weeks of meaningful glances and tactical ambiguity.”',
      'Reyna smirks. “If you’re trying to distract me, it’s working. If you’re not, that’s somehow more irritating.”',
      '“Fancying someone tells you almost nothing about whether you should trust them,” Reyna says. “Fortunately for you, I have separate evidence for that.”',
    ]),
    casual: Object.freeze([
      '“I like simple agreements,” Reyna says. “If we want each other, we can say so. If we want more, we say that too. Nobody gets points for guessing.”',
      'Reyna grins. “I promise not to compose a ballad about this. You should extend me the same courtesy.”',
      '“This works because we’re honest,” Reyna says. “Not because we’ve discovered a clever way to avoid having feelings. Those tend to arrive whether invited or not.”',
      'Reyna’s expression turns serious for a moment. “Open is not the same as careless. I still want to know what affects me, and I’ll give you the same respect.”',
    ]),
    romantic: Object.freeze([
      'Reyna looks faintly annoyed by her own softness. “I miss you when you’re gone. There. Horrible. Now we both have to live with knowing that.”',
      '“Trusting you in a fight was easy,” Reyna says. “Trusting you with the parts of me that aren’t useful took longer. I’m glad I did.”',
      'Reyna leans back, watching you rather than the horizon for once. “You know what’s unsettling? I can relax around you and nothing terrible immediately happens.”',
      '“I don’t need you to belong to me,” Reyna says. “I do need what we tell each other to be true.”',
      'Reyna smiles. “You’re home-shaped. Don’t look smug. I’m already regretting the wording.”',
    ]),
    committed: Object.freeze([
      '“I know where I stand with you,” Reyna says. “That may be the most romantic sentence I have.”',
      'Reyna sits close, gaze still moving over the surroundings out of habit. “I can watch the world and care about you at the same time. Turns out vigilance has room for both.”',
      '“If you need me, ask,” Reyna says. “Don’t test whether I notice. I probably will, but that doesn’t make testing a good idea.”',
      'Reyna’s smile is small and certain. “I love you. I also trust you. Took me long enough to learn those are different achievements.”',
      '“Whatever else we are doing,” Reyna says, “I want us to keep being the people who tell each other the inconvenient truth first.”',
    ]),
    strained: Object.freeze([
      'Reyna’s expression is controlled. “The problem isn’t that something went wrong. Things go wrong. The problem is whether I can trust what happens next.”',
      '“Don’t promise me everything,” Reyna says. “Tell me one thing you will actually do differently.”',
      'Reyna looks away toward the road. “I haven’t left. Do not mistake that for the work being finished.”',
    ]),
    campFriend: Object.freeze([
      'Reyna spends ten minutes improving the camp’s sight lines, then finally sits down. “Now I can relax.” She catches your look. “More than before.”',
      'At the fire, Reyna silently hands you a cup made exactly the way you like it. When you notice, she says, “Pattern recognition. Don’t get sentimental.”',
      'Reyna tells a hunting story so dryly that it takes you several minutes to realise she is describing the time she fell out of a tree.',
    ]),
    campRomantic: Object.freeze([
      'Reyna chooses a place near you that still gives her a clear view of the camp approaches. “Compromise,” she says. “I’m told it’s healthy.”',
      'For once, Reyna lets somebody else inspect the perimeter. She sits with you by the fire and visibly resists checking it again for nearly five whole minutes.',
      'Reyna lowers her voice after the others settle. “I like knowing where you are when I wake up. That is not a request for ownership. It is just… nice.”',
    ]),
    campCommitted: Object.freeze([
      'Reyna settles near you with her bow within reach. “Best of both worlds,” she murmurs. “You close, exits visible.”',
      'Before sleep, Reyna checks the night once, then you. The second check is gentler. “All right. I can stop for a few hours.”',
      'Reyna looks around the camp, then at you. “I spent years making sure I never needed a place. Apparently I should have been looking for people.”',
    ]),
    campWatch: Object.freeze([
      'Reyna takes watch without complaint. When you offer company, she considers it, then shifts over to make room. “Fine. But if you talk loudly enough to wake everyone, you’re taking the next watch too.”',
      'On watch, Reyna points out every sound that matters and ignores the ones that do not. Eventually she adds, “Your breathing’s fine. Go back to sleep.”',
    ]),
    campCold: Object.freeze([
      'Reyna takes one look at the temperature. “We can be shy tomorrow. Tonight we use the shelter efficiently.”',
      '“Cold kills competent people who are too proud to look ridiculous,” Reyna says. “Move closer to somebody warm and survive the embarrassment.”',
    ]),
  }),

  'Brother Alden': Object.freeze({
    early: Object.freeze([
      'Alden sits beside you without urgency. “We do not need a subject. Attention given freely is already a form of conversation.”',
      '“Most people ask monks how to stop thinking,” Alden says. “Usually the more useful skill is noticing a thought without immediately obeying it.”',
      'Alden smiles. “I am pleased you came over. That is a very ordinary feeling. I am learning not to undervalue ordinary feelings.”',
      '“We can know a person for years through roles,” Alden says, “and still not know what makes them laugh when nothing important is happening. I would like to know more of those things.”',
    ]),
    friend: Object.freeze([
      'Alden’s face brightens slightly when you sit down. “I had hoped for your company. I am trying to become better at admitting preferences before they disguise themselves as philosophical observations.”',
      '“You make silence feel shared rather than empty,” Alden says. “I did not understand there could be a difference until recently.”',
      'Alden offers you tea. “Friendship is full of small rituals nobody formally establishes. I find I like that.”',
      '“I used to think attachment mainly threatened clear judgement,” Alden says. “Now I think particular people also teach us what our abstractions leave out.”',
      'Alden smiles. “I know when you are pretending to be fine more often than I mention it. Compassion sometimes includes allowing a person to choose when to speak.”',
    ]),
    attracted: Object.freeze([
      // Alden's authored attraction cap is zero. Kept as a safe fallback for
      // malformed old saves; these lines explicitly do not invent desire.
      'Alden looks thoughtful. “Whatever else I feel for you, sexual attraction is not part of it. I would rather say that plainly than let silence turn it into a puzzle you are expected to solve.”',
      '“Closeness and desire are not synonyms for me,” Alden says. “That does not make closeness smaller.”',
    ]),
    romantic: Object.freeze([
      'Alden’s smile is warm. “I love you. I do not desire you sexually. I have stopped feeling that the second sentence must apologise for the first.”',
      '“What I want with you is closeness,” Alden says. “To know your days. To be known in return. To choose one another honestly. That is not an incomplete version of love to me.”',
      'Alden sits with you, peaceful and entirely present. “I once believed detachment meant needing nobody in particular. I now think loving particular people can teach a different kind of freedom.”',
      '“You are not a temptation I am nobly resisting,” Alden says with a faint smile. “You are someone I love in the way I actually love, not the way other people assume I should.”',
      'Alden’s voice is soft. “There are forms of intimacy that make me feel deeply known. None require me to pretend to a desire I do not experience.”',
    ]),
    committed: Object.freeze([
      'Alden settles beside you. “Constancy used to sound to me like clinging. With you, it feels more like returning deliberately.”',
      '“I choose you,” Alden says. “Not as an escape from solitude. I still value solitude. I choose the life that includes coming back from it to you.”',
      'Alden smiles. “We have made something I once thought contradictory: attachment without possession.”',
      '“You need never wonder whether I am secretly waiting to become a different kind of lover,” Alden says. “I am here as myself. I hope that is one of the things you trust.”',
      'Alden regards you with quiet affection. “A shared life is made mostly of moments nobody would put in a poem. I find that reassuring.”',
    ]),
    strained: Object.freeze([
      'Alden is quiet before speaking. “Compassion does not require us to deny that trust was harmed. I would rather be kind enough to tell the truth.”',
      '“I am trying not to turn hurt into detachment merely because detachment is familiar to me,” Alden says. “Remaining present is harder. I think it is also more honest.”',
      'Alden folds his hands. “Forgiveness, if it comes, should not be demanded as proof that I am compassionate.”',
    ]),
    campFriend: Object.freeze([
      'Alden makes tea after camp is settled and somehow finds enough cups for everyone, including one nobody remembers packing.',
      'By the fire, Alden listens to the others argue about nothing with a small smile. “Communal harmony,” he says, just as Wren threatens to throw a boot at someone.',
      'Alden sits with you under the night sky. Neither of you speaks for a while, and he looks entirely content with the conversation.',
    ]),
    campRomantic: Object.freeze([
      'Alden chooses a resting place near yours after asking whether you would like the company. “I enjoy being close to you,” he says. “There. No need to make it more mysterious than it is.”',
      'Once camp quiets, Alden remains beside you, shoulder near yours but not assuming the last inch. The ease of asking matters to him as much as the answer.',
      'Alden smiles across the fire. “There are nights when I want conversation, and nights when I want simply to know you are nearby. This is the second kind.”',
    ]),
    campCommitted: Object.freeze([
      'Alden settles into the familiar place near you. “Good night,” he says, with the quiet certainty of someone who expects morning together without taking it for granted.',
      'Before sleep, Alden asks whether you want company or space tonight. The question has not disappeared with commitment; it has simply become easy.',
      'Alden watches the embers fade. “I used to think peace meant wanting nothing. Sometimes it means wanting this and not being frightened by the wanting.”',
    ]),
    campWatch: Object.freeze([
      'Alden takes watch with stillness that makes the dark seem less empty. When he notices you awake, he smiles. “Nothing is wrong. You may safely return to sleep.”',
      'On watch, Alden walks the edge of camp in slow, quiet circuits. “Attention without fear,” he says when you ask. “That is the goal, at least.”',
    ]),
    campCold: Object.freeze([
      'Alden considers the cold. “Bodies require warmth whether or not desire is involved. We can be practical without making closeness mean something it does not.”',
      '“Please share shelter if you need it,” Alden says. “Comfort is not a debt, and warmth is not consent to anything beyond warmth.”',
    ]),
  }),
});

function party() {
  return Array.isArray(root.party) ? root.party : [];
}
function canonical(nameOrEntity) {
  const name = typeof nameOrEntity === 'string' ? nameOrEntity : nameOrEntity?.name;
  if (!name) return null;
  return party().find((member, index) => index > 0 && member?.name === name) || null;
}
function protagonist() {
  return party()[0] || null;
}
function romanceState(nameOrEntity) {
  const companion = canonical(nameOrEntity);
  if (!companion) return null;
  return root.getCompanionRomanceState?.(companion)
    || (root.companionRomance?.getRelationshipState?.(companion) ?? null);
}
function relationshipBand(nameOrEntity) {
  const companion = canonical(nameOrEntity);
  if (!companion) return 'early';
  const state = romanceState(companion);
  const affinity = state?.affinity || root.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
  const agreement = state?.agreement || affinity.agreement || {};
  const mode = state?.interpretation?.mode || root.companionRomance?.interpretRelationship?.(companion)?.mode || 'early';

  if (agreement.state === 'strained' || String(affinity.romanceState || '').startsWith('strained')) return 'strained';
  if (agreement.state === 'committed') return 'committed';
  if (agreement.state === 'dating') return 'romantic';
  if (['romantic', 'asexual_romance', 'love_desire_conflict', 'romantic_low_desire'].includes(mode)) return 'romantic';
  if (['casual_hookup', 'friends_with_benefits'].includes(mode)) return 'casual';
  if (['attracted', 'restrained_attraction'].includes(mode)) return 'attracted';
  if (mode === 'close_friend' || Number(affinity.friendship || 0) >= 55) return 'friend';
  return 'early';
}
function indexFor(name, token, length) {
  if (!length) return 0;
  const text = `${name}:${token}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % length;
}
function campFor() {
  return root.campSystem?.getCamp?.() || null;
}
function campContext(nameOrEntity, camp = campFor()) {
  const companion = canonical(nameOrEntity);
  if (!companion || !camp) return null;
  const members = Array.isArray(camp.members) ? camp.members : [];
  const player = protagonist();
  const tentFor = member => (camp.tents || []).find(tent => (tent.occupants || []).some(x => x === member || x?.name === member?.name));
  const companionTent = tentFor(companion);
  const playerTent = tentFor(player);
  return {
    camp,
    companion,
    player,
    onGuard: !!members.find(x => (x === companion || x?.name === companion.name) && x.onGuard),
    sameTent: !!companionTent && companionTent === playerTent,
    hasBedroll: (camp.bedrolls || []).some(x => x === companion || x?.name === companion.name),
    outside: (camp.outside || []).some(x => x === companion || x?.name === companion.name),
    temperature: Number(camp.temperature ?? 15),
    cold: Number(camp.temperature ?? 15) <= 5,
    startedAt: Number(camp.startedAt || camp.establishedAt || 0),
  };
}
function poolFor(name, band, campCtx = null) {
  const authored = POOLS[name] || {};
  if (campCtx) {
    if (campCtx.onGuard && authored.campWatch?.length) return authored.campWatch;
    if (campCtx.cold && authored.campCold?.length) return authored.campCold;
    if (band === 'committed' && authored.campCommitted?.length) return authored.campCommitted;
    if (['romantic', 'casual', 'attracted'].includes(band) && authored.campRomantic?.length) return authored.campRomantic;
    if (band !== 'early' && authored.campFriend?.length) return authored.campFriend;
  }
  return authored[band]?.length ? authored[band]
    : authored[band === 'casual' ? 'attracted' : band === 'committed' ? 'romantic' : 'friend']
    || authored.early || [];
}
function chooseMoment(nameOrEntity, use = 0, { camp = null, token = null } = {}) {
  const companion = canonical(nameOrEntity);
  if (!companion) return null;
  const band = relationshipBand(companion);
  const campCtx = camp ? campContext(companion, camp) : null;
  const pool = poolFor(companion.name, band, campCtx);
  if (!pool.length) return null;
  const idx = token == null
    ? Math.max(0, Number(use) || 0) % pool.length
    : indexFor(companion.name, token, pool.length);
  return { companion: companion.name, band, text: pool[idx], variantIndex: idx, campContext: campCtx };
}
function topicLabel(ctx) {
  const name = ctx?.companion?.name || '';
  const first = name.split(' ')[0] === 'Ser' ? (name.split(' ')[1] || name) : (name.split(' ')[0] || 'them');
  const band = relationshipBand(name);
  if (band === 'strained') return `Talk with ${first} about the distance between you.`;
  if (['committed', 'romantic', 'casual'].includes(band)) return `Spend a quiet moment with ${first}.`;
  if (band === 'attracted') return `See what ${first} is smiling about.`;
  return `Sit with ${first} for a while.`;
}
function topicFor(name) {
  return {
    id: TOPIC_ID,
    label: topicLabel,
    priority: ctx => {
      const band = relationshipBand(ctx?.companion);
      if (band === 'strained') return 72;
      if (band === 'committed') return 48;
      if (band === 'romantic' || band === 'casual') return 44;
      if (band === 'friend' || band === 'attracted') return 34;
      return 16;
    },
    cooldownSeconds: ctx => {
      const band = relationshipBand(ctx?.companion);
      return ['committed', 'romantic', 'casual', 'strained'].includes(band) ? DAY / 3 : DAY / 2;
    },
    render: (ctx, state) => {
      const currentCamp = campFor();
      const result = chooseMoment(name, state?.uses || 0, { camp: currentCamp });
      if (!result) return {};
      return {
        subject: 'your everyday relationship',
        text: result.text,
        variantIndex: result.variantIndex,
      };
    },
  };
}
function installTopics() {
  const memory = root.companionConversationMemory;
  if (!memory?.registerTopics) return false;
  for (const name of CORE_NAMES) memory.registerTopics(name, [topicFor(name)]);
  topicsInstalled = true;
  return true;
}
function ensureGenericRoot(name) {
  if (!GENERIC_ROOTS.has(name)) return false;
  root.npcDialogueTrees = root.npcDialogueTrees || {};
  const id = DIALOGUE_IDS[name];
  if (typeof root.npcDialogueTrees[id] === 'function') return true;
  const generic = function (npc) {
    const speaker = canonical(name) || npc || { name };
    root.showDialogue?.(speaker, "What's on your mind?", [
      { label: 'Never mind.', action: () => {} },
    ]);
  };
  generic.__relationshipMomentGenericRoot = true;
  root.npcDialogueTrees[id] = generic;
  return true;
}
function syncDialogueIds() {
  let changed = false;
  for (const name of CORE_NAMES) {
    const companion = canonical(name);
    if (!companion) continue;
    const id = DIALOGUE_IDS[name];
    if (companion.dialogueId !== id) {
      companion.dialogueId = id;
      changed = true;
    }
    for (const entity of (root.entities || [])) {
      if (entity?.alive && entity.side === 'player' && entity.name === name && entity.dialogueId !== id) {
        entity.dialogueId = id;
        changed = true;
      }
    }
  }
  if (changed) root.updatePartyTabs?.();
  return changed;
}
function installDialogueEntries() {
  const memory = root.companionConversationMemory;
  if (!memory?.installDialogueEntry || !root.npcDialogueTrees) return false;
  for (const name of CORE_NAMES) {
    ensureGenericRoot(name);
    memory.installDialogueEntry(DIALOGUE_IDS[name], name);
  }
  syncDialogueIds();
  return true;
}
function campMemory() {
  const player = protagonist();
  if (!player) return null;
  const existing = player.companionRelationshipMomentMemory || {};
  player.companionRelationshipMomentMemory = {
    lastCampStartedAt: Number(existing.lastCampStartedAt || 0),
    lastCampCompanion: existing.lastCampCompanion || null,
  };
  return player.companionRelationshipMomentMemory;
}
function campCandidateScore(companion) {
  const band = relationshipBand(companion);
  const order = { committed: 60, romantic: 50, casual: 38, strained: 35, friend: 30, attracted: 24, early: 0 };
  const rel = root.getCompanionRelationship?.(companion) || {};
  const affinity = root.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
  return Number(order[band] || 0) + Math.min(20, Number(rel.trust || 0) / 5) + Math.min(15, Number(affinity.friendship || 0) / 7);
}
function buildCampVignette(camp) {
  if (!camp) return null;
  const candidates = CORE_NAMES.map(canonical).filter(Boolean)
    .map(companion => ({ companion, score: campCandidateScore(companion) }))
    .filter(x => x.score >= 25)
    .sort((a, b) => b.score - a.score || a.companion.name.localeCompare(b.companion.name));
  if (!candidates.length) return null;
  const companion = candidates[0].companion;
  const token = `${Number(camp.startedAt || camp.establishedAt || 0)}:${Number(camp.temperature || 0)}:${companion.name}`;
  const moment = chooseMoment(companion, 0, { camp, token });
  return moment ? { ...moment, score: candidates[0].score } : null;
}
function handleCamp(camp) {
  if (!camp || root.isInCombat) return false;
  const memory = campMemory();
  if (!memory) return false;
  const startedAt = Number(camp.startedAt || camp.establishedAt || 0);
  if (startedAt && memory.lastCampStartedAt === startedAt) return false;
  const vignette = buildCampVignette(camp);
  if (!vignette) return false;
  if (startedAt) memory.lastCampStartedAt = startedAt;
  memory.lastCampCompanion = vignette.companion;
  root.showMessage?.(`${vignette.companion}: ${vignette.text}`);
  return true;
}
function installCampListener() {
  if (campListenerInstalled || typeof root.addEventListener !== 'function') return false;
  root.addEventListener('campDialogue', event => handleCamp(event?.detail?.camp || campFor()));
  campListenerInstalled = true;
  return true;
}
function refresh() {
  if (!topicsInstalled) installTopics();
  installDialogueEntries();
  installCampListener();
  syncDialogueIds();
}

const api = {
  build: BUILD,
  dialogueIds: DIALOGUE_IDS,
  pools: POOLS,
  relationshipBand,
  campContext,
  chooseMoment,
  buildCampVignette,
  handleCamp,
  installTopics,
  installDialogueEntries,
  syncDialogueIds,
  refresh,
};
root.companionRelationshipMoments = api;
root.COMPANION_RELATIONSHIP_MOMENTS_BUILD = BUILD;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

refresh();
if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', refresh, { once: true });
if (typeof root.setInterval === 'function' && root.document) refreshTimer = root.setInterval(refresh, 1000);
})(typeof window !== 'undefined' ? window : globalThis);
