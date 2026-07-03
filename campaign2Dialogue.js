// campaign2Dialogue.js
// Hollowmere opening dialogue: per-NPC talk trees (dispatched via
// talkToNPC's dialogueId lookup) plus the scripted "soldiers shake down the
// tavern keeper" sequence. Every line is its own window.dialogueData entry
// (one key = one line) so each can be mapped to a separate recorded line for
// external text-to-speech, matching the existing arena dialogue convention.

Object.assign(window.dialogueData, {
    hollowmere_soldiers_enter: {
        speaker: 'Narrator', mood: 'neutral',
        dialogue: "The tavern door bangs open. Three armed men in matching colors stride in, eyes on the bar."
    },
    hollowmere_dray_demand: {
        speaker: 'Dray Coltayne', mood: 'cold',
        dialogue: "Evening, Garrick. Ironbond Company's monthly due is past collecting. You know how this goes."
    },
    hollowmere_garrick_protest: {
        speaker: 'Garrick Holt', mood: 'tense',
        dialogue: "Business has been slow, Sergeant. Can it wait 'til the week's end?"
    },
    hollowmere_dray_threat: {
        speaker: 'Dray Coltayne', mood: 'menacing',
        dialogue: "It can't. Pay up, or this place finds out what an 'accident' looks like."
    },
    hollowmere_victory: {
        speaker: 'Garrick Holt', mood: 'relieved',
        dialogue: "It's over... thank you. I didn't think anyone would stand with us against the Company."
    },
    hollowmere_dray_approach: {
        speaker: 'Dray Coltayne', mood: 'businesslike',
        dialogue: "You there — a word, before you go."
    },
    wren_intro: {
        speaker: 'Wren Talbot', mood: 'cheerful',
        dialogue: "Well, here we are then. Try not to get us both killed, yeah?"
    }
});

