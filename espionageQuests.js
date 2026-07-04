// espionageQuests.js
// Generic "stealth infiltration" tracker used by Reddale's Merchants Guild
// vs Baron side-quests (see campaign2Dialogue.js's reddale_baron /
// reddale_guildmaster trees, and buildReddale in campaign2World.js for the
// guildhouse/manor + guard placement). Deliberately built as ONE reusable
// mission shape rather than two bespoke systems, since both quests are the
// same "sneak in, find evidence, don't get seen" pattern mirrored on
// opposite factions.
//
// Detection reuses the exact same canSee() the rest of the game already
// uses for stealth (gameEngine.js) — canSee returns true immediately (no
// roll at all) if the player isn't currently isStealthed, and only rolls
// against stealthScore if they are. So "stay stealthed or get caught" falls
// out of the existing system for free; this file only needs to ask canSee
// the question once per tick and act on the answer.

// { questId, guardName, evidenceKey, itemId, evidenceFlavor,
//   factionSpiedOn, failStandingHit, objectiveText }
window.activeStealthMission = null;

function startStealthMission(config) {
    window.activeStealthMission = config;
    window.showMessage(`(New objective: ${config.objectiveText})`);
}
window.startStealthMission = startStealthMission;

function failStealthMission(reason) {
    const mission = window.activeStealthMission;
    if (!mission) return;
    window.activeStealthMission = null;

    const quest = (window.questLog || []).find(q => q.id === mission.questId);
    if (quest) quest.status = 'failed';

    const faction = window.factions?.[mission.factionSpiedOn];
    if (faction && window.adjustReputation) window.adjustReputation(faction, mission.failStandingHit ?? -20, 15);

    const text = `Caught! ${reason} The mission is blown.`;
    window.showMessage(text);
    if (window.broadcastGameMessage) window.broadcastGameMessage(text);
}
window.failStealthMission = failStealthMission;

// Called each real-time tick (see worldTime.js) while a mission is active.
// Only checks the one guard tied to the current mission — deliberately not
// a general "any nearby neutral NPC" alarm, so the espionage tension stays
// specific to the building being infiltrated.
function checkStealthMissionStatus() {
    const mission = window.activeStealthMission;
    if (!mission || !window.entities) return;

    const guard = window.entities.find(e => e.name === mission.guardName && e.alive);
    const player = (window.party && window.party[0] && window.entities.find(e => e.name === window.party[0].name && e.side === 'player')) ||
        window.entities.find(e => e.side === 'player' && !e.rider);
    if (!guard || !player) return;

    if (window.canSee(guard, player)) {
        failStealthMission(`${guard.name} spotted you.`);
    }
}
window.checkStealthMissionStatus = checkStealthMissionStatus;

// Clicking the evidence tileObject (see gameEngine.js's handleClick
// 'evidence' dispatch). Only resolves the mission if its evidenceKey
// matches whichever mission is currently active — walking up to the wrong
// building's documents (or with no mission running at all) just gives
// flavor text, not a free item.
function searchEvidence(q, r) {
    const key = `${q},${r}`;
    const obj = window.tileObjects[key];
    if (!obj) return;

    const mission = window.activeStealthMission;
    if (!mission || obj.evidenceKey !== mission.evidenceKey) {
        window.showMessage("There's nothing here worth the risk.");
        return;
    }
    if (obj.taken) {
        window.showMessage("Already searched — nothing left to find.");
        return;
    }

    obj.taken = true;
    window.player.inventory.push(mission.itemId);
    window.activeStealthMission = null;
    window.showMessage(`You find ${mission.evidenceFlavor} and pocket it. Time to get out before anyone notices.`);
}
window.searchEvidence = searchEvidence;
