const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.WildernessFactionBeliefs && !!window.WildernessIncidents && !!window.WildernessConsequences, null, { timeout: 10000 });
}

test.describe('wilderness faction beliefs and double-agent play', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('multiple factions can trust the player enough to offer contradictory options simultaneously', async ({ page }) => {
        const result = await page.evaluate(() => {
            const factions = window.factions;
            factions.goblin_tribe.standing = 25; factions.goblin_tribe.knowledge = 30;
            factions.thieves_guild.standing = 30; factions.thieves_guild.knowledge = 30;
            factions.silverhart_kingdom.standing = 25; factions.silverhart_kingdom.knowledge = 40;
            factions.necromancer_cult.standing = 20; factions.necromancer_cult.knowledge = 20;
            window.playerIsLich = false;

            const incident = window.WildernessIncidents.spawnIncident('stranded_merchant', { q: 105, r: 48 }, {
                force:true,
                provenance:{ person:'Kella Marr', origin:'Reddale', destination:'Reddale', cargo:'cloth' }
            });
            const choices = window.WildernessIncidents.templates.stranded_merchant.choices(incident);
            return choices.map(x => x.outcome).filter(Boolean);
        });
        expect(result).toContain('goblin_intel');
        expect(result).toContain('guild_diversion');
        expect(result).toContain('cult_intel');
        expect(result).toContain('silverhart_route_warning');
        expect(result).toContain('escort');
    });

    test('contradictory claims coexist because factions do not know the player true intentions', async ({ page }) => {
        const result = await page.evaluate(() => {
            const b = window.WildernessFactionBeliefs;
            b.recordClaim('goblin_tribe','working_for_us',2,'player_statement');
            b.recordClaim('silverhart_kingdom','working_against_goblins',2,'player_statement');
            b.recordClaim('thieves_guild','working_for_us',1,'player_statement');
            return {
                goblin:b.factionView('goblin_tribe').belief.claims,
                silverhart:b.factionView('silverhart_kingdom').belief.claims,
                guild:b.factionView('thieves_guild').belief.claims,
                exposures:b.ledger().exposures.length,
            };
        });
        expect(result.goblin.working_for_us).toBe(2);
        expect(result.silverhart.working_against_goblins).toBe(2);
        expect(result.guild.working_for_us).toBe(1);
        expect(result.exposures).toBe(0);
    });

    test('doing a job for one faction does not silently revoke access to rivals', async ({ page }) => {
        const result = await page.evaluate(() => {
            const factions = window.factions;
            factions.goblin_tribe.standing = 20; factions.goblin_tribe.knowledge = 20;
            factions.silverhart_kingdom.standing = 20; factions.silverhart_kingdom.knowledge = 20;
            factions.thieves_guild.standing = 25; factions.thieves_guild.knowledge = 20;

            const incident = window.WildernessIncidents.spawnIncident('stranded_merchant', { q: 106, r: 49 }, {
                force:true,
                provenance:{ person:'Hobb Vane', origin:'Reddale', destination:'Reddale', cargo:'grain' }
            });
            window.WildernessIncidents.resolveIncident(incident.id,'goblin_intel');
            const b = window.WildernessFactionBeliefs;
            return {
                goblinClaim:b.factionView('goblin_tribe').belief.claims.working_for_us || 0,
                silverhartAccess:b.silverhartAccess(),
                guildAccess:b.guildAccess(),
                silverhartExposed:b.factionView('silverhart_kingdom').belief.exposed,
                guildExposed:b.factionView('thieves_guild').belief.exposed,
            };
        });
        expect(result.goblinClaim).toBeGreaterThan(0);
        expect(result.silverhartAccess).toBe(true);
        expect(result.guildAccess).toBe(true);
        expect(result.silverhartExposed).toBe(false);
        expect(result.guildExposed).toBe(false);
    });

    test('exposure is faction-local unless information is explicitly propagated', async ({ page }) => {
        const result = await page.evaluate(() => {
            const factions = window.factions;
            factions.goblin_tribe.standing = 20; factions.goblin_tribe.knowledge = 20;
            factions.silverhart_kingdom.standing = 20; factions.silverhart_kingdom.knowledge = 20;
            const b = window.WildernessFactionBeliefs;
            b.recordClaim('goblin_tribe','working_for_us',1);
            b.recordClaim('silverhart_kingdom','working_against_goblins',1);
            b.expose('silverhart_kingdom','captured letter proved contact with Skarn-tooth');
            return {
                silverhartExposed:b.factionView('silverhart_kingdom').belief.exposed,
                goblinExposed:b.factionView('goblin_tribe').belief.exposed,
                silverhartAccess:b.silverhartAccess(),
                goblinAccess:b.goblinAccess(),
            };
        });
        expect(result.silverhartExposed).toBe(true);
        expect(result.goblinExposed).toBe(false);
        expect(result.silverhartAccess).toBe(false);
        expect(result.goblinAccess).toBe(true);
    });

    test('a Silverhart-facing claim can be made without revealing a simultaneous goblin relationship', async ({ page }) => {
        const result = await page.evaluate(() => {
            const factions = window.factions;
            factions.goblin_tribe.standing = 25; factions.goblin_tribe.knowledge = 25;
            factions.silverhart_kingdom.standing = 25; factions.silverhart_kingdom.knowledge = 25;
            const incident = window.WildernessIncidents.spawnIncident('injured_traveller', { q: 108, r: 50 }, {
                force:true,
                provenance:{ person:'Orla Dane', origin:'Millbrook', destination:'Hollowmere', cargo:'tools' }
            });
            window.WildernessFactionBeliefs.recordClaim('goblin_tribe','working_for_us',1,'private_meeting');
            window.WildernessIncidents.resolveIncident(incident.id,'silverhart_claim');
            return {
                goblin:window.WildernessFactionBeliefs.factionView('goblin_tribe').belief.claims,
                silverhart:window.WildernessFactionBeliefs.factionView('silverhart_kingdom').belief.claims,
            };
        });
        expect(result.goblin.working_for_us).toBe(1);
        expect(result.silverhart.working_against_raiders).toBe(1);
    });
});