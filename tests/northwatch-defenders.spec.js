// tests/northwatch-defenders.spec.js
// Northwatch's garrison soldiers now carry a combatDirective (see
// gameEngine.js's layered combat AI + campaign2World.js's
// buildNorthwatchFort): never leave the fort, prioritize gate-threats over
// interior threats over exterior threats, and fall back toward the keep
// once 5+ hostiles get inside the walls — specifically to one of the 18
// melee-triangle slots (3 per hexagon point, 2 hexes from that point's
// archer) rather than a single shared hex, so a breach draws a 3-on-1
// pincer instead of soldiers converging one at a time.

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Northwatch fort soldiers: combat directive', () => {
    test('a soldier is built with a directive constrained to the fort interior, gate-first priorities, and a nearby keep-side retreat point', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const soldier = window.entities.find(e => (window.campaign2FortSoldiers || []).some(s => s.name === e.name));
            const region = window.campaign2NorthwatchFortRegion;
            const gate = window.campaign2NorthwatchGateHex;
            const center = window.campaign2NorthwatchCenter;
            const directive = soldier?.combatDirective;
            return {
                hasDirective: !!directive,
                constrainedToFort: directive ? region.wallHexes.every(h => directive.constraints.stayWithinHexes.has(`${h.q},${h.r}`)) : false,
                gatePriorityFirst: directive?.priorities?.[0]?.hex?.q === gate.q && directive.priorities[0].hex.r === gate.r,
                // Not the flat hexagon center anymore (see the melee-triangle
                // formation, buildNorthwatchFort) — just confirm it's a real,
                // close-to-the-keep fallback point rather than checking the
                // exact slot math here (that's northwatch-melee-triangle.spec.js).
                retreatsNearKeep: !!directive?.retreatTo && window.distance(directive.retreatTo, center) <= 6,
            };
        });
        expect(result.hasDirective).toBe(true);
        expect(result.constrainedToFort).toBe(true);
        expect(result.gatePriorityFirst).toBe(true);
        expect(result.retreatsNearKeep).toBe(true);
    });

    test('a soldier never steps outside the fort chasing an attacker beyond the wall', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const soldier = window.entities.find(e => (window.campaign2FortSoldiers || []).some(s => s.name === e.name));
            const region = window.campaign2NorthwatchFortRegion;
            soldier.aiState = 'combat';
            soldier.timePoints = 100;
            // An attacker far outside the fort's walls entirely.
            const outsideHex = { q: region.minQ - 30, r: region.minR - 30 };
            const attacker = window.createMonster('orc', outsideHex, null, null, 'enemy');
            attacker.timePoints = 100;
            window.entities = [soldier, attacker];
            window.currentTurnEntity = soldier;
            window.isInCombat = true;
            window.takeTurn(soldier);
            await new Promise(r => setTimeout(r, 600));
            const stillInside = soldier.combatDirective.constraints.stayWithinHexes.has(`${soldier.hex.q},${soldier.hex.r}`);
            return { stillInside };
        });
        expect(result.stillInside).toBe(true);
    });

    test('enough hostiles inside the walls triggers the retreat contingency toward the keep', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(async () => {
            const soldier = window.entities.find(e => (window.campaign2FortSoldiers || []).some(s => s.name === e.name));
            const region = window.campaign2NorthwatchFortRegion;
            soldier.aiState = 'combat';
            soldier.timePoints = 100;
            // The trigger count scales with the fort's own footprint
            // (campaign2World.js's RETREAT_TRIGGER_COUNT) rather than a
            // flat number, so this reads the real live threshold instead
            // of assuming any specific fort size.
            const interiorSpots = region.floorHexes.slice(0, window.campaign2NorthwatchRetreatTriggerCount);
            const hostiles = interiorSpots.map(h => {
                const orc = window.createMonster('orc', h, null, null, 'enemy');
                orc.timePoints = 100;
                return orc;
            });
            window.entities = [soldier, ...hostiles];
            window.currentTurnEntity = soldier;
            window.isInCombat = true;
            window.takeTurn(soldier);
            await new Promise(r => setTimeout(r, 600));
            return { mode: soldier.combatDirective.mode };
        });
        expect(result.mode).toBe('retreat');
    });
});
