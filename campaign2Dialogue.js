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
            { label: "Good to know.", action: () => {} }
        ]);
    },
    oskar_vinn: (npc) => {
        window.showDialogue(npc, "First time in Hollowmere? Mind the Ironbond lot if they're about.", [
            { label: "Noted.", action: () => {} }
        ]);
    },
    marta_wynfield: (npc) => {
        if (!window.hollowmereEventFired) {
            window.showDialogue(npc, "Welcome, traveler. Hollowmere's a small place, but an honest one.", [
                { label: "Good to know.", action: () => {} }
            ]);
            return;
        }
        const standing = npc.reputation?.standing ?? 0;
        let line;
        if (standing >= 15) line = "Word of what you did at the Tankard reached me. Hollowmere doesn't forget a favor like that.";
        else if (standing <= -5) line = "I heard about the Tankard. Garrick's a proud man — I imagine that stung him more than you know.";
        else line = "I heard the Ironbond men were in the village again. Nothing's changed there, I'm afraid.";
        window.showDialogue(npc, line, [
            { label: "Noted.", action: () => {} }
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

    if (branch === 'stay_out') {
        window.cascadeReputation(authorityChain, -10, 10);
        patrons.forEach(p => window.adjustReputation(p.reputation, -5, 5));
        window.adjustReputation(ironbond, 5, 5);
        window.showMessage("Garrick pays up, shoulders slumped. The soldiers leave with their due.");
        exitSoldiersPeacefully(dray, enforcers);
    } else if (branch === 'encourage_pay') {
        window.cascadeReputation(authorityChain, 5, 15);
        patrons.forEach(p => window.adjustReputation(p.reputation, 0, 10));
        window.adjustReputation(ironbond, 15, 15);
        window.showMessage("You back the demand with a hard stare. The soldiers take their due and leave without further trouble.");
        exitSoldiersPeacefully(dray, enforcers);
    } else if (branch === 'fight') {
        window.cascadeReputation(authorityChain, 25, 20);
        patrons.forEach(p => window.adjustReputation(p.reputation, 20, 20));
        window.adjustReputation(ironbond, -35, 25);
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

window.startHollowmereShakedown = startHollowmereShakedown;
window.resolveShakedown = resolveShakedown;
window.parleyWithEnemy = parleyWithEnemy;
window.triggerHollowmereQuestOffer = triggerHollowmereQuestOffer;
