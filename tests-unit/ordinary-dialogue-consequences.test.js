const assert = require('assert');
const path = require('path');
const MODULE = path.resolve(__dirname,'../ordinaryDialogueConsequences.js');
const LEVERAGE = path.resolve(__dirname,'../leverage.js');

function reset() {
  delete require.cache[MODULE];
  delete require.cache[LEVERAGE];
  global.window = global;
  global.document = undefined;
  global.worldSeconds = 100;
  global.party = [
    {name:'Player',gold:100,skills:{insight:0},inventory:['fish','fish','fruit','herbs','herbs']},
    {name:'Reyna Fletcher',skills:{insight:3}},
    {name:'Brother Alden',skills:{insight:1}},
  ];
  global.player = global.party[0];
  const recorded=[], reactions=[], dialogues=[], messages=[];
  global.partyConversationRollout = {
    recordDialogueChoice:(sourceId,choiceId,meta) => {
      const key=`${sourceId}|${choiceId}|${meta.context}`;
      if (recorded.some(x=>x.key===key)) return false;
      recorded.push({key,sourceId,choiceId,...meta});
      return true;
    }
  };
  global.partyConversationDynamics = {
    raiseReaction:r=>{reactions.push(r); return {channel:'defer'};},
    skillValue:(c,s)=>Number(c?.skills?.[s]||0),
    findContributors:({skill,minSkill=1,includePlayer=true})=>global.party
      .filter((c,i)=>(includePlayer||i>0)&&Number(c?.skills?.[skill]||0)>=minSkill)
      .sort((a,b)=>Number(b.skills[skill]||0)-Number(a.skills[skill]||0)),
  };
  global.showDialogue = (speaker,prompt,options=[]) => {
    dialogues.push({speaker,prompt,options});
    return {speaker,prompt,options};
  };
  global.showMessage = m=>messages.push(m);
  global.readTheRoom = (npc,who)=>({text:`${who.name} reads ${npc.name}.`,signal:2});
  global.npcDialogueTrees = {};
  const api=require(MODULE);
  return {api,recorded,reactions,dialogues,messages};
}
function test(name,fn){try{fn();console.log(`ok - ${name}`);}catch(e){console.error(`not ok - ${name}`);throw e;}}

test('catalogue covers broad ordinary-choice categories',()=>{
  const {api}=reset();
  const scenes=new Set(api.DEFAULT_RULES.map(r=>r.sceneId));
  assert(scenes.size>=12);
  assert(api.DEFAULT_RULES.some(r=>r.tags.includes('bribery')));
  assert(api.DEFAULT_RULES.some(r=>r.tags.includes('mercy')));
  assert(api.DEFAULT_RULES.some(r=>r.tags.includes('deception')));
  assert(api.DEFAULT_RULES.some(r=>r.tags.includes('generosity')));
  assert(api.DEFAULT_RULES.some(r=>r.tags.includes('contract_killing')));
});

test('scene wrapper decorates the live authored choice and records it',()=>{
  const {api,recorded,dialogues}=reset();
  global.npcDialogueTrees.guild_investigator=(npc)=>global.showDialogue(npc,'You know anything?',[
    {label:"No idea what you're talking about.",action:()=>{}},
    {label:'Say nothing.',action:()=>{}},
  ]);
  api.install(); api.installSceneHooks();
  global.npcDialogueTrees.guild_investigator({name:'Investigator'});
  const dlg=dialogues.at(-1);
  assert.equal(dlg.options[0].__ordinaryDialogueConsequences,true);
  dlg.options[0].action();
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].choiceId,'deny_hidden_bodies');
});

test('decorated option records and dedupes exact semantic rule',()=>{
  const {api,recorded}=reset();
  const opts=api.decorateOptions('guild_investigator',{name:'Investigator'},'Three men vanished.',[
    {label:"No idea what you're talking about.",action:()=>{}},
  ]);
  opts[0].action(); opts[0].action();
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('deception'));
  assert.equal(recorded[0].context,'self_protection');
});

