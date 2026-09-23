// ambientChatterRelationships.js
// Adds audience-aware social context to ambient chatter. Occupation is only
// one ingredient: the same miner speaks differently to a spouse, child,
// co-worker, guard, merchant, friend or stranger.
(() => {
    'use strict';

    const base = () => window.AmbientChatterV2;
    const pop = () => window.GeneratedCivilianPopulation;
    const records = () => pop()?.records;
    const recordFor = npc => npc?.id ? records()?.get?.(String(npc.id)) || null : null;

    function occupationOf(npc) {
        const r = recordFor(npc);
        const raw = String(r?.occupation || npc?.occupation || npc?.title || '').toLowerCase();
        if (/miner|foreman|assay|ore|smith|forge|blacksmith|tool/.test(raw)) return 'miner';
        if (/guard|watch|soldier|captain|sergeant|levy|militia/.test(raw)) return 'guard';
        if (/merchant|shop|store|trader|peddler|innkeeper|tavern|barkeep/.test(raw)) return 'merchant';
        if (/priest|chapel|cleric|acolyte|shrine|flame/.test(raw)) return 'clergy';
        if (/farmer|farm|stable|herder/.test(raw)) return 'farmer';
        if (/fisher/.test(raw)) return 'fisher';
        if (/hunter|forestry|woodcutter/.test(raw)) return 'hunter';
        if (/clerk|scribe/.test(raw)) return 'clerk';
        if (/craft|weaver|carpenter|baker/.test(raw)) return 'craftsperson';
        if (/labour/.test(raw)) return 'labourer';
        return raw || 'civilian';
    }

    function relationshipBetween(a, b) {
        const ra = recordFor(a), rb = recordFor(b);
        if (!ra || !rb) return 'acquaintance';
        if (ra.spouseId === rb.id || rb.spouseId === ra.id) return 'spouse';
        if (ra.childIds?.includes(rb.id)) return 'parent_to_child';
        if (rb.childIds?.includes(ra.id)) return 'child_to_parent';
        if (ra.parentIds?.some(id => rb.parentIds?.includes(id)) && ra.isDependent && rb.isDependent) return 'sibling';
        if (ra.friendIds?.includes(rb.id) || rb.friendIds?.includes(ra.id)) return 'friend';
        if (ra.householdId && ra.householdId === rb.householdId) return 'housemate';
        if (ra.workplaceId && ra.workplaceId === rb.workplaceId) return 'coworker';
        if (occupationOf(a) === occupationOf(b) && occupationOf(a) !== 'civilian') return 'same_trade';
        return 'acquaintance';
    }

    function direction(pair) {
        return {
            relation: relationshipBetween(pair[0], pair[1]),
            aRole: occupationOf(pair[0]),
            bRole: occupationOf(pair[1]),
            aRecord: recordFor(pair[0]),
            bRecord: recordFor(pair[1]),
        };
    }

    let serial = 0;
    const social = [];
    const add = (topic, lines, opts={}) => social.push({ id:opts.id || `ambient_social_${++serial}`, topic, lines, priority:opts.priority || 3, ...opts });
    const addMany = (topic, rows, opts={}) => rows.forEach(lines => add(topic, lines, opts));

    // Spouses: domestic shorthand, money, children, work, affection and irritation.
    addMany('spouse-home', [
        ["Did you remember the lamp oil?", "I remembered we needed it.", "That was not the difficult part."],
        ["You're late.", "I know.", "Food's cold.", "I know that too."],
        ["Your boots are by the door again.", "That's where boots go.", "Not when they're full of mud."],
        ["We're nearly out of flour.", "I'll get some tomorrow.", "You said that yesterday.", "Then I'm consistent."],
        ["You look exhausted.", "You say that very tenderly.", "I married you. I get to be accurate."],
        ["Did you feed the hens?", "They looked fed.", "They always look fed. They're hens."],
        ["I mended your sleeve.", "Again?", "You keep introducing it to nails."],
        ["We should replace that mattress.", "We should replace the roof first.", "The mattress doesn't drip on me."],
        ["I saved you the last piece.", "You did?", "Don't make me regret it."],
        ["You forgot our anniversary.", "I remembered eventually.", "After I told you.", "A very effective reminder."],
        ["Come home before dark tonight.", "I'll try.", "No. Come home before dark."],
        ["You took my good knife.", "Our good knife.", "Interesting time to discover communal property."],
        ["We need to talk about the chimney.", "Can the chimney wait until after supper?", "It has. For three months."],
        ["You snore.", "So do you.", "Mine is softer.", "Yours has confidence."],
        ["I worried.", "I know.", "Then don't make a habit of it.", "Coming back?", "Making me worry."],
        ["Your mother sent another jar.", "Of what?", "She didn't label it.", "Then we both know it's medicinal."],
        ["We still owe Pell for the timber.", "I know.", "And the cooper.", "I know.", "Good talk."],
        ["You smiled at me this morning.", "I do that sometimes.", "Keep practising."],
        ["If you buy another mug, throw one out first.", "What if the new mug is better?", "Then throw out two."],
        ["I heard you boasting in the tavern.", "About what?", "Exactly. It went on a while."],
    ], { relations:['spouse'], priority:8 });

    // Parents and children deliberately sound different in each direction.
    addMany('parent-child', [
        ["Stay where I can see you.", "I am where you can see me.", "Then stay there."],
        ["Have you eaten?", "Yes.", "Something that wasn't stolen fruit?", "...Yes?"],
        ["Homework before the river.", "I don't have homework.", "Then you've just gained some."],
        ["Don't climb that.", "Why?", "Because I remember being your age."],
        ["Wash your hands.", "They're not dirty.", "They're a different colour."],
        ["You promised you'd be careful.", "I was careful.", "You tore both knees out of your trousers."],
        ["Who taught you that word?", "You did.", "No I didn't.", "You said it at the cart."],
        ["Take this to your aunt.", "Why me?", "Because you're fast.", "I'm fast because people keep sending me places."],
        ["No sword until you're older.", "How much older?", "Older than you are after asking that."],
        ["Bed before the second bell.", "What if I'm not tired?", "Then be awake quietly."],
        ["Your coat.", "It's not cold.", "Your coat.", "Fine."],
        ["Don't stare at the adventurer.", "I'm not staring.", "You're walking backwards."],
        ["Tell me if anyone bothers you.", "What will you do?", "Be very polite once."],
        ["I found your missing shoe.", "Where?", "Somewhere no shoe has business being."],
        ["You can help with supper.", "Can I use the big knife?", "You can help by standing farther away."],
    ], { relations:['parent_to_child'], priority:9 });

    addMany('child-parent', [
        ["Can I go with the others?", "Where?", "If I tell you, will you say no?", "Now I'm definitely saying no."],
        ["Were you ever an adventurer?", "I once crossed the market in a storm.", "That doesn't count."],
        ["Why do grown-ups complain about money?", "Because children keep asking questions for free."],
        ["Can we get a dog?", "We have a goat.", "The goat doesn't like me.", "The goat has judgement."],
        ["You said we'd go fishing.", "I did.", "Yesterday.", "That part I hoped you'd forgotten."],
        ["Why do you have grey hair?", "You.", "All of it?", "Most of the interesting bits."],
        ["Can I stay up for the festival?", "Until first bell.", "Second?", "Half past first."],
        ["I can carry that.", "It's heavy.", "I'm strong.", "You're stubborn. Different muscle."],
        ["When can I have my own room?", "When we have another room."],
        ["Why can't I work at the mine?", "Because I like you alive."],
        ["I didn't break it.", "I didn't ask.", "Good."],
        ["Can we have honey cakes?", "We can have porridge.", "That wasn't the question."],
    ], { relations:['child_to_parent'], priority:9 });

    addMany('siblings', [
        ["That's mine.", "You weren't using it.", "I was owning it."],
        ["Stop copying me.", "Stop copying me."],
        ["Mum said you have to help.", "Mum said you have to stop lying.", "She said both."],
        ["You took the bigger piece.", "I am bigger.", "That's not how bread works."],
        ["Race you to the well.", "Loser carries the bucket back."],
        ["Don't tell them.", "What do I get?", "My enduring gratitude.", "Make it a penny."],
        ["You kicked me in your sleep.", "You snore in mine."],
        ["If you get caught, I wasn't there.", "You are literally here."],
        ["You promised not to laugh.", "I promised to try."],
        ["I get the window side tonight.", "You got it last night.", "I negotiated better."],
    ], { relations:['sibling'], priority:8 });

    // Friends: more candid than generic public chatter.
    addMany('friends', [
        ["You look miserable.", "Thank you.", "I meant, do you want a drink?", "Then thank you twice."],
        ["Tell me you didn't.", "I didn't.", "You're lying.", "You asked for reassurance, not truth."],
        ["Walk with me?", "Where?", "Does it matter?", "Only if there's a hill."],
        ["You still angry?", "I'm cultivating it."],
        ["I need your opinion.", "No you don't. You need agreement."],
        ["I heard about last night.", "From who?", "Everyone. Impressively efficient."],
        ["You owe me.", "For what?", "I'll remember by the time you have money."],
        ["I saved you a seat.", "At the tavern?", "At chapel.", "Cruel."],
        ["Promise you won't laugh.", "Absolutely not."],
        ["You ever think of leaving?", "Every winter.", "And every spring?", "I remember why I stayed."],
        ["I know that face. What happened?", "How much time have you got?"],
        ["You need help?", "Probably.", "Useful help or the kind I usually provide?", "Surprise me."],
        ["I bought you something.", "Why?", "It was cheap and reminded me of you.", "That answer got worse halfway through."],
        ["Don't look now.", "You know that makes me look immediately."],
        ["Same time tomorrow?", "Unless one of us becomes rich overnight.", "So, same time tomorrow."],
    ], { relations:['friend'], priority:7 });

    // Coworkers: shop-floor shorthand. Different from same-trade strangers.
    addMany('coworkers', [
        ["You taking first break?", "I took it while the foreman wasn't looking."],
        ["That order still not done?", "It is spiritually complete."],
        ["Cover for me a moment?", "How expensive is the mistake?"],
        ["Did you move my tools?", "I rescued them from where you abandoned them."],
        ["We're short again.", "People or supplies?", "Yes."],
        ["Boss in a mood?", "Boss owns several. Today's one bites."],
        ["You heard the new rule?", "No.", "Good. Let's keep it that way."],
        ["Lunch bell yet?", "You asked five minutes ago."],
        ["That's your third cup.", "It's my second cup twice."],
        ["If anyone asks, this was always like that.", "What was?", "Exactly."],
        ["You finish the count?", "Twice. Got two different answers."],
        ["Trade you shifts tomorrow?", "Why?", "Family thing.", "Real family or tavern family?"],
        ["We're going to need more rope.", "We always need more rope."],
        ["You fixed it?", "I made the noise stop."],
        ["Long week.", "It's Tuesday.", "I stand by my statement."],
    ], { relations:['coworker'], priority:6 });

    // Same trade, different workplace: professional gossip/rivalry.
    addMany('same-trade', [
        ["Heard your lot got the new contract.", "Heard your lot told everyone we did."],
        ["What are they paying over your way?", "Not enough to make this conversation free."],
        ["You still using those old tools?", "They still work.", "So does walking. I prefer a cart."],
        ["Busy season?", "Every season is busy when someone else sets the price."],
        ["Your foreman any good?", "At foremaning? Excellent. At listening? Legendary for the opposite."],
        ["We tried that method last year.", "And?", "We're trying a different method this year."],
        ["You hiring?", "You asking?", "I'm asking whether you're hiring."],
        ["Your apprentice still with you?", "Still alive and occasionally useful."],
        ["Prices killing you too?", "Slowly enough to keep us working."],
        ["Trade's changing.", "Trade's always changing. We just notice when it gets expensive."],
    ], { relations:['same_trade'], priority:5 });

    // Housemates who aren't immediate family.
    addMany('housemates', [
        ["Whose turn for water?", "Not mine.", "Compelling argument. Wrong, but compelling."],
        ["Someone ate my cheese.", "Tragic.", "You have crumbs on your shirt."],
        ["Keep the door shut tonight.", "I do.", "You close it. Different skill."],
        ["That blanket mine?", "It was on my bed.", "That is not an answer."],
        ["You're washing that bowl.", "I washed it yesterday.", "And then you used it today."],
        ["Who invited Pell?", "Pell did."],
        ["If you're first home, light the fire.", "If you're first home, bring wood."],
        ["The upstairs step squeaks.", "Every step squeaks.", "That one tells stories."],
    ], { relations:['housemate'], priority:6 });

    // Miner to miner: technical, dangerous, insider shorthand.
    addMany('miner-miner', [
        ["East face still singing?", "Only under the third brace.", "Then I'm not standing under the third brace."],
        ["How wet below eight?", "Boot-deep by breakfast. Pump crew's losing the argument."],
        ["You see the colour in that last cart?", "Aye. Better ore, worse stone."],
        ["Second gallery needs timber.", "Second gallery always needs timber. It eats trees underground."],
        ["You taking the deep shift?", "Not until they shore the old joint."],
        ["Pick's bouncing off the west seam.", "Change the angle. Rock's stubborn, not clever."],
        ["Lamp went blue down there yesterday.", "Where?", "Old cut.", "Then why are we talking up here instead of to the foreman?"],
        ["That pale glass is back in the spoil.", "Bag it for Quill. Don't pocket it."],
        ["Hear the roof crack?", "No.", "Good. Means we left soon enough."],
        ["Third cart's mostly waste.", "Tell the assayer before the tally becomes a religion."],
        ["New boy swings too hard.", "He'll learn when his shoulders teach him."],
        ["Old supports are too straight.", "That's what bothers me. Nobody here built them."],
        ["Any gas in the lower pocket?", "Enough that I'm carrying two lamps and trusting neither."],
        ["You mark that fault line?", "Twice. Foreman walked over both marks."],
        ["Shift bell sounded early.", "No. We were underground too long."],
    ], { rolePairs:[['miner','miner']], priority:10 });

    // Miner talking to spouse: risk, money, family, concealment rather than geology jargon.
    addMany('miner-spouse', [
        ["You were late again.", "Roof needed bracing.", "The roof has a whole crew. I have one of you."],
        ["Don't take the deep shift tomorrow.", "It pays extra.", "So does surviving long enough to spend it."],
        ["Your cough is worse.", "Dust.", "Dust doesn't get to sleep beside me. You do."],
        ["They paying the danger bonus?", "They call it a deep-work allowance.", "Of course they do."],
        ["Wash before you touch the baby.", "I know.", "I know you know. Wash anyway."],
        ["I heard there was a fall.", "Not my section.", "That's not the same as safe."],
        ["You smell like lamp smoke.", "Better than mine water.", "This is not a competition."],
        ["We can manage without the extra shift.", "Can we?", "We can manage better with you home."],
        ["Promise you'll come up if the timbers start talking.", "Timbers always talk.", "You know what I mean."],
        ["Quill says the new seam is rich.", "Quill doesn't have children waiting at supper."],
        ["Your hands are shaking.", "Cold.", "It's midsummer.", "Then don't ask questions you know the answer to."],
        ["I patched your work coat.", "Again?", "Stop giving the mine pieces of it."],
        ["We finally paid the cooper.", "Good.", "Don't volunteer for another shift to celebrate."],
        ["You brought stone into the bed again.", "Impossible.", "I found it with my foot."],
        ["Come to chapel with me tomorrow.", "Before shift?", "Instead of shift."],
    ], { relations:['spouse'], roleAny:['miner'], priority:12 });

    // Miner to child: simplified, protective, sometimes playful.
    addMany('miner-child', [
        ["Did you find treasure today?", "Three bent nails and a shiny rock.", "Can I have the shiny rock?", "Ask the assayer when you're thirty."],
        ["Is the mine dark?", "Very.", "Are you scared?", "Only of your other parent when I'm late."],
        ["Can I see underground?", "When you're older.", "How much older?", "Old enough to stop asking that every day."],
        ["Did you fight goblins in the mine?", "Mostly I fight rocks.", "Who wins?", "Depends on the day."],
        ["Why is your face black?", "Because the mine missed me."],
        ["Bring me a crystal.", "A safe one.", "Are there unsafe crystals?", "Now I regret the adjective."],
        ["Can I wear your helmet?", "It's heavy.", "I'm strong.", "Then carry the water bucket first."],
        ["What does the mine sound like?", "Drips, picks, carts, and people pretending not to swear."],
        ["You always come back dirty.", "That's how you know I came back."],
        ["Will I be a miner too?", "You'll be whatever keeps you above ground and happy."],
    ], { relations:['parent_to_child'], roleAny:['miner'], priority:13 });

    // Miner to merchant: price/quality/logistics rather than camaraderie.
    addMany('miner-merchant', [
        ["You're cutting the ore price again?", "I'm pricing what came out of the cart.", "Then price the bruises too."],
        ["Need lamp oil by morning.", "Need payment by tonight."],
        ["Those pick heads snapped in a week.", "You bought the cheap ones.", "You sold me the cheap ones."],
        ["How much for rope?", "How deep is the shaft?", "Why?", "Because you sound desperate."],
        ["Ore's clean this week.", "Then my scales will be delighted to meet it."],
        ["Don't mix east-face stone with the good carts.", "Tell your loaders, not my buyers."],
        ["You charging extra for candles now?", "Wax costs more.", "Dark hasn't got any cheaper."],
        ["I need boots that survive mine water.", "I sell boots, not miracles."],
        ["Cart axle went again.", "Mine road?", "Mine road.", "Then I know which wheelwright to blame."],
        ["You merchants make more from ore than we do.", "And miners always think merchants sleep indoors."],
    ], { rolePairs:[['miner','merchant'],['merchant','miner']], priority:10 });

    // Miner to guard: hazards/security/contraband/roads.
    addMany('miner-guard', [
        ["You checking lunch pails now?", "Only the ones clinking like unpaid ore."],
        ["Road safe for the night cart?", "Safer with two guards than one brave driver."],
        ["Someone's been cutting the marker ropes.", "In the mine?", "At the old entrance."],
        ["You see strangers near the slag heap?", "Two yesterday. Why?", "Because slag doesn't attract tourists."],
        ["Raiders take ore last time?", "Ore, tools, food. Mostly whatever had handles."],
        ["If the bell rings twice, don't come down.", "Wasn't planning to.", "Good. Nice to agree on something."],
        ["We found footprints by the sealed cut.", "Human?", "Boots. Human is an optimistic conclusion."],
        ["Tell your patrol not to lean on the vent cover.", "Tell your vent cover not to look like a bench."],
    ], { rolePairs:[['miner','guard'],['guard','miner']], priority:10 });

    // Guards change register by audience too.
    addMany('guard-spouse', [
        ["Another night watch?", "Only half.", "Half a night is still all night when I'm awake waiting."],
        ["You said the road was quiet.", "It was.", "Then why is your sleeve torn?", "The road was quiet. The ditch wasn't."],
        ["Leave the spear outside.", "It's regulation.", "So is mud, apparently."],
        ["Can you trade shifts for festival night?", "I'll ask.", "Ask like you mean to come home."],
        ["You keep listening for the bell even at supper.", "Habit.", "Bad habit. Eat."],
        ["Any trouble?", "Nothing worth bringing home.", "You brought it home in your face."],
        ["Your hands are freezing.", "Gate watch.", "Then hold this cup and stop pretending you're made of iron."],
        ["Promise me you won't volunteer.", "For what?", "Exactly."],
    ], { relations:['spouse'], roleAny:['guard'], priority:11 });

    addMany('guard-child', [
        ["Can I hold your spear?", "No.", "Why?", "Because I enjoy having walls without holes."],
        ["Did you catch any bandits?", "I caught a goat in the market.", "That's not a bandit.", "It disagreed."],
        ["Are you the strongest guard?", "Absolutely.", "Mum says you're not.", "Your mother has classified information."],
        ["Do guards get scared?", "Good guards do. Then they pay attention."],
        ["Can I ring the alarm bell?", "Only if there's an alarm.", "Can we make one?", "No."],
        ["Why do you wear that helmet?", "So questions bounce off."],
    ], { relations:['parent_to_child'], roleAny:['guard'], priority:12 });

    // Merchant to spouse/friend/customer distinguishes private worries from public salesmanship.
    addMany('merchant-spouse', [
        ["How bad was market?", "Public answer or married answer?", "Married.", "Bad."],
        ["You extended credit again.", "They'll pay.", "You say that like a prayer now."],
        ["We can't eat inventory.", "Depends how desperate we get about the dried apples."],
        ["That caravan still late?", "Two days.", "And the rent?", "Very punctual."],
        ["You smiled at that customer for ten minutes.", "Professional skill.", "Try it at home sometime."],
        ["Lock the strongbox before bed.", "Already did.", "Check again. That's why I married a merchant."],
        ["We made enough this week?", "Enough for ordinary disasters."],
        ["Stop bringing ledgers to supper.", "The numbers behave better near food."],
    ], { relations:['spouse'], roleAny:['merchant'], priority:11 });

    addMany('merchant-public', [
        ["Price on that?", "Depends whether you're asking or buying."],
        ["Fresh stock?", "Fresh enough to have arrived this week."],
        ["Can you do better?", "I can smile while saying no."],
        ["That's dear.", "So is replacing it when the cheap one breaks."],
        ["You take barter?", "If what you're bartering has fewer opinions than a goat."],
        ["Any news with the caravan?", "News is free. Accurate news costs extra."],
        ["Put it on my account?", "Your account is beginning to need its own chair."],
        ["Got anything from Silverhart?", "Three crates and six complaints about road tolls."],
    ], { roleAny:['merchant'], relations:['acquaintance'], priority:7 });

    // Clergy private/public register.
    addMany('clergy-friend', [
        ["Long day of saving souls?", "Mostly listening to people explain why theirs is an exception."],
        ["You look tired.", "Confession day.", "Yours or theirs?", "At this point, unclear."],
        ["Do priests ever get to be annoyed?", "Constantly. We simply have better vocabulary for it."],
        ["Come have an ale.", "One.", "That sounded rehearsed."],
        ["You ever doubt?", "Every thinking person does. Faith isn't the absence of questions."],
    ], { relations:['friend'], roleAny:['clergy'], priority:9 });

    addMany('clergy-public', [
        ["Will you say a word for my brother?", "Name him and I will."],
        ["Is the chapel open late?", "For prayer, always. For arguments, preferably not."],
        ["I missed service.", "Then come next time. Guilt is a poor substitute for attendance."],
        ["Do I need a candle?", "Need? No. Sometimes hands like something to do while hearts are busy."],
        ["Can I ask something foolish?", "Those are often the useful questions."],
    ], { roleAny:['clergy'], relations:['acquaintance'], priority:7 });

    // Farmers: family vs fellow farmer vs merchant.
    addMany('farmer-spouse', [
        ["Rain missed us again.", "I know.", "I keep checking the sky like it owes us money."],
        ["The south fence is down.", "Again?", "The sheep have a philosophy about boundaries."],
        ["We need another hand at harvest.", "We need three. We can afford half of one."],
        ["Save seed before you sell grain.", "I always do.", "You always say you do."],
        ["Mare's limping.", "I'll look after supper.", "Look before supper. She can't wait on stew."],
        ["You planted too close to the wet ground.", "If it rains, I'm a genius."],
    ], { relations:['spouse'], roleAny:['farmer'], priority:10 });

    addMany('farmer-farmer', [
        ["How's your barley?", "Short, stubborn, and expensive. Like my uncle."],
        ["You sow the north strip yet?", "Waiting on one decent rain."],
        ["Blight on your side?", "Not yet. Don't point at my field when you say it."],
        ["Price for seed went up.", "Price for everything goes up except what we sell."],
        ["Your ram still breaking fences?", "He has a calling."],
        ["You cutting early?", "If the weather keeps threatening me."],
        ["Any frost damage?", "Enough to complain. Not enough to qualify for sympathy."],
        ["Need help with harvest?", "Need help with weather. Harvest I can organise."],
    ], { rolePairs:[['farmer','farmer']], priority:9 });

    addMany('farmer-merchant', [
        ["That's not last week's grain price.", "Last week's grain isn't today's grain."],
        ["You want eggs at that price, collect them yourself."],
        ["Seed costs twice what it did.", "So does getting it here."],
        ["I can give you six sacks Friday.", "I need eight Thursday.", "Then you need another farmer."],
        ["Stop squeezing the apples.", "I'm checking them.", "Check with your eyes."],
        ["You pay cash or credit?", "Which answer makes the grain cheaper?"],
    ], { rolePairs:[['farmer','merchant'],['merchant','farmer']], priority:9 });

    // World-state variants by relationship: the same event is discussed differently.
    addMany('raid-spouse', [
        ["I'm not letting you take night shift while the gates are damaged.", "We need the coin.", "We need you more."],
        ["Every noise wakes me since the raid.", "Me too.", "You never say that.", "Didn't want to make it worse."],
        ["Keep the children inside after dusk.", "Already told them twice."],
        ["We should leave for a while.", "And go where?", "Somewhere the doors still have locks."],
    ], { relations:['spouse'], settlements:['emberlode'], condition:s=>s.emberlodeRaided, priority:16 });

    addMany('raid-coworker', [
        ["They replace the missing tools yet?", "Half. We're sharing picks like spoons."],
        ["North store's still boarded.", "Better boards than another raid."],
        ["Shift roster's a mess since the attack.", "Roster survived better than the roof."],
        ["Keep an eye on the old track tonight.", "I thought the guards had it.", "I said keep an eye."],
    ], { relations:['coworker'], settlements:['emberlode'], condition:s=>s.emberlodeRaided, priority:15 });

    addMany('goblin-peace-friends', [
        ["Never thought I'd trade with goblins.", "You'd trade with a wolf if it paid in silver."],
        ["My gran would haunt me for saying this, but the road's quieter since the agreement."],
        ["You trust the peace?", "I trust quiet more than I trust speeches."],
        ["Saw goblin traders at the south turn.", "And?", "And nothing happened. Strangest part."],
    ], { relations:['friend','coworker','same_trade'], condition:s=>s.goblinResolved && ['goblin_diplomacy','alliance'].includes(s.goblinResolution), priority:14 });

    addMany('ore-road-household', [
        ["Ore wagons are moving again.", "Then maybe smithwork comes down in price.", "You dream extravagantly."],
        ["Road reopened means more strangers through town.", "Means more coin too."],
        ["Heard the first full cart came in clean.", "Good. Maybe winter won't be so thin."],
        ["Don't let the children play by the wagon road now.", "Already moved them twice today."],
    ], { relations:['spouse','housemate'], settlements:['emberlode','hollowmere'], condition:s=>s.oreRoadOpen, priority:13 });

    function relationEligible(ex, pair, state) {
        const d = direction(pair);
        if (ex.relations && !ex.relations.includes(d.relation)) return false;
        if (ex.roleAny && !ex.roleAny.some(r => r === d.aRole || r === d.bRole)) return false;
        if (ex.rolePairs) {
            const ok = ex.rolePairs.some(([a,b]) => a === d.aRole && b === d.bRole);
            if (!ok) return false;
        }
        if (ex.settlements && !ex.settlements.includes(state.settlement)) return false;
        if (ex.condition) {
            try { if (!ex.condition(state, pair, d)) return false; } catch (_) { return false; }
        }
        return true;
    }

    function eligibleSocial(pair, state) {
        return social.filter(ex => relationEligible(ex, pair, state));
    }

    function weightedPick(pool, random=Math.random) {
        if (!pool.length) return null;
        const recent = new Set(window.ambientChatterRecent || []);
        const topics = new Set(window.ambientChatterRecentTopics || []);
        let filtered = pool.filter(ex => !recent.has(ex.id) && !topics.has(ex.topic));
        if (!filtered.length) filtered = pool.filter(ex => !recent.has(ex.id));
        if (!filtered.length) filtered = pool;
        let total = filtered.reduce((n,x)=>n+Math.max(1,x.priority|0),0);
        let roll = random()*total;
        for (const ex of filtered) { roll -= Math.max(1,ex.priority|0); if (roll <= 0) return ex; }
        return filtered[filtered.length-1];
    }

    function chooseRelationshipAware(pair, state=base()?.getWorldState?.(pair), random=Math.random) {
        const socialPool = eligibleSocial(pair,state);
        const basePool = base()?.eligibleExchanges?.(pair,state) || [];
        const relation = relationshipBetween(pair[0],pair[1]);
        // Known relationships strongly favour socially appropriate lines, but
        // never ban ordinary local/weather/world chatter entirely.
        const socialWeight = relation === 'acquaintance' ? 2 : 5;
        const combined = [
            ...basePool,
            ...Array.from({length:socialWeight},()=>socialPool).flat(),
        ];
        return weightedPick(combined,random);
    }

    function install() {
        const b = base();
        if (!b || window.AmbientChatterRelationships?.installed) return false;
        const originalChoose = b.chooseExchange;
        b.chooseExchange = chooseRelationshipAware;
        // The v2 runtime closes over its original chooseExchange, so replace
        // checkAmbientNpcChatter with a relationship-aware equivalent while
        // preserving cadence, dormancy checks and speech bubbles.
        window.checkAmbientNpcChatter = function(delta) {
            const C=b.constants;
            window.ambientChatterAccum=(window.ambientChatterAccum||0)+delta;
            if (window.ambientChatterAccum<C.CHECK_SECONDS) return;
            window.ambientChatterAccum=0;
            if (window.isInCombat) return;
            const partyHexes=window.collectPartyHexes?window.collectPartyHexes():[];
            const candidates=(window.entities||[]).filter(e=>e.alive&&e.isNPC&&e.side==='neutral'&&!e.rider&&!e.noAttack&&(!window.isDormantAmbientNpc||!window.isDormantAmbientNpc(e,partyHexes)));
            const pairs=[];
            for(let i=0;i<candidates.length;i++) for(let j=i+1;j<candidates.length;j++) {
                const a=candidates[i],bb=candidates[j];
                const dd=window.distance?window.distance(a.hex,bb.hex):Math.max(Math.abs(a.hex.q-bb.hex.q),Math.abs(a.hex.r-bb.hex.r));
                if(dd>2) continue;
                const key=[a.name,bb.name].sort().join('|');
                const last=(window.ambientChatterCooldowns||{})[key];
                if(last&&(window.worldSeconds-last)<C.PAIR_COOLDOWN_SECONDS) continue;
                pairs.push([a,bb]);
            }
            if(!pairs.length) return;
            const pair=pairs[Math.floor(Math.random()*pairs.length)];
            const state=b.getWorldState(pair);
            const ex=chooseRelationshipAware(pair,state);
            if(!ex) return;
            ex.lines.forEach((line,i)=>setTimeout(()=>{
                const speaker=i%2===0?pair[0]:pair[1];
                if(!speaker.alive)return;
                window.spawnSpeechBubble?.(speaker.name,b.resolveLine(line,state,pair));
            },i*2500));
            window.ambientChatterCooldowns=window.ambientChatterCooldowns||{};
            window.ambientChatterCooldowns[[pair[0].name,pair[1].name].sort().join('|')]=window.worldSeconds;
            b.remember(ex);
            const d=direction(pair);
            window.lastAmbientChatter={exchangeId:ex.id,topic:ex.topic,settlement:state.settlement,pair:pair.map(x=>x.name),relationship:d.relation,roles:[d.aRole,d.bRole]};
        };
        window.AmbientChatterRelationships={
            installed:true, exchanges:social, relationshipBetween, occupationOf, direction,
            eligibleSocial, chooseRelationshipAware, originalChoose,
        };
        return true;
    }

    if (!install()) {
        const timer=setInterval(()=>{ if(install()) clearInterval(timer); },25);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();