window.npcDialogueTrees = {
    garrick_holt: (npc) => {
        if (window.hollowmereEventFired) {
            window.showDialogue(npc, "Thanks again for that, friend. The Tankard's doors are always open to you.", [
                { label: "Glad to help.", action: () => {} }
            ]);
        } else {
            window.showDialogue(npc, "Welcome to the Hollow Tankard! Sit, drink, rest a while.", [
                { label: "Thanks, we will.", action: () => {} }
            ]);
        }
    },
    mira_ashbrook: (npc) => {
        window.showDialogue(npc, "Quiet little village, Hollowmere. Most days, anyway.", [
            { label: "Any news from further out?", action: () => {
                if (window.goblinScoutNoteRead) {
                    window.showDialogue(npc, "My cousin rode with the Silverhart levy up to the borderlands, fighting off orc raiders. Last letter said the raids have gotten worse — bigger warbands, moving with more purpose than raiders usually bother with. Made me think of that goblin business you had a hand in. Strange, if it's all connected.", [
                        { label: "Strange indeed.", action: () => {} }
                    ]);
                } else {
                    window.showDialogue(npc, "My cousin rode with the Silverhart levy up to the borderlands, fighting off orc raiders. Last letter said the raids have gotten worse — bigger warbands than the old stories tell. I try not to think on it too much.", [
                        { label: "I hope she's alright.", action: () => {} }
                    ]);
                }
            }},
            { label: "Good to know.", action: () => {} }
        ]);
    },
    oskar_vinn: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'oskars_wager');
        if (quest && quest.status === 'completed') {
            window.showDialogue(npc, "Good bout, that. I'll get my revenge one of these days.", [
                { label: "We'll see.", action: () => {} }
            ]);
            return;
        }
        window.showDialogue(npc, "First time in Hollowmere? Mind the Ironbond lot if they're about.", [
            {
                label: "Care to spar? Friendly bout.",
                action: () => {
                    window.showDialogue(npc, "Ha! Thought you'd never ask. Don't hold back on my account.", [
                        { label: "Let's go.", action: () => window.startOskarDuel() },
                        { label: "Maybe later.", action: () => {} }
                    ]);
                }
            },
            { label: "Heard anything worth knowing?", action: () => {
                window.showDialogue(npc, "Only that the levies keep marching north. Orc raiders on the border, apparently — worse than usual this year. Half tempted to go make a name for myself up there instead of sparring with tavern drunks.", [
                    { label: "Maybe I'll head that way myself.", action: () => {} }
                ]);
            }},
            { label: "Noted.", action: () => {} }
        ]);
    },
    guild_investigator: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'hidden_bodies');
        if (quest && quest.hidden) {
            window.showDialogue(npc, "Three of our men were due back from Hollowmere weeks ago. Never arrived, never sent word. You wouldn't know anything about that, would you?", [
                { label: "No idea what you're talking about.", action: () => {
                    window.adjustReputation(window.factions.ironbond_company, -5, 10);
                    window.showMessage(`${npc.name} studies you a moment too long before moving on to the next table.`);
                }},
                { label: "Say nothing.", action: () => window.showMessage(`${npc.name} watches you a moment, then shrugs and turns away.`) }
            ]);
        } else {
            window.showDialogue(npc, "Three of our men went missing near here a while back. Left enough behind that we know what happened, at least — small mercy compared to some. Keep your eyes open, will you?", [
                { label: "I will.", action: () => {} }
            ]);
        }
    },
    wick_hallow: (npc) => {
        window.showDialogue(npc, "Welcome to Hallow's Goods. Soldier-grade gear, fair prices — what's left of my stock, anyway.", [
            { label: "Let me see your wares.", action: () => window.openShop({ itemIds: window.hollowmereStoreItems, stock: window.hollowmereStoreStock, mounts: false }) },
            { label: "Just looking.", action: () => {} }
        ]);
    },
    hendra_wells: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'missing_child');

        if (!quest) {
            window.showDialogue(npc, "My boy Tam's always off exploring — never listens. But it's been since yesterday, and he always comes home by dark. He was headed out past the crossroads, west along the old road.", [
                {
                    label: "I'll go look for him.",
                    action: () => {
                        window.questLog.push({
                            id: 'missing_child',
                            title: 'The Missing Boy',
                            giver: 'Hendra Wells',
                            status: 'active',
                            description: "Find Tam Wells — last seen heading west along the old road, past the crossroads.",
                            offeredAt: window.worldSeconds
                        });
                        window.showMessage('Quest added: The Missing Boy.');
                    }
                },
                { label: "I'm sure he's fine.", action: () => {} }
            ]);
            return;
        }

        if (quest.status === 'active' && !quest.encounterState) {
            window.showDialogue(npc, "Please, if you find anything out there...", [{ label: "I'm still looking.", action: () => {} }]);
            return;
        }
        if (quest.status === 'active' && quest.encounterState === 'wolves') {
            window.showDialogue(npc, "Tam! Oh, thank the gods!", [
                {
                    label: "Found him just in time.",
                    action: () => {
                        quest.status = 'completed';
                        window.adjustReputation(npc.reputation, 20, 20);
                        window.party[0].gold = (window.party[0].gold || 0) + 30;
                        if (window.gainExp) window.gainExp(200);
                        window.showMessage('Quest complete: The Missing Boy. (+30 gold)');
                    }
                }
            ]);
            return;
        }
        if (quest.status === 'active' && quest.encounterState === 'corpse') {
            window.showDialogue(npc, "You... you found him. Oh, Tam.", [
                {
                    label: "I'm so sorry.",
                    action: () => {
                        quest.status = 'completed';
                        window.adjustReputation(npc.reputation, 5, 20);
                        window.party[0].gold = (window.party[0].gold || 0) + 10;
                        if (window.gainExp) window.gainExp(80);
                        window.showMessage('Quest complete: The Missing Boy. (+10 gold)');
                    }
                }
            ]);
            return;
        }
        window.showDialogue(npc, "Thank you again, for what it's worth now.", [{ label: "...", action: () => {} }]);
    },
    old_mac: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'farm_wolves');

        if (!quest) {
            window.showDialogue(npc, "Wolves been at my pasture the past few nights. Lost two sheep already — can't fight 'em off alone anymore.", [
                {
                    label: "I'll deal with the wolves.",
                    action: () => {
                        window.questLog.push({
                            id: 'farm_wolves',
                            title: 'Wolves at the Farm',
                            giver: 'Old Mac',
                            status: 'active',
                            description: "Clear the wolf pack menacing Old Mac's pasture."
                        });
                        window.showMessage('Quest added: Wolves at the Farm.');
                    }
                },
                { label: "Not my problem.", action: () => {} }
            ]);
            return;
        }

        if (quest.status === 'active' && !quest.encounterState) {
            window.showDialogue(npc, "They usually come round the pasture fence, after dark. Best go take a look.", [
                { label: "I'm on it.", action: () => {} }
            ]);
            return;
        }

        if (quest.status === 'active' && quest.encounterState === 'engaged') {
            const wolvesRemain = window.entities.some(e => e.farmQuestWolf && e.alive);
            if (wolvesRemain) {
                window.showDialogue(npc, "Still hear 'em out there. Best finish the job.", [{ label: "Back to it.", action: () => {} }]);
            } else {
                window.showDialogue(npc, "You got 'em! By God, every last one. That's a weight off, truly.", [
                    {
                        label: "Glad to help.",
                        action: () => {
                            quest.status = 'completed';
                            window.adjustReputation(npc.reputation, 15, 20);
                            window.party[0].gold = (window.party[0].gold || 0) + 25;
                            if (window.gainExp) window.gainExp(150);
                            // A cleared local threat nudges the village's security a little,
                            // rippling faintly up toward the barony (see regions.js) — small
                            // and slow, not a fix, matching the "fragile peace" this system models.
                            if (window.cascadeRegionStat) window.cascadeRegionStat('hollowmere', 'security', 6);
                            window.showMessage('Quest complete: Wolves at the Farm. (+25 gold)');
                        }
                    }
                ]);
            }
            return;
        }

        window.showDialogue(npc, "Pasture's quiet now, thanks to you.", [{ label: "Good.", action: () => {} }]);
    },
    ser_aldric_captive: (npc) => {
        if (window.party.some(p => p.name === window.campaign2Paladin.name)) return; // already rescued
        window.showDialogue(npc, "Please... cut me loose. I came out here to deal with this goblin problem myself, and, well — here we are. Whatever you decide to do about them, I intend to see them gone from this land. I'll owe you a debt either way.", [
            { label: "I'll free you now.", action: () => window.rescuePaladin() },
            { label: "Not yet.", action: () => {} }
        ]);
    },
    chief_skarnub: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'goblin_threat');
        const goblinRep = window.factions.goblin_tribe.standing;

        if (quest && quest.resolution) {
            window.showDialogue(npc, "We have nothing left to discuss.", [{ label: "...", action: () => {} }]);
            return;
        }

        if (goblinRep >= 40) {
            window.showDialogue(npc, "You've done right by us. Truth told, this land's more trouble than it's worth — humans always come eventually. Guarantee us safe passage and supplies, and we'll move on. No more blood spilled, on either side.", [
                {
                    label: "Agreed. Take what you need and go.",
                    action: () => {
                        if (!quest) window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' });
                        const q = window.questLog.find(q2 => q2.id === 'goblin_threat');
                        q.status = 'completed';
                        q.resolution = 'goblin_diplomacy';
                        window.adjustReputation(window.factions.silverhart_kingdom, -10, 10); // letting a raiding tribe walk away paid off, doesn't sit well with the kingdom
                        window.adjustReputation(window.factions.goblin_tribe, 15, 15);
                        if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 8);
                        if (window.gainExp) window.gainExp(150);
                        window.rescuePaladin();
                        if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, -10, "let the goblins go free instead of answering for what they've done");
                        window.showMessage('The Skarn-tooth tribe breaks camp and moves on. Quest complete: The Skarn-tooth Tribe.');
                    }
                },
                { label: "Not yet.", action: () => {} }
            ]);
            return;
        }

        window.showDialogue(npc, "Another human, come to gawk or to fight? Speak quick.", [
            {
                label: "I could help you, for the right price.",
                action: () => {
                    if (!quest) {
                        window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' });
                    }
                    window.showDialogue(npc, "Hah. A human with sense. Bring me what I ask, and we'll get along fine.", [
                        { label: "What do you need?", action: () => window.offerGoblinFavor(npc) }
                    ]);
                }
            },
            {
                label: "Leave this land, or face us.",
                action: () => window.showMessage('Chief Skarnub bares his teeth. "Face us, then — see how far that gets you."')
            },
            { label: "Just looking.", action: () => {} }
        ]);
    },
    nix_sharpear: (npc) => {
        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'goblin_threat');
        if (quest && quest.chiefAssassinated && !quest.resolution) {
            window.showDialogue(npc, "You... you killed him. Skarnub was going to get us all killed clinging to this ground anyway. Truth told, I've wanted to move on for moons now. Let's not make enemies over this — we'll go, quietly, if you let us.", [
                { label: "Take your people and go.", action: () => window.resolveGoblinSuccession() },
                { label: "...", action: () => {} }
            ]);
            return;
        }
        if (quest && quest.resolution) {
            window.showDialogue(npc, "We're already gone from here, or will be soon enough.", [{ label: "Good.", action: () => {} }]);
            return;
        }
        window.showDialogue(npc, "Something you need? Speak quick, this isn't a place for wandering humans.", [
            { label: "Why are you really this close to the village?", action: () => {
                window.showDialogue(npc, "You think Skarnub chose this ground? We were told to sit here, watch the roads, count what comes and goes. Somebody's paying close attention to your precious Hollowmere, and it isn't us. I've said too much — forget I spoke.", [
                    { label: "Who told you to watch us?", action: () => window.showDialogue(npc, "Someone with a lot more banners than we've got. That's all you're getting from me.", [{ label: "...", action: () => {} }]) }
                ]);
            }},
            { label: "Just passing through.", action: () => {} }
        ]);
    },
    petra_hollis: (npc) => {
        window.showDialogue(npc, "Don't get many travelers this far. Word is something's stirred up trouble on the road south of here — a house gone quiet, no one seen in or out for weeks. Nobody round here's brave enough to go look.", [
            {
                label: "I've been to that house.",
                action: () => window.showDialogue(npc, "Then you know more than I care to. Keep whatever you found to yourself, if you can.", [{ label: "Noted.", action: () => {} }])
            },
            {
                label: "Anything else I should know?",
                action: () => window.showDialogue(npc, "Just that Millbrook keeps its head down and its doors locked at night, same as always.", [{ label: "Wise.", action: () => {} }])
            }
        ]);
    },
    corran_vale: (npc) => {
        if (!window.questLog) window.questLog = [];
        const goblinQuest = window.questLog.find(q => q.id === 'goblin_threat');
        const resolvedSafe = !!(goblinQuest && goblinQuest.resolution && goblinQuest.resolution !== 'betrayal');
        const betrayed = !!(goblinQuest && goblinQuest.resolution === 'betrayal');
        let buriedRoad = window.questLog.find(q => q.id === 'buried_road');
        let oreRoad = window.questLog.find(q => q.id === 'ore_road_reopened');

        if (window.emberlodeRaided) {
            window.showDialogue(npc, "Goblins came down out of nowhere and cleaned us out — strongbox, ore stores, the lot. Nobody killed, small mercy, but we've nothing left to run carts with even if the road were safe.", [
                { label: "That's rough.", action: () => {} }
            ]);
            return;
        }

        if (betrayed) {
            window.showDialogue(npc, "Whatever's happening with the goblins now, it's worse, not better. We've pulled everyone we can spare back behind the hall doors. Emberlode isn't shipping anything until this passes.", [
                { label: "I'm sorry.", action: () => {} }
            ]);
            return;
        }

        if (oreRoad && oreRoad.status === 'completed') {
            window.showDialogue(npc, "First wagon home safe, thanks to you. We'll remember that, out here.", [
                { label: "Glad to help.", action: () => {} }
            ]);
            return;
        }
        if (oreRoad && oreRoad.status === 'active') {
            window.showDialogue(npc, "Wagon's loaded and hitched whenever you're ready to see it down the road.", [
                { label: "I'll get it moving.", action: () => window.startEmberlodeEscort() },
                { label: "Not yet.", action: () => {} }
            ]);
            return;
        }
        if (resolvedSafe) {
            if (buriedRoad) buriedRoad.status = 'completed';
            window.showDialogue(npc, "Word reached us the Skarn-tooth business is settled. Can't tell you what that's worth to us — we've been running half-crews and losing carts for a season. First shipment in weeks, and I'd feel a lot better with an escort. Interested?", [
                {
                    label: "I'll see it there safely.",
                    action: () => {
                        window.questLog.push({
                            id: 'ore_road_reopened', title: 'Ore Road Reopened', giver: 'Corran Vale', status: 'active',
                            description: 'Escort Emberlode\'s first ore wagon safely down the road to Hollowmere.',
                            offeredAt: window.worldSeconds
                        });
                        window.showMessage("Corran claps you on the shoulder. \"Wagon's being loaded now. Come find me when you're ready.\"");
                    }
                },
                { label: "Maybe later.", action: () => {} }
            ]);
            return;
        }

        if (!buriedRoad) {
            window.showDialogue(npc, "You're not from around here. Careful on that road — the Skarn-tooth tribe's dug in east of here, and they've taken three carts off us this month alone. Half my crew won't run it anymore.", [
                {
                    label: "I'll see what I can do about the goblins.",
                    action: () => {
                        window.questLog.push({
                            id: 'buried_road', title: 'The Buried Road', giver: 'Corran Vale', status: 'active',
                            description: "Deal with the Skarn-tooth tribe so Emberlode's ore carts can run the west road again."
                        });
                        window.showMessage('Corran nods, grim. "Do that, and Emberlode owes you a debt."');
                    }
                },
                { label: "Not my problem.", action: () => {} }
            ]);
        } else {
            window.showDialogue(npc, "Still no word the road's any safer. Whatever you're doing about those goblins, we're all hoping it works.", [
                { label: "Working on it.", action: () => {} }
            ]);
        }
    },
    emberlode_miner: (npc) => {
        const goblinQuest = window.questLog && window.questLog.find(q => q.id === 'goblin_threat');
        const resolvedSafe = !!(goblinQuest && goblinQuest.resolution && goblinQuest.resolution !== 'betrayal');
        if (resolvedSafe) {
            window.showDialogue(npc, "First good night's sleep I've had in a season, knowing the road's clear. Corran says we might even be back to full crews by next month.", [
                { label: "Good to hear.", action: () => {} }
            ]);
        } else {
            window.showDialogue(npc, "Ore's still in the ground same as ever — it's getting it out that's the trouble. Nobody wants to run the west road with the Skarn-tooth camp sitting right on it.", [
                { label: "Hang in there.", action: () => {} }
            ]);
        }
    },
    marta_wynfield: (npc) => {
        let opening;
        if (!window.hollowmereEventFired) {
            opening = "Welcome, traveler. Hollowmere's a small place, but an honest one.";
        } else {
            const standing = npc.reputation?.standing ?? 0;
            if (standing >= 15) opening = "Word of what you did at the Tankard reached me. Hollowmere doesn't forget a favor like that.";
            else if (standing <= -5) opening = "I heard about the Tankard. Garrick's a proud man — I imagine that stung him more than you know.";
            else opening = "I heard the Ironbond men were in the village again. Nothing's changed there, I'm afraid.";
        }

        if (!window.questLog) window.questLog = [];
        const quest = window.questLog.find(q => q.id === 'elder_locket');
        const player = window.party[0];
        const hasLocket = player?.inventory?.includes('elder_locket');

        if (quest && quest.status === 'active' && hasLocket) {
            window.showDialogue(npc, "Is that... you found it! My mother's locket, after all these years.", [
                { label: "Here you go.", action: () => {
                    player.inventory = player.inventory.filter(i => i !== 'elder_locket');
                    quest.status = 'completed';
                    window.adjustReputation(npc.reputation, 15, 20);
                    player.gold = (player.gold || 0) + 20;
                    if (window.gainExp) window.gainExp(100);
                    window.showMessage('Quest complete: A Missing Locket. (+20 gold)');
                }}
            ]);
            return;
        }
        if (quest && quest.status === 'active') {
            window.showDialogue(npc, "Still keeping an eye out for that locket, I hope? I lost it somewhere near the old chapel.", [
                { label: "I'll find it.", action: () => {} }
            ]);
            return;
        }
        if (quest && quest.status === 'completed') {
            const completedCount = (window.questLog || []).filter(q =>
                ['elder_locket', 'oskars_wager', 'farm_wolves', 'missing_child'].includes(q.id) && q.status === 'completed'
            ).length;
            const goblinQuest = window.questLog.find(q => q.id === 'goblin_threat');
            if (completedCount >= 2 && !goblinQuest) {
                window.showDialogue(npc, "You've done more for Hollowmere than most ever do. There's... one more thing, if you're willing to hear it. West of here, past the crossroads, a goblin tribe has made camp. So far they've kept their distance, traded a little, even — but they're hungry more often than not, and hungry goblins raid. I fear it's only a matter of time before Hollowmere's their next target.", [
                    {
                        label: "Tell me more.",
                        action: () => {
                            window.questLog.push({
                                id: 'goblin_threat',
                                title: 'The Skarn-tooth Tribe',
                                giver: 'Elder Marta Wynfield',
                                status: 'active',
                                description: "A goblin tribe has camped a long way west, past the crossroads. Deal with them however you see fit."
                            });
                            window.showMessage('Quest added: The Skarn-tooth Tribe.');
                            window.showDialogue(npc, "How you handle it is your business — fight them off, talk them down, whatever ends with Hollowmere safe. Just... be careful. They're not mindless, whatever the stories say.", [
                                { label: "I'll see what I can do.", action: () => {} }
                            ]);
                        }
                    },
                    { label: "Not my concern.", action: () => {} }
                ]);
                return;
            }
            window.showDialogue(npc, opening, [{ label: "Noted.", action: () => {} }]);
            return;
        }

        window.showDialogue(npc, opening, [
            {
                label: "Need any help around the village?",
                action: () => {
                    window.showDialogue(npc, "As it happens... I lost my mother's locket years back, somewhere near the old chapel. Silly to still hope, but if you ever spot it...", [
                        { label: "I'll keep an eye out.", action: () => {
                            window.questLog.push({
                                id: 'elder_locket',
                                title: 'A Missing Locket',
                                giver: 'Elder Marta Wynfield',
                                status: 'active',
                                description: "Find Elder Marta's mother's locket, lost somewhere near the old chapel."
                            });
                            window.showMessage('Quest added: A Missing Locket.');
                        }}
                    ]);
                }
            },
            { label: "Noted.", action: () => {} }
        ]);
    },
    // Breadcrumb for the borderlands/orc-raider thread — a worried mother,
    // not a quest giver yet. No flags set, nothing tracked; just a reason
    // to go looking north eventually.
    yvette_marlow: (npc) => {
        window.showDialogue(npc, "Oh — sorry, didn't mean to stare. My boy Tomas went off with the border levy three months back. Fighting orc raiders up past Aldervale.", [
            {
                label: "Have you heard from him?",
                action: () => {
                    window.showDialogue(npc, "A letter, once, back in Brightsun. Said the raids were getting worse — more of them, better organized than the raiding parties used to be. Nothing since. I try to tell myself the roads are just slow this time of year.", [
                        { label: "I'm sure he's fine.", action: () => {} }
                    ]);
                }
            },
            { label: "I'm sorry to hear that.", action: () => {} }
        ]);
    }
};

