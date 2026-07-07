// gameEngine.js

window.gamePhase = 'WAITING'; // WAITING, PLAYER_TURN, AI_TURN
window.isPausedForReaction = false;

// Ore-vein tint per resource type — flavor only (see the design notes in
// resources.js), reusing the same hue-tint system as recolored monster
// sprites. Iron is left untinted (the vein art's own neutral tan/brown
// already reads as "common ore").
const ORE_HUES = { ore_silver: 220, ore_gold: 48, gem_red: 0, gem_blue: 210, gem_green: 130 };

// Shared base monster pool for both the arena's actual encounter roll
// (startArenaFight) and the lobby's "waiting combatants" preview
// (setupArenaLobby) — kept as one array so the lobby can genuinely draw
// from the same pool the next fight will, rather than a separate
// hand-picked flavor list that could never match.
const ARENA_MONSTER_POOL = ['goblin', 'orc', 'skeleton', 'zombie', 'imp', 'spider', 'troll',
    'wraith', 'basilisk', 'harpy', 'minotaur', 'revenant', 'wolf_rider_goblin', 'elite_goblin',
    'wolf', 'boar', 'tiger'];
const ARENA_BEAST_TYPES = ['wolf', 'boar', 'tiger', 'dragon_young', 'dragon_adult', 'dragon_ancient'];

// One-line flavor for the lobby's dialogue-only "waiting combatant" and
// caged-beast NPCs — talkToNPC falls back to these when the entity has no
// dialogueId of its own (see the arenaFlavorLine field set in
// setupArenaLobby).
const ARENA_FLAVOR_LINES = {
    goblin: "The goblin eyes your gear, chained wrists rattling. \"Next match... maybe you. Maybe not.\"",
    orc: "The orc says nothing, just cracks its knuckles and watches the door to the pit.",
    skeleton: "The skeleton's jaw clatters — whether that's a threat or a greeting, hard to say.",
    zombie: "It groans low and doesn't seem to notice you're there at all.",
    imp: "The imp cackles. \"Ooh, fresh meat! Well — fresh-ish. Good luck out there!\"",
    spider: "Too many eyes track your every step. It doesn't move otherwise.",
    troll: "The troll is asleep, or pretending to be. Either way, best not to find out.",
    wraith: "Cold radiates off it even from here. It doesn't seem to breathe.",
    basilisk: "It's hooded, thankfully. You are not eager to see what's underneath.",
    harpy: "It preens, entirely uninterested in you until the horn sounds.",
    minotaur: "The minotaur snorts and paces its chain's short radius, again and again.",
    revenant: "\"Already died once,\" it rasps. \"Doesn't sting the same the second time.\"",
    wolf_rider_goblin: "The goblin checks its wolf's tack for the third time this hour.",
    elite_goblin: "This one's armor is a cut above the others'. It knows it, too.",
    wolf: "The wolf paces the fence line, watching you the whole way across.",
    boar: "It grunts and paws at the dirt but the fence holds.",
    tiger: "Its tail flicks. It has clearly done this before.",
    dragon_young: "Even young, it fills the pen. Best not get close to the bars.",
    dragon_adult: "The whole enclosure smells of ash. You give it a wide berth.",
    dragon_ancient: "It barely fits. It barely seems to care that you're here at all."
};

// Broadcast a message to all connected clients. On non-host or single-player
// this is identical to showMessage. On host in multiplayer the text is also
// emitted so every instance sees the same combat/narrative log.
// Cheap flicker for fire tiles (fireplace, held torch) — no new art needed,
// just a per-instance jittered scale/alpha driven off a fast sine so every
// fire flickers independently (phase offset by its own hex/entity key)
// instead of all pulsing in lockstep.
// Grants a skill rank directly, bypassing the normal attribute-pool spend.
// This is the only way lich-tree ranks are ever obtained (quest rewards call
// this, never learnSkill) — it's also what makes the tree visible at all,
// since ui.js's skill screen only lists a tree once the player already holds
// a rank in one of its skills or unspent points in it (lich never gets
// either through the normal level-up/wildcard flow).
function grantSkillRank(player, skillKey) {
    const skill = window.skills[skillKey];
    if (!skill) return;
    const current = player.skills[skillKey] || 0;
    if (skill.maxRanks > 0 && current >= skill.maxRanks) return;
    player.skills[skillKey] = current + 1;
    if (skill.apply) skill.apply(player);
    const playerEntity = window.entities.find(e => e.name === player.name);
    if (playerEntity) Object.assign(playerEntity, {
        baseReduction: player.baseReduction, lifeDrainOnMeleeHit: player.lifeDrainOnMeleeHit,
        witheringTouchStacks: player.witheringTouchStacks, commandsUndead: player.commandsUndead,
        hasSoulAnchor: player.hasSoulAnchor
    });
    if (window.showCharacter) window.showCharacter();
}
window.grantSkillRank = grantSkillRank;

function fireFlicker(seedKey) {
    let hash = 0;
    for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) | 0;
    const phase = (hash % 1000) / 1000 * Math.PI * 2;
    const t = performance.now() / 1000;
    const flicker = Math.sin(t * 9 + phase) * 0.5 + Math.sin(t * 21 + phase * 2) * 0.5;
    return { scale: 1 + flicker * 0.06, alpha: 0.88 + flicker * 0.12 };
}

function sharedMessage(text) {
    window.showMessage(text);
    if (window.broadcastGameMessage) window.broadcastGameMessage(text);
}

function getEntityAtHex(q, r) {
    return window.entities.find(e => e.alive && e.getAllHexes().some(h => h.q === q && h.r === r));
}

// Alternate door actions (attack/lock) — surfaced by right-click, a
// touch long-press, or a gamepad hold-A (see controller.js), since the
// default tap/click/A on a door just opens/closes it.
function openDoorContextMenu(q, r) {
    const key = `${q},${r}`;
    const door = window.tileObjects[key];
    if (!door || (door.type !== 'door_open' && door.type !== 'door_closed')) return;
    const player = window.currentTurnEntity || window.player;
    if (!player || window.distance(player.hex, { q, r }) > 1) return;

    const existing = document.getElementById('door-context-menu');
    if (existing) existing.remove();

    const { x, y } = window.hexToPixel(q, r);
    const menu = document.createElement('div');
    menu.id = 'door-context-menu';
    menu.style.cssText = `position:fixed; left:${x}px; top:${y}px; transform:translate(-50%,-100%); z-index:99998;`
        + 'background:rgba(20,20,20,0.95); border:2px solid #ffd700; border-radius:6px; padding:6px; display:flex; flex-direction:column; gap:4px;';

    const attackBtn = document.createElement('button');
    attackBtn.innerText = `Attack Door (${Math.max(0, door.hp ?? 20)}/${door.maxHp ?? 20} HP)`;
    attackBtn.onclick = () => { window.attackDoor(q, r, player); menu.remove(); };
    menu.appendChild(attackBtn);

    if (door.type === 'door_closed' && !door.broken) {
        const lockBtn = document.createElement('button');
        lockBtn.innerText = door.locked ? 'Unlock Door' : 'Lock Door';
        lockBtn.onclick = () => { window.lockDoor(q, r, player); menu.remove(); };
        menu.appendChild(lockBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel';
    cancelBtn.onclick = () => menu.remove();
    menu.appendChild(cancelBtn);

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(ev) {
            if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
        });
    }, 0);
}
window.openDoorContextMenu = openDoorContextMenu;

// Assigns each real party member/mount a destination offset from the
// leader's clicked hex per the current formation. A follower's relative
// offset (esp. "close" formation, which just preserves whatever gap they
// already had) can land inside a wall/building the leader is hugging — an
// unreachable destination used to just silently halt the follower right next
// to it (processRealTimeStep's findPath returns null with no feedback),
// reading as "stuck at the wall." Snap to the nearest actually-passable hex
// instead so they path around it like the A* search already intends.
function assignFollowerDestination(f, leader, clickedHex) {
    const offset = f === leader ? { q: 0, r: 0 } : window.getFormationOffset(f, leader);
    const raw = { q: clickedHex.q + offset.q, r: clickedHex.r + offset.r };
    const terrain = window.getTerrainAt(raw.q, raw.r);
    const blocked = terrain.name === 'Wall' || terrain.name === 'Water' || window.getEntityAtHex(raw.q, raw.r);
    f.destination = blocked ? findNearestPassableHex(raw) : raw;
}

// A ladder crossing is one hex wide — if the whole party set off across it in
// lockstep, followers would start climbing the wall right alongside the
// leader instead of queuing behind them. If the leader's own path crosses a
// ladder hex, hold followers back (they keep their current position) until
// the leader has actually climbed across it, then release them to follow.
function assignGroupMoveDestinations(leader, clickedHex) {
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider && !e.aiControlled);
    assignFollowerDestination(leader, leader, clickedHex);

    const path = (window.leaderPath || []).map(k => { const [q, r] = k.split(',').map(Number); return { q, r }; });
    const ladderHex = path.find(h => {
        const t = window.getTerrainAt(h.q, h.r);
        const obj = window.tileObjects && window.tileObjects[`${h.q},${h.r}`];
        return t.name === 'Palisade Wall' && obj && obj.type === 'ladder';
    });
    const followers = friendlies.filter(f => f !== leader);

    if (!ladderHex) {
        followers.forEach(f => assignFollowerDestination(f, leader, clickedHex));
        return;
    }

    let leaderReachedLadder = false;
    let ticks = 0;
    const waitForLeader = setInterval(() => {
        ticks++;
        if (leader.hex.q === ladderHex.q && leader.hex.r === ladderHex.r) leaderReachedLadder = true;
        const leaderCrossed = leaderReachedLadder && (leader.hex.q !== ladderHex.q || leader.hex.r !== ladderHex.r);
        const leaderGaveUp = !leader.destination; // reached destination, or path got blocked
        if (leaderCrossed || leaderGaveUp || ticks > 200) { // ~50s safety cap
            clearInterval(waitForLeader);
            followers.forEach(f => assignFollowerDestination(f, leader, clickedHex));
        }
    }, 250);
}
window.assignGroupMoveDestinations = assignGroupMoveDestinations;

function findNearestPassableHex(startHex) {
    // Breadth-first search for the nearest hex that is NOT water, NOT a wall, and NOT occupied
    const queue = [startHex];
    const visited = new Set([`${startHex.q},${startHex.r}`]);
    
    // Safety limit to prevent infinite loops
    let iterations = 0;
    while (queue.length > 0 && iterations < 200) {
        iterations++;
        const current = queue.shift();
        const terrain = window.getTerrainAt(current.q, current.r);
        const occupant = getEntityAtHex(current.q, current.r);
        
        // Passable = Not Wall, Not Water, Not occupied (unless occupant is ourselves)
        const isPassable = terrain.name !== 'Wall' && terrain.name !== 'Water';
        if (isPassable && !occupant) {
            return current;
        }
        
        // Add neighbors to queue
        const neighbors = window.getNeighbors(current.q, current.r);
        for (const n of neighbors) {
            const key = `${n.q},${n.r}`;
            if (!visited.has(key)) {
                visited.add(key);
                queue.push(n);
            }
        }
    }
    return startHex; // Fallback
}

function getMinDistance(entA, entB) {
    const hexesA = entA.getAllHexes();
    const hexesB = entB.getAllHexes();
    let minD = Infinity;
    hexesA.forEach(ha => {
        hexesB.forEach(hb => {
            const d = window.distance(ha, hb);
            if (d < minD) minD = d;
        });
    });
    return minD;
}

// AURA ITEMS: equipment like the Orcbane Pendant (equipment.js) carries an
// auraTag/auraRadius instead of a numeric bonus — it just warns the wearer
// when a matching enemy is nearby (tag matched against the monster's tags[]
// array or, for named threats like "orc"/"wolf"/"goblin" that aren't a tag
// of their own, a case-insensitive substring match on entity.name).
function checkEquipmentAuras() {
    const party = window.entities?.filter(e => e.alive && e.side === 'player') || [];
    const enemies = window.entities?.filter(e => e.alive && e.side === 'enemy') || [];
    if (!party.length || !enemies.length) return;

    party.forEach(p => {
        const slots = [p.equipped?.weapon, p.equipped?.offhand, p.equipped?.armor, p.equipped?.helmet, p.equipped?.accessory];
        slots.forEach(slotId => {
            const item = slotId && window.items[slotId];
            if (!item || !item.auraTag) return;
            const tag = item.auraTag.toLowerCase();
            const radius = item.auraRadius || 5;
            const nearby = enemies.some(e => {
                const matches = (e.tags && e.tags.includes(tag)) || (e.name && e.name.toLowerCase().includes(tag));
                return matches && window.distance(p.hex, e.hex) <= radius;
            });
            if (nearby && !p._auraActive?.[slotId]) {
                p._auraActive = p._auraActive || {};
                p._auraActive[slotId] = true;
                window.showMessage(`${item.name} ${item.description || 'reacts to something nearby.'}`);
            } else if (!nearby && p._auraActive?.[slotId]) {
                p._auraActive[slotId] = false;
            }
        });
    });
}
window.checkEquipmentAuras = checkEquipmentAuras;

// FATIGUE & RESTING: buildings use an indoor floor terrain override (Wood
// Floor/Cave Floor) instead of outdoor Grass/Path, which doubles as a cheap
// "am I inside a building" check without needing separate room-bounds data.
function isPlayerIndoors() {
    if (!window.player) return false;
    const t = window.getTerrainAt(window.player.hex.q, window.player.hex.r).name;
    return t === 'Wood Floor' || t === 'Cave Floor';
}
window.isPlayerIndoors = isPlayerIndoors;

// A building "occupied" if any non-party NPC is standing on the same indoor
// floor nearby — approximate since buildings don't track their own bounds.
function isBuildingOccupied() {
    if (!window.player) return false;
    // The roguelike arena lobby is Cave Floor dotted with the shopkeeper/
    // announcer NPCs — it's meant to be a safe hub, not a house someone
    // lives in, so it never counts as occupied.
    if (window.currentCampaign === "1" && !window.isInArena) return false;
    const t = window.getTerrainAt(window.player.hex.q, window.player.hex.r).name;
    return window.entities.some(e => e.alive && e.isNPC && e.side !== 'player'
        && window.getTerrainAt(e.hex.q, e.hex.r).name === t
        && window.distance(window.player.hex, e.hex) <= 10);
}
window.isBuildingOccupied = isBuildingOccupied;

// Lower Hollowmere security -> higher chance of being caught resting rough
// in the wilderness, same security stat checkWildernessEncounter already
// uses (campaign2Dialogue.js).
function getWildernessAmbushChance() {
    const security = window.regions?.hollowmere?.security ?? 50;
    let chance = Math.max(0.05, Math.min(0.45, 0.45 - security / 120));
    // Well Fed (see resources.js's eatFood): a mundane, non-healing benefit
    // from gathered food, same idea as the Survival skill's own reduction.
    if (window.isWellFed && window.isWellFed(window.player)) chance *= 0.7;
    const survivalRank = window.player?.skills?.survival || 0;
    if (survivalRank > 0) chance *= Math.max(0.4, 1 - survivalRank * 0.2);
    return chance;
}
window.getWildernessAmbushChance = getWildernessAmbushChance;

// Interrupts a rest with an attack: caught without armor on (see the
// caughtOffGuard check in resolveAttack's damage-reduction calc) and having
// to spend 5 TP just getting back on your feet before acting.
function triggerRestAmbush(kind) {
    window.isResting = false;
    if (window.updateRestButton) window.updateRestButton();

    const sentientAllies = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider);
    sentientAllies.forEach(e => {
        e.caughtOffGuard = true;
        e.timePoints = Math.max(0, (e.timePoints || 0) - 5);
    });

    const player = window.player;
    let spawned = 0;
    const count = 1 + Math.floor(Math.random() * 2);
    for (let n = 0; n < count; n++) {
        let spot = null;
        for (let attempt = 0; attempt < 10 && !spot; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2 + Math.floor(Math.random() * 2);
            const candidate = window.hexRound(
                player.hex.q + Math.round(Math.cos(angle) * dist),
                player.hex.r + Math.round(Math.sin(angle) * dist)
            );
            if (window.getEntityAtHex(candidate.q, candidate.r)) continue;
            if (window.getTerrainAt(candidate.q, candidate.r).name === 'Wall') continue;
            if (window.getTerrainAt(candidate.q, candidate.r).name === 'Water') continue;
            spot = candidate;
        }
        if (!spot) continue;
        const monster = window.createMonster(kind === 'door' ? 'goblin' : 'wolf', spot, null, null, 'enemy');
        monster.aiState = 'combat'; // ambush — attacks immediately, not a wandering idle encounter
        monster.isRandomEncounter = true; // eligible for corpse pruning once dead and far away — see pruneDistantEncounterCorpses
        window.entities.push(monster);
        spawned++;
    }

    window.showMessage(kind === 'door'
        ? "Someone's trying to break the door down! You scramble up, caught without your armor on."
        : "You're jolted awake — something's found you in the wilderness, and you never got your armor back on.");
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    if (window.updateTurnIndicator) window.updateTurnIndicator();
    return spawned;
}
window.triggerRestAmbush = triggerRestAmbush;

// Same idea as triggerRestAmbush, but for sleep: whoever's on watch
// (see toggleSleep's guard pick for 3+ party members) keeps their armor
// and doesn't need to spend TP standing up, since they were never asleep.
// Sleep itself doesn't cancel — combat plays out, then _resumeSleepAfterCombat
// (checked in checkCombatEnd) puts everyone back to sleep afterward.
function triggerSleepAmbush(kind) {
    window.isSleeping = false;
    window._resumeSleepAfterCombat = true;
    if (window.updateSleepButton) window.updateSleepButton();

    const sentientAllies = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider);
    sentientAllies.forEach(e => {
        if (e.onGuard) return;
        e.caughtOffGuard = true;
        e.timePoints = Math.max(0, (e.timePoints || 0) - 5);
    });

    const player = window.player;
    let spawned = 0;
    const count = 1 + Math.floor(Math.random() * 2);
    for (let n = 0; n < count; n++) {
        let spot = null;
        for (let attempt = 0; attempt < 10 && !spot; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 2 + Math.floor(Math.random() * 2);
            const candidate = window.hexRound(
                player.hex.q + Math.round(Math.cos(angle) * dist),
                player.hex.r + Math.round(Math.sin(angle) * dist)
            );
            if (window.getEntityAtHex(candidate.q, candidate.r)) continue;
            if (window.getTerrainAt(candidate.q, candidate.r).name === 'Wall') continue;
            if (window.getTerrainAt(candidate.q, candidate.r).name === 'Water') continue;
            spot = candidate;
        }
        if (!spot) continue;
        const monster = window.createMonster(kind === 'door' ? 'goblin' : 'wolf', spot, null, null, 'enemy');
        monster.aiState = 'combat'; // ambush — attacks immediately, not a wandering idle encounter
        monster.isRandomEncounter = true; // eligible for corpse pruning once dead and far away — see pruneDistantEncounterCorpses
        window.entities.push(monster);
        spawned++;
    }

    const guard = sentientAllies.find(e => e.onGuard);
    window.showMessage(guard
        ? `${guard.name} spots movement and shouts a warning — the others scramble up without their armor on!`
        : (kind === 'door'
            ? "Someone's trying to break the door down! You scramble up, caught without your armor on."
            : "You're jolted awake — something's found your camp, and no one had armor on."));
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    if (window.updateTurnIndicator) window.updateTurnIndicator();
    return spawned;
}
window.triggerSleepAmbush = triggerSleepAmbush;

// DAILY NPC SCHEDULES: a few named Hollowmere NPCs walk between a home and
// their usual daytime spot instead of standing in the tavern forever. Each
// entry is a list of {start, end, hex} blocks in fractional hours (see
// getCurrentHour, worldTime.js); the last matching block wins. Reuses the
// same window.entities[i].destination the player's own real-time movement
// already drives (processRealTimeStep) — no separate movement system needed.
// Positions aren't saved (see persistence.js): only alive/dead + dialogue
// state persist, and location is recomputed from the schedule + current
// time on load, same principle as the arena lobby or indoor lighting.
function getNpcSchedules() {
    const farmHome = window.campaign2FarmHouseCenter;
    return {
        'Garrick Holt': [
            { start: 0, end: 6, hex: { q: -4, r: 0 } },   // his own bed corner in the tavern
            { start: 6, end: 24, hex: { q: -3, r: -2 } },  // behind the bar
        ],
        'Wick Hallow': [
            { start: 0, end: 7, hex: { q: 3, r: 19 } },    // bed corner in the back of the store
            { start: 7, end: 24, hex: { q: 0, r: 18 } },   // behind the counter
        ],
        'Mira Ashbrook': [
            { start: 0, end: 9, hex: { q: 12, r: 9 } },     // home
            { start: 9, end: 23, hex: { q: 2, r: -2 } },   // her usual tavern spot
            { start: 23, end: 24, hex: { q: 12, r: 9 } },
        ],
        'Oskar Vinn': [
            { start: 0, end: 10, hex: { q: -6, r: 9 } },   // home
            { start: 10, end: 23, hex: { q: 3, r: -2 } },  // his usual tavern spot
            { start: 23, end: 24, hex: { q: -6, r: 9 } },
        ],
        ...(farmHome ? {
            'Old Mac': [
                { start: 0, end: 8, hex: { q: farmHome.q + 1, r: farmHome.r } },          // home overnight
                { start: 8, end: 13, hex: window.campaign2FarmPastureCenter || { q: farmHome.q + 1, r: farmHome.r } }, // tending the sheep
                { start: 13, end: 13.17, hex: { q: 0, r: 15 } },                          // ~10 min errand at the general store
                { start: 13.17, end: 19, hex: { q: -3, r: -2 } },                         // evening at the tavern
                { start: 19, end: 24, hex: { q: farmHome.q + 1, r: farmHome.r } },        // home for the night
            ],
        } : {}),
    };
}

function updateNpcSchedules() {
    if (window.currentCampaign !== '2' || window.isInCombat) return;
    const schedules = getNpcSchedules();
    const hour = window.getCurrentHour ? window.getCurrentHour() : 12;
    const partyHexes = collectPartyHexes();
    window.entities.forEach(e => {
        const blocks = schedules[e.name];
        if (!e.alive || !blocks) return;
        // Townsfolk on a daily routine follow the roads (the farmer walking to
        // the pub sticks to the path); see the prefersRoads bias in findPath.
        e.prefersRoads = true;
        const block = blocks.find(b => hour >= b.start && hour < b.end);
        if (!block) return;
        if (e.hex.q === block.hex.q && e.hex.r === block.hex.r) { e.destination = null; return; }
        // SUPERPOSITION COLLAPSE: if the player is nowhere near, the NPC's
        // walk is unobserved — so just snap it to where its schedule says it
        // should be right now, rather than setting a destination the
        // real-time movement loop then pathfinds across the map step by
        // step. Only walk visibly (set destination) when within the active
        // radius, so the player still sees smooth movement when watching.
        if (isDormantAmbientNpc(e, partyHexes)) {
            e.hex = { q: block.hex.q, r: block.hex.r };
            e.visualQ = block.hex.q; e.visualR = block.hex.r;
            e.destination = null;
            return;
        }
        if (e.destination && e.destination.q === block.hex.q && e.destination.r === block.hex.r) return;
        e.destination = { q: block.hex.q, r: block.hex.r };
    });
}
window.updateNpcSchedules = updateNpcSchedules;


// Innkeeper-hosted rest: always safe (no ambush roll) for a flat 1 gold.
function restAtInn(npc) {
    const player = window.party?.[0];
    if (!player) return;
    if (player.gold < 1) { window.showMessage("You don't have a single gold piece to spare."); return; }
    const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
    if (enemySeen) { window.showMessage("Not with enemies about!"); return; }
    player.gold -= 1;
    window._restSafe = true;
    window.isResting = true;
    window.showMessage(`${npc.name} shows you to a room. Resting safely until restored...`);
    if (window.updateRestButton) window.updateRestButton();
}
window.restAtInn = restAtInn;

// Free rest at the player's own built cottage (see buildPlayerCottage in
// campaign2World.js) — same safe/no-ambush mechanics as restAtInn, minus
// the gold cost, since it's the player's own home.
function restAtHome() {
    const player = window.party?.[0];
    if (!player) return;
    const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
    if (enemySeen) { window.showMessage("Not with enemies about!"); return; }
    window._restSafe = true;
    window.isResting = true;
    window.showMessage("You settle in and rest safely until restored...");
    if (window.updateRestButton) window.updateRestButton();
}
window.restAtHome = restAtHome;

function syncBackToPlayer(entity) {
    if (entity.side === 'player' && window.party) {
        const char = window.party.find(p => p.name === entity.name);
        if (char) {
            char.hp = entity.hp;
            char.currentMana = entity.currentMana;
            char.offhandAttackAvailable = entity.offhandAttackAvailable;
            if (char === window.player) window.showCharacter(); 
        }
        
        // ROGUELIKE: End of run if main char dies
        if (window.currentCampaign === "1" && entity.name === window.party[0].name && entity.hp <= 0) {
            window.playSting('deathSting');
            window.playMusic('deathTheme', 0.4, 0.3);
            window.endArenaRun();
        }
    }
}

function playerMoveProcess(player, path) {
    if (!path || path.length === 0) {
        finalizePlayerAction(player, true);
        return;
    }

    if (player.webbedDuration > 0) {
        window.showMessage(`${player.name} is webbed and cannot move! (${Math.ceil(player.webbedDuration)} TP remaining)`);
        finalizePlayerAction(player, true);
        return;
    }

    // MULTI-HEX / WALL FIT CHECK
    const nextHex = path[0];
    const occupant = getEntityAtHex(nextHex.q, nextHex.r);
    const targetTerrain = window.getTerrainAt(nextHex.q, nextHex.r);
    
    // TASK 2: Knowledge-based blocking
    const isVisible = window.isVisibleToPlayer(nextHex);
    const isExplored = window.isHexExplored(nextHex.q, nextHex.r);

    if (targetTerrain.name === 'Wall' && isExplored) {
        window.showMessage("Path is blocked by a wall.");
        player.destination = null;
        finalizePlayerAction(player, true);
        return;
    }

    if (occupant && occupant.alive && occupant.side !== player.side && isVisible) {
        window.showMessage(`Path is blocked by ${occupant.name}.`);
        player.destination = null;
        finalizePlayerAction(player, true);
        return;
    }

    if (targetTerrain.elevated) {
        const myHexes = player.getAllHexes();
        const allOnElevated = myHexes.every(h => {
            const relQ = h.q - player.hex.q;
            const relR = h.r - player.hex.r;
            return window.getTerrainAt(nextHex.q + relQ, nextHex.r + relR).elevated;
        });
        if (!allOnElevated) {
            window.showMessage("This creature is too large to fit up here.");
            finalizePlayerAction(player, true);
            return;
        }
    }

    // CLIMB FAILURE (in combat only — no time pressure out of combat means
    // guaranteed success there). Rolled once, on the actual transition onto
    // climbRisk terrain, not on every subsequent step while already walking
    // along the top of it. Failing costs a chunk of TP for the wasted
    // attempt but leaves the climber right where they started.
    if (window.isInCombat && targetTerrain.climbRisk && !window.getTerrainAt(player.hex.q, player.hex.r).climbRisk) {
        const climbMoveEntity = player.riding || player;
        const skillCount = countClimbingSkills(climbMoveEntity);
        const fallChance = Math.max(0, 0.30 - 0.10 * skillCount);
        if (Math.random() < fallChance) {
            window.showMessage(`${player.name} loses their grip and fails to climb!`);
            spendTP(climbMoveEntity, 10);
            finalizePlayerAction(player, true);
            return;
        }
    }

    const previousHex = { q: player.hex.q, r: player.hex.r };

    checkMovementReactions(player, nextHex, (forceEnd) => {
        const occupant = getEntityAtHex(nextHex.q, nextHex.r);
        
        if (forceEnd && occupant && occupant !== player && occupant !== player.riding) {
            window.showMessage(`Halted inside ${occupant.name}'s hex! Shunted back.`);
            player.hex = previousHex;
        } else {
            player.hex = nextHex;
            if (player.riding) player.riding.hex = { q: nextHex.q, r: nextHex.r };
            window.drawMap();
            window.renderEntities();
        }
        
        const moveEntity = player.riding || player;
        let baseMoveCost = 5;
        if (player.isStealthed) {
            let stealthPenalty = 4;
            if (player.skills?.speedy_stealth) stealthPenalty -= 2;
            baseMoveCost += stealthPenalty;
        }
        if (moveEntity.skills) {
            if (moveEntity.skills['fastMovement']) {
                const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor]?.id === 'light_armor';
                if (isLightOrNoArmor) baseMoveCost -= moveEntity.skills['fastMovement'];
            }
            if (moveEntity.skills['swift_step']) {
                const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                if (isUnarmored) baseMoveCost -= 1;
            }
        }
        const previousTerrain = window.getTerrainAt(previousHex.q, previousHex.r);
        const terrain = window.getTerrainAt(player.hex.q, player.hex.r);
        
        let terrainMult = window.getMoveCostMult(player.hex.q, player.hex.r, moveEntity);
        if (terrain.name === 'Foliage' && (moveEntity.skills?.elf_foliage_expertise || moveEntity.skills?.druid_foliage_expertise)) {
            terrainMult = 1.0; 
        }

        // HEIGHT PENALTY (any elevated terrain — Pedestals, and now fort ramparts)
        if (previousTerrain.name !== terrain.name && (previousTerrain.elevated || terrain.elevated)) {
            let heightPenalty = 1.0;
            const climbRiskSide = terrain.climbRisk ? terrain : (previousTerrain.climbRisk ? previousTerrain : null);
            if (climbRiskSide) {
                heightPenalty *= getClimbCostMult(moveEntity); // stacking climbing skills
            } else if (moveEntity.skills?.agile_climber) {
                heightPenalty = 0.5;
            }
            terrainMult += heightPenalty;
        } else if (previousTerrain.elevated && terrain.elevated) {
            terrainMult = 1.0; // Flat movement on same level
        }

        let stepCost = baseMoveCost * (player.isFlying ? 1 : terrainMult);
        
        // ZONE OF CONTROL
        if (!player.isFlying) {
            const enemies = window.entities.filter(e => e.alive && e.side !== player.side && !e.isFlying);
            for (let enemy of enemies) {
                const weaponId = enemy.equipped?.weapon;
                const weapon = weaponId ? window.items[weaponId] : null;
                const reach = 1 + (weapon?.range || 0);
                const enemyAllHexes = enemy.getAllHexes();
                const wasInRange = enemyAllHexes.some(eh => window.distance(eh, previousHex) <= reach);
                const isStillInRange = enemyAllHexes.some(eh => window.distance(eh, player.hex) <= reach);
                
                if (wasInRange && !isStillInRange) {
                    const zocRank = enemy.skills?.zone_of_control || 0;
                    if (zocRank === 1) stepCost *= 2;
                    else if (zocRank >= 2) stepCost *= 3;
                }
            }
        }

        let threshold = 80;
        const mainChar = window.party?.[0]; // Default threshold context
        if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];

        let canAfford = true;
        if (player.riding) {
            if (player.riding.timePoints > 80) { // Mounts usually have fixed 80 threshold
                spendTP(player.riding, stepCost);
            } else {
                window.showMessage("Mount is exhausted!");
                canAfford = false;
            }
        } else {
            if (player.timePoints > threshold) {
                spendTP(player, stepCost);
            } else {
                canAfford = false;
            }
        }

        if (forceEnd || !canAfford) {
            if (forceEnd) {
                window.showMessage("Your turn was halted!");
                let threshold = 80;
                if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
                player.timePoints = threshold; 
            }
            finalizePlayerAction(player, true);
        } else {
            path.shift();
            let threshold = 80;
            if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
            
            const mountExhausted = player.riding && player.riding.timePoints <= 80;
            
            // Check if current hex is occupied by another friendly (squeezing)
            const isSqueezing = window.entities.some(e => e.alive && e !== player && e !== player.riding && e.hex.q === player.hex.q && e.hex.r === player.hex.r);

            if ((player.timePoints > threshold && !mountExhausted && path.length > 0) || (isSqueezing && path.length > 0)) {
                // Out of combat: wait for duration. In combat: fast step.
                // 3x Speed adjustment: divide waitTime by 3
                const baseWait = (stepCost / moveEntity.timePointsPerTick) * 400;
                const waitTime = window.isInCombat ? 20 : (baseWait / 3.0);
                setTimeout(() => playerMoveProcess(player, path), waitTime);
            } else {
                finalizePlayerAction(player, true);
            }
        }
    });
}

function finalizePlayerAction(player, actionHandled) {
    if (!player) return;

    if (actionHandled !== 'main_attack' && actionHandled !== false) {
        player.offhandAttackAvailable = false;
    }

    let threshold = 80;
    if (player.skills && player.skills['quickRecovery']) {
        threshold -= player.skills['quickRecovery'];
    }

    const shouldEndTurn = (Math.floor(player.timePoints) <= threshold) || (actionHandled === 'wait');

    if (shouldEndTurn) {
        window.clearHighlights();
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        
        if (player.riding && player.riding.timePoints > 80) {
            player.riding.timePoints = 80;
        }

        window.drawMap();
        window.renderEntities();
    } else {
        window.gamePhase = 'PLAYER_TURN'; // Restore control
        updatePlayerUI();
        window.updateActionButtons();
    }
    window.updateTurnIndicator();
    syncBackToPlayer(player);

    // Sync World Map Indicator Position
    if (player.name.includes("Player") && window.battleToWorld) {
        const wp = window.battleToWorld(player.hex.q, player.hex.r);
        window.playerWorldPos = { x: wp.col, y: wp.row };
    }

    if (window.multiplayer && window.multiplayer.roomCode && !window.multiplayer.isHost && window.isInCombat) {
        if (window.submitCombatTurnResult) window.submitCombatTurnResult();
    } else {
        if (window.broadcastFullState) window.broadcastFullState();
    }
}

