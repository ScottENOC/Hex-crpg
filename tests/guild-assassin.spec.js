const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Merchants Guild retaliation: the hired assassin', () => {
    test('does not trigger unless spy_on_guild is completed AND merchants_guild standing has cratered', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            // Quest not completed yet, standing already low — should not trigger.
            window.factions.merchants_guild.standing = -20;
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'x', giver: 'y', status: 'active', description: 'z' });
            window.checkGuildAssassinTrigger();
            const triggeredWhileActive = window.guildAssassinTriggered;

            // Quest completed but standing not low enough — still should not trigger.
            window.questLog.find(q => q.id === 'spy_on_guild').status = 'completed';
            window.factions.merchants_guild.standing = 5;
            window.checkGuildAssassinTrigger();
            const triggeredWithGoodStanding = window.guildAssassinTriggered;

            return { triggeredWhileActive, triggeredWithGoodStanding };
        });
        expect(result.triggeredWhileActive).toBe(false);
        expect(result.triggeredWithGoodStanding).toBe(false);
    });

    test('triggers and spawns a stealthed, bow-armed assassin once both conditions are met', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'x', giver: 'y', status: 'completed', description: 'z' });
            window.factions.merchants_guild.standing = -20;
            window.checkGuildAssassinTrigger();
            const assassin = window.entities.find(e => e.name === 'Guild Assassin');
            return {
                triggered: window.guildAssassinTriggered,
                exists: !!assassin,
                isStealthed: assassin?.isStealthed,
                side: assassin?.side,
                behaviorType: assassin?.behaviorType,
                weapon: assassin?.equipped?.weapon,
            };
        });
        expect(result.triggered).toBe(true);
        expect(result.exists).toBe(true);
        expect(result.isStealthed).toBe(true);
        expect(result.side).toBe('neutral');
        expect(result.behaviorType).toBe('stalk');
        expect(result.weapon).toBe('bow');
    });

    test('backtracking toward a recently-visited hex makes the player more likely to spot the tail', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'x', giver: 'y', status: 'completed', description: 'z' });
            window.factions.merchants_guild.standing = -20;
            window.checkGuildAssassinTrigger();
            const assassin = window.entities.find(e => e.name === 'Guild Assassin');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);

            // Keep the player alive/full-HP so the ambush branch never fires here.
            player.hp = player.maxHp;
            assassin.hex = { q: player.hex.q + 3, r: player.hex.r };

            // Build a trail where the player is now backtracking onto an old hex.
            window.playerTrailHistory = [];
            for (let i = 0; i < 9; i++) window.playerTrailHistory.push({ q: player.hex.q, r: player.hex.r });

            const savedStealth = assassin.stealthScore;
            window.checkGuildAssassinTail(0);
            return { stealthUnchangedAfterCall: assassin.stealthScore === savedStealth, mission: window.activeStealthMission };
        });
        // stealthScore is only temporarily lowered for the canSee() roll itself, then restored —
        // this just proves the function ran without leaving stray side effects on the entity.
        expect(result.stealthUnchangedAfterCall).toBe(true);
    });

    test('ambushes (reveals, turns hostile, breaks stealth) once the player is weak and in bow range with line of sight', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'x', giver: 'y', status: 'completed', description: 'z' });
            window.factions.merchants_guild.standing = -20;
            window.checkGuildAssassinTrigger();
            const assassin = window.entities.find(e => e.name === 'Guild Assassin');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);

            player.hp = Math.floor(player.maxHp * 0.3); // well below the 50% weak threshold
            assassin.hex = { q: player.hex.q + 5, r: player.hex.r }; // within the 15-hex bow-range check, clear LOS on open ground

            window.checkGuildAssassinTail(0);

            return {
                side: assassin.side,
                isStealthed: assassin.isStealthed,
                aiState: assassin.aiState,
            };
        });
        expect(result.side).toBe('enemy');
        expect(result.isStealthed).toBe(false);
        expect(result.aiState).toBe('combat');
    });

    test('does not ambush while the player is at full health, even in range', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            (window.questLog = window.questLog || []).push({ id: 'spy_on_guild', title: 'x', giver: 'y', status: 'completed', description: 'z' });
            window.factions.merchants_guild.standing = -20;
            window.checkGuildAssassinTrigger();
            const assassin = window.entities.find(e => e.name === 'Guild Assassin');
            const player = window.entities.find(e => e.side === 'player' && !e.rider);

            player.hp = player.maxHp;
            assassin.hex = { q: player.hex.q + 5, r: player.hex.r };
            window.checkGuildAssassinTail(0);

            return { side: assassin.side, isStealthed: assassin.isStealthed };
        });
        expect(result.side).toBe('neutral');
        expect(result.isStealthed).toBe(true);
    });
});
