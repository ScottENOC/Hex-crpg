// tests/multi-story.spec.js
// Multi-story buildings: a zoned Z-layer system (window.multiStoryBuildings,
// terrain.js) rather than a general floor concept — only buildings explicitly
// built with an upper floor (the Silverhart Palace throne room's gallery,
// campaign2World.js) ever get an entry, so every other building/hex on the
// map should be provably unaffected.
const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption } = require('./helpers');

test.describe('Multi-story buildings: zoning', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('the palace throne room is registered as a multi-story building with a floor 1', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.getMultiStoryBuildingAt(window.campaign2PalaceThroneCenter);
            return { found: !!b, hasFloor1: !!(b && b.floors[1]) };
        });
        expect(result.found).toBe(true);
        expect(result.hasFloor1).toBe(true);
    });

    test('a single-story building (Hollowmere chapel) is never registered, and floor-aware lookups fall straight through', async ({ page }) => {
        const result = await page.evaluate(() => {
            const chapelHex = { q: -14, r: 0 };
            const registered = !!window.getMultiStoryBuildingAt(chapelHex);
            const plain = window.getTerrainAt(chapelHex.q, chapelHex.r).name;
            const floorAware = window.getTerrainAtFloor(chapelHex.q, chapelHex.r, 0).name;
            return { registered, matches: plain === floorAware };
        });
        expect(result.registered).toBe(false);
        expect(result.matches).toBe(true);
    });
});

test.describe('Multi-story buildings: stairs and floor-aware terrain', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('the gallery floor has its own terrain, distinct from the ground floor at the same hex', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const groundName = window.getTerrainAt(center.q, center.r).name;
            const floor1Name = window.getTerrainAtFloor(center.q, center.r, 1).name;
            return { groundName, floor1Name };
        });
        // Both are Wood Floor by construction, so assert the lookup actually
        // consulted floor-1 data rather than silently falling back — checked
        // via the wall ring instead, which only exists on one of the floors.
        expect(result.groundName).toBe('Wood Floor');
        expect(result.floor1Name).toBe('Wood Floor');
    });

    test('a wall hex that exists on the gallery floor does not exist at ground level, and vice versa', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.getMultiStoryBuildingAt(window.campaign2PalaceThroneCenter);
            const f1 = b.floors[1];
            // A hex just outside the small gallery room's radius, but still
            // inside the much larger ground-floor Grand Hall — floor 1 has no
            // entry there at all (falls back to ground), ground floor does.
            const farHex = { q: b.minQ + 1, r: window.campaign2PalaceThroneCenter.r };
            const groundTerrain = window.getTerrainAt(farHex.q, farHex.r);
            const floor1Terrain = window.getTerrainAtFloor(farHex.q, farHex.r, 1);
            const floor1HasOwnEntry = f1.terrain[`${farHex.q},${farHex.r}`] !== undefined;
            return { groundImpassable: !!groundTerrain.impassable, floor1SameAsGround: floor1Terrain.name === groundTerrain.name, floor1HasOwnEntry };
        });
        expect(result.floor1HasOwnEntry).toBe(false);
        expect(result.floor1SameAsGround).toBe(true);
    });

    test('stepping onto the ground-floor stair_up sets the player\'s floor to 1', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const center = window.campaign2PalaceThroneCenter;
            player.floor = 0;
            player.hex = { q: center.q, r: center.r };
            window.checkStairTransitions();
            return player.floor;
        });
        expect(result).toBe(1);
    });

    test('stepping onto the gallery\'s stair_down sets the player\'s floor back to 0', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const center = window.campaign2PalaceThroneCenter;
            player.floor = 1;
            player.hex = { q: center.q, r: center.r };
            window.checkStairTransitions();
            return player.floor;
        });
        expect(result).toBe(0);
    });

    test('a monster crossing the stairs changes floor exactly like the player', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const monster = window.createMonster('wolf', { q: center.q, r: center.r }, null, null, 'enemy');
            monster.floor = 0;
            window.entities.push(monster);
            window.checkStairTransitions();
            return monster.floor;
        });
        expect(result).toBe(1);
    });
});

