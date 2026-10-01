const assert = require('assert');
const path = require('path');
const MODULE = path.resolve(__dirname,'../partyConversationDynamics.js');

function fresh({worldSeconds=0, entities=[]}={}) {
  delete require.cache[MODULE];
  const messages=[];
  global.window=global;
  global.document=undefined;
  global.worldSeconds=worldSeconds;
  global.entities=entities;
  global.party=[
    {name:'Player', race:'Human', classLevels:{Fighter:2}, skills:{Persuasion:3}, x:0,y:0},
    {name:'Wren Talbot', skills:{Survival:6}, x:0,y:0},
    {name:'Ser Aldric Thorne', skills:{Athletics:5}, x:0,y:0},
    {name:'Mirabel Quill', classLevels:{Wizard:5}, skills:{Arcana:11}, x:0,y:0},
    {name:'Fenn Oakheart', skills:{Nature:10}, x:0,y:0},
    {name:'Reyna Fletcher', skills:{Stealth:9}, x:0,y:0},
    {name:'Brother Alden', skills:{Religion:10}, x:0,y:0}
  ];
  global.player=global.party[0];
  global.showMessage=(m)=>messages.push(m);
  global.showDialogue=(npc,text,options)=>({npc,text,options});
  const api=require(MODULE);
  return {api,messages};
}

function test(name,fn){
  try{fn();console.log(`ok - ${name}`);}catch(e){console.error(`not ok - ${name}`);throw e;}
}

test('records repeated behavioural tags across distinct contexts and dedupes exact evidence',()=>{
  const {api}=fresh();
  assert.equal(api.recordPlayerChoice({sourceId:'q1',choiceId:'threaten',context:'bandits',tags:['threatening']}),true);
  assert.equal(api.recordPlayerChoice({sourceId:'q1',choiceId:'threaten',context:'bandits',tags:['threatening']}),false);
  assert.equal(api.recordPlayerChoice({sourceId:'q2',choiceId:'threaten',context:'guards',tags:['threatening']}),true);
  assert.equal(api.behaviourWeight('threatening'),2);
});

test('contradictory behavioural evidence coexists',()=>{
  const {api}=fresh();
  api.recordPlayerChoice({sourceId:'a',choiceId:'mercy',context:'one',tags:['merciful']});
  api.recordPlayerChoice({sourceId:'b',choiceId:'cruel',context:'two',tags:['cruel']});
  assert.equal(api.behaviourWeight('merciful'),1);
  assert.equal(api.behaviourWeight('cruel'),1);
});

test('history can add a voice variant without removing baseline dialogue',()=>{
  const {api}=fresh();
  api.recordPlayerChoice({sourceId:'a',choiceId:'threaten',context:'one',tags:['threatening'],strength:2});
  const base=[{label:'Hear them out.'}];
  const out=api.shapePlayerOptions({baseOptions:base,variants:[{label:'You know who I am. Talk.',tags:['threatening'],minBehaviour:{threatening:2}}]});
  assert.equal(out.length,2);
  assert.equal(out[0].label,'Hear them out.');
});

test('race class and skill perspectives unlock knowledge without changing personality history',()=>{
  const {api}=fresh();
  const before=api.ensureState().observations.length;
  assert(api.qualifiesPerspective(global.party[3],{className:'Wizard',minLevel:3,skill:'Arcana',minSkill:8}));
  assert.equal(api.ensureState().observations.length,before);
});

test('party expertise can come from a companion instead of the protagonist',()=>{
  const {api}=fresh();
  const contributors=api.findContributors({skill:'Arcana',minSkill:8});
  assert.equal(contributors[0].name,'Mirabel Quill');
  assert(!contributors.some(c=>c.name==='Player'));
});

test('companions choose materially different expression channels',()=>{
  const {api}=fresh();
  assert.equal(api.chooseChannel({companion:'Wren Talbot',publicText:'x',whisperText:'x'}),'public');
  assert.equal(api.chooseChannel({companion:'Reyna Fletcher',publicText:'x',whisperText:'x'}),'whisper');
  assert.equal(api.chooseChannel({companion:'Fenn Oakheart',publicText:'x',whisperText:'x'}),'defer');
  assert.equal(api.chooseChannel({companion:'Brother Alden',publicText:'x',whisperText:'x'}),'defer');
});