function startHollowmereShakedown() {
    if (window.hollowmereEventFired) return;
    window.hollowmereEventFired = true;

    const dray = window.entities.find(e => e.name === 'Dray Coltayne');
    const enforcers = window.entities.filter(e => e.factionId === 'ironbond_company' && e !== dray);
    const garrick = window.entities.find(e => e.name === 'Garrick Holt');

    // Open the door, then have the soldiers walk in for real (destination +
    // the engine's own autoMoveProcess/lerp — see gameEngine.js — rather than
    // teleporting), closing it again once they're through.
    if (window.toggleDoor) window.toggleDoor(0, 4);

    const entryHexes = [{ q: -2, r: 3 }, { q: 0, r: 3 }, { q: 2, r: 3 }];
    [dray, ...enforcers].forEach((e, i) => {
        if (!e) return;
        e.pendingEntry = false;
        e.destination = entryHexes[i] || entryHexes[0];
    });

    setTimeout(() => {
        if (window.toggleDoor && window.getTerrainAt(0, 4).name !== 'Wall') window.toggleDoor(0, 4);
    }, 3000);

    window.triggerAmbientDialogue('hollowmere_soldiers_enter');
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_dray_demand'), 4500);
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_garrick_protest'), 7000);
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_dray_threat'), 9500);

    setTimeout(() => {
        window.showDialogue(dray || garrick, "What do you do?", [
            { label: "Stay out of it.", action: () => window.resolveShakedown('stay_out') },
            { label: "Tell Garrick to pay — and back it with a threat.", action: () => window.resolveShakedown('encourage_pay') },
            { label: "Side with Garrick. Fight them.", action: () => window.resolveShakedown('fight') }
        ]);
    }, 12000);
}

