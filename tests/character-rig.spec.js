// tests/character-rig.spec.js
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('character equipment rig', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => window.__characterRigInstalled === true);
    });

    test('installs a six-anchor mesh for playable humanoid races', async ({ page }) => {
        const result = await page.evaluate(() => {
            const required = ['human_male','human_female','elf_male','elf_female','dwarf_male','dwarf_female','orc_male','orc_female','goblin_male','goblin_female'];
            return required.map(key => ({
                key,
                rig: window.ARMOUR_RIGS[key],
                configMesh: window.CHAR_CONFIG[key]?.armour?.mesh,
            }));
        });

        for (const entry of result) {
            expect(entry.rig).toBeTruthy();
            expect(entry.configMesh).toBeTruthy();
            for (const k of ['shoulderL','shoulderR','waistL','waistR','hemL','hemR','waistY']) {
                expect(typeof entry.rig[k]).toBe('number');
            }
            expect(entry.rig.shoulderL).toBeLessThan(entry.rig.shoulderR);
            expect(entry.rig.waistL).toBeLessThan(entry.rig.waistR);
            expect(entry.rig.hemL).toBeLessThan(entry.rig.hemR);
        }
    });

    test('dwarf and elf proportions deform differently rather than uniform-scaling the same rectangle', async ({ page }) => {
        const result = await page.evaluate(() => {
            const d = window.ARMOUR_RIGS.dwarf_male;
            const e = window.ARMOUR_RIGS.elf_male;
            const dwarf = window.computeArmourMeshPoints(d, 0, 0, 100, 200);
            const elf = window.computeArmourMeshPoints(e, 0, 0, 100, 200);
            return {
                dwarfShoulders: dwarf.shoulderR.x - dwarf.shoulderL.x,
                dwarfWaist: dwarf.waistR.x - dwarf.waistL.x,
                elfShoulders: elf.shoulderR.x - elf.shoulderL.x,
                elfWaist: elf.waistR.x - elf.waistL.x,
            };
        });

        expect(result.dwarfShoulders).toBeGreaterThan(result.elfShoulders);
        expect(result.dwarfWaist).toBeGreaterThan(result.elfWaist);
        expect(result.dwarfShoulders).toBeGreaterThan(result.dwarfWaist);
        expect(result.elfShoulders).toBeGreaterThan(result.elfWaist);
    });

    test('rigid gear scale follows character height, not width', async ({ page }) => {
        const result = await page.evaluate(() => {
            const human = window.getRigHeightScale('human_male');
            const dwarf = window.getRigHeightScale('dwarf_male');
            const elf = window.getRigHeightScale('elf_male');
            const dwarfFemale = window.getRigHeightScale('dwarf_female');
            const humanFemale = window.getRigHeightScale('human_female');
            return {
                human, dwarf, elf, dwarfFemale, humanFemale,
                dwarfSword: window.computeRigidGearSize('dwarf_male', 100),
                humanSword: window.computeRigidGearSize('human_male', 100),
                elfSword: window.computeRigidGearSize('elf_male', 100),
            };
        });

        expect(result.human).toBeCloseTo(1, 6);
        expect(result.dwarf).toBeLessThan(result.human);
        expect(result.elf).toBeGreaterThan(result.human);
        // Same bodyH means the same rigid gear scale even if body widths differ.
        expect(result.dwarfFemale).toBeCloseTo(result.humanFemale, 6);
        expect(result.dwarfSword).toBeLessThan(result.humanSword);
        expect(result.elfSword).toBeGreaterThan(result.humanSword);
    });

    test('item-specific size survives stature scaling', async ({ page }) => {
        const result = await page.evaluate(() => ({
            sword: window.computeRigidGearSize('dwarf_male', 100, 1),
            dagger: window.computeRigidGearSize('dwarf_male', 100, 0.75),
        }));
        expect(result.dagger).toBeCloseTo(result.sword * 0.75, 6);
    });

    test('the four-triangle warp draws without throwing on a canvas source', async ({ page }) => {
        const result = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 120; canvas.height = 220;
            const ctx = canvas.getContext('2d');
            const src = document.createElement('canvas');
            src.width = 60; src.height = 100;
            const sctx = src.getContext('2d');
            sctx.fillStyle = '#999'; sctx.fillRect(0, 0, 60, 100);
            const native = ctx.drawImage.bind(ctx);
            window.drawWarpedArmour(ctx, native, src, window.ARMOUR_RIGS.dwarf_male, 10, 10, 100, 200);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let alpha = 0;
            for (let i = 3; i < pixels.length; i += 4) alpha += pixels[i];
            return { alpha };
        });
        expect(result.alpha).toBeGreaterThan(0);
    });
});
