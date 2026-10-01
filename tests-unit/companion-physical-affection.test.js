const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = '../companionPhysicalAffection.js';

function boot({name='Reyna Fletcher', band='friend', friendship=70, romanticBond=0, attraction=20, trust=50, agreement='none', mode='close_friend', boundary='unspoken', moving=false, camp=null}={}) {
  delete require.cache[require.resolve(modulePath)];
  global.window = global;
  global.document = undefined;
  global.isInCombat = false;
  global.worldSeconds = 1234;
  const hero = {name:'Hero'};
  const companion = {name, playerAffinity:{friendship, romanticBond, attraction, physicalBoundary:boundary, agreement:{state:agreement}}};
  global.party = [hero, companion];
  global.entities = [
    {name:'Hero', alive:true, side:'player', destination:moving ? {q:1,r:1} : null},
    {name, alive:true, side:'player', destination:null},
  ];
  global.getCompanionRelationship = () => ({trust, familiarity:70});
  global.getCompanionAffinity = c => c.playerAffinity;
  global.getCompanionRomanceState = c => ({affinity:c.playerAffinity, agreement:c.playerAffinity.agreement, interpretation:{mode}});
  global.companionRomance = {interpretRelationship:()=>({mode})};
  global.companionRelationshipMoments = {
    relationshipBand:()=>band,
    campContext:()=>camp ? {sameTent:!!camp.sameTent,cold:!!camp.cold,onGuard:false} : null,
  };
  global.campSystem = {getCamp:()=>camp};
  global.registered = [];
  global.companionConversationMemory = {
    registerTopics:(n,t)=>registered.push({n,t}),
    openHub:()=>{},
  };
  global.dialogues = [];
  global.showDialogue = (npc,text,options)=>dialogues.push({npc,text,options});
  const api = require(modulePath);
  return {api, hero, companion};
}

test('registers physical affection topic for all six companions', () => {
  boot();
  assert.equal(global.registered.length, 6);
});

test('friendship can unlock a hug without unlocking a kiss', () => {
  const {api, companion} = boot();
  const labels = api.gestureOptions(companion).map(x=>x.label);
  assert.ok(labels.some(x=>/hug/i.test(x)));
  assert.ok(!labels.some(x=>/kiss/i.test(x)));
});

test('moving outside camp suppresses affection topic', () => {
  const {api, companion} = boot({moving:true});
  assert.equal(api.canPauseTogether(companion), false);
});

test('camp permits interaction even if ordinary movement state would not', () => {
  const {api, companion} = boot({moving:true,camp:{sameTent:true,cold:false}});
  assert.equal(api.canPauseTogether(companion), true);
  assert.ok(api.gestureOptions(companion).some(x=>/sleep|warmth/i.test(x.label)));
});

test('dating romance unlocks hand holding and a requested kiss', () => {
  const {api, companion} = boot({band:'romantic', friendship:72, romanticBond:70, attraction:70, agreement:'dating', mode:'romantic'});
  const labels = api.gestureOptions(companion).map(x=>x.label);
  assert.ok(labels.some(x=>/hand/i.test(x)));
  assert.ok(labels.some(x=>/kiss/i.test(x)));
});

test('Wren love/desire conflict does not unlock kiss before explicit mutual-slow agreement', () => {
  let env = boot({name:'Wren Talbot',band:'romantic',friendship:80,romanticBond:80,attraction:20,agreement:'none',mode:'love_desire_conflict',boundary:'unspoken'});
  assert.equal(env.api.kissAllowed(env.companion), false);
  env = boot({name:'Wren Talbot',band:'committed',friendship:80,romanticBond:80,attraction:20,agreement:'committed',mode:'love_desire_conflict',boundary:'mutual_slow'});
  assert.equal(env.api.kissAllowed(env.companion), true);
});

test('Alden can have affectionate kissing in established asexual romance without sexual attraction', () => {
  const {api, companion} = boot({name:'Brother Alden',band:'romantic',friendship:80,romanticBond:75,attraction:0,agreement:'dating',mode:'asexual_romance'});
  assert.equal(api.kissAllowed(companion), true);
  const kiss = api.gestureOptions(companion).find(x=>/kiss/i.test(x.label));
  kiss.action();
  assert.match(global.dialogues.at(-1).text, /Affectionate, not sexual|kind of closeness/i);
});

test('strained agreement suppresses kissing', () => {
  const {api, companion} = boot({band:'strained',friendship:80,romanticBond:80,attraction:80,agreement:'strained',mode:'romantic'});
  assert.equal(api.kissAllowed(companion), false);
  assert.equal(api.gestureOptions(companion).length, 0);
});

test('physical gestures do not award relationship points and record only interaction memory', () => {
  const {api, hero, companion} = boot();
  const before = JSON.stringify(companion.playerAffinity);
  api.gestureOptions(companion).find(x=>/hug/i.test(x.label)).action();
  assert.equal(JSON.stringify(companion.playerAffinity), before);
  assert.equal(hero.companionPhysicalAffectionMemory[companion.name].lastGesture, 'hugFriend');
});
