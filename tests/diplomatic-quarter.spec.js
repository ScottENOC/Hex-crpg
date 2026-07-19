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

    test('a gate arch marks the Diplomatic Quarter entrance and a fountain anchors the central plaza', async ({ page }) => {
        await createCharacter(page);
        const result = await page.evaluate(() => {
            const gate = window.campaign2DiplomaticGateCenter;
            const plaza = window.campaign2DiplomaticPlazaCenter;
            return {
                gateType: window.tileObjects[`${gate.q},${gate.r}`]?.type,
                plazaTerrain: window.getTerrainAt(plaza.q, plaza.r).name,
                fountainType: window.tileObjects[`${plaza.q},${plaza.r}`]?.type,
            };
        });
        expect(result.gateType).toBe('gate_arch');
        expect(result.plazaTerrain).toBe('Path');
        expect(result.fountainType).toBe('fountain');
    });

    test('the elven embassy quest: A Gift of Green is offered, tracked, and completed on turning in 3 herbs', async ({ page }) => {
        await createCharacter(page);
        const before = await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(npc);
            return document.getElementById('dialogue-options').children.length;
        });
        expect(before).toBeGreaterThan(0);
        await clickDialogueOption(page, "I'll bring you some herbs");
        const offered = await page.evaluate(() => window.questLog.find(q => q.id === 'elven_gift')?.status);
        expect(offered).toBe('active');

        const result = await page.evaluate(() => {
            window.party[0].inventory.push('herbs', 'herbs', 'herbs');
            const npc = window.entities.find(e => e.name === 'Ambassador Elarion');
            window.npcDialogueTrees.elven_ambassador(npc);
            return document.getElementById('dialogue-options').children.length;
        });
        expect(result).toBeGreaterThan(0);
        await clickDialogueOption(page, "Here you go");
        const after = await page.evaluate(() => ({
            status: window.questLog.find(q => q.id === 'elven_gift')?.status,
            herbsLeft: window.party[0].inventory.filter(i => i === 'herbs').length,
        }));
        expect(after.status).toBe('completed');
        expect(after.herbsLeft).toBe(0);
    });

    test('the cathedral quest: Whispers of the Crimson Court — reading the hidden grave grants the fang, turning it in completes the quest', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'High Cleric Adelram');
            window.npcDialogueTrees.high_cleric(npc);
        });
        await clickDialogueOption(page, "I'll look into it");
        const offered = await page.evaluate(() => window.questLog.find(q => q.id === 'crimson_court')?.status);
        expect(offered).toBe('active');

        await page.evaluate(() => window.readVampireGrave());
        await clickDialogueOption(page, 'Take the fang');
        const hasFang = await page.evaluate(() => window.party[0].inventory.includes('ashen_fang'));
        expect(hasFang).toBe(true);

        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'High Cleric Adelram');
            window.npcDialogueTrees.high_cleric(npc);
        });
        await clickDialogueOption(page, 'Hand it over');
        const final = await page.evaluate(() => ({
            status: window.questLog.find(q => q.id === 'crimson_court')?.status,
            hasFang: window.party[0].inventory.includes('ashen_fang'),
            confirmed: window.vampireLeadConfirmed,
        }));
        expect(final.status).toBe('completed');
        expect(final.hasFang).toBe(false);
        expect(final.confirmed).toBe(true);
    });

    test('the Aldenreach embassy quest completes only after the message is actually delivered to Elder Marta', async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Ambassador Cassia Wren');
            window.npcDialogueTrees.aldenreach_ambassador(npc);
        });
        await clickDialogueOption(page, "I'll carry your word");
        const notDelivered = await page.evaluate(() => window.questLog.find(q => q.id === 'aldenreach_message')?.delivered);
        expect(notDelivered).toBeFalsy();

        await page.evaluate(() => {
            const marta = window.entities.find(e => e.name === 'Elder Marta Wynfield');
            window.npcDialogueTrees.marta_wynfield(marta);
        });
        const delivered = await page.evaluate(() => window.questLog.find(q => q.id === 'aldenreach_message')?.delivered);
        expect(delivered).toBe(true);

        await page.evaluate(() => {
            const npc = window.entities.find(e => e.name === 'Ambassador Cassia Wren');
            window.npcDialogueTrees.aldenreach_ambassador(npc);
        });
        await clickDialogueOption(page, 'They landed');
        const status = await page.evaluate(() => window.questLog.find(q => q.id === 'aldenreach_message')?.status);
        expect(status).toBe('completed');
    });
});
