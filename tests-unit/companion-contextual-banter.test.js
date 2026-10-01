const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../companionContextualBanter.js');

function load(opts={}) {
  delete require.cache[modulePath];
  for (const k of [
    'party','player','entities','worldSeconds','isInCombat','campSystem','companionConversationMemory',
    'getCompanionRelationship','getCompanionAffinity','showMessage','document','currentLocationName',
    'addEventListener','setInterval'
  ]) delete global[k];

  const pc={name:'PC',hp:100,maxHp:100,playerRelationship:{}};
  const wren={name:'Wren Talbot',hp:100,maxHp:100,playerRelationship:{familiarity:60,trust:55},playerAffinity:{friendship:65}};
  const aldric={name:'Ser Aldric Thorne',hp:100,maxHp:100,playerRelationship:{familiarity:55,trust:50},playerAffinity:{friendship:55}};
  const mirabel={name:'Mirabel Quill',hp:100,maxHp:100,playerRelationship:{familiarity:40,trust:35},playerAffinity:{friendship:45}};
  global.party=[pc,wren,aldric,mirabel];
  global.player=pc;
  global.entities=global.party;
  global.worldSeconds=opts.worldSeconds ?? 36000;
  global.isInCombat=!!opts.combat;
  global.getCompanionRelationship=x=>x.playerRelationship||{};
  global.getCompanionAffinity=x=>x.playerAffinity||{};
  global.showMessage=()=>{};
  global.companionConversationMemory={
    topics:[],
    registerTopics(name, topics){ this.topics.push([name,...topics]); return true; },
  };
  if (opts.camp) global.campSystem={getCamp:()=>opts.camp};
  const api=require(modulePath);
  return {api,pc,wren,aldric,mirabel};
}

test('pair familiarity grows while companions travel together',()=>{
  const {api,wren,aldric}=load();
  const before=api.pairState(wren,aldric).familiarity;
  api.tickPairs();
  assert.equal(api.pairState(wren,aldric).familiarity,before+1);
});

test('companions get opinion topics about each other after familiarity',()=>{
  const {wren}=load();
  const row=global.companionConversationMemory.topics.find(r=>r[0]==='Wren Talbot');
  const topic=row.find(t=>t.id==='opinion_ser_aldric_thorne');
  assert.ok(topic);
  global.companionContextualBanter.pairState('Wren Talbot','Ser Aldric Thorne').familiarity=25;
  assert.equal(topic.condition(),true);
  assert.match(topic.render().text,/Aldric/);
});

test('hard post-combat injury queues a companion conversation',()=>{
  const {api,pc}=load({combat:true});
  api.processCombatTransition();
  pc.hp=20;
  global.isInCombat=false;
  global.worldSeconds+=120;
  api.processCombatTransition();
  assert.ok(global.party.slice(1).some(c=>api.pendingFor(c.name).some(e=>e.type==='player_badly_hurt')));
});

test('combat ending in camp is treated as camp ambush aftermath',()=>{
  const camp={startedAt:100,tents:[]};
  const {api}=load({combat:true,camp});
  api.processCombatTransition();
  global.isInCombat=false;
  global.worldSeconds+=60;
  api.processCombatTransition();
  assert.ok(global.party.slice(1).some(c=>api.pendingFor(c.name).some(e=>e.type==='camp_ambush')));
});

test('first shared tent queues once only',()=>{
  const {api,pc,wren}=load();
  const tent={occupants:[pc,wren]};
  const camp={startedAt:100,tents:[tent]};
  assert.equal(api.handleCamp(camp),true);
  const count1=api.pendingFor(wren.name).filter(e=>e.type==='first_shared_tent').length;
  api.handleCamp(camp);
  const count2=api.pendingFor(wren.name).filter(e=>e.type==='first_shared_tent').length;
  assert.equal(count1,1);
  assert.equal(count2,1);
});

test('pair banter uses authored exchanges',()=>{
  const {api}=load();
  const out=api.runBanter({force:true});
  assert.ok(out);
  assert.match(out.text,/:/);
  assert.ok(api.banter[out.pair]?.length);
});

