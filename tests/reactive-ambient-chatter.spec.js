const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

async function ready(page) {
    await createCharacter(page);
    await page.waitForFunction(() => !!window.AmbientChatterV2 && !!window.AmbientChatterRelationships, null, { timeout: 10000 });
}

test.describe('reactive ambient NPC chatter', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('has hundreds of authored exchanges spanning generic, role, relationship, settlement and state-reactive topics', async ({ page }) => {
        const stats = await page.evaluate(() => {
            const base = window.AmbientChatterV2.exchanges;
            const social = window.AmbientChatterRelationships.exchanges;
            const all = [...base, ...social];
            return {
                total: all.length,
                base: base.length,
                social: social.length,
                topics: new Set(all.map(x => x.topic)).size,
                relationship: social.filter(x => x.relations).length,
                rolePair: social.filter(x => x.rolePairs).length,
                reactive: all.filter(x => x.condition).length,
            };
        });
        expect(stats.total).toBeGreaterThanOrEqual(240);
        expect(stats.base).toBeGreaterThanOrEqual(75);
        expect(stats.social).toBeGreaterThanOrEqual(140);
        expect(stats.topics).toBeGreaterThanOrEqual(30);
        expect(stats.relationship).toBeGreaterThanOrEqual(100);
        expect(stats.rolePair).toBeGreaterThanOrEqual(40);
        expect(stats.reactive).toBeGreaterThanOrEqual(20);
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

    test('persistent social records distinguish spouse, parent-child, friend, coworker and stranger', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records = window.GeneratedCivilianPopulation.records;
            const make=(id, extra={})=>({id,name:id,occupation:'miner',friendIds:[],childIds:[],parentIds:[],relationships:{},...extra});
            records.set('rel:a', make('rel:a',{spouseId:'rel:b',householdId:'h1',workplaceId:'mine-a'}));
            records.set('rel:b', make('rel:b',{spouseId:'rel:a',householdId:'h1',workplaceId:'shop-b',occupation:'merchant'}));
            records.set('rel:c', make('rel:c',{childIds:['rel:d'],householdId:'h2'}));
            records.set('rel:d', make('rel:d',{parentIds:['rel:c'],householdId:'h2',isDependent:true}));
            records.set('rel:e', make('rel:e',{friendIds:['rel:f'],householdId:'h3'}));
            records.set('rel:f', make('rel:f',{friendIds:['rel:e'],householdId:'h4'}));
            records.set('rel:g', make('rel:g',{workplaceId:'mine-z',householdId:'h5'}));
            records.set('rel:h', make('rel:h',{workplaceId:'mine-z',householdId:'h6'}));
            records.set('rel:i', make('rel:i',{occupation:'guard',householdId:'h7'}));
            const e=id=>({id,name:id,occupation:records.get(id).occupation,hex:{q:0,r:0}});
            const api=window.AmbientChatterRelationships;
            return {
                spouse:api.relationshipBetween(e('rel:a'),e('rel:b')),
                parent:api.relationshipBetween(e('rel:c'),e('rel:d')),
                child:api.relationshipBetween(e('rel:d'),e('rel:c')),
                friend:api.relationshipBetween(e('rel:e'),e('rel:f')),
                coworker:api.relationshipBetween(e('rel:g'),e('rel:h')),
                stranger:api.relationshipBetween(e('rel:g'),e('rel:i')),
            };
        });
        expect(result).toEqual({spouse:'spouse',parent:'parent_to_child',child:'child_to_parent',friend:'friend',coworker:'coworker',stranger:'acquaintance'});
    });

    test('a miner gets different eligible dialogue with spouse, child, fellow miner, merchant and guard', async ({ page }) => {
        const result = await page.evaluate(() => {
            const records=window.GeneratedCivilianPopulation.records;
            const put=(id,occupation,extra={})=>records.set(id,{id,name:id,occupation,friendIds:[],childIds:[],parentIds:[],relationships:{},...extra});
            put('m','miner',{spouseId:'s',householdId:'hm',childIds:['c'],workplaceId:'mine-1'});
            put('s','civilian',{spouseId:'m',householdId:'hm'});
            put('c','civilian',{parentIds:['m'],householdId:'hm',isDependent:true});
            put('mm','miner',{workplaceId:'mine-2',householdId:'h2'});
            put('merch','merchant',{householdId:'h3'});
            put('guard','guard',{householdId:'h4'});
            const e=id=>({id,name:id,occupation:records.get(id).occupation,hex:{q:0,r:0}});
            const api=window.AmbientChatterRelationships;
            const state={settlement:'emberlode',emberlodeRaided:false,oreRoadOpen:false,goblinResolved:false,goblinResolution:null};
            const topics=id=>api.eligibleSocial([e('m'),e(id)],state).map(x=>x.topic);
            return { spouse:topics('s'), child:topics('c'), miner:topics('mm'), merchant:topics('merch'), guard:topics('guard') };
        });
        expect(result.spouse).toContain('miner-spouse');
        expect(result.spouse).not.toContain('miner-miner');
        expect(result.child).toContain('miner-child');
        expect(result.miner).toContain('miner-miner');
        expect(result.merchant).toContain('miner-merchant');
        expect(result.guard).toContain('miner-guard');
    });

    test('occupation-specific base chatter is only eligible for matching NPC roles', async ({ page }) => {
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

    test('Emberlode raid aftermath changes spouse and coworker conversations as well as public gossip', async ({ page }) => {
        const result = await page.evaluate(() => {
            const api=window.AmbientChatterRelationships;
            const records=window.GeneratedCivilianPopulation.records;
            const put=(id,extra={})=>records.set(id,{id,name:id,occupation:'miner',friendIds:[],childIds:[],parentIds:[],relationships:{},...extra});
            put('ra',{spouseId:'rb',householdId:'rh',workplaceId:'rw'});
            put('rb',{spouseId:'ra',householdId:'rh'});
            put('rc',{householdId:'r2',workplaceId:'rw'});
            const e=id=>({id,name:id,occupation:'miner',hex:{q:0,r:0}});
            const before={settlement:'emberlode',emberlodeRaided:false,oreRoadOpen:false};
            const after={...before,emberlodeRaided:true};
            return {
                spouseBefore:api.eligibleSocial([e('ra'),e('rb')],before).some(x=>x.topic==='raid-spouse'),
                spouseAfter:api.eligibleSocial([e('ra'),e('rb')],after).some(x=>x.topic==='raid-spouse'),
                coworkerAfter:api.eligibleSocial([e('ra'),e('rc')],after).some(x=>x.topic==='raid-coworker'),
            };
        });
        expect(result.spouseBefore).toBe(false);
        expect(result.spouseAfter).toBe(true);
        expect(result.coworkerAfter).toBe(true);
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

    test('integration records the social relationship used for autonomous nearby chatter', async ({ page }) => {
        const result = await page.evaluate(() => {
            const p=window.entities.find(e=>e.side==='player'&&!e.rider);
            const records=window.GeneratedCivilianPopulation.records;
            records.set('bubble:a',{id:'bubble:a',name:'Bubble A',occupation:'miner',spouseId:'bubble:b',householdId:'bh',friendIds:[],childIds:[],parentIds:[],relationships:{}});
            records.set('bubble:b',{id:'bubble:b',name:'Bubble B',occupation:'civilian',spouseId:'bubble:a',householdId:'bh',friendIds:[],childIds:[],parentIds:[],relationships:{}});
            const a=new window.Entity('Bubble A','white',{q:p.hex.q+1,r:p.hex.r},5);
            Object.assign(a,{id:'bubble:a',isNPC:true,side:'neutral',alive:true,occupation:'miner'});
            const b=new window.Entity('Bubble B','white',{q:p.hex.q+2,r:p.hex.r},5);
            Object.assign(b,{id:'bubble:b',isNPC:true,side:'neutral',alive:true,occupation:'civilian'});
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
        expect(result.last.relationship).toBe('spouse');
        expect(result.last.roles).toEqual(['miner','civilian']);
    });
});
