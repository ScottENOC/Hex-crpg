// tests/necromancer-lichdom.spec.js
// The escalation past The Vessel-Seeker's Crypt: Malachar was only ever a
// lieutenant/vessel candidate — a few in-game days after his fall, word
// reaches Reddale that the necromancer, Corvin Ashgrave, completed the ritual
// anyway (see worldTime.js's necromancerDefeated/lichRisenNewsReady watcher).
// Captain Rennick then offers "The Barrow of Corvin Ashgrave" (necromancer_
// lichdom): a phylactery core must be destroyed or bound BEFORE killing
// Ashgrave for the kill to actually stick (buildLichBarrow, campaign2World.js;
// resolution branch, gameEngine.js checkCombatEnd). Parleying with Ashgrave
// mid-fight instead resolves the quest as an alliance (parleyWithEnemy,
// campaign2Dialogue.js) — the seed of the future villain-path arc.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('The Barrow of Corvin Ashgrave: lichdom escalation', () => {
    test('lichRisenNewsReady only flips true 3+ days after necromancerDefeatedAt', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.necromancerDefeated = true;
            window.necromancerDefeatedAt = window.worldSeconds;
            window.updateTime(1); // barely any time passed
            const tooSoon = !!window.lichRisenNewsReady;

            window.worldSeconds += 4 * 24 * 3600; // fast-forward 4 days
            window.updateTime(1);
            const afterDelay = !!window.lichRisenNewsReady;

            return { tooSoon, afterDelay };
        });
        expect(result.tooSoon).toBe(false);
        expect(result.afterDelay).toBe(true);
    });

    test('the barrow is built with two rooms, tagged undead guards, the named lich boss, and a phylactery core', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const barrowMinions = window.entities.filter(e => e.barrowMinion);
            const boss = window.entities.find(e => e.isLichBoss);
            const coreKey = Object.keys(window.tileObjects).find(k => window.tileObjects[k].readId === 'lich_phylactery_core');
            return {
                anteCenter: window.campaign2LichBarrowCenter,
                sanctumCenter: window.campaign2LichSanctumCenter,
                barrowMinionCount: barrowMinions.length,
                bossExists: !!boss,
                bossName: boss?.name,
                bossHp: boss?.maxHp,
                bossAlive: boss?.alive,
                hasCore: !!coreKey,
            };
        });
        expect(result.anteCenter).toBeTruthy();
        expect(result.sanctumCenter).toBeTruthy();
        expect(result.barrowMinionCount).toBeGreaterThanOrEqual(5); // 3 antechamber + boss + 1 escort
        expect(result.bossExists).toBe(true);
        expect(result.bossName).toBe('Corvin Ashgrave, the Lich');
        expect(result.bossHp).toBe(130);
        expect(result.bossAlive).toBe(true);
        expect(result.hasCore).toBe(true);
    });

    test('Captain Rennick only offers the barrow quest once the crypt is done and the lichdom news has broken', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Captain Ilsa Rennick') || { name: 'Captain Ilsa Rennick', reputation: { standing: 0, knowledge: 0 } };
            const dialogueCalls = [];
            window.showDialogue = (n, text, options) => { dialogueCalls.push({ text, options }); };

            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'disciple_exposed', status: 'completed' });
            window.questLog.push({ id: 'necromancer_hunt', status: 'completed' });

            // Crypt is done, but the news hasn't broken yet.
            dialogueCalls.length = 0;
            window.npcDialogueTrees.reddale_captain(npc);
            const mentionsMarrowTooSoon = dialogueCalls.some(c => c.text.includes('Corvin Ashgrave'));

            window.lichRisenNewsReady = true;
            dialogueCalls.length = 0;
            window.npcDialogueTrees.reddale_captain(npc);
            const offer = dialogueCalls.find(c => c.options.some(o => o.label.includes("finish what I started")));
            offer.options.find(o => o.label.includes("finish what I started")).action();
            const questActive = window.questLog.find(q => q.id === 'necromancer_lichdom')?.status === 'active';

            return { mentionsMarrowTooSoon, offered: !!offer, questActive };
        });
        expect(result.mentionsMarrowTooSoon).toBe(false);
        expect(result.offered).toBe(true);
        expect(result.questActive).toBe(true);
    });

    test('killing Ashgrave before dealing with the phylactery core leaves the quest active', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });
            window.entities.forEach(e => { if (e.side === 'enemy' && !e.isLichBoss) e.alive = false; });

            const boss = window.entities.find(e => e.isLichBoss);
            window.handleLethalDamage(boss, { side: 'player', name: 'Test' });

            return { questStillActive: window.questLog.find(q => q.id === 'necromancer_lichdom')?.status === 'active' };
        });
        expect(result.questStillActive).toBe(true);
    });

    test('destroying the phylactery core then killing Ashgrave resolves the quest with rewards', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });
            const standingBefore = window.factions.necromancer_cult.standing;
            const goldBefore = window.party[0].gold || 0;

            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.readLichPhylacteryCoreNote();
            calls.find(o => o.label === 'Destroy it.').action();

            window.entities.forEach(e => { if (e.side === 'enemy' && !e.isLichBoss) e.alive = false; });
            const boss = window.entities.find(e => e.isLichBoss);
            window.handleLethalDamage(boss, { side: 'player', name: 'Test' });

            const quest = window.questLog.find(q => q.id === 'necromancer_lichdom');
            return {
                questCompleted: quest?.status === 'completed',
                resolution: quest?.resolution,
                standingDropped: window.factions.necromancer_cult.standing < standingBefore,
                goldGained: (window.party[0].gold || 0) > goldBefore,
            };
        });
        expect(result.questCompleted).toBe(true);
        expect(result.resolution).toBe('destroyed');
        expect(result.standingDropped).toBe(true);
        expect(result.goldGained).toBe(true);
    });

    test('binding the phylactery to yourself grants lich skill ranks and resolves the quest as claimed', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });

            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.readLichPhylacteryCoreNote();
            calls.find(o => o.label === 'Bind it to yourself instead.').action();

            window.entities.forEach(e => { if (e.side === 'enemy' && !e.isLichBoss) e.alive = false; });
            const boss = window.entities.find(e => e.isLichBoss);
            window.handleLethalDamage(boss, { side: 'player', name: 'Test' });

            const quest = window.questLog.find(q => q.id === 'necromancer_lichdom');
            return {
                resolution: quest?.resolution,
                hasGraveChill: (window.player.skills.lich_grave_chill || 0) > 0,
                hasWitheringTouch: (window.player.skills.lich_withering_touch || 0) > 0,
            };
        });
        expect(result.resolution).toBe('claimed');
        expect(result.hasGraveChill).toBe(true);
        expect(result.hasWitheringTouch).toBe(true);
    });

    test('parleying with Ashgrave can resolve the quest as an alliance without killing him', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.questLog = window.questLog || [];
            window.questLog.push({ id: 'necromancer_lichdom', status: 'active', resolution: null });
            const cultStandingBefore = window.factions.necromancer_cult.standing;
            const kingdomStandingBefore = window.factions.silverhart_kingdom.standing;

            const boss = window.entities.find(e => e.isLichBoss);
            let calls;
            window.showDialogue = (n, text, options) => { calls = options; };
            window.parleyWithEnemy(boss);
            calls.find(o => o.label.includes('Join you')).action();

            const quest = window.questLog.find(q => q.id === 'necromancer_lichdom');
            return {
                resolution: quest?.resolution,
                bossAlive: boss.alive,
                alliedFlag: window.necromancerAllied === true,
                hasDeathlessFlesh: (window.player.skills.lich_deathless_flesh || 0) > 0,
                cultStandingRose: window.factions.necromancer_cult.standing > cultStandingBefore,
                kingdomStandingFell: window.factions.silverhart_kingdom.standing < kingdomStandingBefore,
            };
        });
        expect(result.resolution).toBe('allied');
        expect(result.bossAlive).toBe(false);
        expect(result.alliedFlag).toBe(true);
        expect(result.hasDeathlessFlesh).toBe(true);
        expect(result.cultStandingRose).toBe(true);
        expect(result.kingdomStandingFell).toBe(true);
    });
});