test('banter does not fire while moving or fighting',()=>{
  const {api,pc}=load();
  pc.destination={x:1,y:1};
  assert.equal(api.runBanter({force:true}),false);
  pc.destination=null;
  global.isInCombat=true;
  assert.equal(api.runBanter({force:true}),false);
});

test('return-home context appears only on a repeat visit',()=>{
  const {api,wren}=load();
  global.currentLocationName='Hollowmere';
  api.processLocation();
  assert.equal(api.pendingFor(wren.name).some(e=>e.type==='return_home'),false);
  global.currentLocationName='Road';
  api.processLocation();
  global.currentLocationName='Hollowmere';
  api.processLocation();
  assert.equal(api.pendingFor(wren.name).some(e=>e.type==='return_home'),true);
});

test('context topic consumes the pending event after discussion',()=>{
  const {api,wren}=load();
  api.queue(wren,'hard_fight',{key:'fight:x'});
  const row=global.companionConversationMemory.topics.find(r=>r[0]==='Wren Talbot');
  const topic=row.find(t=>t.id==='recent_shared_context');
  const rendered=topic.render();
  assert.match(rendered.text,/close|breathing|fight|survival|cost/i);
  topic.onDiscuss({}, {}, rendered);
  assert.equal(api.pendingFor(wren.name).length,0);
});

test('pair warmth can change independently of player romance scores',()=>{
  const {api,wren,aldric}=load();
  const before=api.pairState(wren,aldric).warmth;
  const playerFriendship=wren.playerAffinity.friendship;
  api.pairAffinity(wren,aldric,3,'covered one another in a fight');
  assert.equal(api.pairState(wren,aldric).warmth,before+3);
  assert.equal(wren.playerAffinity.friendship,playerFriendship);
});

test('first shared watch is remembered and only queues once',()=>{
  const {api,pc,wren}=load();
  const camp={startedAt:200,tents:[],members:[Object.assign(pc,{onGuard:true}),Object.assign(wren,{onGuard:true})]};
  api.handleCamp(camp);
  assert.equal(api.pendingFor(wren.name).filter(e=>e.type==='first_shared_watch').length,1);
  api.handleCamp(camp);
  assert.equal(api.pendingFor(wren.name).filter(e=>e.type==='first_shared_watch').length,1);
});

test('rainy camp creates contextual follow-up',()=>{
  const {api}=load();
  const camp={startedAt:300,tents:[],members:[],weather:'steady rain'};
  api.handleCamp(camp);
  assert.ok(global.party.slice(1).some(c=>api.pendingFor(c.name).some(e=>e.type==='rainy_camp')));
});

test('relationship strain and reconciliation become contextual topics',()=>{
  const {api,wren}=load();
  global.getCompanionRomanceState=()=>({agreement:{state:'dating'},affinity:wren.playerAffinity});
  api.processRelationshipTransitions();
  global.getCompanionRomanceState=()=>({agreement:{state:'strained'},affinity:wren.playerAffinity});
  api.processRelationshipTransitions();
  assert.ok(api.pendingFor(wren.name).some(e=>e.type==='relationship_strain'));
  global.getCompanionRomanceState=()=>({agreement:{state:'dating'},affinity:wren.playerAffinity});
  api.processRelationshipTransitions();
  assert.ok(api.pendingFor(wren.name).some(e=>e.type==='reconciliation'));
});

test('outside relationship breach queues strain without inventing jealousy for allowed connection',()=>{
  const {api,wren}=load();
  global.recordCompanionOutsideConnection=(partner,other,kind,opts)=>({allowed:true,breach:false});
  api.installOutsideConnectionHook();
  global.recordCompanionOutsideConnection(wren,'Someone','romance',{disclosed:true});
  assert.equal(api.pendingFor(wren.name).some(e=>e.type==='relationship_strain'),false);
  global.recordCompanionOutsideConnection=(partner,other,kind,opts)=>({allowed:false,breach:true});
  api.installOutsideConnectionHook();
  global.recordCompanionOutsideConnection(wren,'Someone','romance',{disclosed:false});
  assert.ok(api.pendingFor(wren.name).some(e=>e.type==='relationship_strain'));
});