test('failed transactional choice is not recorded',()=>{
  const {api,recorded}=reset();
  global.party[0].gold=10;
  const opt=api.decorateOptions('reddale_guard',{name:'Bram'},'Gate duty.',[
    {label:'Ask him to bury the border sighting. (25 gold)',action:()=>{}},
  ])[0];
  opt.action();
  assert.equal(recorded.length,0);
  global.party[0].gold=30;
  opt.action();
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('bribery'));
});

test('significant ordinary choices can provoke companion follow-up',()=>{
  const {api,reactions}=reset();
  const opt=api.decorateOptions('reddale_disciple',{name:'Mirella Thorn'},'Sharp eye.',[
    {label:"Your secret's safe with me — for now.",action:()=>{}},
  ])[0];
  opt.action();
  assert.equal(reactions.length,1);
  assert.equal(reactions[0].companion,'Brother Alden');
});

test('nested dialogue keeps its scene context through the option action',()=>{
  const {api,recorded,dialogues}=reset();
  global.npcDialogueTrees.thieves_guild_debtor=(npc)=>global.showDialogue(npc,'I need more time.',[
    {label:'"Corvin Ashe sent me. Pay up."',action:()=>global.showDialogue(npc,'Fine.',[
      {label:'Take the coin.',action:()=>{}},
    ])}
  ]);
  api.install(); api.installSceneHooks();
  global.npcDialogueTrees.thieves_guild_debtor({name:'Marsh Dobbins'});
  const first=dialogues.at(-1);
  first.options[0].action();
  assert.equal(recorded.length,1);
  assert.equal(recorded[0].choiceId,'pressure_guild_debtor');
  const nested=dialogues.at(-1);
  assert.equal(nested.options[0].__ordinaryDialogueConsequences,true);
});

test('stronger companion Insight adds an authored party-expertise route',()=>{
  const {api,dialogues}=reset();
  global.npcDialogueTrees.reddale_guard=(npc)=>global.showDialogue(npc,'I just mind the gate.',[
    {label:'Try to read him.',action:()=>{}},
    {label:'Noted.',action:()=>{}},
  ]);
  api.install(); api.installSceneHooks();
  const npc={name:'Bram'};
  global.npcDialogueTrees.reddale_guard(npc);
  const dlg=dialogues.at(-1);
  const expert=dlg.options.find(o=>o.__partyExpertise);
  assert(expert);
  assert(expert.label.includes('Reyna'));
  expert.action();
  const follow=dialogues.at(-1);
  assert.equal(follow.speaker.name,'Reyna Fletcher');
  assert(follow.prompt.includes('Reyna Fletcher reads Bram'));
});

test('religious party knowledge is attributed to the companion who has it',()=>{
  const {api}=reset();
  global.hasKnowledgeReligion=c=>c?.name==='Brother Alden';
  const opts=api.decorateOptions('reddale_disciple',{name:'Mirella Thorn'},'Herbs for a cough.',[
    {label:'Look closer at her wares.',action:()=>{}},
  ]);
  assert(opts[0].label.includes('Alden'));
  assert.equal(opts[0].__partyExpertise,true);
});

test('explicit option metadata gives future scenes a no-catalogue opt-in',()=>{
  const {api,recorded}=reset();
  const raw=api.tagOption({label:'Tell the truth.',action:()=>{}},{
    choiceId:'confess',context:'testimony',tags:['honesty','accountability']
  });
  const opt=api.decorateOptions('future_scene',{name:'NPC'},'Well?',[raw])[0];
  opt.action();
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('honesty'));
});

test('generic gold leverage records only after a successful payment',()=>{
  const {recorded,messages}=reset();
  require(LEVERAGE);
  const npc={name:'Bram',dialogueId:'reddale_guard',wants:{type:'gold',amount:20,offerLabel:'bribe'},leverageClues:()=>2};
  global.party[0].gold=10;
  let option=global.getLeverageOptions(npc,global.party[0])[0];
  option.action();
  assert.equal(recorded.length,0);
  global.party[0].gold=100;
  option=global.getLeverageOptions(npc,global.party[0])[0];
  option.action();
  assert.equal(recorded.length,1);
  assert(recorded[0].tags.includes('bribery'));
  assert(messages.some(m=>m.includes('hand over')));
});

console.log('10 tests passed');
