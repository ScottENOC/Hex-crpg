const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Character appearance presets', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.__appearancePresetsReady && !!window.clothingSystem);
    });

    test('applies the authored Scenario 2 Wren appearance exactly', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.currentCampaign = '2';
            const wren = window.createCharacterData('human', 'fighter', 'Wren Talbot', 'female', 'pc_1');
            const colours = wren.clothingColors;
            return {
                preset: wren.appearancePresetApplied,
                bodyType: wren.bodyType,
                hairStyle: wren.hairStyle,
                hairHue: wren.hairHue,
                hairSaturation: wren.hairSaturation,
                hairValue: wren.hairValue,
                hairSatMult: wren.hairSatMult,
                hairLightMult: wren.hairLightMult,
                skin: [wren.skinHue, wren.skinSaturation, wren.skinLightness],
                equipped: {
                    bra: wren.equipped.bra,
                    underwear: wren.equipped.underwear,
                    shirt: wren.equipped.shirt,
                    pants: wren.equipped.pants,
                },
                bra: colours.underwear_bra_strapless,
                underwear: colours.underwear_briefs,
                shirt: colours.top_shirt_f,
                pants: colours.pants_trousers,
                inventory: wren.inventory,
            };
        });

        expect(result.preset).toBe('scenario2_wren');
        expect(result.bodyType).toBe('average');
        expect(result.hairStyle).toBe('braid');
        expect([result.hairHue, result.hairSaturation, result.hairValue]).toEqual([218, 71, 56]);
        expect(result.hairSatMult).toBeCloseTo(0.71, 6);
        expect(result.hairLightMult).toBeCloseTo(0.56, 6);
        expect(result.skin[0]).toBeCloseTo(22.5, 6);
        expect(result.skin[1]).toBeCloseTo(0.46, 6);
        expect(result.skin[2]).toBeCloseTo(0.585, 6);

        expect(result.equipped).toEqual({
            bra: 'underwear_bra_strapless',
            underwear: 'underwear_briefs',
            shirt: 'top_shirt_f',
            pants: 'pants_trousers',
        });
        expect(result.bra.dark).toEqual({ hue:55, saturation:58, value:20, opacity:0.75 });
        expect(result.bra.light).toEqual({ hue:47, saturation:100, value:100, opacity:1 });
        expect(result.underwear.dark).toEqual({ hue:55, saturation:58, value:20, opacity:0.75 });
        expect(result.underwear.light).toEqual({ hue:47, saturation:100, value:100, opacity:1 });
        expect(result.shirt.dark).toEqual({ hue:110, saturation:60, value:42, opacity:0.75 });
        expect(result.shirt.light).toEqual({ hue:347, saturation:100, value:100, opacity:1 });
        expect(result.pants.base).toEqual({ hue:110, saturation:60, value:42, opacity:1 });
        expect(result.pants.light).toEqual({ hue:347, saturation:100, value:100, opacity:1 });
        expect(result.inventory).toEqual(expect.arrayContaining([
            'underwear_bra_strapless', 'underwear_briefs', 'top_shirt_f', 'pants_trousers'
        ]));
    });

    test('keeps preset use optional for ordinary NPCs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildNPC({
                name:'Unpreset Villager', race:'human', gender:'female',
                hex:{q:470,r:470}, classLevels:[], skillPicks:[], equipment:[], side:'neutral',
            });
            return {
                applied: npc.appearancePresetApplied || null,
                hasHair: Number.isFinite(npc.hairHue),
                hasBodyType: !!npc.bodyType,
            };
        });
        expect(result.applied).toBeNull();
        expect(result.hasHair).toBe(true);
        expect(result.hasBodyType).toBe(true);
    });

    test('supports an explicit preset id on any buildNPC spec', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.registerCharacterAppearancePreset('test_authored_look', {
                bodyType:'broad',
                hair:{style:'curly',hue:123,saturation:80,value:65},
                skin:{naturalSlider:50},
            });
            const npc = window.buildNPC({
                name:'Preset Villager', race:'human', gender:'female', appearancePreset:'test_authored_look',
                hex:{q:471,r:470}, classLevels:[], skillPicks:[], equipment:[], side:'neutral',
            });
            return {
                applied:npc.appearancePresetApplied,
                bodyType:npc.bodyType,
                hair:[npc.hairStyle,npc.hairHue,npc.hairSaturation,npc.hairValue],
            };
        });
        expect(result.applied).toBe('test_authored_look');
        expect(result.bodyType).toBe('broad');
        expect(result.hair).toEqual(['curly',123,80,65]);
    });

    test('exposes trousers Main and Trim while preserving the legacy base layer id', async ({ page }) => {
        const layers = await page.evaluate(() => window.clothingSystem.getItemSpec('pants_trousers').layers.map(layer => ({
            id:layer.id, label:layer.label, sourceTone:layer.sourceTone
        })));
        expect(layers).toEqual([
            { id:'base', label:'Main', sourceTone:'darkGreen' },
            { id:'light', label:'Trim', sourceTone:'lightGreen' },
        ]);
    });
});