const { test, expect } = require('@playwright/test');
const { createCharacter, clickDialogueOption, readDialogue } = require('./helpers.js');

test.describe('Silverhart: rock/forest clearing and the Diplomatic Quarter', () => {
    test('wilderness noise terrain (forest/rocky outcrop/swamp/sand) near the palace is replaced with flat Grass', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const samples = [];
            for (let dq = -55; dq <= 55; dq += 5) {
                for (let dr = -55; dr <= 55; dr += 5) {
                    if (window.distance({ q: 0, r: 0 }, { q: dq, r: dr }) > 55) continue;
                    samples.push(window.getTerrainAt(center.q + dq, center.r + dr).name);
                }
            }
            return samples;
        });
        expect(result.length).toBeGreaterThan(50);
        result.forEach(name => {
            expect(['Forest', 'Rocky Outcrop', 'Swamp', 'Sand']).not.toContain(name);
        });
    });

    test('all six Diplomatic Quarter buildings are carved with Wood Floor interiors', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => ({
            elven: window.getTerrainAt(window.campaign2ElvenEmbassyCenter.q, window.campaign2ElvenEmbassyCenter.r).name,
            dwarven: window.getTerrainAt(window.campaign2DwarvenEmbassyCenter.q, window.campaign2DwarvenEmbassyCenter.r).name,
            aldenreach: window.getTerrainAt(window.campaign2AldenreachEmbassyCenter.q, window.campaign2AldenreachEmbassyCenter.r).name,
            corvane: window.getTerrainAt(window.campaign2CorvaneEmbassyCenter.q, window.campaign2CorvaneEmbassyCenter.r).name,
            ironbond: window.getTerrainAt(window.campaign2IronbondOfficeCenter.q, window.campaign2IronbondOfficeCenter.r).name,
            cathedral: window.getTerrainAt(window.campaign2CathedralCenter.q, window.campaign2CathedralCenter.r).name,
        }));
        Object.values(result).forEach(name => expect(name).toBe('Wood Floor'));
    });

    test('each embassy/office/cathedral has its named NPC present with working dialogue', async ({ page }) => {
        await createCharacter(page);
        const npcChecks = [
            ['Ambassador Elarion', 'elven_ambassador'],
            ['Ambassador Brokk Stonehammer', 'dwarven_ambassador'],
            ['Ambassador Cassia Wren', 'aldenreach_ambassador'],
            ['Ambassador Toren Aldwyn', 'corvane_ambassador'],
            ['Factor Willem Drass', 'ironbond_envoy'],
            ['High Cleric Adelram', 'high_cleric'],
        ];
        for (const [name, dialogueId] of npcChecks) {
            const found = await page.evaluate((n) => !!window.entities.find(e => e.name === n), name);
            expect(found).toBe(true);
            const hasDialogue = await page.evaluate((id) => typeof window.npcDialogueTrees[id] === 'function', dialogueId);
            expect(hasDialogue).toBe(true);
        }
    });

    test('the Ironbond envoy\'s dialogue reflects merchantInfluence like every other Ironbond-aligned NPC', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            window.factions.ironbond_company.merchantInfluence.silverhart_kingdom = 70;
            const envoy = window.entities.find(e => e.name === 'Factor Willem Drass');
            window.npcDialogueTrees.ironbond_envoy(envoy);
            return document.getElementById('dialogue-message').innerText;
        });
        expect(result).toContain('weight');
    });

    test('the road connects the palace gate to the Diplomatic Quarter (contiguous Path)', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const center = window.campaign2PalaceThroneCenter;
            const samples = [];
            for (let r = center.r + 24; r <= center.r + 36; r++) {
                samples.push(window.getTerrainAt(center.q, r).name);
            }
            return samples;
        });
        result.forEach(name => expect(name).toBe('Path'));
    });
});
