const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../companionFashionPreferences.js');

function load({shirt='top_masc_laced', hue=210, opacity=1, attraction=18, companion='Wren Talbot', familiarity=60}={}) {
  delete require.cache[modulePath];
  for (const k of ['party','player','items','clothingSystem','equipmentAppearanceSystem','companionAffinity','companionRomance','companionConversationMemory','getCompanionAffinity','getCompanionRomanceReadiness','getCompanionRelationship','companionFashion','getCompanionEffectiveAttraction','document','entities','isInCombat','showMessage']) delete global[k];
  const p={name:'PC',gender:'female',equipped:{shirt,pants:'pants_trousers'},clothingColors:{
    [shirt]:{base:{hue,saturation:45,value:42,opacity}},pants_trousers:{base:{hue,saturation:40,value:35,opacity:1}}
  }};
  const c={name:companion,playerAffinity:{friendship:60,romanticBond:20,attraction},playerRelationship:{familiarity,trust:50}};
  global.party=[p,c]; global.player=p; global.items={
    top_masc_laced:{name:'Laced Tunic',clothingGender:'male',type:'clothes'},
    shirt_mesh_turtleneck:{name:'Mesh Turtleneck',description:'open-mesh turtleneck',fashionTier:'statement',type:'clothes'},
    shirt_collared:{name:'Collared Shirt',fashionTier:'everyday',type:'clothes'},
    pants_trousers:{name:'Trousers',type:'clothes'},
  };
  global.clothingSystem={getItemSpec(){return {layers:[{id:'base',defaultColor:{hue:110,saturation:50,value:50,opacity:1}}]};}};
  global.equipmentAppearanceSystem={isSlotVisible(){return true;}};
  global.getCompanionRelationship=x=>x.playerRelationship;
  const caps={'Wren Talbot':30,'Brother Alden':0,'Ser Aldric Thorne':100,'Mirabel Quill':100,'Fenn Oakheart':100,'Reyna Fletcher':100};
  global.companionAffinity={
    compatibilityFor(x){return {attractionCap:caps[x.name]??100};},
    attractionSignals(a,r,t){return {attractionBand:a>=60?'strong':a>=40?'noticeable':'modest',strongPhysicalDesire:a>=t};}
  };
  global.getCompanionAffinity=x=>({...x.playerAffinity,presentation:'feminine',attractionCap:caps[x.name]??100});
  global.getCompanionRomanceReadiness=x=>({...global.getCompanionAffinity(x),strongPhysicalDesireThreshold:60});
  global.companionRomance={voiceLines:{},interpretRelationship(){return {mode:'early',style:{casualSex:true,friendsWithBenefits:true}};}};
  global.companionConversationMemory={topics:[],registerTopics(name,topics){this.topics.push([name,...topics]);return true;}};
  return {api:require(modulePath),p,c};
}

test('outfit bonus is temporary and cannot exceed orientation cap',()=>{
  const {api,c}=load({attraction:28});
  const before=c.playerAffinity.attraction;
  const ev=api.evaluate(c);
  assert.ok(ev.modifier>0);
  assert.equal(ev.effectiveAttraction,30);
  assert.equal(c.playerAffinity.attraction,before);
});

test('Alden can like an outfit aesthetically without sexual attraction',()=>{
  const {api,c}=load({companion:'Brother Alden',attraction:0});
  const ev=api.evaluate(c);
  assert.equal(ev.modifier,0);
  assert.equal(ev.effectiveAttraction,0);
  assert.match(api.commentText(c).text,/aesthetic|colour|comfortable|taste/i);
});

test('transparency counts as revealing and companions can disagree',()=>{
  const reyna=load({companion:'Reyna Fletcher',shirt:'shirt_mesh_turtleneck',hue:135,opacity:.35,attraction:30});
  const r=reyna.api.evaluate(reyna.c);
  assert.ok(r.snapshot.features.revealing>.35);
  const aldric=load({companion:'Ser Aldric Thorne',shirt:'shirt_mesh_turtleneck',hue:135,opacity:.35,attraction:30});
  const a=aldric.api.evaluate(aldric.c);
  assert.ok(r.aestheticScore>a.aestheticScore);
});

test('colour ranges matter without enumerating exact colours',()=>{
  const blue=load({hue:210});
  const blueScore=blue.api.evaluate(blue.c).colour.score;
  const yellow=load({hue:55});
  const yellowScore=yellow.api.evaluate(yellow.c).colour.score;
  assert.ok(blueScore>yellowScore);
});

test('Mirabel novelty bonus decays after an outfit has been seen',()=>{
  const {api,p,c}=load({companion:'Mirabel Quill',shirt:'shirt_mesh_turtleneck',hue:285});
  const first=api.evaluate(c,p,{includeNovelty:true});
  api.observe(c,p);
  const later=api.evaluate(c,p,{includeNovelty:true});
  assert.ok(first.aestheticScore>later.aestheticScore);
});

test('Wren can revise her own explanation of what style she likes',()=>{
  const {api,c}=load({companion:'Wren Talbot'});
  api.observe(c);
  global.party[0].clothingColors.top_masc_laced.base.hue=150; api.observe(c);
  global.party[0].clothingColors.top_masc_laced.base.hue=30; api.observe(c);
  assert.match(api.selfDiscovery(c),/thought it was the men’s clothes|sharper cuts/i);
});

test('fashion opinion becomes available only after enough familiarity',()=>{
  const x=load({familiarity:20});
  const topic=global.companionConversationMemory.topics.find(row=>row[0]==='Wren Talbot')[1];
  assert.equal(topic.condition({companion:x.c,player:x.p}),false);
  x.c.playerRelationship.familiarity=40;
  assert.equal(topic.condition({companion:x.c,player:x.p}),true);
});

test('wrapped affinity exposes effective attraction without replacing stored attraction',()=>{
  const {c}=load({attraction:28});
  const state=global.getCompanionAffinity(c);
  assert.equal(state.attraction,28);
  assert.ok(state.effectiveAttraction>=28);
  assert.ok(state.effectiveAttraction<=30);
});

test('temporary outfit attraction can affect current readiness without changing stored attraction',()=>{
  const {c}=load({companion:'Reyna Fletcher',shirt:'shirt_collared',hue:135,attraction:39});
  const readiness=global.getCompanionRomanceReadiness(c);
  assert.equal(c.playerAffinity.attraction,39);
  assert.ok(readiness.effectiveAttraction>=39);
  assert.equal(readiness.baseAttraction,39);
});

test('fashion comments do not award affinity points',()=>{
  const {api,c}=load({attraction:18});
  const before=JSON.stringify({f:c.playerAffinity.friendship,r:c.playerAffinity.romanticBond,a:c.playerAffinity.attraction});
  api.commentText(c);
  const after=JSON.stringify({f:c.playerAffinity.friendship,r:c.playerAffinity.romanticBond,a:c.playerAffinity.attraction});
  assert.equal(after,before);
});
