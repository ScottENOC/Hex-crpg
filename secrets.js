// secrets.js
// Secret doors and other hidden objects, detected the same way a stealthed
// character is spotted (see hasLineOfSightUncached's stealth check,
// gameEngine.js) — a per-visible-hex roll against a concealment score,
// boosted by the viewer's own keen_perception (skills.js), rather than a
// separate "search" command. Both hidden types below sit on ordinary
// terrain with a tileObject type the render loop doesn't recognize, so
// they draw as nothing at all — indistinguishable from a plain wall or
// floor tile — until discovered.

// Shared roll, used by both hidden types below. A cooldown (not a
// one-shot flag) keeps a still-undiscovered object from being re-rolled
// every single tick spent standing right next to it (which would make
// concealment meaningless — eventually guaranteed on a long enough
// stand), while still giving a fresh roll if the party leaves and comes
// back later, or a different, more perceptive party member happens by.
function rollSecretSpot(viewer, hex, obj) {
    const now = window.worldSeconds || 0;
    if (obj.nextAttemptAt && now < obj.nextAttemptAt) return false;
    obj.nextAttemptAt = now + 600; // 10 in-game minutes before another roll near the same spot

    const d = window.distance(viewer.hex, hex);
    const distBonus = Math.max(0, (10 - d) * 5); // easier the closer you actually are, same shape as the stealth spot check
    const perceptionBonus = (viewer.skills?.keen_perception || 0) * 10;
    const concealment = obj.concealment !== undefined ? obj.concealment : 70;
    const spotChance = Math.max(5, 100 - concealment + distBonus + perceptionBonus);
    return Math.random() * 100 < spotChance;
}

// Called once per visible hex per party member, from updateExploration
// (hexMap.js) — same cadence ensureWildernessResourceNode already uses for
// lazily-generated wilderness nodes.
function checkSecretDoorDiscovery(viewer, hex) {
    const key = `${hex.q},${hex.r}`;
    const obj = window.tileObjects && window.tileObjects[key];
    if (!obj || obj.discovered) return;

    if (obj.type === 'secret_door') {
        if (!rollSecretSpot(viewer, hex, obj)) return;
        obj.discovered = true;
        // Converts into a completely normal door_closed tileObject
        // (closedTerrain/openTerrain/etc.), so toggleDoor/attackDoor work
        // on it immediately with no special-casing of their own.
        window.tileObjects[key] = {
            type: 'door_closed', lightRadius: 0, locked: false,
            hp: 20, maxHp: 20,
            closedTerrain: obj.closedTerrain || 'Wall',
            openTerrain: obj.openTerrain || 'Wood Floor'
        };
        window.showMessage(obj.discoveryMessage || `${viewer.name} notices a hidden door in the wall!`);
        if (window.drawMap) window.drawMap();
    } else if (obj.type === 'secret_stash') {
        if (!rollSecretSpot(viewer, hex, obj)) return;
        obj.discovered = true;
        // A one-time find, not a container to reopen — the loot transfers
        // straight to the shared party inventory (partyInventory.js) the
        // moment it's spotted, same "no separate lootable object" shape
        // handleLethalDamage already uses for a dead monster's carried gold.
        const player = window.party && window.party[0];
        if (player) {
            player.gold = (player.gold || 0) + (obj.gold || 0);
            (obj.items || []).forEach(id => player.inventory.push(id));
        }
        delete window.tileObjects[key];
        const itemNames = (obj.items || []).map(id => window.items[id]?.name || id);
        const lootDesc = [obj.gold ? `${obj.gold} gold` : null, ...itemNames].filter(Boolean).join(', ');
        window.showMessage(obj.discoveryMessage || `${viewer.name} finds a hidden stash! (${lootDesc})`);
        if (window.drawMap) window.drawMap();
    }
}
window.checkSecretDoorDiscovery = checkSecretDoorDiscovery;

// Places a secret door: terrain is set to closedTerrain immediately (looks
// like ordinary wall right away), the tileObject stays invisible to the
// render loop until checkSecretDoorDiscovery flips it to a real door.
function placeSecretDoor(q, r, opts = {}) {
    window.setTerrainAt(q, r, opts.closedTerrain || 'Wall');
    window.tileObjects[`${q},${r}`] = {
        type: 'secret_door',
        concealment: opts.concealment !== undefined ? opts.concealment : 70,
        closedTerrain: opts.closedTerrain || 'Wall',
        openTerrain: opts.openTerrain || 'Wood Floor',
        discoveryMessage: opts.discoveryMessage || null,
        discovered: false,
        nextAttemptAt: 0
    };
}
window.placeSecretDoor = placeSecretDoor;

// Places a hidden stash — no terrain change (it hides on ordinary floor,
// under a floorboard/behind a loose stone, not in a wall), just an
// invisible-until-found tileObject holding gold and/or item ids.
function placeSecretStash(q, r, opts = {}) {
    window.tileObjects[`${q},${r}`] = {
        type: 'secret_stash',
        concealment: opts.concealment !== undefined ? opts.concealment : 70,
        gold: opts.gold || 0,
        items: opts.items || [],
        discoveryMessage: opts.discoveryMessage || null,
        discovered: false,
        nextAttemptAt: 0
    };
}
window.placeSecretStash = placeSecretStash;