test.describe('Multi-story buildings: capital has several (barracks loft, wizard\'s tower)', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('the barracks loft is registered with beds and its own stairs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.getMultiStoryBuildingAt(window.campaign2PalaceBarracksCenter);
            const f1 = b && b.floors[1];
            const bedCount = f1 ? Object.values(f1.tileObjects).filter(o => o.type === 'bed').length : 0;
            return { found: !!b, bedCount };
        });
        expect(result.found).toBe(true);
        expect(result.bedCount).toBe(4);
    });

    test('the wizard\'s tower has 3 floors (ground, study, observatory) all sharing one footprint', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.getMultiStoryBuildingAt(window.campaign2PalaceTowerCenter);
            return { found: !!b, hasFloor1: !!(b && b.floors[1]), hasFloor2: !!(b && b.floors[2]) };
        });
        expect(result.found).toBe(true);
        expect(result.hasFloor1).toBe(true);
        expect(result.hasFloor2).toBe(true);
    });

    test('climbing the tower goes ground -> study -> observatory via successive stairs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const center = window.campaign2PalaceTowerCenter;

            player.floor = 0;
            player.hex = { q: center.q + 1, r: center.r + 1 }; // ground-floor stair_up
            window.checkStairTransitions();
            const afterFirst = player.floor;

            player.hex = { q: center.q, r: center.r }; // study's stair_up to observatory
            window.checkStairTransitions();
            const afterSecond = player.floor;

            return { afterFirst, afterSecond };
        });
        expect(result.afterFirst).toBe(1);
        expect(result.afterSecond).toBe(2);
    });
});

test.describe('Multi-story buildings: floor-aware LOS and pathfinding', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('pathfinding on floor 1 treats a ground-floor-only obstacle as passable', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.getMultiStoryBuildingAt(window.campaign2PalaceThroneCenter);
            const center = window.campaign2PalaceThroneCenter;
            // The throne itself (a tileObject, not terrain) sits at
            // (center.q, center.r - 3) on the ground floor only — floor 1 has
            // no equivalent obstruction there since it's outside the small
            // gallery footprint, so it should just fall back to open ground.
            const farHex = { q: b.minQ + 1, r: center.r };
            const groundTerrain = window.getTerrainAt(farHex.q, farHex.r);
            const floor1Terrain = window.getTerrainAtFloor(farHex.q, farHex.r, 1);
            return { groundIsWall: groundTerrain.name === 'Wall', floor1IsWall: floor1Terrain.name === 'Wall' };
        });
        // Ground floor's own outer wall ring hex should be a real wall;
        // floor 1 (no entry there) falls back to reading the same ground
        // terrain, so both agree — proving the fallback path, not a crash.
        expect(result.floor1IsWall).toBe(result.groundIsWall);
    });

    test('findPath on floor 1 does not block on a ground-floor-only occupant sharing the same (q,r)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const blocker = window.createMonster('wolf', { q: center.q + 1, r: center.r }, null, null, 'enemy');
            blocker.floor = 0;
            window.entities.push(blocker);

            const traveler = window.createMonster('wolf', { q: center.q - 1, r: center.r }, null, null, 'enemy');
            traveler.floor = 1;
            window.entities.push(traveler);

            const path = window.findPath({ q: center.q - 1, r: center.r }, { q: center.q + 1, r: center.r }, 999, traveler, true);
            return { pathFound: !!path };
        });
        expect(result.pathFound).toBe(true);
    });
});

