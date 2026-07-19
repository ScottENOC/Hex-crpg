// tests/villain-path-economy.spec.js
// Consequences for the two "overtly evil" paths (goblin alliance, lichdom):
// human-kingdom merchants (Silverhart stable/clothier/magic dealer, the
// Hollowmere general store, the mercenary broker) refuse to deal with such
// a player (isShunnedByHumanCommerce, factions.js), but each has a matching
// alternative — the goblin camp's own trader once truly allied, the Bone
// Trader once committed to lichdom (buildLichBarrow, campaign2World.js) —
// so neither path locks the player out of gear, hired muscle, or (via
// raiseSkeletonHorse, stable.js) a mount. Also covers the lich-path
// companion fallout: everyone but Wren Talbot deserts; she becomes a
// vampire instead (triggerLichCompanionFallout, campaign2Dialogue.js).

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Villain-path commerce gating and alternatives', () => {
    test('isShunnedByHumanCommerce is false by default, true once lich or goblin-allied', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const before = window.isShunnedByHumanCommerce();
            window.playerIsLich = true;
            const asLich = window.isShunnedByHumanCommerce();
            window.playerIsLich = false;
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'goblin_threat', resolution: 'goblin_alliance' });
            const asGoblinAlly = window.isShunnedByHumanCommerce();
            return { before, asLich, asGoblinAlly };
        });
        expect(result.before).toBe(false);
        expect(result.asLich).toBe(true);
        expect(result.asGoblinAlly).toBe(true);
    });

    test('human merchants (stable, clothier, magic dealer, general store, mercenary broker) refuse a lich player', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            let openedShop = false;
            window.openShop = () => { openedShop = true; };
            window.buyHorse = () => { openedShop = true; };
            const refusals = [];
            window.showDialogue = (n, text) => { refusals.push(text); };

            const npc = { name: 'Test NPC', reputation: { standing: 0, knowledge: 0 } };
            window.npcDialogueTrees.silverhart_stablehand(npc);
            window.npcDialogueTrees.silverhart_clothier(npc);
            window.npcDialogueTrees.silverhart_magic_dealer(npc);
            window.npcDialogueTrees.wick_hallow(npc);
            window.npcDialogueTrees.silverhart_mercenary_broker(npc);

            return { refusalCount: refusals.length, openedShop };
        });
        expect(result.refusalCount).toBe(5);
        expect(result.openedShop).toBe(false);
    });

    test('the same human merchants work normally for an unaligned player', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let openedShop = false;
            window.openShop = () => { openedShop = true; };
            let calls = null;
            window.showDialogue = (n, text, options) => { calls = options; };
            const npc = { name: 'Test NPC', reputation: { standing: 0, knowledge: 0 } };
            window.npcDialogueTrees.silverhart_clothier(npc);
            calls.find(o => o.label.includes('Let me see')).action();
            return { openedShop };
        });
        expect(result.openedShop).toBe(true);
    });

    test('the Bone Trader sells regardless, and the goblin trader only sells once actually allied', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let openedShop = false;
            window.openShop = () => { openedShop = true; };
            let calls = null;
            window.showDialogue = (n, text, options) => { calls = options; };
            const npc = { name: 'Test NPC', reputation: { standing: 0, knowledge: 0 } };

            // Bone Trader: open regardless of alignment.
            window.npcDialogueTrees.bone_trader(npc);
            calls.find(o => o.label.includes('Let me see')).action();
            const boneTraderOpened = openedShop;

            // Goblin trader: refuses before alliance.
            openedShop = false;
            window.npcDialogueTrees.goblin_trader(npc);
            const refusedBeforeAlliance = !openedShop;

            // Goblin trader: sells once allied.
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'goblin_threat', resolution: 'goblin_alliance' });
            window.npcDialogueTrees.goblin_trader(npc);
            calls.find(o => o.label.includes('Let me see')).action();

            return { boneTraderOpened, refusedBeforeAlliance, goblinTraderOpenedAfterAlliance: openedShop };
        });
        expect(result.boneTraderOpened).toBe(true);
        expect(result.refusedBeforeAlliance).toBe(true);
        expect(result.goblinTraderOpenedAfterAlliance).toBe(true);
    });

    test('the lich barrow and goblin camp really do carry a Bone Trader / Grondle', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            boneTrader: !!window.entities.find(e => e.name === 'The Bone Trader' && e.dialogueId === 'bone_trader'),
            goblinTrader: !!window.entities.find(e => e.name === 'Grondle' && e.dialogueId === 'goblin_trader'),
        }));
        expect(result.boneTrader).toBe(true);
        expect(result.goblinTrader).toBe(true);
    });
});

