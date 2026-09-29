const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Developer NPC inspector', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.waitForFunction(() => !!window.devNpcInspector && !!window.NPC_PROGRESSION_MODES);
    });

    test('installs a dev-only toggle and keeps it off by default', async ({ page }) => {
        const state = await page.evaluate(() => ({
            button: document.getElementById('cheat-npc-inspector-btn')?.textContent || '',
            enabled: window.devNpcInspector.enabled,
            badgeDisplay: document.getElementById('dev-npc-inspector-badge')?.style.display,
        }));
        expect(state.button).toContain('NPC Inspector');
        expect(state.enabled).toBe(false);
        expect(state.badgeDisplay).toBe('none');
    });

    test('reports authored class history, budget, skills and legal equipment', async ({ page }) => {
        const report = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Inspector Veteran', race: 'human', gender: 'female',
                hex: { q: 420, r: 420 }, progressionMode: 'authored',
                classLevels: ['fighter', 'fighter'],
                skillPicks: ['health', 'sword_hit', 'sword_dmg', 'shield_proficiency'],
                equipment: ['sword', 'wooden_shield', 'medium_armor'], side: 'enemy',
            });
            return window.devNpcInspector.describeEntity(npc);
        });

        expect(report.progressionMode).toBe('authored');
        expect(report.classSequence).toEqual(['fighter', 'fighter']);
        expect(report.classCounts).toEqual({ fighter: 2 });
        expect(report.unspent).toBe(0);
        expect(report.allocated).toBe(report.budget);
        expect(report.equipmentWarnings).toEqual([]);
        expect(report.gear.some(g => g.itemId === 'sword')).toBe(true);
        expect(report.gear.some(g => g.itemId === 'medium_armor')).toBe(true);
        expect(report.skills.some(s => s.id === 'sword_hit')).toBe(true);
    });

    test('shows civilians as genuinely classless with zero budget', async ({ page }) => {
        const report = await page.evaluate(() => {
            const npc = window.buildNPC({
                name: 'Inspector Clerk', title: 'Clerk', race: 'human', gender: 'male',
                hex: { q: 421, r: 420 }, classLevels: [], skillPicks: [], equipment: [], side: 'neutral',
            });
            return window.devNpcInspector.describeEntity(npc);
        });
        expect(report.progressionMode).toBe('civilian');
        expect(report.classSequence).toEqual([]);
        expect(report.budget).toBe(0);
        expect(report.allocated).toBe(0);
        expect(report.unspent).toBe(0);
        expect(report.skills).toEqual([]);
    });

    test('opens the responsive inspector and produces a copyable text report', async ({ page }) => {
        const result = await page.evaluate(() => {
            const npc = window.buildCanonicalCompanionData('Ser Aldric Thorne');
            window.devNpcInspector.openForEntity(npc);
            return {
                visible: document.getElementById('dev-npc-inspector-modal')?.style.display,
                heading: document.getElementById('dev-npc-inspector-name')?.textContent,
                body: document.getElementById('dev-npc-inspector-body')?.innerText,
                report: window.devNpcInspector.formatReport(npc),
            };
        });
        expect(result.visible).toBe('block');
        expect(result.heading).toBe('Ser Aldric Thorne');
        expect(result.body).toContain('Fighter → Cleric');
        expect(result.body).toContain('Unspent');
        expect(result.report).toContain('Classes: Fighter → Cleric');
        expect(result.report).toContain('unspent');
        expect(result.report).toContain('Warnings: none');
    });

    test('toggle persists and exposes an on-screen long-press badge', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.devNpcInspector.setEnabled(true);
            return {
                enabled: window.devNpcInspector.enabled,
                button: document.getElementById('cheat-npc-inspector-btn')?.textContent,
                badge: document.getElementById('dev-npc-inspector-badge')?.style.display,
                stored: localStorage.getItem('hex_crpg_dev_npc_inspector'),
            };
        });
        expect(result.enabled).toBe(true);
        expect(result.button).toContain('ON');
        expect(result.badge).toBe('block');
        expect(result.stored).toBe('1');
    });
});