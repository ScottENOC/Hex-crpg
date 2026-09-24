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
                force:true,
                regionId:'hollowmere',
                provenance:{ person:'Milly Rowan', origin:'Hollowmere', cargo:'none' }
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
                    force:true,
                    regionId:'aldervale',
                    provenance:{ person:name, origin:'Reddale', destination:'Reddale', cargo:'cloth' }
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
                force:true,
                regionId:'hollowmere',
                provenance:{ person:'Hale Fen', origin:'Millbrook', destination:'Hollowmere', cargo:'tools' }
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
                force:true,
                regionId:'hollowmere',
                provenance:{ person:'Orla Reed', origin:'Millbrook', destination:'Hollowmere', cargo:'herbs' }
            });
            window.WildernessIncidents.resolveIncident(incident.id, 'rob');
            const c = window.WildernessConsequences;
            return {
                harmed:c.count('traveller_harmed'),
                predatory:c.count('predatory_act'),
                safe:c.count('safe_arrival'),
            };
        });
        expect(result.harmed).toBe(1);
        expect(result.predatory).toBe(1);
        expect(result.safe).toBe(0);
    });

    test('the consequence ledger lives inside the already persisted wilderness store', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.WildernessConsequences.recordOutcome({ kind:'flavour', person:'Test Person', tags:['small_kindness'], note:'test' });
            const store = window.worldMapNotes.__wildernessIncidentsV1;
            return {
                same: store.consequences === window.WildernessConsequences.ensureLedger(),
                events: store.consequences.events.length,
                count: store.consequences.counters.small_kindness,
            };
        });
        expect(result.same).toBe(true);
        expect(result.events).toBeGreaterThan(0);
        expect(result.count).toBe(1);
    });
});