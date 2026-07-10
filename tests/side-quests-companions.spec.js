// tests/side-quests-companions.spec.js
// buildSideQuestContent (campaign2World.js): a bear/goblin-scout/ogre/spider-ruin
// batch of small side quests, three of which double as companion recruitment
// hooks (Reyna Fletcher, Mirabel Quill, Fenn Oakheart).

const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('Side quest content: bear, goblin scout, ogre, spider ruin', () => {
    test('all four encounters and their placeholder NPCs are placed', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const state = await page.evaluate(() => {
            const bear = window.entities.find(e => e.isSideQuestBear);
            const scout = window.entities.find(e => e.isDeliveryThief);
            const ogre = window.entities.find(e => e.isTollOgre);
            const spiders = window.entities.filter(e => e.isSpiderRuinDefender);
            const reyna = window.entities.find(e => e.name === 'Reyna Fletcher');
            const mirabel = window.entities.find(e => e.name === 'Mirabel Quill');
            const fenn = window.entities.find(e => e.name === 'Fenn Oakheart');
            return {
                bearAlive: bear?.alive,
                scoutHasDelivery: scout?.inventory?.includes('potion_health'),
                ogreAlive: ogre?.alive,
                spiderCount: spiders.length,
                reynaExists: !!reyna,
                mirabelExists: !!mirabel,
                fennExists: !!fenn,
            };
        });
        expect(state.bearAlive).toBe(true);
        expect(state.scoutHasDelivery).toBe(true);
        expect(state.ogreAlive).toBe(true);
        expect(state.spiderCount).toBe(2);
        expect(state.reynaExists).toBe(true);
        expect(state.mirabelExists).toBe(true);
        expect(state.fennExists).toBe(true);
    });
});

test.describe('Companion recruitment', () => {
    test('recruitReyna adds a real party member with archer skills', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const result = await page.evaluate(() => {
            window.recruitReyna();
            const inParty = window.party.some(p => p.name === 'Reyna Fletcher');
            const ent = window.entities.find(e => e.name === 'Reyna Fletcher' && e.side === 'player');
            return {
                inParty,
                hasBowSkill: (ent?.skills?.bow_hit || 0) > 0,
                side: ent?.side,
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.hasBowSkill).toBe(true);
        expect(result.side).toBe('player');
    });

    test('recruitMirabel adds a real party member with a firebolt spell', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const result = await page.evaluate(() => {
            window.recruitMirabel();
            const inParty = window.party.some(p => p.name === 'Mirabel Quill');
            const ent = window.entities.find(e => e.name === 'Mirabel Quill' && e.side === 'player');
            return {
                inParty,
                hasSpell: (ent?.createdSpells || []).some(s => s.name === 'Firebolt'),
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.hasSpell).toBe(true);
    });

    test('recruitFenn adds a real party member with druid skills', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const result = await page.evaluate(() => {
            window.recruitFenn();
            const inParty = window.party.some(p => p.name === 'Fenn Oakheart');
            const ent = window.entities.find(e => e.name === 'Fenn Oakheart' && e.side === 'player');
            return {
                inParty,
                hasBarkskin: (ent?.skills?.barkskin_active || 0) > 0,
            };
        });
        expect(result.inParty).toBe(true);
        expect(result.hasBarkskin).toBe(true);
    });

    test('recruiting twice does not duplicate the party member', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const count = await page.evaluate(() => {
            window.recruitFenn();
            window.recruitFenn();
            return window.party.filter(p => p.name === 'Fenn Oakheart').length;
        });
        expect(count).toBe(1);
    });
});

test.describe('Stolen delivery and toll-ogre quests', () => {
    test('killing the goblin scout and returning the delivery to Wick Hallow completes the quest', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        await page.evaluate(() => { window.hollowmereEventFired = true; });

        await page.evaluate(() => {
            const wick = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(wick);
        });
        await clickDialogueOption(page, "Heard you've had some trouble");
        await clickDialogueOption(page, "I'll get it back");
        const offered = await page.evaluate(() => window.questLog.find(q => q.id === 'stolen_delivery')?.status);
        expect(offered).toBe('active');

        const before = await page.evaluate(() => {
            const scout = window.entities.find(e => e.isDeliveryThief);
            scout.alive = false;
            window.player.inventory.push('potion_health');
            return window.player.gold || 0;
        });
        await page.evaluate(() => {
            const wick = window.entities.find(e => e.name === 'Wick Hallow');
            window.npcDialogueTrees.wick_hallow(wick);
        });
        await clickDialogueOption(page, "Heard you've had some trouble");

        const result = await page.evaluate((before) => {
            const q = window.questLog.find(qq => qq.id === 'stolen_delivery');
            return { status: q?.status, goldGained: (window.player.gold || 0) - before };
        }, before);
        expect(result.status).toBe('completed');
        expect(result.goldGained).toBeGreaterThan(0);
    });

    test('killing the toll ogre and reporting to Petra Hollis completes the quest', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);
        await page.evaluate(() => { window.hollowmereEventFired = true; });

        await page.evaluate(() => {
            const petra = window.entities.find(e => e.name === 'Petra Hollis');
            window.npcDialogueTrees.petra_hollis(petra);
        });
        await clickDialogueOption(page, 'Heard anything else on the road');
        await clickDialogueOption(page, "I'll clear it out");
        const offered = await page.evaluate(() => window.questLog.find(q => q.id === 'toll_ogre')?.status);
        expect(offered).toBe('active');

        await page.evaluate(() => {
            const ogre = window.entities.find(e => e.isTollOgre);
            ogre.alive = false;
        });
        await page.evaluate(() => {
            const petra = window.entities.find(e => e.name === 'Petra Hollis');
            window.npcDialogueTrees.petra_hollis(petra);
        });
        await clickDialogueOption(page, 'Heard anything else on the road');

        const result = await page.evaluate(() => {
            const q = window.questLog.find(qq => qq.id === 'toll_ogre');
            return { status: q?.status };
        });
        expect(result.status).toBe('completed');
    });
});