function resolveShakedown(branch) {
    const garrick = window.entities.find(e => e.name === 'Garrick Holt');
    const mira = window.entities.find(e => e.name === 'Mira Ashbrook');
    const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
    const dray = window.entities.find(e => e.name === 'Dray Coltayne');
    const enforcers = window.entities.filter(e => e.factionId === 'ironbond_company' && e !== dray);
    const ironbond = window.factions.ironbond_company;
    const silverhart = window.factions.silverhart_kingdom;
    const elder = window.regionalNPCs?.elder;
    const baron = window.regionalNPCs?.baron;

    // Garrick's case is the one that plausibly reaches the authorities above
    // him (he's the wronged business owner) — the elder hears about it, the
    // baron gets a much fainter impression, and word barely reaches the
    // kingdom at all. Patrons' personal opinions stay local (no cascade).
    const authorityChain = [garrick?.reputation, elder?.reputation, baron?.reputation, silverhart];

    const patrons = [mira, oskar].filter(Boolean);

    // The Company's kingdom-wide influence barely moves on the back of one
    // tavern's dues — a handful of points either way, not the reputation
    // swings above. See factions.js: this is tracked but nothing else reads
    // it yet.
    if (branch === 'stay_out') {
        window.cascadeReputation(authorityChain, -10, 10);
        patrons.forEach(p => window.adjustReputation(p.reputation, -5, 5));
        window.adjustReputation(ironbond, 5, 5);
        window.adjustMerchantInfluence(ironbond, 'silverhart_kingdom', 1);
        window.showMessage("Garrick pays up, shoulders slumped. The soldiers leave with their due.");
        exitSoldiersPeacefully(dray, enforcers);
    } else if (branch === 'encourage_pay') {
        window.cascadeReputation(authorityChain, 5, 15);
        patrons.forEach(p => window.adjustReputation(p.reputation, 0, 10));
        window.adjustReputation(ironbond, 15, 15);
        window.adjustMerchantInfluence(ironbond, 'silverhart_kingdom', 2);
        window.showMessage("You back the demand with a hard stare. The soldiers take their due and leave without further trouble.");
        exitSoldiersPeacefully(dray, enforcers);
    } else if (branch === 'fight') {
        window.cascadeReputation(authorityChain, 25, 20);
        patrons.forEach(p => window.adjustReputation(p.reputation, 20, 20));
        window.adjustReputation(ironbond, -35, 25);
        window.adjustMerchantInfluence(ironbond, 'silverhart_kingdom', -2);
        window.showMessage("Steel rings out! Garrick grabs his club — this is happening.");

        // Allies stay side:'player' (so all the existing friend/foe checks treat
        // them correctly) but are flagged aiControlled so they fight on their own
        // instead of being manually puppeted — same mechanism the game already
        // uses for mounts (see the isSentientAlly exclusion in gameEngine.js).
        [garrick, ...patrons].forEach(p => {
            if (!p) return;
            p.side = 'player';
            p.aiControlled = true;
            p.aiState = 'combat';
            p.isNPC = false;
            p.hasBeenSeenByPlayer = true;
        });
        [dray, ...enforcers].forEach(e => {
            if (!e) return;
            e.isNPC = false;
            e.hasBeenSeenByPlayer = true;
        });
        if (dray) {
            dray.side = 'enemy';
            window.wakeUp(dray); // chain-alerts the enforcers within range automatically
        }
        enforcers.forEach(e => { e.side = 'enemy'; });
    }

    window.drawMap();
    window.renderEntities();
    if (window.updateActionButtons) window.updateActionButtons();
}

// The soldiers leave the same way they came in — through the front door,
// not teleporting away — then wait just outside for the player to leave too.
function exitSoldiersPeacefully(dray, enforcers) {
    if (window.toggleDoor) window.toggleDoor(0, 4);

    const waitHexes = [{ q: -1, r: 6 }, { q: 0, r: 6 }, { q: 1, r: 6 }];
    [dray, ...enforcers].forEach((e, i) => {
        if (!e) return;
        e.destination = waitHexes[i] || waitHexes[0];
    });

    setTimeout(() => {
        if (window.toggleDoor && window.getTerrainAt(0, 4).name !== 'Wall') window.toggleDoor(0, 4);
    }, 3000);

    window.hollowmereSoldiersWaitingOutside = true;
    window.hollowmereQuestOfferFired = false;
}

