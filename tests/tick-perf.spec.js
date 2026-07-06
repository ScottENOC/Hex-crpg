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
            // Out of combat the regen loop only touches the "restless" set
            // (entities below max HP/mana, poisoned, or tied to an active
            // spell). Real gameplay refreshes that set on the ~1s tick and at
            // combat-end; this manual-injection test drives that same contract
            // explicitly. (In real play a caster is restless anyway — casting
            // spends mana — so this is only needed because the test builds a
            // full-mana caster by hand.)
            window.rebuildRestlessSet();
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
            window.rebuildRestlessSet(); // silence target must be in the out-of-combat working set (see note above)
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

    test('restless set: full-health idle NPCs are excluded, hurt entities are included and still regenerate', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.isInCombat = false;
            // Everyone topped up -> the out-of-combat working set is empty.
            window.entities.forEach(e => { e.hp = e.maxHp; e.currentMana = e.maxMana || 0; e.poisonTicks = 0; });
            window.rebuildRestlessSet();
            const emptyWhenAllFull = window._restlessEntities.length;

            // A hurt party member joins the set and regenerates over ticks.
            const player = window.entities.find(e => e.side === 'player');
            player.hp = player.maxHp - 10;
            window.rebuildRestlessSet();
            const inSetWhenHurt = window._restlessEntities.includes(player);
            const hpBefore = player.hp;
            for (let i = 0; i < 30; i++) window.runTickInternal(false, true, 1.0);
            const regenerated = player.hp > hpBefore;

            return { emptyWhenAllFull, inSetWhenHurt, regenerated };
        });
        expect(result.emptyWhenAllFull).toBe(0);
        expect(result.inSetWhenHurt).toBe(true);
        expect(result.regenerated).toBe(true);
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