function checkMovementReactions(movingEntity, nextHex, callback) {
    const originalHex = { q: movingEntity.hex.q, r: movingEntity.hex.r };
    
    // Temporarily update hex so player can see the movement triggering the reaction
    movingEntity.hex = nextHex;
    if (movingEntity.riding) movingEntity.riding.hex = { q: nextHex.q, r: nextHex.r };
    window.drawMap();
    window.renderEntities();

    const potentialReactors = window.entities.filter(e => e.alive && e !== movingEntity && window.areAdjacent(nextHex, e.hex));
    let allOptions = [];
    potentialReactors.forEach(r => {
        if (r.reactionBlocked) return;
        const weaponId = (r.equipped && r.equipped.weapon) ? r.equipped.weapon : null;
        if (weaponId === 'spear') {
            if (r.skills['spear_intercept'] && r.timePoints >= 5) {
                allOptions.push({ id: `intercept_${r.name}`, name: `${r.name}: Intercept`, tpCost: 5, reactor: r });
            }
            if (r.skills['spear_halt'] && r.timePoints >= 1) {
                allOptions.push({ id: `halt_${r.name}`, name: `${r.name}: Halt`, tpCost: 1, reactor: r });
            }
        }
        const rIsLightOrNoArmor = !r.equipped || !r.equipped.armor || window.items[r.equipped.armor]?.id === 'light_armor';
        if (r.skills['sidestep'] && r.sidestepsRemaining > 0 && rIsLightOrNoArmor) {
            let tpCost = 6;
            if (r.skills['sidestep_mastery']) tpCost -= 1;
            if (r.timePoints >= tpCost) {
                allOptions.push({ id: `sidestep_${r.name}`, name: `${r.name}: Sidestep`, tpCost: tpCost, reactor: r });
            }
        }
    });

    if (allOptions.length > 0) {
        const playerOption = allOptions.find(o => o.reactor.side === 'player' && !o.reactor.aiControlled && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(o.reactor.name));
        if (playerOption) {
            window.requestReaction(playerOption.reactor, allOptions.filter(o => o.reactor.side === 'player' && !o.reactor.aiControlled), (choiceId) => {
                if (choiceId) {
                    const opt = allOptions.find(o => o.id === choiceId);
                    if (choiceId.startsWith('intercept')) {
                        spendTP(opt.reactor, 5);
                        window.showMessage(`${opt.reactor.name} reacts with Spear Intercept!`);
                        resolveAttack(opt.reactor, movingEntity, false);
                        callback(false);
                    } else if (choiceId.startsWith('halt')) {
                        spendTP(opt.reactor, 1);
                        window.showMessage(`${opt.reactor.name} reacts with Spear Halt!`);
                        callback(true); // Terminate movement AFTER this step
                        return;
                    } else if (choiceId.startsWith('sidestep')) {
                        const reactor = opt.reactor;
                        const cost = opt.tpCost;
                        reactor.sidestepsRemaining -= 1;
                        // requestReaction's own button handler already cleared
                        // isPausedForReaction the instant "Sidestep" was picked,
                        // but this flow isn't actually done yet — it still needs
                        // a destination click. Without re-pausing here, tick()
                        // keeps running other entities' movement/reactions while
                        // we wait, which can cascade into overlapping reaction
                        // prompts and freeze the tab.
                        window.isPausedForReaction = true;
                        window.showMessage(`${reactor.name} Sidesteps! Select an adjacent free hex.`);
                        // Highlight adjacent free hexes
                        window.clearHighlights();
                        const neighbors = window.getNeighbors(reactor.hex.q, reactor.hex.r);
                        neighbors.forEach(nh => {
                            if (!getEntityAtHex(nh.q, nh.r) && window.getTerrainAt(nh.q, nh.r).name !== 'Water' && window.getTerrainAt(nh.q, nh.r).name !== 'Wall') {
                                window.highlightedHexes.push({ q: nh.q, r: nh.r, type: 'move' });
                            }
                        });
                        window.drawMap();
                        window.renderEntities(); // Ensure we don't unpaint
                        
                        // Wait for a click
                        const board = document.getElementById('mapCanvas');
                        const sidestepHandler = (ev) => {
                            const clickedHex = window.screenToHex({x: ev.clientX, y: ev.clientY});
                            if (window.highlightedHexes.some(h => h.q === clickedHex.q && h.r === clickedHex.r)) {
                                reactor.hex = clickedHex;
                                if (reactor.riding) reactor.riding.hex = { q: clickedHex.q, r: clickedHex.r };
                                spendTP(reactor, cost);
                                window.clearHighlights();
                                window.drawMap();
                                window.renderEntities();
                                board.removeEventListener('click', sidestepHandler);
                                window.isPausedForReaction = false;
                                callback(false);
                            }
                        };
                        board.addEventListener('click', sidestepHandler);
                    }
                } else {
                    callback(false);
                }
            });
        } else {
            // Revert temporary move for AI or no reaction
            movingEntity.hex = originalHex;
            if (movingEntity.riding) movingEntity.riding.hex = { q: originalHex.q, r: originalHex.r };
            callback(false);
        }
    } else {
        // Revert temporary move for AI or no reaction
        movingEntity.hex = originalHex;
        if (movingEntity.riding) movingEntity.riding.hex = { q: originalHex.q, r: originalHex.r };
        callback(false);
    }
}

function getHexesInRange(startHex, range) {
    const results = [];
    for (let q = -range; q <= range; q++) {
        for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
            const hex = { q: startHex.q + q, r: startHex.r + r };
            if (window.isHexInBounds(hex)) {
                results.push(hex);
            }
        }
    }
    return results;
}

function updatePlayerUI() {
    if (!window.isInCombat) {
        window.clearHighlights();
        window.drawMap();
        window.renderEntities();
        return;
    }
    if (!window.currentTurnEntity || window.currentTurnEntity.side !== 'player') return;

    window.clearHighlights();
    const player = window.currentTurnEntity;
    
    window.highlightedHexes.push({ q: player.hex.q, r: player.hex.r, type: 'turn' });

    let threshold = 80;
    if (player.skills && player.skills['quickRecovery']) {
        threshold -= player.skills['quickRecovery'];
    }
    
    const moveEntity = player.riding || player;
    const availableTP = moveEntity.timePoints - (player.riding ? 80 : threshold); 
    
    // BFS for reachable hexes
    const reachable = new Map();
    const queue = [{ hex: player.hex, cost: 0 }];
    reachable.set(`${player.hex.q},${player.hex.r}`, 0);

    let baseMoveCost = 5;
    if (moveEntity.skills) {
        if (moveEntity.skills['fastMovement']) {
            const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor]?.id === 'light_armor';
            if (isLightOrNoArmor) baseMoveCost -= moveEntity.skills['fastMovement'];
        }
        if (moveEntity.skills['swift_step']) {
            const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
            if (isUnarmored) baseMoveCost -= 1;
        }
    }
    baseMoveCost = Math.max(1, baseMoveCost);

    while (queue.length > 0) {
        const { hex, cost } = queue.shift();
        const neighbors = window.getNeighbors(hex.q, hex.r);
        
        for (const n of neighbors) {
            if (getEntityAtHex(n.q, n.r)) continue;
            
            const terrain = window.getTerrainAt(n.q, n.r);
            if (terrain.name === 'Wall') continue;

            const stepCost = baseMoveCost * (player.isFlying ? 1 : window.getMoveCostMult(n.q, n.r, player));
            const totalCost = cost + stepCost;

            if (totalCost <= availableTP) {
                const key = `${n.q},${n.r}`;
                if (!reachable.has(key) || totalCost < reachable.get(key)) {
                    reachable.set(key, totalCost);
                    queue.push({ hex: n, cost: totalCost });
                    window.highlightedHexes.push({ ...n, type: 'move' });
                }
            }
        }
    }

    let attackRange = 1;
    let isRanged = false;
    if (player.equipped && player.equipped.weapon) {
        const weapon = window.items[player.equipped.weapon];
        let rangeBonus = (weapon?.range || 0);
        if (weapon?.id === 'bow' && player.skills?.elf_bow_range) rangeBonus += (player.skills.elf_bow_range * 4);
        attackRange += rangeBonus;
        isRanged = (weapon?.subType === 'ranged');
    }
    const attackHexes = getHexesInRange(player.hex, attackRange);
    attackHexes.forEach(h => {
        const target = getEntityAtHex(h.q, h.r);
        if (target && target.side === 'enemy') {
            const bothFlying = player.isFlying && target.isFlying;
            const eitherFlying = player.isFlying || target.isFlying;
            if ((isRanged || !eitherFlying || bothFlying) && window.hasLineOfSight(player.hex, h)) {
                window.highlightedHexes.push({ ...h, type: 'attack' });
            }
        }
    });

    window.drawMap();
    window.renderEntities();
}

function startGameCore(isLoading = false) {
  window.gamePhase = 'WAITING';
  window.playerWorldPos = { x: 220, y: 200 };
  window.activeSpells = window.activeSpells || [];

  // Set initial time based on campaign if not loading
  if (!isLoading) {
      if (window.currentCampaign === "3") {
          window.worldSeconds = 18 * 3600; // 18:00
      } else if (window.currentCampaign === "2") {
          // 11:00, not 08:00 — the day-length formula (getLightLevel in
          // worldTime.js) gives short winter months a "full day" window as
          // narrow as ~2 hours either side of noon; starting at 8am landed
          // outside that window in the starting month, so the whole early
          // game was rendered at full-night vision range (30 * 0.2) despite
          // the clock reading morning. 11:00 is safely inside the daylight
          // window for every month.
          window.worldSeconds = 11 * 3600;
      } else {
          window.worldSeconds = 8 * 3600; // 08:00
      }
  }

  window.mapCanvas = document.getElementById("mapCanvas");
  window.mapCtx = window.mapCanvas.getContext("2d");
  window.resizeCanvas();

  const visuals = {
      playerBase: new Image(),
      leatherArmor: new Image(),
      chainArmor: new Image(),
      monsterDefault: new Image(),
      orcBase: new Image(),
      swordIcon: new Image(),
      // New Human Visuals
      humanBase: new Image(),
      humanHair: new Image(),
      humanMaleHair: new Image(),
      humanLight: new Image(),
      humanMedium: new Image(),
      humanHeavy: new Image(),
      horse: new Image(),
      nasal_helm: new Image(),
      humanMaleBase: new Image(),
      elfMaleBase: new Image(),
      elfMaleHair: new Image(),
      elfFemaleBase: new Image(),
      elfFemaleHair: new Image(),
      dwarfMaleBase: new Image(),
      dwarfMaleHair: new Image(),
      dwarfFemaleBase: new Image(),
      dwarfFemaleHair: new Image(),
      shield: new Image(),
      skeleton: new Image(),
      zombie: new Image(),
      imp: new Image(),
      elite_goblin: new Image(),
      harpy: new Image(),
      wraith: new Image(),
      basilisk: new Image(),
      minotaur: new Image(),
      revenantBase: new Image(),
      wolf: new Image(),
      torch_lit: new Image(),
      fireplace: new Image(),
      axe: new Image(),
      troll: new Image(),
      dragon: new Image(),
      ore_vein: new Image(),
      tree_large: new Image(),
      spear: new Image(),
      club: new Image(),
      giant_club: new Image(),
      spiderweb: new Image(),
      spider1: new Image(),
      spider2: new Image(),
      arenaannouncer: new Image(),
      arenamercenary: new Image(),
      arenashopkeeper: new Image(),
      grishnak: new Image(),
      floor1: new Image(),
      floor2: new Image(),
      floor3: new Image(),
      floor4: new Image(),
      overlay_blood: new Image(),
      overlay_skull: new Image(),
      pedestal: new Image(),
      water: new Image(),
      boar: new Image(),
      tiger: new Image(),
      eagle: new Image(),
      eagleflying: new Image(),
      foliage: new Image(),
      wood_floor: new Image(),
      table: new Image(),
      bench: new Image(),
      bed: new Image(),
      throne: new Image(),
      apple: new Image(),
      door_open: new Image(),
      door_closed: new Image(),
      path: new Image(),
      signpost: new Image(),
      fountain: new Image(),
      gate_arch: new Image(),
      altar_unholy: new Image(),
      locket: new Image(),
      ladder: new Image(),
      watchtower: new Image(),
      corpse_marker: new Image(),
      fence_h: new Image(),
      fence_v: new Image(),
      fence_broken: new Image(),
      blood_spatter: new Image(),
      blood_spatter_faint: new Image(),
      sheep: new Image(),
      dirt: new Image(),
      hut: new Image(),
      hut_large: new Image(),
      journal: new Image(),
      bush_small: new Image(),
      bush_large: new Image(),
      tree_small: new Image(),
      grass_1: new Image(),
      grass_2: new Image(),
      grass_3: new Image(),
      water_1: new Image(),
      water_2: new Image()
  };
  visuals.playerBase.onload = () => { window.drawMap(); };
  visuals.leatherArmor.onload = () => { window.drawMap(); };
  visuals.chainArmor.onload = () => { window.drawMap(); };
  visuals.monsterDefault.onload = () => { window.drawMap(); };
  visuals.orcBase.onload = () => { window.drawMap(); };
  visuals.swordIcon.onload = () => { window.drawMap(); };
  visuals.humanBase.onload = () => { window.drawMap(); };
  visuals.humanHair.onload = () => { window.drawMap(); };
  visuals.humanMaleHair.onload = () => { window.drawMap(); };
  visuals.humanLight.onload = () => { window.drawMap(); };
  visuals.humanMedium.onload = () => { window.drawMap(); };
  visuals.humanHeavy.onload = () => { window.drawMap(); };
  visuals.horse.onload = () => { window.drawMap(); };
  visuals.nasal_helm.onload = () => { window.drawMap(); };
  visuals.humanMaleBase.onload = () => { window.drawMap(); };
  visuals.elfMaleBase.onload = () => { window.drawMap(); };
  visuals.elfMaleHair.onload = () => { window.drawMap(); };
  visuals.elfFemaleBase.onload = () => { window.drawMap(); };
  visuals.elfFemaleHair.onload = () => { window.drawMap(); };
  visuals.dwarfMaleBase.onload = () => { window.drawMap(); };
  visuals.dwarfMaleHair.onload = () => { window.drawMap(); };
  visuals.dwarfFemaleBase.onload = () => { window.drawMap(); };
  visuals.dwarfFemaleHair.onload = () => { window.drawMap(); };
  visuals.shield.onload = () => { window.drawMap(); };
  visuals.skeleton.onload = () => { window.drawMap(); };
  visuals.zombie.onload = () => { window.drawMap(); };
  visuals.imp.onload = () => { window.drawMap(); };
  visuals.elite_goblin.onload = () => { window.drawMap(); };
  visuals.harpy.onload = () => { window.drawMap(); };
  visuals.wraith.onload = () => { window.drawMap(); };
  visuals.basilisk.onload = () => { window.drawMap(); };
  visuals.minotaur.onload = () => { window.drawMap(); };
  visuals.revenantBase.onload = () => { window.drawMap(); };
  visuals.wolf.onload = () => { window.drawMap(); };
  visuals.torch_lit.onload = () => { window.drawMap(); };
  visuals.fireplace.onload = () => { window.drawMap(); };
  visuals.axe.onload = () => { window.drawMap(); };
  visuals.troll.onload = () => { window.drawMap(); };
  visuals.dragon.onload = () => { window.drawMap(); };
  visuals.ore_vein.onload = () => { window.drawMap(); };
  visuals.tree_large.onload = () => { window.drawMap(); };
  visuals.spear.onload = () => { window.drawMap(); };
  visuals.club.onload = () => { window.drawMap(); };
  visuals.giant_club.onload = () => { window.drawMap(); };
  visuals.spiderweb.onload = () => { window.drawMap(); };
  visuals.spider1.onload = () => { window.drawMap(); };
  visuals.spider2.onload = () => { window.drawMap(); };
  visuals.arenaannouncer.onload = () => { window.drawMap(); };
  visuals.arenamercenary.onload = () => { window.drawMap(); };
  visuals.arenashopkeeper.onload = () => { window.drawMap(); };
  visuals.grishnak.onload = () => { window.drawMap(); };
  visuals.floor1.onload = () => { window.drawMap(); };
  visuals.floor2.onload = () => { window.drawMap(); };
  visuals.floor3.onload = () => { window.drawMap(); };
  visuals.floor4.onload = () => { window.drawMap(); };
  visuals.overlay_blood.onload = () => { window.drawMap(); };
  visuals.overlay_skull.onload = () => { window.drawMap(); };
  visuals.pedestal.onload = () => { window.drawMap(); };
  visuals.water.onload = () => { window.drawMap(); };
  visuals.boar.onload = () => { window.drawMap(); };
  visuals.tiger.onload = () => { window.drawMap(); };
  visuals.eagle.onload = () => { window.drawMap(); };
  visuals.eagleflying.onload = () => { window.drawMap(); };
  visuals.foliage.onload = () => { window.drawMap(); };
  visuals.wood_floor.onload = () => { window.drawMap(); };
  visuals.table.onload = () => { window.drawMap(); };
  visuals.bench.onload = () => { window.drawMap(); };
  visuals.bed.onload = () => { window.drawMap(); };
  visuals.throne.onload = () => { window.drawMap(); };
  visuals.apple.onload = () => { window.drawMap(); };
  visuals.door_open.onload = () => { window.drawMap(); };
  visuals.door_closed.onload = () => { window.drawMap(); };
  visuals.path.onload = () => { window.drawMap(); };
  visuals.signpost.onload = () => { window.drawMap(); };
  visuals.ladder.onload = () => { window.drawMap(); };
  visuals.watchtower.onload = () => { window.drawMap(); };
  visuals.corpse_marker.onload = () => { window.drawMap(); };
  visuals.fence_h.onload = () => { window.drawMap(); };
  visuals.fence_v.onload = () => { window.drawMap(); };
  visuals.fence_broken.onload = () => { window.drawMap(); };
  visuals.blood_spatter.onload = () => { window.drawMap(); };
  visuals.blood_spatter_faint.onload = () => { window.drawMap(); };
  visuals.sheep.onload = () => { window.drawMap(); };
  visuals.dirt.onload = () => { window.drawMap(); };
  visuals.bush_small.onload = () => { window.drawMap(); };
  visuals.bush_large.onload = () => { window.drawMap(); };
  visuals.tree_small.onload = () => { window.drawMap(); };
  visuals.grass_1.onload = () => { window.drawMap(); };
  visuals.grass_2.onload = () => { window.drawMap(); };
  visuals.grass_3.onload = () => { window.drawMap(); };
  visuals.water_1.onload = () => { window.drawMap(); };
  visuals.water_2.onload = () => { window.drawMap(); };
  visuals.hut.onload = () => { window.drawMap(); };
  visuals.hut_large.onload = () => { window.drawMap(); };
  visuals.journal.onload = () => { window.drawMap(); };

  visuals.playerBase.src = 'images/elf.png';
  visuals.leatherArmor.src = 'images/elfleatherarmour.png';
  visuals.chainArmor.src = 'images/elfchainarmour.png';
  visuals.monsterDefault.src = 'images/goblin.png';
  visuals.orcBase.src = 'images/orc.png';
  visuals.swordIcon.src = 'images/sword.png';
  // Human Sources
  visuals.humanBase.src = 'images/humanfemale.png';
  visuals.humanHair.src = 'images/humanfemalehair.png';
  visuals.humanMaleHair.src = 'images/humanmalehair.png';
  visuals.humanLight.src = 'images/humanlightarmour.png';
  visuals.humanMedium.src = 'images/humanmediumarmour.png';
  visuals.humanHeavy.src = 'images/humanheavyarmour.png';
  visuals.horse.src = 'images/horse.png';
  visuals.nasal_helm.src = 'images/nasalHelm.png';
  visuals.humanMaleBase.src = 'images/humanmale.png';
  visuals.elfMaleBase.src = 'images/elfmale.png';
  visuals.elfMaleHair.src = 'images/elfmalehair.png';
  visuals.elfFemaleBase.src = 'images/elffemale.png';
  visuals.elfFemaleHair.src = 'images/elffemalehair.png';
  visuals.dwarfMaleBase.src = 'images/dwarfmale.png';
  visuals.dwarfMaleHair.src = 'images/dwarfmalehair.png';
  visuals.dwarfFemaleBase.src = 'images/dwarffemale.png';
  visuals.dwarfFemaleHair.src = 'images/dwarffemalehair.png';
  visuals.shield.src = 'images/shield.png';
  visuals.skeleton.src = 'images/skeleton.svg';
  visuals.zombie.src = 'images/zombie.svg';
  visuals.imp.src = 'images/imp.svg';
  visuals.elite_goblin.src = 'images/elite_goblin.svg';
  visuals.harpy.src = 'images/harpy.svg';
  visuals.wraith.src = 'images/wraith.svg';
  visuals.basilisk.src = 'images/basilisk.svg';
  visuals.minotaur.src = 'images/minotaur.svg';
  visuals.revenantBase.src = 'images/revenant.svg';
  visuals.wolf.src = 'images/wolf.png';
  visuals.torch_lit.src = 'images/torch_lit.svg';
  visuals.fireplace.src = 'images/fireplace.svg';
  visuals.axe.src = 'images/axe.png';
  visuals.troll.src = 'images/troll.png';
  visuals.dragon.src = 'images/dragon.svg';
  visuals.ore_vein.src = 'images/ore_vein.svg';
  visuals.tree_large.src = 'images/tree_large.svg';
  visuals.spear.src = 'images/spear.png';
  visuals.club.src = 'images/club.svg';
  visuals.giant_club.src = 'images/giant_club.png';
  visuals.spiderweb.src = 'images/spiderweb.png';
  visuals.spider1.src = 'images/spider1.png';
  visuals.spider2.src = 'images/spider2.png';
  visuals.arenaannouncer.src = 'images/arenaannouncer.png';
  visuals.arenamercenary.src = 'images/arenamercenary.png';
  visuals.arenashopkeeper.src = 'images/arenashopkeeper.png';
  visuals.grishnak.src = 'images/Grishnak.png';
  visuals.floor1.src = 'images/arenaHexFloor1.png';
  visuals.floor2.src = 'images/arenaHexFloor2.png';
  visuals.floor3.src = 'images/arenaHexFloor3.png';
  visuals.floor4.src = 'images/arenaHexFloor4.png';
  visuals.overlay_blood.src = 'images/overlay blood.png';
  visuals.overlay_skull.src = 'images/overlay skull.png';
  visuals.pedestal.src = 'images/mediumpillar.png';
  visuals.water.src = 'images/water.png';
  visuals.boar.src = 'images/boar.png';
  visuals.tiger.src = 'images/tiger.png';
  visuals.eagle.src = 'images/eagle.png';
  visuals.eagleflying.src = 'images/eagleflying.png';
  visuals.foliage.src = 'images/foliage.png';
  visuals.wood_floor.src = 'images/wood_floor.svg';
  visuals.table.src = 'images/table.svg';
  visuals.bench.src = 'images/bench.svg';
  visuals.bed.src = 'images/bed.svg';
  visuals.throne.src = 'images/throne.svg';
  visuals.apple.src = 'images/apple.svg';
  visuals.door_open.src = 'images/door_open.svg';
  visuals.door_closed.src = 'images/door_closed.svg';
  visuals.path.src = 'images/path.svg';
  visuals.signpost.src = 'images/signpost.svg';
  visuals.fountain.src = 'images/fountain.svg';
  visuals.gate_arch.src = 'images/gate_arch.svg';
  visuals.altar_unholy.src = 'images/altar_unholy.svg';
  visuals.locket.src = 'images/locket.svg';
  visuals.ladder.src = 'images/ladder.svg';
  visuals.watchtower.src = 'images/watchtower.svg';
  visuals.corpse_marker.src = 'images/corpse_marker.svg';
  visuals.fence_h.src = 'images/fence_h.svg';
  visuals.fence_v.src = 'images/fence_v.svg';
  visuals.fence_broken.src = 'images/fence_broken.svg';
  visuals.blood_spatter.src = 'images/overlay blood.png';
  visuals.blood_spatter_faint.src = 'images/overlay blood.png';
  visuals.sheep.src = 'images/sheep.svg';
  visuals.dirt.src = 'images/dirt.svg';
  visuals.hut.src = 'images/hut.svg';
  visuals.hut_large.src = 'images/hut_large.svg';
  visuals.journal.src = 'images/journal.svg';
  visuals.bush_small.src = 'images/bush_small.svg';
  visuals.bush_large.src = 'images/bush_large.svg';
  visuals.tree_small.src = 'images/tree_small.svg';
  visuals.grass_1.src = 'images/grass_1.svg';
  visuals.grass_2.src = 'images/grass_2.svg';
  visuals.grass_3.src = 'images/grass_3.svg';
  visuals.water_1.src = 'images/water_1.svg';
  visuals.water_2.src = 'images/water_2.svg';

  window.gameVisuals = visuals;

  if (window.loadWorldMap) window.loadWorldMap();

  if (isLoading) {
      // Campaign 2's world is one fixed, deterministic layout — regenerate
      // it via setupVillageScene() even when loading, so persistence.js has
      // a real baseline to diff/merge the save's terrain changes onto
      // (rather than needing to store the whole world in every save). Its
      // NPC entities/party seating get thrown away moments later when
      // loadGame() replaces window.entities with the save's own array, so
      // this is exactly as harmless as it is on a fresh game start.
      if (window.currentCampaign === "2") {
          window.setupVillageScene(true);
      }
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      return;
  }

  // Terrain generation is now implicit in getTerrainAt

  if (window.currentCampaign === "1") {
      setupArenaLobby();
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      const fp = window.entities.find(e => e.side === 'player' && !e.rider);
      if (fp && window.centerCameraOn) window.centerCameraOn(fp.hex);
      return;
  }

  if (window.currentCampaign === "2") {
      window.setupVillageScene();
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      const fp = window.entities.find(e => e.side === 'player' && !e.rider);
      if (fp && window.centerCameraOn) window.centerCameraOn(fp.hex);
      return;
  }

  const playerEntity = new window.Entity(window.party[0].name, "red", {q: window.playerPos.q, r: window.playerPos.r}, window.party[0].attributes.agility + 10);
  playerEntity.side = 'player';
  Object.assign(playerEntity, window.party[0]);
  playerEntity.skills = window.party[0].skills;

  window.entities = [playerEntity];
  
  const neighbors = window.getNeighbors(playerEntity.hex.q, playerEntity.hex.r);
  let spawnHex = neighbors.find(h => {
      const terrain = window.getTerrainAt(h.q, h.r);
      const occupant = getEntityAtHex(h.q, h.r);
      return terrain.name !== 'Water' && !occupant;
  });
  if (spawnHex) {
      const horse = window.createMonster('horse', spawnHex, null, null, 'player');
      window.entities.push(horse);
  }

  spawnNewMonster();

  window.drawMap();
  window.renderEntities();
  window.showCharacter();
  if (window.centerCameraOn) window.centerCameraOn(playerEntity.hex);

  if (playerEntity.skills['initiativeBonus']) {
      playerEntity.timePoints += (playerEntity.skills['initiativeBonus'] * 5);
  }

  document.addEventListener("keydown", window.handleMovement);
  window.mapCanvas.addEventListener("click", window.handleClick);
  
  // Right-click for entity details
  window.mapCanvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const clickedHex = window.screenToHex({x: e.clientX, y: e.clientY});
      const target = getEntityAtHex(clickedHex.q, clickedHex.r);
      if (target && target.alive && window.isVisibleToPlayer(target.hex)) {
          window.showEntityDetails(target);
          return;
      }
      if (window.openDoorContextMenu) window.openDoorContextMenu(clickedHex.q, clickedHex.r);
  });

  // TOUCH LONG-PRESS: same alternate-action menu as right-click, for a door
  // under a finger held down without moving (opening/attacking is the
  // normal tap; a hold surfaces lock/attack instead).
  let touchHoldTimer = null, touchHoldHex = null;
  window.mapCanvas.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      touchHoldHex = window.screenToHex({ x: t.clientX, y: t.clientY });
      touchHoldTimer = setTimeout(() => {
          if (window.openDoorContextMenu && touchHoldHex) window.openDoorContextMenu(touchHoldHex.q, touchHoldHex.r);
          touchHoldTimer = null;
      }, 550);
  }, { passive: true });
  window.mapCanvas.addEventListener("touchend", () => { if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; } });
  window.mapCanvas.addEventListener("touchmove", () => { if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; } }, { passive: true });

  if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CHARACTER RENDERING CONFIG