// Only relevant after the 'fight' branch actually kills the three Ironbond
// men (the other two branches let them leave alive — nothing to hide).
// Called from checkCombatEnd (gameEngine.js) right after the victory
// dialogue fires.
function offerBodyDisposalQuest() {
    if (!window.questLog) window.questLog = [];
    if (window.questLog.find(q => q.id === 'hidden_bodies')) return;
    const dray = window.entities.find(e => e.name === 'Dray Coltayne');
    if (!dray || dray.alive) return;
    const garrick = window.entities.find(e => e.name === 'Garrick Holt' && e.alive);
    if (!garrick) return;

    window.showDialogue(garrick, "Three Ironbond men, dead in my tavern. If word gets back to the Company before we're ready for it, they'll send twice as many next time. We should deal with this quietly.", [
        {
            label: "Help him hide the bodies.",
            action: () => {
                window.questLog.push({
                    id: 'hidden_bodies', title: 'Loose Ends', giver: 'Garrick Holt', status: 'completed',
                    description: "Helped Garrick dispose of the Ironbond dead before word could spread.",
                    hidden: true, offeredAt: window.worldSeconds
                });
                window.showMessage("Between you, the bodies disappear into the old cellar before dawn. Whether it stays buried is another matter.");
                if (window.updateActionButtons) window.updateActionButtons();
            }
        },
        {
            label: "Leave them for whoever finds them.",
            action: () => {
                window.questLog.push({
                    id: 'hidden_bodies', title: 'Loose Ends', giver: 'Garrick Holt', status: 'completed',
                    description: "Left the Ironbond dead where they fell, for whoever found them first.",
                    hidden: false, offeredAt: window.worldSeconds
                });
                window.showMessage("You leave it be. Someone will find them soon enough.");
                if (window.updateActionButtons) window.updateActionButtons();
            }
        }
    ]);
}
window.offerBodyDisposalQuest = offerBodyDisposalQuest;

// Weeks later, the Company notices its men never reported back and sends
// someone to ask around. Watched from worldTime.js's tick, same time-gate
// pattern as triggerMissingChildEncounter. Fires regardless of whether the
// bodies were hidden or not — the dialogue just reacts differently (see
// npcDialogueTrees.guild_investigator).
function triggerGuildInvestigatorEncounter() {
    if (!window.questLog) return;
    const quest = window.questLog.find(q => q.id === 'hidden_bodies');
    if (!quest || quest.encounterState) return;

    const daysPassed = (window.worldSeconds - (quest.offeredAt || 0)) / (24 * 3600);
    if (daysPassed < 14) return;
    quest.encounterState = 'investigator_arrived';

    const investigator = window.buildNPC({ ...window.campaign2GuildInvestigator, hex: { q: -2, r: -1 } });
    window.entities.push(investigator);
    window.showMessage(`${investigator.name} steps into the Hollow Tankard, eyes sweeping the room. "Ironbond Company. We're asking around about some new faces in town — mind a word?"`);
    window.drawMap();
    window.renderEntities();
}
window.triggerGuildInvestigatorEncounter = triggerGuildInvestigatorEncounter;

// Watched from worldTime.js each tick: fires once, the first time the player
// crosses back outside after the soldiers left peacefully.
function triggerHollowmereQuestOffer() {
    if (window.hollowmereQuestOfferFired) return;
    window.hollowmereQuestOfferFired = true;

    const dray = window.entities.find(e => e.name === 'Dray Coltayne' && e.alive);
    const player = window.entities.find(e => e.side === 'player' && !e.rider);
    if (!dray || !player) return;

    dray.destination = { q: player.hex.q, r: player.hex.r + 1 };

    window.triggerAmbientDialogue('hollowmere_dray_approach');
    setTimeout(() => {
        window.showDialogue(dray, "You handled that back there without making a mess of it. The Company can use people like that.", [
            {
                label: "What do you need?",
                action: () => {
                    window.showDialogue(dray, "A courier of ours went dark on the North Road with a satchel of signed contracts. Bring it back, and there's coin in it for you.", [
                        { label: "Accept the job.", action: () => {
                            if (!window.questLog) window.questLog = [];
                            window.questLog.push({
                                id: 'ironbond_missing_courier',
                                title: 'The Missing Courier',
                                giver: 'Dray Coltayne',
                                factionId: 'ironbond_company',
                                status: 'active',
                                description: "Find the Ironbond courier who went missing on the North Road and recover the satchel of contracts."
                            });
                            window.adjustReputation(window.factions.ironbond_company, 10, 10);
                            window.showMessage("Quest added: The Missing Courier.");
                        }},
                        { label: "Not interested.", action: () => {
                            window.showMessage(`${dray.name}: "Suit yourself."`);
                        }}
                    ]);
                }
            },
            { label: "Walk away.", action: () => {} }
        ]);
    }, 1500);
}

// Mid-combat parley: talk to a hostile instead of attacking. Humanoid enemies
// get a "demand surrender" option; for now it's always declined (no mechanical
// effect) per design — a place to hook morale/negotiation mechanics later.
function parleyWithEnemy(target) {
    if (target.tags && target.tags.includes('humanoid')) {
        window.showDialogue(target, "They eye you warily, weapon still raised.", [
            { label: "Demand they surrender.", action: () => {
                window.showMessage(`${target.name}: "Not a chance."`);
            }},
            { label: "Never mind.", action: () => {} }
        ]);
    } else {
        window.showDialogue(target, "It doesn't seem interested in talking.", [
            { label: "Never mind.", action: () => {} }
        ]);
    }
}

// "Oskar's Wager" — a friendly, non-lethal sparring match. Flips Oskar
// hostile just long enough to fight through the real turn-based combat
// engine, then the tick-watcher in worldTime.js ends it safely once he's
// taken enough of a beating, before any real death-handling code could ever
// see him drop to 0 HP.
function startOskarDuel() {
    const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
    if (!oskar) return;
    window.oskarDuelActive = true;
    oskar.side = 'enemy';
    oskar.aiState = 'combat';
    oskar.isNPC = false;
    oskar.hasBeenSeenByPlayer = true;
    window.wakeUp(oskar);
    window.showMessage('Oskar grins and squares up. "Don\'t hold back!"');
}

function endOskarDuel() {
    if (!window.oskarDuelActive) return;
    window.oskarDuelActive = false;

    const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
    if (oskar) {
        oskar.side = 'neutral';
        oskar.isNPC = true;
        oskar.aiState = 'idle';
        oskar.hp = oskar.maxHp;
        oskar.timePoints = 0;
        window.adjustReputation(oskar.reputation, 10, 15);
    }

    if (window.party && window.party[0]) window.party[0].gold = (window.party[0].gold || 0) + 10;
    if (window.gainExp) window.gainExp(50);

    window.isInCombat = false;
    window.gamePhase = 'WAITING';
    window.currentTurnEntity = null;

    if (!window.questLog) window.questLog = [];
    const existing = window.questLog.find(q => q.id === 'oskars_wager');
    if (existing) existing.status = 'completed';
    else window.questLog.push({
        id: 'oskars_wager',
        title: "Oskar's Wager",
        giver: 'Oskar Vinn',
        status: 'completed',
        description: 'A friendly sparring match with Oskar Vinn.'
    });

    window.showMessage('Oskar raises a hand. "Alright, alright — you win! Not bad at all." (+10 gold)');
    if (window.updateActionButtons) window.updateActionButtons();
    window.drawMap();
    window.renderEntities();
}

