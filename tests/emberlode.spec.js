// tests/emberlode.spec.js
// Emberlode: a mining village two world-hexes west of Hollowmere, past the
// goblin camp on the same road (see buildEmberlode in campaign2World.js).
// Dialogue/quests branch on the goblin_threat quest's resolution state.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('Emberlode village', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('is built with a foreman, a miner, a ledger, and a world-map marker', async ({ page }) => {
        const info = await page.evaluate(() => {
            const ledgerObj = Object.values(window.tileObjects).find(o => o.readId === 'emberlode_ledger');
            return {
                foreman: !!window.entities.find(e => e.name === 'Corran Vale'),
                miner: !!window.entities.find(e => e.name === 'Bettina Marrow'),
                ledgerObj,
                worldMapEntry: window.worldMapData?.[6]?.[4],
                region: window.regions.emberlode,
            };
        });
        expect(info.foreman).toBe(true);
        expect(info.miner).toBe(true);
        expect(info.ledgerObj).toMatchObject({ type: 'journal', readId: 'emberlode_ledger' });
        expect(info.worldMapEntry).toMatchObject({ n: 'Emberlode' });
        expect(info.region).toMatchObject({ id: 'emberlode', parentId: 'aldervale' });
    });

    test('the goblin camp keeps its original position now that the west road is extended further', async ({ page }) => {
        const center = await page.evaluate(() => window.campaign2GoblinCampCenter);
        // Originally { q: -122, r: 24 } before the extension; the wiggle can
        // shift r by at most a hex or two, but q must land at the same
        // one-world-hex-out waypoint, not drift with the extended road.
        expect(center.q).toBe(-122);
        expect(Math.abs(center.r - 24)).toBeLessThanOrEqual(2);
    });

    test('Corran Vale describes the danger and offers "The Buried Road" before goblin_threat is resolved', async ({ page }) => {
        const dialogue = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Corran Vale');
            window.npcDialogueTrees.corran_vale(npc);
        });
        const opened = await page.evaluate(() => ({
            message: document.getElementById('dialogue-message').innerText,
            options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
        }));
        expect(opened.message).toMatch(/Skarn-tooth/i);
        expect(opened.options.some(o => /goblins/i.test(o))).toBe(true);

        await page.locator('#dialogue-options button', { hasText: 'goblins' }).click();
        const quest = await page.evaluate(() => window.questLog.find(q => q.id === 'buried_road'));
        expect(quest).toMatchObject({ giver: 'Corran Vale', status: 'active' });
    });

    test('Corran offers "Ore Road Reopened" once goblin_threat resolves (any non-betrayal path)', async ({ page }) => {
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'buried_road', title: 'The Buried Road', giver: 'Corran Vale', status: 'active', description: '' });
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'completed', resolution: 'stealth_succession' });
            const npc = window.entities.find(e => e.name === 'Corran Vale');
            window.npcDialogueTrees.corran_vale(npc);
        });
        const opened = await page.evaluate(() => ({
            message: document.getElementById('dialogue-message').innerText,
            options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
        }));
        expect(opened.message).toMatch(/settled|escort/i);
        await page.locator('#dialogue-options button', { hasText: 'safely' }).click();

        const state = await page.evaluate(() => ({
            buriedRoadStatus: window.questLog.find(q => q.id === 'buried_road').status,
            oreRoadQuest: window.questLog.find(q => q.id === 'ore_road_reopened'),
        }));
        expect(state.buriedRoadStatus).toBe('completed');
        expect(state.oreRoadQuest).toMatchObject({ status: 'active' });
    });

    test('betrayal resolution leaves Emberlode in a distinct, grim state (never offers the escort quest)', async ({ page }) => {
        await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'completed', resolution: 'betrayal' });
            const npc = window.entities.find(e => e.name === 'Corran Vale');
            window.npcDialogueTrees.corran_vale(npc);
        });
        const opened = await page.evaluate(() => ({
            message: document.getElementById('dialogue-message').innerText,
            options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
        }));
        expect(opened.message).toMatch(/worse/i);
        expect(opened.options.some(o => /escort|wagon/i.test(o))).toBe(false);
    });

    test('the goblin favor menu offers raiding Emberlode for its shinies, distinct from the Hollowmere betrayal path', async ({ page }) => {
        const before = await page.evaluate(() => ({
            goldBefore: window.party[0].gold || 0,
            prosperityBefore: window.regions.emberlode.prosperity,
        }));
        const result = await page.evaluate((before) => {
            window.resolveGoblinFavor('raid_mine');
            return {
                goldGained: (window.party[0].gold || 0) - before.goldBefore,
                prosperityLost: before.prosperityBefore - window.regions.emberlode.prosperity,
                raided: window.emberlodeRaided,
                goblinThreatQuest: (window.questLog || []).find(q => q.id === 'goblin_threat'),
            };
        }, before);
        expect(result.goldGained).toBeGreaterThan(0);
        expect(result.prosperityLost).toBeGreaterThan(0);
        expect(result.raided).toBe(true);
        // Distinct from the Hollowmere 'betrayal' resolution — raiding
        // Emberlode doesn't touch the goblin_threat quest at all.
        expect(result.goblinThreatQuest).toBeUndefined();
    });

    test('after being raided, Corran describes the raid instead of offering any quest', async ({ page }) => {
        const dialogue = await page.evaluate(() => {
            window.emberlodeRaided = true;
            const npc = window.entities.find(e => e.name === 'Corran Vale');
            window.npcDialogueTrees.corran_vale(npc);
            return {
                message: document.getElementById('dialogue-message').innerText,
                options: Array.from(document.getElementById('dialogue-options').children).map(b => b.innerText),
            };
        });
        expect(dialogue.message).toMatch(/cleaned us out|goblins came/i);
        expect(dialogue.options.some(o => /goblins|escort|wagon/i.test(o))).toBe(false);
    });

    test('escort quest: a peaceful (diplomacy) resolution completes immediately with reward, no ambush', async ({ page }) => {
        const result = await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'x', giver: 'x', status: 'completed', resolution: 'goblin_diplomacy' });
            window.questLog.push({ id: 'ore_road_reopened', title: 'x', giver: 'Corran Vale', status: 'active', description: '', offeredAt: window.worldSeconds });
            const goldBefore = window.party[0].gold || 0;
            const prosperityBefore = window.regions.emberlode.prosperity;
            window.startEmberlodeEscort();
            return {
                questStatus: window.questLog.find(q => q.id === 'ore_road_reopened').status,
                goldGained: (window.party[0].gold || 0) - goldBefore,
                prosperityGained: window.regions.emberlode.prosperity - prosperityBefore,
                ambushGoblins: window.entities.filter(e => e.emberlodeAmbushGoblin).length,
            };
        });
        expect(result.questStatus).toBe('completed');
        expect(result.goldGained).toBeGreaterThan(0);
        expect(result.prosperityGained).toBeGreaterThan(0);
        expect(result.ambushGoblins).toBe(0);
    });

    test('escort quest: a non-diplomacy resolution spawns straggler goblins, and clearing them completes the quest', async ({ page }) => {
        const result = await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'x', giver: 'x', status: 'completed', resolution: 'assault' });
            window.questLog.push({ id: 'ore_road_reopened', title: 'x', giver: 'Corran Vale', status: 'active', description: '', offeredAt: window.worldSeconds });
            window.startEmberlodeEscort();
            const spawnedCount = window.entities.filter(e => e.emberlodeAmbushGoblin).length;
            const statusAfterSpawn = window.questLog.find(q => q.id === 'ore_road_reopened').status;

            window.entities.filter(e => e.emberlodeAmbushGoblin).forEach(e => e.alive = false);
            window.checkEmberlodeEscortResolution();
            const statusAfterClear = window.questLog.find(q => q.id === 'ore_road_reopened').status;

            return { spawnedCount, statusAfterSpawn, statusAfterClear };
        });
        expect(result.spawnedCount).toBeGreaterThan(0);
        expect(result.statusAfterSpawn).toBe('active');
        expect(result.statusAfterClear).toBe('completed');
    });

    test('the ledger reads differently before vs after goblin_threat is resolved', async ({ page }) => {
        const before = await page.evaluate(() => {
            window.readEmberlodeLedger();
            return document.getElementById('dialogue-message').innerText;
        });
        expect(before).toMatch(/half-crews|greenskins/i);

        const after = await page.evaluate(() => {
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'x', giver: 'x', status: 'completed', resolution: 'goblin_diplomacy' });
            window.readEmberlodeLedger();
            return document.getElementById('dialogue-message').innerText;
        });
        expect(after).toMatch(/clear again|full crews/i);
    });
});
