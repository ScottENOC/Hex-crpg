// tests/tick-perf.spec.js
// runTickInternal's per-entity loop scans window.activeSpells twice per
// entity, every real-time tick — with entity counts having grown well past
// 100 persistent world NPCs, that's paid every frame even when nothing is
// actually casting anything. Guarded both scans behind a single
// `hasActiveSpells` check computed once per tick instead of per entity.
// While fixing this, found (and fixed) a pre-existing bug: the ongoing
// silence-penalty damage block referenced `tpGained`, a variable declared
// inside the `e.timePoints < 150` gate above it — so a fully-TP-capped
// entity being silenced threw a ReferenceError instead of taking damage.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('runTickInternal: ongoing spell effects (mana upkeep, silence)', () => {
    test('mana upkeep still drains an ongoing spell\'s caster', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const caster = window.entities.find(e => e.side === 'player');
            caster.maxMana = 100; caster.currentMana = 100;
            window.activeSpells.push({
                spellInstanceId: 'test_upkeep', baseId: 'firebolt', casterName: caster.name,
                coreManaCost: 20, name: 'Test Ongoing Spell'
            });
            const before = caster.currentMana;
            window.runTickInternal(false, true, 5.0);
            const after = caster.currentMana;
            window.activeSpells = window.activeSpells.filter(s => s.spellInstanceId !== 'test_upkeep');
            return { before, after };
        });
        expect(result.after).toBeLessThan(result.before);
    });

    test('regression: silence-penalty damage no longer throws when the target\'s TP is already at the 150 cap', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const target = window.entities.find(e => e.side === 'player');
            target.timePoints = 150; // fully capped — this is what exposed the out-of-scope tpGained bug
            const hpBefore = target.hp;
            window.activeSpells.push({
                spellInstanceId: 'test_silence', debuffType: 'silence_penalty', targetEntityId: target.id, magnitude: 6
            });
            let threw = null;
            try {
                window.runTickInternal(false, true, 5.0);
            } catch (e) {
                threw = e.message;
            }
            const hpAfter = target.hp;
            window.activeSpells = window.activeSpells.filter(s => s.spellInstanceId !== 'test_silence');
            return { threw, hpBefore, hpAfter };
        });
        expect(result.threw).toBeNull();
        expect(result.hpAfter).toBeLessThan(result.hpBefore);
    });

    test('with no active spells at all, runTickInternal does not throw and entities tick normally', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.activeSpells = [];
            let threw = null;
            try {
                for (let i = 0; i < 20; i++) window.runTickInternal(false, true, 1.0);
            } catch (e) {
                threw = e.message;
            }
            return { threw };
        });
        expect(result.threw).toBeNull();
    });
});