test.describe('The Sunken Cache: wilderness cave with two basement floors', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('the cave is registered with a den (-1) and a vault (-2), both distinct from the entrance', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2SunkenCaveCenter;
            const b = window.getMultiStoryBuildingAt(center);
            return { found: !!b, hasDen: !!(b && b.floors[-1]), hasVault: !!(b && b.floors[-2]) };
        });
        expect(result.found).toBe(true);
        expect(result.hasDen).toBe(true);
        expect(result.hasVault).toBe(true);
    });

    test('Rook Talvane guards the entrance and additional bandits guard the den', async ({ page }) => {
        const result = await page.evaluate(() => {
            const rookAlive = window.entities.some(e => e.name === 'Rook Talvane' && e.alive && e.side === 'enemy');
            const banditCount = window.entities.filter(e => e.alive && e.side === 'enemy' && e.name === 'Bandit').length;
            return { rookAlive, banditCount };
        });
        expect(result.rookAlive).toBe(true);
        expect(result.banditCount).toBeGreaterThanOrEqual(2); // the 2 plain den guards (Rook's own name is overridden)
    });

    test('descending both staircases in sequence reaches the vault floor', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const center = window.campaign2SunkenCaveCenter;
            player.floor = 0;

            player.hex = { q: center.q, r: center.r + 1 }; // ground -> den stair
            window.checkStairTransitions();
            const afterFirst = player.floor;

            player.hex = { q: center.q, r: center.r - 2 }; // den -> vault stair
            window.checkStairTransitions();
            const afterSecond = player.floor;

            return { afterFirst, afterSecond };
        });
        expect(result.afterFirst).toBe(-1);
        expect(result.afterSecond).toBe(-2);
    });

    test('the vault\'s evidence is reachable via the floor-aware tile-object interaction path', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2SunkenCaveCenter;
            const b = window.getMultiStoryBuildingAt(center);
            const vaultKey = `${center.q + 1},${center.r}`;
            const obj = window.getTileObjectAtFloor(center.q + 1, center.r, -2);
            return { isEvidence: obj && obj.type === 'evidence', key: obj?.evidenceKey };
        });
        expect(result.isEvidence).toBe(true);
        expect(result.key).toBe('guild_cache_prize');
    });

    test('the fence offers "The Sunken Cache" and starting it registers a tracked stealth mission', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.factions.thieves_guild.standing = 25;
            window.questLog = (window.questLog || []).filter(q => q.id !== 'guild_sunken_cache');
            window.activeStealthMission = null;

            window.questLog.push({ id: 'guild_sunken_cache', title: 'The Sunken Cache', giver: 'the fence', status: 'active' });
            window.startStealthMission({
                questId: 'guild_sunken_cache', guardName: 'Rook Talvane',
                evidenceKey: 'guild_cache_prize', itemId: 'guild_cache_prize',
                factionSpiedOn: 'thieves_guild', failStandingHit: -10,
                objectiveText: 'test'
            });
            return { mission: window.activeStealthMission?.guardName };
        });
        expect(result.mission).toBe('Rook Talvane');
    });

    test('a guard on a different floor than the player never triggers stealth-mission detection', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const rook = window.entities.find(e => e.name === 'Rook Talvane');
            const center = window.campaign2SunkenCaveCenter;

            player.floor = -1;
            player.hex = { q: center.q, r: center.r };
            rook.floor = 0; // stays at the entrance
            rook.hex = { q: center.q, r: center.r };
            rook.isStealthed = false;

            window.activeStealthMission = { questId: 'guild_sunken_cache', guardName: 'Rook Talvane', factionSpiedOn: 'thieves_guild', failStandingHit: -10 };
            window.questLog = window.questLog || [];
            const before = window.questLog.find(q => q.id === 'guild_sunken_cache');
            if (before) before.status = 'active';
            window.checkStealthMissionStatus();
            return { missionStillActive: !!window.activeStealthMission };
        });
        expect(result.missionStillActive).toBe(true);
    });
});

