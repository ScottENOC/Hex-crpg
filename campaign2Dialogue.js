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
    }
};

function startHollowmereShakedown() {
    if (window.hollowmereEventFired) return;
    window.hollowmereEventFired = true;

    const dray = window.entities.find(e => e.name === 'Dray Coltayne');
    const enforcers = window.entities.filter(e => e.factionId === 'ironbond_company' && e !== dray);
    const garrick = window.entities.find(e => e.name === 'Garrick Holt');

    // Walk the soldiers in from outside the door to just inside the tavern.
    [dray, ...enforcers].forEach((e, i) => {
        if (!e) return;
        e.pendingEntry = false;
        e.hex = { q: -1 + i, r: -3 };
        e.visualQ = e.hex.q; e.visualR = e.hex.r;
        e.startQ = e.hex.q; e.startR = e.hex.r;
    });
    window.drawMap();
    window.renderEntities();

    window.triggerAmbientDialogue('hollowmere_soldiers_enter');
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_dray_demand'), 2500);
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_garrick_protest'), 5000);
    setTimeout(() => window.triggerAmbientDialogue('hollowmere_dray_threat'), 7500);

    setTimeout(() => {
        window.showDialogue(dray || garrick, "What do you do?", [
            { label: "Stay out of it.", action: () => window.resolveShakedown('stay_out') },
            { label: "Tell Garrick to pay — and back it with a threat.", action: () => window.resolveShakedown('encourage_pay') },
            { label: "Side with Garrick. Fight them.", action: () => window.resolveShakedown('fight') }
        ]);
    }, 10000);
}

function resolveShakedown(branch) {
    const garrick = window.entities.find(e => e.name === 'Garrick Holt');
    const mira = window.entities.find(e => e.name === 'Mira Ashbrook');
    const oskar = window.entities.find(e => e.name === 'Oskar Vinn');
    const dray = window.entities.find(e => e.name === 'Dray Coltayne');
    const enforcers = window.entities.filter(e => e.factionId === 'ironbond_company' && e !== dray);
    const ironbond = window.factions.ironbond_company;
    const silverhart = window.factions.silverhart_kingdom;

    const patrons = [mira, oskar].filter(Boolean);

    if (branch === 'stay_out') {
        window.adjustReputation(garrick?.reputation, -10, 10);
        patrons.forEach(p => window.adjustReputation(p.reputation, -5, 5));
        window.adjustReputation(ironbond, 5, 5);
        window.showMessage("Garrick pays up, shoulders slumped. The soldiers leave with their due.");
    } else if (branch === 'encourage_pay') {
        window.adjustReputation(garrick?.reputation, 5, 15);
        patrons.forEach(p => window.adjustReputation(p.reputation, 0, 10));
        window.adjustReputation(ironbond, 15, 15);
        window.showMessage("You back the demand with a hard stare. The soldiers take their due and leave without further trouble.");
    } else if (branch === 'fight') {
        window.adjustReputation(garrick?.reputation, 25, 20);
        patrons.forEach(p => window.adjustReputation(p.reputation, 20, 20));
        window.adjustReputation(ironbond, -35, 25);
        window.adjustReputation(silverhart, 10, 10);
        window.showMessage("Steel rings out! Garrick grabs his club — this is happening.");

        [garrick, ...patrons].forEach(p => { if (p) p.side = 'player'; });
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

window.startHollowmereShakedown = startHollowmereShakedown;
window.resolveShakedown = resolveShakedown;