// All values in hexSize units unless noted. Edit these to tune visuals;
// press ` (backtick) in-game to toggle the debug overlay showing anchor dots.
//
// bodyW/bodyH : rendered size = bodyW/bodyH * hexSize * zoom
// yOff        : vertical shift in hexSize units (negative = up)
// hair.type   : 'full' = overlay at body rect | 'small' = cap at head
// hair.yRaw   : extra y shift in raw pixels * zoom (full hair only)
// hair.topFrac: where small hair center sits (0=body top, 1=body bottom)
// armour.topShift: drop armour from body top by this many hexSize units
// armour.wMult   : armour width as multiple of body width
// mainHand/offHand: normalised (0â€“1) position within body rect for weapon hilt
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CHAR_CONFIG = {
    human_male:   { bodyW:1.80, bodyH:2.16, yOff:-0.18, baseKey:'humanMaleBase',  hair:{ key:'humanMaleHair',   type:'small', wFrac:0.30, hFrac:0.30, topFrac:0.19 }, armour:{ wMult:1.0, topShift:0   }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42, shieldOffset:{ x:0.15, y:0.15 }, mainHandYAdj:-0.3, offHandYAdj:-0.15 },
    human_female: { bodyW:1.60, bodyH:1.92, yOff:-0.16, baseKey:'humanBase',       hair:{ key:'humanHair',       type:'full',  yRaw:-3                              }, armour:{ wMult:1.0, topShift:0   }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42, shieldOffset:{ x:0.30, y:0.30 }, mainHandYAdj:0.25 },
    elf_male:     { bodyW:2.00, bodyH:2.40, yOff:-0.20, baseKey:'elfMaleBase',     hair:{ key:'elfMaleHair',     type:'full'                                        }, armour:{ wMult:1.0, topShift:0.3 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.37, y:0.63 }, offHand:{ x:0.58, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    elf_female:   { bodyW:2.00, bodyH:2.40, yOff:-0.20, baseKey:'elfFemaleBase',   hair:{ key:'elfFemaleHair',   type:'full'                                        }, armour:{ wMult:1.0, topShift:0.3 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.37, y:0.63 }, offHand:{ x:0.58, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    dwarf_male:   { bodyW:1.60, bodyH:1.92, yOff:-0.07, baseKey:'dwarfMaleBase',   hair:{ key:'dwarfMaleHair',   type:'full'                                        }, armour:{ wMult:1.4, topShift:0.1 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.33, y:0.61 }, offHand:{ x:0.52, y:0.45 }, weaponSizeMult:1.0, shieldSizeMult:0.36 },
    dwarf_female: { bodyW:1.60, bodyH:1.92, yOff:-0.07, baseKey:'dwarfFemaleBase', hair:{ key:'dwarfFemaleHair', type:'full' }, armour:{ wMult:1.4, topShift:0.1 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.33, y:0.61 }, offHand:{ x:0.52, y:0.45 }, weaponSizeMult:1.0, shieldSizeMult:0.36 },

    // ENEMY HUMANOIDS — sprite keys need matching images (e.g. gameVisuals.revenantBase)
    // Use backtick debug overlay to tune anchor dots once sprites are loaded.
    revenant_male:   { bodyW:1.85, bodyH:2.20, yOff:-0.18, baseKey:'revenantBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    revenant_female: { bodyW:1.65, bodyH:1.96, yOff:-0.16, baseKey:'revenantBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
};

// Cosmetic outfits for the 'clothes' equip slot (equipment.js) — fixed
// shirt/pants hues per item, distinct from a player's own slider-chosen
// everyday colors. Shown per window.clothingDisplayMode (see the inventory
// screen's toggle, ui.js) — 'clothes' always shows them; the default
// 'armor' mode only shows them when no armor is equipped to compete with.
window.CLOTHING_PRESETS = {
    traveler_garb:  { shirtHue: 30,  pantsHue: 25,  satMult: 0.7 },
    fine_tunic:     { shirtHue: 220, pantsHue: 0,   satMult: 0.9 },
    noble_doublet:  { shirtHue: 280, pantsHue: 0,   satMult: 1.1 },
    scholars_robe:  { shirtHue: 0,   pantsHue: 0,   satMult: 0.15 },
};

function drawPlayerCharacter(ctx, e, x, y, z, flyOff) {
    const cfg = CHAR_CONFIG[`${e.race}_${e.gender}`];
    if (!cfg || !window.gameVisuals) {
        // Fallback: draw a colored circle so the entity is always visible
        const r = window.hexSize * 0.45 * z;
        ctx.beginPath();
        ctx.arc(x, y + flyOff, r, 0, Math.PI * 2);
        ctx.fillStyle = e.color || '#9c27b0';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5 * z;
        ctx.stroke();
        return;
    }

    const hs = window.hexSize;
    const bW = cfg.bodyW * hs * z;
    const bH = cfg.bodyH * hs * z;
    const yOff = cfg.yOff * hs * z + flyOff;

    // Body top uses bW/2 as vertical anchor (matches original per-race convention)
    const left = x - bW / 2;
    const top  = y - bW / 2 + yOff;

    // BASE BODY — shirt/pants/skin each recolored independently (see
    // spriteRecolor.js) so not every human/elf/dwarf looks identical.
    // Deterministic per entity name (salted per band so they don't all
    // collapse to the same hue), so it's stable without a stored field.
    // Defaults are drawn from CLOTHING_PALETTE/muted saturation — a raw
    // full-hue-wheel hash looked garish on ordinary villagers — while a
    // player's own slider choice (already set before this ever runs) is
    // left untouched, at full saturation. Skin stays within a believable
    // tan/brown range rather than the full hue wheel clothing gets.
    const baseImg = window.gameVisuals[cfg.baseKey];
    // Equipped clothes (equipment.js's 'clothes' type) override the default
    // shirt/pants hues for this render only — e.shirtHue/pantsHue themselves
    // are left untouched so unequipping reverts to the original look
    // instantly. Shown whenever there's no armor equipped to compete with,
    // or the "always show clothes" inventory toggle is on.
    const clothesId = e.equipped?.clothes;
    const clothesPreset = clothesId && window.CLOTHING_PRESETS?.[clothesId];
    const showClothes = !!clothesPreset && (window.clothingDisplayMode === 'clothes' || !e.equipped?.armor);
    if (baseImg?.complete) {
        if (e.shirtHue === undefined && window.pickClothingHue) { e.shirtHue = window.pickClothingHue((e.name || 'x') + '_shirt'); e.clothingSatMult = 0.85; }
        if (e.pantsHue === undefined && window.pickClothingHue) { e.pantsHue = window.pickClothingHue((e.name || 'x') + '_pants'); e.clothingSatMult = 0.85; }
        if (e.skinHue === undefined && window.hashStringToHue) e.skinHue = 5 + window.hashStringToHue((e.name || 'x') + '_skin') % 40;
        const shirtHue = showClothes ? clothesPreset.shirtHue : e.shirtHue;
        const pantsHue = showClothes ? clothesPreset.pantsHue : e.pantsHue;
        const satMult = showClothes ? (clothesPreset.satMult !== undefined ? clothesPreset.satMult : 1) : e.clothingSatMult;
        const bodyImg = window.getRecoloredSprite ? window.getRecoloredSprite(baseImg, { shirtHue, pantsHue, skinHue: e.skinHue, satMult }) : baseImg;
        ctx.drawImage(bodyImg || baseImg, left, top, bW, bH);
    }

    // HAIR
    const hc = cfg.hair;
    const hairImg = window.gameVisuals[hc.key];
    if (hairImg?.complete) {
        if (e.hairHue === undefined && window.pickHairPreset) {
            const preset = window.pickHairPreset((e.name || 'x') + '_hair');
            e.hairHue = preset.hue; e.hairLightMult = preset.lightMult; e.hairSatMult = preset.satMult;
        }
        const tintedHair = window.getRecoloredHairSprite ? window.getRecoloredHairSprite(hairImg, e.hairHue, e.hairLightMult, e.hairSatMult) : hairImg;
        const drawHair = tintedHair || hairImg;
        if (hc.type === 'full') {
            // Per-entity override for an otherwise-fixed full-body hair sprite
            // (e.g. Ambassador Elarion's absurdly oversized default) — scales
            // around the head anchor (top-center) rather than stretching.
            const sizeMult = e.hairSizeMult !== undefined ? e.hairSizeMult : 1;
            const hW = bW * sizeMult, hH = bH * sizeMult;
            ctx.drawImage(drawHair, x - hW / 2, top + (hc.yRaw || 0) * z, hW, hH);
        } else {
            const hW = bW * hc.wFrac;
            const hH = bH * hc.hFrac;
            const topFrac = hc.topFrac !== undefined ? hc.topFrac : 0.2;
            ctx.drawImage(drawHair, x - hW / 2, top + topFrac * bH - hH / 2, hW, hH);
        }
    }

    // HELMET
    if (e.equipped?.helmet === 'nasal_helm' && window.gameVisuals.nasal_helm?.complete) {
        const hW = bW * cfg.helm.sizeMult;
        let helmImg = window.gameVisuals.nasal_helm;
        if (e.goldGear && window.getGoldTintedSprite) helmImg = window.getGoldTintedSprite(helmImg);
        ctx.drawImage(helmImg, x - hW / 2 + cfg.helm.xOff * hs * z, top + cfg.helm.yOff * hs * z, hW, bH);
    }

    // ARMOUR (humanoid armour images scale to fit each race) — skipped when
    // clothes are the thing actually being shown this render (see
    // showClothes above), so the "always show clothes" toggle actually
    // hides the armor overlay instead of just drawing both on top of
    // each other.
    if (e.equipped?.armor && !showClothes) {
        let armorImg = null;
        const aid = e.equipped.armor;
        if (aid === 'light_armor')  armorImg = window.gameVisuals.humanLight;
        if (aid === 'medium_armor') armorImg = window.gameVisuals.humanMedium;
        if (aid === 'heavy_armor')  armorImg = window.gameVisuals.humanHeavy;
        if (armorImg?.complete) {
            if (e.goldGear && window.getGoldTintedSprite) armorImg = window.getGoldTintedSprite(armorImg);
            const aW = bW * cfg.armour.wMult;
            const aTopShift = cfg.armour.topShift * hs * z;
            ctx.drawImage(armorImg, x - aW / 2, top + aTopShift, aW, bH - aTopShift);
        }
    }

    // SHIELD (offhand slot)
    if (e.equipped?.offhand && window.items[e.equipped.offhand]?.type === 'shield' && window.gameVisuals.shield?.complete) {
        const sSize = bW * cfg.shieldSizeMult;
        const shOff = cfg.shieldOffset || { x: 0, y: 0 };
        ctx.drawImage(window.gameVisuals.shield, x - sSize / 2 + shOff.x * sSize, y + yOff - sSize / 2 + shOff.y * sSize, sSize, sSize);
    }

    // MAIN-HAND WEAPON
    let weaponImg = null;
    let weaponScale = 1.0;
    let mainYAdj = cfg.mainHandYAdj !== undefined ? cfg.mainHandYAdj : 0.5;
    const mainW = e.equipped?.weapon;
    if (mainW === 'sword' || mainW === 'sword_arrow_deflection') weaponImg = window.gameVisuals.swordIcon;
    else if (mainW === 'axe')    weaponImg = window.gameVisuals.axe;
    else if (mainW === 'spear')  weaponImg = window.gameVisuals.spear;
    else if (mainW === 'club')   weaponImg = window.gameVisuals.club;
    else if (mainW === 'dagger') { weaponImg = window.gameVisuals.swordIcon; weaponScale = 0.75; mainYAdj = 0.1; }

    if (weaponImg?.complete) {
        const wSize = hs * cfg.weaponSizeMult * weaponScale * z;
        const mhX = left + cfg.mainHand.x * bW;
        // The sword png's hilt anchor sits at its vertical center, but the
        // blade reads as "held too low" unless raised — mainHandYAdj (in
        // wSize units) tunes this per race/weapon; daggers need much less
        // of a raise than a full sword.
        const mhY = top  + cfg.mainHand.y * bH - mainYAdj * wSize;
        ctx.drawImage(weaponImg, mhX - wSize / 2, mhY - wSize / 2, wSize, wSize);
    }

    // OFF-HAND WEAPON (mirrored)
    let offhandImg = null;
    let offhandScale = 1.0;
    let offYAdj = cfg.offHandYAdj !== undefined ? cfg.offHandYAdj : 0;
    const offW = e.equipped?.offhand;
    if (offW === 'sword' || offW === 'sword_arrow_deflection') offhandImg = window.gameVisuals.swordIcon;
    else if (offW === 'axe')    offhandImg = window.gameVisuals.axe;
    else if (offW === 'spear')  offhandImg = window.gameVisuals.spear;
    else if (offW === 'club')   offhandImg = window.gameVisuals.club;
    else if (offW === 'dagger') { offhandImg = window.gameVisuals.swordIcon; offhandScale = 0.75; offYAdj -= 0.4; }

    if (offhandImg?.complete && window.items[offW]?.type === 'weapon') {
        const wSize = hs * cfg.weaponSizeMult * offhandScale * z;
        const ohX = left + cfg.offHand.x * bW;
        const ohY = top  + cfg.offHand.y * bH - offYAdj * wSize;
        ctx.save();
        ctx.translate(ohX, ohY);
        ctx.scale(-1, 1);
        ctx.drawImage(offhandImg, -wSize / 2, -wSize / 2, wSize, wSize);
        ctx.restore();
    }

    // DEBUG OVERLAY â€” press ` to toggle window.charDebugMode
    if (window.charDebugMode) {
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(left, top, bW, bH);
        const dot = (px, py, color, label) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(px, py, 3 * z, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `${9 * z}px monospace`;
            ctx.fillText(label, px + 4 * z, py + 3 * z);
        };
        dot(left + cfg.mainHand.x * bW, top + cfg.mainHand.y * bH, '#f44', 'M');
        dot(left + cfg.offHand.x  * bW, top + cfg.offHand.y  * bH, '#44f', 'O');
    }
}

function renderEntities() {
  const z = window.cameraZoom || 1.0;
  
  for (const coord in window.mapItems) {
      const items = window.mapItems[coord];
      if (items && items.length > 0) {
          const [q, r] = coord.split(',').map(Number);
          if (!window.isVisibleToPlayer({ q, r })) continue;
          const {x, y} = window.hexToPixel(q, r);
          const size = window.hexSize * 0.8 * z;
          let icon = window.gameVisuals.swordIcon;
          if (items.includes('elder_locket') && window.gameVisuals.locket?.complete) icon = window.gameVisuals.locket;
          if (icon.complete) {
              window.mapCtx.drawImage(icon, x - size/2, y - size/2, size, size);
          }
      }
  }

  // Render Tile Objects (Fireplaces etc.)
  for (const key in window.tileObjects) {
    try {
      const obj = window.tileObjects[key];
      const [q, r] = key.split(',').map(Number);
      if (window.isVisibleToPlayer({q, r})) {
          const {x, y} = window.hexToPixel(q, r);
          const size = window.hexSize * 1.5 * z;
          if (obj.type === 'fireplace' && window.gameVisuals.fireplace?.complete) {
              const { scale, alpha } = fireFlicker(key);
              const fSize = size * scale;
              window.mapCtx.globalAlpha = alpha;
              window.mapCtx.drawImage(window.gameVisuals.fireplace, x - fSize/2, y - fSize/2, fSize, fSize);
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'table' && window.gameVisuals.table?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.table, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'bench' && window.gameVisuals.bench?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.bench, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'bed' && window.gameVisuals.bed?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.bed, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'player_bed' && window.gameVisuals.bed?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.bed, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'building_plot' && window.gameVisuals.signpost?.complete) {
              // Reuses the signpost art as a "surveyed lot, build here" marker
              // — a dedicated foundation/stake sprite can replace this later.
              window.mapCtx.drawImage(window.gameVisuals.signpost, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'throne' && window.gameVisuals.throne?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.throne, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'door_open' && window.gameVisuals.door_open?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.door_open, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'door_closed' && window.gameVisuals.door_closed?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.door_closed, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'signpost' && window.gameVisuals.signpost?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.signpost, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'fountain' && window.gameVisuals.fountain?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fountain, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'gate_arch' && window.gameVisuals.gate_arch?.complete) {
              const gSize = size * 1.4;
              window.mapCtx.drawImage(window.gameVisuals.gate_arch, x - gSize/2, y - gSize/2, gSize, gSize);
          } else if (obj.type === 'ladder' && window.gameVisuals.ladder?.complete) {
              // Drawn half a hex toward the interior side so it visually sits
              // on the border between the wall and the interior hex it
              // actually bridges, rather than looking centered on the wall
              // crest itself.
              let lx = x, ly = y;
              if (obj.interiorHex) {
                  const interiorPx = window.hexToPixel(obj.interiorHex.q, obj.interiorHex.r);
                  lx = x + (interiorPx.x - x) * 0.5;
                  ly = y + (interiorPx.y - y) * 0.5;
              }
              window.mapCtx.drawImage(window.gameVisuals.ladder, lx - size/2, ly - size/2, size, size);
          } else if (obj.type === 'watchtower' && window.gameVisuals.watchtower?.complete) {
              const tSize = size * 1.4;
              window.mapCtx.drawImage(window.gameVisuals.watchtower, x - tSize/2, y - tSize/2, tSize, tSize);
          } else if (obj.type === 'corpse_marker' && window.gameVisuals.corpse_marker?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.corpse_marker, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'fence_h' && window.gameVisuals.fence_h?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fence_h, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'fence_v' && window.gameVisuals.fence_v?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fence_v, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'fence_broken' && window.gameVisuals.fence_broken?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fence_broken, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'blood_spatter' && window.gameVisuals.blood_spatter?.complete) {
              const bSize = size * 0.4;
              window.mapCtx.drawImage(window.gameVisuals.blood_spatter, x - bSize/2, y - bSize/2, bSize, bSize);
          } else if (obj.type === 'blood_spatter_faint' && window.gameVisuals.blood_spatter_faint?.complete) {
              // Only visible at all with Knowledge: Nature — the trail should
              // read as "fading out to nothing" without it, not just fainter.
              const knowsNature = window.party && window.party.some(p => window.hasKnowledgeNature && window.hasKnowledgeNature(p));
              if (knowsNature) {
                  const bSize = size * 0.3;
                  window.mapCtx.globalAlpha = 0.55;
                  window.mapCtx.drawImage(window.gameVisuals.blood_spatter_faint, x - bSize/2, y - bSize/2, bSize, bSize);
                  window.mapCtx.globalAlpha = 1.0;
              }
          } else if (obj.type === 'hut' && window.gameVisuals.hut?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.hut, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'hut_large' && window.gameVisuals.hut_large?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.hut_large, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'journal' && obj.readId === 'phylactery_altar' && window.gameVisuals.altar_unholy?.complete) {
              // The necromancer's ritual altar reuses the journal
              // click-to-read plumbing, but shouldn't look like a letter.
              window.mapCtx.drawImage(window.gameVisuals.altar_unholy, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'journal' && window.gameVisuals.journal?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.journal, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'evidence' && window.gameVisuals.journal?.complete) {
              // Espionage-quest incriminating documents (see espionageQuests.js)
              // — reuses the journal sprite, faded out once already searched.
              if (obj.taken) window.mapCtx.globalAlpha = 0.3;
              window.mapCtx.drawImage(window.gameVisuals.journal, x - size/2, y - size/2, size, size);
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'ore_node' && window.gameVisuals.ore_vein?.complete) {
              // Depleted veins fade out until they regrow (see harvestOreNode).
              let img = window.gameVisuals.ore_vein;
              const hue = ORE_HUES[obj.oreType];
              if (hue !== undefined && window.getRecoloredHairSprite) {
                  const tinted = window.getRecoloredHairSprite(img, hue);
                  if (tinted) img = tinted;
              }
              if (obj.depleted) window.mapCtx.globalAlpha = 0.3;
              window.mapCtx.drawImage(img, x - size/2, y - size/2, size, size);
              if (obj.depleted) window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'fruit_tree' && window.gameVisuals.tree_large?.complete) {
              // Larger than the decorative small trees. Ripe fruit used to be
              // shown by tinting the *whole tree* warm orange-red, which read
              // as "this tree is a weird color" more than "this tree has
              // fruit" — small apple sprites overlaid on the canopy are far
              // more legible. The canopy itself just gets the same seasonal
              // tint every other tree gets (see getSeasonalLeafTint).
              let img = window.gameVisuals.tree_large;
              if (window.getSeasonalLeafTint && window.getRecoloredHairSprite) {
                  const tint = window.getSeasonalLeafTint();
                  const tinted = window.getRecoloredHairSprite(img, tint.hue, tint.light, tint.sat);
                  if (tinted) img = tinted;
              }
              const tSize = size * 2.2;
              const th = tSize * (window.gameVisuals.tree_large.naturalHeight / window.gameVisuals.tree_large.naturalWidth);
              const treeX = x - tSize / 2, treeY = y + size * 0.5 - th;
              window.mapCtx.drawImage(img, treeX, treeY, tSize, th);

              if (obj.hasFruit && window.gameVisuals.apple?.complete) {
                  const appleSize = tSize * 0.22;
                  // Offsets (fraction of canopy width/height) landing inside
                  // the upper canopy area, not the trunk.
                  const applePositions = [
                      { dx: -0.26, dy: 0.30 }, { dx: 0.20, dy: 0.24 },
                      { dx: -0.04, dy: 0.42 }, { dx: 0.30, dy: 0.44 }
                  ];
                  applePositions.forEach(p => {
                      window.mapCtx.drawImage(
                          window.gameVisuals.apple,
                          treeX + tSize * (0.5 + p.dx) - appleSize / 2,
                          treeY + th * p.dy - appleSize / 2,
                          appleSize, appleSize
                      );
                  });
              }
          } else if (obj.type === 'timber_tree' && window.gameVisuals.tree_large?.complete) {
              let img = window.gameVisuals.tree_large;
              if (window.getSeasonalLeafTint && window.getRecoloredHairSprite) {
                  const tint = window.getSeasonalLeafTint();
                  const tinted = window.getRecoloredHairSprite(img, tint.hue, tint.light, tint.sat);
                  if (tinted) img = tinted;
              }
              const tSize = size * 2.2;
              const th = tSize * (window.gameVisuals.tree_large.naturalHeight / window.gameVisuals.tree_large.naturalWidth);
              if (!obj.hasTimber) window.mapCtx.globalAlpha = 0.4;
              window.mapCtx.drawImage(img, x - tSize / 2, y + size * 0.5 - th, tSize, th);
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'stone_deposit') {
              window.mapCtx.fillStyle = obj.depleted ? '#8a8a82' : '#6e6e66';
              window.mapCtx.globalAlpha = obj.depleted ? 0.4 : 1.0;
              window.mapCtx.beginPath();
              window.mapCtx.ellipse(x, y, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
              window.mapCtx.fill();
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'herb_patch' && window.gameVisuals.foliage?.complete) {
              const hSize = size * 0.6;
              window.mapCtx.globalAlpha = obj.hasHerbs ? 1.0 : 0.35;
              window.mapCtx.drawImage(window.gameVisuals.foliage, x - hSize/2, y - hSize/2, hSize, hSize);
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'corpse' && !obj.harvested) {
              window.mapCtx.globalAlpha = 0.7;
              window.mapCtx.fillStyle = '#5a3d2b';
              window.mapCtx.beginPath();
              window.mapCtx.ellipse(x, y, size * 0.35, size * 0.2, 0, 0, Math.PI * 2);
              window.mapCtx.fill();
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'fishing_spot') {
              const ready = (window.worldSeconds - (obj.lastFishedAt || 0)) >= 4 * 3600;
              window.mapCtx.fillStyle = ready ? '#dff' : '#89a';
              window.mapCtx.beginPath();
              window.mapCtx.ellipse(x, y, size * 0.15, size * 0.08, 0, 0, Math.PI * 2);
              window.mapCtx.fill();
          }
      }
    } catch (err) {
        // A single bad tile object (missing/unregistered sprite, etc.) must
        // never abort the rest of this loop — that used to take out every
        // entity drawn after it in the same frame (see gameEngine.js issue:
        // teleporting somewhere with an unloaded asset made the whole party
        // disappear).
        console.warn('renderEntities: failed to draw tile object', key, err);
    }
  }

  // 2. Sort entities by "z-index" for layering: Rider -> Normal -> Mounts (on top)
  const sorted = [...window.entities].filter(e => e.alive && window.isVisibleToPlayer(e.hex)).sort((a, b) => {
      const az = a.rider ? 3 : (a.riding ? 1 : 2); // Mounts (has rider) get 3, Riders (riding something) get 1
      const bz = b.rider ? 3 : (b.riding ? 1 : 2);
      return az - bz;
  });

  sorted.forEach(e => {
    try {
      // Wolf Rider Goblin draws its own mount inline (see the "SPECIAL: Wolf
      // Rider Layering" block below) so the small goblin rider stays visible
      // instead of being hidden under the mount's own independent (and much
      // bigger) sprite. Skip that separate mount draw entirely here.
      if (e.rider && e.rider.name === 'Wolf Rider Goblin') return;

      const vQ = e.visualQ !== undefined ? e.visualQ : e.hex.q;
      const vR = e.visualR !== undefined ? e.visualR : e.hex.r;
      let {x, y} = window.hexToPixel(vQ, vR);

      // Basic off-screen culling for drawing
      if (x < -100 || y < -100 || x > window.mapCanvas.width + 100 || y > window.mapCanvas.height + 100) return;
      
      // TERRAIN OFFSET: stand on top of any elevated terrain (pedestals, fort ramparts)
      const t = window.getTerrainAt(e.hex.q, e.hex.r);
      if (t.elevated) {
          y -= (window.hexSize * 0.6) * z; // 30% of hex height (2*size is full height)
      }

      // ALLEGIANCE OUTLINE: a fight with several factions in the same room
      // (the tavern brawl, an arena boss + guards, a goblin camp) is hard to
      // read from sprite color alone — party/temporary-ally/bystander/enemy
      // each get their own hex outline color, drawn under the sprite.
      const outlineMode = window.allegianceOutlineMode || 'combat';
      const showOutline = outlineMode === 'always' || (outlineMode === 'combat' && window.isInCombat);
      if (showOutline && e.alive && !e.rider) {
          let allegianceColor = null;
          if (e.side === 'enemy') allegianceColor = '#ff3b3b';
          else if (e.side === 'player' && e.aiControlled) allegianceColor = '#00e5ff';
          else if (e.side === 'player') allegianceColor = '#4da6ff';
          else if (e.side === 'neutral') allegianceColor = '#ffd700';
          if (allegianceColor) {
              window.drawHex(x, y, window.hexSize, { stroke: allegianceColor, lineWidth: 2.5 * z });
          }
      }

          if (e.isStealthed) window.mapCtx.globalAlpha = 0.5;
          if (e.unconscious) window.mapCtx.globalAlpha = 0.4;
          const isSentientAlly = e.side === 'player' && !e.aiControlled && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(e.name);
          const flyOff = e.isFlying ? -20 * z : 0;
  
      // Enemy humanoids with sprite config are drawn the same way as player characters
      const hasEnemySpriteCfg = !isSentientAlly && e.race && e.gender && CHAR_CONFIG[`${e.race}_${e.gender}`];
      if ((isSentientAlly || hasEnemySpriteCfg) && !e.customImage && window.gameVisuals) {
          drawPlayerCharacter(window.mapCtx, e, x, y, z, flyOff);
      } else if ((e instanceof window.Enemy || e.customImage) && window.gameVisuals) {
                          let size = window.hexSize * 1.5 * z;
                          let yOffset = 0;
                          let widthMult = 1.0;
                  
                          if (e.name === 'Horse' || e.name === 'Wolf' || e.name === 'Boar' || e.name === 'Tiger') {
                              size = window.hexSize * 3.5 * z; // Shrunk from 4.5
                          } else if (e.name === 'Troll') {
                              size = window.hexSize * 4.5 * z;
                          } else if (e.dragonSizeTier) {
                              // Bigger dragons take up more hexes and render
                              // proportionally larger (matches extraHexes footprint).
                              size = window.hexSize * (3.0 + e.dragonSizeTier * 1.8) * z;
                              yOffset = e.isFlying ? -20 * z : 0;
                          } else if (e.name === 'Eagle') {
                              size = window.hexSize * 1.5 * z;
                              yOffset = e.isFlying ? -20*z : 0;
                          } else if (e.name === 'Shopkeeper') {
                              size = window.hexSize * 1.215 * z; // 10% smaller than 1.35
                          }
                  
                          if (e.customImage === 'arenamercenary') widthMult = 0.61; // 5% smaller than 0.646 (rounding)
                  
                          let img = window.gameVisuals.monsterDefault;
                          if (e.name === 'Orc' && window.gameVisuals.orcBase?.complete) img = window.gameVisuals.orcBase;
                          if (e.forceOrcSprite && window.gameVisuals.orcBase?.complete) img = window.gameVisuals.orcBase;
                          if (e.name === 'Grishnak' && window.gameVisuals.grishnak?.complete) img = window.gameVisuals.grishnak;
                          if (e.name === 'Spider' && e.spiderImage && window.gameVisuals[e.spiderImage]?.complete) img = window.gameVisuals[e.spiderImage];
                          if (e.customImage && window.gameVisuals[e.customImage]?.complete) img = window.gameVisuals[e.customImage];
                          if (e.name === 'Horse' && window.gameVisuals.horse?.complete) img = window.gameVisuals.horse;
                          if (e.name === 'Wolf' && window.gameVisuals.wolf?.complete) img = window.gameVisuals.wolf; 
                          if (e.name === 'Boar' && window.gameVisuals.boar?.complete) img = window.gameVisuals.boar;
                          if (e.name === 'Tiger' && window.gameVisuals.tiger?.complete) img = window.gameVisuals.tiger;
                          if (e.name === 'Troll' && window.gameVisuals.troll?.complete) img = window.gameVisuals.troll;
                          if (e.dragonSizeTier && window.gameVisuals.dragon?.complete) img = window.gameVisuals.dragon;
                          if (e.name === 'Eagle') {
                              const eagleImg = e.isFlying ? window.gameVisuals.eagleflying : window.gameVisuals.eagle;
                              if (eagleImg?.complete) img = eagleImg;
                          }
                          if (e.name === 'Skeleton' && window.gameVisuals.skeleton?.complete) img = window.gameVisuals.skeleton;
                          if (e.name === 'Zombie' && window.gameVisuals.zombie?.complete) img = window.gameVisuals.zombie;
                          if (e.name === 'Imp' && window.gameVisuals.imp?.complete) img = window.gameVisuals.imp;

                          // Named bosses reusing a generic monster's sprite (e.g. Viper on
                          // elite_goblin art) get tinted toward their own color instead of
                          // looking like an unnamed instance of that monster.
                          if (e.spriteBase && e.color && !e.customImage && img === window.gameVisuals.monsterDefault && window.getRecoloredHairSprite && window.hexColorToHue) {
                              const tinted = window.getRecoloredHairSprite(img, window.hexColorToHue(e.color));
                              if (tinted) img = tinted;
                          }
                          // Dragons: recolor the shared base art toward this dragon's own
                          // color, so color is a per-instance trait, not a new asset per shade.
                          if (e.dragonSizeTier && e.color && img === window.gameVisuals.dragon && window.getRecoloredHairSprite && window.hexColorToHue) {
                              const tinted = window.getRecoloredHairSprite(img, window.hexColorToHue(e.color));
                              if (tinted) img = tinted;
                          }
                          // Horses bought from a stable carry a fixed coat preset (see
                          // HORSE_COAT_PRESETS) rather than an arbitrary hue — deliberately
                          // a short vetted list (brown/black/white/chestnut/gray), not a
                          // free-form color picker, so there's no way to end up with a
                          // green horse. Wild/skill-granted horses are left their default
                          // sprite color (no coatPreset set).
                          if (e.name === 'Horse' && e.coatPreset && window.HORSE_COAT_PRESETS?.[e.coatPreset] && window.getRecoloredHairSprite) {
                              const preset = window.HORSE_COAT_PRESETS[e.coatPreset];
                              const tinted = window.getRecoloredHairSprite(img, preset.hue, preset.light, preset.sat);
                              if (tinted) img = tinted;
                          }

                                  try {
                                      if (img && img.complete) {
                                          // SPECIAL: Wolf Rider Layering — wolf drawn full-size as the
                                          // mount, goblin drawn smaller and shifted up so it actually
                                          // reads as a rider instead of being fully hidden behind the
                                          // wolf (both used to draw at identical size/position, so the
                                          // goblin never showed at all).
                                          if (e.name === 'Wolf Rider Goblin') {
                                              const wolfSize = size * 1.8;
                                              window.mapCtx.drawImage(window.gameVisuals.wolf, x - wolfSize/2, y - wolfSize/2 + yOffset, wolfSize, wolfSize);
                                              const riderSize = size * 0.75;
                                              window.mapCtx.drawImage(window.gameVisuals.monsterDefault, x - riderSize/2, y - wolfSize*0.42 + yOffset, riderSize, riderSize);
                                          } else {
                                              const finalWidth = size * widthMult;
                                              window.mapCtx.drawImage(img, x - finalWidth/2, y - size/2 + yOffset, finalWidth, size);
                                          }
                                      }
                                  } catch (err) {}
                                                    if (e.mountSize > 0 && e.equipped && e.equipped.armor) {
                              const armorId = e.equipped.armor;
                              let armorImg = (armorId === 'medium_armor' || armorId === 'heavy_armor') ? window.gameVisuals.chainArmor : window.gameVisuals.leatherArmor;
                              if (armorImg && armorImg.complete) {
                                  window.mapCtx.drawImage(armorImg, x - size/2, y - size/2 + (5 * z), size, size);
                              }
                          }
                  
                          if (e.extraHexes.length > 0 && e.name !== 'Horse' && e.name !== 'Troll' && e.name !== 'Boar' && e.name !== 'Tiger') {
                              const offsets = [{q:0, r:0}, ...e.extraHexes];
                              const labels = ['f', 'l', 'r'];
                              const prefix = 'T';
                              offsets.forEach((off, i) => {
                                  const hp = window.hexToPixel(e.hex.q + off.q, e.hex.r + off.r);
                                  window.mapCtx.fillStyle = "white";
                                  window.mapCtx.font = `${12 * z}px Arial`;
                                  window.mapCtx.fillText(prefix + labels[i], hp.x - 5*z, hp.y + 5*z);
                              });
                          }
                  
                          // WEAPON LAYER
                          let weaponImgEn = null;
                          if (e.equipped?.weapon === 'sword') weaponImgEn = window.gameVisuals.swordIcon;
                          else if (e.equipped?.weapon === 'axe') weaponImgEn = window.gameVisuals.axe;
                          else if (e.equipped?.weapon === 'spear') weaponImgEn = window.gameVisuals.spear;
                          else if (e.equipped?.weapon === 'club') {
                              // Large creatures swing the oversized tree-trunk
                              // club; anything human-scale gets the small stick.
                              const isGiantSized = e.name === 'Troll' || e.spriteBase === 'troll' || (e.tags && e.tags.includes('giant'));
                              weaponImgEn = isGiantSized ? window.gameVisuals.giant_club : window.gameVisuals.club;
                          }
                  
                          if (weaponImgEn && weaponImgEn.complete) {
                              const weaponSize = window.hexSize * 0.8 * z;
                              window.mapCtx.drawImage(weaponImgEn, x - (window.hexSize/2 + 5) * z, y - weaponSize/2, weaponSize, weaponSize);
                          }
                  
                          // AI State Indicator Removed
                      }
                  
                      // SPIDER WEB OVERLAY
                      if (e.webbedDuration > 0 && window.gameVisuals.spiderweb.complete) {
                          const wSize = window.hexSize * 2.0 * z;
                          window.mapCtx.drawImage(window.gameVisuals.spiderweb, x - wSize/2, y - wSize/2, wSize, wSize);
                      }
                  
                      // UNIVERSAL LAYER: Torch
                  
    if (e.equipped && window.gameVisuals.torch_lit.complete) {
        const hasTorch = (e.equipped.weapon === 'torch' || e.equipped.offhand === 'torch');
        if (hasTorch) {
            const { scale, alpha } = fireFlicker(e.name || 'torch');
            const tSize = window.hexSize * 1.0 * z * scale;
            // Was drifting far right of the hand and sitting a bit too high;
            // pulled back left by 1.5x its own size and down by 0.4x.
            window.mapCtx.globalAlpha = alpha;
            window.mapCtx.drawImage(window.gameVisuals.torch_lit, x + (window.hexSize/3)*z - 1.5 * tSize, y - tSize + 0.4 * tSize, tSize, tSize);
            window.mapCtx.globalAlpha = 1.0;
        }
    }

    // Brief colored overlay on hit/heal (see combatFX.js's flashEntity) —
    // cheap "got hit" feedback without a dedicated hit-animation frame.
    if (e._fxFlashUntil && performance.now() < e._fxFlashUntil) {
        window.mapCtx.globalAlpha = 0.45;
        window.mapCtx.fillStyle = e._fxFlashColor || '#f00';
        const fSize = window.hexSize * 1.3 * z;
        window.mapCtx.beginPath();
        window.mapCtx.arc(x, y, fSize / 2, 0, Math.PI * 2);
        window.mapCtx.fill();
        window.mapCtx.globalAlpha = 1.0;
    }

    window.mapCtx.globalAlpha = 1.0;
    } catch (err) {
        // Same reasoning as the tile-object loop above: one entity failing
        // to draw (bad/missing sprite, etc.) must never take every entity
        // after it in this frame down with it.
        console.warn('renderEntities: failed to draw entity', e?.name, err);
    }
  });

  // Speech bubbles render after entities (not in drawMap's pass order) so a
  // bubble never gets drawn over by whichever character stands behind it.
  if (window.renderSpeechBubbles) window.renderSpeechBubbles(window.mapCtx, window.hexToPixel, window.cameraZoom);
}

function triggerPenalty(casterName, victim, spell) {
    const caster = window.entities.find(e => e.name === casterName);
    if (!caster) return;

    // Apply Cleric Skill Bonuses
    if (caster.skills?.cleric_trigger_damage) {
        const dmg = caster.skills.cleric_trigger_damage;
        victim.hp -= dmg;
        sharedMessage(`${victim.name} takes ${dmg} divine retribution damage!`);
    }
    if (caster.skills?.cleric_trigger_mana) {
        const manaLoss = caster.skills.cleric_trigger_mana;
        victim.currentMana = Math.max(0, victim.currentMana - manaLoss);
        window.showMessage(`${victim.name} loses ${manaLoss} mana from divine drain!`);
    }
    if (caster.skills?.cleric_trigger_vision) {
        if (victim.visionPenaltyStacks < 3) {
            victim.visionPenaltyStacks++;
            const penalty = caster.skills.cleric_trigger_vision;
            victim.visionBonus = (victim.visionBonus || 0) - penalty;
            window.showMessage(`${victim.name}'s vision is clouded!`);
        }
    }
    if (caster.skills?.cleric_trigger_dmg_red) {
        if (victim.dmgPenaltyStacks < 3) {
            victim.dmgPenaltyStacks++;
            const penalty = caster.skills.cleric_trigger_dmg_red;
            victim.baseDamage = Math.max(0, victim.baseDamage - penalty);
            window.showMessage(`${victim.name} is weakened by divine power!`);
        }
    }
    if (caster.skills?.cleric_trigger_heal_red) {
        const penalty = caster.skills.cleric_trigger_heal_red * 50;
        victim.healingReduction = Math.min(100, (victim.healingReduction || 0) + penalty);
        window.showMessage(`${victim.name}'s connection to grace is severed!`);
    }
}

function checkInCombat() {
    return window.entities.some(e => e.alive && e.side === 'enemy' && e.aiState === 'combat');
}

// AMBIENT-NPC "SUPERPOSITION" / ACTIVE SET
// The per-frame tick loops (regen bookkeeping in runTickInternal, real-time
// movement in tick()) used to iterate every entity in the game every frame,
// regardless of distance from the player — with Campaign 2's persistent
// world roster now 80+ NPCs, that's real work paid continuously for
// shopkeepers and guards the player is nowhere near (the reported slowdown,
// worse on phones). Beyond the ~30-hex vision cap an NPC is never actually
// on screen, so there's nothing to simulate smoothly: a distant ambient NPC
// is left in "superposition" — not ticked at all — and its position is only
// *collapsed* (snapped to wherever its schedule says it should be at the
// current time) when the player comes close enough to observe it, exactly
// like BG1/Skyrim snap townsfolk to their scheduled spot when you round the
// corner. 40 > 30 (+margin) guarantees a dormant NPC is off-screen, so the
// snap is never visible.
//
// Only neutral ambient NPCs (isNPC) are ever dormant. Party members,
// enemies, mounts, summons, and aiControlled allies are always fully
// simulated — anything that can meaningfully act off-screen (a fleeing
// enemy, a companion) is never put in superposition.
const ACTIVE_SIM_RADIUS = 40;

// Collected once per frame (party is small) so the per-entity dormancy test
// below is O(entities x party), not O(entities^2).
function collectPartyHexes() {
    const hexes = [];
    for (const e of window.entities) {
        if (e.side === 'player' && e.alive) hexes.push(e.hex);
    }
    return hexes;
}

function isDormantAmbientNpc(e, partyHexes) {
    if (!e.isNPC || e.side !== 'neutral') return false;
    for (const ph of partyHexes) {
        if (window.distance(ph, e.hex) <= ACTIVE_SIM_RADIUS) return false;
    }
    return true;
}
window.isDormantAmbientNpc = isDormantAmbientNpc;
window.collectPartyHexes = collectPartyHexes;

// "RESTLESS SET" — the per-frame regen/poison/mana loop out of combat only
// ever needs to touch entities that are NOT at full rest: below max HP or
// mana, poisoned, withering, or tied to an ongoing spell. A capital full of
// idle, full-health NPCs is all at rest, so the working set is (almost)
// always empty and the loop does nothing — no more "confirming 30 townsfolk
// are still at full health" every frame. Rebuilt on a throttle (the ~1s
// UI-refresh cadence in tick(), and once when combat ends so post-fight
// healing starts promptly); the periodic rebuild is the robustness net, so
// no scattered "mark dirty" calls are needed at every damage site. In
// combat the full entity loop is kept (combat is small and near the player,
// and TP granting there is correctness-critical).
function rebuildRestlessSet() {
    const list = [];
    for (const e of window.entities) {
        if (!e.alive) continue;
        if (e.hp < e.maxHp || (e.currentMana || 0) < (e.maxMana || 0) || e.poisonTicks > 0 || e.witherTicks > 0) {
            list.push(e);
        }
    }
    if (window.activeSpells && window.activeSpells.length) {
        for (const e of window.entities) {
            if (!e.alive || list.includes(e)) continue;
            if (window.activeSpells.some(s => s.casterName === e.name || s.targetEntityId === e.id)) list.push(e);
        }
    }
    window._restlessEntities = list;
    return list;
}
window.rebuildRestlessSet = rebuildRestlessSet;

let lastTimestamp = performance.now();
let tickCounter = 0;

let _pausedForReactionSince = 0;
function tick() {
    if (window.isPausedForReaction) {
        // Safety valve: if something left isPausedForReaction stuck true
        // without a modal actually open (a bug in some reaction sub-flow),
        // the whole game silently stops responding forever. Auto-clear it
        // after a long stall rather than requiring a page reload.
        if (!_pausedForReactionSince) _pausedForReactionSince = performance.now();
        else if (performance.now() - _pausedForReactionSince > 4000) {
            const anyModalOpen = ['reaction-modal', 'dialogue-modal'].some(id => {
                const el = document.getElementById(id);
                return el && el.style.display === 'block';
            });
            if (!anyModalOpen) {
                console.warn('[WATCHDOG] isPausedForReaction was stuck true with no modal open — clearing it.');
                window.isPausedForReaction = false;
                _pausedForReactionSince = 0;
            }
        }
        return;
    }
    _pausedForReactionSince = 0;
    if (window.gameOver) return;

    const now = performance.now();
    const dt = (now - lastTimestamp) / 1000; // Delta time in seconds
    lastTimestamp = now;

    const inCombat = checkInCombat();
    if (inCombat && !window._wasInCombat && window.showTutorialTip) {
        window.showTutorialTip('combat_start', "Combat is turn based now, not real time. Each character spends Time Points (TP) on actions; once you're below 80 TP you can no longer act until it regenerates. Watch the initiative bar to track who has the most time points (TP).");
    } else if (!inCombat && window._wasInCombat && window.showTutorialTip) {
        window.showTutorialTip('combat_end', "Combat's over — you're back in real-time exploration. Movement and actions now happen continuously instead of waiting for turns.");
    }
    window._wasInCombat = inCombat;
    window.isInCombat = inCombat; // Expose globally for UI

    // PERIODIC UI REFRESH (Out of combat)
    if (!inCombat && window.updateActionButtons) {
        tickCounter++;
        if (tickCounter >= 50) {
            const isMultiplayer = window.multiplayer && window.multiplayer.roomCode;
            if (isMultiplayer) {
                if (window.multiplayer.isHost) {
                    if (window.updateExploration) window.updateExploration();
                    if (window.broadcastFullState) window.broadcastFullState();
                } else {
                    // Non-host: update exploration locally so hexes the player can see
                    // are recorded as explored. Without this, if the entity briefly blinks
                    // (e.g. due to a stale combat submission from another player), those
                    // hexes go to "never seen" black instead of "seen" dim fog.
                    if (window.updateExploration) window.updateExploration();
                }
            } else {
                if (window.updateExploration) window.updateExploration();
            }
            window.updateActionButtons();
            checkEquipmentAuras();
            updateNpcSchedules();
            rebuildRestlessSet(); // refresh whose HP/mana/poison the regen loop needs to touch
            tickCounter = 0;
        }
    }

    // REST/SLEEP LOGIC (High speed)
    if (window.isResting || window.isSleeping) {
        const sentientAllies = window.entities.filter(e => e.alive && e.side === 'player' && e.name !== 'Wolf' && e.name !== 'Horse');

        for(let i=0; i<1000; i++) {
            if (!window.isResting && !window.isSleeping) break;

            const ready = window.entities.filter(e => e.timePoints >= 100 && e.alive && !e.unconscious && e.side === 'player' && !e.rider);
            if (ready.length > 0) {
                ready.forEach(e => spendTP(e, 1));
            } else {
                runTickInternal(true, true); // skipUI=true
                // Force time progression during high-speed rest
                if (window.updateTime) window.updateTime(0.4); 
            }

            // CHECK COMPLETION
            if (window.isResting) {
                const allRestored = sentientAllies.every(e => e.hp >= e.maxHp && (e.maxMana === 0 || e.currentMana >= e.maxMana));
                if (allRestored) {
                    window.isResting = false;
                    sentientAllies.forEach(ent => { ent.soulAnchorUsed = false; });
                    window.showMessage("Rest complete. Everyone is restored.");
                    window.updateRestButton();
                    window.showCharacter();
                    window.updateTurnIndicator();
                }
            }

            if (window.isSleeping) {
                const mc = window.entities.find(e => e.name === window.party[0].name);
                if (!mc || (mc.sleepRemainingSeconds <= 0)) {
                    window.isSleeping = false;
                    sentientAllies.forEach(ent => { ent.awakeSeconds = 0; ent.soulAnchorUsed = false; });
                    window.showMessage("Sleep complete.");
                    window.updateSleepButton();
                    window.showCharacter();
                    window.updateTurnIndicator();
                }
            }

            // CHECK INTERRUPTS
            const enemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
            const anyoneHurt = sentientAllies.some(e => e.hp < (e.lastHp || e.hp)); 
            if (enemySeen || anyoneHurt) {
                if (window.isResting) { window.isResting = false; window.showMessage("Rest interrupted!"); window.updateRestButton(); }
                if (window.isSleeping) { window.isSleeping = false; window.showMessage("Sleep interrupted!"); window.updateSleepButton(); }
            }
            sentientAllies.forEach(e => e.lastHp = e.hp);
        }
        window.updateTurnIndicator();
        return; 
    }

    if (!inCombat) {
        const timeScale = 5.0 * (window.timeSpeedMultiplier || 1);
        const scaledDt = dt * timeScale;

        if (window.updateTime) window.updateTime(scaledDt);
        runTickInternal(false, true, scaledDt / 0.4);

        // REAL-TIME LOGICAL MOVEMENT
        const _movePartyHexes = collectPartyHexes();
        window.entities.forEach(ent => {
            // Dormant ambient NPCs don't walk step-by-step off-screen — their
            // schedule-driven position is snapped in updateNpcSchedules
            // instead (no unobserved pathfinding). Skipping them here is what
            // eliminates the "NPC walks all the way home while nobody's
            // watching" cost.
            if (isDormantAmbientNpc(ent, _movePartyHexes)) return;
            if (ent.castCooldown > 0) {
                ent.castCooldown -= scaledDt;
                if (ent.castCooldown <= 0) {
                    ent.castCooldown = 0;
                    if (ent.pendingCast) {
                        const { spell, target, hex } = ent.pendingCast;
                        // Execute the spell
                        window.tryCastSpell(ent, spell, target, hex, true); // true = bypass cooldown
                        ent.pendingCast = null;
                        if (ent.side === 'player' && window.updateActionButtons) window.updateActionButtons();
                    }
                }
                return; // Cannot move while casting
            }

            if (ent.alive && ent.destination && !ent.rider) {
                if (ent.moveCooldown === undefined) ent.moveCooldown = 0;

                ent.moveCooldown -= scaledDt;
                let steppedThisTick = false;
                // Loop to handle overage that might cover multiple hexes
                while (ent.moveCooldown <= 0 && ent.destination) {
                    const overage = Math.abs(ent.moveCooldown);
                    const moved = processRealTimeStep(ent, overage);
                    if (!moved) {
                        ent.moveCooldown = 0;
                        break;
                    }
                    steppedThisTick = true;
                }
                // Attack range/highlighting is otherwise only refreshed on a
                // throttled ~1s timer out of combat, so closing the last hex
                // of distance to an enemy could leave the action bar showing
                // stale "too far to attack" info until the next click.
                if (steppedThisTick && ent.side === 'player' && window.updateActionButtons) {
                    window.updateActionButtons();
                }
            } else {
                ent.moveCooldown = 0;
                ent.moveTotalTime = 0;
            }

            // REAL-TIME AI SCOUTING (host-authoritative in multiplayer)
            if (ent.alive && ent.side === 'enemy' && ent.aiState !== 'combat') {
                if (!window.multiplayer || !window.multiplayer.roomCode || window.multiplayer.isHost) {
                    const targets = window.entities.filter(e => e.alive && e.side === 'player' && e.name !== 'Eagle');
                    const visibleTarget = targets.find(t => canSee(ent, t));
                    if (visibleTarget) { wakeUp(ent); sharedMessage(`${ent.name} spotted ${visibleTarget.name}!`); }
                }
            }
        });

        updateVisualPositions(scaledDt);
        if (window.smoothFollowPlayer) window.smoothFollowPlayer(dt);
        window.drawMap();
        window.renderEntities();
        window.updateTurnIndicator();
    } else {
        // TURN-BASED COMBAT SYSTEM (1x Speed)
        if (window.gamePhase === 'WAITING') {
            runTickInternal(false, true); 
            window.updateTurnIndicator();
        } else {
            runTickInternal();
        }
        // Snap visuals in combat
        updateVisualPositions(100);
        // Non-hosts need explicit redraws; host draws via runTickInternal/finalizePlayerAction
        if (window.multiplayer && window.multiplayer.roomCode && !window.multiplayer.isHost) {
            window.drawMap();
            window.renderEntities();
        }
    }
}

function updateVisualPositions(dt) {
    if (isNaN(dt) || dt <= 0) return;
    window.entities.forEach(e => {
        let targetQ = e.hex.q;
        let targetR = e.hex.r;
        
        if (e.extraHexes && e.extraHexes.length > 0) {
            const uniqueHexes = e.getAllHexes(); 
            let totalQ = 0; let totalR = 0;
            uniqueHexes.forEach(h => { totalQ += h.q; totalR += h.r; });
            targetQ = totalQ / uniqueHexes.length;
            targetR = totalR / uniqueHexes.length;
        }

        // Remote entities aren't driven by processRealTimeStep, so tick their cooldown here
        if (e.isRemote && e.moveCooldown > 0) {
            e.moveCooldown = Math.max(0, e.moveCooldown - dt);
        }

        // If no movement is happening, stay at target
        if (e.moveCooldown === undefined || e.moveCooldown <= 0 || !e.moveTotalTime) {
            e.visualQ = targetQ;
            e.visualR = targetR;
            return;
        }

        // Percentage-based LERP
        const elapsed = e.moveTotalTime - e.moveCooldown;
        const t = Math.min(1.0, Math.max(0, elapsed / e.moveTotalTime));

        // Use cached start position for perfect continuity
        const sQ = e.startQ !== undefined ? e.startQ : targetQ;
        const sR = e.startR !== undefined ? e.startR : targetR;

        e.visualQ = sQ + (targetQ - sQ) * t;
        e.visualR = sR + (targetR - sR) * t;
    });
}

function processRealTimeStep(entity, overage = 0) {
    const moveEntity = entity.riding || entity;
    const dest = entity.destination;
    if (!dest) { entity.moveCooldown = 0; entity.moveTotalTime = 0; return false; }

    // PATH CACHE: recomputing the full A* path every single step, just to
    // read the next hex and throw the rest away, was pure waste (findPath is
    // the single most expensive thing a moving entity does). Instead compute
    // the path once per destination, cache it on the entity, and just follow
    // it hex by hex. Re-path (the "manual" fallback) only when the cache is
    // stale — destination changed, we've drifted off the planned route — or
    // when the next planned hex is now blocked by a hostile / impassable
    // terrain that wasn't there when the path was planned. This is what lets
    // an NPC walk a long route on one A* solve, and only recalculate when it
    // actually bumps into something.
    let fullPath = null;
    let nextHex = null;
    const cacheValid = entity._pathCache
        && entity._pathCacheDest
        && entity._pathCacheDest.q === dest.q && entity._pathCacheDest.r === dest.r
        && entity._pathCache.length > 1
        && entity._pathCache[0].q === entity.hex.q && entity._pathCache[0].r === entity.hex.r;

    if (cacheValid) {
        const candidate = entity._pathCache[1];
        const occ = window.getEntityAtHex(candidate.q, candidate.r);
        const blocked = (occ && occ.side !== entity.side) || window.getTerrainAt(candidate.q, candidate.r).impassable;
        if (!blocked) {
            nextHex = candidate;
            fullPath = entity._pathCache;
        }
        // else: fall through to a fresh solve, which routes around the block.
    }

    if (!nextHex) {
        fullPath = window.findPath(entity.hex, dest, undefined, moveEntity, true, window.leaderPath);
        if (fullPath && fullPath.length > 1) {
            entity._pathCache = fullPath;
            entity._pathCacheDest = { q: dest.q, r: dest.r };
            nextHex = fullPath[1];
        }
    }

    if (fullPath && fullPath.length > 1) {
        // Prevent walking onto occupied hexes (collision) â€” enemies only; friendlies don't block
        const nextOccupant = window.getEntityAtHex(nextHex.q, nextHex.r);
        if (nextOccupant && nextOccupant.side !== entity.side) {
            entity.destination = null;
            entity._pathCache = null;
            entity.moveCooldown = 0;
            entity.moveTotalTime = 0;
            return false;
        }

        const terrain = window.getTerrainAt(nextHex.q, nextHex.r);

        let stepCost = 5 * window.getMoveCostMult(nextHex.q, nextHex.r, moveEntity);
        if (moveEntity.skills?.fastMovement) stepCost -= moveEntity.skills.fastMovement;

        // Set start point to current hex center for lerp
        entity.startQ = entity.hex.q;
        entity.startR = entity.hex.r;

        entity.hex = nextHex;
        spendTP(entity, stepCost);

        // Advance the cached path so its head is again the current hex; if the
        // step we actually took wasn't the cache's next hex, drop the cache so
        // the next step recomputes.
        if (entity._pathCache && entity._pathCache.length > 1
            && entity._pathCache[1].q === nextHex.q && entity._pathCache[1].r === nextHex.r) {
            entity._pathCache.shift();
        } else {
            entity._pathCache = null;
        }

        const duration = (stepCost / moveEntity.timePointsPerTick) * 0.4;
        entity.moveTotalTime = duration;
        entity.moveCooldown = Math.max(0, duration - overage);

        // The mount is a separate entity in window.entities and updateVisualPositions
        // interpolates each entity independently off its OWN startQ/startR/
        // moveTotalTime/moveCooldown — without copying those over, the mount's hex
        // snapped straight to the new tile every step (no lerp fields ever set)
        // while the rider eased into it, reading as the horse jumping ahead.
        if (entity.riding) {
            entity.riding.startQ = entity.startQ;
            entity.riding.startR = entity.startR;
            entity.riding.hex = { q: nextHex.q, r: nextHex.r };
            entity.riding.moveTotalTime = duration;
            entity.riding.moveCooldown = entity.moveCooldown;
        }

        // MULTIPLAYER SYNC: Broadcast each step with lerp data so remotes animate smoothly
        if (window.multiplayer && window.multiplayer.roomCode && entity.networkId === window.multiplayer.socket.id) {
            window.multiplayer.socket.emit('move', {
                roomCode: window.multiplayer.roomCode,
                hex: entity.hex,
                destination: entity.destination,
                moveTotalTime: duration,
                fromQ: entity.startQ,
                fromR: entity.startR,
            });
        }
        return true;
    } else {
        entity.destination = null;
        entity._pathCache = null;
        entity.moveCooldown = 0;
        entity.moveTotalTime = 0;
        return false;
    }
}

function runTickInternal(isSleepCycle = false, skipUI = false, tickMultiplier = 1.0) {
    if (window.multiplayer && window.multiplayer.roomCode && !window.multiplayer.isHost) {
        return;
    }
    if (window.currentTurnEntity && !isSleepCycle) return;

    // Only scan for whose turn it is when actually in combat — out of combat
    // this full-array filter ran every frame for nothing.
    const readyEntities = (window.isInCombat && !isSleepCycle)
        ? window.entities.filter(e => e.timePoints >= 100 && e.alive && !e.unconscious && !e.rider)
        : [];

    // Only trigger turn-based logic if in combat
    if (window.isInCombat && readyEntities.length > 0 && !isSleepCycle) {
        readyEntities.sort((a, b) => (b.timePoints !== a.timePoints) ? (b.timePoints - a.timePoints) : (Math.random() - 0.5));
        window.currentTurnEntity = readyEntities[0];
        window.currentTurnEntity.parriesRemaining = 3;
        takeTurn(window.currentTurnEntity);
    } else {
        // Both per-entity spell-effect scans below (mySpells by casterName,
        // silenceEffects by targetEntityId) filter the *entire*
        // window.activeSpells array once per entity, every tick — with
        // window.entities now well over 100 persistent world NPCs (soldiers,
        // shopkeepers, guards...) that's an O(entities x activeSpells) cost
        // paid every frame even though activeSpells is empty the vast
        // majority of the time (no one has an ongoing spell running).
        // Skipping both scans up front when there's nothing active at all
        // is a pure perf win with no behavior change (filtering an empty
        // array always produced the same "nothing to do" result anyway).
        const hasActiveSpells = !!(window.activeSpells && window.activeSpells.length > 0);
        // Dormant ambient NPCs (far from every party member) are in
        // superposition — skipped entirely here. Their TP/regen bookkeeping
        // is meaningless off-screen (out of combat, capped TP, no poison/
        // spells) and resumes the moment they re-enter the active radius.
        const _partyHexes = collectPartyHexes();
        // In combat (or during sleep fast-forward) every combatant needs TP
        // granted / effects ticked, so iterate all (combat is small and near
        // the player). Out of combat, only entities not at full rest need
        // anything — iterate the small restless set instead of all ~80+
        // world entities, so a full-health, unpoisoned capital costs nothing.
        const workingSet = (window.isInCombat || isSleepCycle)
            ? window.entities
            : (window._restlessEntities || rebuildRestlessSet());
        workingSet.forEach(e => {
            if (e.alive) {
                if (isDormantAmbientNpc(e, _partyHexes)) return;
                // ... rest of the ticking logic ...
                // PASSIVE AI: Don't gain TP if idle enemy
                if (e.side === 'enemy' && e.aiState === 'idle') return;

                // Computed here (not just inside the TP-cap check below) since
                // the silence-penalty damage further down also scales by it —
                // that block runs regardless of the TP cap and previously
                // referenced this same variable out of scope, throwing a
                // ReferenceError whenever a fully-TP-capped entity was
                // silenced (a pre-existing bug, found while investigating
                // performance here — TP still shouldn't accrue past the cap,
                // so e.timePoints += tpGained stays inside the gate below).
                let tpGained = e.timePointsPerTick * tickMultiplier;
                if (e.flyCheat) tpGained += 10 * tickMultiplier;

                if (e.timePoints < 150) {
                    e.timePoints += tpGained;

                    // POISON TICK
                    if (e.poisonTicks > 0) {
                        const poisonAmount = (e.poisonDamage || 2) * tickMultiplier;
                        e.hp -= poisonAmount;
                        e.poisonTicks -= tickMultiplier;
                        if (e.hp <= 0 && e.alive) {
                            e.alive = false;
                            sharedMessage(`${e.name} died from poison!`);
                            checkCombatEnd();
                        }
                    }

                    // LICH: Withering Touch tick (same shape as poison)
                    if (e.witherTicks > 0) {
                        const witherAmount = (e.witherDamage || 1) * tickMultiplier;
                        e.hp -= witherAmount;
                        e.witherTicks -= tickMultiplier;
                        syncBackToPlayer(e);
                        if (e.hp <= 0 && e.alive) {
                            const witherer = window.entities.find(en => en.witheringTouchStacks && en.side !== e.side) || e;
                            handleLethalDamage(e, witherer);
                        }
                    }

                    // Mana Regeneration
                    let regen = 0.1;
                    if (e.skills?.arcane_regen) regen += e.skills.arcane_regen * 0.1;
                    if (e.skills?.divine_regen) regen += e.skills.divine_regen * 0.1;
                    if (e.skills?.nature_regen) regen += e.skills.nature_regen * 0.1;
                    
                    e.currentMana = Math.min(e.maxMana || 0, (e.currentMana || 0) + (regen * tpGained));

                    // Health Regeneration
                    let hRegen = 0.1;
                    if (e.skills?.health_regen) hRegen += e.skills.health_regen * 0.1;
                    if (e.side === 'player') {
                        e.hp = Math.min(e.maxHp, e.hp + (hRegen * tpGained));
                    }

                    // Ongoing Spell Costs (2.5% of core mana cost per TP gained)
                    const mySpells = hasActiveSpells ? window.activeSpells.filter(s => s.casterName === e.name) : [];
                    if (mySpells.length > 0) {
                        mySpells.sort((a, b) => b.coreManaCost - a.coreManaCost);
                        
                        for (const s of mySpells) {
                            if (e.currentMana <= 0) {
                                window.showMessage(`Spell ${s.name} on ${e.name} faded due to lack of mana.`);
                                window.cancelSpell(s.spellInstanceId);
                                break;
                            }
                            
                            const cost = s.coreManaCost * 0.025 * tpGained;
                            e.currentMana -= cost;
                            if (e.currentMana <= 0) {
                                e.currentMana = 0;
                                window.showMessage(`Spell ${s.name} on ${e.name} faded due to lack of mana.`);
                                window.cancelSpell(s.spellInstanceId);
                                break; 
                            }
                        }
                    }

                    // REST INTERRUPT: Net negative mana
                    const totalUpkeep = mySpells.reduce((acc, s) => acc + (s.coreManaCost * 0.025), 0);
                    if (window.isResting && e.side === 'player' && (totalUpkeep > regen * tpGained) && e.currentMana < e.maxMana * 0.1) {
                        window.isResting = false;
                        window.showMessage("Rest stopped: maintenance costs too high.");
                        window.updateRestButton();
                    }
                }
                
                if (e.skills['regeneration'] && Math.random() < (0.2 * tickMultiplier)) {
                    e.hp = Math.min(e.maxHp, e.hp + 1);
                }

                // TRIGGER SPELL PENALTIES (Ongoing Divine Silence)
                if (hasActiveSpells) {
                    const silenceEffects = window.activeSpells.filter(s => s.debuffType === 'silence_penalty' && s.targetEntityId === e.id);
                    silenceEffects.forEach(s => {
                        const dmg = (s.magnitude || 6) * 0.05 * tpGained; // Scaled damage
                        e.hp -= dmg;
                        if (e.hp <= 0 && e.alive) { e.alive = false; window.showMessage(`${e.name} succumbed to divine silence!`); checkCombatEnd(); }
                    });
                }
            }
        });
        if (window.updateTime && !window.isInCombat) {
            // Already handled in main tick loop for real-time
        } else if (window.updateTime) {
            window.updateTime(0.4 * tickMultiplier);
        }

        // AMBIENT DIALOGUE (Arena Lobby)
        if (window.currentCampaign === "1" && !window.isInArena && !window.isInCombat) {
            window.lobbyTPSpent = (window.lobbyTPSpent || 0) + tickMultiplier;
            if (window.lobbyTPSpent > 250 && !window.hasTriggeredImpatience) {
                window.triggerAmbientDialogue('arena_lobby_1');
                window.hasTriggeredImpatience = true;
            }
        }
    }
    if (!skipUI) window.updateTurnIndicator();
}

function takeTurn(entity) {
    entity.reactionBlocked = false; // Reset reaction block
    entity.parriesRemaining = 3;
    entity.sidestepsRemaining = 3;
    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];

    // DISCONNECTED: player is offline — hold their turn until host acts
    if (entity.disconnected) {
        window.gamePhase = 'PLAYER_TURN';
        window.updateTurnIndicator();
        if (window.broadcastFullState) window.broadcastFullState();
        return; // Don't spend TP — game waits indefinitely here
    }

    // PETRIFIED: entity is frozen — burn all remaining TP and skip turn
    if (entity.petrifiedTicks > 0) {
        sharedMessage(`${entity.name} is petrified and cannot act! (${Math.ceil(entity.petrifiedTicks)} TP remaining)`);
        spendTP(entity, entity.timePoints - threshold);
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        window.updateTurnIndicator();
        if (window.broadcastFullState) window.broadcastFullState();
        return;
    }

    // CHARMED: entity must spend this turn stumbling toward the charming harpy
    if (entity.charmedByHarpy && entity.charmedByHarpy.alive) {
        const charmer = entity.charmedByHarpy;
        sharedMessage(`${entity.name} is entranced by the Harpy's song and stumbles toward it!`);
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        const best = neighbors
            .filter(h => !window.getTerrainAt(h.q, h.r)?.name?.match(/Wall/) && !getEntityAtHex(h.q, h.r))
            .sort((a, b) => window.distance(a, charmer.hex) - window.distance(b, charmer.hex))[0];
        if (best) entity.hex = best;
        entity.charmedByHarpy = null; // charm lasts one full turn
        spendTP(entity, entity.timePoints - threshold);
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        window.updateTurnIndicator();
        if (window.broadcastFullState) window.broadcastFullState();
        return;
    }

    const isSentientAlly = entity.side === 'player' && !entity.aiControlled && !['Wolf', 'Horse', 'Boar', 'Tiger', 'Eagle'].includes(entity.name);
    if (entity.side === 'player') {
        window.gamePhase = isSentientAlly ? 'PLAYER_TURN' : 'AI_TURN';
        if (isSentientAlly) {
            if (window.isInCombat) sharedMessage(`It is ${entity.name}'s turn!`);
            window.selectCharacterByName(entity.name);
            // RE-CALC HIGHLIGHTS IMMEDIATELY
            window.updateActionButtons(); 
        }

        // AUTO-MOVE LOGIC
        if (entity.destination) {
            autoMoveProcess(entity);
            return;
        }

        if (!isSentientAlly) {
            aiProcess(entity);
        }
    } else {
        window.gamePhase = 'AI_TURN';
        aiProcess(entity);
    }
    window.updateTurnIndicator();
    if (window.broadcastFullState) window.broadcastFullState();
}

// Shared door/signpost/journal/harvest dispatch — called both for an
// immediate adjacent click (handleClick) and once the player arrives at a
// tile object they clicked on from farther away (see pendingInteractHex).
function interactWithTileObject(q, r, player) {
    const doorObj = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (!doorObj) return;
    if (doorObj.type === 'door_open' || doorObj.type === 'door_closed') {
        if (window.toggleDoor) window.toggleDoor(q, r, player);
        return;
    }
    if (doorObj.type === 'signpost') {
        if (window.readSignpost) window.readSignpost();
        return;
    }
    if (doorObj.type === 'journal') {
        if (doorObj.readId === 'goblin_scout_note' && window.readGoblinScoutNote) { window.readGoblinScoutNote(); return; }
        if (doorObj.readId === 'emberlode_ledger' && window.readEmberlodeLedger) { window.readEmberlodeLedger(); return; }
        if (doorObj.readId === 'phylactery_altar' && window.interactPhylacteryAltar) { window.interactPhylacteryAltar(); return; }
        if (doorObj.readId === 'disciple_note' && window.readDiscipleNote) { window.readDiscipleNote(); return; }
        if (doorObj.readId === 'wizard_tower_tome' && window.readWizardTowerTome) { window.readWizardTowerTome(); return; }
        if (doorObj.readId === 'wizard_corruption_ledger' && window.readWizardCorruptionLedger) { window.readWizardCorruptionLedger(); return; }
        if (doorObj.readId === 'vampire_grave' && window.readVampireGrave) { window.readVampireGrave(); return; }
        if (window.readAbandonedHouseJournal) window.readAbandonedHouseJournal();
        return;
    }
    if (doorObj.type === 'building_plot' && window.buildPlayerCottage) { window.buildPlayerCottage(q, r); return; }
    if (doorObj.type === 'player_bed' && window.restAtHome) { window.restAtHome(); return; }
    if (doorObj.type === 'ore_node' && window.harvestOreNode) { window.harvestOreNode(q, r); return; }
    if (doorObj.type === 'timber_tree' && window.harvestTimberTree) { window.harvestTimberTree(q, r); return; }
    if (doorObj.type === 'stone_deposit' && window.harvestStoneDeposit) { window.harvestStoneDeposit(q, r); return; }
    if (doorObj.type === 'fruit_tree' && window.harvestFruitTree) { window.harvestFruitTree(q, r); return; }
    if (doorObj.type === 'herb_patch' && window.harvestHerbPatch) { window.harvestHerbPatch(q, r); return; }
    if (doorObj.type === 'fishing_spot' && window.harvestFishingSpot) { window.harvestFishingSpot(q, r); return; }
    if (doorObj.type === 'corpse' && window.harvestCorpse) { window.harvestCorpse(q, r); return; }
    if (doorObj.type === 'evidence' && window.searchEvidence) { window.searchEvidence(q, r); return; }
}
window.interactWithTileObject = interactWithTileObject;

// Fires once autoMoveProcess clears a player's destination — if they were
// walking toward a tile object clicked from out of interact range, interact
// with it now that they've arrived instead of leaving them standing on it.
function checkPendingInteractArrival(entity) {
    if (!window.pendingInteractHex || entity.side !== 'player') return;
    const target = window.pendingInteractHex;
    if (window.distance(entity.hex, target) <= 1) {
        window.pendingInteractHex = null;
        interactWithTileObject(target.q, target.r, entity);
    }
}

function autoMoveProcess(entity) {
    if (window.isPausedForReaction) {
        setTimeout(() => autoMoveProcess(entity), 20);
        return;
    }
    // Briefly freezes movement after a real-time equipment change (see
    // ui.js's applyEquipLock) — swapping armor mid-stride should cost you
    // some time, not be instantaneous.
    if (entity.actionLockedUntil && performance.now() < entity.actionLockedUntil) {
        setTimeout(() => autoMoveProcess(entity), 50);
        return;
    }

    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];

    // In combat, we must have TP. Out of combat, we just need a destination.
    const hasTP = Math.floor(entity.timePoints) > threshold;
    if (window.isInCombat && (!hasTP || !entity.alive || !entity.destination)) {
        finalizePlayerAction(entity, true);
        return;
    }
    if (!window.isInCombat && (!entity.alive || !entity.destination)) {
        finalizePlayerAction(entity, true);
        return;
    }

    // COMBAT INTERRUPT
    const enemies = window.entities.filter(e => e.alive && e.side === 'enemy');
    const seenEnemy = enemies.find(e => {
        const d = window.distance(entity.hex, e.hex);
        const visionCap = 30 + (entity.visionBonus || 0);
        return d <= visionCap && window.hasLineOfSight(entity.hex, e.hex);
    });
    
    if (seenEnemy && !window.isInCombat) {
        sharedMessage(`Enemy ${seenEnemy.name} spotted! Engaging combat.`);
        entity.destination = null;
        if (seenEnemy.aiState === 'idle') wakeUp(seenEnemy);
        finalizePlayerAction(entity, true);
        return;
    }

    if (entity.hex.q === entity.destination.q && entity.hex.r === entity.destination.r) {
        entity.destination = null;
        checkPendingInteractArrival(entity);
        finalizePlayerAction(entity, true);
        return;
    }

    const moveEntity = entity.riding || entity;
    const fullPath = window.findPath(entity.hex, entity.destination, undefined, moveEntity, true, window.leaderPath);
    
    if (fullPath && fullPath.length > 1) {
        const nextHex = fullPath[1];

        // Prevent walking onto occupied hexes (collision) â€” enemies only; friendlies don't block
        const nextOccupant = window.getEntityAtHex(nextHex.q, nextHex.r);
        if (nextOccupant && nextOccupant.side !== entity.side) {
            entity.destination = null;
            entity.moveCooldown = 0;
            entity.moveTotalTime = 0;
            return false;
        }

        const terrain = window.getTerrainAt(nextHex.q, nextHex.r);
        let stepCost = 5 * window.getMoveCostMult(nextHex.q, nextHex.r, moveEntity);
        if (moveEntity.skills['fastMovement']) stepCost -= 1;

        entity.startQ = entity.hex.q;
        entity.startR = entity.hex.r;
        entity.hex = nextHex;
        if (entity.riding) entity.riding.hex = { q: nextHex.q, r: nextHex.r };
        spendTP(entity, stepCost);

        // delay based on speed (3x Speed: divide baseWait by 3)
        const baseWait = (stepCost / moveEntity.timePointsPerTick) * 400;
        const waitTime = window.isInCombat ? 20 : (baseWait / 3.0);

        // MULTIPLAYER SYNC: Broadcast each step with lerp data so remotes animate smoothly
        if (window.multiplayer && window.multiplayer.roomCode && entity.networkId === window.multiplayer.socket.id) {
            const moveDuration = (stepCost / moveEntity.timePointsPerTick) * 0.4;
            window.multiplayer.socket.emit('move', {
                roomCode: window.multiplayer.roomCode,
                hex: entity.hex,
                destination: entity.destination,
                moveTotalTime: moveDuration,
                fromQ: entity.startQ,
                fromR: entity.startR,
            });
        }

        if (entity.hex.q === entity.destination.q && entity.hex.r === entity.destination.r) {
            entity.destination = null;
            checkPendingInteractArrival(entity);
        }

        // Same reasoning as the out-of-combat real-time step above — without
        // this, closing distance on a target mid-turn could leave attack
        // range/highlighting stale until the next click.
        if (entity.side === 'player' && window.updateActionButtons) window.updateActionButtons();

        setTimeout(() => autoMoveProcess(entity), waitTime);
        } else {        if (window.distance(entity.hex, entity.destination) > 0) {
            window.showMessage(`${entity.name} path to destination is blocked.`);
            entity.destination = null;
        }
        finalizePlayerAction(entity, true);
    }
}

// Picks the neighbor of `fromHex` that's closest to `toHex` — one step along
// a straight line, reused by stalking predators and patrol/camp routines so
// they walk toward a point instead of only ever random-wandering.
// A fence is a tileObject decoration (fence_h/fence_v), not its own terrain
// type, so plain terrain.moveCostMult lookups never noticed it — climbing
// over one should cost extra regardless of the ground terrain underneath.
// The three climbing skills (one each in strength/agility/monk) stack: each
// present skill knocks 20% off the TP surcharge for climbRisk terrain (a
// floor of 40% remaining with all three — still not instant) and, in
// combat, 10 percentage points off the fall chance (see the climbRisk roll
// in playerMove below).
const CLIMBING_SKILLS = ['agile_climber', 'sure_footed', 'iron_grip'];
function countClimbingSkills(entity) {
    if (!entity?.skills) return 0;
    return CLIMBING_SKILLS.filter(k => entity.skills[k]).length;
}
window.countClimbingSkills = countClimbingSkills;
function getClimbCostMult(entity) {
    return Math.max(0.4, 1 - 0.2 * countClimbingSkills(entity));
}
window.getClimbCostMult = getClimbCostMult;

function getMoveCostMult(q, r, entity) {
    const terrain = window.getTerrainAt(q, r);
    let mult = terrain.moveCostMult || 1;
    if (terrain.climbRisk) {
        mult = 1 + (terrain.moveCostMult - 1) * getClimbCostMult(entity);
    }
    const obj = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (obj && (obj.type === 'fence_h' || obj.type === 'fence_v')) {
        mult *= 1.6;
    }
    // A palisade wall is meant to actually stop most people — but a ladder
    // propped against it, or real climbing skill, makes it a real (if
    // still slow) way over instead of requiring the fully-impassable 'Wall'
    // terrain the palace's actual room walls use.
    if (terrain.name === 'Palisade Wall') {
        // A ladder only bridges the one edge it's actually propped across
        // (the wall hex <-> its interior-side neighbor) — stepping onto the
        // wall hex from the exterior side, or along the wall ring itself,
        // gets no benefit from it.
        const hasLadder = obj && obj.type === 'ladder' && entity?.hex && obj.interiorHex &&
            entity.hex.q === obj.interiorHex.q && entity.hex.r === obj.interiorHex.r;
        const canClimb = entity?.skills?.agile_climber;
        mult = (hasLadder || canClimb) ? 2 : terrain.moveCostMult;
    }
    return mult;
}
window.getMoveCostMult = getMoveCostMult;

// Shared "can an idle-AI entity step here" check — unoccupied and not
// Water/Wall. Used by wander/patrol/campRoutine/stalking movement so none of
// them walk through walls now that the arena generates real ones.
function isOpenHex(h) {
    if (getEntityAtHex(h.q, h.r)) return false;
    const terrain = window.getTerrainAt(h.q, h.r);
    return terrain.name !== 'Water' && !terrain.impassable;
}
window.isOpenHex = isOpenHex;

function stepToward(fromHex, toHex) {
    const d = window.distance(fromHex, toHex);
    if (d === 0) return null;
    const lerped = window.hexLerp(fromHex, toHex, 1 / d);
    return window.hexRound(lerped.q, lerped.r);
}
window.stepToward = stepToward;

// Dispatches non-combat, no-visible-target idle movement by behaviorType.
// Anything without a recognized behaviorType (or explicitly 'wander') keeps
// the original pure-random wander. 'stationary' never moves on its own.
// 'patrol' walks a fixed loop of hexes. 'campRoutine' mostly stays near its
// spawn point but occasionally wanders off to a designated spot (fire, food,
// bedroll) and lingers there a while before returning to duty.
function behaviorTick(entity) {
    if (!entity.homeHex) entity.homeHex = { ...entity.hex };

    if (entity.behaviorType === 'stationary') {
        spendTP(entity, 10);
        return;
    }

    if (entity.behaviorType === 'patrol' && entity.patrolPath && entity.patrolPath.length > 0) {
        if (entity.patrolIndex === undefined) entity.patrolIndex = 0;
        const target = entity.patrolPath[entity.patrolIndex];
        if (entity.hex.q === target.q && entity.hex.r === target.r) {
            entity.patrolIndex = (entity.patrolIndex + 1) % entity.patrolPath.length;
        } else {
            const next = stepToward(entity.hex, target);
            if (next && isOpenHex(next)) {
                entity.hex = next;
            }
        }
        spendTP(entity, 10);
        return;
    }

    if (entity.behaviorType === 'campRoutine') {
        if (entity.campBusyTicks > 0) {
            entity.campBusyTicks--;
            spendTP(entity, 10);
            return;
        }
        if (entity.campDestination) {
            if (entity.hex.q === entity.campDestination.q && entity.hex.r === entity.campDestination.r) {
                entity.campBusyTicks = 3 + Math.floor(Math.random() * 5); // linger at the fire/food/bedroll
                entity.campDestination = null;
            } else {
                const next = stepToward(entity.hex, entity.campDestination);
                if (next && isOpenHex(next)) {
                    entity.hex = next;
                }
            }
            spendTP(entity, 10);
            return;
        }
        // Mostly on duty near homeHex; occasionally wander off to a camp spot.
        if (entity.campSpots && entity.campSpots.length > 0 && Math.random() < 0.15) {
            entity.campDestination = entity.campSpots[Math.floor(Math.random() * entity.campSpots.length)];
            spendTP(entity, 10);
            return;
        }
        if (window.distance(entity.hex, entity.homeHex) > 2) {
            const next = stepToward(entity.hex, entity.homeHex);
            if (next && isOpenHex(next)) {
                entity.hex = next;
            }
            spendTP(entity, 10);
            return;
        }
        if (Math.random() < 0.3) {
            const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
            const valid = neighbors.filter(isOpenHex);
            if (valid.length > 0) entity.hex = valid[Math.floor(Math.random() * valid.length)];
        }
        spendTP(entity, 10);
        return;
    }

    // 'stalk': follows a lagged breadcrumb of the player's own past positions
    // (entity.stalkTargetHex, kept updated from outside — see
    // espionageQuests.js's checkGuildAssassinTail) rather than beelining at
    // their current hex, so a tailing NPC reads as "walking your own recent
    // route a little behind you" instead of a straight-line chase.
    if (entity.behaviorType === 'stalk') {
        const target = entity.stalkTargetHex;
        if (target && (entity.hex.q !== target.q || entity.hex.r !== target.r)) {
            const next = stepToward(entity.hex, target);
            if (next && isOpenHex(next)) entity.hex = next;
        }
        spendTP(entity, 10);
        return;
    }

    // Default: pure random wander (original behavior).
    if (Math.random() < 0.3) {
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        const valid = neighbors.filter(isOpenHex);
        if (valid.length > 0) {
            entity.hex = valid[Math.floor(Math.random() * valid.length)];
        }
    }
    spendTP(entity, 10);
}
window.behaviorTick = behaviorTick;

function aiProcess(entity) {
    // If another entity's turn started while this AI was mid-chain (stale timeout), abort.
    if (window.currentTurnEntity && window.currentTurnEntity !== entity) return;

    if (window.isPausedForReaction) {
        setTimeout(() => aiProcess(entity), 20);
        return;
    }
    if (entity.side === 'neutral') {
        // Neutral NPCs with a behaviorType (e.g. camp guards) still putter
        // around their post even though they're not a combat threat; plain
        // neutrals (shopkeepers, quest-givers) keep the old no-op turn.
        if (entity.behaviorType && entity.behaviorType !== 'wander' && entity.timePoints >= 10) {
            window.behaviorTick(entity);
        } else {
            entity.timePoints = 0;
        }
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        return;
    }

    // SIEGE ENGINE: never targets/engages the player like a normal 'enemy'
    // (it's an objective, not a combatant — see monsters.js's siege_engine
    // template) — its only action is chipping away at the nearest
    // Keep Wall hex within range, via damageWall rather than tryAttack,
    // since a wall has no hp/dodge/passiveDodge shape to resolve an attack
    // roll against.
    if (entity.isSiegeEngine) {
        if (entity.timePoints >= 15) {
            const range = 3;
            let targetWall = null;
            for (let dq = -range; dq <= range && !targetWall; dq++) {
                for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range) && !targetWall; dr++) {
                    const h = { q: entity.hex.q + dq, r: entity.hex.r + dr };
                    if (window.getTerrainAt(h.q, h.r).name === 'Keep Wall' && window.distance(entity.hex, h) <= range) targetWall = h;
                }
            }
            if (targetWall) {
                window.damageWall(targetWall.q, targetWall.r, 3);
                spendTP(entity, 15);
                window.currentTurnEntity = null;
                window.gamePhase = 'WAITING';
                return;
            }
        }
        entity.timePoints = 0;
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        return;
    }

    // BASILISK PETRIFYING GAZE (once per combat, costs 10 TP)
    if (entity.skills?.petrify_gaze && !entity.hasUsedGaze && entity.timePoints >= 10) {
        const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
        const targets = window.entities.filter(e =>
            e.alive && e.side === opponentSide &&
            !e.petrifiedTicks &&
            window.distance(entity.hex, e.hex) <= 8 &&
            window.hasLineOfSight(entity.hex, e.hex)
        );
        if (targets.length > 0) {
            targets.sort((a, b) => window.distance(entity.hex, a.hex) - window.distance(entity.hex, b.hex));
            const target = targets[0];
            sharedMessage(`${entity.name} fixes its gaze on ${target.name}! ${target.name} is petrified!`);
            target.petrifiedTicks = 30;
            entity.hasUsedGaze = true;
            spendTP(entity, 10);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // HARPY SIREN SONG (once per combat, costs 8 TP, affects all nearby players)
    if (entity.skills?.siren_song && !entity.hasUsedSong && entity.timePoints >= 8) {
        const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
        const charmed = window.entities.filter(e =>
            e.alive && e.side === opponentSide &&
            window.distance(entity.hex, e.hex) <= 8
        );
        if (charmed.length > 0) {
            sharedMessage(`${entity.name} unleashes an enchanting song! ${charmed.map(c => c.name).join(', ')} ${charmed.length > 1 ? 'are' : 'is'} entranced!`);
            charmed.forEach(c => { c.charmedByHarpy = entity; });
            entity.hasUsedSong = true;
            spendTP(entity, 8);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // SPIDER WEB FLING PRIORITY
    if (entity.name === 'Spider' && !entity.hasUsedWeb && entity.timePoints >= 5) {
        const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
        const targets = window.entities.filter(e => e.alive && e.side === opponentSide && !e.webbedDuration && window.distance(entity.hex, e.hex) <= 10 && window.hasLineOfSight(entity.hex, e.hex));
        if (targets.length > 0) {
            targets.sort((a, b) => window.distance(entity.hex, a.hex) - window.distance(entity.hex, b.hex));
            const target = targets[0];
            window.showMessage(`${entity.name} flings a web at ${target.name}!`);
            target.webbedDuration = 40; // TP to spend
            entity.hasUsedWeb = true;
            spendTP(entity, 5);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    let threshold = 80;
    if (entity.skills && entity.skills['quickRecovery']) threshold -= entity.skills['quickRecovery'];
    if (Math.floor(entity.timePoints) <= threshold || !entity.alive) {
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        window.drawMap();
        window.renderEntities();
        return;
    }

    // AI RE-ARMING PRIORITY
    if (entity.equipped && !entity.equipped.weapon && entity.timePoints >= 5) {
        const coord = `${entity.hex.q},${entity.hex.r}`;
        const itemsInHex = window.mapItems[coord] || [];
        const weaponInHex = itemsInHex.find(iid => window.items[iid].type === 'weapon');
        if (weaponInHex) {
            window.showMessage(`${entity.name} picks up and equips ${window.items[weaponInHex].name}.`);
            entity.equipped.weapon = weaponInHex;
            itemsInHex.splice(itemsInHex.indexOf(weaponInHex), 1);
            if (itemsInHex.length === 0) delete window.mapItems[coord];
            spendTP(entity, 5);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
        // No weapon in hex, check inventory
        if (entity.inventory && entity.inventory.length > 0) {
            const weaponInInv = entity.inventory.find(iid => window.items[iid].type === 'weapon');
            if (weaponInInv) {
                window.showMessage(`${entity.name} draws a ${window.items[weaponInInv].name} from their pack.`);
                entity.equipped.weapon = weaponInInv;
                entity.inventory.splice(entity.inventory.indexOf(weaponInInv), 1);
                spendTP(entity, 5);
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    // AI STATE LOGIC
    if (entity.side === 'enemy' && entity.aiState !== 'combat') {
        // Idle behavior: Check for enemies
        const targets = window.entities.filter(e => e.alive && e.side === 'player');

        // Non-aggro on Eagle
        const visibleTarget = targets.find(t => canSee(entity, t) && t.name !== 'Eagle');

        // Stalking: a keen-scent hunter (e.g. a wolf) that spots the player from
        // beyond melee range creeps closer over several turns instead of
        // aggroing instantly. Anything without keen_scent skips straight to
        // the old instant-engage behavior.
        if (visibleTarget && entity.skills?.keen_scent && window.distance(entity.hex, visibleTarget.hex) > 3) {
            if (entity.aiState !== 'stalking') {
                entity.aiState = 'stalking';
                sharedMessage(`${entity.name} catches your scent and creeps closer...`);
            }
            const next = window.stepToward(entity.hex, visibleTarget.hex);
            if (next && isOpenHex(next)) {
                entity.hex = next;
            }
            spendTP(entity, 10);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }

        if (visibleTarget) {
            entity.aiState = 'idle';
            wakeUp(entity);
            sharedMessage(`${entity.name} spotted a target and engages!`);

            // DIALOGUE: Enemy sees player
            if (entity.voice) {
                const now = Date.now();
                if (!window.lastEnemySeenDialogueTime || (now - window.lastEnemySeenDialogueTime > 10000)) {
                    if (window.playDialogue) {
                        window.playDialogue(`${entity.voice}_enemy_seen`);
                        window.lastEnemySeenDialogueTime = now;
                    }
                }
            }
        } else {
            entity.aiState = 'idle';
            window.behaviorTick(entity);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // Eagle Scouting AI
    if (entity.name === 'Eagle' && entity.side === 'player') {
        entity.isFlying = true; // Always flying
        
        // Find best scouting target
        // 1. Lost enemies (previously seen but not current)
        const enemies = window.entities.filter(e => e.side === 'enemy' && e.alive);
        const lostEnemy = enemies.find(e => e.hasBeenSeenByPlayer && !window.isVisibleToPlayer(e.hex));
        
        let scoutTarget = null;
        if (lostEnemy) {
            scoutTarget = lostEnemy.hex;
        } else {
            // 2. Unexplored/Fog near summoner
            const summoner = window.entities.find(ent => ent.name === entity.summoner);
            if (summoner) {
                const searchRange = 35;
                const localHexes = window.getHexesInRange(summoner.hex, searchRange);
                const fogHexes = localHexes.filter(h => !window.isVisibleToPlayer(h));
                if (fogHexes.length > 0) {
                    // Prioritize oldest seen or never seen
                    fogHexes.sort((a, b) => {
                        const ta = window.lastSeenTimeMap?.[`${a.q},${a.r}`] || 0;
                        const tb = window.lastSeenTimeMap?.[`${b.q},${b.r}`] || 0;
                        return ta - tb;
                    });
                    scoutTarget = fogHexes[0];
                }
            }

            if (!scoutTarget) {
                // 3. Fallback: Oldest seen or never seen tiles within 20 hexes of current position
                const range = 20;
                const candidates = window.getHexesInRange(entity.hex, range);
                candidates.sort((a, b) => {
                    const ta = window.lastSeenTimeMap?.[`${a.q},${a.r}`] || 0;
                    const tb = window.lastSeenTimeMap?.[`${b.q},${b.r}`] || 0;
                    return ta - tb; // Prioritize lower (older) time
                });
                scoutTarget = candidates[0];
            }
        }

        if (scoutTarget) {
            const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
            const bestHex = neighbors.sort((a,b) => window.distance(a, scoutTarget) - window.distance(b, scoutTarget))[0];
            const terrain = window.getTerrainAt(bestHex.q, bestHex.r);
            if (!getEntityAtHex(bestHex.q, bestHex.r)) {
                entity.hex = bestHex;
                spendTP(entity, 5 * window.getMoveCostMult(bestHex.q, bestHex.r, entity));
            } else {
                spendTP(entity, 5);
            }
        } else {
            spendTP(entity, 10);
        }
        setTimeout(() => aiProcess(entity), 20);
        return;
    }

    // Combat Logic
    const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
    // LICH: Command the Dead - undead never treat a commandsUndead player-side
    // entity as an opponent (recognizes a kindred will instead of fighting it).
    const opponents = window.entities.filter(e => e.alive && e.side === opponentSide &&
        !(entity.tags?.includes('undead') && e.commandsUndead));
    const visibleOpponents = opponents.filter(t => canSee(entity, t));

    // Filter attackable targets based on flying
    const weaponSlot = 'weapon';
    const weapon = entity.equipped?.[weaponSlot] ? window.items[entity.equipped[weaponSlot]] : null;
    const isRanged = weapon?.subType === 'ranged';
    const attackableOpponents = visibleOpponents.filter(o => {
        const bothFlying = entity.isFlying && o.isFlying;
        const eitherFlying = entity.isFlying || o.isFlying;
        return isRanged || !eitherFlying || bothFlying;
    });

    // BOSS AI: STEALTH PRIORITY (Viper / Rogues)
    if (entity.skills?.stealth_rogue && !entity.isStealthed && entity.timePoints >= 5) {
        // Use the same canSee check tryStealth uses internally so there is no mismatch
        const isSeen = opponents.some(o => canSee(o, entity));
        if (!isSeen) {
            if (window.tryStealth(entity)) {
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    // BOSS AI: HEALING PRIORITY (Alistair / Clerics)
    if (entity.skills?.learn_heal && entity.hp < entity.maxHp * 0.6 && entity.timePoints >= 10 && entity.currentMana >= 10) {
        const healSpell = entity.createdSpells?.find(s => s.baseId === 'heal');
        if (healSpell) {
            window.showMessage(`${entity.name} prays for healing!`);
            tryCastSpell(entity, healSpell, entity, entity.hex);
            spendTP(entity, 10);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // BOSS AI: SUMMONING PRIORITY (Sylvara / Beastmasters)
    if (entity.skills?.learn_summon_animal && !entity.animalCompanion && entity.timePoints >= 10 && entity.currentMana >= 25) {
        const summonSpell = entity.createdSpells?.find(s => s.baseId === 'summon_animal');
        if (summonSpell) {
            // Find empty adjacent hex
            const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
            const spawnHex = neighbors.find(h => !getEntityAtHex(h.q, h.r) && window.getTerrainAt(h.q, h.r).name !== 'Wall' && window.getTerrainAt(h.q, h.r).name !== 'Water');
            if (spawnHex) {
                tryCastSpell(entity, summonSpell, null, spawnHex);
                spendTP(entity, 10);
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    // SPELLCASTING AI (Grishnak / Casters)
    if (entity.createdSpells && entity.createdSpells.length > 0 && entity.timePoints >= 10) {
        // ... (existing spell logic) ...
        const attackSpell = entity.createdSpells.find(s => s.baseId === 'firebolt' || s.baseId === 'dragon_breath');
        if (attackSpell && entity.currentMana >= attackSpell.manaCost) {
            const inRange = visibleOpponents.find(o => window.distance(entity.hex, o.hex) <= attackSpell.range);
            if (inRange) {
                tryCastSpell(entity, attackSpell, inRange, inRange.hex);
                spendTP(entity, 10);
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    let target = null;
    if (attackableOpponents.length > 0) {
        const opponentsHaveHealer = opponentsHaveHealerCapability(opponents);
        attackableOpponents.sort((a, b) => targetPriorityCompare(entity, a, b, opponentsHaveHealer));
        target = attackableOpponents[0];
        entity.lastSeenTargetHex = { q: target.hex.q, r: target.hex.r };
    }

    let huntTargetHex = target ? target.hex : (entity.lastSeenTargetHex || null);
    
    // If no target because of flying, move towards favorable terrain or away
    if (!target && visibleOpponents.length > 0) {
        const nearestFlyer = visibleOpponents.sort((a, b) => window.distance(entity.hex, a.hex) - window.distance(entity.hex, b.hex))[0];
        // Move away from flyer
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        huntTargetHex = neighbors.sort((a, b) => window.distance(b, nearestFlyer.hex) - window.distance(a, nearestFlyer.hex))[0];
    }

    if (huntTargetHex && !target && entity.hex.q === huntTargetHex.q && entity.hex.r === huntTargetHex.r) {
        entity.lastSeenTargetHex = null;
        huntTargetHex = null;
    }

    if (!huntTargetHex) { 
        entity.timePoints = threshold; 
        aiProcess(entity); 
        return; 
    }

    if (entity.canLoot) {
        const coord = `${entity.hex.q},${entity.hex.r}`;
        if (window.mapItems[coord]?.length > 0 && entity.timePoints >= 1) {
            window.lootItems(entity);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // GORE CHARGE (Minotaur) — charge at an opponent 2–5 hexes away, then shove them back
    if (entity.skills?.gore_charge && entity.timePoints >= 10 && target) {
        const dist = window.distance(entity.hex, target.hex);
        if (dist >= 2 && dist <= 5) {
            const neighbors = window.getNeighbors(target.hex.q, target.hex.r);
            const chargeHex = neighbors
                .filter(h => !getEntityAtHex(h.q, h.r) || getEntityAtHex(h.q, h.r) === entity)
                .sort((a, b) => window.distance(a, entity.hex) - window.distance(b, entity.hex))[0];
            if (chargeHex && window.findPath(entity.hex, chargeHex, 100, entity)?.length > 1) {
                entity.hex = chargeHex;
                sharedMessage(`${entity.name} charges ${target.name} with a vicious gore!`);
                tryAttack(entity, target, false, false, 6); // +6 bonus damage
                window.tryShove(entity, target);           // knock target back
                spendTP(entity, 10);
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    // BOSS AI: SHOVE PRIORITY (Krog / Juggernauts)
    if (entity.skills?.shove && entity.timePoints >= 10) {
        const adjacentPlayer = opponents.find(o => window.distance(entity.hex, o.hex) === 1);
        if (adjacentPlayer && Math.random() < 0.4) { // 40% chance to shove instead of attack
            if (window.tryShove(entity, adjacentPlayer)) {
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
        }
    }

    let attackRange = 1;
    if (entity.equipped?.weapon) {
        const weapon = window.items[entity.equipped.weapon];
        let rb = (weapon?.range || 0);
        if (weapon?.id === 'bow' && entity.skills?.elf_bow_range) rb += (entity.skills.elf_bow_range * 4);
        attackRange += rb;
    }
    const dist = getMinDistance(entity, target || { getAllHexes: () => [huntTargetHex], hex: huntTargetHex });

    let hasLOE = target ? entity.getAllHexes().some(h => window.hasLineOfEffect(h, target.hex)) : false;

    if (target && dist <= attackRange && hasLOE) {
        if (entity.skills['quarterstaff_trip'] && entity.timePoints >= 5 && Math.random() > 0.5) {
            const hitChance = 50 + entity.toHitMelee - target.passiveDodge;
            if (Math.random() * 100 < hitChance) {
                window.showMessage(`${entity.name} trips ${target.name}!`);
                target.timePoints = Math.max(0, target.timePoints - 5);
            }
            spendTP(entity, 5);
        } else {
            tryAttack(entity, target);
            spendTP(entity, 10);
        }
        setTimeout(() => aiProcess(entity), 20);
    } else {
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        const bestHex = neighbors.map(h => {
            let s = -window.distance(h, huntTargetHex);
            const t = window.getTerrainAt(h.q, h.r);
            // Was "+= 5" — a sign flip that made a Wall hex score BETTER than
            // an open one at the same distance, so chasing enemies picked
            // walls as their preferred step and then failed to path onto
            // them (findPath rightly refuses), leaving them stuck bumping
            // into the wall instead of routing around it.
            if (t.name === 'Wall') s -= 20;
            if (t.name === 'Water') s -= 10;
            if (getEntityAtHex(h.q, h.r)) s -= 5;
            return {h, s};
        }).sort((a,b) => b.s - a.s)[0].h;

        const moveEntity = entity.riding || entity;
        const availableMoveTP = moveEntity.timePoints - 80;
        const path = window.findPath(entity.hex, bestHex, availableMoveTP, moveEntity);

        if (path?.length > 1) {
            const previousHex = { q: entity.hex.q, r: entity.hex.r };
            const nextHex = path[1];

            checkMovementReactions(entity, nextHex, (forceEnd) => {
                const occupant = getEntityAtHex(nextHex.q, nextHex.r);
                if (forceEnd && occupant && occupant !== entity && occupant !== entity.riding) {
                    entity.hex = previousHex;
                } else {
                    entity.hex = nextHex;
                    if (entity.riding) entity.riding.hex = { q: nextHex.q, r: nextHex.r };
                }
                const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
                let cost = 5;
                if (moveEntity.skills['fastMovement']) {
                    const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor]?.id === 'light_armor';
                    if (isLightOrNoArmor) cost -= moveEntity.skills['fastMovement'];
                }
                if (moveEntity.skills['swift_step']) {
                    const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) cost -= 1;
                }

                if (entity.riding) {
                    if (entity.riding.timePoints > 80) {
                        spendTP(entity.riding, cost * window.getMoveCostMult(entity.hex.q, entity.hex.r, entity.riding));
                    } else {
                        setTimeout(() => aiProcess(entity), 20);
                        return;
                    }
                } else {
                    spendTP(entity, cost * window.getMoveCostMult(entity.hex.q, entity.hex.r, entity));
                }

                if (forceEnd) entity.timePoints = threshold;
                setTimeout(() => aiProcess(entity), 20);
            });
        } else { 
            entity.timePoints = threshold; 
            setTimeout(() => aiProcess(entity), 20); 
        }
    }
}

// Real-time "close" formation movement can leave trailing party members
// detouring onto the same hex as whoever's ahead of them (never actually
// two-on-one-hex, but visually crowded together) — e.g. when the leader
// stops abruptly to loot and followers converge, or combat catches them
// mid-move. Spread any duplicates out to a free neighboring hex.
function deconflictPartyStacking() {
    const partyEntities = window.entities.filter(e => e.alive && e.side === 'player' && !e.rider);
    const seenHexes = new Set();
    partyEntities.forEach(e => {
        const key = `${e.hex.q},${e.hex.r}`;
        if (!seenHexes.has(key)) { seenHexes.add(key); return; }
        const openNeighbor = window.getNeighbors(e.hex.q, e.hex.r).find(h => window.isOpenHex(h));
        if (openNeighbor) {
            e.hex = openNeighbor;
            e.visualQ = openNeighbor.q;
            e.visualR = openNeighbor.r;
            e.startQ = openNeighbor.q;
            e.startR = openNeighbor.r;
            seenHexes.add(`${openNeighbor.q},${openNeighbor.r}`);
        }
    });
}
window.deconflictPartyStacking = deconflictPartyStacking;

function wakeUp(entity) {
    if (entity.aiState === 'combat') return;
    
    // AUDIO: Transition to battle if this is the first alert
    const firstAlert = !window.entities.some(e => e.side !== 'player' && e.side !== 'neutral' && e.aiState === 'combat');
    if (firstAlert && window.isInArena) {
        window.playSting();
        window.playArenaMusic('battle', 0.8);
    }

    entity.aiState = 'combat';

    // Reset players initiative and cancel movement if this is the start of combat
    if (firstAlert) {
        // Mark all currently-visible enemies as seen so they appear in the initiative tracker.
        // updateExploration only runs in the out-of-combat tick; calling it here ensures the
        // first combat broadcast already carries hasBeenSeenByPlayer=true for visible enemies.
        if (window.updateExploration) window.updateExploration();

        window.entities.forEach(e => {
            if (e.side === 'player') {
                e.timePoints = 0;
                e.destination = null;
                e.moveCooldown = 0;
            }
        });

        deconflictPartyStacking();

        // Fights shouldn't play out at 3x just because the player left
        // fast-forward on during the walk over.
        if (window.timeSpeedMultiplier && window.timeSpeedMultiplier !== 1) {
            window.timeSpeedMultiplier = 1;
            if (window.updateTimeSpeedButton) window.updateTimeSpeedButton();
        }
        if (window.updateActionButtons) window.updateActionButtons();
    }

    // Chain reaction: Alert allies within 10 hexes
    // In arena, all non-player/neutral side entities are allies
    const allies = window.entities.filter(e => e.alive && e.side === entity.side && e !== entity && e.aiState !== 'combat');
    allies.forEach(a => {
        if (window.distance(a.hex, entity.hex) <= 10) {
            sharedMessage(`${a.name} is alerted by ${entity.name}!`);
            wakeUp(a); // Recursive chain
        }
    });
}

function spendTP(entity, amount) {
    entity.timePoints -= amount;
    entity.totalTPSpent += amount;

    if (entity.webbedDuration > 0) {
        entity.webbedDuration = Math.max(0, entity.webbedDuration - amount);
        if (entity.webbedDuration <= 0) window.showMessage(`${entity.name} is no longer webbed.`);
    }
    if (entity.petrifiedTicks > 0) {
        entity.petrifiedTicks = Math.max(0, entity.petrifiedTicks - amount);
        if (entity.petrifiedTicks <= 0) window.showMessage(`${entity.name} shatters free from the petrification!`);
    }
    
    // Stealth Penalty for movement/actions
    if (entity.isStealthed && amount > 1) {
        // Re-calculate stealth score at new position/state
        let score = 50;
        if (entity.skills?.stealth_agility) score += 5;
        if (entity.skills?.stealth_rogue) score += 5;
        const light = window.lightLevel || 1.0;
        score -= (light * 40);
        const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
        score += (terrain.stealthBonus || 0);
        if (entity.equipped?.armor) {
            const aid = entity.equipped.armor;
            if (aid === 'heavy_armor') score -= 30;
            else if (aid === 'medium_armor') score -= 15;
        }
        entity.stealthScore = score;
    }

    checkDisappearance(entity);
}

function checkDisappearance(entity) {
    if (entity.maxTPAllowed > 0 && entity.totalTPSpent >= entity.maxTPAllowed) {
        entity.alive = false;
        window.showMessage(`${entity.name} has vanished!`);
        window.drawMap();
        window.renderEntities();
        if (entity.side === 'enemy') checkCombatEnd();
    }
}

function snapVisuals() {
    window.entities.forEach(e => {
        let targetQ = e.hex.q;
        let targetR = e.hex.r;
        if (e.extraHexes && e.extraHexes.length > 0) {
            const uniqueHexes = e.getAllHexes(); 
            let totalQ = 0; let totalR = 0;
            uniqueHexes.forEach(h => { totalQ += h.q; totalR += h.r; });
            e.visualQ = totalQ / uniqueHexes.length;
            e.visualR = totalR / uniqueHexes.length;
        } else {
            e.visualQ = targetQ;
            e.visualR = targetR;
        }
    });
}

function handleClick(e){
    // ABORT if we were dragging the camera
    if (window.totalDragDistance > 10) return;

    // Fix: Ghost Click Prevention (Ignore clicks immediately after a modal closes)
    if (window.lastModalClosedTime && (Date.now() - window.lastModalClosedTime < 300)) {
        return;
    }

    // ABORT if any modal is visible
    const modals = document.querySelectorAll(".modal");
    for (let m of modals) {
        if (m.style.display === "block") return;
    }

    if (window.isPausedForReaction) return;

    if (window.multiplayer && window.multiplayer.roomCode) {
        if (window.isInCombat) {
            // In combat: abort click/actions if it's not the local player's turn
            if (window.currentTurnEntity && window.currentTurnEntity.networkId !== window.multiplayer.socket.id) {
                return;
            }
        }
    }

    if (window.isInCombat) {
        if (window.gamePhase !== 'PLAYER_TURN' || !window.currentTurnEntity) return;
    }
    
    // Out-of-combat: default to LOCAL player
    let player = window.currentTurnEntity;
    if (!player) {
        player = window.player;
    }
    // Fallback if window.player is just data or missing
    if (!player || !player.hex) player = window.entities.find(ent => ent.side === 'player' && !ent.rider);
    
    // In multiplayer exploration mode, ensure player represents our local player character
    if (window.multiplayer && window.multiplayer.roomCode && !window.isInCombat) {
        if (player && player.networkId !== window.multiplayer.socket.id) {
            player = window.entities.find(ent => ent.networkId === window.multiplayer.socket.id);
        }
    }
    
    if (!player) return;

    if (player.castCooldown > 0) {
        window.showMessage("You are currently casting a spell.");
        return;
    }

    const clickedHex = window.screenToHex({x:e.clientX, y:e.clientY});
    const target = getEntityAtHex(clickedHex.q, clickedHex.r);
    let actionHandled = false;

    // DOOR/SIGNPOST/JOURNAL/HARVEST — takes priority over talk/attack/move
    // when clicking an adjacent interactable tile object. Clicking one from
    // farther away walks the player there instead (see interactWithTileObject
    // and the pendingInteractHex arrival hook in autoMoveProcess) rather than
    // silently just moving onto it without ever interacting.
    const doorObj = window.tileObjects && window.tileObjects[`${clickedHex.q},${clickedHex.r}`];
    const interactableTypes = ['door_open', 'door_closed', 'signpost', 'journal', 'ore_node', 'timber_tree', 'stone_deposit', 'fruit_tree', 'herb_patch', 'fishing_spot', 'corpse', 'evidence', 'building_plot', 'player_bed'];
    if (doorObj && interactableTypes.includes(doorObj.type)) {
        if (window.distance(player.hex, clickedHex) <= 1) {
            interactWithTileObject(clickedHex.q, clickedHex.r, player);
            return;
        }
        if (!window.isInCombat) {
            window.pendingInteractHex = { q: clickedHex.q, r: clickedHex.r };
            player.destination = clickedHex;
            window.showMessage(`${player.name} walks over to take a closer look.`);
            finalizePlayerAction(player, actionHandled);
            return;
        }
    }

    // ASSASSINATE THE GOBLIN CHIEF — a stealthed player adjacent to the
    // still-unaware chief can end the whole camp's leadership in one
    // stroke, ahead of the normal talk/attack handling below.
    if (target && target.name === 'Chief Skarnub' && target.alive && player.isStealthed &&
        target.aiState !== 'combat' && window.distance(player.hex, clickedHex) <= 1) {
        window.showDialogue({ name: 'Assassination' }, "Chief Skarnub's back is turned. One clean strike could end this without a fight.", [
            { label: "Strike now.", action: () => { if (window.handleChiefAssassination) window.handleChiefAssassination(target); } },
            { label: "Not yet.", action: () => {} }
        ]);
        return;
    }

    // TALK TO NPC — suppressed during combat so clicks default to attacking instead
    if (!window.isInCombat && target && target.isNPC && window.distance(player.hex, clickedHex) <= 3) {
        talkToNPC(target);
        return;
    }

    if (window.playerAction) {
        const act = window.playerAction;
        if (act.type === 'force_attack') {
            if (target && target.alive && target !== player) {
                tryAttack(player, target, false, false, 0, true);
                spendTP(player, 10);
                actionHandled = 'main_attack';
            }
            window.playerAction = null;
            if (actionHandled) finalizePlayerAction(player, actionHandled);
            window.updateActionButtons();
            return;
        } else if (act.type === 'parley') {
            if (target && target.alive && target.side === 'enemy' && window.distance(player.hex, clickedHex) <= 3) {
                if (window.parleyWithEnemy) window.parleyWithEnemy(target);
            }
            window.playerAction = null;
            window.updateActionButtons();
            return;
        } else if (act.type === 'skill') {
            if (act.id === 'shove' || act.id.endsWith('_feint')) {
                if (target && target.side !== player.side && window.distance(player.hex, clickedHex) === 1) {
                    if (act.id === 'shove') actionHandled = window.tryShove(player, target);
                    else { tryAttack(player, target, true); spendTP(player, 1); actionHandled = true; }
                }
            } else if (act.id === 'quarterstaff_trip') {
                if (target && target.side !== player.side) {
                    const dist = getMinDistance(player, target);
                    let range = 1 + (player.equipped?.weapon === 'quarterstaff' ? window.items['quarterstaff'].range : 0);
                    if (dist <= range) {
                        const hitChance = 50 + player.toHitMelee - target.passiveDodge;
                        if (Math.random() * 100 < hitChance) {
                            window.showMessage(`${player.name} trips ${target.name}!`);
                            target.timePoints = Math.max(0, target.timePoints - 5);
                        } else {
                            sharedMessage(`${player.name} tries to trip ${target.name} but misses!`);
                        }
                        spendTP(player, 5); actionHandled = true;
                    } else { window.showMessage("Target out of range."); }
                }
            } else if (act.id === 'furious_charge') {
                if (target && target.side !== player.side) {
                    const dist = getMinDistance(player, target);
                    if (dist >= 3 && dist <= 5) {
                        // Find hex adjacent to target closest to player
                        const neighbors = window.getNeighbors(target.hex.q, target.hex.r);
                        const bestHex = neighbors.sort((a,b) => window.distance(a, player.hex) - window.distance(b, player.hex))[0];
                        if (!getEntityAtHex(bestHex.q, bestHex.r)) {
                            player.hex = bestHex;
                            if (player.riding) player.riding.hex = {q: bestHex.q, r: bestHex.r};
                            window.showMessage(`${player.name} charges ${target.name}!`);
                            tryAttack(player, target, false, false, 4); // +4 bonus damage
                            spendTP(player, 10);
                            actionHandled = true;
                        } else {
                            window.showMessage("No space to complete the charge.");
                        }
                    } else {
                        window.showMessage("Target must be 3-5 hexes away for Furious Charge.");
                    }
                }
            } else if (act.id === 'fly') {
                player.isFlying = true;
                window.showMessage(`${player.name} takes to the air!`);
                spendTP(player, 1);
                actionHandled = true;
            } else if (act.id === 'land') {
                player.isFlying = false;
                window.showMessage(`${player.name} lands.`);
                spendTP(player, 1);
                actionHandled = true;
            } else if (act.id === 'assassinate') {
                if (target && target.side !== player.side) {
                    const enemies = window.entities.filter(e => e.alive && e.side !== player.side);
                    const isSeen = enemies.some(e => canSee(e, player));
                    if (!isSeen) {
                        window.showMessage(`${player.name} performs an assassination strike!`);
                        // Temporarily boost hit chance
                        player.tempHitBonus = 50;
                        tryAttack(player, target, false);
                        delete player.tempHitBonus;
                        spendTP(player, 80);
                        actionHandled = true;
                    } else {
                        window.showMessage("Cannot assassinate while seen by any enemy!");
                    }
                }
            } else if (act.id === 'disarm') {
                if (target && target.side !== player.side && window.areAdjacent(player.hex, target.hex)) {
                    const roll = Math.random() * 100;
                    if (roll < 50) {
                        const weaponId = target.equipped?.weapon;
                        const offhandId = target.equipped?.offhand;
                        const itemToDrop = weaponId || (offhandId && window.items[offhandId].type !== 'shield' ? offhandId : null);
                        
                        if (itemToDrop) {
                            window.showMessage(`${player.name} disarms ${target.name}! ${window.items[itemToDrop].name} dropped.`);
                            if (itemToDrop === weaponId) target.equipped.weapon = null;
                            else target.equipped.offhand = null;
                            
                            const coord = `${target.hex.q},${target.hex.r}`;
                            if (!window.mapItems[coord]) window.mapItems[coord] = [];
                            window.mapItems[coord].push(itemToDrop);
                        } else {
                            window.showMessage(`${target.name} has no weapon to disarm!`);
                        }
                    } else {
                        window.showMessage(`${player.name} tries to disarm ${target.name} but fails!`);
                    }
                    spendTP(player, 5);
                    actionHandled = true;
                }
            } else if (act.id === 'pickpocket') {
                if (target && (target.side === 'neutral' || !canSee(target, player))) {
                    if (window.distance(player.hex, target.hex) === 1) {
                        if (target.inventory && target.inventory.length > 0) {
                            const stolen = target.inventory.pop();
                            player.inventory.push(stolen);
                            window.showMessage(`${player.name} stole ${window.items[stolen].name} from ${target.name}!`);
                        } else {
                            window.showMessage(`${target.name}'s pockets are empty.`);
                        }
                        spendTP(player, 5);
                        actionHandled = true;
                    }
                }
            } else if (act.id === 'dagger_throw') {
                if (target && target.side !== player.side) {
                    const dist = getMinDistance(player, target);
                    if (dist <= 4) {
                        if (Math.random() * 100 < (50 + player.toHitRanged - target.passiveDodge)) resolveAttack(player, target, false);
                        else sharedMessage(`${player.name} throws a dagger but misses!`);
                        
                        const daggerId = player.equipped.weapon;
                        player.equipped.weapon = null;
                        const idx = window.player.inventory.indexOf(daggerId);
                        if (idx > -1) window.player.inventory.splice(idx, 1);
                        
                        const coord = `${clickedHex.q},${clickedHex.r}`;
                        if (!window.mapItems[coord]) window.mapItems[coord] = [];
                        window.mapItems[coord].push(daggerId);

                        if (player.skills['dagger_quick_draw']) {
                            const next = window.player.inventory.find(i => i === 'dagger');
                            if (next) player.equipped.weapon = next;
                        }
                        spendTP(player, 5); actionHandled = true;
                    }
                }
            }
        } else if (act.type === 'mount') {
            if (target && target.mountSize > 0 && target.side === player.side && !target.rider) {
                if (getMinDistance(player, target) <= 1) {
                    if (player.riderSize <= target.mountSize) {
                        player.riding = target;
                        target.rider = player;
                        player.hex = { q: target.hex.q, r: target.hex.r };
                        spendTP(player, 2);
                        window.showMessage(`${player.name} mounted ${target.name}.`);
                        actionHandled = true;
                    } else { window.showMessage("Mount is too small!"); }
                } else { window.showMessage("Must be adjacent to mount."); }
            }
        } else if (act.type === 'dismount') {
            if (!target && window.distance(player.hex, clickedHex) <= 1 && window.isHexInBounds(clickedHex)) {
                const mount = player.riding;
                if (mount) {
                    mount.rider = null;
                    player.riding = null;
                    player.hex = clickedHex;
                    spendTP(player, 2);
                    window.showMessage(`${player.name} dismounted.`);
                    actionHandled = true;
                }
            } else { window.showMessage("Select an adjacent empty hex to dismount."); }
        } else if (act.type === 'offhand_attack') {
            if (target && target.side !== player.side) {
                let range = 1 + (player.equipped?.offhand ? (window.items[player.equipped.offhand].range || 0) : 0);
                if (getMinDistance(player, target) <= range) { tryAttack(player, target, false, true); spendTP(player, 2); actionHandled = true; }
            }
        } else if (act.type === 'spell') {
            const spell = window.player.createdSpells[act.index];
            const dist = target ? getMinDistance(player, target) : window.distance(player.hex, clickedHex);
            if (dist <= spell.range && player.currentMana >= spell.manaCost + getArmorSpellPenalty(player, spell) && player.timePoints >= spell.tpCost) {
                const maxTargets = 1 + (spell.extraTargets || 0);
                
                // Add target if not already added
                const alreadySelected = act.targets.some(t => t?.id === (target ? target.id : null) && t.hex.q === clickedHex.q && t.hex.r === clickedHex.r);
                if (!alreadySelected) {
                    act.targets.push({ id: target ? target.id : null, hex: clickedHex, entity: target });
                }

                if (act.targets.length >= maxTargets) {
                    // Cast on all targets
                    act.targets.forEach((t, i) => {
                        const isLast = (i === act.targets.length - 1);
                        const result = tryCastSpell(player, spell, t.entity, t.hex);
                        if (isLast) {
                            if (result === 'counter_pending') actionHandled = true;
                            else if (result !== false) {
                                spendTP(player, spell.tpCost);
                                actionHandled = true;
                                
                                // Out of combat: wait for duration before turn ends
                                if (!window.isInCombat) {
                                    const waitTime = (spell.tpCost / player.timePointsPerTick) * 400;
                                    setTimeout(() => {
                                        window.playerAction = null;
                                        finalizePlayerAction(player, actionHandled);
                                    }, waitTime);
                                    return; // Exit early, setTimeout handles finalization
                                }
                            }
                        }
                    });
                } else {
                    window.showMessage(`Target ${act.targets.length}/${maxTargets} selected. Click next target.`);
                    window.updateActionButtons();
                    return; // Don't finalize yet
                }
            } else {
                if (dist > spell.range) window.showMessage("Target out of range.");
                else window.showMessage("Not enough mana or TP.");
            }
        }
        if (actionHandled) { window.playerAction = null; syncBackToPlayer(player); }
    } else if (window.highlightedHexes.some(h => h.type === 'attack' && h.q === clickedHex.q && h.r === clickedHex.r)) {
        if (target && target.side !== player.side) {
            window.gamePhase = 'AI_TURN'; // Block clicks
            window.clearHighlights();
            tryAttack(player, target); spendTP(player, 10); actionHandled = 'main_attack';
        }
    } else if (window.highlightedHexes.some(h => h.type === 'move' && h.q === clickedHex.q && h.r === clickedHex.r)) {
        let threshold = 80;
        if (player.skills && player.skills['quickRecovery']) threshold -= player.skills['quickRecovery'];
        
        const moveEntity = player.riding || player;
        const availableTP = moveEntity.timePoints - 80; 

        let path = window.findPath(player.hex, clickedHex, availableTP, moveEntity);
        if (!path && window.distance(player.hex, clickedHex) === 1 && availableTP > 0) path = [player.hex, clickedHex];
        if (path) { 
            window.gamePhase = 'AI_TURN'; // Block clicks
            window.clearHighlights();
            path.shift(); 
            playerMoveProcess(player, path); 
            return; 
        }
    } else if (window.isInCombat) {
        // In combat, a click that doesn't land on a highlighted move/attack
        // hex isn't a valid action — real-time free-move destinations (below)
        // would let a click bypass turn-based movement entirely.
        window.showMessage("That's out of range this turn.");
    } else {
        // NO ACTION/MOVE ACTIVE: Set Destination for Auto-Move
        if (window.groupMoveMode) {
            const leader = player;
            const moveEntity = leader.riding || leader;
            const fullPath = window.findPath(leader.hex, clickedHex, undefined, moveEntity, true);
            window.leaderPath = fullPath ? fullPath.map(h => `${h.q},${h.r}`) : [];
            window.groupLeader = leader;
            assignGroupMoveDestinations(leader, clickedHex);
            window.showMessage(`Group destination set.`);
        } else {
            player.destination = clickedHex;
            window.showMessage(`${player.name} destination set to ${clickedHex.q},${clickedHex.r}`);

            // MULTIPLAYER SYNC: Send destination to server
            if (window.multiplayer && window.multiplayer.roomCode) {
                window.multiplayer.socket.emit('move', {
                    roomCode: window.multiplayer.roomCode,
                    hex: player.hex,
                    destination: clickedHex
                });
            }
        }
    }
    finalizePlayerAction(player, actionHandled);
}

window.snapVisuals = snapVisuals;

function tryAttack(attacker, target, isFeint = false, isOffhand = false, bonusDamage = 0, ignoreNeutralCheck = false) {
    // Dialogue-only lobby/pen NPCs (see setupArenaLobby) — never a valid
    // target, not even via Force-Attack's ignoreNeutralCheck override.
    if (target.noAttack) {
        if (attacker.side === 'player') window.showMessage(`${target.name} isn't part of any fight — leave them be.`);
        return;
    }
    if (target.side === 'neutral' && !ignoreNeutralCheck) {
        if (attacker.side === 'player') window.showMessage("You cannot attack a neutral character!");
        return;
    }

    // SANCTUARY TRIGGER
    const sanctuary = (window.activeSpells || []).find(s => s.debuffType === 'sanctuary_protected' && s.targetEntityId === target?.id);
    if (sanctuary && attacker.side !== target?.side) {
        const penalty = (sanctuary.magnitude || 1);
        attacker.timePoints -= penalty;
        window.showMessage(`${attacker.name} is hindered by Sanctuary! (-${penalty} TP)`);
        triggerPenalty(sanctuary.casterName, attacker, sanctuary);
    }

    // DIVINE PROTECTION: Attacker loses TP
    const protections = (window.activeSpells || []).filter(s => s.baseId === 'divine_protection' && s.targetEntityId === target?.id);
    protections.forEach(p => {
        attacker.timePoints -= (p.magnitude || 1);
        window.showMessage(`${attacker.name} is hindered by Divine Protection! (-${p.magnitude || 1} TP)`);
    });

    // BREAK SANCTUARY ON OFFENSIVE ACTION
    const mySanctuary = (window.activeSpells || []).find(s => s.debuffType === 'sanctuary_protected' && s.targetEntityId === attacker?.id);
    if (mySanctuary && target?.side !== attacker?.side) {
        window.showMessage(`${attacker.name}'s Sanctuary fades as they take offensive action.`);
        window.cancelSpell(mySanctuary.spellInstanceId);
    }

    // FLYING MELEE IMMUNITY
    let weaponSlot = isOffhand ? 'offhand' : 'weapon';
    let weapon = window.items[attacker.equipped?.[weaponSlot]] || null;
    const isRanged = weapon?.subType === 'ranged';
    if (!isRanged && (attacker.isFlying || target.isFlying) && !(attacker.isFlying && target.isFlying)) {
        if (attacker.side === 'player') {
            window.showMessage(`Cannot reach ${target.name} with a melee attack while ${attacker.isFlying ? 'flying' : 'they are flying'}!`);
        }
        return;
    }

    // ELEVATION MELEE IMMUNITY: a defender on a wall/rampart can't be melee'd
    // from the ground, and can't melee the ground from up there either —
    // symmetric, same shape as the flying-immunity check above.
    const attackerElevated = window.getTerrainAt(attacker.hex.q, attacker.hex.r).elevated;
    const targetElevated = window.getTerrainAt(target.hex.q, target.hex.r).elevated;
    if (!isRanged && !!attackerElevated !== !!targetElevated) {
        if (attacker.side === 'player') {
            window.showMessage(`Cannot reach ${target.name} with a melee attack across that height difference!`);
        }
        return;
    }

    // Wake up target if attacked
    if (target.side === 'enemy' && target.aiState === 'idle') wakeUp(target);

    // Battle Reflexes: Gain 1 TP when attacked
    if (target.skills?.battle_reflexes) {
        target.timePoints += 1;
    }

    // BREAK STEALTH
    if (attacker.isStealthed) breakStealth(attacker);

    const reactions = [];

    // DEFENDER REACTIONS
    const targetWeaponId = target.equipped?.weapon;
    const targetWeapon = targetWeaponId ? window.items[targetWeaponId] : null;
    let skillBase = (targetWeapon?.id === 'sword_arrow_deflection') ? 'sword' : targetWeapon?.id;

    if (!weapon || weapon.subType === 'melee' || targetWeapon?.id === 'sword_arrow_deflection') {
        if (skillBase && target.skills[`${skillBase}_parry`] && target.timePoints >= 3 && target.parriesRemaining > 0) {
            let tpCost = 3;
            if (target.skills[`${skillBase}_parry_cost`] > 0) tpCost -= 1;
            
            if (target.timePoints >= tpCost) {
                reactions.push({ id: 'parry', name: 'Parry', tpCost: tpCost, skillBase: skillBase });
            }
        }
    }

    // ALLY REACTIONS (Shield Other & Protector)
    const allies = window.entities.filter(e => e.alive && e.side === target.side && e !== target);
    for (let ally of allies) {
        // Distance check (adjacent to ANY of target's hexes)
        const isAdjacent = ally.getAllHexes().some(ah => target.getAllHexes().some(th => window.distance(ah, th) <= 1));
        if (!isAdjacent) continue;

        if (ally.timePoints >= 1 && ally.skills?.shield_other) {
            const shieldId = ally.equipped?.offhand;
            if (shieldId && window.items[shieldId].type === 'shield') {
                reactions.push({ id: 'shield_other', name: `Shield Other (${ally.name})`, tpCost: 1, ally: ally });
            }
        }
        
        if (ally.skills?.protector && ally.parriesRemaining > 0) {
            const weaponId = ally.equipped?.weapon;
            const w = weaponId ? window.items[weaponId] : null;
            if (w && (w.id === 'sword' || w.id === 'dagger') && ally.skills[`${w.id}_parry`]) {
                let cost = 3;
                if (ally.skills[`${w.id}_parry_cost`] > 0) cost -= 1;
                if (ally.timePoints >= cost) {
                    reactions.push({ id: `protector_parry_${ally.name}`, name: `Protect ${target.name.split(' ')[0]} (Parry: ${ally.name})`, tpCost: cost, ally: ally, weaponId: w.id });
                }
            }
        }
    }

    if (reactions.length > 0 && !target.reactionBlocked) {
        // For simplicity, we combine them but handle who spends TP.
        window.requestReaction(target, reactions, (choice) => {
            if (choice === 'parry') {
                const r = reactions.find(o => o.id === 'parry');
                spendTP(target, r.tpCost); target.parriesRemaining -= 1;
                
                let parryBonus = (target.skills[`${r.skillBase}_parry_chance`] || 0) * 5;
                let hit = Math.random() * 100 < (50 + target.toHitMelee + parryBonus - attacker.passiveDodge);
                
                if (hit) {
                    window.showMessage(`${target.name} successfully parried ${attacker.name}!`);
                    if (window.playParrySound) window.playParrySound();
                    if (isFeint) window.showMessage(`[FEINT SUCCESS] ${attacker.name} tricked ${target.name} into wasting a Parry!`);
                    if (target.skills[`${r.skillBase}_riposte`] && target.timePoints >= 5) {
                        spendTP(target, 5);
                        sharedMessage(`${target.name} ripostes!`);
                        const hitChance = 50 + target.toHitMelee - attacker.passiveDodge;
                        if (Math.random() * 100 < hitChance) {
                            const dmg = target.baseDamage || 1;
                            attacker.hp -= dmg;
                            sharedMessage(`Riposte hits for ${dmg} damage!`);
                            if (attacker.hp <= 0) handleLethalDamage(attacker, target);
                        } else {
                            sharedMessage("Riposte misses!");
                        }
                    }
                    return;
                } else {
                    window.showMessage(`${target.name} tried to parry but FAILED!`);
                    if (isFeint) window.showMessage(`[FEINT FAILED] ${target.name} didn't fall for the feint.`);
                }
            } else if (choice === 'shield_other') {
                const r = reactions.find(o => o.id === 'shield_other');
                spendTP(r.ally, 1);
                const shield = window.items[r.ally.equipped.offhand];
                const bonus = shield.reduction + (r.ally.skills.shield_proficiency || 0);
                window.showMessage(`${r.ally.name} protects ${target.name} with their shield (+${bonus} reduction)!`);
                target.tempReduction = (target.tempReduction || 0) + bonus;
            } else if (choice && choice.startsWith('protector_parry_')) {
                const r = reactions.find(o => o.id === choice);
                const ally = r.ally;
                spendTP(ally, r.tpCost); ally.parriesRemaining -= 1;

                let parryBonus = (ally.skills[`${r.weaponId}_parry_chance`] || 0) * 10;
                let hit = Math.random() * 100 < (50 + ally.toHitMelee + parryBonus - attacker.passiveDodge);

                if (hit) {
                    window.showMessage(`${ally.name} successfully parried ${attacker.name} for ${target.name}!`);
                    if (window.playParrySound) window.playParrySound();
                    if (isFeint) window.showMessage(`[FEINT SUCCESS] ${attacker.name} tricked ${ally.name} into wasting a Protector Parry!`);
                    return;
                } else {
                    window.showMessage(`${ally.name} tried to parry for ${target.name} but FAILED!`);
                    if (isFeint) window.showMessage(`[FEINT FAILED] ${ally.name} didn't fall for the feint.`);
                }
            }
            
            // Proceed to attack resolution
            const missCallback = () => {
                // If it's a miss, check for Shield Bash
                if (target.skills?.shield_bash && target.timePoints >= 3) {
                    const shieldId = target.equipped?.offhand;
                    if (shieldId && window.items[shieldId].type === 'shield') {
                        window.requestReaction(target, [{id:'shield_bash', name:'Shield Bash', tpCost:3}], (bashChoice) => {
                            if (bashChoice === 'shield_bash') {
                                spendTP(target, 3);
                                sharedMessage(`${target.name} counter-attacks with a Shield Bash!`);
                                // Basic attack: no weapon, no skills
                                const hitChance = 50 + target.toHitMelee - attacker.passiveDodge;
                                if (Math.random() * 100 < hitChance) {
                                    const dmg = target.baseDamage || 1;
                                    sharedMessage(`Shield Bash hits for ${dmg} damage!`);
                                    attacker.hp -= dmg;
                                    if (attacker.hp <= 0) { attacker.alive = false; sharedMessage(`${attacker.name} defeated!`); checkCombatEnd(); }
                                } else {
                                    sharedMessage("Shield Bash misses!");
                                }
                            }
                        }, "The enemy missed! Use Shield Bash?");
                    }
                }
            };

            resolveAttack(attacker, target, isFeint, isOffhand, missCallback, bonusDamage);
            if (target.tempReduction) delete target.tempReduction;
        }, `Being attacked by ${attacker.name}`);
    } else {
        resolveAttack(attacker, target, isFeint, isOffhand, null, bonusDamage);
    }
}

function canSee(viewer, target) {
    const d = window.distance(viewer.hex, target.hex);
    
    // Vision Range affected by light
    let visionRange = 30 + (viewer.visionBonus || 0);
    const light = window.lightLevel || 1.0;
    const effectiveLight = (viewer.skills?.elf_darkvision) ? 1.0 : light;
    const visionCap = visionRange * Math.max(0.2, effectiveLight);
    
    // Line of sight check first (Physical obstruction)
    if (d > visionCap || !window.hasLineOfSight(viewer.hex, target.hex)) {
        // If we lose LOS, we no longer 'see' them currently
        if (target.isStealthed) {
            if (viewer.knownStealthedTargets) viewer.knownStealthedTargets.delete(target.name);
        }
        return false;
    }

    // Stealth check
    if (target.isStealthed) {
        if (!viewer.knownStealthedTargets) viewer.knownStealthedTargets = new Set();

        // If already spotted this 'bout' of visibility, we keep seeing them
        if (viewer.knownStealthedTargets.has(target.name)) return true;

        // Spot chance: base on target's stealth score
        // stealthScore is roughly 0-60 (higher is more stealthy)
        // distance makes it easier: +5 per hex closer than 15
        const distBonus = Math.max(0, (15 - d) * 5); 
        const spotChance = Math.max(5, 100 - target.stealthScore + distBonus);
        
        // Light source bonus for viewer
        let hasLight = false;
        if (viewer.equipped) {
            const items = [viewer.equipped.weapon, viewer.equipped.offhand, viewer.equipped.accessory];
            if (items.some(iid => iid && window.items[iid]?.lightRadius)) hasLight = true;
        }
        
        // Elf Darkvision: negate light penalty for spot chance
        let lightPenalty = (1.0 - effectiveLight) * 50;
        let finalChance = (hasLight ? spotChance * 1.5 : spotChance) - lightPenalty;
        
        if (Math.random() * 100 < finalChance) {
            // Spotted!
            viewer.knownStealthedTargets.add(target.name);
            return true;
        }
        return false;
    }

    return true;
}

// Shared by both the physical ranged path (below) and the Firebolt spell
// path (tryCastSpell) — previously duplicated as two separate Pedestal-only
// checks. Generalized to any elevated terrain (Pedestal, and now fort
// ramparts) rather than a name check, so a defender tucked behind a
// climbable wall segment gets the same cover bonus a pedestal already gave.
function isCoveredFromRangedAttack(target) {
    const blockedHexes = [{ q: target.hex.q, r: target.hex.r - 1 }, { q: target.hex.q + 1, r: target.hex.r - 1 }];
    return blockedHexes.some(bh => window.getTerrainAt(bh.q, bh.r).elevated);
}
window.isCoveredFromRangedAttack = isCoveredFromRangedAttack;

// Attack-vs-terrain, deliberately separate from tryAttack/resolveAttack
// (which assume an entity target with hp/dodge/passiveDodge — a wall has
// none of that). Durability lives in window.tileObjects rather than on the
// terrain type itself, since terrain objects are shared singletons
// (terrainTypes['keep_wall'] is one instance for the whole map) — a
// per-hex tileObjects entry is created lazily, only once a hex is actually
// damaged, so undamaged wall hexes cost nothing extra. At 0 hp the hex
// becomes passable Rubble and the tileObject is cleared.
function damageWall(q, r, amount) {
    const terrain = window.getTerrainAt(q, r);
    if (!terrain.impassable) return; // only the keep's real walls are destructible this way
    const key = `${q},${r}`;
    const maxHp = 40;
    if (!window.tileObjects[key] || window.tileObjects[key].type !== 'siege_wall') {
        window.tileObjects[key] = { type: 'siege_wall', hp: maxHp, maxHp };
    }
    const wall = window.tileObjects[key];
    wall.hp -= amount;
    if (wall.hp <= 0) {
        window.setTerrainAt(q, r, 'Rubble');
        delete window.tileObjects[key];
        window.showMessage('The wall gives way with a groan of shattered stone — a breach opens!');
        window.drawMap();
    } else {
        window.showMessage(`The wall groans under the impact (${wall.hp}/${wall.maxHp}).`);
    }
}
window.damageWall = damageWall;

function resolveAttack(attacker, target, isFeint, isOffhand = false, missCallback = null, bonusDamage = 0) {
  if (isFeint) {
      if (!isOffhand) attacker.offhandAttackAvailable = (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
      return;
  }
  const weaponSlot = isOffhand ? 'offhand' : 'weapon';
  const weapon = window.items[attacker.equipped?.[weaponSlot]] || null;
  const isRanged = weapon?.subType === 'ranged';

  const baseHit = isRanged ? attacker.toHitRanged : attacker.toHitMelee;
  const attackerTerrain = window.getTerrainAt(attacker.hex.q, attacker.hex.r);
  const targetTerrain = window.getTerrainAt(target.hex.q, target.hex.r);
  let hitChance = 50 + baseHit + attackerTerrain.hitBonus - (target.passiveDodge + targetTerrain.dodgeBonus);
  if (attacker.toHitVsAnimal && target.tags?.includes('animal')) hitChance += attacker.toHitVsAnimal;
  
  // FOLIAGE DEFENSE
  if (targetTerrain.name === 'Foliage') {
      let foliagePenalty = (isRanged ? 10 : 0);
      if (target.skills?.elf_foliage_expertise || target.skills?.druid_foliage_expertise) foliagePenalty += 10;
      hitChance -= foliagePenalty;
  }

  // COVER: behind any elevated terrain (pedestals, fort ramparts)
  if (window.isCoveredFromRangedAttack(target)) {
      window.showMessage(`${target.name} has cover (Cover bonus: -5 hit)`);
      hitChance -= 5;
  }

  if (attacker.equipped?.weapon && attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon') hitChance -= 5;
  if (isOffhand) hitChance -= 5;
  if (weapon && attacker.skills[`${weapon.id}_hit`]) hitChance += 5;

  const roll = Math.floor(Math.random() * 100);
      // If it's a miss, check for reactions
      const missCallbackFinal = () => {
          // SHIELD BASH (existing)
          if (target.skills?.shield_bash && target.timePoints >= 3) {
              const shieldId = target.equipped?.offhand;
              if (shieldId && window.items[shieldId].type === 'shield' && !target.reactionBlocked) {
                  window.requestReaction(target, [{id:'shield_bash', name:'Shield Bash', tpCost:3}], (bashChoice) => {
                      if (bashChoice === 'shield_bash') {
                          spendTP(target, 3);
                          sharedMessage(`${target.name} counter-attacks with a Shield Bash!`);
                          const hitChance = 50 + target.toHitMelee - attacker.passiveDodge;
                          if (Math.random() * 100 < hitChance) {
                              const dmg = target.baseDamage || 1;
                              attacker.hp -= dmg;
                              if (attacker.hp <= 0) { attacker.alive = false; sharedMessage(`${attacker.name} defeated!`); checkCombatEnd(); }
                          } else { sharedMessage("Shield Bash misses!"); }
                      }
                  }, "The enemy missed! Use Shield Bash?");
              }
          }
          // MONK TRIP REACTION
          if (target.skills?.trip_reaction && target.timePoints >= 2 && !target.reactionBlocked && !isRanged) {
              window.requestReaction(target, [{id:'trip_counter', name:'Counter Trip', tpCost:2}], (choice) => {
                  if (choice === 'trip_counter') {
                      spendTP(target, 2);
                      window.showMessage(`${target.name} attempts a Counter Trip!`);
                      const hitChance = 50 + target.toHitMelee - attacker.passiveDodge;
                      if (Math.random() * 100 < hitChance) {
                          window.showMessage(`${target.name} trips ${attacker.name}!`);
                          attacker.timePoints = Math.max(0, attacker.timePoints - 5);
                      } else { window.showMessage("Counter Trip fails!"); }
                  }
              }, "The enemy missed! Attempt Counter Trip?");
          }
          if (missCallback) missCallback();
      };

      if (roll >= hitChance) {
          sharedMessage(`${attacker.name} misses ${target.name}! (Roll: ${roll} vs Need: <${hitChance})`);
          if (window.spawnFloatingText) window.spawnFloatingText(target.hex, 'Miss', '#ccc');
          if (!isOffhand) attacker.offhandAttackAvailable = (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
          missCallbackFinal();
          return;
      }
  let dmg = (attacker.baseDamage || 1) + (weapon?.damage || 0) + ((attacker.skills[`${weapon?.id}_dmg`] || 0) * 2) + (attacker.skills['meleeDamage'] || 0) + bonusDamage;
  if (isOffhand) dmg -= 2;

  // DWARF AXE MASTERY
  if (weapon?.id === 'axe' && attacker.skills?.dwarf_axe_mastery) dmg += 2;

  // SNEAK ATTACK / BACKSTAB
  if (attacker.skills?.sneak_attack_dmg) {
      const enemies = window.entities.filter(e => e.alive && e.side !== attacker.side);
      const isSeen = enemies.some(e => canSee(e, attacker));
      if (!isSeen) {
          const saBonus = attacker.skills.sneak_attack_dmg * 4;
          dmg += saBonus;
          sharedMessage(`Sneak Attack! (+${saBonus} damage)`);
      }
  }

  // Caught off-guard mid-rest: armor was off, so equipment reduction doesn't
  // apply until the ambush fight is over (see triggerRestAmbush).
  let red = target.caughtOffGuard ? 0 : (target.baseReduction || 0) +
            (target.equipped?.armor && window.items[target.equipped.armor] ? window.items[target.equipped.armor].reduction : 0) +
            (target.equipped?.offhand && window.items[target.equipped.offhand] && window.items[target.equipped.offhand].type === 'shield' ? (window.items[target.equipped.offhand].reduction + (target.skills?.shield_proficiency || 0)) : 0) +
            (target.equipped?.helmet && window.items[target.equipped.helmet] ? (window.items[target.equipped.helmet].reduction || 0) : 0) +
            (target.tempReduction || 0) +
            (target.skills?.spectral_form ? 2 : 0);
  let fd = Math.max(1, dmg - red);
  
  // HEALING REDUCTION / PENALTIES (Not applicable to damage directly but noted)

  sharedMessage(`${attacker.name} hits ${target.name} for ${fd} damage! (${dmg} base - ${red} reduction)`);
  if (window.spawnFloatingText) window.spawnFloatingText(target.hex, `-${fd}`, '#ff4d4d');
  if (window.flashEntity) window.flashEntity(target, '#f00');
  target.hp -= fd; syncBackToPlayer(target);

  // UNARMED REACTION BLOCK
  if (!weapon && attacker.skills?.unarmed_reaction_block) {
      target.reactionBlocked = true;
      sharedMessage(`${target.name}'s pressure points were struck! Reactions blocked.`);
  }

  // POISON LOGIC
  if (attacker.skills?.poison_bite && Math.random() < 0.5) {
      target.poisonTicks = 10;
      target.poisonDamage = 2;
      sharedMessage(`${target.name} is poisoned!`);
  }

  // LIFE DRAIN (Wraith)
  if (attacker.skills?.life_drain) {
      const drained = Math.min(fd, 2);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + drained);
      sharedMessage(`${attacker.name} drains ${drained} HP from ${target.name}!`);
  }

  // LICH: Grave Chill - melee attacks heal the attacker a flat amount per rank
  if (attacker.lifeDrainOnMeleeHit && !isRanged) {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.lifeDrainOnMeleeHit);
      syncBackToPlayer(attacker);
      sharedMessage(`${attacker.name}'s Grave Chill drains ${attacker.lifeDrainOnMeleeHit} HP from ${target.name}!`);
  }

  // LICH: Withering Touch - stacking damage-over-time on hit
  if (attacker.witheringTouchStacks) {
      target.witherTicks = (target.witherTicks || 0) + 5;
      target.witherDamage = attacker.witheringTouchStacks;
  }

  // Set last seen hex so they can search if stealthed
  target.lastSeenTargetHex = { q: attacker.hex.q, r: attacker.hex.r };
  
  if (window.isResting && target.side === 'player') {
      window.isResting = false;
      window.showMessage("Rest interrupted by damage!");
      window.updateRestButton();
  }

  attacker.offhandAttackAvailable = !isOffhand && (attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon');
  if (target.hp <= 0 && target.alive) {
      handleLethalDamage(target, attacker);
  }

  // SLIP AWAY: after being successfully hit, immediately relocate to an
  // adjacent unoccupied hex — too heavy in medium/heavy armor to pull off.
  if (target.alive && !target.unconscious && !target.reactionBlocked && target.skills?.slip_away && target.timePoints >= 5) {
      const isLightOrNoArmorTarget = !target.equipped || !target.equipped.armor || window.items[target.equipped.armor]?.id === 'light_armor';
      if (isLightOrNoArmorTarget) {
          window.requestReaction(target, [{ id: 'slip_away', name: 'Slip Away', tpCost: 5 }], (choice) => {
              if (choice === 'slip_away') {
                  const openHex = window.getNeighbors(target.hex.q, target.hex.r).find(h =>
                      !getEntityAtHex(h.q, h.r) && window.getTerrainAt(h.q, h.r).name !== 'Wall' && window.getTerrainAt(h.q, h.r).name !== 'Water');
                  if (openHex) {
                      spendTP(target, 5);
                      target.hex = openHex;
                      if (target.riding) target.riding.hex = { q: openHex.q, r: openHex.r };
                      sharedMessage(`${target.name} slips away!`);
                      window.drawMap();
                      window.renderEntities();
                  }
              }
          }, `${target.name} was hit! Slip Away?`);
      }
  }
}

// Does any (conscious, alive) entity in this opponent list have heal
// capability? Reuses the exact same skill key the AI's own self-heal check
// already keys off (learn_heal). Extracted as a named function so it can be
// tested directly rather than re-derived in test code.
function opponentsHaveHealerCapability(opponents) {
    return opponents.some(o =>
        o.alive && !o.unconscious && (o.skills?.learn_heal || (o.unlockedBaseSpells || []).includes('heal'))
    );
}

// Target-priority comparator for aiProcess's attack target selection.
// Deprioritizes unconscious (downed but not yet truly dead) opponents unless
// the opposing side has a healer, in which case finishing off a downed
// target before they can be saved becomes the priority instead.
function targetPriorityCompare(entity, a, b, opponentsHaveHealer) {
    const aDown = !!a.unconscious, bDown = !!b.unconscious;
    if (aDown !== bDown) {
        // Difficulty guard for the Hollowmere shakedown tutorial fight: a
        // fresh level-1 protagonist shouldn't be able to get permanently
        // finished off by "smart" AI in the very first scripted encounter,
        // so entities flagged tutorialFightGuard never apply the
        // finish-the-downed-target-before-the-healer-saves-them logic to
        // window.party[0] specifically (still applies normally to allies).
        if (entity.tutorialFightGuard) {
            const mainName = window.party?.[0]?.name;
            if (aDown && a.name === mainName) return 1;
            if (bDown && b.name === mainName) return -1;
        }
        if (opponentsHaveHealer) return aDown ? -1 : 1; // finish them off before the healer saves them
        return aDown ? 1 : -1; // otherwise leave downed targets alone
    }
    return getMinDistance(entity, a) - getMinDistance(entity, b);
}
window.opponentsHaveHealerCapability = opponentsHaveHealerCapability;
window.targetPriorityCompare = targetPriorityCompare;

// Shared by both the melee/ranged death check (above) and the spell-damage
// death check below, so the two paths can't drift out of sync. Player-side
// entities go unconscious at 0 HP (stay alive:true — still a valid target,
// still rendered, just excluded from turn order) and only truly die at
// -50% max HP; everyone else keeps the original defeat/loot/XP behavior.
function handleLethalDamage(target, attacker) {
    // REVENANT: Rise again once at half HP before marking truly dead
    if (target.skills?.revenant_revive && !target.revenantRevived) {
        target.revenantRevived = true;
        target.alive = true;
        target.hp = Math.ceil(target.maxHp / 2);
        sharedMessage(`${target.name} refuses to stay dead — it rises again at half health!`);
        return; // abort normal death processing this time
    }

    // LICH: Soul Anchor - once per rest, a would-be lethal hit leaves you at
    // 1 HP instead. Consumed on use; restored the same way TP/rest recovery
    // already works (see the rest/sleep completion code that clears it).
    if (target.side === 'player' && target.hasSoulAnchor && !target.soulAnchorUsed) {
        target.soulAnchorUsed = true;
        target.hp = 1;
        syncBackToPlayer(target);
        window.showMessage(`${target.name}'s soul refuses to leave — Soul Anchor holds them at 1 HP!`);
        return;
    }

    if (target.side === 'player') {
        const trueDeathThreshold = -(target.maxHp * 0.5);
        if (target.hp <= trueDeathThreshold) {
            target.alive = false;
            target.unconscious = false;
            window.showMessage(`${target.name} has fallen...`);
            if (window.checkGameOverState) window.checkGameOverState(target);
        } else if (!target.unconscious) {
            target.unconscious = true;
            window.showMessage(`${target.name} is knocked unconscious!`);
            if (window.updateActionButtons) window.updateActionButtons();
        }
        return;
    }

    target.alive = false; window.showMessage(`${target.name} defeated!`);
    if (window.triggerScreenShake) window.triggerScreenShake();
    const side = target.side;

    // Leave a harvestable corpse behind for animal-tagged kills (see
    // leaveCorpse/harvestCorpse in resources.js) — gated on Knowledge:
    // Nature's nature_butchery sub-skill, not the base skill itself.
    if (target.tags?.includes('animal') && window.leaveCorpse) window.leaveCorpse(target);

    // ROGUELIKE: Remove from graveyard if a graveyard merc dies
    if (target.isGraveyardMerc) {
        window.roguelikeData.mercenaryGraveyard = window.roguelikeData.mercenaryGraveyard.filter(m => m.name !== target.name);
        localStorage.setItem('rpg_roguelike_data', JSON.stringify(window.roguelikeData));
    }

    // ROGUELIKE: Track max enemy skills for rewards
    if (attacker.side === 'player' && target.side === 'enemy') {
        if (!window.runMaxEnemySkills) window.runMaxEnemySkills = {};
        for (const tree in window.skills) {
            const ranks = target.skills[tree] || 0;
            window.runMaxEnemySkills[tree] = Math.max(window.runMaxEnemySkills[tree] || 0, ranks);
        }
    }

    if (attacker.side === 'player') {
        if (target.expValue) window.gainExp(target.expValue);
        if (target.gold) window.player.gold += target.gold;
        target.inventory.forEach(i => window.player.inventory.push(i));
        // Killing the necromancer's undead minions is plain reputation, same
        // as fighting any other faction's forces — no bespoke flag needed.
        if (target.necromancerMinion && window.factions?.necromancer_cult) {
            window.adjustReputation(window.factions.necromancer_cult, -5, 5);
        }
    }
    if (side === 'enemy') checkCombatEnd();
}

// Game Over triggers specifically on the main character's (window.party[0])
// true death — not a full-party wipe. If only companions/allies go down the
// fight continues; this matches "my main character died, that's game over"
// rather than requiring every ally to fall too.
function checkGameOverState(target) {
    if (window.gameOver) return;
    const mainCharName = window.party && window.party[0] && window.party[0].name;
    if (!mainCharName || target.name !== mainCharName) return;

    window.gameOver = true;
    const modal = document.getElementById('game-over-modal');
    const msg = document.getElementById('game-over-message');
    if (msg) msg.innerText = `${target.name} has fallen.`;
    if (modal) modal.style.display = 'block';
}
window.checkGameOverState = checkGameOverState;
window.handleLethalDamage = handleLethalDamage;

function checkCombatEnd() {
    // Track Boss defeats
    if (!window.roguelikeData.bossesDefeated) window.roguelikeData.bossesDefeated = [];

    window.entities.forEach(e => {
        if (e.side === 'enemy' && !e.alive) {
            if (['Grishnak', 'Sir Alistair', 'Viper', 'Krog the Unstoppable', 'Sylvara the Huntress'].includes(e.name)) {
                if (!window.roguelikeData.bossesDefeated.includes(e.name)) {
                    window.roguelikeData.bossesDefeated.push(e.name);
                }
            }
        }
    });

    // Only check for ACTIVE enemies
    const aliveEnemies = window.entities.filter(e => e.side === 'enemy' && e.alive);
    console.log(`[ARENA] checkCombatEnd â€” isInArena=${window.isInArena} aliveEnemies=${aliveEnemies.length} totalEntities=${window.entities.length}`);
    if (aliveEnemies.length > 0) console.log('[ARENA] checkCombatEnd: enemies still alive, no transition');
    if (!window.entities.some(e => e.side === 'enemy' && e.alive)) {
        // Ambush is over — armor protection applies again.
        window.entities.forEach(e => { if (e.caughtOffGuard) e.caughtOffGuard = false; });

        // Combat just ended — capture who's hurt/low on mana so the
        // out-of-combat regen loop starts healing them immediately rather
        // than waiting for the next throttled restless-set rebuild.
        if (window.rebuildRestlessSet) window.rebuildRestlessSet();

        // A sleep-ambush fight doesn't end the night's rest — go back to sleep.
        if (window._resumeSleepAfterCombat) {
            window._resumeSleepAfterCombat = false;
            window.isSleeping = true;
            window.showMessage("With the danger past, you settle back down to sleep.");
            if (window.updateSleepButton) window.updateSleepButton();
        }

        // Combat Ended Auto-save
        if (window.saveGame && !window.ironmanMode) {
             window.saveGame("AutoSave_CombatEnd");
        }

        if (window.currentCampaign === "2" && window.hollowmereFightTriggered && window.factions?.ironbond_company && !window.hollowmereVictoryBonusGiven) {
            window.hollowmereVictoryBonusGiven = true;

            // Small extra goodwill bump from Hollowmere's locals for winning the
            // brawl, cascaded up the same feudal chain as the dialogue choice.
            const silverhart = window.factions.silverhart_kingdom;
            const garrick = window.entities.find(e => e.name === 'Garrick Holt');
            const elder = window.regionalNPCs?.elder;
            const baron = window.regionalNPCs?.baron;
            if (window.cascadeReputation) {
                window.cascadeReputation([garrick?.reputation, elder?.reputation, baron?.reputation, silverhart], 5, 5);
            }

            // Force a clean, explicit return to real-time exploration mode —
            // don't just rely on the next tick's implicit recomputation — and
            // release the allies from combat posture now that the fight is won.
            window.isInCombat = false;
            window.gamePhase = 'WAITING';
            window.currentTurnEntity = null;
            ['Garrick Holt', 'Mira Ashbrook', 'Oskar Vinn'].forEach(name => {
                const ally = window.entities.find(e => e.name === name && e.alive);
                if (ally) {
                    // Settle back into being ordinary tavern NPCs rather than
                    // staying in the player's directly-controllable party.
                    ally.side = 'neutral';
                    ally.isNPC = true;
                    ally.aiState = 'idle';
                    ally.aiControlled = false;
                    ally.timePoints = 0;
                }
            });

            window.triggerAmbientDialogue('hollowmere_victory');
            if (window.offerBodyDisposalQuest) window.offerBodyDisposalQuest();
            if (window.updateActionButtons) window.updateActionButtons();
            if (window.updateTurnIndicator) window.updateTurnIndicator();
            window.drawMap();
            window.renderEntities();
        }

        // Border War: the sally-out fight against Northwatch's siege engine
        // (see startNorthwatchSally, campaign2Dialogue.js) resolves through
        // this same "all enemies dead" gate every other Campaign 2 scripted
        // fight uses — same known limitation as the Hollowmere branch above
        // (any unrelated alive enemy elsewhere on the map blocks this check
        // too), accepted for the same reason it was there.
        if (window.currentCampaign === "2" && window.borderWarSallyActive) {
            window.borderWarSallyActive = false;
            const quest = (window.questLog || []).find(q => q.id === 'border_war');
            if (quest) { quest.status = 'completed'; quest.resolution = 'siege_broken'; }
            if (window.factions?.orc_raiders) window.adjustReputation(window.factions.orc_raiders, -20, 15);
            if (window.adjustRegionStat) window.adjustRegionStat('aldervale', 'security', 10);
            window.isInCombat = false;
            window.gamePhase = 'WAITING';
            window.currentTurnEntity = null;
            window.showMessage("The siege engine splinters into wreckage — Northwatch's wall holds.");
            if (window.updateActionButtons) window.updateActionButtons();
            if (window.updateTurnIndicator) window.updateTurnIndicator();
        }

        if (window.currentCampaign === "1" && window.isInArena) {
            window.isInArena = false;
            window.triggerAmbientDialogue('arena_victory');
            
            // AUDIO: Victory fade out
            if (window.stopAllMusic) window.stopAllMusic(0.8);

            setTimeout(() => {
                setupArenaLobby();
                window.drawMap();
                window.renderEntities();
                const firstPlayer = window.entities.find(e => e.side === 'player' && !e.rider);
                if (firstPlayer) {
                    window.centerCameraOn(firstPlayer.hex);
                }
                if (window.updateActionButtons) window.updateActionButtons();
            }, 2000);
            return;
        }

        // ... (existing logic)
        if (window.updateActionButtons) window.updateActionButtons();
    }

    // AUDIO: If staying in arena but combat ended (no active combat AI states)
    const inCombat = window.entities.some(e => e.alive && e.side === 'enemy' && e.aiState === 'combat');
    if (!inCombat && window.isInArena) {
        // Transition back to pre-battle music
        if (window.playArenaMusic) window.playArenaMusic('preBattle', 0.6);
    }
}

function spawnNewMonster() {
    const p = window.entities.find(e => e.side === 'player');
    const totalLevel = window.party.reduce((sum, c) => sum + c.level, 0);
    // Spawn a BUNCH of monsters in a large radius
    const num = 5 + Math.floor(Math.random() * 5); 
    
    for (let i = 0; i < num; i++) {
        // Range 20 to 80 hexes away
        const dist = 20 + Math.floor(Math.random() * 60);
        const angle = Math.random() * Math.PI * 2;
        // Approximate hex offset from angle/dist
        // q = dist * cos(angle)
        // r = dist * sin(angle) -ish (Axial conversion is weirder but this is random noise so fine)
        
        const qOff = Math.floor(dist * Math.cos(angle));
        const rOff = Math.floor(dist * Math.sin(angle));
        
        const h = { q: p.hex.q + qOff, r: p.hex.r + rOff };
        
        let type = 'goblin';
        const roll = Math.random();
        if (totalLevel >= 10 && roll > 0.95) type = 'troll';
        else if (roll > 0.90) type = 'zombie';
        else if (roll > 0.85) type = 'skeleton';
        else if (roll > 0.80) type = 'imp';
        else if (roll > 0.75) type = 'wolf_rider_goblin';
        else if (roll > 0.65) type = 'orc';
        else if (roll > 0.50) type = 'wolf';
        
        const template = window.monsterTemplates[type];
        const extraHexes = template.extraHexes || [];
        
        // Find preferred terrain nearby
        if (template.preferredTerrain) {
            const range = 15;
            let found = false;
            for(let dq=-range; dq<=range && !found; dq++) {
                for(let dr=Math.max(-range, -dq-range); dr<=Math.min(range, -dq+range); dr++) {
                    const th = { q: h.q + dq, r: h.r + dr };
                    const terr = window.getTerrainAt(th.q, th.r);
                    if (terr.name === template.preferredTerrain && !getEntityAtHex(th.q, th.r)) {
                        h.q = th.q; h.r = th.r;
                        found = true;
                        break;
                    }
                }
            }
        }

        const allSpawnHexes = [{q: h.q, r: h.r}, ...extraHexes.map(off => ({q: h.q + off.q, r: h.r + off.r}))];
        let canSpawn = true;
        for (let sh of allSpawnHexes) {
            // Check water and occupation
            if (window.getTerrainAt(sh.q, sh.r).name === 'Water' || getEntityAtHex(sh.q, sh.r) || window.getTerrainAt(sh.q, sh.r).name === 'Wall') {
                canSpawn = false; break;
            }
        }
        if (canSpawn) {
            const m = window.createMonster(type, h);
            m.aiState = 'idle'; // Start idle!
            window.entities.push(m);
        }
    }
}

function cancelSpell(instanceId) {
    const spellIdx = window.activeSpells.findIndex(s => s.spellInstanceId === instanceId);
    if (spellIdx === -1) return;

    const spell = window.activeSpells[spellIdx];
    // Remove entity if it was a summon
    if (spell.entityId) {
        const ent = window.entities.find(e => e.id === spell.entityId);
        if (ent) {
            ent.alive = false;
            window.showMessage(`${ent.name} vanishes as the summon spell ends.`);
            checkCombatEnd();
        }
    }

    // Restore terrain if AOE
    if (spell.targetHexes) {
        spell.targetHexes.forEach(h => {
            const key = `${h.q},${h.r}`;
            delete window.overrideTerrain[key];
        });
    }

    window.activeSpells.splice(spellIdx, 1);
    window.showMessage(`Cancelled spell: ${spell.name}`);
    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
}

function breakStealth(entity) {
    if (!entity.isStealthed) return;
    entity.isStealthed = false;
    entity.stealthScore = 0;
    window.showMessage(`${entity.name} is no longer stealthed.`);
    window.updateActionButtons();
}

function tryStealth(entity) {
    if (entity.isStealthed) {
        breakStealth(entity);
        return false;
    }

    // Cannot stealth if currently seen by ANY enemy (if player) or ANY player (if enemy)
    const opponentSide = entity.side === 'player' ? 'enemy' : 'player';
    const opponents = window.entities.filter(e => e.alive && e.side === opponentSide);
    const isSeen = opponents.some(o => canSee(o, entity));
    
    if (isSeen) {
        window.showMessage(`${entity.name} cannot stealth while seen!`);
        return false;
    }

    entity.isStealthed = true;
    // Calculate initial stealth score for detection checks
    let score = 50;
    if (entity.skills?.stealth_agility) score += 5;
    if (entity.skills?.stealth_rogue) score += 5;
    const light = window.lightLevel || 1.0;
    score -= (light * 40);
    const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
    score += (terrain.stealthBonus || 0);
    if (terrain.name === 'Foliage' && (entity.skills?.elf_foliage_expertise || entity.skills?.druid_foliage_expertise)) {
        score += 20;
    }
    if (entity.equipped?.armor) {
        const aid = entity.equipped.armor;
        if (aid === 'heavy_armor') score -= 30;
        else if (aid === 'medium_armor') score -= 15;
    }
    entity.stealthScore = score;

    window.showMessage(`${entity.name} is now moving stealthily.`);
    window.updateActionButtons();
    return true;
}

function tryShove(shover, target) {
    if (target.noAttack) {
        if (shover.side === 'player') window.showMessage(`${target.name} isn't part of any fight — leave them be.`);
        return false;
    }
    if (!window.areAdjacent(shover.hex, target.hex)) {
        window.showMessage("Target is not adjacent for shove.");
        return false;
    }
    if (shover.timePoints < 5) {
        window.showMessage("Not enough time points to shove.");
        return false;
    }

    const attackerTerrain = window.getTerrainAt(shover.hex.q, shover.hex.r);
    const targetTerrain = window.getTerrainAt(target.hex.q, target.hex.r);
    const hitChance = 50 + shover.toHitMelee + attackerTerrain.hitBonus - (target.passiveDodge + targetTerrain.dodgeBonus);
    const roll = Math.floor(Math.random() * 100);
    if (roll >= hitChance) {
        sharedMessage(`${shover.name} tries to shove ${target.name} but misses! (Roll: ${roll} vs Need: <${hitChance})`);
        spendTP(shover, 5);
        window.playerAction = null;
        return true; 
    }

    // RESISTANCE CHECK
    if (Math.random() * 100 < (target.forcedMoveResistance || 0)) {
        window.showMessage(`${target.name} stands solid as a rock and resists the shove!`);
        spendTP(shover, 5);
        window.playerAction = null;
        return true;
    }

    const newHex = window.getHexBehind(shover.hex, target.hex);
    const isOccupied = getEntityAtHex(newHex.q, newHex.r);

    if (isOccupied) {
        window.showMessage("Cannot shove target into an occupied hex.");
        return false;
    }

    if (!window.isHexInBounds(newHex)) {
        window.showMessage("Cannot shove target off the map.");
        return false;
    }
    
    window.showMessage(`${shover.name} shoves ${target.name}.`);
    target.hex = newHex;
    spendTP(shover, 5);
    window.playerAction = null; 
    return true;
}

function lootItems(entity) {
    const coord = `${entity.hex.q},${entity.hex.r}`;
    const items = window.mapItems[coord];
    if (!items || items.length === 0) return;

    if (entity.timePoints < 1) {
        if (entity.side === 'player') window.showMessage("Not enough TP to loot.");
        return;
    }

    items.forEach(itemId => {
        if (entity.side === 'player') {
            const char = window.party.find(p => p.name === entity.name);
            if (char) char.inventory.push(itemId);
            window.showMessage(`${entity.name} looted ${window.items[itemId].name}.`);
            if (window.showTutorialTip) window.showTutorialTip('acquired_item', "New gear sits in your Inventory until you equip it — open the Inventory screen and click Equip on it to actually use it.");
        } else {
            entity.inventory.push(itemId);
            window.showMessage(`${entity.name} looted ${window.items[itemId].name}.`);
        }
    });

    window.mapItems[coord] = [];
    spendTP(entity, 1);

    if (entity.side === 'player') {
        window.updateActionButtons();
        window.showInventoryScreen();
        if (!window.isInCombat) deconflictPartyStacking();
    }
    window.drawMap();
    window.renderEntities();
}

window.renderEntities = renderEntities;
window.handleClick = handleClick;
window.tryAttack = tryAttack;
window.cancelSpell = cancelSpell;

function setupArenaLobby() {
    console.log(`[ARENA] setupArenaLobby called â€” isInArena=${window.isInArena}`);
    console.trace('[ARENA] setupArenaLobby call stack');
    window.gamePhase = 'WAITING';
    if (window.stopAllMusic) window.stopAllMusic(0.8);

    // If we are already in the arena (multiplayer sync), don't reset the map
    if (window.isInArena) {
        console.log('[ARENA] setupArenaLobby: isInArena=true, redrawing only (no lobby reset)');
        window.drawMap();
        window.renderEntities();
        window.showCharacter();
        if (window.snapVisuals) window.snapVisuals();
        return;
    }
    console.log(`[ARENA] setupArenaLobby: resetting to lobby. entities=${JSON.stringify(window.entities.map(e=>({name:e.name,side:e.side,alive:e.alive})))}`);


    // Keep existing player entities (horses, summons) instead of just party data
    const playerEntities = window.entities.filter(e => e.side === 'player' && e.alive);
    
    window.entities = [];
    window.mapItems = {};
    window.overrideTerrain = {};
    window.tileObjects = {};
    window.exploredHexes = new Set(); 
    window.lastSeenTimeMap = {};
    window.indoorLightMult = 0.0; // Lobby is 0% daylight
    window.lobbyTPSpent = 0;
    window.hasTriggeredImpatience = false;
    window.startSleepTime = 0; 

    // Two rooms built as true hex-distance circles (not q/r bounding
    // rectangles) — a rectangular q/r range reads as a slanted rhombus once
    // drawn through the axial hex projection, while a hex-distance circle
    // reads as a proper rounded room. Joined by a short corridor.
    const SPAWN_ROOM_CENTER = { q: -7, r: 0 };
    const NPC_ROOM_CENTER = { q: 7, r: 0 };
    const ROOM_RADIUS = 5;
    window.arenaSpawnRoomCenter = SPAWN_ROOM_CENTER;
    window.arenaNpcRoomCenter = NPC_ROOM_CENTER;

    for (let q = -12; q <= 12; q++) {
        for (let r = -8; r <= 8; r++) {
            window.setTerrainAt(q, r, 'Wall');

            if (window.distance({ q, r }, SPAWN_ROOM_CENTER) <= ROOM_RADIUS) {
                window.setTerrainAt(q, r, 'Cave Floor');
            }
            if (window.distance({ q, r }, NPC_ROOM_CENTER) <= ROOM_RADIUS) {
                window.setTerrainAt(q, r, 'Cave Floor');
            }
            // Connecting passage
            if (q > -3 && q < 3 && r >= -1 && r <= 1) {
                window.setTerrainAt(q, r, 'Cave Floor');
            }
        }
    }

    // Carve the gated beast pen out of a corner of the SPAWN room (the
    // player's first room) before it fills with the humanoid preview
    // fighters below — a fenced enclosure (reusing the farm's
    // fence_h/fence_v tileObjects, which slow movement but don't block LOS,
    // so the player can see the beast without being able to casually walk
    // up on it) housing whichever beast-type "waiting combatant" got
    // rolled. Outer footprint is 9x7 (including the fence ring) so the
    // walkable interior is a full 7x5 — big enough for large beasts like
    // dragons, unlike the old 5x3-outer/3x1-interior pen.
    //
    // Only the side facing the room (PEN_MAX_Q, where the player actually
    // approaches from) is a real passable-but-slow fence. The other three
    // sides get real Wall terrain underneath the fence dressing — fences
    // slow movement but never blocked it, so a player could wander through
    // the far side and off the edge of the explicitly-painted lobby map
    // into raw, unset procedural terrain (which can resolve to Water).
    // Solid walls there close that leak regardless of pen position.
    const PEN_MIN_Q = -17, PEN_MAX_Q = -9, PEN_MIN_R = 2, PEN_MAX_R = 8;
    for (let q = PEN_MIN_Q; q <= PEN_MAX_Q; q++) {
        for (let r = PEN_MIN_R; r <= PEN_MAX_R; r++) {
            window.setTerrainAt(q, r, 'Cave Floor');
        }
    }
    for (let q = PEN_MIN_Q; q <= PEN_MAX_Q; q++) {
        window.setTerrainAt(q, PEN_MIN_R, 'Wall');
        window.setTerrainAt(q, PEN_MAX_R, 'Wall');
        window.tileObjects[`${q},${PEN_MIN_R}`] = { type: 'fence_h', lightRadius: 0 };
        window.tileObjects[`${q},${PEN_MAX_R}`] = { type: 'fence_h', lightRadius: 0 };
    }
    for (let r = PEN_MIN_R; r <= PEN_MAX_R; r++) {
        window.setTerrainAt(PEN_MIN_Q, r, 'Wall');
        window.tileObjects[`${PEN_MIN_Q},${r}`] = { type: 'fence_v', lightRadius: 0 };
        window.tileObjects[`${PEN_MAX_Q},${r}`] = { type: 'fence_v', lightRadius: 0 };
    }
    // Interior hexes (not on the fence line itself) where a beast can stand — 5x3.
    const PEN_INTERIOR_HEXES = [];
    for (let q = PEN_MIN_Q + 1; q <= PEN_MAX_Q - 1; q++) {
        for (let r = PEN_MIN_R + 1; r <= PEN_MAX_R - 1; r++) {
            PEN_INTERIOR_HEXES.push({ q, r });
        }
    }

    // 1. Initialize from party data first to ensure main characters exist
    window.party.forEach((p, i) => {
        // Only create if it doesn't already exist in playerEntities
        let ent = playerEntities.find(e => e.name === p.name);
        if (!ent) {
            const spawnHex = { q: -8 + Math.floor(i/3), r: -2 + (i%3) };
            ent = new window.Entity(p.name, "red", spawnHex, (p.attributes?.agility || 10) + 10);
            ent.side = 'player';
            Object.assign(ent, p);
            ent.destination = null;
            ent.moveCooldown = 0;
            playerEntities.push(ent);
        }
        
        // Ensure local player reference is updated if this is the first (main) character
        if (i === 0) window.player = ent;
    });

    // 2. Put all player entities (including any new ones from party) into the world
    playerEntities.forEach((e, i) => {
        e.hex = { q: -8 + Math.floor(i/3), r: -2 + (i%3) };
        if (e.riding) e.riding.hex = { q: e.hex.q, r: e.hex.r };
        e.destination = null; 
        e.moveCooldown = 0;
        window.entities.push(e);
    });

    // Spawn NPCs in the right room
    const announcer = new window.Entity("Arena Announcer", "yellow", {q: 6, r: -3}, 10);
    announcer.isNPC = true;
    announcer.side = 'neutral';
    announcer.gender = 'male';
    announcer.race = 'human';
    announcer.customImage = 'arenaannouncer';
    window.entities.push(announcer);

    const shopkeeper = new window.Entity("Shopkeeper", "green", {q: 4, r: 3}, 10);
    shopkeeper.isNPC = true;
    shopkeeper.side = 'neutral';
    shopkeeper.gender = 'female';
    shopkeeper.race = 'dwarf';
    shopkeeper.customImage = 'arenashopkeeper';
    window.entities.push(shopkeeper);

    const recruiter = new window.Entity("Mercenary Recruiter", "cyan", {q: 8, r: 2}, 10);
    recruiter.isNPC = true;
    recruiter.side = 'neutral';
    recruiter.gender = 'male';
    recruiter.race = 'elf';
    recruiter.customImage = 'arenamercenary';
    window.entities.push(recruiter);

    // "Waiting combatants" — drawn from the exact same pool the next fight
    // rolls its opponents from (see ARENA_MONSTER_POOL/startArenaFight), so
    // these aren't just flavor: about half the time, one of them really is
    // who you end up facing. Beast-type rolls go in the gated pen;
    // humanoids mill around loose. All of them are isNPC + noAttack —
    // dialogue only, never a valid combat target, even via Force-Attack.
    const fightsCompleted = window.roguelikeData.fightsCompleted || 0;
    const previewPool = [...ARENA_MONSTER_POOL];
    if (fightsCompleted >= 6) previewPool.push('dragon_young');
    if (fightsCompleted >= 12) previewPool.push('dragon_adult');
    if (fightsCompleted >= 20) previewPool.push('dragon_ancient');

    window.arenaLobbyPreviewTypes = [];
    while (window.arenaLobbyPreviewTypes.length < Math.min(2, previewPool.length)) {
        const t = previewPool[Math.floor(Math.random() * previewPool.length)];
        if (!window.arenaLobbyPreviewTypes.includes(t)) window.arenaLobbyPreviewTypes.push(t);
    }

    // Humanoid preview fighters also live in the spawn room now, clear of
    // both the party's own spawn hexes and the beast pen.
    const humanoidHexes = [{ q: -9, r: -3 }, { q: -4, r: 1 }];
    const beastHexes = [...PEN_INTERIOR_HEXES];
    let humanoidSlot = 0, beastSlot = 0;
    window.arenaLobbyPreviewTypes.forEach(type => {
        const isBeast = ARENA_BEAST_TYPES.includes(type);
        const hex = isBeast ? beastHexes[beastSlot++] : humanoidHexes[humanoidSlot++];
        if (!hex || !window.createMonster) return;
        const combatant = window.createMonster(type, hex, null, null, 'neutral');
        combatant.isNPC = true;
        combatant.noAttack = true;
        combatant.behaviorType = 'idle';
        combatant.arenaFlavorLine = ARENA_FLAVOR_LINES[type] || `${combatant.name} waits quietly, watching the pit.`;
        window.entities.push(combatant);
    });

    // Fireplace in the center of NPC room
    window.tileObjects["6,0"] = { type: 'fireplace', lightRadius: 12 };
    // Fireplace in spawn room
    window.tileObjects["-6,0"] = { type: 'fireplace', lightRadius: 8 };

    // Dress the bare cave floor with the same table/bench furniture used in
    // the tavern — cheap, reuses existing art, keeps clear of NPC/spawn/pen hexes.
    window.tileObjects["4,-2"] = { type: 'table' };
    window.tileObjects["5,-1"] = { type: 'bench' };
    window.tileObjects["9,3"] = { type: 'table' };
    window.tileObjects["10,4"] = { type: 'bench' };
    window.tileObjects["-9,-1"] = { type: 'table' };
    window.tileObjects["-9,1"] = { type: 'bench' };
    // A grim touch of "used arena" flavor near the pen rather than flat cave floor everywhere.
    window.tileObjects["12,-1"] = { type: 'blood_spatter_faint' };

    window.drawMap();
    window.renderEntities();
    window.showCharacter();
    if (window.snapVisuals) window.snapVisuals();
    window.runTickInternal();

    if (window.broadcastFullState && (!window.multiplayer || !window.multiplayer.initializing)) {
        window.broadcastFullState();
    }
}

function startArenaFight() {
    console.log('[ARENA] startArenaFight called');
    window.triggerAmbientDialogue('arena_fight_start');
    window.playSting('teleportSting');
    window.isInArena = true;
    setTimeout(() => {
        window.triggerAmbientDialogue('arena_entrance');
    }, 2000);
    
    // Increment progress
    window.roguelikeData.fightsCompleted = (window.roguelikeData.fightsCompleted || 0) + 1;

    // 1. Level Transition
    window.overrideTerrain = {}; 
    window.tileObjects = {}; 
    window.exploredHexes = new Set(); 
    window.lastSeenTimeMap = {};
    
    // 50/50 Indoor vs Outdoor
    const isIndoor = Math.random() < 0.5;
    window.indoorLightMult = isIndoor ? 0.0 : 1.0;
    
    // Force immediate light level recalculation
    if (window.updateTime) window.updateTime(0);

    if (isIndoor) {
        window.triggerAmbientDialogue('arena_indoor');
    } else {
        const timeStr = window.getFormattedTime();
        const isNight = window.lightLevel < 0.5;
        if (isNight) {
            window.triggerAmbientDialogue('arena_outdoor_night');
        } else {
            window.triggerAmbientDialogue('arena_outdoor_day');
        }
    }

    // Filter to keep players AND their mounts/allies
    window.entities = window.entities.filter(e => e.side === 'player'); 
    window.entities.forEach(e => {
        e.destination = null; // Fix: Stop old movement orders
    });
    window.groupMoveMode = false;
    window.groupLeader = null;
    window.leaderPath = null;

    // 2. Create arena map (Hexagon area)
    const arenaSize = 25;
    const isWaterArena = Math.random() < 0.3;
    const isPedestalArena = Math.random() < 0.4;
    const isFoliageArena = !isIndoor && Math.random() < 0.5;
    
    // Fill the arena area with terrain
    for (let q = -arenaSize; q <= arenaSize; q++) {
        for (let r = -arenaSize; r <= arenaSize; r++) {
            // Hexagonal constraint: max(abs(q), abs(r), abs(q+r)) <= arenaSize
            if (Math.abs(q) <= arenaSize && Math.abs(r) <= arenaSize && Math.abs(q+r) <= arenaSize) {
                 let tType = 'Cave Floor';
                 const distFromCenter = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
                 // Boundary ring: always solid Wall, regardless of any other
                 // terrain roll. Without this, the water-noise roll below can
                 // (and did) land Water right at the play area's true edge,
                 // so the player could walk/wade off the intentionally
                 // painted hexagon into unbounded/undefined terrain instead
                 // of hitting a hard, visible wall.
                 const isBoundaryRing = distFromCenter >= arenaSize - 1;

                 if (isWaterArena && !isBoundaryRing) {
                     const waterNoise = Math.abs(Math.sin(q * 0.2 + r * 0.15));
                     if (waterNoise > 0.8) tType = 'Water';
                 }

                 if (isPedestalArena && tType === 'Cave Floor') {
                     const pNoise = Math.abs(Math.sin(q * 0.5 + r * 0.05));
                     if (pNoise > 0.9) tType = 'Pedestal';
                 }

                 if (isFoliageArena && tType === 'Cave Floor') {
                     const fNoise = Math.abs(Math.sin(q * 0.3 + r * 0.3 + 5));
                     if (fNoise > 0.85) tType = 'foliage';
                 }

                 if (isBoundaryRing) tType = 'Wall';

                 window.setTerrainAt(q, r, tType);

                 if (isIndoor && Math.random() < 0.02 && tType === 'Cave Floor') {
                     window.tileObjects[`${q},${r}`] = { type: 'fireplace', lightRadius: 10 };
                 }
            }
        }
    }

    // Carve a handful of ring-shaped ruin structures — wall rings with 2-3
    // gaps left as doorways — so the arena has actual chokepoints and cover
    // to fight around instead of being one flat open field. Left as plain
    // hex rings (not full rectangles) since that's cheap to compute on a hex
    // grid and still reads as "a ruined room" once walls block LOS/movement.
    const numStructures = 3 + Math.floor(Math.random() * 3); // 3-5
    for (let s = 0; s < numStructures; s++) {
        let center = null;
        for (let attempt = 0; attempt < 20; attempt++) {
            const cq = Math.round((Math.random() * 2 - 1) * (arenaSize - 6));
            const cr = Math.round((Math.random() * 2 - 1) * (arenaSize - 6));
            if (Math.abs(cq) + Math.abs(cr) + Math.abs(cq + cr) <= (arenaSize - 6) * 2) {
                center = { q: cq, r: cr };
                break;
            }
        }
        if (!center) continue;

        const ringRadius = 2 + Math.floor(Math.random() * 3); // 2-4
        const ringHexes = [];
        for (let dq = -ringRadius; dq <= ringRadius; dq++) {
            for (let dr = -ringRadius; dr <= ringRadius; dr++) {
                const h = { q: center.q + dq, r: center.r + dr };
                if (window.distance(center, h) === ringRadius) ringHexes.push(h);
            }
        }
        if (ringHexes.length === 0) continue;

        const gapCount = 2 + Math.floor(Math.random() * 2); // 2-3 doorways
        const gapIndices = new Set();
        while (gapIndices.size < Math.min(gapCount, ringHexes.length)) {
            gapIndices.add(Math.floor(Math.random() * ringHexes.length));
        }
        ringHexes.forEach((h, i) => {
            if (gapIndices.has(i)) return;
            if (Math.abs(h.q) <= arenaSize && Math.abs(h.r) <= arenaSize && Math.abs(h.q + h.r) <= arenaSize) {
                window.setTerrainAt(h.q, h.r, 'Wall');
            }
        });
    }

    // 3. Spawn variety
    const spawnClose = Math.random() < 0.15; // 15% chance to spawn close
    const spawnInSight = Math.random() < 0.3; // 30% chance to spawn in sight

    // Pick a base spawn location for the party
    let baseQ, baseR;
    if (spawnClose) {
        baseQ = -5;
        baseR = 0;
    } else {
        baseQ = -arenaSize + 7;
        baseR = 0;
    }
    
    // Find a valid base hex that isn't wall/water/pedestal.
    // Relies solely on getTerrainAt — no separate hasOverride gate needed, because
    // getTerrainAt already returns Wall for any undefined hex when isInArena is true
    // (terrain.js line: if (window.isInArena) return terrainTypes['wall']).
    // The old hasOverride guard caused the fallback to fire whenever overrideTerrain
    // was unexpectedly empty, landing both players on the raw (-18,0) fallback which
    // appeared impassable because it had no terrain override.
    const findSafeHex = (startQ, startR, maxRadius) => {
        for (let r = 0; r <= maxRadius; r++) {
            for (let q = -r; q <= r; q++) {
                for (let rr = Math.max(-r, -q - r); rr <= Math.min(r, -q + r); rr++) {
                    const h = { q: startQ + q, r: startR + rr };
                    const terrain = window.getTerrainAt(h.q, h.r);
                    if (terrain.name !== 'Wall' && terrain.name !== 'Water' &&
                        terrain.name !== 'Pedestal' && !window.getEntityAtHex(h.q, h.r)) {
                        return h;
                    }
                }
            }
        }
        // Broad fallback: scan from center so we always find something valid
        for (let r = 0; r <= 20; r++) {
            for (let q = -r; q <= r; q++) {
                for (let rr = Math.max(-r, -q - r); rr <= Math.min(r, -q + r); rr++) {
                    const h = { q: q, r: rr };
                    const terrain = window.getTerrainAt(h.q, h.r);
                    if (terrain.name !== 'Wall' && terrain.name !== 'Water' &&
                        terrain.name !== 'Pedestal' && !window.getEntityAtHex(h.q, h.r)) {
                        return h;
                    }
                }
            }
        }
        return { q: startQ, r: startR };
    };

    const partyBase = findSafeHex(baseQ, baseR, 10);

    window.entities.filter(e => e.side === 'player' && !e.rider).forEach((e, i) => {
        const offset = window.getNeighbors(0, 0)[i % 6] || {q:0, r:0};
        const targetQ = partyBase.q + (i > 0 ? offset.q : 0);
        const targetR = partyBase.r + (i > 0 ? offset.r : 0);
        e.hex = findSafeHex(targetQ, targetR, 5);
        if (e.riding) e.riding.hex = { q: e.hex.q, r: e.hex.r };
    });
    const firstPlayer = window.entities.find(e => e.side === 'player' && !e.rider);
    if (firstPlayer) {
        window.centerCameraOn(firstPlayer.hex);
    }

    // 4. Spawn enemies based on scaled difficulty
    const minSP = 12 + (window.roguelikeData.fightsCompleted - 1) * 3;
    const maxSP = 16 + (window.roguelikeData.fightsCompleted - 1) * 5;
    const targetSP = minSP + Math.floor(Math.random() * (maxSP - minSP + 1));

    // Helper to find valid hexes — relies on getTerrainAt returning Wall for
    // undefined hexes when isInArena=true, so no separate hasOverride guard needed.
    const getAllValidSpawnHexes = () => {
        const valid = [];
        for (let q = -arenaSize + 1; q < arenaSize; q++) {
            for (let r = -arenaSize + 1; r < arenaSize; r++) {
                if (Math.abs(q) + Math.abs(r) + Math.abs(q+r) > arenaSize * 2) continue; // outside hex shape
                const hex = { q, r };
                const terrain = window.getTerrainAt(q, r);
                if (terrain.name !== 'Wall' && terrain.name !== 'Water' &&
                    terrain.name !== 'Pedestal' && !getEntityAtHex(q, r)) {
                    const nearPlayer = window.entities.some(e => e.side === 'player' && window.distance(e.hex, hex) < 3);
                    if (!nearPlayer) {
                        valid.push(hex);
                    }
                }
            }
        }
        return valid;
    };

    const validHexes = getAllValidSpawnHexes();
    let lastSpawnHex = validHexes.length > 0 ? validHexes[Math.floor(Math.random() * validHexes.length)] : { q: 0, r: 0 };

    // BOSS ENCOUNTER (15% chance if any bosses remain)
    const bossesDefeated = window.roguelikeData.bossesDefeated || [];
    const availableBosses = Object.keys(arenaBosses).filter(name => !bossesDefeated.includes(name));
    
    if (availableBosses.length > 0 && Math.random() < 0.15) {
        const bossName = availableBosses[Math.floor(Math.random() * availableBosses.length)];
        const config = arenaBosses[bossName];
        
        window.triggerAmbientDialogue(config.dialogue);
        // Bosses with real class levels (currently just Sir Alistair) are
        // built the same way hand-authored NPCs are (see buildNPC in
        // npcBuilder.js) instead of createMonster's flat monster template —
        // he's a genuine human fighter/cleric, not a reskinned orc.
        let boss;
        if (config.classLevels) {
            boss = window.buildNPC({
                name: bossName, race: config.race, gender: config.gender,
                hex: lastSpawnHex, classLevels: config.classLevels,
                skillPicks: config.skillPicks, equipment: config.equipment,
                side: 'enemy', color: config.color, expValue: config.expValue
            });
            boss.isNPC = false; // a real combatant, not a talk-to NPC
        } else {
            boss = window.createMonster(config.base, lastSpawnHex, config.skills, config.equipment, 'enemy');
            boss.name = bossName;
        }
        if (config.hp) { boss.hp = config.hp; boss.maxHp = config.hp; }
        if (config.mana) { boss.currentMana = config.mana; boss.maxMana = config.mana; }
        if (config.gender) boss.gender = config.gender;
        if (config.race) boss.race = config.race;
        if (config.color) boss.color = config.color;
        // Lets the turn-indicator portrait (ui.js) pick the right fallback
        // image for renamed bosses without a race (e.g. Grishnak -> orc.png)
        // instead of always defaulting to goblin.png once e.name no longer
        // matches a generic monster name.
        boss.spriteBase = config.base;
        // createMonster may have set customImage for types with their own
        // distinct art (harpy, elite_goblin, etc.) — a renamed unique boss
        // should get the existing spriteBase color-tint treatment instead of
        // showing the flat, untinted base-monster art.
        delete boss.customImage;

        if (config.spells) {
            boss.createdSpells = boss.createdSpells || [];
            config.spells.forEach(s => boss.createdSpells.push({...s}));
        }

        if (config.mount) {
            const mount = window.createMonster(config.mount, lastSpawnHex, null, null, 'enemy');
            boss.riding = mount;
            mount.rider = boss;
            window.entities.push(mount);
        }

        window.entities.push(boss);
        console.log(`Spawned BOSS ${bossName} at {q: ${lastSpawnHex.q}, r: ${lastSpawnHex.r}}`);

        // Spawn some guards — a human squire for bosses that define one
        // (guardRace), otherwise the boss's own monster-type muscle.
        for (let i = 0; i < 2; i++) {
            const neighbors = window.getNeighbors(lastSpawnHex.q, lastSpawnHex.r);
            const valid = neighbors.filter(h => validHexes.some(vh => vh.q === h.q && vh.r === h.r));
            const spawnHex = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : lastSpawnHex;
            if (config.guardRace) {
                const guard = window.buildNPC({
                    name: i === 0 ? config.guardName : `${config.guardName} II`,
                    title: config.guardTitle, race: config.guardRace, gender: config.guardGender,
                    hex: spawnHex, classLevels: config.guardClassLevels,
                    skillPicks: config.guardSkillPicks, equipment: config.guardEquipment,
                    side: 'enemy', expValue: config.guardExpValue
                });
                guard.isNPC = false;
                window.entities.push(guard);
            } else {
                const m = window.createMonster(config.base, spawnHex, null, null, 'enemy');
                window.entities.push(m);
            }
        }
    } else {
        // Normal encounter
        let currentSP = 0;
        const monsterTypes = [...ARENA_MONSTER_POOL];
        // Dragons are far stronger (and take up far more space) than anything
        // else in the pool. The SP-budget check below still lets an
        // over-budget monster through as a lone first spawn, which would let
        // a level-1 party occasionally roll a solo Ancient Dragon — so gate
        // dragons behind fightsCompleted directly, on top of the SP budget,
        // rather than relying on SP scaling alone.
        const fightsCompleted = window.roguelikeData.fightsCompleted || 0;
        if (fightsCompleted >= 6) monsterTypes.push('dragon_young');
        if (fightsCompleted >= 12) monsterTypes.push('dragon_adult');
        if (fightsCompleted >= 20) monsterTypes.push('dragon_ancient');

        // The lobby shows a couple of "waiting combatants" drawn from this
        // same pool (see setupArenaLobby). About half the time, weight this
        // fight's roll toward actually including one of them — not a
        // guarantee, just a real chance the fighters you saw waiting turn
        // out to be who you face.
        if (window.arenaLobbyPreviewTypes && Math.random() < 0.5) {
            window.arenaLobbyPreviewTypes.forEach(t => {
                if (monsterTypes.includes(t)) monsterTypes.push(t, t, t);
            });
        }

        // Multi-hex monsters (dragons, trolls) need every hex of their
        // footprint clear of walls/water/other entities, not just their
        // center hex.
        const isFootprintClear = (centerHex, tmpl) => {
            const hexes = [centerHex, ...(tmpl.extraHexes || []).map(o => ({ q: centerHex.q + o.q, r: centerHex.r + o.r }))];
            return hexes.every(h => {
                if (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r) > arenaSize * 2) return false;
                const t = window.getTerrainAt(h.q, h.r);
                return t.name !== 'Wall' && t.name !== 'Water' && t.name !== 'Pedestal' && !getEntityAtHex(h.q, h.r);
            });
        };

        let safetyIterations = 0;
        while (currentSP < targetSP && safetyIterations < 200) {
            safetyIterations++;
            if (window.roguelikeData.mercenaryGraveyard.length > 0 && Math.random() < 0.2) {
                const snapshot = window.roguelikeData.mercenaryGraveyard.splice(Math.floor(Math.random() * window.roguelikeData.mercenaryGraveyard.length), 1)[0];
                const neighbors = window.getNeighbors(lastSpawnHex.q, lastSpawnHex.r);
                const valid = neighbors.filter(h => validHexes.some(vh => vh.q === h.q && vh.r === h.r));
                const spawnHex = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : lastSpawnHex;
                const merc = new window.Enemy(snapshot.name, "purple", spawnHex, snapshot.attributes.agility + 10);
                merc.side = 'enemy';
                Object.assign(merc, snapshot);
                merc.isGraveyardMerc = true;
                window.entities.push(merc);
                console.log(`Spawned graveyard merc ${merc.name} at {q: ${spawnHex.q}, r: ${spawnHex.r}}`);
                currentSP += 10;
                lastSpawnHex = spawnHex;
                continue;
            }

            const type = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
            const template = window.monsterTemplates[type];
            const baseSP = Object.values(template.skills || {}).reduce((a, b) => a + b, 0) + (template.hp / 5);
            
            if (currentSP + baseSP > targetSP + 10 && currentSP > 0) break;

            const neighbors = window.getNeighbors(lastSpawnHex.q, lastSpawnHex.r);
            let candidates = neighbors.filter(h => validHexes.some(vh => vh.q === h.q && vh.r === h.r));
            if (template.extraHexes && template.extraHexes.length > 0) {
                candidates = candidates.filter(h => isFootprintClear(h, template));
                if (candidates.length === 0) {
                    // No room near the last spawn point — search the whole
                    // arena for anywhere this monster's full footprint fits.
                    candidates = validHexes.filter(h => isFootprintClear(h, template));
                }
                if (candidates.length === 0) continue; // nowhere big enough right now - try a different monster next pass
            }
            const spawnHex = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : lastSpawnHex;
            const terrain = window.getTerrainAt(spawnHex.q, spawnHex.r);
            console.log(`Spawned ${type} at {q: ${spawnHex.q}, r: ${spawnHex.r}} (${terrain.name})`);
            const m = window.createMonster(type, spawnHex, null, null, 'enemy');
            
            if (currentSP + baseSP < targetSP) {
                const diff = targetSP - (currentSP + baseSP);
                const extraHP = Math.floor(diff * 5);
                m.maxHp += extraHP;
                m.hp += extraHP;
            }

            // As the party outlevels the base roster, generic humanoids
            // (goblins/orcs, not undead/animals/giants) start picking up
            // real class levels — extra HP and combat skill ranks — so late
            // arena runs don't stay trivial forever.
            if (m.tags?.includes('humanoid') && window.party?.length) {
                const avgPartyLevel = window.party.reduce((sum, c) => sum + c.level, 0) / window.party.length;
                const bonusLevels = Math.floor(avgPartyLevel / 3);
                if (window.applyClassLevelScaling) window.applyClassLevelScaling(m, bonusLevels);
            }

            // Half the time, patrol a short loop near the spawn point instead
            // of pure random wander, so groups read as actually guarding a
            // spot rather than idling in place.
            if (Math.random() < 0.5) {
                const patrolNeighbors = window.getNeighbors(spawnHex.q, spawnHex.r)
                    .filter(h => window.getTerrainAt(h.q, h.r).name !== 'Wall' && window.getTerrainAt(h.q, h.r).name !== 'Water');
                if (patrolNeighbors.length > 0) {
                    const far = patrolNeighbors[Math.floor(Math.random() * patrolNeighbors.length)];
                    m.behaviorType = 'patrol';
                    m.patrolPath = [spawnHex, far];
                    m.homeHex = { ...spawnHex };
                }
            }

            window.entities.push(m);
            currentSP += baseSP;
            lastSpawnHex = spawnHex;
        }
    }

    const spawnedEnemies = window.entities.filter(e => e.side === 'enemy' && e.alive);
    console.log(`[ARENA] startArenaFight: spawned ${spawnedEnemies.length} enemies: ${spawnedEnemies.map(e=>e.name).join(', ')}`);
    console.log(`[ARENA] startArenaFight: total entities=${window.entities.length}`);

    // AUDIO: Play music based on immediate visibility
    const anyEnemySeen = window.entities.some(e => e.alive && e.side === 'enemy' && window.isVisibleToPlayer(e.hex));
    if (anyEnemySeen) {
        window.playSting();
        window.playArenaMusic('battle', 0.8);
    } else {
        window.playArenaMusic('preBattle', 0.8);
    }

    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
    
    // Fix: Reset turn state so the engine re-evaluates initiative in the new map
    window.currentTurnEntity = null;
    window.isPausedForReaction = false; 
    window.gamePhase = 'WAITING';
    
    // Instant visual snap for teleport
    if (window.snapVisuals) window.snapVisuals();

    if (window.runTickInternal) window.runTickInternal();

    // Multiplayer: Sync the new arena state
    if (window.broadcastFullState && (!window.multiplayer || !window.multiplayer.initializing)) {
        window.broadcastFullState();
    }
}

function talkToNPC(npc) {
    console.log("Talking to NPC:", npc.name);
    if (npc.dialogueId && window.npcDialogueTrees && window.npcDialogueTrees[npc.dialogueId]) {
        window.npcDialogueTrees[npc.dialogueId](npc);
        return;
    }
    if (npc.name === "Arena Announcer") {
        window.showDialogue(npc, "Welcome to the pits! Are you ready for your next match?", [
            { label: "I am ready to fight!", action: () => {
                if (window.multiplayer && window.multiplayer.roomCode) {
                    window.multiplayer.socket.emit('requestStartArenaFight', { roomCode: window.multiplayer.roomCode });
                } else {
                    window.startArenaFight();
                }
            }},
            { label: "Not yet.", action: () => {} }
        ]);
    } else if (npc.name && npc.name.includes("Shopkeeper")) {
        window.triggerAmbientDialogue('arena_lobby_3');
        window.showDialogue(npc, "Got some coin? I've got the goods. Unlimited stock, best prices in the pits!", [
            { label: "Let me see your wares.", action: () => window.openShop() },
            { label: "Maybe later.", action: () => {} }
        ]);
    } else if (npc.name === "Mercenary Recruiter") {
        window.triggerAmbientDialogue('arena_lobby_4');
        window.showDialogue(npc, "Looking for some extra muscle? 100 gold and I'll find you a capable fighter who matches your experience.", [
            { label: "I'd like to hire someone (100g).", action: () => window.startMercenaryHire() },
            { label: "Not right now.", action: () => {} }
        ]);
    } else if (npc.arenaFlavorLine) {
        window.showDialogue(npc, npc.arenaFlavorLine);
    } else {
        window.showDialogue(npc, `You talk to ${npc.name}, but they have nothing to say.`);
    }
}

window.talkToNPC = talkToNPC;
window.setupArenaLobby = setupArenaLobby;
window.startArenaFight = startArenaFight;
window.tryStealth = tryStealth;
window.breakStealth = breakStealth;
window.canSee = canSee;
window.lootItems = lootItems;
window.spendTP = spendTP;
window.finalizePlayerAction = finalizePlayerAction;
window.handleMovement = (e) => {};

window.charDebugMode = false;
document.addEventListener('keydown', (ev) => {
    if (ev.key === '`') {
        window.charDebugMode = !window.charDebugMode;
        window.renderEntities && window.renderEntities();
    }

    // Space: re-center camera on local player and re-enable follow
    if (ev.key === ' ' && document.getElementById('gameContainer')?.style.display === 'flex') {
        ev.preventDefault();
        window.cameraFollowEnabled = true;
        const local = window.player ||
            window.entities?.find(e => e.alive && e.side === 'player' && !e.rider);
        if (local && window.centerCameraOn) window.centerCameraOn(local.hex);
    }
});
window.tryShove = tryShove;

function resolveSpell(caster, spell, target, clickedHex) {
    let actionHandled = false;
    if (spell.type === 'summon') {
        const template = window.monsterTemplates[spell.animalId];
        const extraOffsets = template.extraHexes || [];
        
        let finalHex = clickedHex;
        let validPlacement = false;

        if (extraOffsets.length === 0) {
            // Single hex summon: just check current hex
            const occupant = getEntityAtHex(clickedHex.q, clickedHex.r);
            const terrain = window.getTerrainAt(clickedHex.q, clickedHex.r);
            if (!occupant && terrain.name !== 'Wall' && terrain.name !== 'Water') validPlacement = true;
        } else {
            // Multi-hex: Try different orientations where clickedHex is part of the creature
            const candidates = [{q:0, r:0}, ...extraOffsets]; // The relative offsets of the creature
            
            // Try each candidate offset as being the one located at clickedHex
            for (let anchorOffset of candidates) {
                // Potential root hex if anchorOffset is at clickedHex
                const rootQ = clickedHex.q - anchorOffset.q;
                const rootR = clickedHex.r - anchorOffset.r;
                
                // Check all hexes for this orientation
                let fits = true;
                for (let off of candidates) {
                    const checkQ = rootQ + off.q;
                    const checkR = rootR + off.r;
                    const h = { q: checkQ, r: checkR };
                    const occupant = getEntityAtHex(h.q, h.r);
                    const terrain = window.getTerrainAt(h.q, h.r);
                    if (!window.isHexInBounds(h) || (occupant && occupant !== caster) || terrain.name === 'Wall' || terrain.name === 'Water') {
                        fits = false; break;
                    }
                }
                if (fits) {
                    finalHex = { q: rootQ, r: rootR };
                    validPlacement = true;
                    break;
                }
            }
        }

        if (!validPlacement) {
            window.showMessage("No room to summon that creature there.");
            return false;
        }

        const s = window.createMonster(spell.animalId, finalHex, null, null, caster.side);
        s.summoner = caster.name;
        if (spell.animalId === 'eagle') s.isFlying = true;
        s.maxTPAllowed = 0; 
        if (caster.side === 'player' && caster.skills?.animal_companion && !caster.animalCompanion) {
            caster.animalCompanion = s;
            s.isCompanion = true;
            if (caster.skills.companion_str_end) { s.baseDamage += 1; s.maxHp += 10; s.hp += 10; }
            if (caster.skills.companion_agi_end) { s.timePointsPerTick += 0.05; s.maxHp += 10; s.hp += 10; }
            window.entities.push(s);
            window.showMessage(`${caster.name} summons a permanent companion: ${s.name}!`);
        } else {
            s.isSummoned = true;
            window.entities.push(s); 
            const instanceId = Date.now() + Math.random();
            window.activeSpells.push({
                spellInstanceId: instanceId, name: spell.name, casterName: caster.name,
                coreManaCost: spell.coreManaCost || spell.manaCost, entityId: s.id
            });
        }
        actionHandled = true;
    } else if (spell.type === 'dispel') {
        if (target) {
            const activeEffects = (window.activeSpells || []).filter(s => s.targetEntityId === target.id || s.entityId === target.id);
            if (activeEffects.length > 0) {
                const effect = activeEffects[Math.floor(Math.random() * activeEffects.length)];
                window.cancelSpell(effect.spellInstanceId);
                window.showMessage(`${caster.name} dispelled ${effect.name} on ${target.name}!`);
                actionHandled = true;
            }
        } else {
            const hexSpells = (window.activeSpells || []).filter(s => s.targetHexes && s.targetHexes.some(th => th.q === clickedHex.q && th.r === clickedHex.r));
            if (hexSpells.length > 0) {
                const categorized = { enemy: [], neutral: [], player: [] };
                hexSpells.forEach(s => {
                    const scaster = window.entities.find(e => e.name === s.casterName);
                    const side = scaster ? scaster.side : 'neutral';
                    categorized[side].push(s);
                });
                const priority = categorized.enemy.length > 0 ? categorized.enemy : (categorized.neutral.length > 0 ? categorized.neutral : categorized.player);
                const effect = priority[Math.floor(Math.random() * priority.length)];
                window.cancelSpell(effect.spellInstanceId);
                window.showMessage(`${caster.name} dispelled ${effect.name} at hex ${clickedHex.q},${clickedHex.r}!`);
                actionHandled = true;
            }
        }
    } else if (spell.type === 'aoe_debuff' || spell.type === 'aoe_damage') {
        const center = clickedHex;
        const radius = spell.radius || 0;
        const affected = [center];

        if (radius > 0) {
            // Get all hexes within radius
            for (let q = -radius; q <= radius; q++) {
                for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
                    if (q === 0 && r === 0) continue;
                    const h = { q: center.q + q, r: center.r + r };
                    if (window.isHexInBounds(h)) affected.push(h);
                }
            }
        }

        if (spell.type === 'aoe_damage') {
            // Instant hex-burst damage (e.g. a dragon's breath weapon) — no
            // lingering terrain effect, just immediate damage to every
            // opposing entity caught in the burst.
            affected.forEach(h => {
                const t = getEntityAtHex(h.q, h.r);
                if (t && t.alive && t.side !== caster.side) {
                    const red = (t.baseReduction || 0) + (t.equipped?.armor ? window.items[t.equipped.armor].reduction : 0);
                    const dmg = Math.max(1, (spell.magnitude || 0) - red);
                    t.hp -= dmg; syncBackToPlayer(t); wakeUp(t);
                    if (t.hp <= 0 && t.alive) handleLethalDamage(t, caster);
                }
            });
            window.showMessage(`${caster.name} unleashes ${spell.name}!`);
            actionHandled = true;
        } else {
            const instanceId = Date.now() + Math.random();
            window.activeSpells.push({
                spellInstanceId: instanceId, baseId: spell.baseId, name: spell.name, casterName: caster.name,
                coreManaCost: spell.coreManaCost || spell.manaCost, targetHexes: affected.map(h => ({q:h.q, r:h.r})), debuffType: spell.debuffType
            });
            affected.forEach(h => { window.setTerrainAt(h.q, h.r, 'Swamp'); });
            window.showMessage(`${caster.name} cast ${spell.name}!`);
            actionHandled = true;
        }
    } else {
        let spellHitBonus = 0;
        if (spell.baseId === 'firebolt' && caster.skills?.firebolt_hit) spellHitBonus = caster.skills.firebolt_hit * 5;
        
        let hitChance = 50 + (caster.toHitSpell || 0) + spellHitBonus - (target ? target.passiveDodge : 0);
        
        // COVER: behind any elevated terrain (pedestals, fort ramparts)
        if (target && spell.baseId === 'firebolt' && window.isCoveredFromRangedAttack(target)) {
            window.showMessage(`${target.name} has cover (Cover bonus: -5 hit)`);
            hitChance -= 5;
        }

        const roll = Math.floor(Math.random() * 100);
        let hit = !spell.needsHitCheck || (target && roll < hitChance);

        if (spell.needsHitCheck && target) {
            window.showMessage(`${caster.name} casts ${spell.name} at ${target.name}: ${hit ? 'HIT' : 'MISS'} (Roll: ${roll} vs Need: <${hitChance})`);
        }

        if (spell.type === 'damage' && target && target.side !== caster.side && !target.noAttack) {
            const baseSpell = window.baseSpells[spell.baseId];
            if (baseSpell && baseSpell.validTags) {
                const hasValidTag = baseSpell.validTags.some(tag => target.tags && target.tags.includes(tag));
                if (!hasValidTag) { window.showMessage(`${spell.name} has no effect on ${target.name}!`); hit = false; }
            }
            if (hit) {
                let red = (target.baseReduction || 0) + (target.equipped?.armor ? window.items[target.equipped.armor].reduction : 0) + (window.items[target.equipped?.offhand]?.type === 'shield' ? window.items[target.equipped.offhand].reduction : 0);
                let fd = Math.max(1, (spell.magnitude || 0) - red);
                if (window.spawnFloatingText) window.spawnFloatingText(target.hex, `-${fd}`, '#ff4d4d');
                if (window.flashEntity) window.flashEntity(target, '#f00');
                target.hp -= fd; syncBackToPlayer(target);
                wakeUp(target);
                if (target.hp <= 0 && target.alive) {
                    handleLethalDamage(target, caster);
                }
            }
            actionHandled = true;
        } else if (spell.type === 'heal' && target) {
            target.hp = Math.min(target.maxHp, target.hp + spell.magnitude);
            if (window.spawnFloatingText) window.spawnFloatingText(target.hex, `+${spell.magnitude}`, '#5cff5c');
            if (target.unconscious && target.hp > 0) {
                target.unconscious = false;
                window.showMessage(`${target.name} regains consciousness!`);
            }
            syncBackToPlayer(target); actionHandled = true;
        } else if (spell.type === 'timeskip' && target) {
            // Drains the target's Time Points to 0 — since a turn only ever
            // comes around once an entity reaches 100 TP (see readyEntities
            // in runTickInternal), this just pushes their next turn back by
            // however long a full regen from 0 takes, rather than skipping a
            // fixed number of turns or granting them a bonus turn later.
            target.timePoints = 0;
            window.showMessage(`${caster.name}'s ${spell.name} drains ${target.name}'s Time Points to 0 — their next turn is pushed well back.`);
            actionHandled = true;
        } else if ((spell.type === 'buff' || spell.type === 'debuff') && target) {
            const instanceId = Date.now() + Math.random();
            window.activeSpells.push({
                spellInstanceId: instanceId, baseId: spell.baseId, name: spell.name, casterName: caster.name,
                coreManaCost: spell.coreManaCost || spell.manaCost, targetEntityId: target.id, 
                magnitude: spell.magnitude, debuffType: spell.debuffType
            });
            window.showMessage(`${caster.name} cast ${spell.name} on ${target.name}.`);
            actionHandled = true;
        }
    }
    return actionHandled;
}

// Heavier armor makes spellcasting clumsier: +1/+2/+3 mana per cast in
// light/medium/heavy armor (no armor, no penalty). Cleric's Vestment Ease
// and Druid's Wild Ease shave this off per-school, since those two schools
// have their own reasons to still wear armor into a fight.
function getArmorSpellPenalty(caster, spell) {
    const armorId = caster.equipped?.armor;
    let penalty = armorId === 'heavy_armor' ? 3 : armorId === 'medium_armor' ? 2 : armorId === 'light_armor' ? 1 : 0;
    if (penalty === 0) return 0;
    if (spell.school === 'divine') penalty -= (caster.skills?.divine_armor_ease || 0);
    if (spell.school === 'nature') penalty -= (caster.skills?.nature_armor_ease || 0);
    return Math.max(0, penalty);
}
window.getArmorSpellPenalty = getArmorSpellPenalty;

function tryCastSpell(caster, spell, target, clickedHex, bypassCooldown = false) {
    // REAL-TIME CASTING DELAY
    if (!window.isInCombat && !bypassCooldown) {
        // Calculate duration based on TP cost (same ratio as movement)
        const duration = (spell.tpCost / caster.timePointsPerTick) * 0.4;
        caster.castCooldown = duration;
        caster.pendingCast = { spell, target, hex: clickedHex };
        caster.destination = null; // Cancel movement
        window.showMessage(`${caster.name} starts casting ${spell.name}...`);
        if (window.updateActionButtons) window.updateActionButtons();
        return true;
        }
    // DIVINE SILENCE REMOVAL
    const silence = (window.activeSpells || []).find(s => s.debuffType === 'silence_penalty' && s.targetEntityId === caster?.id);
    if (silence) {
        window.showMessage(`${caster.name} breaks the Divine Silence by casting a spell!`);
        window.cancelSpell(silence.spellInstanceId);
    }

    // SANCTUARY TRIGGER (Target protection)
    const targetEntity = target || getEntityAtHex(clickedHex.q, clickedHex.r);
    if (targetEntity && targetEntity.side !== caster?.side) {
        const targetSanctuary = (window.activeSpells || []).find(s => s.debuffType === 'sanctuary_protected' && s.targetEntityId === targetEntity?.id);
        if (targetSanctuary) {
            const penalty = (targetSanctuary.magnitude || 1);
            caster.timePoints -= penalty;
            window.showMessage(`${caster.name} is hindered by ${targetEntity.name}'s Sanctuary! (-${penalty} TP)`);
            triggerPenalty(targetSanctuary.casterName, caster, targetSanctuary);
        }
    }

    // BREAK SANCTUARY ON OFFENSIVE CAST
    if (targetEntity && targetEntity.side !== caster?.side) {
        const mySanctuary = (window.activeSpells || []).find(s => s.debuffType === 'sanctuary_protected' && s.targetEntityId === caster?.id);
        if (mySanctuary) {
            window.showMessage(`${caster.name}'s Sanctuary fades as they cast an offensive spell.`);
            window.cancelSpell(mySanctuary.spellInstanceId);
        }
    }

    // AOE SANCTUARY CHECK
    if (spell.radius > 0) {
        const radius = spell.radius;
        const affectedHexes = window.getHexesInRange(clickedHex, radius);
        const protectedEnemies = window.entities.filter(e => e.alive && e.side !== caster?.side && affectedHexes.some(h => e.getAllHexes().some(eh => eh.q === h.q && eh.r === h.r)));
        for (let enemy of protectedEnemies) {
            const sanc = (window.activeSpells || []).find(s => s.debuffType === 'sanctuary_protected' && s.targetEntityId === enemy?.id);
            if (sanc) {
                const penalty = (sanc.magnitude || 1);
                caster.timePoints -= penalty;
                window.showMessage(`${caster.name} is hindered by ${enemy.name}'s Sanctuary (AOE)! (-${penalty} TP)`);
                triggerPenalty(sanc.casterName, caster, sanc);
            }
        }
    }

    // 1. Reactions (Counterspell)
    const opponents = window.entities.filter(e => e.alive && e.side !== caster.side);
    const counterOptions = [];
    opponents.forEach(o => {
        if (o.reactionBlocked) return;
        const oCounter = (o.createdSpells || []).find(s => s.baseId === 'counterspell');
        if (oCounter && o.currentMana >= oCounter.manaCost && o.timePoints >= 5) {
            const distToCaster = window.distance(o.hex, caster.hex);
            const distToTarget = target ? window.distance(o.hex, target.hex) : window.distance(o.hex, clickedHex);
            if (distToCaster <= oCounter.range || distToTarget <= oCounter.range) {
                counterOptions.push({ id: `counter_${o.name}`, name: `Counterspell (${o.name})`, tpCost: 5, reactor: o, spell: oCounter });
            }
        }
    });

    if (counterOptions.length > 0) {
        const playerCounter = counterOptions.find(opt => opt.reactor.side === 'player');
        if (playerCounter && caster.side !== 'player') {
            window.requestReaction(playerCounter.reactor, [{id:'counter', name:`Counterspell (${playerCounter.reactor.name})`, tpCost:5}], (choice) => {
                if (choice === 'counter') {
                    spendTP(playerCounter.reactor, 5);
                    playerCounter.reactor.currentMana -= playerCounter.spell.manaCost;
                    window.showMessage(`${playerCounter.reactor.name} counters ${caster.name}'s ${spell.name}!`);
                    caster.currentMana -= spell.manaCost; 
                    // Spell is negated
                } else {
                    // Resolve spell normally
                    resolveSpell(caster, spell, target, clickedHex);
                }
            });
            return 'counter_pending'; // Signal that we are waiting for a reaction
        } else if (caster.side === 'player') {
            // AI Counter: 50% chance
            const aiCounter = counterOptions.find(opt => opt.reactor.side !== 'player');
            if (aiCounter && Math.random() < 0.5) {
                spendTP(aiCounter.reactor, 5);
                aiCounter.reactor.currentMana -= aiCounter.spell.manaCost + getArmorSpellPenalty(aiCounter.reactor, aiCounter.spell);
                window.showMessage(`${aiCounter.reactor.name} counters ${caster.name}'s ${spell.name}!`);
                caster.currentMana -= spell.manaCost + getArmorSpellPenalty(caster, spell);
                return true;
            }
        }
    }

    // 2. Resolve Spell (Normal path if no reaction or AI missed)
    caster.currentMana -= spell.manaCost + getArmorSpellPenalty(caster, spell);
    if (caster.isStealthed) breakStealth(caster);
    return resolveSpell(caster, spell, target, clickedHex);
}

// GLOBAL EXPORTS
window.updatePlayerUI = updatePlayerUI;
window.autoMoveProcess = autoMoveProcess;
window.drawPlayerCharacter = drawPlayerCharacter;
window.CHAR_CONFIG = CHAR_CONFIG;
window.handleClick = handleClick;
window.getEntityAtHex = getEntityAtHex;
window.getHexesInRange = getHexesInRange;
window.spendTP = spendTP;
window.finalizePlayerAction = finalizePlayerAction;
window.tryCastSpell = tryCastSpell;
window.tryAttack = tryAttack;
window.resolveAttack = resolveAttack;
window.takeTurn = takeTurn;
window.startGameCore = startGameCore;
window.renderEntities = renderEntities;
