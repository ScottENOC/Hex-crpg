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

    // A bribed guard (see the steward's `wants`/onBribeSuccess in
    // buildReddale, campaign2World.js) has already agreed to look the other
    // way — no detection check at all for this specific mission.
    if (guard.bribed) return;

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

// --- The Merchants Guild's retaliation: once the player has actually
// burned the Guild badly enough (completed spy_on_guild AND its standing
// has cratered), the Guild hires someone to deal with the problem directly.
// Deliberately a real-time tail, not an instant ambush: the assassin
// approaches stealthed and follows a lagged copy of the player's own
// breadcrumb trail (entity.stalkTargetHex, moved each turn by the
// 'stalk' behaviorType in gameEngine.js) rather than beelining at them, and
// only reveals itself (breaks stealth, turns hostile, opens with its bow)
// once the player is weak and in range — see checkGuildAssassinTail below.
window.guildAssassinTriggered = false;
window.playerTrailHistory = window.playerTrailHistory || [];
window._trailAccumSeconds = 0;

function checkGuildAssassinTrigger() {
    if (window.guildAssassinTriggered) return;
    const quest = (window.questLog || []).find(q => q.id === 'spy_on_guild');
    const guildStanding = window.factions?.merchants_guild?.standing ?? 0;
    if (!quest || quest.status !== 'completed' || guildStanding > -10) return;
    if (!window.campaign2GuildAssassin || !window.buildNPC) return;

    const player = window.entities.find(e => e.side === 'player' && !e.rider);
    if (!player) return;

    window.guildAssassinTriggered = true;
    const spawnHex = { q: player.hex.q + 10, r: player.hex.r - 4 };
    const assassin = window.buildNPC({ ...window.campaign2GuildAssassin, hex: spawnHex });
    assassin.isStealthed = true;
    assassin.stealthScore = 65;
    assassin.behaviorType = 'stalk';
    assassin.stalkTargetHex = { ...player.hex };
    assassin.homeHex = { ...spawnHex };
    window.entities.push(assassin);

    window.showMessage("Somewhere behind you, the Guild has decided you're a problem worth solving permanently.");
}
window.checkGuildAssassinTrigger = checkGuildAssassinTrigger;

function checkGuildAssassinTail(delta) {
    if (!window.guildAssassinTriggered) return;
    const assassin = window.entities.find(e => e.name === 'Guild Assassin' && e.alive);
    if (!assassin || assassin.side === 'enemy') return; // already revealed — normal combat AI takes over from here
    const player = (window.party && window.party[0] && window.entities.find(e => e.name === window.party[0].name && e.side === 'player')) ||
        window.entities.find(e => e.side === 'player' && !e.rider);
    if (!player) return;

    // Breadcrumb trail (~every 2s of real time) driving the lagged pursuit.
    window._trailAccumSeconds += (delta || 0);
    if (window._trailAccumSeconds >= 2) {
        window._trailAccumSeconds = 0;
        window.playerTrailHistory.push({ q: player.hex.q, r: player.hex.r });
        if (window.playerTrailHistory.length > 40) window.playerTrailHistory.shift();
    }
    const LAG = 6;
    assassin.stalkTargetHex = window.playerTrailHistory[Math.max(0, window.playerTrailHistory.length - 1 - LAG)] || assassin.stalkTargetHex;

    // Contested stealth check, reusing canSee() exactly as-is (no new roll)
    // — but backtracking toward a stretch you've already walked closes the
    // gap on whoever's been trailing you down that same stretch, so it
    // temporarily knocks down the assassin's effective stealth score for
    // this check only.
    let backtracking = false;
    if (window.playerTrailHistory.length > 8) {
        const older = window.playerTrailHistory[window.playerTrailHistory.length - 8];
        backtracking = window.distance(player.hex, older) <= 2;
    }
    const savedScore = assassin.stealthScore;
    if (backtracking) assassin.stealthScore = Math.max(5, savedScore - 25);
    const spotted = window.canSee(player, assassin);
    assassin.stealthScore = savedScore;

    if (spotted && !assassin._revealedOnce) {
        assassin._revealedOnce = true; // flavor only, rate-limited — doesn't break the tail
        window.showMessage("You catch movement at the edge of your vision — gone before you can place it. Someone's following you.");
    }

    // Ambush: reveals once the player looks weak and the assassin has a
    // clear shot — long bow range, so this doesn't require closing to melee.
    const weak = player.hp <= player.maxHp * 0.5;
    const dist = window.distance(assassin.hex, player.hex);
    if (weak && dist <= 15 && window.hasLineOfSight(assassin.hex, player.hex)) {
        assassin.side = 'enemy';
        assassin.isStealthed = false;
        assassin.behaviorType = 'wander';
        if (window.wakeUp) window.wakeUp(assassin);
        const text = "A figure steps from the shadows, bow already drawn — the Guild sent someone after all!";
        window.showMessage(text);
        if (window.broadcastGameMessage) window.broadcastGameMessage(text);
    }
}
window.checkGuildAssassinTail = checkGuildAssassinTail;
