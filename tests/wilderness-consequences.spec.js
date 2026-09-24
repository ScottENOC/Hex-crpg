const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.WildernessIncidents && !!window.WildernessConsequences, null, { timeout: 10000 });
}

test.describe('wilderness consequence ledger', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('a reunited child is remembered as a flavour outcome without granting region stats or gold', async ({ page }) => {
        const result = await page.evaluate(() => {
            const beforeGold = window.player.gold;
            const beforeSecurity = window.regions.hollowmere.security;
            const beforeProsperity = window.regions.hollowmere.prosperity;
            const incident = window.WildernessIncidents.spawnIncident('lost_child', { q: 90, r: 30 }, {
                force:true, regionId:'hollowmere', provenance:{ person:'Milly Rowan', origin:'Hollowmere', cargo:'none' }
            });
            window.WildernessIncidents.resolveIncident(incident.id, 'reunite');
            const ledger = window.WildernessConsequences.ensureLedger();
            return {
                resolution: incident.resolution,
                childCount: window.WildernessConsequences.count('child_reunited'),
                kindnessCount: window.WildernessConsequences.count('small_kindness'),
                outcome: window.WildernessConsequences.personOutcome('Milly Rowan'),
                goldChange: window.player.gold - beforeGold,
                securityChange: window.regions.hollowmere.security - beforeSecurity,
                prosperityChange: window.regions.hollowmere.prosperity - beforeProsperity,
                lastKind: ledger.events.at(-1)?.kind,
            };
        });
        expect(result.resolution).toBe('reunited');
        expect(result.childCount).toBe(1);
        expect(result.kindnessCount).toBe(1);
        expect(result.outcome.tags).toContain('child_reunited');
        expect(result.goldChange).toBe(0);
        expect(result.securityChange).toBe(0);
        expect(result.prosperityChange).toBe(0);
        expect(result.lastKind).toBe('flavour');
    });

    test('helping merchants records safe arrivals by destination and unlocks later content gates', async ({ page }) => {
        const result = await page.evaluate(() => {
            const w = window.WildernessIncidents;
            for (const name of ['Jessa Marr','Torin Vale']) {
                const incident = w.spawnIncident('stranded_merchant', { q: 92 + Math.random()*2, r: 36 + Math.random()*2 }, {
                    force:true, regionId:'aldervale', provenance:{ person:name, origin:'Reddale', destination:'Reddale', cargo:'cloth' }
                });
                w.resolveIncident(incident.id, 'escort');
            }
            const c = window.WildernessConsequences;
            return {
                merchants: c.count('merchant_arrived'),
                safe: c.count('safe_arrival'),
                destination: c.destinationStats('Reddale'),
                contactGate: c.meetsGate({ unlock:'merchant_contacts' }),
                destinationGate: c.meetsGate({ destination:'Reddale', destinationMetric:'merchants', destinationCount:2 }),
            };
        });
        expect(result.merchants).toBe(2);
        expect(result.safe).toBe(2);
        expect(result.destination.merchants).toBe(2);
        expect(result.destination.arrivals).toBe(2);
        expect(result.contactGate).toBe(true);
        expect(result.destinationGate).toBe(true);
    });

    test('existing V1 rescues flow through the same generic consequence ledger', async ({ page }) => {
        const result = await page.evaluate(() => {
            const incident = window.WildernessIncidents.spawnIncident('injured_traveller', { q: 95, r: 42 }, {
                force:true, regionId:'hollowmere', provenance:{ person:'Hale Fen', origin:'Millbrook', destination:'Hollowmere', cargo:'tools' }
            });
            window.WildernessIncidents.resolveIncident(incident.id, 'help');
            const c = window.WildernessConsequences;
            return {
                resolution:incident.resolution,
                rescued:c.count('traveller_rescued'),
                stats:c.destinationStats('Hollowmere'),
                person:c.personOutcome('Hale Fen'),
            };
        });
        expect(result.resolution).toBe('helped');
        expect(result.rescued).toBe(1);
        expect(result.stats.travellers).toBe(1);
        expect(result.person.tags).toContain('safe_arrival');
    });

    test('predatory outcomes are recorded separately from successful arrivals', async ({ page }) => {
        const result = await page.evaluate(() => {
            const incident = window.WildernessIncidents.spawnIncident('injured_traveller', { q: 96, r: 44 }, {
                force:true, regionId:'hollowmere', provenance:{ person:'Orla Reed', origin:'Millbrook', destination:'Hollowmere', cargo:'herbs' }
            });
            window.WildernessIncidents.resolveIncident(incident.id, 'rob');
            const c = window.WildernessConsequences;
            return { harmed:c.count('traveller_harmed'), predatory:c.count('predatory_act'), safe:c.count('safe_arrival') };
        });
        expect(result.harmed).toBe(1);
        expect(result.predatory).toBe(1);
        expect(result.safe).toBe(0);
    });

    test('aligned players get faction-specific wilderness choices without losing ordinary choices', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.playerAidingGreenskins = true;
            window.factions.thieves_guild.standing = 30;
            window.factions.necromancer_cult.standing = 25;
            window.playerIsLich = false;
            const i = window.WildernessIncidents.spawnIncident('stranded_merchant', { q: 100, r: 45 }, {
                force:true, provenance:{ person:'Sella Pike', origin:'Reddale', destination:'Reddale', cargo:'grain' }
            });
            return window.WildernessIncidents.templates.stranded_merchant.choices(i).map(x => x.outcome);
        });
        expect(result).toContain('escort');
        expect(result).toContain('buy_damaged');
        expect(result).toContain('goblin_intel');
        expect(result).toContain('guild_diversion');
        expect(result).toContain('cult_intel');
    });

    test('goblin intelligence benefits Skarn-tooth and harms human road control instead of using an evil score', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.playerAidingGreenskins = true;
            const w=window.WildernessIncidents;
            const i=w.spawnIncident('stranded_merchant',{q:102,r:47},{force:true,provenance:{person:'Daro Pell',origin:'Reddale',destination:'Reddale',cargo:'salt'}});
            w.resolveIncident(i.id,'goblin_intel');
            const c=window.WildernessConsequences;
            const event=c.ensureLedger().events.at(-1);
            return {
                resolution:i.resolution,
                goblin:c.factionBenefitCount('goblin_tribe'),
                humanHarm:c.factionHarmCount('silverhart_kingdom'),
                tag:c.count('route_intelligence'),
                event,
                morality:c.ensureLedger().counters.morality || 0,
            };
        });
        expect(result.resolution).toBe('goblin_intel');
        expect(result.goblin).toBe(1);
        expect(result.humanHarm).toBe(1);
        expect(result.tag).toBe(1);
        expect(result.event.beneficiaries).toContain('goblin_tribe');
        expect(result.event.harmedFactions).toContain('silverhart_kingdom');
        expect(result.morality).toBe(0);
    });

    test('thieves guild support can build its own wilderness-contact gate', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.factions.thieves_guild.standing=30;
            const w=window.WildernessIncidents;
            for (const n of ['Perrin Moss','Edda Quill']) {
                const i=w.spawnIncident('injured_traveller',{q:110+Math.random(),r:50+Math.random()},{force:true,provenance:{person:n,origin:'Silverhart',destination:'Reddale',cargo:'cloth'}});
                w.resolveIncident(i.id,'guild_route_book');
            }
            const c=window.WildernessConsequences;
            return {
                benefits:c.factionBenefitCount('thieves_guild'),
                gate:c.meetsGate({unlock:'guild_wilderness_contacts'}),
                books:c.count('route_book_taken'),
            };
        });
        expect(result.benefits).toBe(2);
        expect(result.books).toBe(2);
        expect(result.gate).toBe(true);
    });

    test('player lich choices are distinct from serving the necromancer cult', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.playerIsLich=true;
            window.factions.necromancer_cult.standing=80;
            const w=window.WildernessIncidents;
            const i=w.spawnIncident('injured_traveller',{q:116,r:53},{force:true,provenance:{person:'Hale Venn',origin:'Millbrook',destination:'Hollowmere',cargo:'herbs'}});
            const outcomes=w.templates.injured_traveller.choices(i).map(x=>x.outcome);
            w.resolveIncident(i.id,'lich_oath');
            const c=window.WildernessConsequences;
            return {
                outcomes,
                resolution:i.resolution,
                lich:c.factionBenefitCount('player_lich'),
                cult:c.factionBenefitCount('necromancer_cult'),
                claims:c.count('lich_claim'),
            };
        });
        expect(result.outcomes).toContain('lich_oath');
        expect(result.outcomes).not.toContain('cult_grave_intel');
        expect(result.resolution).toBe('lich_oath');
        expect(result.lich).toBe(1);
        expect(result.cult).toBe(0);
        expect(result.claims).toBe(1);
    });

    test('the consequence ledger lives inside the already persisted wilderness store', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.WildernessConsequences.recordOutcome({ kind:'flavour', person:'Test Person', tags:['small_kindness'], note:'test' });
            const store = window.worldMapNotes.__wildernessIncidentsV1;
            return {
                same: store.consequences === window.WildernessConsequences.ensureLedger(),
                events: store.consequences.events.length,
                count: store.consequences.counters.small_kindness,
                version:store.consequences.version,
            };
        });
        expect(result.same).toBe(true);
        expect(result.events).toBeGreaterThan(0);
        expect(result.count).toBe(1);
        expect(result.version).toBeGreaterThanOrEqual(2);
    });
});