// Fixed wilderness spot out along the west road (see campaign2World.js's
// crossroads) where Tam went exploring. Checked from worldTime.js's tick —
// once the player wanders within range, this resolves the encounter based
// on how long it's been since the quest was offered: within 3 in-game days,
// he's found alive but under attack; after that, only a corpse remains.
window.campaign2TamEncounterHex = { q: -60, r: 26 };

function triggerMissingChildEncounter() {
    if (!window.questLog) return;
    const quest = window.questLog.find(q => q.id === 'missing_child');
    if (!quest || quest.status !== 'active' || quest.encounterState) return;

    const daysPassed = (window.worldSeconds - (quest.offeredAt || 0)) / (24 * 3600);
    const hex = window.campaign2TamEncounterHex;

    if (daysPassed < 3) {
        quest.encounterState = 'wolves';
        const tam = window.buildNPC({ ...window.campaign2Tam, hex: { q: hex.q, r: hex.r - 1 }, classLevels: [], skillPicks: [], equipment: [], side: 'neutral' });
        window.entities.push(tam);
        [{ q: hex.q - 1, r: hex.r }, { q: hex.q + 1, r: hex.r }].forEach(wolfHex => {
            const wolf = window.createMonster('wolf', wolfHex, null, null, 'enemy');
            window.entities.push(wolf);
            window.wakeUp(wolf);
        });
        window.showMessage("A child's scream, close by — and the snarl of wolves!");
    } else {
        quest.encounterState = 'corpse';
        window.tileObjects[`${hex.q},${hex.r}`] = { type: 'corpse_marker', lightRadius: 0 };
        const knowsNature = window.party && window.party.some(p => window.hasKnowledgeNature(p));
        if (knowsNature) {
            window.showMessage("You find Tam's body, wolf tracks all around — a pack got to him days ago.");
        } else {
            window.showMessage("You find Tam's body. Something got to him, out here alone.");
        }
    }

    window.drawMap();
    window.renderEntities();
}
window.triggerMissingChildEncounter = triggerMissingChildEncounter;

// Old Mac's pasture wolves (see campaign2World.js's buildFarmstead, which
// sets window.campaign2FarmPastureCenter). Triggered once, from proximity
// (worldTime.js), while the quest is active. Wolves are tagged
// farmQuestWolf so old_mac's turn-in check doesn't get confused by an
// unrelated wilderness wolf pack wandering nearby.
function triggerFarmWolfEncounter() {
    if (!window.questLog || !window.campaign2FarmPastureCenter) return;
    const quest = window.questLog.find(q => q.id === 'farm_wolves');
    if (!quest || quest.status !== 'active' || quest.encounterState) return;

    quest.encounterState = 'engaged';
    const center = window.campaign2FarmPastureCenter;
    [{ q: center.q - 1, r: center.r - 1 }, { q: center.q + 1, r: center.r }, { q: center.q, r: center.r + 1 }].forEach(hex => {
        const wolf = window.createMonster('wolf', hex, null, null, 'enemy');
        wolf.farmQuestWolf = true;
        window.entities.push(wolf);
        window.wakeUp(wolf);
    });
    window.showMessage('Snarling erupts from the pasture — the wolves are here!');
    window.drawMap();
    window.renderEntities();
}
window.triggerFarmWolfEncounter = triggerFarmWolfEncounter;

// Random wilderness encounters: out past the village/farmland (35+ hexes
// from the village center), wandering risks a wolf pack — especially
// heading west, toward the unnamed, skull-marked road. Rolled at most once
// per ~2 in-game minutes of wilderness travel (accumulator, not per-tick
// probability, so it isn't tied to real framerate).
window.wildernessEncounterAccum = 0;
function checkWildernessEncounter(playerEntity, delta) {
    if (!playerEntity || window.isInCombat) return;
    // A safer Hollowmere pushes the "safe" radius outward too (patrols
    // ranging further), not just how often encounters happen once past it.
    const security = window.regions?.hollowmere?.security ?? 50;
    const safeRadius = 25 + (security / 100) * 20; // 25 at 0 security, up to 45 at 100
    if (window.distance(playerEntity.hex, { q: 0, r: 0 }) < safeRadius) return;

    window.wildernessEncounterAccum += delta;
    const checkInterval = 120; // seconds of in-game wilderness travel between rolls
    if (window.wildernessEncounterAccum < checkInterval) return;
    window.wildernessEncounterAccum = 0;

    const cp = window.campaign2Landmarks.crossroads;
    const headingWest = playerEntity.hex.q < cp.q - 20;
    // Base chance responds to Hollowmere's security too: a safer village
    // means rarer wolves nearby. West stays flavorfully more dangerous on
    // top of that — whatever earned that skull on the signpost isn't part
    // of this security system yet.
    const maxChance = headingWest ? 0.5 : 0.2;
    const chance = ((100 - security) / 100) * maxChance;
    if (Math.random() >= chance) return;

    const count = 1 + Math.floor(Math.random() * 2); // 1-2 wolves
    // Never spawn inside the player's visual range — encounters should be
    // discovered by walking toward them (or by a wolf stalking in), not by
    // popping into existence on top of the party. Try a handful of random
    // directions/distances just outside vision and settle for the first
    // clear, unseen hex each wolf finds.
    let spawned = 0;
    for (let n = 0; n < count; n++) {
        let spot = null;
        for (let attempt = 0; attempt < 12 && !spot; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 10 + Math.floor(Math.random() * 6); // just past the ~30-hex daylight vision cap's edge cases and any nearer dark-vision viewers
            const candidate = window.hexRound(
                playerEntity.hex.q + Math.round(Math.cos(angle) * dist),
                playerEntity.hex.r + Math.round(Math.sin(angle) * dist)
            );
            if (window.getEntityAtHex(candidate.q, candidate.r)) continue;
            if (window.getTerrainAt(candidate.q, candidate.r).name === 'Water') continue;
            if (window.isVisibleToPlayer(candidate)) continue;
            spot = candidate;
        }
        if (!spot) continue;
        const wolf = window.createMonster('wolf', spot, null, null, 'enemy');
        wolf.aiState = 'idle';
        window.entities.push(wolf);
        spawned++;
    }
    if (spawned > 0) {
        window.showMessage('You sense something is out there...');
        window.drawMap();
        window.renderEntities();
    }
}
window.checkWildernessEncounter = checkWildernessEncounter;

// --- Companion attitude (BG3-style approval): a 0-100 meter per companion
// name, moved by tagged actions and shown to the player as a toast message
// every time it changes. Currently only Ser Aldric uses it, but the
// mechanism is generic. ---
window.companionAttitude = window.companionAttitude || {};

function adjustCompanionAttitude(name, delta, reason) {
    if (window.companionAttitude[name] === undefined) window.companionAttitude[name] = 50;
    window.companionAttitude[name] = Math.max(0, Math.min(100, window.companionAttitude[name] + delta));
    if (delta > 0) window.showMessage(`${name} approves. (${reason})`);
    else if (delta < 0) window.showMessage(`${name} disapproves. (${reason})`);
    if (window.companionAttitude[name] <= 0 && window.party.some(p => p.name === name)) {
        window.handleCompanionDeparture(name);
    }
}
window.adjustCompanionAttitude = adjustCompanionAttitude;