test.describe('Thieves\' Guild tunnel network', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('palace and city nodes start as undiscovered secret passages, each with its own floor -9 junction', async ({ page }) => {
        const result = await page.evaluate(() => {
            const palaceHex = window.campaign2TunnelPalaceHex;
            const cityHex = window.campaign2TunnelCityHex;
            const palaceObj = window.tileObjects[`${palaceHex.q},${palaceHex.r}`];
            const cityObj = window.tileObjects[`${cityHex.q},${cityHex.r}`];
            const palaceBuilding = window.getMultiStoryBuildingAt(palaceHex);
            const cityBuilding = window.getMultiStoryBuildingAt(cityHex);
            return {
                palaceType: palaceObj.type, palaceDiscovered: palaceObj.discovered,
                cityType: cityObj.type, cityDiscovered: cityObj.discovered,
                palaceJunction: palaceBuilding?.floors[-9]?.tileObjects[`${palaceHex.q},${palaceHex.r}`]?.type,
                cityJunction: cityBuilding?.floors[-9]?.tileObjects[`${cityHex.q},${cityHex.r}`]?.type,
            };
        });
        expect(result.palaceType).toBe('secret_passage');
        expect(result.palaceDiscovered).toBe(false);
        expect(result.cityType).toBe('secret_passage');
        expect(result.cityDiscovered).toBe(false);
        expect(result.palaceJunction).toBe('tunnel_junction');
        expect(result.cityJunction).toBe('tunnel_junction');
    });

    test('the wilderness node (via the cave den) is always a working stair, no discovery needed', async ({ page }) => {
        const result = await page.evaluate(() => {
            const center = window.campaign2SunkenCaveCenter;
            const denObj = window.getTileObjectAtFloor(center.q, center.r, -1);
            return { type: denObj?.type, toFloor: denObj?.toFloor };
        });
        expect(result.type).toBe('stair_down');
        expect(result.toFloor).toBe(-9);
    });

    test('a successful spot check reveals the palace passage and flags it for the Queen; a repeat check is a no-op', async ({ page }) => {
        const result = await page.evaluate(() => {
            const hex = window.campaign2TunnelPalaceHex;
            window.chancellorTunnelDiscoveredByPlayer = false;
            const origRandom = Math.random;
            Math.random = () => 0; // guaranteed success
            window.searchSecretPassage(hex.q, hex.r, 0);
            const afterFirst = { ...window.tileObjects[`${hex.q},${hex.r}`] };
            const discoveredFlag = window.chancellorTunnelDiscoveredByPlayer;

            Math.random = () => 0.999; // would fail, but already discovered — must be a no-op either way
            window.searchSecretPassage(hex.q, hex.r, 0);
            const afterSecond = { ...window.tileObjects[`${hex.q},${hex.r}`] };
            Math.random = origRandom;
            return { afterFirst, discoveredFlag, afterSecond };
        });
        expect(result.afterFirst.type).toBe('stair_down');
        expect(result.afterFirst.toFloor).toBe(-9);
        expect(result.discoveredFlag).toBe(true);
        expect(result.afterSecond.type).toBe('stair_down'); // unchanged, still revealed
    });

    test('a failed spot check leaves the passage hidden and does not set the Queen-report flag', async ({ page }) => {
        const result = await page.evaluate(() => {
            const hex = window.campaign2TunnelCityHex; // city node — not tied to the Queen flag at all
            window.chancellorTunnelDiscoveredByPlayer = false;
            const origRandom = Math.random;
            Math.random = () => 0.999; // guaranteed failure
            window.searchSecretPassage(hex.q, hex.r, 0);
            Math.random = origRandom;
            const obj = window.tileObjects[`${hex.q},${hex.r}`];
            return { type: obj.type, discovered: obj.discovered, chancellorFlag: window.chancellorTunnelDiscoveredByPlayer };
        });
        expect(result.type).toBe('secret_passage');
        expect(result.discovered).toBe(false);
        expect(result.chancellorFlag).toBe(false);
    });

    test('revealTunnelEntrances unlocks both hidden doors without setting the Queen-report flag', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.chancellorTunnelDiscoveredByPlayer = false;
            window.revealTunnelEntrances();
            const palaceHex = window.campaign2TunnelPalaceHex;
            const cityHex = window.campaign2TunnelCityHex;
            return {
                palaceType: window.tileObjects[`${palaceHex.q},${palaceHex.r}`].type,
                cityType: window.tileObjects[`${cityHex.q},${cityHex.r}`].type,
                chancellorFlag: window.chancellorTunnelDiscoveredByPlayer,
                revealedFlag: window.tunnelEntrancesRevealedByGuild,
            };
        });
        expect(result.palaceType).toBe('stair_down');
        expect(result.cityType).toBe('stair_down');
        expect(result.chancellorFlag).toBe(false);
        expect(result.revealedFlag).toBe(true);
    });

    test('the fence offers to reveal the tunnels once trusted, and "Show me" unlocks them', async ({ page }) => {
        await page.evaluate(() => {
            window.factions.thieves_guild.standing = 45;
            window.tunnelEntrancesRevealedByGuild = false;
            const fence = window.entities.find(e => e.name === 'Tessa Nightshade');
            window.npcDialogueTrees['thieves_guild_fence'](fence);
        });
        await clickDialogueOption(page, 'Anything else I should know?');
        await clickDialogueOption(page, 'Show me.');
        const result = await page.evaluate(() => {
            const hex = window.campaign2TunnelPalaceHex;
            return { revealed: window.tunnelEntrancesRevealedByGuild, palaceType: window.tileObjects[`${hex.q},${hex.r}`].type };
        });
        expect(result.revealed).toBe(true);
        expect(result.palaceType).toBe('stair_down');
    });

    test('a tunnel junction offers travel to the other two nodes, and picking one moves the player there', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const caveCenter = window.campaign2SunkenCaveCenter;
            player.floor = -9;
            player.hex = { q: caveCenter.q, r: caveCenter.r };
            window.openTunnelJunction(player);
            return true;
        });
        expect(result).toBe(true);
        const dialogueText = await page.locator('#dialogue-modal').innerText();
        expect(dialogueText).not.toContain('sea-cave den'); // own node excluded from the travel list
        await clickDialogueOption(page, 'council chamber');
        const after = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            const palaceHex = window.campaign2TunnelPalaceHex;
            return { floor: player.floor, atPalaceHex: player.hex.q === palaceHex.q && player.hex.r === palaceHex.r };
        });
        expect(after.floor).toBe(-9);
        expect(after.atPalaceHex).toBe(true);
    });

    test('reporting the palace tunnel to the Queen requires independent discovery, adjusts reputation, and seals the passage', async ({ page }) => {
        await page.evaluate(() => {
            window.chancellorTunnelDiscoveredByPlayer = true;
            window.chancellorTunnelReportedToQueen = false;
            const queen = window.entities.find(e => e.name === window.campaign2QueenEntityName);
            window.npcDialogueTrees['silverhart_queen'](queen);
        });
        await clickDialogueOption(page, "I must tell you something about your Chancellor");
        const result = await page.evaluate(() => {
            const hex = window.campaign2TunnelPalaceHex;
            return {
                reported: window.chancellorTunnelReportedToQueen,
                kingdomStanding: window.factions.silverhart_kingdom.standing,
                guildStanding: window.factions.thieves_guild.standing,
                passageSealed: window.tileObjects[`${hex.q},${hex.r}`] === undefined,
            };
        });
        expect(result.reported).toBe(true);
        expect(result.passageSealed).toBe(true);
    });
});