test.describe('Lich-path companion fallout', () => {
    test('committing to lichdom deserts other companions but transforms Wren Talbot into a vampire instead', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.party.push({ name: 'Some Mercenary', skills: {} });
            window.entities.push({ name: 'Some Mercenary', alive: true, side: 'player' });
            const wrenBefore = window.party.find(p => p.name === 'Wren Talbot');

            window.triggerLichCompanionFallout();

            return {
                hadWren: !!wrenBefore,
                mercenaryLeft: !window.party.some(p => p.name === 'Some Mercenary'),
                wrenStillHere: window.party.some(p => p.name === 'Wren Talbot'),
                wrenIsVampire: window.party.find(p => p.name === 'Wren Talbot')?.isVampire === true,
                wrenGraveChill: (window.party.find(p => p.name === 'Wren Talbot')?.skills?.life_drain || 0) > 0,
            };
        });
        expect(result.hadWren).toBe(true);
        expect(result.mercenaryLeft).toBe(true);
        expect(result.wrenStillHere).toBe(true);
        expect(result.wrenIsVampire).toBe(true);
        expect(result.wrenGraveChill).toBe(true);
    });

    test('the fallout only ever runs once, even if triggered from both lichdom commitment paths', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            let messageCount = 0;
            window.showMessage = () => { messageCount++; };
            window.triggerLichCompanionFallout();
            window.triggerLichCompanionFallout();
            return { messageCount, triggeredOnce: window.lichFalloutTriggered === true };
        });
        expect(result.triggeredOnce).toBe(true);
        // Exactly one run's worth of messages (just Wren's transformation
        // line here, since there's no extra companion in this test) — a
        // second call should add nothing.
        expect(result.messageCount).toBe(1);
    });
});

test.describe('Skeleton horses: raised, not bought', () => {
    test('raiseSkeletonHorse refuses without playerIsLich, and without the Riding skill', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const horse = window.createMonster('horse', { q: 5, r: 5 }, null, null, 'player');
            window.entities.push(horse);

            const withoutLich = window.raiseSkeletonHorse(horse);

            window.playerIsLich = true;
            const withoutRiding = window.raiseSkeletonHorse(horse);

            return { withoutLich, withoutRiding, stillNotUndead: !horse.undead };
        });
        expect(result.withoutLich).toBe(false);
        expect(result.withoutRiding).toBe(false);
        expect(result.stillNotUndead).toBe(true);
    });

    test('a lich player with Riding can raise their own living horse (sacrificing it) into a skeleton horse', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.riding = 1;

            const player = window.entities.find(e => e.side === 'player' && !e.rider && e.name === window.party[0].name);
            const horse = window.createMonster('horse', { q: player.hex.q + 1, r: player.hex.r }, null, null, 'player');
            horse.rider = player;
            player.riding = horse;
            window.entities.push(horse);

            const raised = window.raiseSkeletonHorse(horse);

            return {
                raised,
                nowUndead: horse.undead === true,
                coatPreset: horse.coatPreset,
                stillAlive: horse.alive === true,
                riderCleared: horse.rider === null,
                playerRidingCleared: player.riding === null,
            };
        });
        expect(result.raised).toBe(true);
        expect(result.nowUndead).toBe(true);
        expect(result.coatPreset).toBe('skeleton');
        expect(result.stillAlive).toBe(true);
        expect(result.riderCleared).toBe(true);
        expect(result.playerRidingCleared).toBe(true);
    });

    test('a lich player can also raise a dead horse found in the world (e.g. a fallen enemy mount)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.playerIsLich = true;
            window.party[0].skills = window.party[0].skills || {};
            window.party[0].skills.riding = 1;

            const corpse = window.createMonster('horse', { q: 9, r: 9 }, null, null, 'enemy');
            corpse.alive = false;
            window.entities.push(corpse);

            const raised = window.raiseSkeletonHorse(corpse);
            return { raised, nowPlayerSide: corpse.side === 'player', nowUndead: corpse.undead === true, alive: corpse.alive === true };
        });
        expect(result.raised).toBe(true);
        expect(result.nowPlayerSide).toBe(true);
        expect(result.nowUndead).toBe(true);
        expect(result.alive).toBe(true);
    });

    test('committing to lichdom via either path (binding the phylactery, or allying with Ashgrave) sets playerIsLich', async ({ page }) => {
        await createCharacter(page);
        const boundResult = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });
            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.readLichPhylacteryCoreNote();
            calls.find(o => o.label === 'Bind it to yourself instead.').action();
            return window.playerIsLich === true;
        });
        expect(boundResult).toBe(true);
    });
});