function handleCompanionDeparture(name) {
    window.party = window.party.filter(p => p.name !== name);
    window.entities = window.entities.filter(e => e.name !== name);
    window.showMessage(`${name} has left your party.`);
    if (window.updatePartyTabs) window.updatePartyTabs();
}
window.handleCompanionDeparture = handleCompanionDeparture;

// Very slow attitude decay while the goblin problem sits unresolved and
// Ser Aldric has already joined — "leaving due to inaction should be very
// slow," not a hard timer. Checked from worldTime.js's tick.
function tickCompanionPatience(deltaSeconds) {
    const name = window.campaign2Paladin?.name;
    if (!name || !window.party.some(p => p.name === name)) return;
    const quest = (window.questLog || []).find(q => q.id === 'goblin_threat');
    // Ceases entirely (not just slows) once the goblin problem has been
    // dealt with — including "dealt with but the conversation to formalize
    // it hasn't happened yet" (chiefAssassinated, pending Nix's succession
    // dialogue). This isn't a deficit that needs to be earned back with
    // other approval gains; it just stops.
    if (!quest || quest.resolution || quest.chiefAssassinated) return;
    const days = deltaSeconds / (24 * 3600);
    const before = window.companionAttitude[name] ?? 50;
    window.companionAttitude[name] = Math.max(0, before - 0.15 * days); // ~1 point per ~7 in-game days
    if (window.companionAttitude[name] <= 0 && before > 0) {
        window.handleCompanionDeparture(name);
        window.showMessage(`${name} has run out of patience and left to deal with the goblins alone.`);
    }
}
window.tickCompanionPatience = tickCompanionPatience;

// Converts the tied-up captive entity into a real party member — the
// physical rescue, available any time the player reaches him (independent
// of which resolution path, if any, is chosen for the tribe as a whole).
function rescuePaladin() {
    const name = window.campaign2Paladin.name;
    if (window.party.some(p => p.name === name)) return; // already rescued
    const captiveEnt = window.entities.find(e => e.name === name && e.tiedUp);
    if (!captiveEnt) return;

    const companion = window.createCharacterData('human', 'fighter', name, window.campaign2Paladin.gender, window.campaign2Paladin.voice);
    const clericBonus = window.classData.cleric.bonus; // fold in the cleric class-level too (fighter + cleric)
    for (const k in clericBonus) companion.attributes[k] = (companion.attributes[k] || 0) + clericBonus[k];

    ['health', 'sword_hit', 'sword_dmg', 'sword_parry', 'learn_heal'].forEach(skillKey => {
        const skill = window.skills[skillKey];
        if (!skill) return;
        if (companion.attributes[skill.tree] > 0) companion.attributes[skill.tree]--;
        else if (companion.attributes.wildcard > 0) companion.attributes.wildcard--;
        companion.skills[skillKey] = (companion.skills[skillKey] || 0) + 1;
    });
    if (companion.skills.health) {
        const bonus = 10 * companion.skills.health;
        companion.hp += bonus; companion.maxHp += bonus;
    }
    companion.inventory.push('wooden_shield');
    companion.equipped.offhand = 'wooden_shield';

    window.party.push(companion);
    const ent = new window.Entity(companion.name, 'red', captiveEnt.hex, (companion.attributes.agility || 10) + 10);
    ent.side = 'player';
    Object.assign(ent, companion);
    ent.hex = captiveEnt.hex;
    ent.visualQ = ent.hex.q; ent.visualR = ent.hex.r;
    ent.startQ = ent.hex.q; ent.startR = ent.hex.r;
    ent.destination = null; ent.moveCooldown = 0;

    window.entities = window.entities.filter(e => e !== captiveEnt);
    window.entities.push(ent);

    window.companionAttitude[name] = 60; // grateful, but still watching how this plays out
    if (window.updatePartyTabs) window.updatePartyTabs();
    window.showMessage(`${name} joins your party, freed at last.`);
    window.drawMap();
    window.renderEntities();
}
window.rescuePaladin = rescuePaladin;

// --- Goblin-reputation / diplomacy path: small favors for the chief raise
// goblin_tribe standing (and cost the kingdom's), building toward a peaceful
// departure once trust is high enough (see chief_skarnub's tree above). One
// tier is a deliberate point of no return — helping the goblins move
// against Hollowmere itself. ---
function offerGoblinFavor(npc) {
    const goblinRep = window.factions.goblin_tribe.standing;
    const options = [
        { label: "Scout the human village's patrols for you.", action: () => resolveGoblinFavor('scout') },
        { label: "\"Borrow\" supplies from the farm to the south.", action: () => resolveGoblinFavor('steal') },
        { label: "Help you raid the mining camp down the west road for its shinies.", action: () => resolveGoblinFavor('raid_mine') }
    ];
    if (goblinRep >= 25) {
        options.push({ label: "Help you take the fight to Hollowmere itself.", action: () => resolveGoblinFavor('raid') });
    }
    options.push({ label: "Actually, never mind.", action: () => {} });
    window.showDialogue(npc, "Plenty a human could do for us, if they've the stomach for it.", options);
}
window.offerGoblinFavor = offerGoblinFavor;

