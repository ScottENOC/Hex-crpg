const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test('diagnose errors between directional body and armour draw', async ({ page }) => {
    const consoleMessages = [];
    const pageErrors = [];
    page.on('console', msg => consoleMessages.push({ type:msg.type(), text:msg.text() }));
    page.on('pageerror', err => pageErrors.push(String(err?.stack || err)));

    await createCharacter(page, { race:'human', gender:'female' });
    await page.waitForFunction(() => window.__directionalRigHandoffInstalled === true
        && window.gameVisuals?.humanLight?.complete
        && window.gameVisuals.humanLight.naturalWidth > 0);

    const state = await page.evaluate(() => {
        const target = (window.entities || []).find(e => e?.alive && e.race === 'human' && e.gender === 'female' && e.side === 'player')
            || (window.entities || []).find(e => e?.alive && e.race === 'human' && e.gender === 'female');
        if (!target) return { error:'no target' };
        target.equipped = target.equipped || {};
        target.equipped.armor = 'light_armor';
        window.clothingDisplayMode = 'armor';
        window.__directionalRigHandoffLastArmour = null;
        window.drawMap();
        window.renderEntities();
        return {
            name:target.name,
            equipped:{...target.equipped},
            bodyType:target.bodyType,
            hairStyle:target.hairStyle,
            armourComplete:!!window.gameVisuals.humanLight?.complete,
            armourNaturalWidth:window.gameVisuals.humanLight?.naturalWidth || 0,
            rigid:window.__directionalRigHandoffLastArmour ? {
                compositionSource:window.__directionalRigHandoffLastArmour.compositionSource,
            } : null,
        };
    });

    console.log('HUMAN_FEMALE_RENDER_ERROR_STATE', JSON.stringify(state));
    console.log('HUMAN_FEMALE_RENDER_CONSOLE', JSON.stringify(consoleMessages));
    console.log('HUMAN_FEMALE_RENDER_PAGE_ERRORS', JSON.stringify(pageErrors));

    expect(state.error).toBeUndefined();
    // Diagnostic fails intentionally while rigid armour is absent, leaving
    // console/page-error evidence in the Actions log.
    expect(state.rigid).toBeTruthy();
});
