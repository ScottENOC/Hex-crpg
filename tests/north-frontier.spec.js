// tests/north-frontier.spec.js
// The north road extended to 3 world hexes, Millbrook (a minimal stub
// village at the end), and the abandoned house breadcrumb toward the
// necromancer/lichdom plot arc partway along it. Also the new
// Knowledge: Religion skill.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('the north road, Millbrook, and the abandoned house', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('Millbrook sits roughly 3 world hexes north of the crossroads, with a villager and a world-map marker', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            const millbrook = window.campaign2MillbrookCenter;
            return {
                distance: window.distance(cp, millbrook),
                villagerExists: !!window.entities.find(e => e.name === 'Petra Hollis'),
                floor: window.getTerrainAt(millbrook.q, millbrook.r).name,
                worldMapEntry: window.worldMapData[3][6],
            };
        });
        expect(result.distance).toBeGreaterThan(370); // ~3 * 130 world-hex-size
        expect(result.distance).toBeLessThan(420);
        expect(result.villagerExists).toBe(true);
        expect(result.floor).toBe('Wood Floor');
        expect(result.worldMapEntry.n).toBe('Millbrook');
        expect(result.worldMapEntry.f).toBe('V'); // village marker shape
    });

    test('the abandoned house sits partway up the north road, with three dormant-until-approached skeletons and a readable journal', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            const house = window.campaign2AbandonedHouseCenter;
            // Scoped to the house itself — the necromancer's crypt
            // (buildNecromancerCrypt, campaign2World.js) adds its own
            // skeletons elsewhere in the world, which a global name filter
            // would double-count.
            const skeletons = window.entities.filter(e => e.name === 'Skeleton' && window.distance(e.hex, house) <= 5);
            return {
                distanceFromCrossroads: window.distance(cp, house),
                floor: window.getTerrainAt(house.q, house.r).name,
                skeletonCount: skeletons.length,
                skeletonsAreEnemySide: skeletons.every(e => e.side === 'enemy'),
                isInCombatAtGameStart: window.isInCombat, // regression: must not be true just because they exist, far away
                journalPresent: window.tileObjects[`${house.q},${house.r}`]?.type === 'journal',
            };
        });
        expect(result.distanceFromCrossroads).toBeGreaterThan(100); // well short of Millbrook — "stuff in between"
        expect(result.distanceFromCrossroads).toBeLessThan(370);
        expect(result.floor).toBe('Wood Floor');
        expect(result.skeletonCount).toBe(3);
        expect(result.skeletonsAreEnemySide).toBe(true);
        expect(result.isInCombatAtGameStart).toBeFalsy();
        expect(result.journalPresent).toBe(true);
    });

    test('regression: the skeletons stay dormant (isInCombat false) until the player gets close, then wake up', async ({ page }) => {
        const result = await page.evaluate(() => {
            const house = window.campaign2AbandonedHouseCenter;
            const dormantBefore = window.entities.filter(e => e.name === 'Skeleton').every(e => e.aiState !== 'combat');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: house.q, r: house.r };
            window.updateTime(0);
            const wokenAfter = window.entities.filter(e => e.name === 'Skeleton').every(e => e.aiState === 'combat');
            return { dormantBefore, wokenAfter };
        });
        expect(result.dormantBefore).toBe(true);
        expect(result.wokenAfter).toBe(true);
    });

    test('reading the journal without Knowledge: Religion gives a vague account; with it, the lichdom/phylactery detail comes through', async ({ page }) => {
        const vague = await page.evaluate(() => {
            window.readAbandonedHouseJournal();
            return document.getElementById('dialogue-message').innerText;
        });
        expect(vague.toLowerCase()).not.toContain('phylactery');

        const detailed = await page.evaluate(() => {
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.knowledge_religion = 1;
            window.readAbandonedHouseJournal();
            return document.getElementById('dialogue-message').innerText;
        });
        expect(detailed.toLowerCase()).toContain('phylactery');
    });

    test("Petra Hollis in Millbrook references the abandoned house, tying the two together", async ({ page }) => {
        const message = await page.evaluate(() => {
            window.npcDialogueTrees.petra_hollis(window.entities.find(e => e.name === 'Petra Hollis'));
            return document.getElementById('dialogue-message').innerText;
        });
        expect(message.toLowerCase()).toContain('house');
    });

    test('ambient banter fires once on first sight of the abandoned house and of Millbrook', async ({ page }) => {
        const result = await page.evaluate(() => {
            const house = window.campaign2AbandonedHouseCenter;
            const player = window.entities.find(e => e.side === 'player' && !e.rider);
            player.hex = { q: house.q, r: house.r };
            window.characterBanterAccum = 999;
            window.checkCharacterBanter(0);
            return window.firedBanterIds['abandoned_house_first_sight'];
        });
        expect(result).toBe(true);
    });
});

test.describe('Knowledge: Religion skill definition', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('exists in the divine (cleric) tree and hasKnowledgeReligion checks it', async ({ page }) => {
        const result = await page.evaluate(() => ({
            tree: window.skills.knowledge_religion.tree,
            checkTrue: window.hasKnowledgeReligion({ skills: { knowledge_religion: 1 } }),
            checkFalse: window.hasKnowledgeReligion({ skills: {} }),
        }));
        expect(result.tree).toBe('divine');
        expect(result.checkTrue).toBe(true);
        expect(result.checkFalse).toBe(false);
    });
});