function resolveGoblinFavor(kind) {
    if (kind === 'scout') {
        window.adjustReputation(window.factions.goblin_tribe, 10, 10);
        window.adjustReputation(window.factions.silverhart_kingdom, -8, 10);
        if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', -4);
        if (window.gainExp) window.gainExp(40);
        if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, -8, "scouted your own people for the goblins");
        window.showMessage("You pass word of Hollowmere's patrol routes to the goblins.");
    } else if (kind === 'steal') {
        window.adjustReputation(window.factions.goblin_tribe, 8, 10);
        window.adjustReputation(window.factions.silverhart_kingdom, -5, 10);
        if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'prosperity', -5);
        if (window.gainExp) window.gainExp(30);
        if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, -5, "stole from decent folk to feed the goblins");
        window.showMessage("You raid Old Mac's stores and bring the goods back to the tribe.");
    } else if (kind === 'raid_mine') {
        // Emberlode is right down the road from the camp — an obvious, much
        // lower-stakes target than Hollowmere itself, but still a real
        // betrayal of the people who live there. Marked distinctly from
        // 'betrayal' (which is specifically the Hollowmere raid) so
        // Emberlode's own dialogue can react to it without implying the
        // player turned on the whole region.
        window.adjustReputation(window.factions.goblin_tribe, 15, 15);
        window.adjustReputation(window.factions.silverhart_kingdom, -15, 15);
        if (window.adjustRegionStat) {
            window.adjustRegionStat('emberlode', 'security', -20);
            window.adjustRegionStat('emberlode', 'prosperity', -25);
        }
        window.emberlodeRaided = true;
        if (window.party && window.party[0]) window.party[0].gold = (window.party[0].gold || 0) + 60;
        if (window.gainExp) window.gainExp(50);
        if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, -15, "helped goblins raid a mining camp for plunder");
        window.showMessage("You lead a raiding party down the west road. Emberlode's strongbox and ore stores are picked clean before anyone can raise the alarm. (+60 gold)");
    } else if (kind === 'raid') {
        // The point of no return: helping the goblins move against
        // Hollowmere itself. Severe on every axis.
        window.adjustReputation(window.factions.goblin_tribe, 30, 20);
        window.adjustReputation(window.factions.silverhart_kingdom, -60, 30);
        if (window.adjustRegionStat) {
            window.adjustRegionStat('hollowmere', 'security', -30);
            window.adjustRegionStat('hollowmere', 'prosperity', -30);
        }
        if (!window.questLog) window.questLog = [];
        let quest = window.questLog.find(q => q.id === 'goblin_threat');
        if (!quest) { quest = { id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' }; window.questLog.push(quest); }
        quest.status = 'completed';
        quest.resolution = 'betrayal';
        const paladinName = window.campaign2Paladin.name;
        window.companionAttitude[paladinName] = 0;
        if (window.party.some(p => p.name === paladinName)) {
            window.handleCompanionDeparture(paladinName);
            window.showMessage(`${paladinName} looks at you with open contempt. "Then you're no better than they are." He leaves, and does not look back.`);
        }
        window.showMessage('You lead the goblins toward Hollowmere. Whatever happens next, there is no going back from this.');
    }
    window.drawMap();
}
window.resolveGoblinFavor = resolveGoblinFavor;

// --- Assault resolution: watched from worldTime.js's tick rather than a
// specific attack call site, so it fires regardless of exactly how the
// chief died in open combat (spell, melee, ally kill, etc). ---
function checkGoblinAssaultResolution() {
    if (!window.questLog) return;
    const quest = window.questLog.find(q => q.id === 'goblin_threat');
    if (!quest || quest.resolution) return;
    const chief = window.entities.find(e => e.name === 'Chief Skarnub');
    if (!chief || chief.alive || chief.diedByAssassination) return; // assassination is handled by its own path

    quest.status = 'completed';
    quest.resolution = 'assault';
    window.adjustReputation(window.factions.silverhart_kingdom, 20, 20);
    window.adjustReputation(window.factions.goblin_tribe, -30, 20);
    if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 15);
    if (window.gainExp) window.gainExp(300);
    window.rescuePaladin();
    if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, 25, 'cleared the goblins out by force');
    window.showMessage('With Chief Skarnub fallen and the camp broken, the Skarn-tooth threat to Hollowmere is over. Quest complete: The Skarn-tooth Tribe.');
}
window.checkGoblinAssaultResolution = checkGoblinAssaultResolution;

// --- Stealth/assassination resolution: a stealthed player adjacent to the
// still-unaware chief can end the whole camp's leadership in one stroke
// (triggered from gameEngine.js's handleClick, ahead of normal talk/attack
// handling). Opens a peaceful succession instead of a fight, via Nix's
// dialogue tree above. ---
function handleChiefAssassination(chief) {
    chief.alive = false;
    chief.diedByAssassination = true;
    if (!window.questLog) window.questLog = [];
    let quest = window.questLog.find(q => q.id === 'goblin_threat');
    if (!quest) { quest = { id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' }; window.questLog.push(quest); }
    quest.chiefAssassinated = true;
    window.showMessage("A single silent strike, and Chief Skarnub falls without a sound. The camp doesn't yet know its chief is dead.");
    window.drawMap();
    window.renderEntities();
}
window.handleChiefAssassination = handleChiefAssassination;

function resolveGoblinSuccession() {
    const quest = window.questLog.find(q => q.id === 'goblin_threat');
    quest.status = 'completed';
    quest.resolution = 'stealth_succession';
    window.adjustReputation(window.factions.silverhart_kingdom, 15, 15);
    window.adjustReputation(window.factions.goblin_tribe, 5, 10); // a clean, low-blood transition earns modest goodwill even from the tribe
    if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 12);
    if (window.gainExp) window.gainExp(250);
    window.rescuePaladin();
    if (window.adjustCompanionAttitude) window.adjustCompanionAttitude(window.campaign2Paladin.name, 20, "found a way to remove the goblins without a massacre");
    window.showMessage("Under Nix's lead, the Skarn-tooth tribe breaks camp and leaves the area for good. Quest complete: The Skarn-tooth Tribe.");
    window.drawMap();
    window.renderEntities();
}
window.resolveGoblinSuccession = resolveGoblinSuccession;

// --- Ore Road Reopened: escorting Emberlode's first wagon home after the
// goblin_threat quest is resolved. A peaceful (diplomacy) resolution means
// the tribe is actually gone and the road really is clear; the other
// resolutions leave a few Skarn-tooth stragglers behind who didn't get the
// word — a small ambush partway back, same pattern as the farm's wolves
// (triggerFarmWolfEncounter). ---
function startEmberlodeEscort() {
    const quest = window.questLog && window.questLog.find(q => q.id === 'ore_road_reopened');
    if (!quest || quest.status !== 'active') return;
    quest.encounterState = 'departed';
    window.showMessage("The wagon creaks into motion, wheels finding the ruts of the old road east.");

    const goblinQuest = window.questLog.find(q => q.id === 'goblin_threat');
    const peaceful = goblinQuest && goblinQuest.resolution === 'goblin_diplomacy';
    if (peaceful) {
        completeEmberlodeEscort();
        return;
    }

    const ambushHex = window.campaign2EmberlodeAmbushHex;
    [{ q: ambushHex.q - 1, r: ambushHex.r - 1 }, { q: ambushHex.q + 1, r: ambushHex.r }].forEach(hex => {
        const goblin = window.createMonster('goblin', hex, null, null, 'enemy');
        goblin.emberlodeAmbushGoblin = true;
        window.entities.push(goblin);
        window.wakeUp(goblin);
    });
    window.showMessage("Skarn-tooth stragglers burst from the brush — the tribe's gone, but not everyone got the message!");
    window.drawMap();
    window.renderEntities();
}
window.startEmberlodeEscort = startEmberlodeEscort;

function completeEmberlodeEscort() {
    const quest = window.questLog && window.questLog.find(q => q.id === 'ore_road_reopened');
    if (!quest || quest.status === 'completed') return;
    quest.status = 'completed';
    if (window.gainExp) window.gainExp(60);
    if (window.party && window.party[0]) window.party[0].gold = (window.party[0].gold || 0) + 40;
    if (window.cascadeRegionStat) window.cascadeRegionStat('hollowmere', 'prosperity', 8);
    if (window.adjustRegionStat) window.adjustRegionStat('emberlode', 'prosperity', 15);
    window.showMessage("The wagon rolls safely into Hollowmere — Emberlode's ore is moving again. (+40 gold, quest complete: Ore Road Reopened)");
}
window.completeEmberlodeEscort = completeEmberlodeEscort;

// Watched from worldTime.js's tick, same pattern as checkGoblinAssaultResolution.
function checkEmberlodeEscortResolution() {
    if (!window.questLog) return;
    const quest = window.questLog.find(q => q.id === 'ore_road_reopened');
    if (!quest || quest.status !== 'active' || quest.encounterState !== 'departed') return;
    const ambushGoblinsAlive = window.entities.some(e => e.emberlodeAmbushGoblin && e.alive);
    if (!ambushGoblinsAlive) completeEmberlodeEscort();
}
window.checkEmberlodeEscortResolution = checkEmberlodeEscortResolution;

window.startHollowmereShakedown = startHollowmereShakedown;
window.resolveShakedown = resolveShakedown;
window.parleyWithEnemy = parleyWithEnemy;
window.triggerHollowmereQuestOffer = triggerHollowmereQuestOffer;
window.startOskarDuel = startOskarDuel;
window.endOskarDuel = endOskarDuel;
