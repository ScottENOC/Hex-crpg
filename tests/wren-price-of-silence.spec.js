const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function waitForChapter(page) {
    await page.waitForFunction(() => {
        const wren = window.party?.find(p => p.name === 'Wren Talbot');
        return !!wren && !!window.wrenPriceOfSilence && !!window.companionRomance;
    });
}

async function completeParentsQuest(page) {
    await page.evaluate(() => {
        window.questLog = window.questLog || [];
        let q = window.questLog.find(entry => entry.id === 'wren_parents');
        if (!q) {
            q = { id: 'wren_parents', title: 'The Long Silence', status: 'completed', clues: {}, clueOrder: [] };
            window.questLog.push(q);
        }
        q.status = 'completed';
        q.completedAt = window.worldSeconds || 0;
    });
}

test.describe('Wren: The Price of Silence', () => {
    test('starts after The Long Silence and carries the Reddale routing lead', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForChapter(page);
        await completeParentsQuest(page);

        const result = await page.evaluate(() => {
            const q = window.wrenPriceOfSilence.ensureQuest({ announce: false });
            return {
                title: q.title,
                status: q.status,
                stage: q.stage,
                hasMark: !!q.clues.reddale_mark,
                description: q.description,
            };
        });

        expect(result.title).toBe('The Price of Silence');
        expect(result.status).toBe('active');
        expect(result.stage).toBe('investigate_reddale');
        expect(result.hasMark).toBe(true);
        expect(result.description).toContain('Reddale');
    });

    test('existing Ironbond espionage evidence replaces a duplicate infiltration', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForChapter(page);
        await completeParentsQuest(page);

        const result = await page.evaluate(() => {
            const q = window.wrenPriceOfSilence.ensureQuest({ announce: false });
            window.questLog.push({ id: 'spy_on_guild', title: 'Eyes on the Guildhouse', status: 'completed' });
            window.wrenPriceOfSilence.syncExistingReddaleEvidence();
            return {
                archive: q.clues.guild_archive,
                canResolve: window.wrenPriceOfSilence.canResolve(q),
            };
        });

        expect(result.archive).toBeTruthy();
        expect(result.archive.source).toContain('Ironbond ledgers');
        expect(result.canResolve).toBe(true);
    });

    test('the ordinary investigation can reach the archive without specialist skills', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForChapter(page);
        await completeParentsQuest(page);

        const result = await page.evaluate(() => {
            const q = window.wrenPriceOfSilence.ensureQuest({ announce: false });
            window.wrenPriceOfSilence.addClue('nella_drover', 'test');
            window.wrenPriceOfSilence.addClue('night_watch', 'test');
            window.wrenPriceOfSilence.addClue('baron_tariff_roll', 'test');
            window.wrenPriceOfSilence.addClue('guild_archive', 'ordinary confrontation');
            return {
                count: window.wrenPriceOfSilence.evidenceCount(q),
                canResolve: window.wrenPriceOfSilence.canResolve(q),
                stage: q.stage,
            };
        });

        expect(result.count).toBeGreaterThanOrEqual(4);
        expect(result.canResolve).toBe(true);
        expect(result.stage).toBe('reckoning');
    });

    test('resolution leads onward to Silverhart instead of ending Wren story', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'male' });
        await waitForChapter(page);
        await completeParentsQuest(page);

        const result = await page.evaluate(() => {
            const q = window.wrenPriceOfSilence.ensureQuest({ announce: false });
            window.wrenPriceOfSilence.addClue('guild_archive', 'test');
            const resolved = window.wrenPriceOfSilence.resolveChapter('proof');
            return {
                resolved,
                status: q.status,
                stage: q.stage,
                resolution: q.resolution,
                lead: q.silverhartLead,
                description: q.description,
            };
        });

        expect(result.resolved).toBe(true);
        expect(result.status).toBe('completed');
        expect(result.stage).toBe('silverhart_lead');
        expect(result.resolution).toBe('proof');
        expect(result.lead).toContain('Crown Transport Office');
        expect(result.description).toContain('Silverhart');
    });

    test('same-sex high-romance Wren aftermath uses the coherent love-desire conflict', async ({ page }) => {
        await createCharacter(page, { campaign: '2', gender: 'female' });
        await waitForChapter(page);
        await completeParentsQuest(page);

        const result = await page.evaluate(() => {
            const wren = window.party.find(p => p.name === 'Wren Talbot');
            window.adjustCompanionAffinity(wren, { friendship: 200, romanticBond: 200, attraction: 200 }, 'test');
            window.setCompanionRelationship(wren, { familiarity: 80, trust: 80 }, 'test');
            window.wrenCharacterArc.ensureWrenArc();
            wren.characterArc.security = 45;
            return {
                mode: window.wrenPriceOfSilence.aftermathMode(),
                conflict: window.companionRomance.wrenConflictState(),
                affinity: window.getCompanionAffinity(wren),
            };
        });

        expect(result.mode).toBe('love_desire_conflict');
        expect(result.conflict.active).toBe(true);
        expect(result.conflict.attachment).toBe('secure');
        expect(result.affinity.romanticBond).toBe(85);
        expect(result.affinity.attraction).toBe(30);
    });
});
