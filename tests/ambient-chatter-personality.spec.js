const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.AmbientChatterV2 && !!window.AmbientChatterRelationships && !!window.AmbientChatterPersonality, null, { timeout: 10000 });
}

test.describe('personality-aware ambient chatter', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('stable profile traits come from the persistent NPC seed', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records = window.GeneratedCivilianPopulation.records;
            records.set('persona:a', { id:'persona:a', seed:'stable-person-a', name:'A', occupation:'miner', appearance:{ageBand:'adult'} });
            records.set('persona:b', { id:'persona:b', seed:'stable-person-b', name:'B', occupation:'miner', appearance:{ageBand:'adult'} });
            const api = window.AmbientChatterPersonality;
            const a = { id:'persona:a', name:'A', occupation:'miner' };
            const b = { id:'persona:b', name:'B', occupation:'miner' };
            return { first:api.profileOf(a), again:api.profileOf(a), other:api.profileOf(b) };
        });
        expect(result.first).toEqual(result.again);
        expect(result.first.temperament).toBeTruthy();
        expect(result.first.value).toBeTruthy();
        expect(result.first.sociability).toBeGreaterThanOrEqual(0);
        expect(result.first.sociability).toBeLessThan(1);
        expect(JSON.stringify(result.first)).not.toBe(JSON.stringify(result.other));
    });

    test('mood reacts to injury and dangerous local state without rewriting personality', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records = window.GeneratedCivilianPopulation.records;
            records.set('persona:mood', { id:'persona:mood', seed:'mood-person', name:'Mood', occupation:'miner', appearance:{ageBand:'adult'} });
            const npc = { id:'persona:mood', name:'Mood', occupation:'miner', hp:10, maxHp:10 };
            const api = window.AmbientChatterPersonality;
            const profileBefore = api.profileOf(npc);
            const calm = api.moodOf(npc, {hour:12,hollowmereSecurity:70,emberlodeRaided:false});
            npc.hp = 3;
            const hurt = api.moodOf(npc, {hour:12,hollowmereSecurity:70,emberlodeRaided:false});
            const profileAfter = api.profileOf(npc);
            return { profileBefore, profileAfter, calm, hurt };
        });
        expect(result.profileBefore).toEqual(result.profileAfter);
        expect(result.hurt).toBe('hurt');
        expect(result.calm).not.toBe('hurt');
    });

    test('explicit religion and faction are preserved but never fabricated', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records = window.GeneratedCivilianPopulation.records;
            records.set('persona:plain', { id:'persona:plain', seed:'plain', name:'Plain', occupation:'farmer', appearance:{ageBand:'adult'} });
            records.set('persona:aff', { id:'persona:aff', seed:'aff', name:'Aff', occupation:'farmer', appearance:{ageBand:'adult'}, religion:'Silver Flame', faction:'Millers Guild' });
            const api = window.AmbientChatterPersonality;
            return {
                plain:api.explicitAffiliation({id:'persona:plain',name:'Plain'}),
                affiliated:api.explicitAffiliation({id:'persona:aff',name:'Aff'}),
            };
        });
        expect(result.plain).toEqual({religion:null,faction:null});
        expect(result.affiliated).toEqual({religion:'Silver Flame',faction:'Millers Guild'});
    });

    test('the relationship pool now includes substantial personality, age, status, piety and mood material', async ({ page }) => {
        const stats = await page.evaluate(() => {
            const xs = window.AmbientChatterRelationships.exchanges;
            return {
                total: xs.length,
                personaAdded: window.AmbientChatterPersonality.addedExchanges,
                voice: xs.filter(x=>x.topic.startsWith('voice-')).length,
                mood: xs.filter(x=>x.topic.startsWith('mood-')).length,
                status: xs.filter(x=>x.topic.endsWith('-status')).length,
                worldview: xs.filter(x=>x.topic.includes('worldview')).length,
                history: xs.filter(x=>x.topic.startsWith('shared-')).length,
            };
        });
        expect(stats.personaAdded).toBeGreaterThanOrEqual(120);
        expect(stats.voice).toBeGreaterThanOrEqual(50);
        expect(stats.mood).toBeGreaterThanOrEqual(15);
        expect(stats.status).toBeGreaterThanOrEqual(8);
        expect(stats.worldview).toBeGreaterThanOrEqual(8);
        expect(stats.history).toBeGreaterThanOrEqual(6);
        expect(stats.total).toBeGreaterThanOrEqual(250);
    });

    test('danger produces different eligible chatter for cautious and bold people', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records=window.GeneratedCivilianPopulation.records;
            const api=window.AmbientChatterPersonality;
            // Find two deterministic seeds with different danger moods rather than hard-coding hash outcomes.
            let worried=null, defiant=null;
            for(let i=0;i<200 && (!worried || !defiant);i++) {
                const id=`persona:danger:${i}`;
                records.set(id,{id,seed:`danger-${i}`,name:id,occupation:'miner',appearance:{ageBand:'adult'}});
                const npc={id,name:id,occupation:'miner',hp:10,maxHp:10};
                const mood=api.moodOf(npc,{hour:12,hollowmereSecurity:20,emberlodeRaided:true});
                if(mood==='worried'&&!worried) worried=npc;
                if(mood==='defiant'&&!defiant) defiant=npc;
            }
            const other={name:'Other',occupation:'civilian'};
            const state={settlement:'emberlode',hour:12,hollowmereSecurity:20,emberlodeRaided:true,goblinResolved:false};
            const eligible=pair=>window.AmbientChatterRelationships.eligibleSocial(pair,state).map(x=>x.topic);
            return { worried:eligible([worried,other]), defiant:eligible([defiant,other]) };
        });
        expect(result.worried).toContain('mood-worried');
        expect(result.worried).not.toContain('mood-defiant');
        expect(result.defiant).toContain('mood-defiant');
        expect(result.defiant).not.toContain('mood-worried');
    });
});