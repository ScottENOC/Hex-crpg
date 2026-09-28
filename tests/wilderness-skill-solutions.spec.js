const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

async function ready(page) {
    await createCharacter(page, { campaign:'2', race:'human', gender:'female' });
    await page.waitForFunction(() =>
        !!window.WildernessSkillSolutions &&
        !!window.WildernessLivingWorld &&
        !!window.WildernessFactionBeliefs &&
        !!window.WildernessConsequences &&
        !!window.WildernessIncidents,
    null, { timeout:10000 });
}

async function setPartySkills(page, skills) {
    await page.evaluate((next) => {
        const keys = ['druid_knowledge_nature','elf_knowledge_nature','survival','smithing','insight'];
        const actors = [window.player, ...(window.entities || []).filter(e => e?.side === 'player' && !e.rider)];
        const seen = new Set();
        for (const actor of actors) {
            if (!actor || seen.has(actor)) continue;
            seen.add(actor);
            actor.skills = actor.skills || {};
            keys.forEach(k => { actor.skills[k] = 0; });
            Object.entries(next || {}).forEach(([k,v]) => { actor.skills[k] = v; });
        }
    }, skills);
}

function optionOutcomes(choices) {
    return choices.map(c => c.outcome).filter(Boolean);
}

test.describe('wilderness non-combat skill solutions', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('Knowledge: Nature can read fresh tracks without consuming the encounter, then avoid the encounter entirely', async ({ page }) => {
        await setPartySkills(page, { druid_knowledge_nature:2 });
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e?.alive && e.side === 'player' && !e.rider);
            const incident = window.WildernessIncidents.spawnIncident('fresh_tracks', { q:player.hex.q + 7, r:player.hex.r + 2 }, {
                force:true,
                provenance:{ trackDescription:'Broad pawprints circle once before heading uphill.', origin:'Hollowmere' },
            });
            const before = window.entities.filter(e => e?.alive && e.side === 'enemy').length;
            const choicesBefore = window.WildernessIncidents.templates.fresh_tracks.choices(incident);

            const originalDialogue = window.showDialogue;
            window.showDialogue = () => {};
            window.WildernessIncidents.resolveIncident(incident.id, 'skill:nature_read_tracks');
            const afterRead = {
                state:incident.state,
                resolution:incident.resolution || null,
                observation:incident.skillObservations?.natureTracks || null,
            };
            window.WildernessIncidents.resolveIncident(incident.id, 'skill:avoid_tracks_nature');
            window.showDialogue = originalDialogue;

            return {
                outcomes:choicesBefore.map(c => c.outcome).filter(Boolean),
                afterRead,
                finalState:incident.state,
                finalResolution:incident.resolution,
                method:incident.resolutionMethod,
                enemiesAdded:window.entities.filter(e => e?.alive && e.side === 'enemy').length - before,
            };
        });

        expect(result.outcomes).toContain('follow');
        expect(result.outcomes).toContain('study');
        expect(result.outcomes).toContain('skill:nature_read_tracks');
        expect(result.outcomes).toContain('skill:avoid_tracks_nature');
        expect(result.afterRead.state).not.toBe('resolved');
        expect(result.afterRead.resolution).toBeNull();
        expect(result.afterRead.observation.rank).toBe(2);
        expect(result.afterRead.observation.text).toContain('canine');
        expect(result.finalState).toBe('resolved');
        expect(result.finalResolution).toBe('studied');
        expect(result.method).toBe('tracking_avoidance');
        expect(result.enemiesAdded).toBe(0);
    });

    test('tracking a lost child home resolves the family story without incrementing generic safe-route arrival gates', async ({ page }) => {
        await setPartySkills(page, { druid_knowledge_nature:1 });
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e?.alive && e.side === 'player' && !e.rider);
            const beforeSafe = window.WildernessConsequences.count('safe_arrival');
            const incident = window.WildernessIncidents.spawnIncident('lost_child', { q:player.hex.q + 5, r:player.hex.r + 1 }, {
                force:true,
                provenance:{ person:'Tessa Test', origin:'Hollowmere', destination:'Hollowmere' },
            });
            const choices = window.WildernessIncidents.templates.lost_child.choices(incident);
            window.WildernessIncidents.resolveIncident(incident.id, 'skill:track_child_home');
            const ledger = window.WildernessConsequences.ensureLedger();
            const event = [...ledger.events].reverse().find(e => e.incidentId === incident.id);
            const actor = window.WildernessLivingWorld.actorForIncident(incident);
            const report = window.WildernessLivingWorld.ensureState().reports.find(r => r.incidentId === incident.id);
            return {
                outcomes:choices.map(c => c.outcome).filter(Boolean),
                state:incident.state,
                resolution:incident.resolution,
                method:incident.resolutionMethod,
                skill:incident.skillResolution,
                tags:event?.tags || [],
                safeDelta:window.WildernessConsequences.count('safe_arrival') - beforeSafe,
                actorState:actor?.state || null,
                reportFact:report?.fact || null,
            };
        });

        expect(result.outcomes).toContain('reunite');
        expect(result.outcomes).toContain('safe_road');
        expect(result.outcomes).toContain('skill:track_child_home');
        expect(result.state).toBe('resolved');
        expect(result.resolution).toBe('reunited');
        expect(result.method).toBe('tracking');
        expect(result.skill.skill).toBe('knowledge_nature');
        expect(result.tags).toContain('child_reunited');
        expect(result.tags).not.toContain('safe_arrival');
        expect(result.safeDelta).toBe(0);
        expect(result.actorState).toBe('travelling_to_destination');
        expect(result.reportFact).toBe('player_helped_lost_child');
    });

    test('Smithing repairs a stranded merchant well enough to continue independently and report the help later', async ({ page }) => {
        await setPartySkills(page, { smithing:1 });
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e?.alive && e.side === 'player' && !e.rider);
            const incident = window.WildernessIncidents.spawnIncident('stranded_merchant', { q:player.hex.q + 5, r:player.hex.r }, {
                force:true,
                provenance:{ person:'Hobb Test', origin:'Reddale', destination:'Reddale', cargo:'tools' },
            });
            const choices = window.WildernessIncidents.templates.stranded_merchant.choices(incident);
            window.WildernessIncidents.resolveIncident(incident.id, 'skill:smithing_repair');
            const ledger = window.WildernessConsequences.ensureLedger();
            const event = [...ledger.events].reverse().find(e => e.incidentId === incident.id);
            const actor = window.WildernessLivingWorld.actorForIncident(incident);
            const report = window.WildernessLivingWorld.ensureState().reports.find(r => r.incidentId === incident.id);
            return {
                outcomes:choices.map(c => c.outcome).filter(Boolean),
                resolution:incident.resolution,
                method:incident.resolutionMethod,
                skill:incident.skillResolution,
                tags:event?.tags || [],
                actorState:actor?.state || null,
                reportFact:report?.fact || null,
                recognition:window.WildernessLivingWorld.recognitionText(actor),
            };
        });

        expect(result.outcomes).toContain('escort');
        expect(result.outcomes).toContain('skill:smithing_repair');
        expect(result.resolution).toBe('repaired');
        expect(result.method).toBe('smithing');
        expect(result.skill.skill).toBe('smithing');
        expect(result.tags).toContain('skilled_repair');
        expect(result.tags).toContain('merchant_arrived');
        expect(result.actorState).toBe('travelling_to_destination');
        expect(result.reportFact).toBe('player_helped_stranded_merchant');
        expect(result.recognition).toContain('Still holding');
    });

    test('Insight and fieldcraft can add information while ordinary choices remain available', async ({ page }) => {
        await setPartySkills(page, { insight:2, survival:1 });
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e?.alive && e.side === 'player' && !e.rider);
            const traveller = window.WildernessIncidents.spawnIncident('injured_traveller', { q:player.hex.q + 6, r:player.hex.r }, {
                force:true,
                provenance:{ person:'Orla Test', origin:'Millbrook', destination:'Hollowmere' },
            });
            const camp = window.WildernessIncidents.spawnIncident('abandoned_camp', { q:player.hex.q + 8, r:player.hex.r + 2 }, {
                force:true,
                provenance:{ clue:'A drag mark leaves the sleeping place and disappears into the brush.', origin:'Hollowmere' },
            });
            const travellerChoices = window.WildernessIncidents.templates.injured_traveller.choices(traveller);
            const campChoices = window.WildernessIncidents.templates.abandoned_camp.choices(camp);
            const originalDialogue = window.showDialogue;
            window.showDialogue = () => {};
            window.WildernessIncidents.resolveIncident(traveller.id, 'skill:insight_traveller');
            window.WildernessIncidents.resolveIncident(camp.id, 'skill:read_camp_survival');
            window.showDialogue = originalDialogue;
            return {
                travellerOutcomes:travellerChoices.map(c => c.outcome).filter(Boolean),
                campOutcomes:campChoices.map(c => c.outcome).filter(Boolean),
                travellerState:traveller.state,
                campState:camp.state,
                insight:traveller.skillObservations?.travellerInsight || null,
                campSign:camp.skillObservations?.campSign || null,
            };
        });

        expect(result.travellerOutcomes).toContain('help');
        expect(result.travellerOutcomes).toContain('question');
        expect(result.travellerOutcomes).toContain('rob');
        expect(result.travellerOutcomes).toContain('skill:insight_traveller');
        expect(result.campOutcomes).toContain('search');
        expect(result.campOutcomes).toContain('follow');
        expect(result.campOutcomes).toContain('skill:read_camp_survival');
        expect(result.travellerState).not.toBe('resolved');
        expect(result.campState).not.toBe('resolved');
        expect(result.insight.rank).toBe(2);
        expect(result.campSign.rank).toBe(1);
        expect(result.campSign.text).toContain('Something heavy');
    });

    test('without relevant skills the original encounter choices remain and skill-only options are absent', async ({ page }) => {
        await setPartySkills(page, {});
        const result = await page.evaluate(() => {
            const player = window.entities.find(e => e?.alive && e.side === 'player' && !e.rider);
            const tracks = window.WildernessIncidents.spawnIncident('fresh_tracks', { q:player.hex.q + 7, r:player.hex.r }, {
                force:true,
                provenance:{ trackDescription:'Bootprints leave the road and enter the trees.' },
            });
            const merchant = window.WildernessIncidents.spawnIncident('stranded_merchant', { q:player.hex.q + 9, r:player.hex.r }, {
                force:true,
                provenance:{ person:'No Skill Merchant', origin:'Reddale', destination:'Reddale' },
            });
            return {
                tracks:window.WildernessIncidents.templates.fresh_tracks.choices(tracks),
                merchant:window.WildernessIncidents.templates.stranded_merchant.choices(merchant),
            };
        });

        expect(optionOutcomes(result.tracks)).toEqual(expect.arrayContaining(['follow','study']));
        expect(optionOutcomes(result.merchant)).toContain('escort');
        expect(result.tracks.some(c => c.outcome?.startsWith('skill:'))).toBe(false);
        expect(result.merchant.some(c => c.outcome?.startsWith('skill:'))).toBe(false);
    });
});
