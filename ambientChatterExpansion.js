// ambientChatterExpansion.js
// High-variety, state-aware replacement for the original eight generic NPC
// exchanges in characterBanter.js.  Keeps the cheap nearby-NPC scan and speech
// bubbles, but adds settlement/occupation/world-state context and anti-repeat
// memory so a busy street sounds like a place rather than a looping soundboard.
(() => {
    'use strict';

    const RECENT_EXCHANGE_LIMIT = 10;
    const RECENT_TOPIC_LIMIT = 5;
    const PAIR_COOLDOWN_SECONDS = 120;
    const CHECK_SECONDS = 16;

    window.ambientChatterRecent = window.ambientChatterRecent || [];
    window.ambientChatterRecentTopics = window.ambientChatterRecentTopics || [];

    const q = id => (window.questLog || []).find(x => x.id === id);
    const completed = id => q(id)?.status === 'completed';
    const active = id => q(id)?.status === 'active';
    const playerEntity = () => (window.entities || []).find(e => e.side === 'player' && !e.rider);

    function dist(a, b) {
        if (!a || !b) return Infinity;
        if (window.distance) return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function settlementForHex(hex) {
        if (!hex) return null;
        const points = [
            ['hollowmere', window.campaign2Landmarks?.crossroads, 65],
            ['millbrook', window.campaign2MillbrookCenter, 55],
            ['emberlode', window.campaign2EmberlodeCenter, 60],
            ['reddale', window.campaign2ReddaleCenter, 75],
            ['silverhart', window.campaign2SilverhartCenter, 120],
        ].filter(([,c]) => c);
        let best = null;
        for (const [id, center, radius] of points) {
            const d = dist(hex, center);
            if (d <= radius && (!best || d < best.distance)) best = { id, distance:d };
        }
        return best?.id || null;
    }

    function getWorldState(pair) {
        const goblin = q('goblin_threat');
        const road = q('ore_road_reopened');
        const p = playerEntity();
        let recentRumor = null;
        try { recentRumor = window.getRecentWorldRumors?.(1)?.[0] || null; } catch (_) {}
        return {
            settlement: settlementForHex(pair?.[0]?.hex || p?.hex),
            season: window.getCurrentSeason?.() || null,
            hour: window.getCurrentHour?.() ?? 12,
            goblinStatus: goblin?.status || null,
            goblinResolution: goblin?.resolution || null,
            goblinResolved: goblin?.status === 'completed',
            goblinKnown: !!goblin,
            buriedRoadActive: active('buried_road'),
            oreRoadActive: road?.status === 'active',
            oreRoadOpen: road?.status === 'completed',
            emberlodeRaided: !!window.emberlodeRaided,
            hollowmereEventFired: !!window.hollowmereEventFired,
            goblinScoutNoteRead: !!window.goblinScoutNoteRead,
            necromancerKnown: !!q('necromancer') || !!q('phylactery') || !!window.necromancerEvidenceFound,
            hollowmereSecurity: window.regions?.hollowmere?.security ?? 50,
            emberlodeProsperity: window.regions?.emberlode?.prosperity ?? 50,
            recentRumor,
        };
    }

    function roleOf(npc) {
        const text = `${npc?.title || ''} ${npc?.occupation || ''}`.toLowerCase();
        if (/guard|watch|soldier|captain|sergeant|levy|militia/.test(text)) return 'guard';
        if (/miner|foreman|assay|smith|forge|blacksmith|tool/.test(text)) return 'miner';
        if (/merchant|shop|store|trader|peddler|innkeeper|tavern|barkeep/.test(text)) return 'merchant';
        if (/priest|chapel|cleric|acolyte|shrine|flame/.test(text)) return 'clergy';
        if (/farmer|farm|stable|herder/.test(text)) return 'farmer';
        return 'civilian';
    }

    let serial = 0;
    const exchanges = [];
    function add(topic, lines, opts={}) {
        exchanges.push({ id: opts.id || `ambient_v2_${++serial}`, topic, lines, priority:opts.priority || 1, ...opts });
    }
    function addMany(topic, pairs, opts={}) { pairs.forEach(lines => add(topic, lines, opts)); }

    // Broad everyday conversation. These are intentionally specific enough to
    // sound human, but not tied to facts that can become false as the campaign changes.
    addMany('daily-life', [
        ["You still owe me for that pie.", "I dispute the word 'owe'.", "You ate it.", "I dispute nothing else."],
        ["Your roof still leaking?", "Only when it rains.", "That's generally when roofs matter."],
        ["I lost a boot this morning.", "How do you lose one boot?", "If I knew that, I'd know where it was."],
        ["Bread's better today.", "Baker finally stopped arguing with the oven."],
        ["You look tired.", "I was awake for most of the night.", "Trouble?", "Goat."],
        ["Did you mend that chair?", "I moved it where no one sits. Same result, less work."],
        ["I'm thinking of getting a dog.", "You already complain about your neighbour's dog.", "Exactly. I need representation."],
        ["That's a new coat.", "It's an old coat with new buttons.", "Then those are excellent buttons."],
        ["What's for supper?", "Whatever doesn't run away before I catch it."],
        ["You ever wonder why wells always taste of buckets?", "No.", "Well, now you do."],
        ["I heard Jory's learning the fiddle.", "Then pray he learns it somewhere distant."],
        ["Your hens laying again?", "One is. The others have formed a union."],
        ["I swear that cat understands every word.", "Then stop telling it where you hide the cream."],
        ["Morning.", "Is it? I hadn't agreed to that yet."],
        ["You cut your own hair?", "What gave it away?", "Nothing. Absolutely nothing."],
        ["Market day tomorrow.", "I know. My purse has already started hiding."],
        ["You smell smoke?", "That's lunch.", "Ah. My condolences."],
        ["Got a spare needle?", "Had one yesterday.", "Useful information yesterday."],
        ["Your boy still wants to be an adventurer?", "Until I ask him to carry firewood. Then his knees go bad."],
        ["I found a silver penny under the bed.", "Yours?", "It is now."],
        ["Someone's been stealing apples from my tree.", "You don't own an apple tree.", "That explains the difficulty proving it."],
        ["I could sleep for a week.", "You'd wake up hungry on the second day."],
        ["That stew smells good.", "Give it time."],
        ["Seen my hammer?", "Which hammer?", "The good one.", "Then no."],
    ]);

    addMany('weather', [
        ["Clouds are sitting low.", "Good. Saves them the trouble of falling far."],
        ["Wind changed.", "You say that every time it blows the other way."],
        ["Rain before dusk, I reckon.", "Your knee telling you?", "No. The enormous black cloud."],
        ["Fine day for once.", "Don't say it too loudly. Weather takes criticism personally."],
    ]);
    add('weather', ["Cold enough to freeze the trough tonight.", "I'll bring the bucket in."], { season:['autumn','winter'] });
    add('weather', ["If it gets any hotter, I'm moving into the well.", "Queue starts behind me."], { season:['summer'] });
    add('weather', ["Everything's mud again.", "Means things are growing.", "Mostly the mud."], { season:['spring'] });

    addMany('work', [
        ["How's work?", "Still there every morning, despite my best efforts."],
        ["You taking a break?", "I'm conducting a detailed inspection of this wall."],
        ["Boss looking for you.", "Then don't ruin a beautiful morning by telling them where I am."],
        ["Long day?", "It became a long day shortly after breakfast."],
        ["You finished that job?", "I have finished thinking about starting it."],
        ["Hands are killing me.", "Means you used them. Very fashionable among workers."],
    ]);

    addMany('food', [
        ["Ale or cider?", "Whichever one someone else is buying."],
        ["They put turnip in everything lately.", "Not everything.", "Name one thing.", "Ale.", "Give them time."],
        ["I miss fresh berries.", "You miss stealing fresh berries."],
        ["Salt's dear again.", "Everything tastes expensive these days."],
        ["Save me a heel of bread.", "I'll save you two if you stop calling them heels."],
    ]);

    // Occupation colour. At least one member of the pair must match the role.
    addMany('guard-business', [
        ["Quiet watch?", "Don't say that. That's how trouble hears you."],
        ["Boots are wearing thin again.", "Kingdom gives us spears, not feet."],
        ["Anything on the road?", "Two carts, three pilgrims, one man who looked guilty of being boring."],
        ["You checking every wagon?", "Only the ones whose drivers tell me not to."],
    ], { roles:['guard'], priority:2 });
    addMany('mine-business', [
        ["How's the seam?", "Hard rock, decent ore, bad language."],
        ["Hear that ringing below?", "Aye. Means someone's earning twice what we're being paid."],
        ["Need a new pick-head.", "Get in line. The mine eats iron faster than miners eat stew."],
        ["Dust in my teeth again.", "Luxury. Means you've still got teeth."],
    ], { roles:['miner'], priority:2 });
    addMany('trade-business', [
        ["Caravan late?", "Caravans are never late. Prices just arrive early."],
        ["You taking copper today?", "At yesterday's price, certainly not."],
        ["Customer asked for a discount.", "Did you laugh politely?", "Professionally."],
        ["Road tolls went up again?", "No. The rumour did. Give the tollkeeper an hour."],
    ], { roles:['merchant'], priority:2 });
    addMany('faith', [
        ["Chapel busy?", "People remember the gods whenever something starts rattling at night."],
        ["You lighting a candle?", "For patience.", "Working?", "Ask me less often."],
        ["Do prayers count if you fall asleep halfway through?", "Depends which half."],
    ], { roles:['clergy'], priority:2 });
    addMany('farm-business', [
        ["Fields looking alright?", "Ask me after harvest. Before harvest they're all liars."],
        ["Fence down again?", "Same sheep, same fence, same argument."],
        ["Your mare still kicking?", "Only people she dislikes.", "She kicked me.", "I know."],
    ], { roles:['farmer'], priority:2 });

    // Settlement identity: recurring texture without requiring a formal quest.
    addMany('hollowmere-local', [
        ["Tankard busy tonight?", "Garrick says every empty stool is resting for later."],
        ["River's high by the landing.", "Good for fish. Bad for boots."],
        ["Hollowmere used to be quieter.", "It also used to be duller. I haven't decided which I preferred."],
    ], { settlements:['hollowmere'], priority:3 });
    addMany('millbrook-local', [
        ["Another wagon north this morning.", "Aye. More lamp oil than food. Tells you where the coin's going."],
        ["Bell at the chapel sticks again.", "Only on holy days. Very devout mechanism."],
        ["Petra counted those crates twice.", "Petra counts everything twice. That's why things arrive."],
        ["Forest was loud last night.", "Forest is always loud.", "Not like that."],
    ], { settlements:['millbrook'], priority:3 });
    addMany('emberlode-local', [
        ["Crooked Pick after shift?", "Only if you promise not to order the thing they call stew."],
        ["Assay office says the east face is richer.", "Assay office doesn't have to swing the pick."],
        ["Those old supports below still bother me.", "They're straighter than anything we build now. That's the bothering part."],
        ["Hear they found glassy stone in the deep cut.", "Hear lots of things underground. Most of them I prefer not to meet."],
    ], { settlements:['emberlode'], priority:3 });
    addMany('reddale-local', [
        ["Watch doubled the gate walk again.", "Makes the gate feel very important."],
        ["Inn's full of road dust and merchants.", "So, merchants."],
        ["Reeve's clerk wants forms for everything now.", "Do we need a form to complain?", "Two copies."],
    ], { settlements:['reddale'], priority:3 });
    addMany('silverhart-local', [
        ["Capital never sleeps, does it?", "It sleeps. It just charges rent while doing it."],
        ["Another procession on the avenue.", "Was wondering why everyone suddenly remembered how to bow."],
        ["Court's arguing again.", "Good. Means they're too busy to notice us."],
        ["Market bells rang early.", "Prices heard them and ran ahead."],
    ], { settlements:['silverhart'], priority:3 });

    // Player-visible world state. Higher priority makes these surface naturally
    // soon after something changes, but recent-topic memory prevents a whole
    // crowd discussing the same event in chorus.
    add('ironbond-aftermath', ["Still strange not seeing Ironbond swagger through here.", "Strange good, or strange dangerous?", "Ask me when we know what fills the space."], {
        settlements:['hollowmere'], priority:8, condition:s => s.hollowmereEventFired
    });
    add('security', ["Bar the shutters before dark.", "Again?", "Until the road feels safe again, yes."], {
        settlements:['hollowmere'], priority:9, condition:s => s.hollowmereSecurity < 30
    });
    add('security', ["Road's felt calmer lately.", "Don't praise a quiet road where it can hear you."], {
        settlements:['hollowmere'], priority:6, condition:s => s.hollowmereSecurity >= 65
    });
    add('goblin-threat', ["They say the Skarn-tooth trouble is finally settled.", "Settled how?", "Depends which traveller tells it."], {
        priority:8, condition:s => s.goblinResolved && !['goblin_diplomacy','alliance'].includes(s.goblinResolution)
    });
    add('goblin-peace', ["Never thought I'd hear 'goblin' and 'agreement' in the same sentence.", "Keep your voice down. Might frighten the agreement."], {
        priority:9, condition:s => s.goblinResolved && ['goblin_diplomacy','alliance'].includes(s.goblinResolution)
    });
    add('goblin-danger', ["More folk carrying spears on the road now.", "Folk heard about the goblins. Even rumours have teeth lately."], {
        priority:7, condition:s => s.goblinKnown && !s.goblinResolved
    });
    add('buried-road', ["Emberlode road crews still won't go out alone.", "Can't blame them. Ore's not worth getting eaten over."], {
        settlements:['emberlode','hollowmere'], priority:8, condition:s => s.buriedRoadActive
    });
    add('ore-road', ["Ore wagons are moving again.", "Good. Smiths were starting to price nails like jewellery."], {
        settlements:['emberlode','hollowmere'], priority:8, condition:s => s.oreRoadOpen
    });
    add('emberlode-raid', ["They took more than ore in that raid.", "Aye. Took the feeling that these hills were ours."], {
        settlements:['emberlode'], priority:10, condition:s => s.emberlodeRaided
    });
    add('emberlode-raid', ["Still finding broken locks from the raid.", "Locks are easy. Trust takes longer to rehang."], {
        settlements:['emberlode'], priority:10, condition:s => s.emberlodeRaided
    });
    add('border-rumour', ["Heard the northern levies are seeing bigger warbands.", "Bigger than raiders ought to be. That's what worries me."], {
        settlements:['millbrook','reddale','silverhart'], priority:7, condition:s => s.goblinScoutNoteRead
    });
    add('mine-prosperity', ["Emberlode's carts are running light lately.", "Light carts make heavy purses, and not in the good way."], {
        settlements:['emberlode'], priority:7, condition:s => s.emberlodeProsperity < 30
    });
    add('world-news', [
        "You hear the latest from the road?",
        s => s.recentRumor ? s.recentRumor : "Only enough rumour to make a fool confident."
    ], { priority:5, condition:s => !!s.recentRumor });

    // Time-specific texture.
    add('night', ["You heading home?", "Soon as my feet remember the route."], { hourRange:[21,5], priority:2 });
    add('night', ["Lantern oil's nearly gone.", "Then we'd best finish talking before the conversation disappears."], { hourRange:[20,5], priority:2 });
    add('morning', ["You're up early.", "I object to both words in that sentence."], { hourRange:[5,9], priority:2 });
    add('midday', ["Lunch?", "In theory.", "Best kind. No washing up."], { hourRange:[11,14], priority:2 });

    function hourEligible(ex, hour) {
        if (!ex.hourRange) return true;
        const [start,end] = ex.hourRange;
        return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
    }

    function exchangeEligible(ex, pair, state) {
        if (ex.season && state.season && !ex.season.includes(state.season)) return false;
        if (!hourEligible(ex, state.hour)) return false;
        if (ex.settlements && !ex.settlements.includes(state.settlement)) return false;
        if (ex.roles) {
            const roles = pair.map(roleOf);
            if (!ex.roles.some(r => roles.includes(r))) return false;
        }
        if (ex.condition) {
            try { if (!ex.condition(state, pair)) return false; } catch (_) { return false; }
        }
        return true;
    }

    function eligibleExchanges(pair, state=getWorldState(pair)) {
        return exchanges.filter(ex => exchangeEligible(ex, pair, state));
    }

    function chooseExchange(pair, state=getWorldState(pair), random=Math.random) {
        const eligible = eligibleExchanges(pair, state);
        if (!eligible.length) return null;
        const recent = new Set(window.ambientChatterRecent || []);
        const recentTopics = new Set(window.ambientChatterRecentTopics || []);

        let pool = eligible.filter(ex => !recent.has(ex.id) && !recentTopics.has(ex.topic));
        if (!pool.length) pool = eligible.filter(ex => !recent.has(ex.id));
        if (!pool.length) pool = eligible;

        // Priority is a weight, not a deterministic winner: an event becomes
        // noticeably discussable without every pair reciting it immediately.
        const weighted = [];
        pool.forEach(ex => { for (let i=0; i<Math.max(1, ex.priority|0); i++) weighted.push(ex); });
        return weighted[Math.floor(random() * weighted.length)] || pool[0];
    }

    function resolveLine(line, state, pair) {
        if (typeof line !== 'function') return line;
        try { return String(line(state, pair)); } catch (_) { return '...'; }
    }

    function remember(ex) {
        window.ambientChatterRecent = [...(window.ambientChatterRecent || []), ex.id].slice(-RECENT_EXCHANGE_LIMIT);
        window.ambientChatterRecentTopics = [...(window.ambientChatterRecentTopics || []), ex.topic].slice(-RECENT_TOPIC_LIMIT);
    }

    function chatterPairKey(a,b) { return [a.name,b.name].sort().join('|'); }

    function checkAmbientNpcChatterV2(delta) {
        window.ambientChatterAccum = (window.ambientChatterAccum || 0) + delta;
        if (window.ambientChatterAccum < CHECK_SECONDS) return;
        window.ambientChatterAccum = 0;
        if (window.isInCombat) return;

        const partyHexes = window.collectPartyHexes ? window.collectPartyHexes() : [];
        const candidates = (window.entities || []).filter(e =>
            e.alive && e.isNPC && e.side === 'neutral' && !e.rider && !e.noAttack &&
            (!window.isDormantAmbientNpc || !window.isDormantAmbientNpc(e, partyHexes))
        );
        if (candidates.length < 2) return;

        const pairs=[];
        for (let i=0;i<candidates.length;i++) for (let j=i+1;j<candidates.length;j++) {
            const a=candidates[i], b=candidates[j];
            if (dist(a.hex,b.hex)>2) continue;
            const last=(window.ambientChatterCooldowns || {})[chatterPairKey(a,b)];
            if (last && (window.worldSeconds-last)<PAIR_COOLDOWN_SECONDS) continue;
            pairs.push([a,b]);
        }
        if (!pairs.length) return;

        const pair=pairs[Math.floor(Math.random()*pairs.length)];
        const state=getWorldState(pair);
        const ex=chooseExchange(pair,state);
        if (!ex) return;
        ex.lines.forEach((line,i)=>setTimeout(()=>{
            const speaker=i%2===0?pair[0]:pair[1];
            if (!speaker.alive) return;
            window.spawnSpeechBubble?.(speaker.name,resolveLine(line,state,pair));
        },i*2500));
        window.ambientChatterCooldowns = window.ambientChatterCooldowns || {};
        window.ambientChatterCooldowns[chatterPairKey(pair[0],pair[1])] = window.worldSeconds;
        remember(ex);
        window.lastAmbientChatter = { exchangeId:ex.id, topic:ex.topic, settlement:state.settlement, pair:pair.map(x=>x.name) };
    }

    window.ambientChatterExchanges = exchanges;
    window.checkAmbientNpcChatter = checkAmbientNpcChatterV2;
    window.AmbientChatterV2 = {
        exchanges, roleOf, settlementForHex, getWorldState, eligibleExchanges, chooseExchange,
        remember, resolveLine,
        constants:{RECENT_EXCHANGE_LIMIT,RECENT_TOPIC_LIMIT,PAIR_COOLDOWN_SECONDS,CHECK_SECONDS}
    };
})();
