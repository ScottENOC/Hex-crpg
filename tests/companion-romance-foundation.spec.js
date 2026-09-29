const { test, expect } = require('@playwright/test');
const { createCharacter, readDialogue } = require('./helpers.js');

async function waitForRomance(page) {
    await page.waitForFunction(() => !!window.companionAffinity && !!window.companionRomance);
}

test.describe('companion romance foundation', () => {
    test('canonical orientations and relationship styles stay distinct', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForRomance(page);

        const profiles = await page.evaluate(() => {
            const names = ['Wren Talbot', 'Ser Aldric Thorne', 'Fenn Oakheart', 'Reyna Fletcher', 'Mirabel Quill', 'Brother Alden'];
            return Object.fromEntries(names.map(name => [name, {
                compatibility: window.companionAffinity.compatibilityFor(name),
                style: window.companionAffinity.profileFor(name).relationshipStyle,
            }]));
        });

        expect(profiles['Wren Talbot'].compatibility.attractionCap).toBe(30);
        expect(profiles['Wren Talbot'].style.romanticExclusivity).toBe('exclusive');
        expect(profiles['Ser Aldric Thorne'].compatibility.attractionCap).toBe(100);
        expect(profiles['Ser Aldric Thorne'].style.sexualExclusivity).toBe('exclusive');
        expect(profiles['Fenn Oakheart'].compatibility.attractionCap).toBe(100);
        expect(profiles['Fenn Oakheart'].style.groupRelationships).toBe(true);
        expect(profiles['Reyna Fletcher'].compatibility.attractionCap).toBe(100);
        expect(profiles['Reyna Fletcher'].style.romanticExclusivity).toBe('open');
        expect(profiles['Mirabel Quill'].compatibility.attractionCap).toBe(100);
        expect(profiles['Mirabel Quill'].style.sexualExclusivity).toBe('open');
        expect(profiles['Brother Alden'].compatibility.attractionCap).toBe(0);
        expect(profiles['Brother Alden'].compatibility.romanticCap).toBe(100);
        expect(profiles['Brother Alden'].style.romanticExclusivity).toBe('exclusive');
        expect(profiles['Brother Alden'].style.sexualExclusivity).toBe('open');
    });

    test('Wren same-sex max state is love/desire conflict, not zero attraction', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForRomance(page);

        const state = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.adjustCompanionAffinity(wren, { friendship: 200, romanticBond: 200, attraction: 200 }, 'max test');
            window.setCompanionRelationship(wren, { familiarity: 90, trust: 90 }, 'max test');
            wren.characterArc = wren.characterArc || {};
            wren.characterArc.security = 50;
            return {
                affinity: window.getCompanionAffinity(wren),
                conflict: window.companionRomance.wrenConflictState(),
                interpretation: window.companionRomance.interpretRelationship(wren),
            };
        });

        expect(state.affinity.romanticBond).toBe(85);
        expect(state.affinity.attraction).toBe(30);
        expect(state.conflict.active).toBe(true);
        expect(state.conflict.attachment).toBe('secure');
        expect(state.interpretation.mode).toBe('love_desire_conflict');
    });

    test('Wren conflict dialogue states love and limited attraction consistently', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForRomance(page);

        await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.adjustCompanionAffinity(wren, { friendship: 200, romanticBond: 200, attraction: 200 }, 'dialogue test');
            window.setCompanionRelationship(wren, { familiarity: 90, trust: 90 }, 'dialogue test');
            wren.characterArc = wren.characterArc || {};
            wren.characterArc.security = 50;
            window.companionRomance.openWrenConflictConversation();
        });

        const dialogue = await readDialogue(page);
        expect(dialogue.message).toContain('I know I love you');
        expect(dialogue.message).toContain('I am attracted to you — some');
        expect(dialogue.message).toContain('isn’t the same kind of wanting');
        expect(dialogue.options.some(text => text.includes('What you feel is enough'))).toBe(true);
        expect(dialogue.options.some(text => text.includes('same way'))).toBe(true);
    });

    test('open agreements permit disclosed outside sex but treat secrecy as a breach', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForRomance(page);

        const result = await page.evaluate(() => {
            const fenn = { name: 'Fenn Oakheart', gender: 'male', playerRelationship: { familiarity: 60, trust: 60 } };
            window.party.push(fenn);
            window.companionAffinity.ensureAffinity(fenn);
            window.companionRomance.commitRelationship(fenn);
            const disclosed = window.companionRomance.recordOutsideConnection(fenn, 'Mirabel Quill', 'sex', { disclosed: true });
            const hidden = window.companionRomance.recordOutsideConnection(fenn, 'Mirabel Quill', 'sex', { disclosed: false });
            return { disclosed, hidden, agreement: window.companionRomance.ensureAgreement(fenn) };
        });

        expect(result.disclosed.allowed).toBe(true);
        expect(result.disclosed.breach).toBe(false);
        expect(result.hidden.breach).toBe(true);
        expect(result.agreement.state).toBe('strained');
    });

    test('secure Wren can end an exclusive relationship after a breach', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForRomance(page);

        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            wren.characterArc = wren.characterArc || {};
            wren.characterArc.security = 50;
            window.companionRomance.commitRelationship(wren);
            return window.companionRomance.recordOutsideConnection(wren, 'Reyna Fletcher', 'sex', { disclosed: true });
        });

        expect(result.breach).toBe(true);
        expect(result.agreement.state).toBe('ended');
    });
});