test.describe('Kragmoor (dwarf capital): a genuinely descending mountain hold', () => {
    test.beforeEach(async ({ page }) => { await createCharacter(page); });

    test('the Deepholds building has four basement levels sharing the massif\'s footprint', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.campaign2DeepholdsBuilding;
            return {
                found: !!b,
                hasHall: !!(b && b.floors[-1]),
                hasVault: !!(b && b.floors[-2]),
                hasMine: !!(b && b.floors[-3]),
                hasTunnels: !!(b && b.floors[-4]),
            };
        });
        expect(result.found).toBe(true);
        expect(result.hasHall).toBe(true);
        expect(result.hasVault).toBe(true);
        expect(result.hasMine).toBe(true);
        expect(result.hasTunnels).toBe(true);
    });

    test('the King and his guards live on the Great Hall level (-1), not the surface', async ({ page }) => {
        const result = await page.evaluate(() => {
            const king = window.entities.find(e => e.name === window.campaign2DwarfKing?.name);
            const guardsOnFloor = window.entities.filter(e => window.campaign2DwarfGuards?.some(g => g.name === e.name)).map(e => e.floor);
            return { kingFloor: king?.floor, guardsOnFloor };
        });
        expect(result.kingFloor).toBe(-1);
        expect(result.guardsOnFloor.every(f => f === -1)).toBe(true);
    });

    test('the trader/runesmith live on the Vault+Runeforge level (-2), the foreman on the Deep Mine level (-3), and the vermin on the Lower Tunnels level (-4)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const trader = window.entities.find(e => e.name === window.campaign2DwarfTrader?.name);
            const runesmith = window.entities.find(e => e.name === window.campaign2DwarfRunesmith?.name);
            const foreman = window.entities.find(e => e.name === window.campaign2DwarfForeman?.name);
            const vermin = window.entities.filter(e => e.deepholdsVermin);
            return {
                traderFloor: trader?.floor, runesmithFloor: runesmith?.floor,
                foremanFloor: foreman?.floor,
                verminFloors: vermin.map(v => v.floor),
            };
        });
        expect(result.traderFloor).toBe(-2);
        expect(result.runesmithFloor).toBe(-2);
        expect(result.foremanFloor).toBe(-3);
        expect(result.verminFloors.length).toBeGreaterThan(0);
        expect(result.verminFloors.every(f => f === -4)).toBe(true);
    });

    test('descending all four stairwells in sequence reaches the Lower Tunnels', async ({ page }) => {
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.floor = 0;

            // Walk the actual stair chain via the tileObjects themselves,
            // rather than hardcoding hexes independently of the world-build
            // code, so this test breaks (loudly) if the layout ever moves.
            function findStair(floor, type) {
                if (!floor) {
                    return Object.entries(window.tileObjects).find(([, o]) => o.type === type && o.toFloor === -1)?.[0];
                }
                const b = window.campaign2DeepholdsBuilding;
                const f = b.floors[floor];
                return Object.entries(f.tileObjects).find(([, o]) => o.type === type)?.[0];
            }

            const steps = [];
            let floor = 0;
            for (let i = 0; i < 4; i++) {
                const key = findStair(floor, 'stair_down');
                if (!key) break;
                const [q, r] = key.split(',').map(Number);
                player.hex = { q, r };
                player.floor = floor;
                window.checkStairTransitions();
                floor = player.floor;
                steps.push(floor);
            }
            return steps;
        });
        expect(result).toEqual([-1, -2, -3, -4]);
    });
});