test('deferred reactions wait for privacy and check at most once per in-game minute',()=>{
  const {api}=fresh({worldSeconds:120,entities:[{name:'Courtier',x:1,y:0}]});
  api.queuePending({eventId:'court',mergeKey:'court',companion:'Brother Alden',deferredText:'Later.',privacyThreshold:2});
  let r=api.processPendingPrivacy();
  assert.equal(r.checked,true);
  assert.equal(api.availableFor('Brother Alden').length,0);
  r=api.processPendingPrivacy();
  assert.equal(r.reason,'same_minute');
  global.worldSeconds=180;
  global.entities=[];
  r=api.processPendingPrivacy();
  assert.equal(r.available,1);
  assert.equal(api.availableFor('Brother Alden').length,1);
});

test('related deferred issues merge and can escalate instead of spamming the queue',()=>{
  const {api}=fresh();
  api.queuePending({eventId:'one',mergeKey:'crown',companion:'Reyna Fletcher',deferredText:'First',urgency:1,tags:['trust']});
  api.queuePending({eventId:'two',mergeKey:'crown',companion:'Reyna Fletcher',deferredText:'Second',urgency:3,tags:['justice']});
  const q=api.ensureState().pendingConversations;
  assert.equal(q.length,1);
  assert.equal(q[0].urgency,3);
  assert.deepEqual(new Set(q[0].tags),new Set(['trust','justice']));
  assert.equal(q[0].deferredText,'Second');
});

test('private follow-up responses become player behavioural evidence',()=>{
  const {api}=fresh();
  const item=api.queuePending({eventId:'wren:issue',mergeKey:'wren:issue',companion:'Wren Talbot',deferredText:'Issue'});
  item.status='available';
  api.resolvePending(item,'listen');
  assert.equal(api.behaviourWeight('open_to_dissent'),1);
});

test('old saves initialise without requiring new fields',()=>{
  const {api}=fresh();
  global.party[0].playerDialogueBehaviour={tags:{pragmatic:{weight:2}},observations:[]};
  const s=api.ensureState();
  assert(Array.isArray(s.pendingConversations));
  assert.equal(api.behaviourWeight('pragmatic'),2);
});

test('Queen policy options record player voice and generate party expression',()=>{
  const {api,messages}=fresh();
  let acted=0;
  const opts=api.decorateDialogue({name:'Queen Seraphine Corrin'},'Decision',[{label:'Collective penalties',decisionOutcome:'collective_penalties',action:()=>{acted++;}}]);
  opts[0].action();
  assert.equal(acted,1);
  assert.equal(api.behaviourWeight('collective_punishment'),1);
  assert(messages.some(m=>m.startsWith('Wren Talbot:')));
  assert(api.ensureState().pendingConversations.some(p=>p.companion==='Reyna Fletcher'||p.companion==='Brother Alden'));
});

test('Queen decides records delegation rather than attributing her concrete policy to the player',()=>{
  const {api}=fresh();
  const opts=api.decorateDialogue({name:'Queen Seraphine Corrin'},'Decision',[{label:'You decide',decisionOutcome:'queen_decides',action:()=>{}}]);
  opts[0].action();
  assert.equal(api.behaviourWeight('delegates_judgement'),1);
  assert.equal(api.behaviourWeight('centralising'),0);
});

test('available private issues appear in that companion dialogue without replacing existing options',()=>{
  const {api}=fresh();
  const item=api.queuePending({eventId:'private',mergeKey:'private',companion:'Wren Talbot',topic:'the Queen',deferredText:'We should talk.'});
  item.status='available';
  const out=api.decorateDialogue({name:'Wren Talbot'},'Hello',[{label:'Never mind.',action:()=>{}}]);
  assert(out.some(o=>o.__partyPrivateId===item.id));
  assert(out.some(o=>o.label==='Never mind.'));
});

test('private dialogue can be reopened if the panel is closed without an answer',()=>{
  const {api}=fresh();
  const item=api.queuePending({eventId:'private2',mergeKey:'private2',companion:'Brother Alden',deferredText:'A concern.'});
  item.status='available';
  let rendered;
  global.showDialogue=(npc,text,options)=>{rendered={npc,text,options};return rendered;};
  api.installDialogueHook();
  const decorated=api.decorateDialogue({name:'Brother Alden'},'Hello',[]);
  decorated.find(o=>o.__partyPrivateId===item.id).action();
  assert.equal(item.status,'available');
  assert(rendered.options.some(o=>o.label==='Speak freely.'));
});

console.log('14 tests passed');
