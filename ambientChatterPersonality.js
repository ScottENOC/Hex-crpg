// ambientChatterPersonality.js
// Third layer of ambient chatter context: stable temperament/status/worldview
// plus dynamic mood. This does not invent faction/religion membership; explicit
// record fields are used when present, otherwise only a broad piety tendency is
// derived from the persistent NPC seed.
(() => {
    'use strict';

    const relApi = () => window.AmbientChatterRelationships;
    const pop = () => window.GeneratedCivilianPopulation;
    const recordFor = npc => npc?.id ? pop()?.records?.get?.(String(npc.id)) || null : null;

    function unit(seed, channel) {
        const text = `${seed || 'npc'}|${channel}`;
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0) / 4294967296;
    }
    function pick(seed, channel, xs) { return xs[Math.min(xs.length - 1, Math.floor(unit(seed, channel) * xs.length))]; }

    const TEMPERAMENTS = ['warm','dry','anxious','bold','practical','curious','gruff','cheerful'];
    const VALUES = ['family','security','craft','community','freedom','faith','prosperity','knowledge'];

    function statusOf(npc) {
        const r = recordFor(npc);
        const raw = String(r?.occupation || npc?.occupation || npc?.title || '').toLowerCase();
        if (/reeve|captain|master|foreman|assayer|priest|guild|noble|officer/.test(raw)) return 'comfortable';
        if (/merchant|smith|clerk|innkeeper|craft|baker|carpenter/.test(raw)) return 'middling';
        if (/labour|miner|farmer|fisher|hunter|unemployed/.test(raw)) return 'working';
        return 'middling';
    }

    function ageBandOf(npc) {
        const r = recordFor(npc);
        if (r?.isDependent) return 'child';
        return r?.appearance?.ageBand || npc?.appearance?.ageBand || 'adult';
    }

    function explicitAffiliation(npc) {
        const r = recordFor(npc) || {};
        return {
            religion: r.religion || r.faith || npc?.religion || npc?.faith || null,
            faction: r.faction || r.affiliation || npc?.faction || npc?.affiliation || null,
        };
    }

    function profileOf(npc) {
        const r = recordFor(npc);
        const seed = r?.seed || npc?.generatedCivilianSeed || npc?.id || npc?.name || 'npc';
        const affiliation = explicitAffiliation(npc);
        return {
            temperament: pick(seed, 'ambient-temperament', TEMPERAMENTS),
            secondaryTemperament: pick(seed, 'ambient-temperament-2', TEMPERAMENTS),
            value: pick(seed, 'ambient-value', VALUES),
            sociability: unit(seed, 'ambient-sociability'),
            piety: unit(seed, 'ambient-piety'),
            optimism: unit(seed, 'ambient-optimism'),
            caution: unit(seed, 'ambient-caution'),
            status: statusOf(npc),
            ageBand: ageBandOf(npc),
            religion: affiliation.religion,
            faction: affiliation.faction,
        };
    }

    function moodOf(npc, state = {}) {
        const p = profileOf(npc);
        if (npc?.maxHp && npc.hp < npc.maxHp * 0.45) return 'hurt';
        if (state.emberlodeRaided || (state.hollowmereSecurity != null && state.hollowmereSecurity < 30)) {
            return p.caution > 0.55 ? 'worried' : 'defiant';
        }
        const hour = Number(state.hour ?? 12);
        if (hour < 6 || hour >= 22) return p.sociability < 0.45 ? 'tired' : 'mellow';
        if (p.optimism > 0.72) return 'upbeat';
        if (p.optimism < 0.25) return 'weary';
        return 'steady';
    }

    function pairContext(pair, state = {}) {
        const api = relApi();
        return {
            a: profileOf(pair[0]), b: profileOf(pair[1]),
            aMood: moodOf(pair[0], state), bMood: moodOf(pair[1], state),
            relation: api?.relationshipBetween?.(pair[0], pair[1]) || 'acquaintance',
            aRole: api?.occupationOf?.(pair[0]) || 'civilian',
            bRole: api?.occupationOf?.(pair[1]) || 'civilian',
        };
    }

    const social = relApi()?.exchanges;
    if (!social) return;
    let serial = 0;
    const add = (topic, lines, opts={}) => social.push({ id:`ambient_persona_${++serial}`, topic, lines, priority:opts.priority || 5, ...opts });
    const many = (topic, rows, opts={}) => rows.forEach(lines => add(topic, lines, opts));
    const persona = (temperament, extra = {}) => ({
        ...extra,
        condition:(state,pair) => {
            const c = pairContext(pair,state);
            const ok = c.a.temperament === temperament || c.a.secondaryTemperament === temperament;
            return ok && (!extra.condition || extra.condition(state,pair,c));
        }
    });

    many('voice-warm', [
        ["You eaten yet?", "Not properly.", "Then stop pretending that's an answer."],
        ["You look cold.", "I'm fine.", "That wasn't permission to freeze."],
        ["Take the better half.", "You sure?", "Before I become less generous."],
        ["How's your mother?", "Complaining.", "Good. Means she's herself."],
        ["Sit a minute.", "I've work.", "Work will survive being neglected briefly."],
        ["Tell me when you get home.", "You'll be asleep.", "Tell me anyway."],
        ["I kept this for you.", "Why?", "Because I know what you like."],
        ["You don't have to make a joke of everything.", "I know.", "Good. Now make one about that hat."],
    ], persona('warm',{priority:7}));

    many('voice-dry', [
        ["Lovely weather.", "For ducks with poor judgement."],
        ["Could be worse.", "Give it time."],
        ["You optimistic today?", "Violently."],
        ["That went well.", "In the broad sense that it ended."],
        ["You trust him?", "I trust gravity. Him, less consistently."],
        ["We're making progress.", "Then someone should probably stop us."],
        ["Bright side?", "I misplaced it."],
        ["Everything under control?", "No, but it has stopped escaping."],
    ], persona('dry',{priority:7}));

    many('voice-anxious', [
        ["Did you hear that?", "A cart wheel.", "It sounded worse than a cart wheel."],
        ["You're sure the road's safe?", "Safe enough.", "I dislike measurements ending in 'enough'."],
        ["We should leave earlier.", "We're early now.", "Exactly. It's working."],
        ["Check the latch again.", "I checked it.", "Then this one will be faster."],
        ["What if the bridge is out?", "Then we'll see it before crossing.", "Not necessarily comforting."],
        ["You packed water?", "Yes.", "Food?", "Yes.", "Spare cord?", "Yes.", "Good. I forgot mine."],
        ["Something feels off.", "You say that every third day.", "And look how often we're alive."],
        ["Don't be late.", "I won't.", "People always say that before being late."],
    ], persona('anxious',{priority:7}));

    many('voice-bold', [
        ["You actually going to do it?", "Of course.", "That wasn't encouragement."],
        ["Road looks rough.", "Good. Smooth roads are boring."],
        ["I'd have gone after them.", "You weren't there.", "A logistical flaw, not a moral one."],
        ["Storm coming.", "Then we'll know whether the roof deserves its reputation."],
        ["You ever back down?", "Frequently. Just never while someone's watching."],
        ["That's a bad idea.", "It's an unfinished good idea."],
        ["You can't just challenge every problem.", "Watch me narrow the list."],
        ["Careful.", "I am careful.", "You are loud. Different quality."],
    ], persona('bold',{priority:7}));

    many('voice-practical', [
        ["What do you think?", "I think talking won't mend it."],
        ["We need a plan.", "We need rope, two people and daylight. That's a plan."],
        ["Worth fixing?", "Cheaper than replacing. So yes."],
        ["You worried?", "Worry later. Sandbags now."],
        ["Could argue about it.", "Could also finish before supper."],
        ["What if it rains?", "Then put the canvas up."],
        ["I have a theory.", "Do you have a hammer?"],
        ["That's unfair.", "Probably. Still needs doing."],
    ], persona('practical',{priority:7}));

    many('voice-curious', [
        ["Ever wonder who built that old wall?", "No.", "How do you manage that?"],
        ["Why do you think the river bends there?", "Because rivers don't take advice."],
        ["Look at this mark.", "It's a scratch.", "It's an interesting scratch."],
        ["What do you suppose is beyond the ridge?", "More ridge, eventually."],
        ["Have you noticed the bells sound different in rain?", "I had not.", "Now you will forever."],
        ["Who decided that was the right way?", "Someone older and louder."],
        ["I want to see the old road someday.", "Why?", "Because it's old and there."],
        ["Do goblins tell stories about us?", "If they do, I hope I get a flattering role."],
    ], persona('curious',{priority:7}));

    many('voice-gruff', [
        ["Morning.", "Is it important?"],
        ["You could smile.", "I could also carry two sacks. Both unnecessary."],
        ["Need a hand?", "Need fewer questions."],
        ["You always this friendly?", "No. This is effort."],
        ["Nice to see you.", "That'll pass."],
        ["You worried me.", "Didn't ask you to."],
        ["You coming inside?", "When the door starts making demands."],
        ["Thank you.", "Don't spread it around."],
    ], persona('gruff',{priority:7}));

    many('voice-cheerful', [
        ["You're in a good mood.", "Someone has to be."],
        ["Rain again.", "Free roof test."],
        ["Long day ahead.", "Then plenty of time to improve it."],
        ["Lost a penny.", "Found a reason to look at the ground."],
        ["Cart broke.", "Good excuse to walk slower."],
        ["You never complain?", "Certainly. I just make mine entertaining."],
        ["Cold this morning.", "Means breakfast feels warmer."],
        ["You're impossible.", "Consistently, though."],
    ], persona('cheerful',{priority:7}));

    // Age changes subject matter, not just vocabulary.
    many('older-perspective', [
        ["Road used to flood right there.", "Doesn't now.", "Because we finally stopped rebuilding it in the flood."],
        ["I've seen three roofs on that house.", "Same house?", "Mostly."],
        ["Everyone says this winter is unusual.", "Every winter becomes unusual when people forget the previous one."],
        ["Young folk rush everywhere.", "You used to.", "Exactly. I know how tiring it is."],
        ["That tree was half the size when I married.", "Which time?", "Mind your work."],
        ["New fashion?", "Apparently.", "Good. Means the old one is cheap now."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).a.ageBand==='older'});

    many('young-perspective', [
        ["You think they'll let me take the next caravan?", "You think they'll stop you asking?"],
        ["Everyone says I should settle down.", "Everyone enjoys spending other people's future."],
        ["I could make more in Silverhart.", "You could spend more there too."],
        ["I want something to happen.", "Careful. The world hears that sort of thing."],
        ["Do you think I'm ready?", "No one ever feels ready at the interesting moment."],
        ["I'm saving for my own place.", "Good. Start by saving for your own chair."],
    ], {priority:6,condition:(s,p)=>['young_adult','child'].includes(pairContext(p,s).a.ageBand)});

    // Status colours what people worry about without turning wealth into caricature.
    many('working-status', [
        ["Price went up again.", "Then supper gets simpler again."],
        ["Can you stretch that until payday?", "I can stretch anything except payday."],
        ["Boot sole's gone.", "Patch it twice. Replacement costs three patches."],
        ["Work Sunday too?", "If the roof wants paying for."],
        ["We can manage.", "We always manage. I'd like to try thriving once."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).a.status==='working'});

    many('comfortable-status', [
        ["Another petition this morning.", "People only bring you problems once they think you can solve them."],
        ["Everyone wants a favour.", "That's what happens when your coat has clean cuffs."],
        ["I should visit the yard myself.", "You should. They notice when decisions have boots on."],
        ["Accounts don't balance.", "They do. Just not in the direction you prefer."],
        ["Hard to know what people really think.", "Try paying them late."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).a.status==='comfortable'});

    // Piety is a tendency unless an explicit faith exists. No fabricated sect names.
    many('pious-worldview', [
        ["I'll light a candle tonight.", "For anything particular?", "At this point, general coverage."],
        ["You think someone's listening?", "I think speaking carefully changes the speaker either way."],
        ["I promised thanks if we got through that.", "Then best not become a liar immediately after being lucky."],
        ["Chapel before work?", "For five minutes. Work has me for the rest."],
        ["Coin's tight.", "So give time instead."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).a.piety>0.72});

    many('skeptical-worldview', [
        ["You coming to chapel?", "I'll help mend the chapel roof. Does that count?"],
        ["They say it's a sign.", "Everything is a sign if you're determined enough."],
        ["You don't believe in luck?", "I believe in ropes, weather and people making poor choices."],
        ["Say a prayer.", "I'll also check the latch."],
        ["The gods will provide.", "Good. Ask whether they have flour."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).a.piety<0.20});

    // Explicit affiliation hooks only fire when the source data actually names one.
    many('shared-faith', [
        ["Same observance tonight?", "After second bell.", "I'll save you a place."],
        ["You heard the new reading?", "Aye. Still deciding whether I agree with the reader."],
        ["Festival duty again?", "We volunteered once. Apparently that's hereditary now."],
    ], {priority:8,condition:(s,p,c)=>{
        c = c || pairContext(p,s); return !!c.a.religion && c.a.religion === c.b.religion;
    }});

    many('shared-faction', [
        ["Meeting still on?", "Quietly."],
        ["You trust the new instructions?", "I trust that someone wrote them confidently."],
        ["Keep that badge covered here.", "Already planned to."],
    ], {priority:8,condition:(s,p,c)=>{
        c = c || pairContext(p,s); return !!c.a.faction && c.a.faction === c.b.faction;
    }});

    // Mood: same person sounds different after danger, injury or a long day.
    many('mood-worried', [
        ["Stay close tonight.", "I was planning to.", "Plan harder."],
        ["Every noise sounds wrong lately.", "That's fear being thorough."],
        ["I keep checking the road.", "Anything there?", "Not yet. That's not helping."],
        ["You sleeping?", "In pieces."],
        ["I hate waiting for bad news.", "Then let's do something useful while it takes its time."],
    ], {priority:9,condition:(s,p)=>pairContext(p,s).aMood==='worried'});

    many('mood-defiant', [
        ["They expect us to scare easy.", "Do we?", "Not where they can see."],
        ["I'm not leaving.", "No one asked you yet.", "Saving them the trouble."],
        ["They broke a door, not the town.", "Tell the carpenter that."],
        ["Fear's useful.", "Since when?", "Since it started telling me where to reinforce."],
        ["We rebuild tomorrow.", "Why tomorrow?", "Because tonight we sharpen things."],
    ], {priority:9,condition:(s,p)=>pairContext(p,s).aMood==='defiant'});

    many('mood-hurt', [
        ["You're limping.", "I'm walking selectively."],
        ["Sit down before you fall down.", "That's a very narrow range of options."],
        ["Does it hurt?", "Only when I use it, breathe, or think about it."],
        ["You should see the healer.", "I was hoping to heal through stubbornness."],
        ["Let me carry that.", "I can manage.", "I know. Let me anyway."],
    ], {priority:10,condition:(s,p)=>pairContext(p,s).aMood==='hurt'});

    many('mood-upbeat', [
        ["Good day?", "It hasn't defeated me yet."],
        ["You're humming.", "Am I?", "Badly.", "Then definitely me."],
        ["What are you smiling at?", "Nothing expensive."],
        ["Things might work out.", "Careful. Optimism attracts witnesses."],
        ["Buy you a drink later?", "Now that's responsible planning."],
    ], {priority:6,condition:(s,p)=>pairContext(p,s).aMood==='upbeat'});

    // Shared history is inferred only from durable relationships/world events.
    many('shared-raid-memory', [
        ["I still hear that night sometimes.", "Me too.", "Good. I was afraid it was only me."],
        ["Remember where we hid?", "Every time I pass that door."],
        ["We made it through once.", "That doesn't make me eager for practice."],
    ], {relations:['spouse','friend','coworker'],priority:12,condition:(s)=>!!s.emberlodeRaided});

    many('shared-peace-memory', [
        ["Funny, after all that, talking solved it.", "Talking and a great many people standing nearby with weapons."],
        ["You think the peace holds?", "Long enough to become someone's normal, I hope."],
        ["I still catch myself watching the treeline.", "Peace doesn't erase habits overnight."],
    ], {relations:['spouse','friend','coworker'],priority:10,condition:(s)=>s.goblinResolved && ['goblin_diplomacy','alliance'].includes(s.goblinResolution)});

    window.AmbientChatterPersonality = {
        profileOf, moodOf, pairContext, statusOf, ageBandOf, explicitAffiliation,
        addedExchanges: serial, TEMPERAMENTS:[...TEMPERAMENTS], VALUES:[...VALUES],
    };
})();