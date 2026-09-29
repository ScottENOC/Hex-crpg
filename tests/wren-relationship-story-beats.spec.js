const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForWrenRelationships(page) {
    await page.waitForFunction(() => {
        const wren = window.party?.find(p => p.name === 'Wren Talbot');
        return !!wren &&
            !!window.companionRelationshipProgression &&
            !!window.noteWrenDispositionEvent &&
            !!window.handleCompanionDeparture?.__anchorCompanionAware &&
            !!window.resolveShakedown?.__wrenRelationshipAware;
    });
}

test.describe('Wren relationship story beats', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page, { campaign: '2' });
        await waitForWrenRelationships(page);
    });

    test('Wren is the anchor companion: zero approval does not remove her', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.companionAttitude['Wren Talbot'] = 1;
            window.adjustCompanionAttitude('Wren Talbot', -10, 'test anger');
            return {
                stillPresent: window.party.some(p => p.name === 'Wren Talbot'),
                approval: window.companionAttitude['Wren Talbot'],
                anchor: window.companionRelationshipProgression.isAnchorCompanion(wren),
            };
        });

        expect(result.anchor).toBe(true);
        expect(result.approval).toBe(0);
        expect(result.stillPresent).toBe(true);
    });

    test('authored disposition events change approval and trust only once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren);
            const beforeApproval = before.approval;
            const beforeTrust = before.trust;

            window.noteWrenDispositionEvent('test_once', {
                approval: -7,
                trust: -9,
                reason: 'test event',
            });
            const once = window.getCompanionRelationship(wren);
            window.noteWrenDispositionEvent('test_once', {
                approval: -7,
                trust: -9,
                reason: 'test event',
            });
            const twice = window.getCompanionRelationship(wren);

            return { beforeApproval, beforeTrust, once, twice };
        });

        expect(result.once.approval).toBe(result.beforeApproval - 7);
        expect(result.once.trust).toBe(result.beforeTrust - 9);
        expect(result.twice.approval).toBe(result.once.approval);
        expect(result.twice.trust).toBe(result.once.trust);
    });

    test('standing aside during the opening shakedown costs Wren trust', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren);
            window.resolveShakedown('stay_out');
            const after = window.getCompanionRelationship(wren);
            return { before, after };
        });

        expect(result.after.approval).toBe(result.before.approval - 4);
        expect(result.after.trust).toBe(result.before.trust - 3);
    });

    test('a peaceful end to the goblin threat improves Wren trust once', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren);
            window.questLog = (window.questLog || []).filter(q => q.id !== 'goblin_threat');
            window.questLog.push({ id: 'goblin_threat', status: 'completed', resolution: 'goblin_diplomacy' });
            window.companionRelationshipProgression.checkWrenStoryState();
            const once = window.getCompanionRelationship(wren);
            window.companionRelationshipProgression.checkWrenStoryState();
            const twice = window.getCompanionRelationship(wren);
            return { before, once, twice };
        });

        expect(result.once.approval).toBe(result.before.approval + 8);
        expect(result.once.trust).toBe(result.before.trust + 6);
        expect(result.twice.approval).toBe(result.once.approval);
        expect(result.twice.trust).toBe(result.once.trust);
    });

    test('lichdom can destroy Wren trust without removing the anchor companion', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.setCompanionRelationship(wren, { trust: 85, approval: 50 }, 'test setup');
            window.playerIsLich = true;
            window.companionRelationshipProgression.checkWrenStoryState();
            const after = window.getCompanionRelationship(wren);
            return {
                after,
                stillPresent: window.party.some(p => p.name === 'Wren Talbot'),
            };
        });

        expect(result.after.approval).toBe(0);
        expect(result.after.trust).toBe(0);
        expect(result.stillPresent).toBe(true);
    });

    test('keeping the Millbrook promise is a substantial trust event', async ({ page }) => {
        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            const before = window.getCompanionRelationship(wren);
            window.companionRelationshipProgression.promiseWrenParentSearch();
            const promised = window.getCompanionRelationship(wren);

            const center = window.campaign2MillbrookCenter;
            const playerEntity = window.entities.find(e => e.side === 'player' && !e.rider);
            if (center && playerEntity) playerEntity.hex = { ...center };
            window.companionRelationshipProgression.checkWrenStoryState();
            const arrived = window.getCompanionRelationship(wren);

            return {
                before,
                promised,
                arrived,
                reached: !!wren.wrenParentsReachedMillbrook,
            };
        });

        expect(result.promised.approval).toBe(result.before.approval + 2);
        expect(result.promised.trust).toBe(result.before.trust + 1);
        expect(result.reached).toBe(true);
        expect(result.arrived.approval).toBe(result.promised.approval + 5);
        expect(result.arrived.trust).toBe(result.promised.trust + 10);
    });
});