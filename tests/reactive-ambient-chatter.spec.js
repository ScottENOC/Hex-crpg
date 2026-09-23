const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.AmbientChatterV2, null, { timeout: 10000 });
}

test.describe('reactive ambient NPC chatter', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('has a much larger authored pool spanning generic, role, settlement and state-reactive topics', async ({ page }) => {
        const stats = await page.evaluate(() => {
            const xs = window.AmbientChatterV2.exchanges;
            return {
                total: xs.length,
                topics: new Set(xs.map(x => x.topic)).size,
                role: xs.filter(x => x.roles).length,
                settlement: xs.filter(x => x.settlements).length,
                reactive: xs.filter(x => x.condition).length,
            };
        });
        expect(stats.total).toBeGreaterThanOrEqual(75);
        expect(stats.topics).toBeGreaterThanOrEqual(15);
        expect(stats.role).toBeGreaterThanOrEqual(15);
        expect(stats.settlement).toBeGreaterThanOrEqual(15);
        expect(stats.reactive).toBeGreaterThanOrEqual(10);
    });

    test('recent exchange and topic memory suppress immediate repetition', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api = window.AmbientChatterV2;
            const pair = [
                { name:'A', title:'Villager', hex:{q:0,r:0} },
                { name:'B', title:'Villager', hex:{q:1,r:0} },
            ];
            const state = { settlement:null, season:'summer', hour:12, goblinKnown:false, goblinResolved:false,
                hollowmereEventFired:false, hollowmereSecurity:50, emberlodeProsperity:50, emberlodeRaided:false,
                buriedRoadActive:false, oreRoadOpen:false, recentRumor:null };
            window.ambientChatterRecent = [];
            window.ambientChatterRecentTopics = [];
            const first = api.chooseExchange(pair, state, () => 0);
            api.remember(first);
            const second = api.chooseExchange(pair, state, () => 0);
            return { first:first.id, second:second.id, firstTopic:first.topic, secondTopic:second.topic };
        });
        expect(result.second).not.toBe(result.first);
        expect(result.secondTopic).not.toBe(result.firstTopic);
    });

    test('occupation-specific chatter is only eligible for matching NPC roles', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api=window.AmbientChatterV2;
            const base={settlement:null,season:'summer',hour:12,goblinKnown:false,goblinResolved:false,hollowmereEventFired:false,
                hollowmereSecurity:50,emberlodeProsperity:50,emberlodeRaided:false,buriedRoadActive:false,oreRoadOpen:false,recentRumor:null};
            const guards=[{name:'G',title:'Town Guard',hex:{q:0,r:0}},{name:'C',title:'Villager',hex:{q:1,r:0}}];
            const civilians=[{name:'A',title:'Villager',hex:{q:0,r:0}},{name:'B',title:'Villager',hex:{q:1,r:0}}];
            return {
                guardHas:api.eligibleExchanges(guards,base).some(x=>x.topic==='guard-business'),
                civilianHas:api.eligibleExchanges(civilians,base).some(x=>x.topic==='guard-business'),
            };
        });
        expect(result.guardHas).toBe(true);
        expect(result.civilianHas).toBe(false);
    });

    test('Emberlode raid aftermath becomes ambient conversation only after the raid flag is known', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api=window.AmbientChatterV2;
            const c=window.campaign2EmberlodeCenter;
            const pair=[{name:'Miner A',title:'Miner',hex:{...c}},{name:'Miner B',title:'Miner',hex:{q:c.q+1,r:c.r}}];
            const before=api.getWorldState(pair);
            const beforeHas=api.eligibleExchanges(pair,before).some(x=>x.topic==='emberlode-raid');
            window.emberlodeRaided=true;
            const after=api.getWorldState(pair);
            const afterHas=api.eligibleExchanges(pair,after).some(x=>x.topic==='emberlode-raid');
            return {beforeHas,afterHas,settlement:after.settlement};
        });
        expect(result.settlement).toBe('emberlode');
        expect(result.beforeHas).toBe(false);
        expect(result.afterHas).toBe(true);
    });

    test('quest outcomes change what people can discuss', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api=window.AmbientChatterV2;
            const c=window.campaign2Landmarks.crossroads;
            const pair=[{name:'Local A',title:'Villager',hex:{...c}},{name:'Local B',title:'Villager',hex:{q:c.q+1,r:c.r}}];
            window.questLog=(window.questLog||[]).filter(x=>x.id!=='goblin_threat'&&x.id!=='ore_road_reopened');
            window.questLog.push({id:'goblin_threat',status:'active'});
            let state=api.getWorldState(pair);
            const during=api.eligibleExchanges(pair,state).map(x=>x.topic);
            window.questLog.find(x=>x.id==='goblin_threat').status='completed';
            window.questLog.find(x=>x.id==='goblin_threat').resolution='goblin_diplomacy';
            window.questLog.push({id:'ore_road_reopened',status:'completed'});
            state=api.getWorldState(pair);
            const after=api.eligibleExchanges(pair,state).map(x=>x.topic);
            return {during,after};
        });
        expect(result.during).toContain('goblin-danger');
        expect(result.during).not.toContain('goblin-peace');
        expect(result.after).toContain('goblin-peace');
        expect(result.after).toContain('ore-road');
    });

    test('integration still produces autonomous speech bubbles for nearby NPCs', async ({ page }) => {
        const result = await page.evaluate(() => {
            const p=window.entities.find(e=>e.side==='player'&&!e.rider);
            const a=new window.Entity('Reactive Villager A','white',{q:p.hex.q+1,r:p.hex.r},5);
            Object.assign(a,{isNPC:true,side:'neutral',alive:true,title:'Villager'});
            const b=new window.Entity('Reactive Villager B','white',{q:p.hex.q+2,r:p.hex.r},5);
            Object.assign(b,{isNPC:true,side:'neutral',alive:true,title:'Villager'});
            window.entities=[p,a,b];
            window.speechBubbles=[]; window.ambientChatterCooldowns={}; window.ambientChatterRecent=[]; window.ambientChatterRecentTopics=[];
            window.ambientChatterAccum=0; window.isInCombat=false;
            window.checkAmbientNpcChatter(17);
            return new Promise(resolve=>setTimeout(()=>resolve({
                bubble:window.speechBubbles.some(x=>x.speakerName===a.name||x.speakerName===b.name),
                last:window.lastAmbientChatter,
            }),100));
        });
        expect(result.bubble).toBe(true);
        expect(result.last.exchangeId).toBeTruthy();
        expect(result.last.topic).toBeTruthy();
    });
});
