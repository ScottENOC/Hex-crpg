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
    'wolf', 'boar', 'tiger', 'horse_archer'];
window.ARENA_MONSTER_POOL = ARENA_MONSTER_POOL;
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
        'Elder Marta Wynfield': [
            { start: 0, end: 8, hex: { q: 0, r: -12 } },   // home (the House) overnight
            { start: 8, end: 18, hex: { q: 8, r: 24 } },   // tending village business near the crossroads
            { start: 18, end: 24, hex: { q: 0, r: -12 } },
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

    // A neutral NPC (a shopkeeper, a garrison soldier posted in a single-
    // tile gate...) isn't a threat and shouldn't be able to physically wall
    // off a doorway just by standing in it — only a genuine 'enemy' blocks
    // the player's own step-by-step movement. Neutral entities still block
    // AI pathing/targeting/attacks exactly as before; this only loosens the
    // player's own walk-through-a-friendly-crowd case.
    if (occupant && occupant.alive && occupant.side === 'enemy' && isVisible) {
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

    // Falling off a wall is now only a risk while actually being attacked
    // mid-climb (entity.climbing, resolveAttack's fall-check) rather than a
    // one-time pre-move roll here — a multi-turn climb (see the
    // climbTransition branch below) makes "you're exposed for several
    // turns and can be shot down" the real danger instead of "you might
    // instantly fail before you even start."

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
        // Movement discounts (fastMovement, swift_step, ...) should make
        // moving cheaper, never free or a net TP *gain* — with fastMovement
        // now capped at 1 rank this can't actually go negative anymore, but
        // clamp defensively anyway (matches updatePlayerUI's own highlight
        // BFS, which already does the same for the highlighted-range case).
        baseMoveCost = Math.max(1, baseMoveCost);
        const previousTerrain = window.getTerrainAt(previousHex.q, previousHex.r);
        const terrain = window.getTerrainAt(player.hex.q, player.hex.r);
        
        let terrainMult = window.getMoveCostMult(player.hex.q, player.hex.r, moveEntity);
        if (terrain.name === 'Foliage' && (moveEntity.skills?.elf_foliage_expertise || moveEntity.skills?.druid_foliage_expertise)) {
            terrainMult = 1.0; 
        }

        // HEIGHT PENALTY (any elevated terrain — Pedestals, and now fort ramparts)
        // An open gate is a real door at ground level despite sitting on
        // permanently-elevated wall terrain (see isOpenGateAt) — crossing
        // through it from either side shouldn't pay a climb surcharge.
        const throughOpenGate = isOpenGateAt(player.hex.q, player.hex.r) || isOpenGateAt(previousHex.q, previousHex.r);
        if (throughOpenGate) {
            // no height penalty, walk straight through
        } else if (previousTerrain.name !== terrain.name && (previousTerrain.elevated || terrain.elevated)) {
            let heightPenalty = 1.0;
            const climbRiskSide = terrain.climbRisk ? terrain : (previousTerrain.climbRisk ? previousTerrain : null);
            if (climbRiskSide) {
                heightPenalty *= getClimbCostMult(moveEntity); // stacking climbing skills
                // Only the descent direction ever actually spends this —
                // climbTransition below overrides the ascent with its own
                // flat 1-TP charge before stepCost is ever used. A ladder
                // right where the player is standing (leaving climbRisk
                // terrain) makes climbing back down it as much cheaper as
                // it already makes the AI's own retreat-off-the-wall step
                // (climbDownCost, aiProcess's retreat contingency).
                if (previousTerrain.climbRisk && !terrain.climbRisk &&
                    window.tileObjects?.[`${previousHex.q},${previousHex.r}`]?.type === 'ladder') {
                    heightPenalty *= 0.4;
                }
            } else if (moveEntity.skills?.agile_climber) {
                heightPenalty = 0.5;
            }
            terrainMult += heightPenalty;
        } else if (previousTerrain.elevated && terrain.elevated) {
            terrainMult = 1.0; // Flat movement on same level
        }

        let stepCost = Math.max(1, baseMoveCost * (player.isFlying ? 1 : terrainMult));

        // WALL CLIMB: entering climbRisk terrain from non-climbRisk terrain
        // commits the climber to a multi-turn climb — scaling a real castle
        // wall bare-handed should be serious work, well beyond one turn's
        // full 100 TP. Base cost 125 (climbing skills still apply their
        // usual discount, getClimbCostMult, down to a 40% floor). They
        // already occupy the wall hex (matches how every other status
        // effect here works — a debuff timer on top of a real position,
        // not a partial-position render) but are `climbing` until
        // `ticksRequired` total TP has been spent toward it — see takeTurn's
        // scripted-status handling below, which spends everything above the
        // 80 end-of-turn threshold each turn (not 1 at a time) until it's
        // paid off or they're knocked off.
        const climbTransition = !player.isFlying && terrain.climbRisk && !previousTerrain.climbRisk && !throughOpenGate;
        if (climbTransition) {
            // A ladder propped against this exact wall hex (Northwatch's
            // notches, campaign2World.js) makes climbing up it as much
            // faster as it already makes climbing back down it
            // (climbDownCost's own hasLadderHere check, below) — same
            // ~40% ratio.
            const hasLadder = window.tileObjects?.[`${player.hex.q},${player.hex.r}`]?.type === 'ladder';
            const baseClimbCost = 125 * getClimbCostMult(moveEntity);
            const climbCost = hasLadder ? Math.round(baseClimbCost * 0.4) : baseClimbCost;
            moveEntity.climbing = {
                fromHex: previousHex,
                ticksRequired: Math.max(1, Math.round(climbCost)),
                ticksSpent: 0,
            };
            spendTP(moveEntity, 1);
            window.showMessage(hasLadder
                ? `${player.name} scrambles up the ladder.`
                : `${player.name} begins climbing the wall.`);
            // Committing to a climb always ends the turn right here,
            // regardless of how much TP is left — the ~125 TP cost is
            // banked into climbing.ticksRequired and paid off gradually via
            // takeTurn's scripted CLIMBING block on future turns, not spent
            // up front. finalizePlayerAction's normal shouldEndTurn check
            // (TP <= 80) doesn't apply here: after only a 1-TP debit a
            // fresh turn's TP is still well above 80, so it would restore
            // gamePhase to 'PLAYER_TURN' and hand control straight back —
            // the turn never actually ends, so the scripted climbing
            // progression on takeTurn's next call never gets a chance to
            // run, reading as "hangs at their turn."
            window.clearHighlights();
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            window.updateTurnIndicator();
            syncBackToPlayer(player);
            window.drawMap();
            window.renderEntities();
            return;
        }

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
window.playerMoveProcess = playerMoveProcess;

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

        // Arena scenario turn counter — the only clean, once-per-round hook
        // available without touching the initiative loop itself. Future
        // timed objectives (e.g. "hold the flag N turns") read this instead
        // of adding their own turn tracking.
        if (window.isInArena && window.arenaScenario) {
            window.arenaScenario.turnsElapsed = (window.arenaScenario.turnsElapsed || 0) + 1;
            if (window.tickArenaScenario) window.tickArenaScenario();
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
    // Belt-and-suspenders redraw one frame later: player.hex is already
    // correct the instant this function returns (confirmed directly and via
    // handleClick's real click path in testing), but a turn-based move is a
    // single discrete hex jump with no interpolation to fall back on, unlike
    // real-time movement's continuous position updates — if a device drops
    // or defers this synchronous canvas paint for any reason, there's
    // nothing else to naturally repaint the entity at its new hex until
    // some unrelated later event (e.g. the next character's turn) forces
    // one. Reported as "the character doesn't appear to move until the next
    // character acts" even though the highlighted move range (recomputed
    // from the same already-updated position) showed correctly the whole
    // time — i.e. state was right, only the paint lagged.
    if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => { window.drawMap(); window.renderEntities(); });
    }

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
                        // Sidestep is a free reposition, not a real move action —
                        // it must not let a defender scale (or drop off) a
                        // climbable wall for free, so only same-elevation
                        // neighbors are offered (see shove's matching check below).
                        const reactorElevated = !!window.getTerrainAt(reactor.hex.q, reactor.hex.r).elevated;
                        const neighbors = window.getNeighbors(reactor.hex.q, reactor.hex.r);
                        neighbors.forEach(nh => {
                            const nhTerrain = window.getTerrainAt(nh.q, nh.r);
                            if (!getEntityAtHex(nh.q, nh.r) && !nhTerrain.impassable && nhTerrain.name !== 'Water' &&
                                !!nhTerrain.elevated === reactorElevated) {
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
            // Only a genuine enemy (or an NPC explicitly opted in via
            // blocksPlayerPath) blocks the player's own move highlighting —
            // matches findPath's occupant rule (gameEngine.js's tryAttack-
            // adjacent comment). Without this, any neutral standing on a
            // one-hex-wide wall walkway made every hex past them
            // permanently unreachable in the highlight BFS, even though
            // findPath itself (used for real-time destinations) already
            // tolerates walking past/onto a neutral.
            const occupant = getEntityAtHex(n.q, n.r);
            if (occupant && (occupant.side === 'enemy' || occupant.blocksPlayerPath)) continue;

            const terrain = window.getTerrainAt(n.q, n.r);
            if (terrain.name === 'Wall') continue;

            // FLAT MOVEMENT ALONG THE SAME ELEVATION: mirrors
            // playerMoveProcess's own HEIGHT PENALTY block (gameEngine.js,
            // "else if (previousTerrain.elevated && terrain.elevated)
            // terrainMult = 1.0") — without it, this highlight BFS priced
            // every single step along a wall walkway at the full
            // climbRisk moveCostMult (the climb surcharge), as if the
            // player were climbing up fresh at each hex, instead of only
            // once on the initial ascent. That made "how far can I walk
            // along the wall" collapse to almost nothing despite the real
            // move (playerMoveProcess) charging ordinary cost for exactly
            // this case — the highlight and the real cost disagreed.
            const previousTerrain = window.getTerrainAt(hex.q, hex.r);
            const sameElevation = previousTerrain.elevated && terrain.elevated;
            const climbingUp = !player.isFlying && terrain.climbRisk && !previousTerrain.climbRisk;
            const climbingDown = !player.isFlying && previousTerrain.climbRisk && !terrain.climbRisk;
            let stepCost;
            if (climbingUp) {
                // Matches playerMoveProcess's own climbTransition: starting
                // a climb only ever charges 1 TP up front (the real ~125 TP
                // cost is deferred to the multi-turn climbing status), so
                // it should essentially always show as reachable rather
                // than being priced like a full atomic move.
                stepCost = 1;
            } else if (climbingDown) {
                // A ladder right where the player is currently standing
                // discounts climbing back down it, same as the ascent side
                // already does for the multi-turn climb — mirrors the
                // matching discount in playerMoveProcess's HEIGHT PENALTY
                // block above.
                const hasLadder = window.tileObjects?.[`${hex.q},${hex.r}`]?.type === 'ladder';
                const heightPenalty = getClimbCostMult(player) * (hasLadder ? 0.4 : 1);
                const moveCostMult = window.getMoveCostMult(n.q, n.r, player) + heightPenalty;
                stepCost = baseMoveCost * moveCostMult;
            } else {
                const moveCostMult = sameElevation ? 1 : window.getMoveCostMult(n.q, n.r, player);
                stepCost = baseMoveCost * (player.isFlying ? 1 : moveCostMult);
            }
            // Never free or a net TP gain — matches the real-move clamps
            // (playerMoveProcess etc.) so the highlighted range never shows
            // a hex as reachable more cheaply than it will actually cost.
            stepCost = Math.max(1, stepCost);
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

    // ANY ADJACENT HEX IS REACHABLE (unless literally impassable): TP works
    // like every other action cost in this engine — a single action can
    // spend more than the caller has left as long as they hadn't already
    // ended their turn (TP > threshold), it just drops them to (likely
    // negative) TP and ends the turn immediately afterward; you just can't
    // chain several such actions in one turn. The BFS above prices a single
    // step at its computed cost and only ever includes it if that fits
    // within the *remaining* budget, which is right for multi-hex chained
    // paths but wrong for a single adjacent step — a Climbable Wall hex
    // (now a committed multi-turn climb, climbTransition below, needing
    // only 1 TP to start) or any other expensive-but-passable terrain right
    // next to the player was being flatly rejected as "out of range" even
    // though a single move onto it is always a legal action while the turn
    // hasn't ended yet.
    if (moveEntity.timePoints > threshold) {
        window.getNeighbors(player.hex.q, player.hex.r).forEach(n => {
            const occupant = getEntityAtHex(n.q, n.r);
            if (occupant && (occupant.side === 'enemy' || occupant.blocksPlayerPath)) return;
            const t = window.getTerrainAt(n.q, n.r);
            if (t.impassable) return;
            const key = `${n.q},${n.r}`;
            if (reachable.has(key)) return; // already included at its real (affordable) cost
            window.highlightedHexes.push({ ...n, type: 'move' });
        });
    }

    let attackRange = 1;
    let isRanged = false;
    if (player.equipped && player.equipped.weapon) {
        const weapon = window.items[player.equipped.weapon];
        let rangeBonus = (weapon?.range || 0);
        if (weapon?.id === 'bow' && player.skills?.elf_bow_range) rangeBonus += (player.skills.elf_bow_range * 4);
        attackRange += rangeBonus;
        isRanged = (weapon?.subType === 'ranged');
        // HIGH GROUND RANGE (see the matching aiProcess block, gameEngine.js)
        if (isRanged && window.getTerrainAt(player.hex.q, player.hex.r).elevated) attackRange += 2;
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

// CAMPAIGN 4: SPRITE OVERLAY TEST SCENARIO — a plain grassland populated
// with static NPCs covering every playable race/gender combo, each shown in
// a few fixed loadouts so weapon/armor/helmet overlay anchors (CHAR_CONFIG's
// mainHand/offHand/helm/weaponSizeMult etc., gameEngine.js's
// drawPlayerCharacter) can be eyeballed and tuned side by side. All five
// races now have a real CHAR_CONFIG entry (goblin/orc reuse their flat
// monster sprite as the body layer, same pipeline as everyone else — see
// CHAR_CONFIG's goblin_male/orc_male comments). Not a real fight: no
// monsters, no combat, side left 'neutral' so nothing auto-engages.
window.SPRITE_TEST_ORIGIN = { q: 0, r: -6000 }; // far off in unused coordinate space, well clear of every other campaign's hand-placed content
const SPRITE_TEST_RACES = ['human', 'elf', 'dwarf', 'orc', 'goblin'];
const SPRITE_TEST_GENDERS = ['male', 'female'];
const SPRITE_TEST_LOADOUTS = [
    { label: 'sword+light+helm', equipment: ['sword', 'light_armor', 'nasal_helm'] },
    { label: 'spear+medium', equipment: ['spear', 'medium_armor'] },
    { label: 'axe+heavy', equipment: ['axe', 'heavy_armor'] },
    { label: 'dagger', equipment: ['dagger'] },
    { label: 'club', equipment: ['club'] },
    { label: 'bow', equipment: ['bow'] },
];
function setupSpriteTestScenario() {
    window.entities = [];
    window.isInCombat = false;
    window.currentTurnEntity = null;

    const origin = window.SPRITE_TEST_ORIGIN;
    const radius = Math.max(SPRITE_TEST_RACES.length * SPRITE_TEST_GENDERS.length, SPRITE_TEST_LOADOUTS.length) * 2 + 6;
    window.hexDisk(origin.q, origin.r, radius).forEach(h => window.setTerrainAt(h.q, h.r, 'Grass'));

    // One row per race/gender combo, one column per loadout — 4 hexes of
    // spacing both ways so a wide sprite (e.g. dwarf's 1.4x armour wMult)
    // never visually overlaps its neighbor.
    const rowSpacing = 4, colSpacing = 4;
    const colStart = -Math.floor((SPRITE_TEST_LOADOUTS.length - 1) / 2) * colSpacing;
    const combos = [];
    SPRITE_TEST_RACES.forEach(race => SPRITE_TEST_GENDERS.forEach(gender => combos.push({ race, gender })));
    const rowStart = -Math.floor((combos.length - 1) / 2) * rowSpacing;

    // Visibility (isVisibleToPlayer, hexMap.js) is computed relative to a
    // real side:'player' entity — without one, every hex here reads as
    // unexplored and renders as blank canvas. A big visionBonus guarantees
    // the whole grid is lit regardless of its final size; parked one row
    // above the topmost combo row (not at the grid's exact center, which
    // would land exactly on one of the NPCs since row/col spacing is even)
    // so it never visually overlaps whatever's being inspected.
    const playerHex = { q: origin.q, r: origin.r + rowStart - rowSpacing };
    const playerEntity = new window.Entity(window.party[0].name, 'red', playerHex, window.party[0].attributes.agility + 10);
    playerEntity.side = 'player';
    Object.assign(playerEntity, window.party[0]);
    playerEntity.hex = playerHex;
    playerEntity.visualQ = playerHex.q; playerEntity.visualR = playerHex.r;
    playerEntity.skills = window.party[0].skills;
    // A big flat bonus rather than radius-derived: vision range gets
    // multiplied by the current light level (worldTime.js), floored at
    // 0.2x at night — campaign 4 doesn't bother forcing full daylight (this
    // is a static display, not a real scene), so the bonus needs enough
    // headroom to clear that 5x worst-case reduction and still cover the
    // whole grid.
    playerEntity.visionBonus = 400;
    window.entities.push(playerEntity);

    combos.forEach((combo, row) => {
        SPRITE_TEST_LOADOUTS.forEach((loadout, col) => {
            const hex = { q: origin.q + colStart + col * colSpacing, r: origin.r + rowStart + row * rowSpacing };
            const ent = window.buildNPC({
                name: `${combo.race}_${combo.gender}_${loadout.label}`,
                title: loadout.label,
                race: combo.race, gender: combo.gender,
                hex,
                classLevels: ['fighter'],
                skillPicks: [],
                equipment: loadout.equipment,
                side: 'neutral',
            });
            window.entities.push(ent);
        });
    });

    window.drawMap();
    window.renderEntities();
}
window.setupSpriteTestScenario = setupSpriteTestScenario;

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
      skeletonBase: new Image(),
      barding_light: new Image(),
      barding_medium: new Image(),
      barding_heavy: new Image(),
      wolf: new Image(),
      torch_lit: new Image(),
      fireplace_base: new Image(),
      fireplace_flame: new Image(),
      fireplace_unlit: new Image(),
      oil_barrel: new Image(),
      axe: new Image(),
      troll: new Image(),
      dragon: new Image(),
      ore_vein: new Image(),
      tree_large: new Image(),
      spear: new Image(),
      club: new Image(),
      giant_club: new Image(),
      bow: new Image(),
      battering_ram: new Image(),
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
      unicorn: new Image(),
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
  visuals.fireplace_base.onload = () => { window.drawMap(); };
  visuals.fireplace_flame.onload = () => { window.drawMap(); };
  visuals.fireplace_unlit.onload = () => { window.drawMap(); };
  visuals.oil_barrel.onload = () => { window.drawMap(); };
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
  visuals.minotaur.src = 'images/minotaur.png';
  visuals.revenantBase.src = 'images/revenant.svg';
  visuals.skeletonBase.src = 'images/skeletonBase.svg';
  visuals.barding_light.src = 'images/barding_light.svg';
  visuals.barding_medium.src = 'images/barding_medium.svg';
  visuals.barding_heavy.src = 'images/barding_heavy.svg';
  visuals.wolf.src = 'images/wolf.png';
  visuals.torch_lit.src = 'images/torch_lit.svg';
  visuals.fireplace_base.src = 'images/fireplace_base.svg';
  visuals.fireplace_flame.src = 'images/fireplace_flame.svg';
  visuals.fireplace_unlit.src = 'images/fireplace_unlit.svg';
  visuals.oil_barrel.src = 'images/oil_barrel.svg';
  visuals.axe.src = 'images/axe.png';
  visuals.troll.src = 'images/troll.png';
  visuals.dragon.src = 'images/dragon.svg';
  visuals.ore_vein.src = 'images/ore_vein.svg';
  visuals.tree_large.src = 'images/tree_large.svg';
  visuals.spear.src = 'images/spear.png';
  visuals.club.src = 'images/club.svg';
  visuals.giant_club.src = 'images/giant_club.png';
  visuals.bow.src = 'images/bow.svg';
  visuals.battering_ram.src = 'images/battering_ram.svg';
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
  visuals.unicorn.src = 'images/unicorn.png';
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

  if (window.currentCampaign === "4") {
      setupSpriteTestScenario();
      document.addEventListener("keydown", window.handleMovement);
      window.mapCanvas.addEventListener("click", window.handleClick);
      if (!window.tickInterval) window.tickInterval = setInterval(tick, 10);
      if (window.centerCameraOn) window.centerCameraOn(window.SPRITE_TEST_ORIGIN);
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
    // elfMaleHair.png and dwarfFemaleHair.png are both drawn essentially
    // edge-to-edge with no transparent padding (confirmed directly: ~99.5%
    // of each canvas is opaque, versus ~52-82% for their well-padded
    // siblings elfFemaleHair/dwarfMaleHair) — "full" hair stretches the raw
    // image to the whole body box, so these two read as a giant hair-cape
    // covering nearly the entire body instead of a normal hairstyle. hair.
    // sizeMult (below) is the CHAR_CONFIG-level default for this correction
    // — same mechanism as the per-entity e.hairSizeMult override already
    // used for a couple of named NPCs before this was traced to specific
    // broken assets rather than a per-character quirk.
    elf_male:     { bodyW:2.00, bodyH:2.40, yOff:-0.20, baseKey:'elfMaleBase',     hair:{ key:'elfMaleHair',     type:'full', sizeMult:0.15                         }, armour:{ wMult:1.0, topShift:0.3 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.37, y:0.63 }, offHand:{ x:0.58, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    elf_female:   { bodyW:2.00, bodyH:2.40, yOff:-0.20, baseKey:'elfFemaleBase',   hair:{ key:'elfFemaleHair',   type:'full'                                        }, armour:{ wMult:1.0, topShift:0.3 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.37, y:0.63 }, offHand:{ x:0.58, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    dwarf_male:   { bodyW:1.60, bodyH:1.92, yOff:-0.07, baseKey:'dwarfMaleBase',   hair:{ key:'dwarfMaleHair',   type:'full'                                        }, armour:{ wMult:1.4, topShift:0.1 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.33, y:0.61 }, offHand:{ x:0.52, y:0.45 }, weaponSizeMult:1.0, shieldSizeMult:0.36 },
    dwarf_female: { bodyW:1.60, bodyH:1.92, yOff:-0.07, baseKey:'dwarfFemaleBase', hair:{ key:'dwarfFemaleHair', type:'full', sizeMult:0.2 }, armour:{ wMult:1.4, topShift:0.1 }, helm:{ xOff:0,     yOff:0,     sizeMult:1.0 }, mainHand:{ x:0.33, y:0.61 }, offHand:{ x:0.52, y:0.45 }, weaponSizeMult:1.0, shieldSizeMult:0.36 },
    // No dedicated layered orc body art exists (no orcMaleBase/orcFemaleBase
    // images) — reuses the flat orc.png monster sprite (window.gameVisuals.
    // orcBase) as the body layer itself, same "no hair" treatment as
    // revenant/skeleton below. This routes orc players/companions through
    // the SAME equipment-layering pipeline as every other race (armour/
    // weapon/shield images are already race-agnostic, see the ARMOUR/SHIELD/
    // WEAPON blocks below) instead of the old early-return that drew only
    // the flat sprite with no equipment at all.
    orc_male:     { bodyW:1.90, bodyH:2.10, yOff:-0.15, baseKey:'orcBase', hair:{ key:null }, armour:{ wMult:1.1, topShift:0.1 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    orc_female:   { bodyW:1.85, bodyH:2.05, yOff:-0.15, baseKey:'orcBase', hair:{ key:null }, armour:{ wMult:1.1, topShift:0.1 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },

    // Goblin: same treatment as orc above — no dedicated layered body art,
    // reuses the flat goblin.png monster sprite (window.gameVisuals.
    // monsterDefault) as the body layer. Smaller bodyW/H than orc (goblins
    // are the small/wiry race per raceData's flavor), otherwise the same
    // full equipment-layering pipeline every other race gets. This used to
    // hit drawPlayerCharacter's early-return (no CHAR_CONFIG entry at all),
    // drawing only the flat sprite with no weapon/armor/helmet ever shown.
    goblin_male:   { bodyW:1.50, bodyH:1.75, yOff:-0.12, baseKey:'monsterDefault', hair:{ key:null }, armour:{ wMult:0.9, topShift:0.1 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.0 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:0.85, shieldSizeMult:0.36 },
    goblin_female: { bodyW:1.45, bodyH:1.70, yOff:-0.12, baseKey:'monsterDefault', hair:{ key:null }, armour:{ wMult:0.9, topShift:0.1 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.0 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:0.85, shieldSizeMult:0.36 },

    // ENEMY HUMANOIDS — sprite keys need matching images (e.g. gameVisuals.revenantBase)
    // Use backtick debug overlay to tune anchor dots once sprites are loaded.
    revenant_male:   { bodyW:1.85, bodyH:2.20, yOff:-0.18, baseKey:'revenantBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    revenant_female: { bodyW:1.65, bodyH:1.96, yOff:-0.16, baseKey:'revenantBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    // Skeleton: a real limbed body (skeletonBase.svg, arms/legs distinct
    // from the torso) instead of the old flat single-image sprite, so
    // whatever it's randomly equipped with (assignRandomEquipment,
    // monsters.js) actually layers on visibly — same anchor tuning as
    // revenant (closest existing "bony humanoid" posture).
    skeleton_male:   { bodyW:1.85, bodyH:2.20, yOff:-0.18, baseKey:'skeletonBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.35, y:0.64 }, offHand:{ x:0.59, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
    skeleton_female: { bodyW:1.65, bodyH:1.96, yOff:-0.16, baseKey:'skeletonBase', hair:{ key:null }, armour:{ wMult:1.05, topShift:0 }, helm:{ xOff:0.067, yOff:0.067, sizeMult:1.1 }, mainHand:{ x:0.40, y:0.66 }, offHand:{ x:0.60, y:0.50 }, weaponSizeMult:1.0, shieldSizeMult:0.42 },
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
        // Note: orc and goblin both now have real CHAR_CONFIG entries
        // (baseKey:'orcBase'/'monsterDefault' respectively), so they go
        // through the full equipment-layering path below instead of
        // hitting this fallback block at all (this branch only fires if
        // gameVisuals itself isn't loaded yet, same as every other race).
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
            const sizeMult = e.hairSizeMult !== undefined ? e.hairSizeMult : (hc.sizeMult !== undefined ? hc.sizeMult : 1);
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
    else if (mainW === 'bow')    weaponImg = window.gameVisuals.bow;
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

  // Computed once for the whole function instead of once per mapItems/
  // tileObjects/entity check below — isVisibleToPlayer otherwise re-filters
  // all of window.entities on every single call, and this function can call
  // it hundreds of times per frame (once per tileObject in the entire
  // persistent world, not just what's on screen). See the matching comment
  // in drawMap (hexMap.js) for the measured cost.
  const _friendlies = window.entities.filter(e => e.alive && e.side === 'player');

  // The mapItems/tileObjects loops below used to iterate *every* entry in
  // those two dictionaries — every fireplace, table, door, watchtower ever
  // placed anywhere in the persistent world, not just what's nearby — and
  // call isVisibleToPlayer on each just to find out. That's the same
  // "full-world scan to answer a question that should only ever consider
  // what's near the camera" shape hasLineOfSight had. Reusing drawMap's own
  // viewport bounding box (hexMap.js) as a cheap pre-filter means only
  // objects that could conceivably be on screen ever reach the (still
  // real, but now rarely-called) isVisibleToPlayer check.
  const _viewBounds = window.getVisibleHexes ? window.getVisibleHexes() : null;
  const _inViewBounds = (q, r) => !_viewBounds
      || (q >= _viewBounds.minQ && q <= _viewBounds.maxQ && r >= _viewBounds.minR && r <= _viewBounds.maxR);

  for (const coord in window.mapItems) {
      const items = window.mapItems[coord];
      if (items && items.length > 0) {
          const [q, r] = coord.split(',').map(Number);
          if (!_inViewBounds(q, r)) continue;
          if (!window.isVisibleToPlayer({ q, r }, _friendlies)) continue;
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
      if (_inViewBounds(q, r) && window.isVisibleToPlayer({q, r}, _friendlies)) {
          const {x, y} = window.hexToPixel(q, r);
          const size = window.hexSize * 1.5 * z;
          if (obj.type === 'fireplace' && obj.lit === false && window.gameVisuals.fireplace_unlit?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.fireplace_unlit, x - size/2, y - size/2, size, size);
          } else if (obj.type === 'fireplace' && window.gameVisuals.fireplace_base?.complete && window.gameVisuals.fireplace_flame?.complete) {
              // Stones/logs are static; only the flame layer pulses — drawing
              // the whole fireplace.svg at a scaled/faded size made the
              // stone base flicker along with the fire, which read as the
              // whole prop wobbling rather than a fire flickering.
              window.mapCtx.drawImage(window.gameVisuals.fireplace_base, x - size/2, y - size/2, size, size);
              const { scale, alpha } = fireFlicker(key);
              const fSize = size * scale;
              window.mapCtx.globalAlpha = alpha;
              window.mapCtx.drawImage(window.gameVisuals.fireplace_flame, x - fSize/2, y - fSize/2, fSize, fSize);
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'oil_barrel' && window.gameVisuals.oil_barrel?.complete) {
              window.mapCtx.drawImage(window.gameVisuals.oil_barrel, x - size/2, y - size/2, size, size);
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
          } else if (obj.type === 'body_marker') {
              // A fallen body: a dark, flattened silhouette (not the brown
              // "harvestable animal corpse" ellipse above) — reads clearly
              // as "something died here", never mistaken for a still-living
              // enemy the way the old "just vanish" behavior could at a
              // glance mid-fight.
              window.mapCtx.globalAlpha = 0.75;
              window.mapCtx.fillStyle = '#2b2b2b';
              window.mapCtx.beginPath();
              window.mapCtx.ellipse(x, y, size * 0.4, size * 0.18, Math.PI / 5, 0, Math.PI * 2);
              window.mapCtx.fill();
              window.mapCtx.strokeStyle = 'rgba(120,0,0,0.6)';
              window.mapCtx.lineWidth = 1.5;
              window.mapCtx.stroke();
              window.mapCtx.globalAlpha = 1.0;
          } else if (obj.type === 'unicorn_track') {
              // Only drawn at all if this hex's track happens to fall within
              // the visible fraction for the player's current Knowledge:
              // Nature rank (see isUnicornTrackVisible, gameEngine.js) — a
              // rank-0 player never sees any of these.
              if (!window.isUnicornTrackVisible(q, r)) {
                  // skip silently
              } else {
                  const dq = obj.dirQ, dr = obj.dirR;
                  const dxp = 1.5 * dq;
                  const dyp = Math.sqrt(3) * dr + (Math.sqrt(3) / 2) * dq;
                  const dirAngle = Math.atan2(dyp, dxp);
                  window.mapCtx.save();
                  window.mapCtx.translate(x, y);
                  window.mapCtx.rotate(dirAngle);
                  window.mapCtx.fillStyle = 'rgba(120, 100, 90, 0.75)';
                  // Two small hoof-print ovals, offset like a walking gait,
                  // plus a small chevron pointing the direction of travel.
                  window.mapCtx.beginPath();
                  window.mapCtx.ellipse(-size * 0.12, -size * 0.08, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
                  window.mapCtx.fill();
                  window.mapCtx.beginPath();
                  window.mapCtx.ellipse(size * 0.05, size * 0.08, size * 0.08, size * 0.05, 0, 0, Math.PI * 2);
                  window.mapCtx.fill();
                  window.mapCtx.strokeStyle = 'rgba(120, 100, 90, 0.9)';
                  window.mapCtx.lineWidth = 2;
                  window.mapCtx.beginPath();
                  window.mapCtx.moveTo(size * 0.2, -size * 0.1);
                  window.mapCtx.lineTo(size * 0.32, 0);
                  window.mapCtx.lineTo(size * 0.2, size * 0.1);
                  window.mapCtx.stroke();
                  window.mapCtx.restore();
              }
          } else if (obj.type === 'flag') {
              // Arena flag-defense/flag-attack scenarios: no dedicated art
              // asset, so drawn as a simple pole + banner like the other
              // shape-only tile objects above.
              window.mapCtx.strokeStyle = '#8a6d4a';
              window.mapCtx.lineWidth = 2;
              window.mapCtx.beginPath();
              window.mapCtx.moveTo(x, y + size * 0.4);
              window.mapCtx.lineTo(x, y - size * 0.5);
              window.mapCtx.stroke();
              window.mapCtx.fillStyle = obj.friendly ? '#3a7de0' : '#c0392b';
              window.mapCtx.beginPath();
              window.mapCtx.moveTo(x, y - size * 0.5);
              window.mapCtx.lineTo(x + size * 0.35, y - size * 0.35);
              window.mapCtx.lineTo(x, y - size * 0.2);
              window.mapCtx.fill();
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
  // Same viewport pre-filter as above: a cheap bounding-box check on every
  // entity's own hex before the real (and now much cheaper, but still non-
  // free) isVisibleToPlayer call and the sort — avoids copying/sorting the
  // *entire* entity roster (thousands, in a populous world) every frame
  // when only a handful can possibly be on screen.
  const sorted = window.entities.filter(e => e.alive && _inViewBounds(e.hex.q, e.hex.r) && window.isVisibleToPlayer(e.hex, _friendlies)).sort((a, b) => {
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
      
      // ALLEGIANCE OUTLINE: a fight with several factions in the same room
      // (the tavern brawl, an arena boss + guards, a goblin camp) is hard to
      // read from sprite color alone — party/temporary-ally/bystander/enemy
      // each get their own hex outline color, drawn under the sprite. Drawn
      // at the true (pre-elevation-offset) grid position — it marks which
      // hex the entity actually occupies, so it must stay put even when the
      // sprite itself is lifted for the elevated-terrain 3D effect below.
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

      // TERRAIN OFFSET: stand on top of any elevated terrain (pedestals, fort
      // ramparts) — a purely visual lift for the sprite itself, applied after
      // the outline above so the outline stays anchored to the real hex.
      const t = window.getTerrainAt(e.hex.q, e.hex.r);
      if (t.elevated) {
          y -= (window.hexSize * 0.6) * z; // 30% of hex height (2*size is full height)
      }

      // MELEE LUNGE: pivot+bump toward whoever this entity is mid-swing at
      // (see combatFX.js). Wraps body+equipment+torch/flash below so the
      // whole entity moves as one unit; the allegiance outline above is
      // deliberately drawn before this and stays anchored to the real hex.
      const _lunge = window.getMeleeLungeTransform ? window.getMeleeLungeTransform(e, window.hexToPixel, z) : null;
      if (_lunge) {
          window.mapCtx.save();
          window.mapCtx.translate(x + _lunge.dx, y + _lunge.dy);
          window.mapCtx.rotate(_lunge.rotation);
          window.mapCtx.translate(-x, -y);
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
                          if (e.name === 'Unicorn' && window.gameVisuals.unicorn?.complete) img = window.gameVisuals.unicorn;
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
                          // Barding: light/medium/heavy overlays (images/barding_*.svg),
                          // drawn over the same box as the mount's own sprite — real
                          // mounts (mountSize > 0) plus the Unicorn specifically, since
                          // it's a companion rather than a rider mount (mountSize: 0 by
                          // design, see monsters.js) but should still be able to wear
                          // barding cosmetically/defensively like any other animal ally.
                          if ((e.mountSize > 0 || e.name === 'Unicorn') && e.equipped && window.BARDING_IMAGE_KEYS?.[e.equipped.armor]) {
                              const bardingImg = window.gameVisuals[window.BARDING_IMAGE_KEYS[e.equipped.armor]];
                              if (bardingImg && bardingImg.complete) {
                                  const finalWidth = size * widthMult;
                                  window.mapCtx.drawImage(bardingImg, x - finalWidth/2, y - size/2 + yOffset, finalWidth, size);
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
                          else if (e.equipped?.weapon === 'bow') weaponImgEn = window.gameVisuals.bow;
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
    if (_lunge) window.mapCtx.restore();
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

// Called from tick() every 10ms. A true dirty-flag (updated wherever
// aiState is set) would need every one of the 20+ scattered
// `entity.aiState = 'combat'` assignment sites across the codebase to
// reliably flip it — a real risk that a future content addition misses one
// and silently goes stale. Throttling instead needs no such bookkeeping:
// while nothing is in combat, .some() must scan every entity to confirm
// that (its expensive worst case), so that full recheck is capped to once
// every IN_COMBAT_RECHECK_MS instead of every single tick. Once something
// IS in combat, .some() finds a match almost immediately (cheap either
// way) and is rechecked on every call with no throttle, so combat ending
// is still detected without delay.
const IN_COMBAT_RECHECK_MS = 100;
let _cachedInCombat = false;
let _lastInCombatCheckTime = -Infinity;
function checkInCombat() {
    if (_cachedInCombat) {
        _cachedInCombat = window.entities.some(e => e.alive && e.side === 'enemy' && e.aiState === 'combat');
        _lastInCombatCheckTime = performance.now();
        return _cachedInCombat;
    }
    const now = performance.now();
    if (now - _lastInCombatCheckTime < IN_COMBAT_RECHECK_MS) return false;
    _lastInCombatCheckTime = now;
    _cachedInCombat = window.entities.some(e => e.alive && e.side === 'enemy' && e.aiState === 'combat');
    return _cachedInCombat;
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
    // A directed neutral (combatDirective — e.g. Northwatch's garrison,
    // ordered to fight the orc assault while still side:'neutral' toward
    // the player) is never ambient background flavor, no matter how far
    // the literal player character's own hex is from the fight. Without
    // this, every such defender gets silently excluded from the regen
    // sweep below for the fight's entire duration — this check measures
    // distance to the player's own body, which has nothing to do with
    // whether the fight itself is active. The sibling function this
    // mirrors, isCombatDormant, already carves out the same case for
    // 'enemy'-side entities via aiState==='combat'; this one had no
    // equivalent escape hatch at all, so a "neutral but actively fighting"
    // combatant like a fort soldier could never regen TP mid-siege —
    // confirmed directly: every regen tick in a Northwatch defense sim
    // granted attackers TP and defenders exactly zero, every time.
    if (e.combatDirective) return false;
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
let _lastRealtimeRenderTime = 0; // throttles tick()'s real-time-branch redraw, cadence set adaptively below
let _lastDrawCameraX, _lastDrawCameraY, _lastDrawCameraZoom, _lastDrawLightLevel;

// Adaptive frame-rate cap: on a phone too slow to actually paint at 60fps,
// forcing 60 redraws/sec just means every one of them arrives late and the
// game feels worse than if it had simply targeted a lower, achievable rate.
// Track a rolling average of how long drawMap()+renderEntities() actually
// take on frames that do draw, and back off the throttle interval (60fps ->
// 30fps -> 15fps) when that average can't fit inside the current interval;
// recover back up if the device turns out to keep up comfortably.
const _RENDER_INTERVALS_MS = [16, 33, 66]; // ~60fps, ~30fps, ~15fps
let _renderIntervalTier = 0;
let _avgRenderCostMs = 0;
let _manualRenderIntervalMs = null; // set by the B1 graphics-options menu; null = adaptive Auto mode
function _recordRenderCost(ms) {
    if (_manualRenderIntervalMs !== null) return; // manual frame-rate pin: adaptive backoff is off
    _avgRenderCostMs = _avgRenderCostMs === 0 ? ms : _avgRenderCostMs * 0.9 + ms * 0.1;
    const currentInterval = _RENDER_INTERVALS_MS[_renderIntervalTier];
    if (_avgRenderCostMs > currentInterval * 0.9 && _renderIntervalTier < _RENDER_INTERVALS_MS.length - 1) {
        _renderIntervalTier++;
    } else if (_renderIntervalTier > 0 && _avgRenderCostMs < _RENDER_INTERVALS_MS[_renderIntervalTier - 1] * 0.5) {
        _renderIntervalTier--;
    }
}
window._getRenderIntervalMs = () => _manualRenderIntervalMs !== null ? _manualRenderIntervalMs : _RENDER_INTERVALS_MS[_renderIntervalTier];
window._recordRenderCost = _recordRenderCost; // exposed for direct testing of the adaptive backoff
// Test-only hook: force back to the fastest tier so tests asserting a fixed
// ~60Hz redraw cadence aren't thrown off by cost measurements picked up from
// earlier, unrelated heavy draws in the same page.
window._resetRenderPacing = () => { _renderIntervalTier = 0; _avgRenderCostMs = 0; _manualRenderIntervalMs = null; };
// graphicsSettings.js's setFrameRateMode: a manual pin overrides the
// adaptive backoff entirely (pass null to hand control back to Auto).
window._setManualRenderInterval = (ms) => { _manualRenderIntervalMs = ms; };

// Is there any actual reason the canvas would look different from the last
// frame drawn? drawMap() alone re-walks every visible hex (terrain lookup,
// variant/tint picking, occupied-hex scans) even when the camera hasn't
// moved and nothing on screen is animating — standing still reading
// dialogue or idling in a safe room was paying that full cost 60 times a
// second for a pixel-identical frame. Checked once per tick instead of
// unconditionally redrawing: camera pan/zoom, any entity mid-movement,
// any transient FX in flight (projectiles/floating text/screen shake/melee
// lunge), or the day-night light level having actually drifted since the
// last frame we drew. Deliberately NOT gated on fire/torch flicker
// specifically — pausing that animation for the handful of idle frames
// before the next real reason to redraw is imperceptible, and gating on it
// would mean every scene with a lit torch never gets to skip a frame at
// all, defeating the point.
function sceneNeedsRedraw() {
    if (window.cameraX !== _lastDrawCameraX || window.cameraY !== _lastDrawCameraY || window.cameraZoom !== _lastDrawCameraZoom) return true;
    if (window.lightLevel !== _lastDrawLightLevel) return true;
    if (window.projectiles && window.projectiles.length > 0) return true;
    if (window.floatingTexts && window.floatingTexts.length > 0) return true;
    if (performance.now() < (window._screenShakeUntil || 0)) return true;
    for (const e of window.entities) {
        if (!e.alive) continue;
        if (e.destination) return true;
        // Same "actually mid-move" condition updateVisualPositions itself
        // uses to decide whether to keep lerping — NOT a raw visualQ/hex.q
        // comparison: a multi-hex creature's resting visual position is its
        // footprint's centroid (updateVisualPositions' targetQ/targetR),
        // which is legitimately fractional and unequal to hex.q even
        // standing still, so that comparison flagged every Troll/Ogre as
        // "always animating" and defeated the whole point of this check.
        if (e.moveCooldown !== undefined && e.moveCooldown > 0 && e.moveTotalTime) return true;
        if (e._meleeLungeStart && performance.now() - e._meleeLungeStart < e._meleeLungeDuration) return true;
    }
    return false;
}

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
            if (window.siegeState?.active) tickSiegeState();
            // The catapult only ever gets a scheduled turn (isCatapult block,
            // aiProcess) while window.isInCombat is true — fine for the
            // sally/join paths where the player is actively fighting nearby,
            // but a player who stays passive in the fort never flips that
            // flag, so the catapult would otherwise just sit there silently
            // forever. Fire it here too, on the same real-time cadence as
            // this out-of-combat refresh, whenever the siege is active and
            // no turn-based combat is covering it.
            if (window.siegeState?.active) {
                // NOT campaign2NorthwatchSiegeEngine — that's a separate,
                // older 'siege_engine' entity that startNorthwatchSally/
                // joinGreenskinAssault operate on and has no firesRemaining
                // at all. campaign2NorthwatchCatapult (crew, guards,
                // isCatapult/firesRemaining) is the one fireCatapultShot and
                // the isCatapult aiProcess block are actually built for.
                const catapult = window.campaign2NorthwatchCatapult;
                // Built with isNPC:true (campaign2World.js, "spawned idle/
                // inert") and never cleared once it actually starts firing
                // — updateTurnIndicator (ui.js) excludes anyone with isNPC
                // set, so the catapult (and by extension "the attackers,"
                // since it's the only one doing anything during this early
                // phase) never showed in the initiative tracker even while
                // actively bombarding the wall.
                if (catapult) catapult.isNPC = false;
                if (catapult && catapult.alive && catapult.firesRemaining > 0) fireCatapultShot(catapult);
                // The catapult firing itself is the only thing that ever gets
                // a scheduled turn while the player stays passive — nothing
                // else acts until it's spent. The instant it's gone, spawn
                // the real assault wave (window.spawnGreenskinAssaultWave,
                // campaign2Dialogue.js), which also flips isInCombat so the
                // wave actually starts taking turns from here on.
                else if (catapult && !catapult.alive && !window.greenskinWaveSpawned && window.spawnGreenskinAssaultWave) {
                    window.spawnGreenskinAssaultWave();
                }
            }
            if (window.warState?.active) tickWarState();
            if (window.tickUnicornWander) window.tickUnicornWander();
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
        // Simulation runs at the tick's own 10ms (100Hz) cadence for movement
        // precision, but painting doesn't need to. Two layers of savings:
        // 1. Throttled to ~60Hz (the highest real display refresh rate this
        //    needs to match) instead of repainting on every 10ms tick.
        // 2. Skipped ENTIRELY (not just throttled) when sceneNeedsRedraw()
        //    says nothing could actually look different from the last frame
        //    drawn — standing still reading dialogue, idling in a safe room,
        //    a paused/menu-only moment — drawMap() alone re-walks every
        //    visible hex (terrain lookup, variant/tint picking, occupied-hex
        //    scans) even when literally nothing on screen has changed, so
        //    this is the bigger win of the two for how most play sessions
        //    actually spend their time. Both are no-ops on the *content* of
        //    any frame that does draw — this only ever removes redundant,
        //    pixel-identical repaints, never changes what gets shown.
        if (now - _lastRealtimeRenderTime >= window._getRenderIntervalMs() && sceneNeedsRedraw()) {
            _lastRealtimeRenderTime = now;
            _lastDrawCameraX = window.cameraX; _lastDrawCameraY = window.cameraY; _lastDrawCameraZoom = window.cameraZoom;
            _lastDrawLightLevel = window.lightLevel;
            const _renderStart = performance.now();
            window.drawMap();
            window.renderEntities();
            _recordRenderCost(performance.now() - _renderStart);
        }
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

// Matches findPath's player-pathing rule (hexMap.js): a neutral NPC never
// blocks the player's own movement, only a genuine 'enemy' or an NPC
// explicitly opted in via blocksPlayerPath. AI-controlled entities keep the
// original "any other side blocks" rule. Shared by processRealTimeStep's
// path-cache validity check and its actual per-step collision check below —
// before this existed, findPath (loosened) and this function (still
// side!==side) disagreed, so the player's path planner would route through
// a neutral NPC and then this function would immediately cancel the whole
// destination the moment it tried to actually take that step.
function isRealMoveBlocker(entity, occupant) {
    if (!occupant) return false;
    if (entity.side === 'player') return occupant.side === 'enemy' || occupant.blocksPlayerPath;
    return occupant.side !== entity.side;
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
        const blocked = isRealMoveBlocker(entity, occ) || window.getTerrainAt(candidate.q, candidate.r).impassable;
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
        // Prevent walking onto occupied hexes (collision) — enemies only; friendlies don't block
        const nextOccupant = window.getEntityAtHex(nextHex.q, nextHex.r);
        if (isRealMoveBlocker(entity, nextOccupant)) {
            entity.destination = null;
            entity._pathCache = null;
            entity.moveCooldown = 0;
            entity.moveTotalTime = 0;
            return false;
        }

        const terrain = window.getTerrainAt(nextHex.q, nextHex.r);

        let stepCost = 5 * window.getMoveCostMult(nextHex.q, nextHex.r, moveEntity);
        if (moveEntity.skills?.fastMovement) stepCost -= moveEntity.skills.fastMovement;
        // Never free or a net TP gain — see the matching clamp in
        // playerMoveProcess above.
        stepCost = Math.max(1, stepCost);

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

// An 'enemy'-side entity that hasn't yet engaged (aiState !== 'combat') and
// is more than this many hexes from every party member cannot meaningfully
// join the fight for many turns, so there's no reason to spend TP-
// bookkeeping or turn-eligibility work on it every time runTickInternal
// runs — same "not worth simulating yet" reasoning as ACTIVE_SIM_RADIUS
// (hexMap.js) applies to ambient NPCs, just applied to combat instead of
// exploration. Once flagged aiState:'combat' an entity is an active
// participant of the current fight and stays fully simulated regardless of
// distance until it dies, flees, or the encounter resolves — a fleeing
// enemy, a knockback effect, or the party sprinting away mid-fight must
// never "pause" someone who's already engaged just because they crossed
// this radius; the radius only ever gates *whether something not yet
// involved is worth bothering with*, never an existing combatant.
const COMBAT_DORMANT_RADIUS = 40;
function isCombatDormant(e, partyHexes) {
    if (e.side !== 'enemy') return false;
    if (e.aiState === 'combat') return false; // already engaged — never dormant, regardless of distance
    for (const ph of partyHexes) {
        if (window.distance(ph, e.hex) <= COMBAT_DORMANT_RADIUS) return false;
    }
    return true;
}

function runTickInternal(isSleepCycle = false, skipUI = false, tickMultiplier = 1.0) {
    if (window.multiplayer && window.multiplayer.roomCode && !window.multiplayer.isHost) {
        return;
    }
    if (window.currentTurnEntity && !isSleepCycle) return;

    // NORTHWATCH RAM/SAPPER PACING: they deliberately don't exist yet when
    // wave 1 first spawns (spawnGreenskinAssaultWave, campaign2Dialogue.js)
    // — they spawn later and march in from outside the wall, same as any
    // other attacker. Counted in real ticks (this function's own call
    // cadence — every 10ms of live play, see the setInterval(tick, 10)
    // call sites) rather than wave-1 entity-turns, which scaled badly: with
    // 30 wave-1 attackers cycling through, an entity-turn counter reached
    // its threshold within just a couple of rounds. A tick count is
    // independent of how many attackers exist.
    if (window.isInCombat && window.greenskinWaveSpawned && !window.greenskinRamSapperSpawned) {
        window.greenskinWaveTicksSinceSpawn = (window.greenskinWaveTicksSinceSpawn || 0) + 1;
        if (window.greenskinWaveTicksSinceSpawn >= 3000 && window.spawnBatteringRamAndSapper) {
            window.spawnBatteringRamAndSapper();
        }
    }

    // TIMED BUFF/DEBUFF EXPIRY: any activeSpells entry carrying
    // ticksRemaining (e.g. Wild Fury, spells.js) counts down once per call,
    // scaled by tickMultiplier the same way poison/wither ticks already
    // are, and is cancelled the instant it reaches 0. Deliberately hoisted
    // above the takeTurn/regen branch split below — that split is mutually
    // exclusive per call (one entity's turn OR the passive regen sweep,
    // never both), so a duration tied to only one branch could stall for
    // an entire fast-paced combat where entities are ready every tick.
    // Entries with no ticksRemaining field (Sanctuary, Divine Protection,
    // the silence penalty) are untouched — those still only end via their
    // own specific trigger, not a timer.
    if (window.activeSpells && window.activeSpells.length) {
        window.activeSpells.filter(s => s.ticksRemaining !== undefined).forEach(s => {
            s.ticksRemaining -= tickMultiplier;
            if (s.ticksRemaining <= 0) cancelSpell(s.spellInstanceId);
        });
    }

    const _partyHexesForTurnOrder = collectPartyHexes();

    // PLAYER DISENGAGE: the player's own version of an AI entity fleeing —
    // if the whole party gets and stays far enough from every hostile, the
    // fight is over. Deliberately NOT the same as markFled: nobody died or
    // broke, the player just walked away, so no XP for kills that didn't
    // happen (a wolf fight abandoned mid-chase shouldn't reward you the
    // same as one you won). See checkPlayerCombatDisengage below for the
    // scripted-encounter exclusions (sieges etc. resolve through their own
    // win conditions, not this generic rule).
    if (window.isInCombat) checkPlayerCombatDisengage();

    // Only scan for whose turn it is when actually in combat — out of combat
    // this full-array filter ran every frame for nothing.
    const readyEntities = (window.isInCombat && !isSleepCycle)
        ? window.entities.filter(e => e.timePoints >= 100 && e.alive && !e.unconscious && !e.rider && !isCombatDormant(e, _partyHexesForTurnOrder))
        : [];

    // Only trigger turn-based logic if in combat
    if (window.isInCombat && readyEntities.length > 0 && !isSleepCycle) {
        // `Array.sort` with a `Math.random()-0.5` tie-break is a known JS
        // anti-pattern — an inconsistent comparator, which different sort
        // implementations can handle very unevenly (observed in practice:
        // with many entities tied at exactly 100 TP — e.g. two full-strength
        // sides spotting each other simultaneously — it could end up never
        // selecting one entity's turn at all, rather than picking fairly at
        // random among the ties). Sort purely by TP, then explicitly roll a
        // fair random pick among whoever's actually tied for the top slot.
        readyEntities.sort((a, b) => b.timePoints - a.timePoints);
        const topTP = readyEntities[0].timePoints;
        const tiedForTop = readyEntities.filter(e => e.timePoints === topTP);
        window.currentTurnEntity = tiedForTop[Math.floor(Math.random() * tiedForTop.length)];
        window.currentTurnEntity.parriesRemaining = 3;
        // Snapshot for orc_momentum (resolveAttack) — bonus damage on an
        // attack made after covering real ground this turn, compared
        // against wherever the entity started it.
        window.currentTurnEntity.turnStartHex = { ...window.currentTurnEntity.hex };
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
        const _partyHexes = _partyHexesForTurnOrder;
        // In combat (or during sleep fast-forward) every *reachable*
        // combatant needs TP granted / effects ticked — "reachable" now
        // excludes isCombatDormant entities (far-away 'enemy' side, see
        // above) too, not just every entity unconditionally. Out of combat,
        // only entities not at full rest need anything — iterate the small
        // restless set instead of all ~80+ world entities, so a full-health,
        // unpoisoned capital costs nothing.
        const workingSet = isSleepCycle
            ? window.entities
            : window.isInCombat
                ? window.entities.filter(e => !isCombatDormant(e, _partyHexes))
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

                    // Health Regeneration — every side, not just the player's,
                    // so NPCs (garrisons, monsters, anyone) heal passively too
                    // instead of every point of damage being permanent for
                    // the rest of a fight. Already scoped by the surrounding
                    // workingSet/dormancy filtering, so this doesn't cost
                    // anything for the countless full-health, out-of-combat
                    // NPCs across the world.
                    let hRegen = 0.1;
                    if (e.skills?.health_regen) hRegen += e.skills.health_regen * 0.1;
                    e.hp = Math.min(e.maxHp, e.hp + (hRegen * tpGained));

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

    // CLIMBING: committed to a multi-turn wall climb (see the climbTransition
    // branches in playerMoveProcess/aiProcess) — same TP rule as every other
    // action: spend everything above the 80 end-of-turn threshold (not all
    // the way to 0) toward it, then the turn ends immediately, no menu/
    // decision either way, same shape as the petrified/charmed scripted-turn
    // cases above. A fresh 100-TP turn banks 20 progress; with the 125 base
    // cost that's 7 turns (6x20 + 5) exposed on the wall without a ladder —
    // genuinely hard work, and genuinely risky (resolveAttack's fall check).
    if (entity.climbing) {
        const climbSpend = Math.max(1, entity.timePoints - 80);
        spendTP(entity, climbSpend);
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
            // Fog of war/exploration otherwise only updates on the
            // out-of-combat periodic tick (see tick(), gameEngine.js) — a
            // fight that starts in previously-unexplored terrain (an ambush,
            // a wandering monster) would otherwise stay pitch black around
            // the party for the fight's entire duration, even as they move
            // and new hexes come into line of sight turn by turn. Refresh it
            // here too, once per player-controlled character's turn.
            if (window.updateExploration) window.updateExploration();
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
        if (doorObj.readId === 'crypt_entrance_note' && window.readCryptEntranceNote) { window.readCryptEntranceNote(); return; }
        if (doorObj.readId === 'lich_phylactery_core' && window.readLichPhylacteryCoreNote) { window.readLichPhylacteryCoreNote(); return; }
        if (doorObj.readId === 'deepholds_mine_ledger' && window.readDeepholdsMineLedger) { window.readDeepholdsMineLedger(); return; }
        if (doorObj.readId === 'silverhart_bounty_board' && window.readSilverhartBountyBoard) { window.readSilverhartBountyBoard(); return; }
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
    if (doorObj.type === 'gate_lever' && window.pullNorthwatchGateLever) { window.pullNorthwatchGateLever(); return; }
    if (doorObj.type === 'unicorn_track' && window.showUnicornTrackDetail) { window.showUnicornTrackDetail(doorObj, q, r); return; }
    if (doorObj.type === 'fireplace') { toggleFireplace(q, r, player); return; }
}
window.interactWithTileObject = interactWithTileObject;

// Lighting/dousing a campfire by hand requires a torch equipped (weapon or
// offhand) and, in turn-based combat, 5 TP — the same shape as a reaction
// ability's TP gate. From range, a firebolt lights an unlit one instead (see
// resolveSpell's fire-on-world-objects check) with no torch/TP requirement.
function toggleFireplace(q, r, actor) {
    const obj = window.tileObjects[`${q},${r}`];
    if (!obj || obj.type !== 'fireplace') return;
    const hasTorch = actor?.equipped?.weapon === 'torch' || actor?.equipped?.offhand === 'torch';
    if (!hasTorch) {
        window.showMessage("You need a torch equipped to light or douse a campfire.");
        return;
    }
    if (window.isInCombat) {
        if ((actor.timePoints || 0) < 5) {
            window.showMessage("Not enough time points (needs 5).");
            return;
        }
        spendTP(actor, 5);
    }
    const currentlyLit = obj.lit !== false;
    obj.lit = !currentlyLit;
    if (window.invalidateTileLightsCache) window.invalidateTileLightsCache();
    window.showMessage(obj.lit ? "You light the campfire." : "You douse the campfire.");
    window.drawMap();
    window.renderEntities();
}
window.toggleFireplace = toggleFireplace;

// A barrel of oil: harmless-looking terrain until fire touches it — see the
// firebolt-on-tileObject check in resolveSpell. Meant for defenders to place
// near a chokepoint an attacker will walk through, not for guards to stand
// next to (that just hands the player a free kill).
function explodeOilBarrel(q, r, caster) {
    const key = `${q},${r}`;
    if (!window.tileObjects[key] || window.tileObjects[key].type !== 'oil_barrel') return;
    delete window.tileObjects[key];
    const dmg = 25;
    window.showMessage("The oil barrel bursts into a fireball!");
    if (window.spawnFloatingText) window.spawnFloatingText({ q, r }, 'BOOM', '#ff8800');
    [{ q, r }, ...window.getNeighbors(q, r)].forEach(h => {
        const e = getEntityAtHex(h.q, h.r);
        if (!e || !e.alive) return;
        e.hp -= dmg; syncBackToPlayer(e); wakeUp(e);
        if (window.flashEntity) window.flashEntity(e, '#ff8800');
        if (window.spawnFloatingText) window.spawnFloatingText(e.hex, `-${dmg}`, '#ff4d4d');
        if (e.hp <= 0 && e.alive) handleLethalDamage(e, caster);
    });
    window.drawMap();
    window.renderEntities();
}
window.explodeOilBarrel = explodeOilBarrel;

// Northwatch's gate lever (campaign2World.js, near campaign2NorthwatchGateHex).
// First pull is just a warning — a guard stops you, no consequence. Second
// pull actually opens the gate (a real, one-time siege-pressure shove
// toward the attackers) AND is, on its own, one of the discrete
// "unforgivable acts" (see the plan) that turns the whole garrison
// hostile — no partial-suspicion state in between.
function pullNorthwatchGateLever() {
    if (!window._northwatchGateWarned) {
        window._northwatchGateWarned = true;
        window.showMessage(`A soldier grabs your arm: "Are you mad? You'll let them in!"`);
        return;
    }
    if (window.siegeState) {
        window.siegeState.gateHeld = false;
        if (window.applySiegePressure) window.applySiegePressure(20, "You wrench the lever — the gate swings open!");
    }
    if (window.setFactionHostileToPlayer) {
        window.setFactionHostileToPlayer('northwatch_human', "Soldiers turn their spears on you — you've opened the gate to the enemy!");
    }
}
window.pullNorthwatchGateLever = pullNorthwatchGateLever;

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
        const visionCap = (window.LIVE_VISION_RANGE || 25) + (entity.visionBonus || 0);
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

        // Prevent walking onto occupied hexes (collision) — enemies only; friendlies don't block
        const nextOccupant = window.getEntityAtHex(nextHex.q, nextHex.r);
        if (isRealMoveBlocker(entity, nextOccupant)) {
            entity.destination = null;
            entity.moveCooldown = 0;
            entity.moveTotalTime = 0;
            return false;
        }

        const terrain = window.getTerrainAt(nextHex.q, nextHex.r);
        let stepCost = 5 * window.getMoveCostMult(nextHex.q, nextHex.r, moveEntity);
        if (moveEntity.skills['fastMovement']) stepCost -= 1;
        // Never free or a net TP gain — see the matching clamp in
        // playerMoveProcess above.
        stepCost = Math.max(1, stepCost);

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

// A gate hex (Northwatch's, campaign2World.js) stays 'Climbable Wall'
// terrain permanently, open or closed, so wall-top continuity is never
// broken — ground-level passability comes from this door state instead of
// a terrain swap. Movement/climb code checks this wherever it would
// otherwise treat a climbRisk hex as requiring a climb.
function isOpenGateAt(q, r) {
    return window.tileObjects?.[`${q},${r}`]?.type === 'door_open';
}
window.isOpenGateAt = isOpenGateAt;

// COVER FIRE (bow_cover skill, skills.js): previously a purchasable skill
// with zero actual game effect (apply/prereq only — no mechanic anywhere
// in the engine). Declaring a hex marks it plus its 6 neighbors (7 hexes
// total) as a zone that costs the declared-hostile side extra TP to move
// through, until it expires. Deliberately a flat list rather than per-side
// bookkeeping elsewhere: nothing else needs to know about a zone except
// getMoveCostMult (below), which is the one place every movement TP cost
// in the game already funnels through.
window.coverFireZones = window.coverFireZones || [];
const COVER_FIRE_TP_COST = 5;
const COVER_FIRE_EXTRA_MOVE_TP = 4;
const COVER_FIRE_DURATION_SECONDS = 15; // approximates "until your next turn"

function deployCoverFire(caster, targetHex, opts = {}) {
    if (!caster || !targetHex) return false;
    const free = !!opts.free;
    if (!free) {
        if ((caster.timePoints || 0) < COVER_FIRE_TP_COST) return false;
        spendTP(caster, COVER_FIRE_TP_COST);
    }
    const hexes = new Set([`${targetHex.q},${targetHex.r}`]);
    window.getNeighbors(targetHex.q, targetHex.r).forEach(h => hexes.add(`${h.q},${h.r}`));
    const affectsSide = caster.combatDirective?.hostileTo || (caster.side === 'player' ? 'enemy' : 'player');
    window.coverFireZones.push({
        hexes, affectsSide,
        expiresAt: (window.worldSeconds || 0) + COVER_FIRE_DURATION_SECONDS,
        casterName: caster.name,
    });
    if (window.showMessage) {
        window.showMessage(`${caster.name} lays down covering fire!`);
    }
    return true;
}
window.deployCoverFire = deployCoverFire;

// Fired once, the instant Northwatch's wall garrison first falls back
// (aiProcess's contingency check, above): every inner-fort defender who
// holds cover_fire (the 6 hexagon-point archers + the commander, granted
// the skill at spawn in buildNorthwatchFort) gets one free (0 TP) covering
// shot centered on their own post, plus a commander announcement in the
// message log — the "orders covering fire" beat, readable without any new
// UI since showMessage already drives the existing log panel.
//
// At the same moment, every wall-ring defender who is actually retreating
// (mode === 'retreat') gets a free 10 TP — enough for a real head start on
// the run back to the keep, on top of whatever TP they already have —
// modeling the retreat order landing on everyone at once rather than each
// soldier only noticing on their own next turn.
function triggerNorthwatchCoveringFire() {
    const inner = (window.entities || []).filter(e =>
        e.alive && e.factionTag === 'northwatch_human' && e.skills?.bow_cover &&
        (e.isHexagonArcher || e.name === 'Commander Ysolde Hart'));
    const commander = inner.find(e => e.name === 'Commander Ysolde Hart') ||
        (window.entities || []).find(e => e.alive && e.name === 'Commander Ysolde Hart');
    if (commander && window.showMessage) {
        window.showMessage(`${commander.name} orders: "Covering fire!"`);
    }
    inner.forEach(e => deployCoverFire(e, e.homeHex || e.hex, { free: true }));

    (window.entities || []).filter(e =>
        e.alive && e.factionTag === 'northwatch_human' &&
        e.combatDirective?.contingencies?.some(c => c.id === 'retreat_if_walls_overrun')
    ).forEach(e => { e.timePoints = (e.timePoints || 0) + 10; });
}
window.triggerNorthwatchCoveringFire = triggerNorthwatchCoveringFire;

function activeCoverFirePenalty(q, r, entity) {
    if (!window.coverFireZones || window.coverFireZones.length === 0) return 0;
    const now = window.worldSeconds || 0;
    // Lazily drop expired zones instead of a separate sweep/interval — cheap
    // since this list is only ever a handful of entries long at once.
    window.coverFireZones = window.coverFireZones.filter(z => z.expiresAt > now);
    const key = `${q},${r}`;
    const entitySide = entity?.side || 'enemy';
    for (const zone of window.coverFireZones) {
        if (zone.hexes.has(key) && zone.affectsSide === entitySide) return COVER_FIRE_EXTRA_MOVE_TP;
    }
    return 0;
}

function getMoveCostMult(q, r, entity) {
    const terrain = window.getTerrainAt(q, r);
    let mult = terrain.moveCostMult || 1;
    // An open gate keeps its wall terrain permanently (isOpenGateAt) but
    // shouldn't charge the climb surcharge while open — that's the whole
    // point of it acting like a door for ground traffic.
    if (terrain.climbRisk && !isOpenGateAt(q, r)) {
        mult = 1 + (terrain.moveCostMult - 1) * getClimbCostMult(entity);
    }
    const obj = window.tileObjects && window.tileObjects[`${q},${r}`];
    if (obj && (obj.type === 'fence_h' || obj.type === 'fence_v')) {
        mult *= 1.6;
    }
    // Cover fire (above): a flat +4 TP surcharge folded into the multiplier
    // since every call site already does `baseCost(5) * mult` — +4/5 = 0.8
    // reproduces the flat surcharge for the standard 5-TP-per-hex step cost
    // this engine uses everywhere movement is charged.
    const coverPenalty = activeCoverFirePenalty(q, r, entity);
    if (coverPenalty > 0) mult += coverPenalty / 5;
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

// SHARED PERCEPTION: allies pool what they've spotted instead of each
// maintaining an isolated memory — a real war-band calls out "enemy
// sighted!" rather than only the one soldier who saw them acting on it.
// Keyed by entity.side (the same grouping isOpponent already uses to
// decide who's hostile to whom), so e.g. every 'enemy'-side attacker in a
// siege shares one memory of every defender any of them has seen, and
// defenders similarly share their own view of the attackers — the two
// sides, being different keys, never see each other's memory.
// Pruned on write (SHARED_SIGHTING_TTL) so a stray sighting from a
// long-past, unrelated fight (e.g. a wolf a goblin scout glimpsed an hour
// of playtime ago) doesn't linger forever in a map that's shared across
// every 'enemy'-side entity in the entire persistent world, not just the
// ones actually in this fight.
const SHARED_SIGHTING_TTL = 900; // worldSeconds
window.__sharedKnownOpponents = window.__sharedKnownOpponents || {};
function getSharedKnownOpponents(side) {
    if (!window.__sharedKnownOpponents[side]) window.__sharedKnownOpponents[side] = new Map();
    const map = window.__sharedKnownOpponents[side];
    const now = window.worldSeconds || 0;
    for (const [id, info] of map) {
        if (now - info.tick > SHARED_SIGHTING_TTL) map.delete(id);
    }
    return map;
}
window.getSharedKnownOpponents = getSharedKnownOpponents;

// Fires one catapult shot at a random fort wall hex, decrementing
// firesRemaining and breaking the catapult once it's spent — shared by both
// the turn-based isCatapult block in aiProcess (used whenever real combat
// is active nearby) and the real-time out-of-combat tick (runTickInternal's
// periodic-refresh block) that keeps the siege progressing even while the
// player stays passive and nothing ever flips window.isInCombat true.
// Returns false without doing anything if there's no crew to operate it.
// Are the defenders busy enough with the first wave for a ram/sapper to
// actually make progress unnoticed? Cheap and deliberately coarse: at least
// 25% of the living Northwatch garrison currently has a live remembered
// opponent (knownOpponents, gameEngine.js's shared-perception system) —
// reuses perception state that's already being maintained every turn rather
// than scanning distances/LOS fresh here. Originally 40%, lowered after
// simulation showed contact building up gradually as wave 1 closes the
// distance (real progress — closest attacker 9 hexes from the gate by tick
// 8000 in one run — just not fast enough to clear 40% within a reasonable
// tick budget against the fort's current ~2x-scaled size and turn-sharing
// across ~90 entities); 25% matches what a real siege force actually
// achieves once it's meaningfully engaged, not just first spotted.
function defendersDistracted() {
    const defenders = window.entities.filter(e => e.alive && e.factionTag === 'northwatch_human');
    if (defenders.length === 0) return false;
    const engaged = defenders.filter(d => d.knownOpponents && [...d.knownOpponents.values()].some(k => k.alive)).length;
    return engaged / defenders.length >= 0.25;
}
window.defendersDistracted = defendersDistracted;

function fireCatapultShot(entity) {
    const crewCount = window.entities.filter(e => e.alive && e.isCatapultCrew && window.distance(e.hex, entity.hex) <= 1).length;
    if (crewCount < 1) return false;
    const region = window.campaign2NorthwatchFortRegion;
    // CONCENTRATED FIRE: a crew re-picking a fresh random hex every single
    // shot (the old behavior) spreads 10 shots across dozens of wall hexes
    // with no memory between them — with wallHexes this large, the odds of
    // ever hitting the same hex twice are low, so nothing ever accumulates
    // enough damage to actually break (reported as "no rubble ever
    // appears"). A real siege crew keeps hammering the same spot until it
    // gives, then picks a new one — persist the target on the entity and
    // only re-roll once it's been reduced to Rubble (damageWall clears its
    // tileObjects entry on breaking, which is what we check for).
    if (entity.currentWallTarget) {
        if (window.getTerrainAt(entity.currentWallTarget.q, entity.currentWallTarget.r).name === 'Rubble') {
            entity.currentWallTarget = null; // already broken by something else
        }
    }
    if (!entity.currentWallTarget && region?.wallHexes?.length) {
        entity.currentWallTarget = region.wallHexes[Math.floor(window.pseudoRandom(entity.firesRemaining, window.worldSeconds || 0) * region.wallHexes.length)];
    }
    const targetWall = entity.currentWallTarget;
    if (targetWall && window.damageWall) window.damageWall(targetWall.q, targetWall.r, 10);
    entity.firesRemaining--;
    window.catapultHasFired = true;
    if (window.showMessage) window.showMessage(`The catapult fires! (${entity.firesRemaining} shot${entity.firesRemaining === 1 ? '' : 's'} left)`);
    if (entity.firesRemaining <= 0) {
        entity.hp = 0;
        entity.alive = false;
        if (window.showMessage) window.showMessage('The catapult breaks apart from the strain of its final shot!');
    }
    return true;
}
window.fireCatapultShot = fireCatapultShot;

function aiProcess(entity) {
    // If another entity's turn started while this AI was mid-chain (stale timeout), abort.
    if (window.currentTurnEntity && window.currentTurnEntity !== entity) return;

    if (window.isPausedForReaction) {
        setTimeout(() => aiProcess(entity), 20);
        return;
    }
    // GREENSKIN CATAPULT: fires at the fort's wall (indirect, long-range —
    // no LOS/range gate) as long as at least one crew member is standing
    // adjacent to it. Breaks permanently once it's fired 10 times, on top
    // of being a real attackable target (hp + baseReduction) the whole
    // time — either path sets alive=false, and every other piece of this
    // siege (crew flee, knights beeline it, greenskins hold/assault) reads
    // that same alive flag rather than caring which way it happened.
    if (entity.isCatapult) {
        entity.isNPC = false; // see the matching real-time-cadence clear above
        if (entity.alive && entity.firesRemaining > 0 && entity.timePoints >= 80) {
            if (fireCatapultShot(entity)) {
                spendTP(entity, 80);
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


    // BATTERING RAM / SIEGE SAPPER: march in like any other attacker
    // (falling through to the normal combatDirective/siegeObjective
    // movement below) until actually at their target, then take over with
    // the scripted battering behavior — which only makes real progress
    // while the garrison is distracted (defendersDistracted below); a ram
    // or a sneaking sapper in full view of a free defender just gets shot/
    // cut down instead (ordinary combat targeting already handles that,
    // since both are plain 'enemy'-side entities). Once the second of the
    // two to resolve — win or lose — the real second wave spawns.
    if (entity.isBatteringRam || entity.isSiegeSapper) {
        const targetHex = entity.isBatteringRam ? window.campaign2NorthwatchGateHex : entity.siegeTargetHex;
        const arrived = targetHex && window.distance(entity.hex, targetHex) <= 2;
        if (arrived) {
            if (entity.alive && entity.roundsRemaining > 0 && entity.timePoints >= 80) {
                if (defendersDistracted()) {
                    entity.roundsRemaining--;
                    if (entity.isBatteringRam) {
                        window.showMessage(`The battering ram slams into the gate! (${entity.roundsRemaining} more strikes needed)`);
                    } else {
                        window.showMessage(`The sapper creeps the fire charge closer to the rear wall. (${entity.roundsRemaining} rounds left)`);
                    }
                    if (entity.roundsRemaining <= 0) {
                        if (entity.isBatteringRam) {
                            const gate = window.campaign2NorthwatchGateHex;
                            if (gate) {
                                window.setTerrainAt(gate.q, gate.r, 'Rubble');
                                delete window.tileObjects[`${gate.q},${gate.r}`];
                            }
                            window.showMessage('The gate splinters and gives way!');
                        } else {
                            const t = entity.siegeTargetHex;
                            if (t) {
                                window.setTerrainAt(t.q, t.r, 'Rubble');
                                window.showMessage('The charge at the rear wall goes off — a breach opens!');
                            }
                        }
                        entity.hp = 0;
                        entity.alive = false;
                    }
                }
                spendTP(entity, 80);
            } else {
                entity.timePoints = 0;
            }
            const ram = window.campaign2NorthwatchRam;
            const sapper = window.campaign2NorthwatchSapper;
            if (ram && sapper && !ram.alive && !sapper.alive && !window.greenskinSecondWaveSpawned && window.spawnSecondGreenskinWave) {
                window.spawnSecondGreenskinWave();
            }
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            return;
        }
        // Not arrived yet — fall through to ordinary movement AI further
        // down, which already knows how to walk toward
        // combatDirective.siegeObjective, same as any other attacker.
    }

    // CATAPULT CREW: passive (handled by the passiveUnlessThreatened block
    // further down) as long as the catapult stands. The instant it's gone
    // — worn out or destroyed in combat, doesn't matter which — they flee,
    // overriding passivity by setting mode:'retreat' directly, which the
    // existing retreat-movement code (below) then drives exactly like any
    // other fallback: step away, fight back only if something's already
    // adjacent.
    if (entity.isCatapultCrew) {
        const catapult = window.campaign2NorthwatchCatapult;
        if (!catapult || !catapult.alive) {
            entity.combatDirective = entity.combatDirective || {};
            if (entity.combatDirective.mode !== 'retreat') {
                entity.combatDirective.mode = 'retreat';
                entity.combatDirective.retreatTo = entity._fleeHex || entity.hex;
            }
        }
    }

    // KNIGHTS: three phases, gated on the catapult's own state rather than
    // any timer. (A) Hidden and idle until the catapult's first shot —
    // "out of vision range" is handled purely by spawn placement, this
    // just keeps them inert regardless. (B) The instant it's fired once,
    // beeline the catapult and attack ONLY it — no target priority, no
    // constraint, nothing else considered, overriding the normal
    // target-selection entirely. (C) Once the catapult is down, decide
    // once (whichever direction currently has fewer enemies on the route
    // wins) and hand off to the ordinary combatDirective retreat mechanism
    // — same "step there, fight anything already adjacent" behavior the
    // wall garrison's own fallback already uses, just aimed at a different
    // destination (into the fort, or away from it).
    if (entity.isKnight) {
        const catapult = window.campaign2NorthwatchCatapult;
        if (!window.catapultHasFired) {
            entity.timePoints = 0;
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            return;
        }
        if (catapult && catapult.alive) {
            if (window.distance(entity.hex, catapult.hex) <= 1) {
                // Matches the established AI-attack idiom elsewhere in this
                // function (e.g. the normal melee branch below): tryAttack
                // can itself pause for a reaction (isPausedForReaction) that
                // only resolves on a later re-entry into aiProcess — nulling
                // currentTurnEntity immediately here, before that resolves,
                // left window.isPausedForReaction stuck true forever (it's
                // global, not per-entity), freezing every entity's turn in
                // the whole fight. setTimeout + no immediate null lets the
                // same resolution path everything else already relies on
                // actually complete.
                tryAttack(entity, catapult, false, false, 0, true);
                spendTP(entity, 10);
                setTimeout(() => aiProcess(entity), 20);
                return;
            }
            const next = stepToward(entity.hex, catapult.hex);
            if (next && isOpenHex(next)) {
                entity.hex = next;
                entity._lastMoveTick = window.worldSeconds || 0;
                if (entity.riding) entity.riding.hex = { ...next };
            }
            spendTP(entity, 10);
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            return;
        }
        if (!entity._knightDecided) {
            const fortEntry = window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter;
            const fleeHex = { q: (catapult ? catapult.hex.q : entity.hex.q) + 30, r: entity.hex.r };
            const enemiesNear = (hex) => window.entities.filter(e => e.alive && e.side === 'enemy' && window.distance(hex, e.hex) <= 15).length;
            const towardFort = fortEntry ? enemiesNear(fortEntry) : Infinity;
            const towardFlee = enemiesNear(fleeHex);
            entity.combatDirective = entity.combatDirective || {};
            entity.combatDirective.hostileTo = 'enemy';
            entity.combatDirective.mode = 'retreat';
            entity.combatDirective.retreatTo = (fortEntry && towardFort <= towardFlee) ? fortEntry : fleeHex;
            entity._knightDecided = true;
        }
        // Falls through into the normal combatDirective handling below,
        // which now sees mode:'retreat' and drives the chosen destination.
    }

    // GREENSKIN HOLD: the besieging force's default posture is passive —
    // hold position and wait for the catapult to soften the fort up —
    // until something worth reacting to is actually close. "Close" is
    // measured from the entity's own homeHex (its spawn point), not its
    // current position, specifically so a unit lured a few hexes away by
    // a feint can't be kited indefinitely: the instant the threat is no
    // longer near ITS post, it walks back and resumes holding rather than
    // continuing to chase. Ends permanently the moment the catapult is
    // gone (worn out or destroyed) — checked fresh every turn, not on a
    // one-time hook, so it's correct regardless of how the catapult died.
    if (entity.combatDirective?.holdPosition) {
        const catapult = window.campaign2NorthwatchCatapult;
        if (!catapult || !catapult.alive) window.greenskinAssaultTriggered = true;
        if (window.greenskinAssaultTriggered && !window.greenskinWaveSpawned && window.spawnGreenskinAssaultWave) {
            window.spawnGreenskinAssaultWave();
        }
        // Once the wait-for-the-catapult posture ends, give the entity a
        // one-time siege objective (the fort itself) so it has somewhere to
        // head once it falls through to normal targeting below and finds no
        // visible enemy — otherwise a besieger that's never actually seen a
        // defender yet (walls block LOS at range) has nothing to go on and
        // just idles in place. See resolveNoVisibleTargetAI.
        if (window.greenskinAssaultTriggered && entity.combatDirective && !entity.combatDirective.siegeObjective) {
            entity.combatDirective.siegeObjective = { hex: window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter };
        }
        if (!window.greenskinAssaultTriggered) {
            const homeHex = entity.combatDirective.homeHex || entity.hex;
            const holdRadius = entity.combatDirective.holdRadius || 18;
            const threatNearby = window.entities.some(e => e.alive && (e.isKnight || e.side === 'player') &&
                window.distance(homeHex, e.hex) <= holdRadius);
            if (!threatNearby) {
                const knightsAllDead = !window.entities.some(e => e.isKnight && e.alive);
                const crewCount = catapult ? window.entities.filter(e => e.alive && e.isCatapultCrew && window.distance(e.hex, catapult.hex) <= 1).length : 0;
                const needsCrew = !!catapult && catapult.alive && knightsAllDead && crewCount < 3;
                const nearCatapult = catapult && window.distance(entity.hex, catapult.hex) <= 40;
                if (needsCrew && nearCatapult) {
                    if (window.distance(entity.hex, catapult.hex) <= 1) {
                        entity.isCatapultCrew = true;
                        entity.timePoints = 0;
                    } else {
                        const next = stepToward(entity.hex, catapult.hex);
                        if (next && isOpenHex(next)) entity.hex = next;
                        spendTP(entity, 10);
                    }
                } else if (window.distance(entity.hex, homeHex) > 0) {
                    const next = stepToward(entity.hex, homeHex);
                    if (next && isOpenHex(next)) entity.hex = next;
                    spendTP(entity, 10);
                } else {
                    entity.timePoints = 0;
                }
                window.currentTurnEntity = null;
                window.gamePhase = 'WAITING';
                return;
            }
            // Threat is close to home — fall through to normal targeting/
            // attack logic below for this turn.
        }
    }

    // A neutral entity with a combatDirective (e.g. Northwatch's garrison —
    // 'neutral' toward the player, but ordered to fight the orc assault) is
    // NOT a no-op — it falls through to the full combat logic below instead
    // of returning here, using directive.hostileTo to decide who its actual
    // opponents are (see the opponentSide resolution further down) rather
    // than the player/enemy inference that only makes sense for the other
    // two sides. Plain neutrals (shopkeepers, quest-givers, camp guards)
    // keep the exact original behavior.
    if (entity.side === 'neutral' && !entity.combatDirective) {
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

    // COMBAT DIRECTIVE: opt-in layered orders (constraints/priorities/
    // contingencies — see the plan's "Layered combat AI" section). Entirely
    // additive: an entity with no combatDirective takes the exact same path
    // as before this existed. Contingencies are checked first, every turn —
    // if one matches it can flip `mode` to 'retreat', which short-circuits
    // straight to "move toward the fallback point" and skips normal target
    // selection for this turn entirely.
    if (entity.combatDirective) {
        const directive = entity.combatDirective;
        (directive.contingencies || []).forEach(c => {
            if (c.when(entity)) {
                directive.mode = 'retreat';
                // First time ANY wall defender's walls-overrun contingency
                // trips, the inner-fort garrison (hexagon archers + the
                // commander, who all hold cover_fire) get one free covering
                // shot each — see triggerNorthwatchCoveringFire below.
                if (c.id === 'retreat_if_walls_overrun' && !window.northwatchRetreatCalled) {
                    window.northwatchRetreatCalled = true;
                    if (window.triggerNorthwatchCoveringFire) window.triggerNorthwatchCoveringFire();
                }
            }
        });
        // Sticky by design: once the walls are overrun, the whole garrison
        // permanently falls back to make its stand at the chokepoint
        // (retreatTo) instead of toggling back to holding the walls the
        // moment the hostile count dips — that's what turns "the compound"
        // into a real fallback position instead of just another line that
        // gets contested back and forth.
        //
        // But sticky mode must not mean "never fights again": only step
        // toward retreatTo (skipping attack logic entirely) while actually
        // still traveling there. Once arrived, fall through to the normal
        // targeting/attack logic below — the whole point of falling back to
        // a chokepoint is to make a stand there, not to stand down. Without
        // this check, a defender who reached the keep would just idle at
        // the door forever, immortalized as a target dummy in every sim run.
        const atRetreatPoint = directive.mode === 'retreat' && directive.retreatTo &&
            window.distance(entity.hex, directive.retreatTo) === 0;
        // A fighting withdrawal, not a blind sprint: something already
        // adjacent gets a free attack every single turn if retreat always
        // just moves — a defender who tripped the contingency mid-melee
        // would take a hit on the way out with literally no chance to
        // fight back, over and over, until it's cut down before ever
        // reaching the chokepoint. Only auto-step toward retreatTo when
        // nothing is breathing down its neck right now; an adjacent
        // opponent means falling through to the normal attack logic below
        // instead (fight this one hex, then keep falling back next turn).
        const opponentSideForRetreat = directive.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
        const opponentAdjacent = window.entities.some(e => e.alive && e.side === opponentSideForRetreat &&
            window.distance(entity.hex, e.hex) <= 1);
        if (directive.mode === 'retreat' && directive.retreatTo && !atRetreatPoint && !opponentAdjacent) {
            // CLIMBING DOWN: a wall defender's retreat step off Climbable
            // Wall terrain costs real extra TP, same friction climbing UP
            // already has — unless a ladder (campaign2World.js's notch
            // placements) is right where they're standing, in which case
            // it's a normal step. Checked against the CURRENT hex (the one
            // being left), not the destination — this models "getting down
            // off the wall," not "walking near one."
            const leavingTerrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
            const hasLadderHere = leavingTerrain.climbRisk &&
                window.tileObjects?.[`${entity.hex.q},${entity.hex.r}`]?.type === 'ladder';
            const climbDownCost = leavingTerrain.climbRisk && !hasLadderHere ? 25 : 10;
            const next = window.stepToward(entity.hex, directive.retreatTo);
            if (next && isOpenHex(next)) { entity.hex = next; entity._lastMoveTick = window.worldSeconds || 0; }
            spendTP(entity, climbDownCost);
            window.currentTurnEntity = null;
            window.gamePhase = 'WAITING';
            return;
        }

        // PASSIVE UNLESS THREATENED: a commander/officer joins the fight in
        // spirit but hangs back rather than wading in — until someone's
        // actually come after them. Two triggers pull them in: taking a hit
        // directly (wasDirectlyAttacked, set by resolveAttack regardless of
        // hit/miss) or an opponent closing to within threatRadius. Neither
        // has fired yet, so hold position — a no-op turn, same shape as the
        // plain-neutral no-op above, not the normal chase/attack logic below.
        if (directive.passiveUnlessThreatened && !entity.wasDirectlyAttacked) {
            const opponentSideForThreat = directive.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
            const threatRadius = directive.threatRadius || 3;
            // meleeTriggerHexes (Northwatch's commander): "threatened" also
            // covers an opponent closing on the hexagon/archer posts, not
            // just her own personal radius — otherwise she'd stay passive
            // (never even reach the WEAPON SWITCHING check below) while an
            // archer post several hexes from her own position is overrun.
            const threatenedNearTriggerHexes = directive.meleeTriggerHexes && window.entities.some(e => {
                if (!e.alive || e.side !== opponentSideForThreat) return false;
                for (const key of directive.meleeTriggerHexes) {
                    const [q, r] = key.split(',').map(Number);
                    if (window.distance(e.hex, { q, r }) <= 1) return true;
                }
                return false;
            });
            const threatened = threatenedNearTriggerHexes || window.entities.some(e => e.alive && e.side === opponentSideForThreat &&
                window.distance(entity.hex, e.hex) <= threatRadius);
            if (!threatened) {
                // `threshold` (with the quickRecovery adjustment) isn't
                // computed until later in this function — this check runs
                // ahead of that, so it applies the same reduction inline
                // rather than referencing a not-yet-declared variable.
                entity.timePoints = 80 - (entity.skills?.quickRecovery || 0);
                window.currentTurnEntity = null;
                window.gamePhase = 'WAITING';
                return;
            }
        }

        // SURGE REINFORCEMENT: a defender with nothing threatening its own
        // post diverts toward whichever faction-mate is most heavily
        // outnumbered locally, instead of holding a quiet stretch of wall
        // while another point gets overrun — the thing a rigid per-point
        // patrol assignment can't do on its own. Opt-in via
        // combatDirective.canReinforce; only kicks in once the entity has
        // genuinely nothing nearby to fight (an outnumbered defender still
        // fights where it stands, it doesn't abandon its post mid-fight).
        if (directive.canReinforce && entity.factionTag) {
            const opponentSideForReinforce = directive.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
            const scanRadius = 4;
            const localOpponents = window.entities.filter(e => e.alive && e.side === opponentSideForReinforce &&
                window.distance(entity.hex, e.hex) <= scanRadius).length;
            if (localOpponents === 0) {
                let worstAlly = null, worstScore = 0;
                window.entities.forEach(ally => {
                    if (!ally.alive || ally === entity || ally.factionTag !== entity.factionTag) return;
                    const nearOpponents = window.entities.filter(e => e.alive && e.side === opponentSideForReinforce &&
                        window.distance(ally.hex, e.hex) <= scanRadius).length;
                    if (nearOpponents === 0) return;
                    const nearAllies = window.entities.filter(e => e.alive && e.factionTag === entity.factionTag &&
                        window.distance(ally.hex, e.hex) <= scanRadius).length;
                    const score = nearOpponents - nearAllies;
                    if (score > worstScore) { worstScore = score; worstAlly = ally; }
                });
                if (worstAlly) {
                    const stayWithin = directive.constraints?.stayWithinHexes;
                    const holdGround = directive.mode !== 'retreat' ? directive.holdGround : null;
                    const next = window.stepToward(entity.hex, worstAlly.hex);
                    const allowed = (!stayWithin || stayWithin.has(`${next?.q},${next?.r}`)) &&
                        (!holdGround || holdGround.has(`${next?.q},${next?.r}`));
                    if (next && isOpenHex(next) && allowed) entity.hex = next;
                    spendTP(entity, 10);
                    window.currentTurnEntity = null;
                    window.gamePhase = 'WAITING';
                    return;
                }
            }
        }
    }

    // CALMED (Calm Animal, spells.js): pacified — doesn't fight at all,
    // just repositions per whichever mode the caster chose when they cast
    // it (stay/come/chase). Breaks the instant it's actually attacked (see
    // resolveAttack) rather than expiring on a timer.
    const calmEffect = (window.activeSpells || []).find(s => s.debuffType === 'calmed' && s.targetEntityId === entity.id);
    if (calmEffect) {
        if (entity.timePoints < 10) {
            entity.timePoints = 0;
        } else {
            const calmCaster = window.entities.find(e => e.alive && e.name === calmEffect.casterName);
            if (calmCaster) {
                if (calmEffect.calmMode === 'come') {
                    const next = stepToward(entity.hex, calmCaster.hex);
                    if (next && isOpenHex(next)) { entity.hex = next; if (entity.rider) entity.rider.hex = { ...next }; }
                } else if (calmEffect.calmMode === 'chase') {
                    const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r).filter(isOpenHex);
                    if (neighbors.length > 0) {
                        const best = neighbors.sort((a, b) => window.distance(b, calmCaster.hex) - window.distance(a, calmCaster.hex))[0];
                        entity.hex = best; if (entity.rider) entity.rider.hex = { ...best };
                    }
                }
                // 'stay' (default): holds position, no movement at all.
            }
            spendTP(entity, 10);
        }
        window.currentTurnEntity = null;
        window.gamePhase = 'WAITING';
        return;
    }

    // HEALTH POTION: an AI-controlled entity carrying one drinks it either
    // whenever it wouldn't waste any of the heal to overhealing, or
    // unconditionally once badly hurt (<=30% HP) even if some would be
    // wasted — same item/amount/TP-cost the player's own potion_health use
    // does (ui.js), just decided automatically instead of by hand.
    if (entity.alive && entity.inventory?.includes('potion_health') && entity.timePoints >= 1) {
        const healAmt = 5;
        const missingHp = entity.maxHp - entity.hp;
        const lowHp = entity.hp <= entity.maxHp * 0.3;
        if (missingHp > 0 && (missingHp >= healAmt || lowHp)) {
            entity.hp = Math.min(entity.maxHp, entity.hp + healAmt);
            const potionIdx = entity.inventory.indexOf('potion_health');
            if (potionIdx > -1) entity.inventory.splice(potionIdx, 1);
            spendTP(entity, 1);
            sharedMessage(`${entity.name} drinks a Potion of Health.`);
            setTimeout(() => aiProcess(entity), 20);
            return;
        }
    }

    // WEAPON SWITCHING: an entity carrying both a ranged option and a melee
    // backup (bow soldiers with a sword/dagger in reserve, an archer
    // commander who also owns a sword+shield) switches to whichever fits
    // the moment — melee once an opponent is adjacent, back to ranged once
    // nothing is. Free (no TP cost), same convention as picking a target —
    // a no-op for anyone with only one weapon, nothing to switch to.
    if (entity.alive && entity.inventory && entity.inventory.length > 1) {
        const opponentSideForWeapon = entity.combatDirective?.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
        let nearestOpponentDist = Infinity;
        window.entities.forEach(e => {
            if (!e.alive || e.side !== opponentSideForWeapon) return;
            const d = window.distance(entity.hex, e.hex);
            if (d < nearestOpponentDist) nearestOpponentDist = d;
        });
        // meleeTriggerHexes (Northwatch's commander, campaign2World.js): an
        // extra melee-range check against a whole hex set — "someone's in
        // reach of the hexagon interior or an archer post" — on top of the
        // usual "someone's adjacent to me personally" one just above.
        const meleeTriggerHexes = entity.combatDirective?.meleeTriggerHexes;
        const opponentInTriggerHexes = meleeTriggerHexes && window.entities.some(e => {
            if (!e.alive || e.side !== opponentSideForWeapon) return false;
            for (const key of meleeTriggerHexes) {
                const [q, r] = key.split(',').map(Number);
                if (window.distance(e.hex, { q, r }) <= 1) return true;
            }
            return false;
        });
        if (nearestOpponentDist <= 40 || opponentInTriggerHexes) {
            const currentWeapon = entity.equipped?.weapon ? window.items[entity.equipped.weapon] : null;
            const isCurrentRanged = currentWeapon?.subType === 'ranged';
            if ((nearestOpponentDist <= 1 || opponentInTriggerHexes) && (isCurrentRanged || !currentWeapon)) {
                const meleeId = entity.inventory.find(id => { const it = window.items[id]; return it?.type === 'weapon' && it.subType !== 'ranged'; });
                if (meleeId) {
                    const meleeItem = window.items[meleeId];
                    entity.equipped.weapon = meleeId;
                    if (meleeItem.hands === 2) entity.equipped.offhand = null;
                    else {
                        const shieldId = entity.inventory.find(id => window.items[id]?.type === 'shield');
                        if (shieldId) entity.equipped.offhand = shieldId;
                    }
                }
            // meleeTriggerHexes guards this branch too now — otherwise an
            // entity that just drew melee because an opponent reached a
            // trigger hex (e.g. the commander, an archer post) would flip
            // straight back to ranged the very next aiProcess pass, since
            // nearestOpponentDist alone doesn't know she's still needed in
            // melee at a hex that isn't her own. Found via a real test
            // failure, not assumed: two logged aiProcess passes for the
            // same turn, first correctly drew the sword, second immediately
            // undid it with no re-check of opponentInTriggerHexes at all.
            } else if (nearestOpponentDist > 1 && !opponentInTriggerHexes && currentWeapon && currentWeapon.subType !== 'ranged') {
                const rangedId = entity.inventory.find(id => window.items[id]?.subType === 'ranged');
                if (rangedId) {
                    entity.equipped.weapon = rangedId;
                    if (window.items[rangedId].hands === 2) entity.equipped.offhand = null;
                }
            }
        }
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
    // directive.hostileTo lets a directed 'neutral' entity (e.g. Northwatch's
    // garrison — neutral toward the player, but ordered to fight the orc
    // assault) declare its actual opponents explicitly, instead of the
    // binary player/enemy inference that only makes sense for those two
    // sides. directive.hostileToPlayer is a separate, independently
    // mutable flag — a faction can be simultaneously "not fighting the
    // player" (both humans and goblins can think they're allied with the
    // player at once, attacking only each other) and later flip to also
    // treating the player as an opponent once something reveals otherwise
    // (see the suspicion/cover mechanic), without touching hostileTo at all.
    const opponentSide = entity.combatDirective?.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
    // THREE-WAY HOSTILE ARENA (scoped special case, not a general faction
    // rewrite): a rivalGroup-tagged enemy band also fights plain 'enemy'
    // entities and vice versa, on top of everyone still fighting the
    // player as normal. Local to this one arena scenario type so it can't
    // change targeting anywhere else in the game.
    const isThreeWayArena = window.arenaScenario?.type === 'three_way';
    const isOpponent = (e) => e.side === opponentSide || (entity.combatDirective?.hostileToPlayer && e.side === 'player') ||
        (isThreeWayArena && entity.side === 'enemy' && e.side === 'enemy' && !!e.rivalGroup !== !!entity.rivalGroup);
    // LICH: Command the Dead - undead never treat a commandsUndead player-side
    // entity as an opponent (recognizes a kindred will instead of fighting it).
    const opponents = window.entities.filter(e => e.alive && isOpponent(e) &&
        !(entity.tags?.includes('undead') && e.commandsUndead));
    const visibleOpponents = opponents.filter(t => canSee(entity, t));

    // PERCEPTION MEMORY: remember every hostile actually seen this turn —
    // hex + "confirmed alive" — independent of whichever single target ends
    // up picked below. A target breaking line of sight or slipping into
    // stealth just stops refreshing its entry (it ages in place); it never
    // gets deleted, so "ducked around a corner" isn't "forgot they exist."
    // Deliberately NOT populated for entities that never actually spot a
    // hostile — an entity with an empty/absent map falls through to the old
    // idle behavior further down, so this can't change anything for fights
    // that never reach it.
    if (visibleOpponents.length > 0) {
        entity.knownOpponents = getSharedKnownOpponents(entity.side);
        visibleOpponents.forEach(o => {
            entity.knownOpponents.set(o.id, { hex: { q: o.hex.q, r: o.hex.r }, tick: window.worldSeconds || 0, alive: true });
        });
        entity.disengaged = false; // a previously-disengaged entity that's back in someone's sight is back in the fight
    }

    // HEARING: a moving opponent can be noticed without line of sight —
    // closer and louder the nearer they are, stamped via _lastMoveTick
    // (set wherever AI movement actually executes, above). This only ever
    // feeds knownOpponents (perception memory for search/flee decisions),
    // never attackableOpponents — hearing footsteps through a wall tells you
    // roughly where someone is, not a clean shot at them.
    const HEARING_RADIUS = 4;
    opponents.forEach(o => {
        if (visibleOpponents.includes(o)) return;
        if (!o._lastMoveTick || (window.worldSeconds || 0) - o._lastMoveTick > 2) return;
        const d = window.distance(entity.hex, o.hex);
        if (d > HEARING_RADIUS) return;
        const hearChance = Math.max(10, 80 - d * 18);
        if (Math.random() * 100 < hearChance) {
            entity.knownOpponents = getSharedKnownOpponents(entity.side);
            entity.knownOpponents.set(o.id, { hex: { q: o.hex.q, r: o.hex.r }, tick: window.worldSeconds || 0, alive: true });
        }
    });

    // CHASE TIMEOUT: answers a real edge case — a hunter that keeps LOS on
    // a fleeing target moving at the exact same speed never actually closes
    // the distance, so the pure "flee until 10x threatRadius away" rule
    // (resolveNoVisibleTargetAI) never fires either, since it only ever
    // runs once nobody's visible. Track how many consecutive turns this
    // entity has gone without actually being adjacent-and-in-LOS to a live
    // opponent (i.e. "still just searching/being chased, not fighting").
    // Severely outnumbered resolves fast, via markFled (a real escape,
    // grants XP/siege credit like any other flee). But an evenly-matched
    // stalemate — neither side finding the other, force balance roughly
    // even — was still able to freeze forever under the old outnumbered-
    // only rule, since it never qualifies as "severely outnumbered." That
    // gets a longer, no-credit timeout instead: both sides just give up
    // the search, since nobody actually won anything.
    {
        const { mine, theirs } = computeForceBalance(entity);
        const fleeThreshold = (entity.combatDirective?.outnumberWeight || 1) > 1 ? 4 : 2.5;
        const severelyOutnumbered = theirs >= mine * fleeThreshold;
        // Line-of-sight matters here, not just raw hex distance — an
        // opponent one hex away on the far side of a wall is "adjacent" by
        // distance alone but can never actually be fought, which otherwise
        // perpetually resets this counter for an entity boxed in near a
        // wall/corner and prevents the chase timeout from ever firing.
        const adjacent = opponents.some(o => window.distance(entity.hex, o.hex) <= 1 && canSee(entity, o));
        if (!adjacent && theirs > 0) {
            entity._chaseStuckTurns = (entity._chaseStuckTurns || 0) + 1;
            // 200 here previously meant 200 of THIS entity's own turns — for
            // an isolated straggler that only gets a turn once every several
            // hundred ticks (normal TP regen), that's tens of thousands of
            // ticks before it ever fires, well past any real fight's tick
            // budget. These smaller counts resolve a genuine deadlock in a
            // few thousand ticks instead, without meaningfully affecting a
            // fight that's still actively being fought (adjacent resets the
            // counter every turn). Confirmed via direct diagnostic (not
            // committed) that a slow-cadence entity — e.g. a
            // passiveUnlessThreatened commander, who spends most idle turns
            // parked at reduced TP by design — can still only rack up ~20
            // of its own turns across an entire 18000-tick fight, so even
            // the "evenly matched" 60 was too high to reliably resolve
            // before a fight's tick budget runs out. 30 keeps the same
            // "give the search room to actually work" intent (still well
            // above the 15-turn point where the anchor starts widening)
            // while resolving in a more realistic window.
            // ARENA SCALE: same lever as resolveNoVisibleTargetAI's arena
            // shrink below — this timeout must stay above wherever the
            // search anchor starts widening (15 siege / 8 arena) so a
            // fight isn't declared a stalemate before the search even had
            // a chance to adapt.
            const timeoutTurns = window.isInArena ? (severelyOutnumbered ? 10 : 14) : (severelyOutnumbered ? 20 : 30);
            if (entity._chaseStuckTurns >= timeoutTurns) {
                if (severelyOutnumbered) markFled(entity);
                else { entity.disengaged = true; if (entity.combatDirective) entity.combatDirective.mode = null; }
                entity._chaseStuckTurns = 0;
                window.currentTurnEntity = null;
                window.gamePhase = 'WAITING';
                return;
            }
        } else {
            entity._chaseStuckTurns = 0;
        }
    }

    // Filter attackable targets based on flying
    const weaponSlot = 'weapon';
    const weapon = entity.equipped?.[weaponSlot] ? window.items[entity.equipped[weaponSlot]] : null;
    const isRanged = weapon?.subType === 'ranged';
    // A flying creature with no ranged weapon that relies on a spell for
    // reach (e.g. a dragon's breath) normally can't melee a ground target at
    // all under the flying/ground mismatch rule below — which used to mean
    // that once it ran out of mana for that spell, it would kite forever,
    // permanently out of reach, rather than ever landing to fight (see the
    // "no target because of flying" retreat branch further down, which this
    // directly starves of a target). Once it can no longer afford its only
    // ranged option, ground it for melee instead of leaving it stuck evading.
    // A caster may have built several variants of the same attack spell
    // (autoBuildSpellsForEntity in spellPlanner.js gives every AI caster a
    // base/cheapest/priciest/random spread, up to maxSpellSlots — at most
    // 14). Rather than always grabbing the single strongest affordable
    // variant — which can burn most of this turn's TP budget on one cast
    // and strand the rest, when two cheaper casts would have landed more
    // total damage — this runs a small unbounded-knapsack search over
    // every variant currently affordable (by mana), maximizing total
    // magnitude within the TP actually available this turn (timePoints
    // down to the `threshold` stop-point). With ≤14 items and a budget of
    // a few dozen TP at most, this is cheap to recompute every call — and
    // it IS recomputed fresh each time (via the setTimeout(...,20) chain
    // after every cast), so "planning multiple spells per turn" falls out
    // naturally: cast the DP's top pick now, mana/TP drop, re-plan, repeat.
    const attackSpellVariants = (entity.createdSpells || [])
        .filter(s => s.baseId === 'firebolt' || s.baseId === 'dragon_breath');
    const spellTpBudget = Math.max(0, Math.floor(entity.timePoints) - threshold);
    const affordableAttackVariants = attackSpellVariants.filter(s =>
        entity.currentMana >= s.manaCost && s.tpCost <= spellTpBudget);
    // For an area (aoe_damage) variant, "value" isn't its raw magnitude —
    // it's magnitude times how many opponents can actually be caught in one
    // burst right now, so the DP planner correctly rates a burst spell far
    // higher when opponents are clustered than when they're spread out (and
    // no higher than a single-target cast when only one target is in
    // range). bestAoeCastHex (below) does the same "best cluster center"
    // search the actual cast then reuses to aim.
    const aoeClusterCountCache = new Map();
    const aoeClusterCount = (range, radius) => {
        if (!radius) return 1;
        const key = `${range}|${radius}`;
        if (aoeClusterCountCache.has(key)) return aoeClusterCountCache.get(key);
        const best = bestAoeCastHex(entity, visibleOpponents, range, radius);
        const count = best ? best.count : 1;
        aoeClusterCountCache.set(key, count);
        return count;
    };
    let attackSpell = null;
    if (affordableAttackVariants.length > 0) {
        const dpValue = new Array(spellTpBudget + 1).fill(0);
        const dpChoice = new Array(spellTpBudget + 1).fill(-1);
        for (let w = 1; w <= spellTpBudget; w++) {
            for (let i = 0; i < affordableAttackVariants.length; i++) {
                const cost = Math.ceil(affordableAttackVariants[i].tpCost);
                if (cost <= w) {
                    const variant = affordableAttackVariants[i];
                    const effectiveMagnitude = variant.magnitude * aoeClusterCount(variant.range, variant.radius || 0);
                    const val = dpValue[w - cost] + effectiveMagnitude;
                    if (val > dpValue[w]) { dpValue[w] = val; dpChoice[w] = i; }
                }
            }
        }
        if (dpChoice[spellTpBudget] >= 0) attackSpell = affordableAttackVariants[dpChoice[spellTpBudget]];
    }
    // Fall back to a (possibly currently-unaffordable) known variant just so
    // reliesOnSpellForRange/grounding below still recognizes "this entity is
    // fundamentally a spell-reliant flyer" even mid-turn when nothing fits
    // the remaining budget.
    if (!attackSpell) attackSpell = attackSpellVariants[0] || null;
    const reliesOnSpellForRange = !!attackSpell && !isRanged;
    const canAffordAttackSpell = !!attackSpell && affordableAttackVariants.includes(attackSpell);
    const attackableOpponents = visibleOpponents.filter(o => {
        const bothFlying = entity.isFlying && o.isFlying;
        const eitherFlying = entity.isFlying || o.isFlying;
        if (eitherFlying && !bothFlying && reliesOnSpellForRange && !canAffordAttackSpell) return true;
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
    // Considers every friendly target in range (allies, not just itself)
    // and scores them so it puts real weight behind healing whoever needs
    // it most, rather than only ever topping itself off. A target scores
    // higher the lower its current HP%, the fuller the caster's own mana
    // (a healer flush with mana should lean into using it), and the less
    // of the heal would be wasted as overheal; healing itself gets a small
    // — not dominant — edge over an equally-needy ally so ties don't
    // become a coinflip, but a genuinely worse-off ally still wins.
    if (entity.skills?.learn_heal && entity.timePoints >= 10) {
        const healSpell = entity.createdSpells?.find(s => s.baseId === 'heal');
        if (healSpell && entity.currentMana >= healSpell.manaCost && entity.timePoints >= healSpell.tpCost) {
            const manaPct = entity.maxMana > 0 ? entity.currentMana / entity.maxMana : 0;
            const candidates = window.entities.filter(t => t.alive && t.side === entity.side &&
                t.hp < t.maxHp && window.distance(entity.hex, t.hex) <= healSpell.range &&
                (t === entity || canSee(entity, t)));
            if (candidates.length > 0) {
                const scored = candidates.map(t => {
                    const hpPct = t.maxHp > 0 ? t.hp / t.maxHp : 1;
                    const overheal = Math.max(0, (t.hp + healSpell.magnitude) - t.maxHp);
                    const overhealFraction = healSpell.magnitude > 0 ? overheal / healSpell.magnitude : 0;
                    let score = (1 - hpPct) * 2 + manaPct * 1 - overhealFraction * 1.5;
                    if (t === entity) score += 0.15; // slight, not major, self-preference
                    return { t, score };
                });
                scored.sort((a, b) => b.score - a.score);
                const best = scored[0];
                // A floor so a healer at low mana / everyone near-full HP
                // doesn't burn its turn topping off a one-point scratch.
                if (best.score > 0.5) {
                    // BURST HEAL: if 2+ wounded allies are clustered and this
                    // healer also has an aoe_heal build of the same spell
                    // (skills.js's <school>_burst), mending several people
                    // at once beats topping off just the neediest one.
                    const burstHeal = entity.createdSpells?.find(s => s.baseId === healSpell.baseId && s.type === 'aoe_heal' &&
                        entity.currentMana >= s.manaCost && entity.timePoints >= s.tpCost);
                    const woundedAllies = candidates.filter(t => t.hp < t.maxHp);
                    const cluster = burstHeal ? bestAoeCastHex(entity, woundedAllies, burstHeal.range, burstHeal.radius || 0) : null;
                    if (burstHeal && cluster && cluster.count >= 2) {
                        window.showMessage(`${entity.name} channels a burst of healing!`);
                        tryCastSpell(entity, burstHeal, null, cluster.hex);
                        spendTP(entity, burstHeal.tpCost);
                        setTimeout(() => aiProcess(entity), 20);
                        return;
                    }
                    window.showMessage(best.t === entity ? `${entity.name} prays for healing!` : `${entity.name} channels healing toward ${best.t.name}!`);
                    tryCastSpell(entity, healSpell, best.t, best.t.hex);
                    spendTP(entity, healSpell.tpCost);
                    setTimeout(() => aiProcess(entity), 20);
                    return;
                }
            }
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
    // Gate lowered to 5 (Quickened's discounted TP cost, the cheapest any
    // cast can be) rather than a flat 10 — canAffordAttackSpell below
    // checks the actually-selected variant's real tpCost precisely; this
    // is just a cheap pre-filter so a caster with 6-9 TP left doesn't skip
    // considering a Quickened cast it can actually afford.
    if (entity.createdSpells && entity.createdSpells.length > 0 && entity.timePoints >= 5) {
        // ... (existing spell logic) ...
        // attackSpell/canAffordAttackSpell computed above, alongside the
        // attackableOpponents filter that grounds this entity for melee
        // once it can't afford the cast.
        if (attackSpell && canAffordAttackSpell) {
            const cluster = bestAoeCastHex(entity, visibleOpponents, attackSpell.range, attackSpell.radius || 0);
            if (cluster) {
                const inRange = getEntityAtHex(cluster.hex.q, cluster.hex.r) ||
                    visibleOpponents.find(o => window.distance(entity.hex, o.hex) <= attackSpell.range);
                tryCastSpell(entity, attackSpell, inRange, cluster.hex);
                spendTP(entity, attackSpell.tpCost);
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
        if (canAffordAttackSpell) {
            // This entity itself still has a usable ranged spell (e.g. a
            // dragon with breath mana left) — it has no melee target only
            // because everyone's out of *cast* range, so it should close
            // the distance to get within spell range, not retreat. Retreating
            // here (the branch below) was written for a ground unit that
            // truly can't reach a flyer at all; applying the same "back
            // away" logic to the flyer's own turn made it kite forever
            // instead of ever closing to spell range.
            huntTargetHex = nearestFlyer.hex;
        } else {
            // Move away from flyer
            const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
            huntTargetHex = neighbors.sort((a, b) => window.distance(b, nearestFlyer.hex) - window.distance(a, nearestFlyer.hex))[0];
        }
    }

    if (huntTargetHex && !target && entity.hex.q === huntTargetHex.q && entity.hex.r === huntTargetHex.r) {
        entity.lastSeenTargetHex = null;
        huntTargetHex = null;
    }

    // FLAG DEFENSE (player holds): with no opponent in sight, an attacker
    // advances on the flag itself rather than idling — the objective is
    // reaching the flag hex, not necessarily finding the player first.
    if (!huntTargetHex && entity.side === 'enemy' && window.arenaScenario?.type === 'flag_defend' && window.arenaScenario.flagHex) {
        huntTargetHex = window.arenaScenario.flagHex;
    }

    if (!huntTargetHex) {
        // HUNTER/PREY: no target currently visible, but this entity may
        // still remember hostiles it's seen before (knownOpponents) — flee,
        // group up, or search toward their last-known position instead of
        // idling forever. Returns null (falls through to the old idle
        // behavior below) for anything that's never actually engaged.
        huntTargetHex = resolveNoVisibleTargetAI(entity, opponentSide);
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
    let rangeWeapon = null;
    if (entity.equipped?.weapon) {
        rangeWeapon = window.items[entity.equipped.weapon];
        let rb = (rangeWeapon?.range || 0);
        if (rangeWeapon?.id === 'bow' && entity.skills?.elf_bow_range) rb += (entity.skills.elf_bow_range * 4);
        attackRange += rb;
    }
    // HIGH GROUND RANGE: firing down from a wall/rampart reaches further;
    // firing up at one from the ground falls short sooner — pushes ranged
    // attackers to actually climb rather than plink from a safe distance,
    // and rewards defenders who stay up on the wall.
    if (rangeWeapon?.subType === 'ranged') {
        if (window.getTerrainAt(entity.hex.q, entity.hex.r).elevated) attackRange += 2;
        else if (target && window.getTerrainAt(target.hex.q, target.hex.r).elevated) attackRange = Math.max(1, attackRange - 2);
    }
    const dist = getMinDistance(entity, target || { getAllHexes: () => [huntTargetHex], hex: huntTargetHex });

    let hasLOE = target ? entity.getAllHexes().some(h => window.hasLineOfEffect(h, target.hex)) : false;

    // Skirmish AI (horse archers, etc.): a bow's range comfortably covers
    // dist===1 too, so without this override a skirmisher adjacent to its
    // target would just take the ordinary "in range, attack" branch below
    // like any other archer. Forcing it into the movement branch instead is
    // what makes it back off rather than trade blows at melee range — but
    // only while actually adjacent, so it can't chain-kite indefinitely.
    const isSkirmishRetreat = entity.isSkirmisher && target && dist <= 1 && attackRange > 1;

    // BLOB PENALTY: a ranged attacker with an ally standing in its firing
    // line can't loose a shot from here — falls through to the movement
    // branch below and tries to find its own lane instead, same as being
    // out of range. Melee (dist<=1, no intervening hex) is never affected.
    const blockedByAlly = target && rangeWeapon?.subType === 'ranged' && dist > 1 && window.isShotBlockedByAlly(entity, target);

    // ELEVATION MELEE IMMUNITY (AI side, mirrors tryAttack's own check): a
    // ground attacker standing next to a wall defender is technically
    // dist<=attackRange, but a real melee swing across that height
    // difference is illegal (tryAttack would just no-op it). Without this
    // check the AI kept "attacking" every turn from the base of the wall
    // instead of ever climbing up to actually reach the defender — treat
    // it as out of range here too, so it falls through to the movement
    // branch below and climbs like it should.
    const attackerElevatedAI = window.getTerrainAt(entity.hex.q, entity.hex.r).elevated;
    const targetElevatedAI = target ? window.getTerrainAt(target.hex.q, target.hex.r).elevated : false;
    const elevationBlocksMelee = target && rangeWeapon?.subType !== 'ranged' && !target.climbing && !!attackerElevatedAI !== !!targetElevatedAI;

    if (target && dist <= attackRange && hasLOE && !isSkirmishRetreat && !blockedByAlly && !elevationBlocksMelee) {
        if (entity.skills['quarterstaff_trip'] && entity.timePoints >= 5 && Math.random() > 0.5) {
            const hitChance = 50 + entity.toHitMelee - target.passiveDodge;
            if (Math.random() * 100 < hitChance) {
                window.showMessage(`${entity.name} trips ${target.name}!`);
                target.timePoints = Math.max(0, target.timePoints - 5);
            }
            spendTP(entity, 5);
        } else {
            // tryAttack silently no-ops against a neutral-side target unless
            // ignoreNeutralCheck is passed (gameEngine.js's tryAttack) — a
            // rail against the *player* misclicking a shopkeeper, not meant
            // to apply here. `target` only ever reached this far because
            // `opponents` already decided it's hostile via this entity's own
            // combatDirective.hostileTo (e.g. an attacker explicitly sieging
            // a neutral-side garrison) — so if that's what named this target
            // hostile, the attack should actually land instead of being a
            // silent no-op that makes neutral-side defenders unkillable.
            const bypassNeutralCheck = target.side === 'neutral' && entity.combatDirective?.hostileTo === 'neutral';
            tryAttack(entity, target, false, false, 0, bypassNeutralCheck);
            spendTP(entity, 10);
        }
        setTimeout(() => aiProcess(entity), 20);
    } else {
        // SPACING AWARENESS: once the opposing side is known to have an
        // area-burst spell (aoe_damage in their createdSpells — the same
        // thing Burst mode produces, see skills.js's <school>_burst), a
        // unit avoids stacking next to its own allies — standing shoulder
        // to shoulder is exactly what makes one cheap cast worth several
        // kills. Computed once per call, not per candidate hex.
        const opponentSideForSpacing = entity.combatDirective?.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
        const opponentsHaveBurst = window.entities.some(e => e.alive && e.side === opponentSideForSpacing &&
            (e.createdSpells || []).some(s => s.type === 'aoe_damage'));
        const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
        const bestHex = neighbors.map(h => {
            let s = isSkirmishRetreat ? window.distance(h, huntTargetHex) : -window.distance(h, huntTargetHex);
            const t = window.getTerrainAt(h.q, h.r);
            // Was "+= 5" — a sign flip that made a Wall hex score BETTER than
            // an open one at the same distance, so chasing enemies picked
            // walls as their preferred step and then failed to path onto
            // them (findPath rightly refuses), leaving them stuck bumping
            // into the wall instead of routing around it.
            if (t.name === 'Wall') s -= 20;
            // Water only costs 2x move (terrain.js), not impassable — this
            // should nudge the greedy step-picker toward a dry route when
            // one's equally close, not make it refuse to ever cross a moat
            // (a -10 penalty dwarfed the distance term entirely, so an
            // attacker on the far side of a moat with no short dry route
            // would rather walk away from its objective than take one wet
            // step, reading as "can't get through the moat at all").
            if (t.name === 'Water') s -= 2;
            if (getEntityAtHex(h.q, h.r)) s -= 5;
            if (opponentsHaveBurst) {
                const alliesNearby = window.entities.filter(e => e.alive && e !== entity && e.side === entity.side &&
                    window.distance(h, e.hex) <= 1).length;
                s -= alliesNearby * 6;
            }
            // CONSTRAINT: a hex outside the directive's allowed area is
            // effectively unpickable while any legal alternative exists —
            // this is what stops a defender leaping over their own wall to
            // chase someone standing just out of range.
            const stayWithin = entity.combatDirective?.constraints?.stayWithinHexes;
            if (stayWithin && !stayWithin.has(`${h.q},${h.r}`)) s -= 1000;
            // HOLD GROUND: a tighter, mode-gated constraint on top of
            // stayWithinHexes — while set and not yet retreating, a
            // defender won't step off its held hex set (typically "the
            // wall ring itself") even to advance toward a target still
            // outside it. Lets go automatically the instant mode flips to
            // 'retreat', so it never blocks the actual fallback.
            const holdGround = entity.combatDirective?.holdGround;
            if (holdGround && entity.combatDirective?.mode !== 'retreat' && !holdGround.has(`${h.q},${h.r}`)) s -= 1000;
            // Generic wall-preference: an entity marked to prefer holding a
            // wall/elevated position (defensive + vision bonus) scores its
            // current terrain type higher than stepping off it, so all else
            // equal it stays put rather than wandering down for a target
            // that isn't actually in range yet.
            if (entity.combatDirective?.preferWalls && t.climbRisk) s += 8;
            // HEXAGON POINT PREFERENCE: the keep's 6 gap hexes are the best
            // vision in the compound (every hexagon archer's post,
            // buildNorthwatchFort) — an entity marked to want one gravitates
            // to whichever is currently unoccupied, rather than idling
            // wherever it happens to be standing. Weaker than holdGround/
            // preferWalls's hard holds (a real target still takes priority
            // via the distance term this only adds on top of), so it only
            // shapes behavior while nothing more urgent is going on.
            if (entity.combatDirective?.preferHexagonPoints) {
                const gaps = window.campaign2NorthwatchKeepGaps || [];
                const onGap = gaps.some(g => g.q === h.q && g.r === h.r);
                if (onGap && !getEntityAtHex(h.q, h.r)) s += 12;
            }
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
                    entity._lastMoveTick = window.worldSeconds || 0; // HEARING: stamped so nearby opponents can notice movement without LOS
                    if (entity.riding) entity.riding.hex = { q: nextHex.q, r: nextHex.r };
                }
                const terrain = window.getTerrainAt(entity.hex.q, entity.hex.r);
                const previousTerrain = window.getTerrainAt(previousHex.q, previousHex.r);

                // WALL CLIMB: same committed multi-turn climb as the
                // player's own movement path (playerMoveProcess, above) —
                // an AI entity stepping onto climbRisk terrain from
                // non-climbRisk terrain commits to climbing instead of
                // paying the full cost in one atomic step.
                const aiThroughOpenGate = isOpenGateAt(entity.hex.q, entity.hex.r) || isOpenGateAt(previousHex.q, previousHex.r);
                if (!entity.isFlying && terrain.climbRisk && !previousTerrain.climbRisk && !aiThroughOpenGate) {
                    const aiHasLadder = window.tileObjects?.[`${entity.hex.q},${entity.hex.r}`]?.type === 'ladder';
                    const aiBaseClimbCost = 125 * getClimbCostMult(moveEntity);
                    const aiClimbCost = aiHasLadder ? aiBaseClimbCost * 0.4 : aiBaseClimbCost;
                    moveEntity.climbing = {
                        fromHex: previousHex,
                        ticksRequired: Math.max(1, Math.round(aiClimbCost)),
                        ticksSpent: 0,
                    };
                    spendTP(moveEntity, 1);
                    setTimeout(() => aiProcess(entity), 20);
                    return;
                }

                let cost = 5;
                if (moveEntity.skills['fastMovement']) {
                    const isLightOrNoArmor = !moveEntity.equipped || !moveEntity.equipped.armor || window.items[moveEntity.equipped.armor]?.id === 'light_armor';
                    if (isLightOrNoArmor) cost -= moveEntity.skills['fastMovement'];
                }
                if (moveEntity.skills['swift_step']) {
                    const isUnarmored = (!moveEntity.equipped || !moveEntity.equipped.armor) && (!moveEntity.equipped || !moveEntity.equipped.offhand || window.items[moveEntity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) cost -= 1;
                }
                // Never free or a net TP gain — see the matching clamp in
                // playerMoveProcess above.
                cost = Math.max(1, cost);

                if (entity.riding) {
                    if (entity.riding.timePoints > 80) {
                        spendTP(entity.riding, Math.max(1, cost * window.getMoveCostMult(entity.hex.q, entity.hex.r, entity.riding)));
                    } else {
                        setTimeout(() => aiProcess(entity), 20);
                        return;
                    }
                } else {
                    spendTP(entity, Math.max(1, cost * window.getMoveCostMult(entity.hex.q, entity.hex.r, entity)));
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
window.aiProcess = aiProcess;

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
    // Every scripted world NPC is built with isNPC:true (buildNPC,
    // npcBuilder.js — used for the "diff against a deterministic baseline"
    // save trick, persistence.js), and updateTurnIndicator (ui.js)
    // deliberately excludes anyone with isNPC set so background flavor NPCs
    // don't clutter the tracker. That's correct right up until one of them
    // actually enters a fight — a handful of scripted encounters already
    // flip this by hand (Oskar's duel, Northwatch's defenders, the siege
    // engine, arena bosses), but any plain hostile spawn with no such script
    // (e.g. a wandering bandit) never got the same treatment and silently
    // never appeared in the initiative tracker despite fighting. Clearing it
    // generically here, for whichever entity's wakeUp() call actually starts
    // this fight, covers every case instead of requiring a new one-off flip
    // for each new piece of content.
    entity.isNPC = false;

    // Reset initiative and cancel movement if this is the start of combat
    if (firstAlert) {
        // Mark all currently-visible enemies as seen so they appear in the initiative tracker.
        // updateExploration only runs in the out-of-combat tick; calling it here ensures the
        // first combat broadcast already carries hasBeenSeenByPlayer=true for visible enemies.
        if (window.updateExploration) window.updateExploration();

        // Ambush vs. mutual-spot initiative: `entity` is whoever's wakeUp()
        // call actually triggered this fight starting, so its side spotted
        // first and gets full initiative. The opposing side only keeps that
        // full 100 too if they'd already spotted someone on entity's side
        // back (a genuinely simultaneous encounter, e.g. two aware parties
        // rounding a corner into each other) — otherwise they were the ones
        // caught by surprise (e.g. an elf archer with better vision engaging
        // a normal-sighted target from range) and start behind at 80, not
        // fully zeroed: still surprised, not helpless.
        const opponentSide = entity.combatDirective?.hostileTo || (entity.side === 'player' ? 'enemy' : 'player');
        const awareSide = window.entities.filter(e => e.alive && e.side === entity.side);
        const surprisedSide = window.entities.filter(e => e.alive && e.side === opponentSide);
        const mutualSpot = surprisedSide.some(s => awareSide.some(a => canSee(s, a)));
        const surprisedStartTP = mutualSpot ? 100 : 80;

        awareSide.forEach(e => { e.timePoints = 100; e.destination = null; e.moveCooldown = 0; });
        surprisedSide.forEach(e => { e.timePoints = surprisedStartTP; e.destination = null; e.moveCooldown = 0; });

        // Move Group is a real-time-only mechanic (assignGroupMoveDestinations
        // assigns each follower a formation-offset .destination, stepped by
        // the real-time movement loop above/in tick() while !isInCombat) — it
        // has no meaning once combat's turn-based movement takes over, and
        // reported as leaving stray followers stuck mid-formation-walk until
        // an unrelated later turn nudges something into reprocessing them.
        // Every party member's own .destination is already nulled just
        // above; clearing the mode/leader/path state here too means there's
        // nothing left for any leftover reference to that state to act on.
        window.groupMoveMode = false;
        window.groupLeader = null;
        window.leaderPath = null;

        deconflictPartyStacking();
        // A fight can start mid-stride during real-time movement — nulling
        // destination above stops any FURTHER movement, but doesn't correct
        // a rendered position that was mid-lerp between the last completed
        // hex and the next one (hex itself already updated the instant that
        // step began; only the smooth visual interpolation lagged). Snap
        // everyone's rendered position to match their actual hex so combat
        // doesn't open with someone drawn floating between two tiles.
        if (window.snapVisuals) window.snapVisuals();

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

    // GARRISON ALARM: a faction-tagged defender (Northwatch/Ridgehold's
    // soldiers, or any future garrisoned faction) sounds the alarm for the
    // whole garrison instantly, regardless of distance — a fort under
    // attack shouldn't depend on soldiers happening to patrol within the
    // ordinary 10-hex earshot of whoever's actually engaged; that's what
    // the alarm bell is for. Deliberately separate from the distance-based
    // chain above (which still applies to everyone, faction-tagged or not).
    if (entity.factionTag) {
        const garrison = window.entities.filter(e => e.alive && e.factionTag === entity.factionTag && e !== entity && e.aiState !== 'combat');
        garrison.forEach(g => {
            sharedMessage(`${g.name} hears the alarm bell and rushes to respond!`);
            wakeUp(g);
        });
    }
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
    if (entity.climbing) {
        entity.climbing.ticksSpent += amount;
        if (entity.climbing.ticksSpent >= entity.climbing.ticksRequired) {
            window.showMessage(`${entity.name} reaches the top of the wall.`);
            entity.climbing = null;
        }
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
    const interactableTypes = ['door_open', 'door_closed', 'signpost', 'journal', 'ore_node', 'timber_tree', 'stone_deposit', 'fruit_tree', 'herb_patch', 'fishing_spot', 'corpse', 'evidence', 'building_plot', 'player_bed', 'fireplace'];
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

    // TALK TO NPC — suppressed during combat so clicks default to attacking
    // instead, and suppressed whenever a skill/action is already armed (e.g.
    // Pickpocket) so clicking the target actually performs that action
    // instead of silently opening dialogue.
    if (!window.isInCombat && !window.playerAction && target && target.isNPC && window.distance(player.hex, clickedHex) <= 3) {
        talkToNPC(target);
        return;
    }

    if (window.playerAction) {
        const act = window.playerAction;
        if (act.type === 'force_attack') {
            // Force-Attack exists to bypass the neutral-target confirmation,
            // not weapon range/LOS — tryAttack itself never validates
            // distance (it trusts whoever's calling it already checked,
            // same as the normal highlighted-'attack'-hex click path below
            // does via getHexesInRange/hasLineOfSight), so without this
            // check here a Force-Attack click on a genuinely out-of-range
            // target (e.g. a climber several hexes below the wall) would
            // still resolve — including the climbing-fall roll on hit —
            // despite the player being unable to actually fire normally.
            let inRange = false;
            if (target && target.alive && target !== player) {
                let range = 1;
                const weapon = player.equipped?.weapon ? window.items[player.equipped.weapon] : null;
                if (weapon) {
                    range += (weapon.range || 0);
                    if (weapon.id === 'bow' && player.skills?.elf_bow_range) range += (player.skills.elf_bow_range * 4);
                    if (weapon.subType === 'ranged' && window.getTerrainAt(player.hex.q, player.hex.r).elevated) range += 2;
                }
                inRange = getMinDistance(player, target) <= range && window.hasLineOfSight(player.hex, target.hex);
            }
            if (target && target.alive && target !== player && inRange) {
                if (tryAttack(player, target, false, false, 0, true) !== false) {
                    spendTP(player, 10);
                    actionHandled = 'main_attack';
                }
            } else if (target) {
                window.showMessage("Target out of range.");
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
        } else if (act.type === 'raise_undead') {
            // getEntityAtHex only ever returns the living (see its e.alive
            // filter, gameEngine.js:94) — a dead horse corpse (an enemy's
            // fallen mount, or the player's own already sacrificed) has to
            // be found directly instead, since `target` would be null for it.
            const toRaise = target || window.entities.find(e => e.name === 'Horse' && !e.alive && e.hex.q === clickedHex.q && e.hex.r === clickedHex.r);
            if (toRaise && window.distance(player.hex, clickedHex) <= 1 && window.raiseSkeletonHorse) {
                window.raiseSkeletonHorse(toRaise);
            } else {
                window.showMessage("There's nothing here to raise.");
            }
            window.playerAction = null;
            window.updateActionButtons();
            return;
        } else if (act.type === 'skill') {
            if (act.id === 'shove' || act.id.endsWith('_feint')) {
                if (target && target.side !== player.side && window.distance(player.hex, clickedHex) === 1) {
                    if (act.id === 'shove') actionHandled = window.tryShove(player, target);
                    else { if (tryAttack(player, target, true) !== false) { spendTP(player, 1); actionHandled = true; } }
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
                            if (tryAttack(player, target, false, false, 4) !== false) { // +4 bonus damage
                                spendTP(player, 10);
                                actionHandled = true;
                            }
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
                        const struck = tryAttack(player, target, false);
                        delete player.tempHitBonus;
                        if (struck !== false) {
                            spendTP(player, 80);
                            actionHandled = true;
                        }
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
                        // Worn/wielded items live in the same .inventory array as
                        // carried loot (equipToMonster pushes both), so anything
                        // currently equipped has to be excluded here or pickpocket
                        // could lift a weapon right off the target's hands.
                        const equippedIds = new Set(Object.values(target.equipped || {}).filter(Boolean));
                        const stealableIdx = (target.inventory || []).map((id, i) => ({ id, i })).filter(x => !equippedIds.has(x.id));
                        if (stealableIdx.length > 0) {
                            const pick = stealableIdx[stealableIdx.length - 1];
                            target.inventory.splice(pick.i, 1);
                            player.inventory.push(pick.id);
                            window.showMessage(`${player.name} stole ${window.items[pick.id].name} from ${target.name}!`);
                        } else {
                            window.showMessage(`${target.name}'s pockets are empty.`);
                        }
                        // Being caught doesn't cost the item or turn violent — it's a
                        // reputation/legal consequence, not a combat one.
                        const catchChance = Math.max(5, 25 - (player.skills?.stealth_agility ? 5 : 0) - (player.skills?.stealth_rogue ? 5 : 0));
                        if (Math.random() * 100 < catchChance) {
                            if (target.reputation) window.adjustReputation(target.reputation, -15, 25);
                            const faction = target.factionId && window.factions[target.factionId];
                            if (faction) window.adjustReputation(faction, -5, 5);
                            const fine = Math.min(player.gold || 0, 10 + Math.floor(Math.random() * 20));
                            player.gold = (player.gold || 0) - fine;
                            window.showMessage(`${target.name} notices! Word of the theft spreads, and the local watch fines you ${fine} gold.`);
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
                if (getMinDistance(player, target) <= range) { if (tryAttack(player, target, false, true) !== false) { spendTP(player, 2); actionHandled = true; } }
            }
        } else if (act.type === 'spell') {
            const spell = window.player.createdSpells[act.index];
            const dist = target ? getMinDistance(player, target) : window.distance(player.hex, clickedHex);
            if (dist <= spell.range && getSpellCastAffordability(player, spell.manaCost + getArmorSpellPenalty(player, spell)).affordable && player.timePoints >= spell.tpCost) {
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
            if (tryAttack(player, target) !== false) { spendTP(player, 10); actionHandled = 'main_attack'; }
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
        return false;
    }
    if (target.side === 'neutral' && !ignoreNeutralCheck) {
        if (attacker.side === 'player') window.showMessage("You cannot attack a neutral character!");
        return false;
    }

    // UNFORGIVABLE ACT: deliberately, directly attacking a faction-tagged
    // defender (a Northwatch soldier/commander, or — symmetrically, once
    // any entity carries the tag — a greenskin escort) during the siege.
    // Discrete, not a points/suspicion meter — anything short of this
    // (being seen near the gate, general suspicion) stays excusable as
    // "pretending to get close enough to spy." Only reachable via a real
    // single-target attack (this function) — an AoE spell applies its
    // damage directly (see the aoe_damage branch) and never calls
    // tryAttack, so incidental splash damage to a bystander never counts.
    if (attacker.side === 'player' && target.factionTag && window.siegeState?.active && window.setFactionHostileToPlayer) {
        const factionLabel = target.factionTag === 'northwatch_human' ? "Northwatch's garrison" : 'the warband';
        window.setFactionHostileToPlayer(target.factionTag, `"Traitor! To arms!" — ${factionLabel} turns on you!`);
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
        return false;
    }

    // ELEVATION MELEE IMMUNITY: a defender on a wall/rampart can't be melee'd
    // from the ground, and can't melee the ground from up there either —
    // symmetric, same shape as the flying-immunity check above. A climbing
    // target is the deliberate exception: clinging to the wall face, they're
    // reachable in melee from both the wall itself and the ground below.
    const attackerElevated = window.getTerrainAt(attacker.hex.q, attacker.hex.r).elevated;
    const targetElevated = window.getTerrainAt(target.hex.q, target.hex.r).elevated;
    if (!isRanged && !target.climbing && !!attackerElevated !== !!targetElevated) {
        if (attacker.side === 'player') {
            window.showMessage(`Cannot reach ${target.name} with a melee attack across that height difference!`);
        }
        return false;
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
    let visionRange = (window.LIVE_VISION_RANGE || 25) + (viewer.visionBonus || 0);
    const light = window.lightLevel || 1.0;
    const effectiveLight = ((viewer.skills?.elf_darkvision || viewer.skills?.goblin_low_light_eyes)) ? 1.0 : light;
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

// CALM ANIMAL (spells.js): a valid target is a genuine wild-animal-type
// creature — tags includes 'animal' but NOT 'fey' (Unicorn) or 'dragon',
// even though Unicorn also happens to carry the 'animal' tag — or a rider
// mounted on one, in which case the debuff applies to the mount itself
// (returned here), not the rider.
function resolveCalmAnimalTarget(target) {
    const qualifies = (e) => !!e && !!e.tags && e.tags.includes('animal') && !e.tags.includes('fey') && !e.tags.includes('dragon');
    if (qualifies(target)) return target;
    if (target?.riding && qualifies(target.riding)) return target.riding;
    return null;
}
window.resolveCalmAnimalTarget = resolveCalmAnimalTarget;

// Finds the best hex to center an area spell on: among opponents currently
// in range, picks whichever one's hex catches the most other opponents
// within radius of it (a real "aim for the cluster" choice, not just
// whichever target happened to be found first) — shared by the DP
// attack-spell value estimate and the actual cast, so what gets valued is
// exactly what gets cast at.
function bestAoeCastHex(entity, opponents, range, radius) {
    const inRange = opponents.filter(o => window.distance(entity.hex, o.hex) <= range);
    if (inRange.length === 0) return null;
    if (!radius) return { hex: inRange[0].hex, count: 1 };
    let best = { hex: inRange[0].hex, count: 0 };
    inRange.forEach(candidate => {
        const count = inRange.filter(o => window.distance(candidate.hex, o.hex) <= radius).length;
        if (count > best.count) best = { hex: candidate.hex, count };
    });
    return best;
}
window.bestAoeCastHex = bestAoeCastHex;

// A ranged shot's line can be blocked by a friendly body standing in the
// way, the same as it's blocked by a wall — hasLineOfSight/hasLineOfEffect
// deliberately never check this (they also govern spotting and general
// reachability, where a crowd of allies shouldn't suddenly make you blind),
// so this is a separate, narrower check consulted only right before a
// ranged attack actually fires. This is what makes "blob everyone onto one
// hex and volley" a bad tactic instead of a free lunch: pile twenty archers
// onto the gate and only the front rank or two has daylight between them
// and the target — the rest are loosing arrows into their own side's backs.
function isShotBlockedByAlly(attacker, target) {
    const d = window.distance(attacker.hex, target.hex);
    if (d <= 1) return false;
    for (let i = 1; i < d; i++) {
        const t = i / d;
        const hex = window.hexRound(
            attacker.hex.q + (target.hex.q - attacker.hex.q) * t,
            attacker.hex.r + (target.hex.r - attacker.hex.r) * t
        );
        if ((hex.q === attacker.hex.q && hex.r === attacker.hex.r) || (hex.q === target.hex.q && hex.r === target.hex.r)) continue;
        const blocker = getEntityAtHex(hex.q, hex.r);
        if (blocker && blocker.alive && blocker.side === attacker.side) return true;
    }
    return false;
}
window.isShotBlockedByAlly = isShotBlockedByAlly;

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
    // Climbable Wall (Northwatch/Ridgehold's actual curtain wall,
    // carveStarFort) is deliberately not impassable — that's what makes it
    // climbable — but a catapult round should still be able to breach it,
    // same as the keep's genuinely impassable walls. Without this,
    // fireCatapultShot's whole "damage the wall" mechanic was a silent
    // no-op against every real fort wall in the game (no rubble ever
    // appeared, because this function refused to act on the one terrain
    // type the catapult actually targets).
    if (!terrain.impassable && !terrain.climbRisk) return;
    const key = `${q},${r}`;
    const maxHp = 20; // 2 catapult shots (10 dmg each) to breach one hex
    if (!window.tileObjects[key] || window.tileObjects[key].type !== 'siege_wall') {
        window.tileObjects[key] = { type: 'siege_wall', hp: maxHp, maxHp };
    }
    const wall = window.tileObjects[key];
    wall.hp -= amount;
    if (wall.hp <= 0) {
        window.setTerrainAt(q, r, 'Rubble');
        delete window.tileObjects[key];
        window.showMessage(`Wall segment at (${q},${r}) destroyed — a breach opens!`);
        window.drawMap();
    } else {
        window.showMessage(`Wall segment at (${q},${r}) hit (${wall.hp}/${wall.maxHp}).`);
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

  // A visible arrow/bolt flying attacker->target on every ranged attack
  // (hit or miss — a real shot still flies even when it misses), so a
  // ranged exchange actually reads as an attack instead of just a combat
  // log line. Melee never gets this; it already has its own hit-flash.
  if (isRanged && window.spawnProjectile) window.spawnProjectile(attacker.hex, target.hex);

  // Melee counterpart: the attacker pivots toward the target and bumps a
  // few pixels that way then springs back (see combatFX.js's
  // triggerMeleeLunge/getMeleeLungeTransform, consumed by renderEntities)
  // so swords/axes/spears/unarmed hits read as an actual swing instead of
  // a silent stat change, same spirit as the ranged projectile above.
  if (!isRanged && window.triggerMeleeLunge) window.triggerMeleeLunge(attacker, target);

  // Marks this target as under direct attack this combat regardless of
  // hit/miss — read by combatDirective.passiveUnlessThreatened (aiProcess)
  // so a normally hang-back defender (e.g. a commander) still fights back
  // once someone actually comes after them, rather than only reacting to
  // proximity.
  if (attacker.side !== target.side) target.wasDirectlyAttacked = true;

  // Being attacked snaps a calmed animal (Calm Animal, spells.js) out of it
  // regardless of hit/miss — the pacification only holds while nobody's
  // actually come after it.
  const calmed = (window.activeSpells || []).find(s => s.debuffType === 'calmed' && s.targetEntityId === target.id);
  if (calmed) window.cancelSpell(calmed.spellInstanceId);

  const baseHit = isRanged ? attacker.toHitRanged : attacker.toHitMelee;
  const attackerTerrain = window.getTerrainAt(attacker.hex.q, attacker.hex.r);
  const targetTerrain = window.getTerrainAt(target.hex.q, target.hex.r);
  let hitChance = 50 + baseHit + attackerTerrain.hitBonus - (target.passiveDodge + targetTerrain.dodgeBonus);
  if (attacker.toHitVsAnimal && target.tags?.includes('animal')) hitChance += attacker.toHitVsAnimal;
  if (target.climbing) hitChance += 5; // exposed mid-climb — can't brace or use a shield properly
  
  // FOLIAGE DEFENSE
  if (targetTerrain.name === 'Foliage') {
      let foliagePenalty = (isRanged ? 10 : 0);
      if (target.skills?.elf_foliage_expertise || target.skills?.druid_foliage_expertise) foliagePenalty += 10;
      hitChance -= foliagePenalty;
  }

  // COVER: behind any elevated terrain (pedestals, fort ramparts)
  if (window.isCoveredFromRangedAttack(target)) {
      window.showMessage(`${target.name} has cover (Cover bonus: -15 hit)`);
      hitChance -= 15;
  }

  if (attacker.equipped?.weapon && attacker.equipped?.offhand && window.items[attacker.equipped.offhand].type === 'weapon') hitChance -= 5;
  if (isOffhand) hitChance -= 5;
  if (weapon && attacker.skills[`${weapon.id}_hit`]) hitChance += 5;
  // Fists have no weapon.id to key off of — unarmed_hit was previously dead
  // code because of that (this `if (weapon && ...)` check above always
  // failed when unarmed).
  if (!weapon && attacker.skills?.unarmed_hit) hitChance += 5;

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
  // Fists have no weapon.id, so `${weapon?.id}_dmg` never matched
  // 'unarmed_dmg' — that skill was dead code until this unarmed-specific
  // read (WILD FURY, spells.js, applies the same way: only while unarmed).
  const unarmedDmg = !weapon ? (attacker.skills?.unarmed_dmg || 0) * 2 : 0;
  const wildFury = !weapon ? (window.activeSpells || []).find(s => s.debuffType === 'wild_fury_unarmed' && s.targetEntityId === attacker.id) : null;
  let dmg = (attacker.baseDamage || 1) + (weapon?.damage || 0) + ((attacker.skills[`${weapon?.id}_dmg`] || 0) * 2) + unarmedDmg + (wildFury?.magnitude || 0) + (attacker.skills['meleeDamage'] || 0) + bonusDamage;
  if (isOffhand) dmg -= 2;

  // DWARF AXE MASTERY
  if (weapon?.id === 'axe' && attacker.skills?.dwarf_axe_mastery) dmg += 2;

  // GOBLIN OPPORTUNIST — extra damage against a target that's already off-guard
  if (attacker.skills?.goblin_opportunist && target.caughtOffGuard) dmg += 3;

  // GOBLIN PACK HUNTER — extra damage against a target already flanked by an ally
  if (attacker.skills?.goblin_pack_hunter) {
      const flanked = window.entities.some(e => e.alive && e !== attacker && e.side === attacker.side && window.distance(e.hex, target.hex) <= 1);
      if (flanked) dmg += attacker.skills.goblin_pack_hunter * 2;
  }

  // ORC BRUTE STRENGTH — flat extra melee damage per rank
  if (attacker.skills?.orc_brute_strength) dmg += attacker.skills.orc_brute_strength * 2;

  // ORC FEROCITY — extra damage while at or below half HP
  if (attacker.skills?.orc_ferocity && attacker.hp <= attacker.maxHp / 2) dmg += 4;

  // ORC MOMENTUM — extra damage per rank on an attack made after covering
  // real ground (2+ hexes) since this turn started (see turnStartHex,
  // set when an entity's turn begins).
  if (attacker.skills?.orc_momentum && attacker.turnStartHex && window.distance(attacker.hex, attacker.turnStartHex) >= 2) {
      dmg += attacker.skills.orc_momentum * 3;
  }

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
  // Mid-climb: both hands are occupied holding on, so a shield does
  // nothing (climbing.js/gameEngine.js's climbTransition) — same gating
  // shape as caughtOffGuard just above.
  let red = target.caughtOffGuard ? 0 : (target.baseReduction || 0) +
            (target.equipped?.armor && window.items[target.equipped.armor] ? window.items[target.equipped.armor].reduction : 0) +
            (!target.climbing && target.equipped?.offhand && window.items[target.equipped.offhand] && window.items[target.equipped.offhand].type === 'shield' ? (window.items[target.equipped.offhand].reduction + (target.skills?.shield_proficiency || 0)) : 0) +
            (target.equipped?.helmet && window.items[target.equipped.helmet] ? (window.items[target.equipped.helmet].reduction || 0) : 0) +
            (target.tempReduction || 0) +
            (target.skills?.spectral_form ? 2 : 0);
  let fd = Math.max(1, dmg - red);

  // Hard mode: the player's side deals less and takes more, applied last so
  // it scales the final post-reduction number rather than raw damage.
  if (window.difficultyMode === 'hard') {
      if (attacker.side === 'player') fd = Math.max(1, Math.round(fd * 0.9));
      if (target.side === 'player') fd = Math.round(fd * 1.1);
  }

  // HEALING REDUCTION / PENALTIES (Not applicable to damage directly but noted)

  sharedMessage(`${attacker.name} hits ${target.name} for ${fd} damage! (${dmg} base - ${red} reduction)`);
  if (window.spawnFloatingText) window.spawnFloatingText(target.hex, `-${fd}`, '#ff4d4d');
  if (window.flashEntity) window.flashEntity(target, '#f00');
  target.hp -= fd; syncBackToPlayer(target);

  // FALLING: any hit landed while climbing risks losing the wall entirely —
  // a straight 50/50 roll (no skill mitigation modeled yet). Failure loses
  // all climb progress, drops them back to where they started climbing,
  // and deals 5 unmitigated (armor/shield-bypassing) damage — applied
  // directly to hp, not run through the `red` reduction above. If that's
  // lethal, the existing target.hp<=0 check just below calls
  // handleLethalDamage(target, attacker) same as any other death this
  // function causes — attacker is still the one who landed the hit that
  // caused the fall, so the kill/XP attribution is correct for free.
  if (target.climbing) {
      if (Math.random() < 0.5) {
          sharedMessage(`${target.name} loses their grip and falls!`);
          target.hex = { ...target.climbing.fromHex };
          target.climbing = null;
          target.hp -= 5; syncBackToPlayer(target);
          if (window.spawnFloatingText) window.spawnFloatingText(target.hex, `-5`, '#ff4d4d');
      } else {
          sharedMessage(`${target.name} clings on despite the blow!`);
      }
  }

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

  // SIPHONING PALM (Way of the Open Palm): an unarmed hit drains mana
  // straight from the target into the attacker, 1 per rank (max 3).
  if (!weapon && attacker.skills?.siphoning_palm) {
      const drained = Math.min(attacker.skills.siphoning_palm, target.currentMana || 0);
      if (drained > 0) {
          target.currentMana -= drained;
          attacker.currentMana = Math.min(attacker.maxMana || 0, (attacker.currentMana || 0) + drained);
          syncBackToPlayer(target);
          sharedMessage(`${attacker.name} siphons ${drained} mana from ${target.name}!`);
      }
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

// FLED: a fleeing combatant is treated as functionally defeated — the
// player still gets the XP they'd have gotten from a kill, checkCombatEnd
// (below) stops waiting on them the same way it stops waiting on a corpse,
// and (for Northwatch specifically) the siege leans the same direction a
// kill would have leaned it. This is the single place that ever sets
// entity.fled, called from both the distance-based and stuck-turn
// disengage paths, and from the chase-timeout stalemate breaker.
function markFled(entity) {
    if (entity.fled) return; // one-shot
    entity.fled = true;
    entity.disengaged = true;
    if (entity.combatDirective) entity.combatDirective.mode = null;

    if (window.player && window.player.side !== entity.side && entity.expValue) {
        window.gainExp(entity.expValue);
    }

    // Northwatch siege: a fled defender tips the fort toward falling, a
    // fled attacker tips it back toward holding — same bounded, one-time
    // nudge shape as the existing siege-engine-destroyed pressure change
    // (applySiegePressure), not a per-tick drift source.
    if (window.siegeState?.active) {
        if (entity.factionTag === 'northwatch_human') {
            window.applySiegePressure?.(6, `${entity.name} breaks and flees — one less defender on the wall.`);
        } else if (entity.combatDirective?.hostileTo === 'neutral') {
            window.applySiegePressure?.(-6, `${entity.name} breaks and flees the assault!`);
        }
    }
}
window.markFled = markFled;

// PLAYER DISENGAGE: the human player's own version of markFled — but
// deliberately NOT markFled, and deliberately no XP. Extracting yourself
// from a fight (a wolf you decided wasn't worth it, an ambush you outran)
// isn't the same as winning it; the enemy is still alive and un-fled, it
// just isn't worth chasing across the map anymore. Skips any scripted
// encounter that already has its own real win condition (a siege resolves
// through siegeState/pressure, not "did the player wander off") — this is
// only for generic, unscripted combat.
let _playerDisengageStreak = 0;
function checkPlayerCombatDisengage() {
    if (window.isInArena || window.borderWarSallyActive || window.siegeState?.active) {
        _playerDisengageStreak = 0;
        return;
    }
    const playerSide = window.entities.filter(e => e.alive && e.side === 'player');
    const hostiles = window.entities.filter(e => e.alive && e.side === 'enemy' && !e.fled && !e.disengaged);
    if (playerSide.length === 0 || hostiles.length === 0) {
        _playerDisengageStreak = 0;
        return;
    }
    let minDist = Infinity;
    playerSide.forEach(p => hostiles.forEach(h => { minDist = Math.min(minDist, window.distance(p.hex, h.hex)); }));

    const DISENGAGE_DISTANCE = 30; // same "very far away" scale as the AI flee rule (10x a typical threatRadius of 3)
    const SUSTAINED_TICKS = 150;   // a blip crossing the line briefly shouldn't end the fight — has to stay lost
    if (minDist >= DISENGAGE_DISTANCE) {
        _playerDisengageStreak++;
        if (_playerDisengageStreak >= SUSTAINED_TICKS) {
            hostiles.forEach(h => { h.disengaged = true; }); // no markFled, no XP — nobody was defeated
            window.isInCombat = false;
            window.gamePhase = 'WAITING';
            window.currentTurnEntity = null;
            window.showMessage('You put enough distance between yourself and your foes to break off the fight.');
            _playerDisengageStreak = 0;
        }
    } else {
        _playerDisengageStreak = 0;
    }
}
window.checkPlayerCombatDisengage = checkPlayerCombatDisengage;

// HUNTER/PREY FORCE BALANCE: cheap, called only from the no-visible-target
// branch of aiProcess (once per idle entity per turn, not a global per-tick
// pass) — "mine" is live same-side combatants weighted by
// combatDirective.outnumberWeight (Northwatch defenders: 2, everyone else
// defaults to 1); "theirs" is drawn from entity.knownOpponents — shared
// across every same-side ally (see getSharedKnownOpponents) rather than a
// fresh omniscient scan, so the role assessment is "roughly what the side
// collectively knows," matching a real war-band pooling sightings instead
// of each fighter reasoning in isolation.
function computeForceBalance(entity) {
    const weight = e => e.combatDirective?.outnumberWeight || 1;
    const mine = window.entities.filter(e => e.alive && e.side === entity.side && e.aiState === 'combat' && !e.disengaged)
        .reduce((s, e) => s + weight(e), 0) || weight(entity);
    const theirs = entity.knownOpponents ?
        [...entity.knownOpponents.values()].filter(k => k.alive).length : 0;
    return { mine, theirs };
}
window.computeForceBalance = computeForceBalance;

// Shared movement-scoring helper used by both hunter search and prey
// group-up repositioning: picks the open neighbor hex that best balances
// "closer to anchor" against "better lit, more open ground" — reusing
// window.isHexIlluminated (hexMap.js) rather than duplicating light-source
// math, and the same Wall/occupied penalties the normal chase-movement
// scoring loop already applies.
function scoreSearchNeighbor(entity, h, anchorHex, illumWeight) {
    let s = anchorHex ? -window.distance(h, anchorHex) * 3 : 0;
    const t = window.getTerrainAt(h.q, h.r);
    if (t.name === 'Wall') return -1000;
    // Same fix as the main chase-movement scorer above: Water only costs
    // 2x move (terrain.js), not impassable — a -10 penalty here dwarfed
    // the anchor-distance term too, so an attacker marching toward its
    // siegeObjective with no visible target yet (this is the path that
    // actually drives wave 1 approaching the fort, via
    // resolveNoVisibleTargetAI) would refuse to cross Northwatch's moat
    // even with no dry route anywhere nearby.
    if (t.name === 'Water') s -= 2;
    if (getEntityAtHex(h.q, h.r)) s -= 5;
    if (window.isHexIlluminated(h)) s += illumWeight;
    // ANTI-OSCILLATION: a hex this entity's own search lit up moments ago
    // scores worse, so it doesn't ping-pong between two nearby bright spots
    // (e.g. in and out of the same doorway). Perf-gated: __searchIllumCache
    // is only ever created/written here, inside the hunter-search path — a
    // fight that never reaches hunter/prey mode never touches it.
    const key = `${h.q},${h.r}`;
    const stamped = window.__searchIllumCache?.get(key);
    if (stamped !== undefined && (window.worldSeconds || 0) - stamped < 40) s -= illumWeight * 1.5;
    return s;
}

function bestSearchHex(entity, anchorHex, illumWeight) {
    const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r).filter(isOpenHex);
    if (neighbors.length === 0) return null;
    const best = neighbors.map(h => ({ h, s: scoreSearchNeighbor(entity, h, anchorHex, illumWeight) }))
        .sort((a, b) => b.s - a.s)[0].h;
    if (!window.__searchIllumCache) window.__searchIllumCache = new Map();
    window.__searchIllumCache.set(`${best.q},${best.r}`, window.worldSeconds || 0);
    return best;
}

// Called from aiProcess only once a turn already has no visible target
// (huntTargetHex would otherwise be null) — decides what an entity with
// SOME memory of the fight (knownOpponents non-empty) should do instead of
// idling forever. Returns a hex to move toward, or null to fall back to the
// original idle behavior (entities that never actually saw a hostile this
// fight are untouched by any of this).
function resolveNoVisibleTargetAI(entity, opponentSide) {
    if (entity.disengaged) return null; // already made its call — normal targeting logic re-engages it if it sees someone again
    // ARENA SCALE: the constants below (parked-turn/stuck-turn counts, flee
    // distance, search jitter) were tuned by feel for a 40+ hex fort siege —
    // a fight meant to sprawl over a long map and many turns. Unchanged,
    // they let an arena monster dawdle for turns before ever reaching a
    // flee/disengage decision, and checkCombatEnd already resolves a fight
    // the instant every remaining enemy is fled/disengaged — so shrinking
    // these for arenas is the direct lever for shorter arena fights, not a
    // new mechanic. Northwatch/siege fights (window.isInArena false) are
    // untouched.
    const arena = !!window.isInArena;
    // SIEGE OBJECTIVE: a besieger with no memory of any defender yet (fresh
    // spawn, or everyone it once saw is dead/lost) isn't a directionless
    // wanderer — it knows there's a fort to take and roughly where it is.
    // A gentle pull toward combatDirective.siegeObjective (same
    // distance-dominant, lightly-illumination-biased scoring as hunter
    // search, just a softer illumination weight) gives it real momentum
    // toward the fight without overriding actual sighted-enemy information
    // once there is any — this branch only ever fires when there's nothing
    // better to go on.
    const siegeObjective = entity.combatDirective?.siegeObjective;
    const towardObjective = () => (siegeObjective && window.distance(entity.hex, siegeObjective.hex) > 1)
        ? bestSearchHex(entity, siegeObjective.hex, 2)
        : null;
    if (!entity.knownOpponents || entity.knownOpponents.size === 0) return towardObjective();
    const aliveKnown = [...entity.knownOpponents.values()].filter(k => k.alive);
    if (aliveKnown.length === 0) return towardObjective(); // everyone it ever saw is confirmed dead — fall back on the objective instead of stopping cold

    let nearest = aliveKnown[0], nearestDist = window.distance(entity.hex, nearest.hex);
    aliveKnown.forEach(k => {
        const d = window.distance(entity.hex, k.hex);
        if (d < nearestDist) { nearestDist = d; nearest = k; }
    });

    const { mine, theirs } = computeForceBalance(entity);
    const isPrey = theirs >= mine * 2;

    // NO PERMANENT HIDE: nobody's plan is allowed to be "stand still
    // forever" — a defender in an overrun fort has to eventually decide to
    // flee or fight, not camp indefinitely. If this entity hasn't actually
    // changed hex for many consecutive no-visible-target turns (boxed in by
    // its own allies, or stuck circling a stale search anchor), force it
    // into a real decision: outnumbered -> disengage from the fight for
    // good; otherwise -> break off toward its own last-known-safe(ish)
    // ground rather than re-running the same stuck logic forever.
    if (!entity._parkedTurns) entity._parkedTurns = 0;
    if (!entity._parkedAtHex || entity._parkedAtHex.q !== entity.hex.q || entity._parkedAtHex.r !== entity.hex.r) {
        entity._parkedAtHex = { q: entity.hex.q, r: entity.hex.r };
        entity._parkedTurns = 0;
    } else {
        entity._parkedTurns++;
    }
    if (entity._parkedTurns >= (arena ? 4 : 8)) {
        // Deliberately NOT aiState='idle' here: for a 'enemy'-side entity
        // that flips it into the OLD idle-scan branch further up aiProcess,
        // which only ever looks for side==='player' targets — never a
        // directed-hostility 'neutral' opponent (e.g. Northwatch's
        // garrison). That collision was itself the bug behind "an entity
        // disengages and then never does anything again, forever," found by
        // reproducing the star-fort endgame directly. `disengaged` opts out
        // of the force-balance count (computeForceBalance) and this
        // function returns null (no more searching/fleeing), but the
        // entity's normal targeting/attack logic stays fully live — if
        // someone walks back into view, it fights.
        if (isPrey) markFled(entity); // outnumbered and stuck: that's a flight that succeeded, not a search that stalled
        else { entity.disengaged = true; if (entity.combatDirective) entity.combatDirective.mode = null; }
        entity._parkedTurns = 0;
        return null;
    }

    if (isPrey) {
        // Reluctant to flee: a defender-weighted entity (outnumberWeight>1)
        // needs a much starker mismatch before it runs; everyone else flees
        // once genuinely swamped. Either way this branch only runs with NO
        // visible enemy this turn — "out of immediate fighting" is already
        // guaranteed by how aiProcess reaches this function.
        const fleeThreshold = (entity.combatDirective?.outnumberWeight || 1) > 1 ? 4 : 2.5;
        if (theirs >= mine * fleeThreshold) {
            const threatRadius = entity.combatDirective?.threatRadius || 3;
            if (nearestDist >= threatRadius * (arena ? 4 : 10)) {
                // Far enough from every known-alive hostile to call it: a
                // successful escape, functionally the same as a defeat (see
                // markFled) rather than merely a paused fight.
                markFled(entity);
                return null;
            }
            const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r).filter(isOpenHex);
            if (neighbors.length === 0) return null;
            return neighbors.sort((a, b) => window.distance(b, nearest.hex) - window.distance(a, nearest.hex))[0];
        }
        // GROUP UP: head for the nearest living ally, then once close,
        // nudge toward better (lit, open) ground. Directive-level fallbacks
        // like Northwatch's retreatTo already short-circuit earlier in
        // aiProcess, so this only covers entities with no such order.
        const allies = window.entities.filter(e => e.alive && e !== entity && e.side === entity.side && e.aiState === 'combat');
        if (allies.length > 0) {
            allies.sort((a, b) => window.distance(entity.hex, a.hex) - window.distance(entity.hex, b.hex));
            if (window.distance(entity.hex, allies[0].hex) > 2) return allies[0].hex;
        }
        return bestSearchHex(entity, nearest.hex, 8);
    }

    // HUNTER: search near the last place this opponent was actually seen.
    // Group vs. spread both reuse the same anchor-approach scoring — group
    // biases toward staying close to the nearest ally (a small pull baked
    // into a lower illumination weight so distance-to-anchor still
    // dominates), spread just leans harder on illumination/ground since it
    // isn't trying to stay bunched.
    const borderlineStronger = mine < theirs * 1.5;
    const illumWeight = borderlineStronger ? 6 : 10;

    // STALE ANCHOR: a matched-forces fight (the case this generalized chase
    // timeout exists for) shouldn't take a beeline toward the same
    // last-known hex for dozens of turns and then just quietly give up —
    // real searchers widen out once a spot doesn't pan out. Past a stuck
    // streak, nudge the search anchor outward from the last-known position
    // by a pseudo-random (but not per-tick-jittery — same offset for a
    // ~10-turn stretch) amount, so it actually starts checking a
    // different part of the area instead of orbiting one stale point.
    const stuckTurns = entity._chaseStuckTurns || 0;
    let anchor = nearest.hex;
    if (stuckTurns >= (arena ? 8 : 15)) {
        const bucket = Math.floor(stuckTurns / 10);
        const seed = ((entity.id * 2654435761 + bucket * 40503) % 1000) / 1000;
        const angle = seed * Math.PI * 2;
        const dist = arena ? 3 + Math.floor(seed * 4) : 6 + Math.floor(seed * 8);
        anchor = { q: nearest.hex.q + Math.round(Math.cos(angle) * dist), r: nearest.hex.r + Math.round(Math.sin(angle) * dist) };
    }
    return bestSearchHex(entity, anchor, illumWeight);
}
window.resolveNoVisibleTargetAI = resolveNoVisibleTargetAI;

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
// Scores a candidate target against an ordered combatDirective.priorities
// list — first tier wins outright; used only as a tie-break ahead of the
// existing downed/distance logic below, and only for entities that opted
// into a directive at all.
function directivePriorityScore(priorities, target) {
    for (let i = 0; i < priorities.length; i++) {
        const p = priorities[i];
        const tierWeight = (priorities.length - i) * 1000;
        if (p.type === 'nearHex' && window.distance(target.hex, p.hex) <= p.radius) return tierWeight;
        if (p.type === 'insideRegion' && p.hexes.has(`${target.hex.q},${target.hex.r}`)) return tierWeight;
    }
    return 0;
}

function targetPriorityCompare(entity, a, b, opponentsHaveHealer) {
    if (entity.combatDirective?.priorities) {
        const scoreA = directivePriorityScore(entity.combatDirective.priorities, a);
        const scoreB = directivePriorityScore(entity.combatDirective.priorities, b);
        if (scoreA !== scoreB) return scoreB - scoreA; // higher tier score wins
    }
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

    // SECOND WAVE TRIGGER (safety net): the primary check runs inside the
    // ram/sapper's own scripted turn (gameEngine.js's isBatteringRam block),
    // but if defenders kill BOTH of them in ordinary combat before either
    // gets another turn of its own, neither one is left to notice — check
    // here too, on every kill, so a defender-won outcome for both still
    // spawns the second wave.
    if ((target.isBatteringRam || target.isSiegeSapper) && window.campaign2NorthwatchRam && window.campaign2NorthwatchSapper
        && !window.campaign2NorthwatchRam.alive && !window.campaign2NorthwatchSapper.alive
        && !window.greenskinSecondWaveSpawned && window.spawnSecondGreenskinWave) {
        window.spawnSecondGreenskinWave();
    }

    // THIRD WAVE TRIGGER: same shape as the second wave's own trigger above
    // — wave 1 alone wasn't meant to win, and neither is wave 2. Once every
    // wave-2 attacker (name tagged 'II-', spawnSecondGreenskinWave) is dead,
    // a third and final wave presses the point, gated the same "only once"
    // way via window.greenskinThirdWaveSpawned.
    if (window.greenskinSecondWaveSpawned && !window.greenskinThirdWaveSpawned && target.name?.includes('II-') &&
        !window.entities.some(e => e.name?.includes('II-') && e.alive) && window.spawnThirdGreenskinWave) {
        window.spawnThirdGreenskinWave();
    }

    // FALLEN ARCHER POST (Northwatch hexagon keep): the first of the 6
    // hexagon-point archers to die sends the commander to take their post,
    // per buildNorthwatchFort (campaign2World.js). One-shot, flagged on the
    // commander herself rather than a global — reuses the existing sticky-
    // retreat movement mechanism (aiProcess) by setting mode/retreatTo
    // directly instead of going through a contingencies entry, since this
    // fires from a specific death event, not a per-turn condition check.
    if (target.isHexagonArcher) {
        const commander = window.entities.find(e => e.alive && e.takeFallenArcherPostOnce);
        if (commander) {
            commander.takeFallenArcherPostOnce = false;
            commander.combatDirective.retreatTo = { q: target.hex.q, r: target.hex.r };
            commander.combatDirective.mode = 'retreat';
        }
    }

    // PERCEPTION MEMORY: only touches entities that actually remembered this
    // target (most won't), not a global sweep — tells anyone who once saw
    // this target that it's dead now, even if they haven't laid eyes on the
    // corpse themselves.
    window.entities.forEach(e => {
        const known = e.knownOpponents?.get(target.id);
        if (known) known.alive = false;
    });

    // Leave a harvestable corpse behind for animal-tagged kills (see
    // leaveCorpse/harvestCorpse in resources.js) — gated on Knowledge:
    // Nature's nature_butchery sub-skill, not the base skill itself.
    if (target.tags?.includes('animal') && window.leaveCorpse) window.leaveCorpse(target);
    // Every OTHER kill previously just vanished the instant alive=false hit
    // the render filter (renderEntities only draws e.alive entities) — no
    // grayscale, no lying-down sprite, nothing marking where they fell.
    // Rather than keep the dead entity itself rendered (which would need
    // every alive-gated system — pathfinding, targeting, the initiative
    // tracker — re-audited to ignore it), drop a plain non-interactive
    // ground marker at the death hex instead, purely visual, distinct from
    // the harvestable animal 'corpse' type above.
    else if (!window.tileObjects[`${target.hex.q},${target.hex.r}`]) {
        window.tileObjects[`${target.hex.q},${target.hex.r}`] = { type: 'body_marker', name: target.name };
    }

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
        // cryptMinion (the necromancer's crypt, see buildNecromancerCrypt)
        // is a separate tag from necromancerMinion (the abandoned house)
        // specifically so isAbandonedHouseCleared's global `.some()` check
        // isn't accidentally gated behind clearing the whole crypt too.
        if ((target.necromancerMinion || target.cryptMinion) && window.factions?.necromancer_cult) {
            window.adjustReputation(window.factions.necromancer_cult, -5, 5);
        }
        // Being seen killing a living human while a known lich draws more of
        // the crown's attention than just existing quietly does (see
        // lichHunt.js).
        if (window.playerIsLich && target.race === 'human' && window.bumpLichHuntAwarenessFromKill) {
            window.bumpLichHuntAwarenessFromKill();
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

// ============================================================
// NORTHWATCH SIEGE STATE — an abstracted, side-agnostic siege.
// ============================================================
// Deliberately small numbers, not a mass-combat sim (matches this
// project's stance elsewhere: the player's own fight stays small and
// deliberate; this is the abstraction that turns it into a fort-wide
// outcome). pressure drifts with ZERO expected long-run direction on its
// own — "evenly matched" — so the player's actions (each bounded, not
// compounding) are what actually tip it, in either direction, from
// whichever of the four angles (human, goblin, undercover either way)
// they're playing.
//
// Wall segments are derived from the star fort's own wallHexes (built by
// carveStarFort, campaign2World.js) bucketed into 6 groups by angle from
// the fort's center using the existing hexToPixel — no changes needed to
// the fort-building code itself.
function buildSiegeSegments(center, wallHexes) {
    const buckets = [[], [], [], [], [], []];
    const c = window.hexToPixel(center.q, center.r);
    (wallHexes || []).forEach(h => {
        const p = window.hexToPixel(h.q, h.r);
        const angle = Math.atan2(p.y - c.y, p.x - c.x);
        const idx = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 6) % 6;
        buckets[idx].push(h);
    });
    return buckets.map((hexes, i) => ({ id: i, wallHexes: hexes, defenderStrength: 10, attackerStrength: 10 }));
}

// Idempotent — safe to call from any of the four entry points (human
// commander's quest, a goblin contact's quest, or just the player showing
// up and picking a side) without worrying about double-initializing.
function activateNorthwatchSiege() {
    if (window.siegeState && window.siegeState.active) return window.siegeState;
    const center = window.campaign2NorthwatchCenter;
    const fortRegion = window.campaign2NorthwatchFortRegion;
    window.siegeState = {
        active: true,
        pressure: 0, // -100 defenders firmly hold .. +100 fort falls
        commanderAlive: true,
        gateHeld: true,
        siegeEngineAlive: true,
        segments: fortRegion ? buildSiegeSegments(center, fortRegion.wallHexes) : [],
        lastTickWorldSeconds: window.worldSeconds || 0,
    };
    return window.siegeState;
}
window.activateNorthwatchSiege = activateNorthwatchSiege;

// Bounded, one-shot-per-call nudge — never a runaway multiplier. Used for
// every discrete player action (killing the siege engine, pulling the
// gate lever, assassinating the commander, winning/losing the sally
// fight) so no single action can decide the whole siege by itself.
function applySiegePressure(delta, message) {
    if (!window.siegeState) return;
    window.siegeState.pressure = Math.max(-100, Math.min(100, window.siegeState.pressure + delta));
    if (message) window.showMessage(message);
    checkSiegeResolution();
}
window.applySiegePressure = applySiegePressure;

// Discrete faction-vs-player hostility flip — deliberately NOT a points/
// suspicion meter. A faction is either still willing to excuse the
// player's presence (everything short of an unforgivable act — being
// seen near the gate, general wariness) or it isn't; there's no partial
// credit. Flips every already-spawned entity carrying a matching
// factionTag (and a combatDirective — see the "Layered combat AI" plan)
// at once via the same hostileToPlayer field targetPriorityCompare/
// aiProcess already read, so no new wiring is needed on the AI side.
function setFactionHostileToPlayer(factionTag, message) {
    let changed = false;
    window.entities.forEach(e => {
        if (e.factionTag === factionTag && e.combatDirective && !e.combatDirective.hostileToPlayer) {
            e.combatDirective.hostileToPlayer = true;
            changed = true;
        }
    });
    if (changed && message) window.showMessage(message);
}
window.setFactionHostileToPlayer = setFactionHostileToPlayer;

// Called on the same ~1s out-of-combat refresh cadence runTickInternal
// already uses for updateNpcSchedules/rebuildRestlessSet. Zero-expected-
// value random walk (the "evenly matched" baseline) plus the commander's
// visible reserve dispatch (stops permanently the moment he dies — a real
// mechanical consequence of killing him, not just flavor).
function tickSiegeState() {
    const s = window.siegeState;
    if (!s || !s.active) return;
    // Once the real scripted assault begins (wave 1 spawned,
    // spawnGreenskinAssaultWave), the abstract pressure-drift model stops
    // driving resolution — checkCombatEnd's dedicated Northwatch check
    // takes over instead, tied to the real fight's actual outcome (all
    // defenders dead, or all of wave 1/wave 2/the ram/the sapper dead)
    // rather than a random walk with no idea any of that exists.
    if (window.greenskinWaveSpawned) return;
    s.pressure += (Math.random() - 0.5) * 2;

    if (s.commanderAlive && s.segments.length) {
        let worst = s.segments[0];
        s.segments.forEach(seg => {
            if ((seg.attackerStrength - seg.defenderStrength) > (worst.attackerStrength - worst.defenderStrength)) worst = seg;
        });
        if (worst.attackerStrength > worst.defenderStrength) {
            worst.defenderStrength += 0.5;
            if (Math.random() < 0.1) {
                window.showMessage("Commander Hart barks an order — reserves peel off toward the wall under the worst pressure!");
            }
        }
    }
    checkSiegeResolution();
}
window.tickSiegeState = tickSiegeState;

function checkSiegeResolution() {
    const s = window.siegeState;
    if (!s || !s.active) return;
    if (s.pressure <= -100) resolveNorthwatchSiege('siege_broken');
    else if (s.pressure >= 100) resolveNorthwatchSiege('fort_fallen');
}

// Shared cleanup for both outcomes — win/lose share the "stop the
// simulation, settle the quest, swing reputation the direction that
// actually happened" bookkeeping instead of duplicating it per-outcome.
function resolveNorthwatchSiege(outcome) {
    const s = window.siegeState;
    if (!s || !s.active) return;
    s.active = false;
    const quest = (window.questLog || []).find(q => q.id === 'border_war');
    if (quest) { quest.status = 'completed'; quest.resolution = outcome; }
    if (outcome === 'siege_broken') {
        if (window.factions?.orc_raiders) window.adjustReputation(window.factions.orc_raiders, -20, 15);
        if (window.adjustRegionStat) window.adjustRegionStat('aldervale', 'security', 10);
        window.showMessage("Northwatch's wall holds — the greenskin assault breaks against it.");
    } else if (outcome === 'fort_fallen') {
        if (window.factions?.orc_raiders) window.adjustReputation(window.factions.orc_raiders, 15, 15);
        if (window.adjustRegionStat) window.adjustRegionStat('aldervale', 'security', -15);
        window.showMessage("A horn sounds from the walls — Northwatch has fallen to the greenskins.");
        if (window.playerAidingGreenskins) {
            const spyQuest = (window.questLog || []).find(q => q.id === 'greenskin_spy');
            if (spyQuest) { spyQuest.status = 'completed'; spyQuest.resolution = 'fort_fallen'; }
        }
    }

    // Force a side commitment: whoever the player actually fought against
    // (via the unforgivable-act hostility flips) wins by default; if the
    // player never directly fought anyone, fall back to whoever won the siege.
    const betrayedHumans = window.entities.some(e => e.factionTag === 'northwatch_human' && e.combatDirective?.hostileToPlayer);
    const betrayedGreenskins = window.entities.some(e => e.factionTag === 'greenskin_assault' && e.combatDirective?.hostileToPlayer);
    let playerSide;
    if (betrayedHumans && !betrayedGreenskins) playerSide = 'greenskin';
    else if (betrayedGreenskins && !betrayedHumans) playerSide = 'human';
    else if (window.playerAidingGreenskins) playerSide = 'greenskin';
    else playerSide = outcome === 'fort_fallen' ? 'greenskin' : 'human';
    window.northwatchPlayerSide = playerSide;
    // Brother Alden (human side) now fights in the compound during the real
    // assault (spawnBrotherAlden, campaign2Dialogue.js) instead of being
    // granted out of nowhere afterward — he only gets a chance to join if
    // he actually survived the fight, and it's a real conversation
    // (npcDialogueTrees.brother_alden) rather than an automatic grant.
    // The greenskin side's Snik Fangtooth still uses the older automatic
    // grant unchanged.
    if (playerSide === 'human') {
        const alden = window.entities.find(e => e.name === 'Brother Alden');
        if (alden && alden.alive) {
            alden.offersToJoin = true;
            window.showMessage("Brother Alden lowers his guard, breathing hard but alive. He looks like he wants to talk.");
        }
    } else if (window.grantStarFortCompanion) {
        window.grantStarFortCompanion(playerSide);
    }

    // The fort fight settles who the player is now fighting for, not the
    // whole war — that's window.warState, a slower, mission-driven tug of
    // war that picks up from here (see WAR_MISSION_TYPES/offerWarMission
    // below).
    window.warState = { active: true, playerSide, pressure: 0, majorMissionUnlocked: false };
}
window.resolveNorthwatchSiege = resolveNorthwatchSiege;

// War-pressure mission system: a slower, side-committed tug of war that
// picks up once the player has a side (window.warState.playerSide, set by
// resolveNorthwatchSiege above). Unlike siegeState's zero-drift random
// walk, doing nothing here has a direction — pressure always decays back
// toward 0 (very slowly), so "sit still" is never a winning strategy but
// also never suddenly loses the war on its own.
window.WAR_MISSION_TYPES = {
    scout: { label: 'Scout enemy positions', pressureReward: 5 },
    raid: { label: 'Raid a supply line', pressureReward: 8 },
    hit_and_run: { label: 'Eliminate a VIP', pressureReward: 12 },
};

function offerWarMission(type) {
    if (!window.warState?.active) return null;
    const spec = window.WAR_MISSION_TYPES[type];
    if (!spec) return null;
    window.questLog = window.questLog || [];
    const mission = {
        id: `war_mission_${type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        type,
        title: spec.label,
        status: 'active',
        isWarMission: true,
        pressureReward: spec.pressureReward,
    };
    window.questLog.push(mission);
    window.showMessage(`New mission: ${spec.label}`);
    return mission;
}
window.offerWarMission = offerWarMission;

function completeWarMission(missionId) {
    const mission = (window.questLog || []).find(q => q.id === missionId);
    if (!mission || mission.status !== 'active') return;
    mission.status = 'completed';
    applyWarPressure(mission.pressureReward, `Mission complete: ${mission.title}.`);
}
window.completeWarMission = completeWarMission;

// Bounded, one-shot nudge — same shape as applySiegePressure, so a single
// mission (however juicy) can't swing the war by itself.
function applyWarPressure(delta, message) {
    if (!window.warState?.active) return;
    window.warState.pressure = Math.max(-100, Math.min(100, window.warState.pressure + delta));
    if (message) window.showMessage(message);
    checkWarPressureThresholds();
}
window.applyWarPressure = applyWarPressure;

function tickWarState() {
    const w = window.warState;
    if (!w || !w.active) return;
    const decay = 0.1;
    if (w.pressure > 0) w.pressure = Math.max(0, w.pressure - decay);
    else if (w.pressure < 0) w.pressure = Math.min(0, w.pressure + decay);
}
window.tickWarState = tickWarState;

// Crossing this threshold doesn't resolve anything by itself — it's a flag
// content can check (dialogue offering bigger missions: taking more forts,
// hitting greenskin camps) once the player's side has real momentum.
function checkWarPressureThresholds() {
    const w = window.warState;
    if (!w || w.majorMissionUnlocked) return;
    if (w.pressure >= 60) {
        w.majorMissionUnlocked = true;
        window.showMessage("Your side's momentum is turning heads — bigger operations are opening up.");
    }
}
window.checkWarPressureThresholds = checkWarPressureThresholds;

// Wild unicorn tracking: the druid grove questline (campaign2Dialogue.js)
// doesn't hand over the unicorn directly — it wanders a fixed loop
// (window.campaign2UnicornPatrolPath, set up by spawnWildUnicorn in
// campaign2World.js) and has to actually be tracked down. A ring of fixed
// "track" tileObjects along that loop (window.campaign2UnicornTrackHexes)
// stand in for footprints; how many are visible, and how much detail
// clicking one reveals, scales with the player's Knowledge: Nature rank
// (1-3, see getKnowledgeNatureRank in skills.js) rather than being an
// all-or-nothing gate.

// Advances the unicorn one waypoint at a time on the same ~1s out-of-combat
// cadence tickSiegeState/tickWarState use (runTickInternal) — reuses the
// exact same destination-based movement every scheduled NPC already walks
// with (see updateNpcSchedules), just looping forever instead of a daily
// route.
function tickUnicornWander() {
    const unicorn = window.campaign2UnicornEntity;
    const path = window.campaign2UnicornPatrolPath;
    if (!unicorn || !unicorn.alive || !path || path.length === 0) return;
    if (unicorn.destination) return; // still walking to its current waypoint
    window.campaign2UnicornPathIndex = ((window.campaign2UnicornPathIndex || 0) + 1) % path.length;
    unicorn.destination = { q: path[window.campaign2UnicornPathIndex].q, r: path[window.campaign2UnicornPathIndex].r };
}
window.tickUnicornWander = tickUnicornWander;

// Deterministic per-hex pseudo-random value in [0,1) — the same hex always
// hashes to the same value, so a given track's visibility is stable at a
// fixed Knowledge: Nature rank (it just gains company as rank rises, never
// flickers on its own).
function hashHex01(q, r) {
    const n = Math.sin(q * 127.1 + r * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

// Fraction of the trail a given Knowledge: Nature rank reveals — "only a
// few percent" at rank 1, most of it by rank 3.
const UNICORN_TRACK_VISIBILITY = { 0: 0, 1: 0.05, 2: 0.35, 3: 0.7 };

function isUnicornTrackVisible(q, r) {
    const rank = window.getKnowledgeNatureRank ? window.getKnowledgeNatureRank(window.player) : 0;
    const frac = UNICORN_TRACK_VISIBILITY[rank] || 0;
    if (frac <= 0) return false;
    return hashHex01(q, r) < frac;
}
window.isUnicornTrackVisible = isUnicornTrackVisible;

// Axial-delta-to-compass label, independent of camera pan/zoom (unlike
// hexToPixel) since only the direction of the vector matters here.
function hexDirectionLabel(dq, dr) {
    const x = 1.5 * dq;
    const y = Math.sqrt(3) * dr + (Math.sqrt(3) / 2) * dq;
    const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const dirs = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
    return dirs[Math.round(deg / 45) % 8];
}

// Coarse "how long ago" read on a track, derived from how many waypoints
// behind the unicorn's current position this track's segment is — no
// literal elapsed-time bookkeeping needed since the loop itself is the clock.
function getUnicornTrackAgeLabel(segmentIndex) {
    const path = window.campaign2UnicornPatrolPath;
    if (!path || path.length === 0) return 'an unknown age';
    const curIdx = window.campaign2UnicornPathIndex || 0;
    const behind = (curIdx - segmentIndex + path.length) % path.length;
    if (behind <= 1) return 'fresh — the trail is warm';
    if (behind <= 3) return 'a day or so old';
    return 'old, gone cold';
}

// The click-to-read interaction (see interactWithTileObject's unicorn_track
// case below) — deliberately click-based rather than hover/long-tap, the
// same interaction verb this engine already uses for every other tile
// object (journals, the gate lever, etc.).
function showUnicornTrackDetail(obj, q, r) {
    // A track that isn't currently revealed (see isUnicornTrackVisible)
    // shouldn't be readable just because a click happened to land on that
    // hex — there's nothing visibly there to click on in the first place.
    if (!window.isUnicornTrackVisible(q, r)) return;
    const rank = window.getKnowledgeNatureRank ? window.getKnowledgeNatureRank(window.player) : 0;
    if (rank <= 1) {
        window.showMessage("Faint hoofprints, half-obscured — hard to say which way they lead.");
        return;
    }
    let msg = `Hoofprints lead ${hexDirectionLabel(obj.dirQ, obj.dirR)}.`;
    if (rank >= 3) msg += ` They look ${getUnicornTrackAgeLabel(obj.segmentIndex)}.`;
    window.showMessage(msg);
}
window.showUnicornTrackDetail = showUnicornTrackDetail;

function checkCombatEnd() {
    // Ironbond-arc endgame (ironbondArc.js/campaign2World.js's
    // launchIronbondArcEndgame): checked on its own, precise condition
    // ("every ironbondArcCombatant dead") rather than nested inside the
    // "no enemy anywhere on the map is alive" gate below — the necromancer
    // crypt's undead (and any other Campaign 2 wilderness enemy) are alive
    // somewhere on the map for most of the game, which would otherwise
    // starve this branch of ever firing in a real playthrough. Fires once,
    // then clears the active-encounter flag so an unrelated later fight
    // can't retrigger it.
    if (window.currentCampaign === "2" && window.ironbondArc?.endgameTriggered && window.ironbondArc?.activeEncounterSide &&
        !window.entities.some(e => e.isIronbondArcCombatant && e.alive)) {
        window.ironbondArc.activeEncounterSide = null;
        const advanced = window.advanceIronbondArcEndgameStage && window.advanceIronbondArcEndgameStage();
        if (!advanced && window.resolveIronbondArcEndgame) window.resolveIronbondArcEndgame();
    }

    // Lich hunt (lichHunt.js): same "check on its own precise condition"
    // reasoning as the Ironbond block above — a spawned hunting-party wave
    // resolves the moment every isLichHuntCombatant is dead, regardless of
    // unrelated enemies alive elsewhere on the map.
    if (window.currentCampaign === "2" && window.lichHuntState?.huntTriggered &&
        !window.entities.some(e => e.isLichHuntCombatant && e.alive)) {
        if (window.resolveLichHuntWave) window.resolveLichHuntWave();
    }
    // The chapterhouse itself — a one-time, permanent resolution once all
    // its named defenders are dead.
    if (window.currentCampaign === "2" && window.lichHuntState && !window.lichHuntState.chapterhouseDestroyed &&
        window.entities.some(e => e.isLichChapterhouseDefender) &&
        !window.entities.some(e => e.isLichChapterhouseDefender && e.alive)) {
        if (window.resolveLichChapterhouseDestroyed) window.resolveLichChapterhouseDestroyed();
    }

    // NORTHWATCH REAL ASSAULT RESOLUTION: once the scripted wave 1 assault
    // actually begins (spawnGreenskinAssaultWave, campaign2Dialogue.js),
    // the old abstracted pressure-drift model (tickSiegeState) stops
    // resolving the siege on its own — see the early return there — and
    // this precise check takes over instead, same "checked on its own
    // condition" pattern as the Ironbond/lich-hunt blocks above: fort_fallen
    // once every Northwatch defender is dead, siege_broken once every
    // greenskin_assault attacker (wave 1, wave 2, the ram, the sapper) is.
    if (window.currentCampaign === "2" && window.greenskinWaveSpawned && window.siegeState?.active) {
        const defendersAlive = window.entities.some(e => e.factionTag === 'northwatch_human' && e.alive);
        const attackersAlive = window.entities.some(e => e.factionTag === 'greenskin_assault' && e.alive);
        if (!defendersAlive && window.resolveNorthwatchSiege) window.resolveNorthwatchSiege('fort_fallen');
        else if (!attackersAlive && window.resolveNorthwatchSiege) window.resolveNorthwatchSiege('siege_broken');
    }

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

    // Only check for ACTIVE enemies — a fled enemy (markFled, above) counts
    // the same as a dead one here: it's not coming back to this fight, so
    // it shouldn't be able to permanently block resolution. A merely
    // `disengaged` one (the no-credit "both sides gave up searching"
    // timeout, resolveNoVisibleTargetAI) is excluded too, for the same
    // reason: it's not an active combatant anymore either, even though
    // nobody "won" against it specifically — without this, a fight could
    // correctly stop chasing (the AI fix) yet still never be reported as
    // over, since a disengaged-but-technically-alive entity would go on
    // blocking this check forever.
    const aliveEnemies = window.entities.filter(e => e.side === 'enemy' && e.alive && !e.fled && !e.disengaged);
    console.log(`[ARENA] checkCombatEnd â€” isInArena=${window.isInArena} aliveEnemies=${aliveEnemies.length} totalEntities=${window.entities.length}`);
    if (aliveEnemies.length > 0) console.log('[ARENA] checkCombatEnd: enemies still alive, no transition');
    if (!window.entities.some(e => e.side === 'enemy' && e.alive && !e.fled && !e.disengaged)) {
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
        // too), accepted for the same reason it was there. Winning the sally
        // no longer resolves the siege instantly — it's one bounded input
        // into the ongoing siegeState simulation (see applySiegePressure
        // below): destroying the engine removes the attackers' main
        // pressure source, but the fort only actually falls or holds once
        // siegeState.pressure crosses a threshold via its own drift/tick.
        if (window.currentCampaign === "2" && window.borderWarSallyActive) {
            window.borderWarSallyActive = false;
            if (window.siegeState) {
                window.siegeState.siegeEngineAlive = false;
                if (window.applySiegePressure) window.applySiegePressure(-15, "The siege engine splinters into wreckage!");
            }
            // UNFORGIVABLE ACT (greenskin side): destroying their siege
            // equipment (or, once one exists, their warband leader). Inert
            // today — no entity yet carries factionTag 'greenskin_assault'
            // (the escorts spawned by startNorthwatchSally are still plain
            // side:'enemy', always hostile to the player from the start) —
            // this becomes live the moment a future undercover-with-the-
            // goblins path spawns escorts as neutral, provisional allies
            // instead, with no other change needed here.
            if (window.setFactionHostileToPlayer) {
                window.setFactionHostileToPlayer('greenskin_assault', "The warband turns on you — you've broken faith with them!");
            }
            window.isInCombat = false;
            window.gamePhase = 'WAITING';
            window.currentTurnEntity = null;
            if (window.updateActionButtons) window.updateActionButtons();
            if (window.updateTurnIndicator) window.updateTurnIndicator();
        }

        // The Vessel-Seeker's Crypt: same "all enemies dead" gate every
        // other Campaign 2 scripted fight resolves through (same known
        // limitation as the border_war/Hollowmere branches above — any
        // unrelated alive enemy elsewhere on the map blocks this check too,
        // accepted for the same reason it's accepted there).
        if (window.currentCampaign === "2") {
            const huntQuest = (window.questLog || []).find(q => q.id === 'necromancer_hunt');
            if (huntQuest?.status === 'active' && !window.entities.some(e => e.isNecromancerBoss && e.alive)) {
                huntQuest.status = 'completed';
                window.necromancerDefeated = true;
                window.necromancerDefeatedAt = window.worldSeconds;
                if (window.factions?.necromancer_cult) window.adjustReputation(window.factions.necromancer_cult, -40, 25);
                if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 10);
                window.party[0].gold = (window.party[0].gold || 0) + 100;
                if (window.gainExp) window.gainExp(500);
                window.showMessage("Malachar crumbles to ash and old bone — whatever it was building toward, it ends here. (+100 gold, quest complete: The Vessel-Seeker's Crypt)");
            }
        }

        // The Barrow of Corvin Ashgrave: resolves once Ashgrave is dead AND the
        // phylactery core has been dealt with first (destroyed or bound) —
        // killed with the phylactery still intact, he "dies" but doesn't
        // actually resolve the quest (see readLichPhylacteryCoreNote,
        // campaign2World.js), nudging the player back to find it.
        if (window.currentCampaign === "2") {
            const lichQuest = (window.questLog || []).find(q => q.id === 'necromancer_lichdom');
            const marrowDead = !window.entities.some(e => e.isLichBoss && e.alive);
            if (lichQuest?.status === 'active' && marrowDead) {
                if (!window.lichPhylacteryDestroyed && !window.lichPhylacteryBound) {
                    window.showMessage("Ashgrave's body collapses — but the shard you never found is still out there, humming. He isn't done.");
                } else {
                    lichQuest.status = 'completed';
                    lichQuest.resolution = window.lichPhylacteryBound ? 'claimed' : 'destroyed';
                    if (window.factions?.necromancer_cult) window.adjustReputation(window.factions.necromancer_cult, -50, 30);
                    if (window.adjustRegionStat) window.adjustRegionStat('hollowmere', 'security', 15);
                    window.party[0].gold = (window.party[0].gold || 0) + 200;
                    if (window.gainExp) window.gainExp(900);
                    window.showMessage(window.lichPhylacteryBound
                        ? "Corvin Ashgrave crumbles for good this time — and whatever kept him standing settles into you instead. (+200 gold, quest complete: The Barrow of Corvin Ashgrave)"
                        : "Corvin Ashgrave crumbles for good this time, with nothing left to hold him together. (+200 gold, quest complete: The Barrow of Corvin Ashgrave)");
                }
            }
        }

        if (window.currentCampaign === "1" && window.isInArena) {
            window.isInArena = false;
            window.arenaScenario = null;
            window.triggerAmbientDialogue('arena_victory');
            grantArenaVictoryReward();

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

    // A shove is a forced reposition, not a real climb — it must not let a
    // target be knocked up onto (or down off) a climbable wall for free.
    const newTerrain = window.getTerrainAt(newHex.q, newHex.r);
    if (newTerrain.impassable || !!newTerrain.elevated !== !!targetTerrain.elevated) {
        window.showMessage(`${target.name} braces against the wall — the shove can't force them up or down it.`);
        spendTP(shover, 5);
        window.playerAction = null;
        return true;
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

// Ends the current arena fight outside the normal "all enemies dead" gate
// (checkCombatEnd) — used by scenario objectives that can resolve before
// (flag captured/held) or without (flag rushed past) every enemy dying.
// `won` controls flavor only; loot/XP for a clean kill still comes through
// checkCombatEnd as before for scenarios that don't call this early.
// A flat completion bonus for winning an arena fight as a whole, on top of
// whatever per-kill XP/gold was earned along the way (handleLethalDamage) —
// previously there was no reward at all for the win itself, so a scenario
// like flag defense (which can be won without killing everyone, or even
// without landing a single kill) could pay out nothing. Scales gently with
// roguelikeData.fightsCompleted, the same progress counter arena spawn
// difficulty already scales off of (see getAllValidSpawnHexes/startArenaFight).
function grantArenaVictoryReward() {
    const fightsCompleted = window.roguelikeData?.fightsCompleted || 1;
    const gold = 25 + fightsCompleted * 5;
    const exp = 40 + fightsCompleted * 10;
    const player = window.party?.[0];
    if (player) player.gold = (player.gold || 0) + gold;
    if (window.gainExp) window.gainExp(exp);
    window.showMessage(`Arena victory! (+${gold} gold, +${exp} exp)`);
}
window.grantArenaVictoryReward = grantArenaVictoryReward;

function endArenaScenario(won, message) {
    if (!window.isInArena) return;
    window.isInArena = false;
    window.arenaScenario = null;
    window.isInCombat = false;
    window.gamePhase = 'WAITING';
    window.currentTurnEntity = null;
    if (message) window.showMessage(message);
    if (won) grantArenaVictoryReward();
    window.triggerAmbientDialogue(won ? 'arena_victory' : 'arena_fight_start');
    if (window.stopAllMusic) window.stopAllMusic(0.8);
    if (window.updateActionButtons) window.updateActionButtons();
    if (window.updateTurnIndicator) window.updateTurnIndicator();
    setTimeout(() => {
        setupArenaLobby();
        window.drawMap();
        window.renderEntities();
        const firstPlayer = window.entities.find(e => e.side === 'player' && !e.rider);
        if (firstPlayer) window.centerCameraOn(firstPlayer.hex);
        if (window.updateActionButtons) window.updateActionButtons();
    }, 2000);
}
window.endArenaScenario = endArenaScenario;

// Per-player-turn arena scenario objective check — called from
// finalizePlayerAction right alongside the existing turnsElapsed counter.
// Handles the objectives that can't be expressed as "all enemies dead"
// (checkCombatEnd's existing gate): flag defense's turn-timer/flag-reached
// win-loss, and the periodic lava flood's toggle + damage tick.
function tickArenaScenario() {
    const s = window.arenaScenario;
    if (!s || !window.isInArena) return;

    if (s.type === 'flag_defend' && s.flagHex) {
        const attackerOnFlag = window.entities.some(e => e.side === 'enemy' && e.alive && e.hex.q === s.flagHex.q && e.hex.r === s.flagHex.r);
        if (attackerOnFlag) {
            endArenaScenario(false, "The flag falls — the line is broken!");
            return;
        }
        if (s.turnsToHold && s.turnsElapsed >= s.turnsToHold) {
            endArenaScenario(true, "You held the line! The flag stands.");
            return;
        }
    }

    if (s.type === 'flag_attack' && s.flagHex) {
        const playerOnFlag = window.entities.some(e => e.side === 'player' && e.alive && e.hex.q === s.flagHex.q && e.hex.r === s.flagHex.r);
        if (playerOnFlag) {
            endArenaScenario(true, "The flag is yours!");
            return;
        }
    }

    if (s.type === 'lava_flood' && s.lavaHexes && s.lavaHexes.length > 0) {
        if (s.turnsElapsed > 0 && s.turnsElapsed % s.floodInterval === 0 && s._lastFloodToggleTurn !== s.turnsElapsed) {
            s._lastFloodToggleTurn = s.turnsElapsed;
            s.flooded = !s.flooded;
            window.showMessage(s.flooded ? "Molten rock surges up through the cracks!" : "The lava recedes, hissing as it cools.");
        }
        if (s.flooded) {
            const lavaKeys = new Set(s.lavaHexes.map(h => `${h.q},${h.r}`));
            window.entities.forEach(e => {
                if (!e.alive) return;
                if (!lavaKeys.has(`${e.hex.q},${e.hex.r}`)) return;
                e.hp -= 8;
                if (e.hp <= 0 && e.alive) {
                    // Lava has no attacker of its own — pass a neutral
                    // stand-in so handleLethalDamage's attacker.side reads
                    // don't throw; environmental deaths shouldn't count as
                    // a player kill for ROGUELIKE reward-tracking either.
                    handleLethalDamage(e, { side: 'environment' });
                }
            });
            checkCombatEnd();
        }
    }
}
window.tickArenaScenario = tickArenaScenario;

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

    // ARENA SCENARIO: a small, growing set of alternate objectives/shapes
    // layered on top of the default "clear the field" fight (see the plan's
    // "Arena scenario variety" section). Only 'void_bridge' is wired so far
    // (a positional/ranged-duel map shape — needs no new win/loss logic,
    // checkCombatEnd's existing "all enemies dead" gate still applies).
    // More types land here over time; each gets its own isXArena roll below
    // and, if it needs a real objective (not just a map shape), its own
    // read of window.arenaScenario in checkCombatEnd.
    const scenarioRoll = Math.random();
    let scenarioType = 'standard';
    if (scenarioRoll < 0.06) scenarioType = 'void_bridge';
    else if (scenarioRoll < 0.12) scenarioType = 'ranged_standoff';
    else if (scenarioRoll < 0.18) scenarioType = 'tunnel_boss';
    else if (scenarioRoll < 0.24) scenarioType = 'flag_defend';
    else if (scenarioRoll < 0.30) scenarioType = 'flag_attack';
    else if (scenarioRoll < 0.36) scenarioType = 'lava_flood';
    else if (scenarioRoll < 0.40) scenarioType = 'three_way';
    window.arenaScenario = { type: scenarioType, turnsElapsed: 0 };

    const isVoidBridgeArena = scenarioType === 'void_bridge';
    const isTunnelBossArena = scenarioType === 'tunnel_boss';
    const isLavaFloodArena = scenarioType === 'lava_flood';

    const isWaterArena = scenarioType === 'standard' && Math.random() < 0.3;
    const isPedestalArena = scenarioType === 'standard' && Math.random() < 0.4;
    const isFoliageArena = scenarioType === 'standard' && !isIndoor && Math.random() < 0.5;

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

                 if (isVoidBridgeArena) {
                     // A narrow floor bridge (width 3, |r|<=1) crossing a
                     // sea of Void — everything off the bridge is impassable
                     // but still fully visible/shootable-through, so ranged
                     // combat across the gap is the whole point of the map.
                     tType = (!isBoundaryRing && Math.abs(r) <= 1) ? 'Cave Floor' : 'Void';
                 } else if (isTunnelBossArena) {
                     // A long, narrow east-west corridor (width 3). Enemies
                     // spaced along it spawn aiState:'idle' and wake via the
                     // existing seen-wakes-idle mechanic as the player
                     // advances — no new trigger system needed.
                     tType = (!isBoundaryRing && Math.abs(r) <= 1 && q >= -arenaSize + 2) ? 'Cave Floor' : 'Wall';
                 } else if (isLavaFloodArena) {
                     tType = 'Cave Floor';
                     if (!isBoundaryRing) {
                         const lavaNoise = Math.abs(Math.sin(q * 0.25 + r * 0.2));
                         if (lavaNoise > 0.78) tType = 'Lava';
                         else if (lavaNoise > 0.68) tType = 'High Ground';
                     }
                 } else {
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
                 }

                 if (isBoundaryRing) tType = 'Wall';

                 window.setTerrainAt(q, r, tType);

                 if (isLavaFloodArena && tType === 'Lava') {
                     window.arenaScenario.lavaHexes = window.arenaScenario.lavaHexes || [];
                     window.arenaScenario.lavaHexes.push({ q, r });
                 }

                 if (isIndoor && Math.random() < 0.02 && tType === 'Cave Floor') {
                     window.tileObjects[`${q},${r}`] = { type: 'fireplace', lightRadius: 10 };
                 }
            }
        }
    }

    if (isLavaFloodArena) {
        // Toggled by tickArenaScenario on the turn counter (finalizePlayerAction) —
        // a periodic on/off flood, not a one-shot event.
        window.arenaScenario.floodInterval = 6;
        window.arenaScenario.flooded = false;
    }

    // Carve a handful of ring-shaped ruin structures — wall rings with 2-3
    // gaps left as doorways — so the arena has actual chokepoints and cover
    // to fight around instead of being one flat open field. Left as plain
    // hex rings (not full rectangles) since that's cheap to compute on a hex
    // grid and still reads as "a ruined room" once walls block LOS/movement.
    // Skipped entirely for the void-bridge scenario — a wall ring dropped
    // onto a narrow bridge would just wall off the bridge itself.
    const numStructures = (isVoidBridgeArena || isTunnelBossArena) ? 0 : 3 + Math.floor(Math.random() * 3); // 3-5
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
                        terrain.name !== 'Pedestal' && terrain.name !== 'Void' && terrain.name !== 'Lava' && !window.getEntityAtHex(h.q, h.r)) {
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
                        terrain.name !== 'Pedestal' && terrain.name !== 'Void' && terrain.name !== 'Lava' && !window.getEntityAtHex(h.q, h.r)) {
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

    // FLAG DEFENSE (player holds): the flag sits right behind the party's
    // own base — win by surviving turnsToHold turns; lose the instant an
    // attacker reaches it (checked by tickArenaScenario, called from
    // finalizePlayerAction's per-turn hook).
    if (scenarioType === 'flag_defend') {
        const flagHex = findSafeHex(partyBase.q + 2, partyBase.r, 4);
        window.arenaScenario.flagHex = flagHex;
        window.arenaScenario.turnsToHold = 15;
        window.tileObjects[`${flagHex.q},${flagHex.r}`] = { type: 'flag', friendly: true };
    }
    // FLAG DEFENSE (player attacks): the flag is posted deep in enemy
    // territory, defended by guards spawned near it below (see the normal
    // encounter spawn section) — win by reaching it.
    if (scenarioType === 'flag_attack') {
        const flagHex = findSafeHex(arenaSize - 8, 0, 6);
        window.arenaScenario.flagHex = flagHex;
        window.tileObjects[`${flagHex.q},${flagHex.r}`] = { type: 'flag', friendly: false };
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
                    // flag_defend's flag sits only 2 hexes from the party's own
                    // base (see below) — without this exclusion, an enemy could
                    // spawn directly on (or immediately adjacent to) the flag,
                    // idle and never-seen, and satisfy the loss condition
                    // (tickArenaScenario) before the player ever spots it or it
                    // takes a single turn. Excluding a small radius around the
                    // flag the same way spawns already avoid the player forces
                    // every attacker to actually approach and be seen first.
                    // Only applies to flag_defend — flag_attack deliberately
                    // posts guards near its own flag, defending it.
                    const flagHex = window.arenaScenario?.type === 'flag_defend' ? window.arenaScenario.flagHex : null;
                    const nearFlag = flagHex && window.distance(flagHex, hex) < 4;
                    if (!nearPlayer && !nearFlag) {
                        valid.push(hex);
                    }
                }
            }
        }
        return valid;
    };

    const validHexes = getAllValidSpawnHexes();
    let lastSpawnHex = validHexes.length > 0 ? validHexes[Math.floor(Math.random() * validHexes.length)] : { q: 0, r: 0 };

    // TUNNEL + BOSS: the corridor carve above already confines validHexes to
    // the tunnel itself (everything off it is Wall), so a normal encounter
    // roll already reads as "enemies spaced down the corridor" for free —
    // they spawn aiState:'idle' and wake via the existing seen-wakes-idle
    // mechanic (gameEngine.js) as the player advances. The one deliberate
    // override: force the boss to wait at the tunnel's far end instead of a
    // random valid hex.
    if (isTunnelBossArena) {
        lastSpawnHex = findSafeHex(arenaSize - 4, 0, 6);
    }

    // BOSS ENCOUNTER (15% chance if any bosses remain, guaranteed for tunnel_boss)
    const bossesDefeated = window.roguelikeData.bossesDefeated || [];
    const availableBosses = Object.keys(arenaBosses).filter(name => !bossesDefeated.includes(name));

    if (availableBosses.length > 0 && (isTunnelBossArena || Math.random() < 0.15)) {
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
                let avgPartyLevel = window.party.reduce((sum, c) => sum + c.level, 0) / window.party.length;
                if (window.difficultyMode === 'easy') avgPartyLevel = Math.round(avgPartyLevel * 0.75);
                const bonusLevels = Math.floor(avgPartyLevel / 3);
                if (window.applyClassLevelScaling) window.applyClassLevelScaling(m, bonusLevels);
            }

            // FORTIFIED RANGED STANDOFF: content-only — a bow-armed humanoid
            // already shoots from range and only closes distance when a
            // target's out of it (see aiProcess's existing attackRange/
            // huntTargetHex logic), so "hold ground, shoot in range" needs
            // no new mechanic, just equipping the pool with bows.
            if (scenarioType === 'ranged_standoff' && m.tags?.includes('humanoid') && window.equipToMonster) {
                window.equipToMonster(m, 'bow');
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

    // THREE-WAY HOSTILE PARTIES (scoped): a second monster group, tagged
    // side:'enemy' as usual (so every existing "is this hostile to the
    // player" check keeps working unmodified) plus rivalGroup:true, which
    // the isOpponent patch above uses to make the two groups fight each
    // other too. Spawned away from the main pool so it reads as a rival
    // warband, not the same encounter.
    if (scenarioType === 'three_way') {
        const rivalTypes = ARENA_MONSTER_POOL.filter(t => t !== 'skeleton' && t !== 'zombie');
        const rivalBase = findSafeHex(arenaSize - 8, arenaSize - 8, 8);
        for (let i = 0; i < 4; i++) {
            const type = rivalTypes[Math.floor(Math.random() * rivalTypes.length)];
            const neighbors = window.getNeighbors(rivalBase.q, rivalBase.r);
            const spawnHex = i === 0 ? rivalBase : (neighbors.find(h => !getEntityAtHex(h.q, h.r) && window.getTerrainAt(h.q, h.r).name !== 'Wall') || rivalBase);
            const rival = window.createMonster(type, spawnHex, null, null, 'enemy');
            rival.rivalGroup = true;
            rival.aiState = 'idle';
            window.entities.push(rival);
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
        // Defensive guard (the UI dropdown already hides this option
        // otherwise, see updateSpellPreview in ui.js) — a unicorn can only
        // ever be summoned as THE permanent animal companion, granted by
        // the druid grove questline, never as an ordinary temporary summon.
        if (spell.animalId === 'unicorn' && !(caster.skills?.learn_unicorn_summon && caster.skills?.animal_companion && !caster.animalCompanion)) {
            window.showMessage("The unicorn does not answer this call.");
            return false;
        }
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
    } else if (spell.type === 'aoe_heal') {
        // BURST heal (skills.js's <school>_burst): the same hex-burst shape
        // as aoe_damage below, but restores every ally caught in it instead
        // of damaging opponents — a caster's own single-target Heal (or any
        // other school's heal spell) converted into an area effect.
        const center = clickedHex;
        const radius = spell.radius || 0;
        const affected = [center];
        if (radius > 0) {
            for (let q = -radius; q <= radius; q++) {
                for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
                    if (q === 0 && r === 0) continue;
                    const h = { q: center.q + q, r: center.r + r };
                    if (window.isHexInBounds(h)) affected.push(h);
                }
            }
        }
        affected.forEach(h => {
            const t = getEntityAtHex(h.q, h.r);
            if (t && t.alive && t.side === caster.side) {
                t.hp = Math.min(t.maxHp, t.hp + spell.magnitude);
                if (window.spawnFloatingText) window.spawnFloatingText(t.hex, `+${spell.magnitude}`, '#5cff5c');
                if (t.unconscious && t.hp > 0) {
                    t.unconscious = false;
                    window.showMessage(`${t.name} regains consciousness!`);
                }
                syncBackToPlayer(t);
            }
        });
        window.showMessage(`${caster.name} unleashes ${spell.name}!`);
        actionHandled = true;
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
        // FIRE ON WORLD OBJECTS: a firebolt reaching an unlit campfire lights
        // it from range (no torch/TP needed, unlike the hands-on toggle in
        // interactWithTileObject); one hitting an oil barrel sets it off.
        // Checked ahead of the normal entity-only damage dispatch below,
        // since these don't need a living target to react to fire.
        if (spell.type === 'damage' && spell.baseId === 'firebolt' && clickedHex) {
            const worldObj = window.tileObjects[`${clickedHex.q},${clickedHex.r}`];
            if (worldObj?.type === 'fireplace' && worldObj.lit === false) {
                worldObj.lit = true;
                if (window.invalidateTileLightsCache) window.invalidateTileLightsCache();
                window.showMessage(`${caster.name}'s firebolt catches the campfire alight!`);
                window.drawMap(); window.renderEntities();
                return true;
            }
            if (worldObj?.type === 'oil_barrel') {
                explodeOilBarrel(clickedHex.q, clickedHex.r, caster);
                return true;
            }
        }

        let spellHitBonus = 0;
        if (spell.baseId === 'firebolt' && caster.skills?.firebolt_hit) spellHitBonus = caster.skills.firebolt_hit * 5;

        let hitChance = 50 + (caster.toHitSpell || 0) + spellHitBonus - (target ? target.passiveDodge : 0);
        
        // COVER: behind any elevated terrain (pedestals, fort ramparts)
        if (target && spell.baseId === 'firebolt' && window.isCoveredFromRangedAttack(target)) {
            window.showMessage(`${target.name} has cover (Cover bonus: -15 hit)`);
            hitChance -= 15;
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
        } else if (spell.baseId === 'calm_animal' && target) {
            // Redirects onto the mount itself when cast at a rider — the
            // mount is what's actually being calmed, not the person riding
            // it. resolveCalmAnimalTarget also enforces the tag gate
            // (genuine 'animal'-tagged creatures only, excluding
            // Unicorn/dragon even though Unicorn also carries 'animal').
            const calmed = window.resolveCalmAnimalTarget(target);
            if (!calmed) {
                window.showMessage(`${spell.name} has no effect on ${target.name}!`);
            } else {
                const instanceId = Date.now() + Math.random();
                window.activeSpells.push({
                    spellInstanceId: instanceId, baseId: spell.baseId, name: spell.name, casterName: caster.name,
                    coreManaCost: spell.coreManaCost || spell.manaCost, targetEntityId: calmed.id,
                    debuffType: spell.debuffType, calmMode: spell.calmMode || 'stay',
                });
                window.showMessage(`${caster.name} calms ${calmed.name} (${spell.calmMode || 'stay'}).`);
            }
            actionHandled = true;
        } else if (spell.baseId === 'wild_fury' && target) {
            // Only the caster or their own animal companion — never another
            // ally, even one standing right next to you.
            if (target !== caster && target !== caster.animalCompanion) {
                window.showMessage(`${spell.name} can only target yourself or your own animal companion!`);
            } else {
                const instanceId = Date.now() + Math.random();
                window.activeSpells.push({
                    spellInstanceId: instanceId, baseId: spell.baseId, name: spell.name, casterName: caster.name,
                    coreManaCost: spell.coreManaCost || spell.manaCost, targetEntityId: target.id,
                    magnitude: spell.magnitude, debuffType: spell.debuffType,
                    ticksRemaining: spell.durationTicks || 200,
                });
                window.showMessage(`${target.name}'s unarmed strikes are charged with wild fury!`);
            }
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

// WARLOCK'S PACT (skills.js's blood_magic): toggled per-entity, not a
// permanent stance — off by default even once the skill is bought, so a
// player has to deliberately opt in each time they want to burn HP for
// mana rather than it silently kicking in the first time they're short.
function toggleBloodMagic(entity) {
    if (!entity.skills?.blood_magic) return;
    entity.bloodMagicActive = !entity.bloodMagicActive;
    window.showMessage(`${entity.name} ${entity.bloodMagicActive ? 'embraces' : 'sets aside'} the blood pact.`);
}
window.toggleBloodMagic = toggleBloodMagic;

// Whether `caster` can pay `totalCost` mana for a cast, and how much HP
// that would take if the shortfall has to come out of Blood Magic. Kept
// as a query (no mutation) so both the click-handler's affordability gate
// and the actual payment below read the exact same numbers.
function getSpellCastAffordability(caster, totalCost) {
    const manaShort = Math.max(0, totalCost - (caster.currentMana || 0));
    if (manaShort === 0) return { affordable: true, hpCost: 0 };
    if (!caster.bloodMagicActive) return { affordable: false, hpCost: 0 };
    const hpCost = manaShort * 2;
    return { affordable: (caster.hp - hpCost) >= 1, hpCost };
}
window.getSpellCastAffordability = getSpellCastAffordability;

function paySpellCost(caster, totalCost) {
    const { hpCost } = getSpellCastAffordability(caster, totalCost);
    caster.currentMana -= Math.min(caster.currentMana || 0, totalCost);
    if (hpCost > 0) {
        caster.hp -= hpCost;
        syncBackToPlayer(caster);
        sharedMessage(`${caster.name} pays the blood price! (-${hpCost} HP)`);
    }
}
window.paySpellCost = paySpellCost;

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
    paySpellCost(caster, spell.manaCost + getArmorSpellPenalty(caster, spell));
    // SUBTLE SPELL (skills.js's subtle_spell, rogue tree): a spell built
    // Subtle doesn't break stealth — never available for damage/aoe_damage
    // in the first place (ui.js's spell builder gates it), so this can't
    // be used to land an unseen hit.
    if (caster.isStealthed && !spell.subtle) breakStealth(caster);
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
