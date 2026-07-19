const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('world liveliness: NPC daily movement, terrain variety, banter', () => {
    test("Old Mac's schedule sends him to tend the sheep at the pasture during the day", async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const schedules = window.getNpcSchedules();
            const blocks = schedules['Old Mac'];
            const pastureBlock = blocks.find(b => b.start === 8 && b.end === 13);
            return {
                blockCount: blocks.length,
                pastureBlock,
                pastureCenter: window.campaign2FarmPastureCenter,
            };
        });
        expect(result.blockCount).toBe(5);
        expect(result.pastureBlock).toBeTruthy();
        expect(result.pastureBlock.hex).toEqual(result.pastureCenter);
    });

    test('wilderness terrain includes swamp and sand regions, not just grass/forest/rocky-outcrop', async ({ page }) => {
        await createCharacter(page);
        const names = await page.evaluate(() => {
            const found = new Set();
            for (let q = -400; q <= 400; q += 15) {
                for (let r = -400; r <= 400; r += 15) {
                    found.add(window.getTerrainAt(q, r).name);
                }
            }
            return Array.from(found);
        });
        expect(names).toContain('Grass');
        expect(names.some(n => n === 'Swamp')).toBe(true);
        expect(names.some(n => n === 'Sand')).toBe(true);
    });

    test('new ambient party banter entries exist with valid structure', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const ids = ['reddale_first_sight', 'wren_aldric_idle_travel_1', 'wren_idle_travel_2', 'aldric_idle_travel', 'wren_uneasy_about_shard', 'aldric_lich_rank_warning'];
            return ids.map(id => {
                const entry = window.characterBanterLines.find(b => b.id === id);
                return { id, exists: !!entry, hasLines: !!(entry && entry.lines && entry.lines.length > 0) };
            });
        });
        result.forEach(r => {
            expect(r.exists).toBe(true);
            expect(r.hasLines).toBe(true);
        });
    });

    test('the phylactery-shard banter condition actually fires when carrying the shard', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const entry = window.characterBanterLines.find(b => b.id === 'wren_uneasy_about_shard');
            const before = entry.condition();
            window.player.inventory.push('phylactery_shard');
            const after = entry.condition();
            return { before, after };
        });
        expect(result.before).toBe(false);
        expect(result.after).toBe(true);
    });
});
