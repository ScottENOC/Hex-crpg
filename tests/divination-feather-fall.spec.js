const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Divination and Feather Fall integration', () => {
    test('Divination creates a real prophecy and consumes a foretold strike once', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.tileObjects = {};
            window.mapItems = {};
            const caster = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
            const prophecy = window.divinationSystem.cast(caster);
            const firstUse = window.divinationSystem.consumeTrueStrike(caster);
            const secondUse = window.divinationSystem.consumeTrueStrike(caster);
            return { kind: prophecy.kind, text: prophecy.text, firstUse, secondUse };
        });
        expect(result.kind).toBe('true_strike');
        expect(result.text).toContain('next time you strike');
        expect(result.firstUse).toBe(true);
        expect(result.secondUse).toBe(false);
    });

    test('Feather Fall prevents damage and is consumed by a resolved fall', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const caster = window.entities.find(e => e.alive && e.side === 'player' && !e.rider);
            const originalHp = caster.hp;
            const originalTerrainAtFloor = window.getTerrainAtFloor;
            window.getTerrainAtFloor = () => ({ elevated: false, impassable: false, name: 'Floor' });
            caster.floor = 1;
            window.activeSpells.push({
                spellInstanceId: 987654321,
                baseId: 'feather_fall',
                targetEntityId: caster.id,
                casterName: caster.name
            });
            const outcome = window.resolveFall(caster, {
                fromHex: { ...caster.hex },
                fromFloor: 1,
                fromTerrain: { elevated: false, impassable: false },
                landingHex: { ...caster.hex },
                landingFloor: 0
            });
            window.getTerrainAtFloor = originalTerrainAtFloor;
            return {
                fell: outcome.fell,
                prevented: outcome.prevented,
                damage: outcome.damage,
                hpUnchanged: caster.hp === originalHp,
                spellRemaining: window.activeSpells.some(s => s.baseId === 'feather_fall' && s.targetEntityId === caster.id),
                floor: caster.floor
            };
        });
        expect(result.fell).toBe(true);
        expect(result.prevented).toBe(true);
        expect(result.damage).toBe(0);
        expect(result.hpUnchanged).toBe(true);
        expect(result.spellRemaining).toBe(false);
        expect(result.floor).toBe(0);
    });
});
