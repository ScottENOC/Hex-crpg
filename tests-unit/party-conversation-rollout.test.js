const assert = require('assert');
const path = require('path');
const MODULE = path.resolve(__dirname,'../partyConversationRollout.js');

function fresh({quests=[]}={}) {
  delete require.cache[MODULE];
  const recorded=[], reactions=[];
  global.window=global;
  global.document=undefined;
  global.worldSeconds=1000;
  global.questLog=quests;
  global.party=[
    {name:'Player'},
    {name:'Wren Talbot'},
    {name:'Ser Aldric Thorne'},
    {name:'Mirabel Quill'},
    {name:'Fenn Oakheart'},
    {name:'Reyna Fletcher'},
    {name:'Brother Alden'},
  ];
  global.partyConversationDynamics={
    recordPlayerChoice:e=>{recorded.push(e);return true;},
    raiseReaction:r=>{reactions.push(r);return{channel:'defer'};},
    shapePlayerOptions:o=>[...o.baseOptions,...o.variants],
    findContributors:r=>[{name:'Expert',requirement:r}],
  };
  const api=require(MODULE);
  return {api,recorded,reactions};
}
function done(id,resolution,extra={}) {
  return {id,status:'completed',resolution,completedAt:900,...extra};
}
function test(name,fn){
  try{fn();console.log(`ok - ${name}`);}catch(e){console.error(`not ok - ${name}`);throw e;}
}

test('registry broadly covers existing authored quest outcomes',()=>{
  const {api}=fresh();
  const registry=api.registrySnapshot();
  assert(Object.keys(registry).length>=20);
  assert(registry.aelwen_living_accord.outcomes.includes('joint_stewardship'));
  assert(registry.alden_rule_for_living.outcomes.includes('companion_decides'));
});

test('old completed quests backfill behavioural evidence without replaying companion reactions',()=>{
  const {recorded,reactions}=fresh({quests:[done('aelwen_living_accord','press_silverhart')]});
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('material_priority'));
  assert.equal(reactions.length,0);
});

test('newly completed mapped quest records once and can trigger a cross-companion follow-up',()=>{
  const q={id:'aldric_broken_vigil',status:'active'};
  const {api,recorded,reactions}=fresh({quests:[q]});
  q.status='completed';q.resolution='buried_for_money';q.completedAt=1100;
  let r=api.syncCompleted({emitReactions:true});
  assert.equal(r.processed,1);
  assert.equal(recorded.length,1);
  assert.equal(reactions.length,1);
  assert.equal(reactions[0].companion,'Wren Talbot');
  r=api.syncCompleted({emitReactions:true});
  assert.equal(r.processed,0);
  assert.equal(recorded.length,1);
  assert.equal(reactions.length,1);
});

test('delegating a companion decision records agency rather than the effective policy',()=>{
  const q=done('reyna_empty_blind','reyna_leads',{effectiveResolution:'double_agent'});
  const {recorded}=fresh({quests:[q]});
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('delegates_judgement'));
  assert(recorded[0].tags.includes('companion_agency'));
  assert(!recorded[0].tags.includes('deception'));
});

test('cross-companion reaction may still respond to the concrete outcome of a delegated choice',()=>{
  const q={id:'reyna_empty_blind',status:'active'};
  const {api,reactions}=fresh({quests:[q]});
  q.status='completed';q.resolution='reyna_leads';q.effectiveResolution='double_agent';q.completedAt=1200;
  api.syncCompleted({emitReactions:true});
  assert.equal(reactions.length,1);
  assert.equal(reactions[0].companion,'Brother Alden');
});

test('major non-companion resolutions feed the same player voice history',()=>{
  const {recorded}=fresh({quests:[
    done('balrik_last_hold','survey_only'),
    done('wizard_vendetta','queen',{completedAt:901}),
  ]});
  assert.equal(recorded.length,2);
  const balrik=recorded.find(x=>x.sourceId==='quest:balrik_last_hold');
  const wizard=recorded.find(x=>x.sourceId==='quest:wizard_vendetta');
  assert(balrik.tags.includes('evidence_first'));
  assert(wizard.tags.includes('institutional_trust'));
});

test('unmapped quest resolutions are ignored safely',()=>{
  const {api,recorded,reactions}=fresh({quests:[done('some_other_quest','mystery')]});
  const r=api.syncCompleted({emitReactions:true});
  assert.equal(recorded.length,0);
  assert.equal(reactions.length,0);
  assert.equal(r.processed,0);
});

test('ordinary authored dialogue can explicitly opt in without changing its original action',()=>{
  const {api,recorded}=fresh();
  let acted=0;
  const wrapped=api.wrapDialogueOption({label:'Threaten him.',action:()=>{acted++;}},{
    sourceId:'bandit_gate',choiceId:'threaten',context:'intimidation',tags:['threatening']
  });
  wrapped.action();
  assert.equal(acted,1);
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].sourceId,'dialogue:bandit_gate');
  assert(recorded[0].tags.includes('threatening'));
});

test('ordinary scenes can reuse player-voice variants and party expertise helpers',()=>{
  const {api}=fresh();
  const options=api.shapeOptions([{label:'Baseline'}],[{label:'Experienced threat'}]);
  assert.deepEqual(options.map(o=>o.label),['Baseline','Experienced threat']);
  const experts=api.findPartyExperts({skill:'Arcana',minSkill:5});
  assert.equal(experts[0].name,'Expert');
  assert.equal(experts[0].requirement.skill,'Arcana');
});

console.log('9 tests passed');
