const test=require('node:test');
const assert=require('node:assert/strict');
const modulePath=require.resolve('../companionTriadConversations.js');
function load(opts={}){
 delete require.cache[modulePath];
 for(const k of ['party','player','worldSeconds','isInCombat','campSystem','companionConversationMemory','companionContextualBanter','partyConversationDynamics','showMessage','showDialogue','document','addEventListener','setInterval'])delete global[k];
 const pc={name:'PC'},wren={name:'Wren Talbot'},aldric={name:'Ser Aldric Thorne'},mirabel={name:'Mirabel Quill'};global.party=[pc,wren,aldric,mirabel];global.player=pc;global.worldSeconds=opts.time??36000;global.isInCombat=!!opts.combat;
 const pairs={},key=(a,b)=>[typeof a==='string'?a:a.name,typeof b==='string'?b:b.name].sort().join('|');
 global.companionContextualBanter={pairState(a,b){const k=key(a,b);return pairs[k]||={familiarity:opts.familiarity??30,warmth:opts.warmth??5};},pairAffinity(a,b,d){const s=this.pairState(a,b);s.warmth+=d;return s;}};
 global.companionConversationMemory={topics:[],registerTopics(name,topics){this.topics.push([name,...topics]);return true;}};
 global.partyConversationDynamics={records:[],recordPlayerChoice(x){this.records.push(x);return true;},shapePlayerOptions({baseOptions,variants}){return opts.shape?[...baseOptions,variants[0]]:baseOptions;}};
 global.showMessage=()=>{};global.showDialogue=(speaker,text,options)=>{global.__lastDialogue={speaker,text,options};};if(opts.camp)global.campSystem={getCamp:()=>opts.camp};
 const api=require(modulePath);return{api,pc,wren,aldric,mirabel,pairs};
}
test('registers triad topic for all core companions',()=>{load();const names=global.companionConversationMemory.topics.map(r=>r[0]);for(const n of ['Wren Talbot','Ser Aldric Thorne','Mirabel Quill','Fenn Oakheart','Reyna Fletcher','Brother Alden'])assert.ok(names.includes(n));});
test('requires two present companions with enough pair familiarity',()=>{const{api}=load({familiarity:5});assert.equal(api.eligibleScenes().length,0);global.companionContextualBanter.pairState('Wren Talbot','Ser Aldric Thorne').familiarity=30;assert.ok(api.eligibleScenes().some(s=>s.a==='Wren Talbot'&&s.b==='Ser Aldric Thorne'));});
test('offers a pending discussion while stationary',()=>{const{api}=load();const out=api.offer({force:true});assert.ok(out&&out.scene);assert.ok(api.pending());});
test('moving participants block the live topic',()=>{const{api,wren}=load();api.offer({force:true});wren.destination={x:1,y:1};assert.equal(api.render(),null);});
test('combat blocks offers',()=>{const{api}=load({combat:true});assert.equal(api.offer({force:true}),false);});
test('rendered scene gives protagonist several genuine choices',()=>{const{api}=load();api.offer({force:true});const r=api.render();assert.ok(r);assert.ok(r.options.length>=4);});
test('mediating improves pair warmth without changing player romance state',()=>{const{api,wren,aldric}=load();api.memory().pending={sceneId:'wren_aldric_authority',a:wren.name,b:aldric.name,offeredAt:global.worldSeconds};const before=api.pairState(wren,aldric).warmth,playerBefore=JSON.stringify(wren.playerAffinity||null),scene=api.pending().scene;api.resolve(scene,scene.options.find(o=>o[0]==='mediate'));assert.equal(api.pairState(wren,aldric).warmth,before+1);assert.equal(JSON.stringify(wren.playerAffinity||null),playerBefore);});
test('player response becomes behavioural evidence witnessed by both companions',()=>{const{api}=load();const scene=api.scenes.find(s=>s.id==='wren_aldric_authority');api.memory().pending={sceneId:scene.id,a:scene.a,b:scene.b,offeredAt:global.worldSeconds};api.resolve(scene,scene.options[0]);const rec=global.partyConversationDynamics.records.at(-1);assert.equal(rec.sourceId,'triad_conversation');assert.deepEqual(rec.witnessedBy,[scene.a,scene.b]);});
test('resolved authored scene is not offered again',()=>{const{api}=load();const scene=api.scenes.find(s=>s.id==='wren_aldric_authority');api.memory().seen[scene.id]=1;assert.ok(!api.eligibleScenes().some(s=>s.id===scene.id));});
test('existing player personality can add shaped response without replacing baseline',()=>{const{api}=load({shape:true});const opts=api.options(api.scenes[0]);assert.ok(opts.length>=5);assert.ok(opts.some(o=>o.__triadChoice==='take_over'));assert.ok(opts.some(o=>o.__triadChoice==='mediate'));});
test('camp offers at most one new discussion per camp setup',()=>{const camp={startedAt:100};const{api}=load({camp});const first=api.handleCamp(camp);assert.ok(first);api.clearPending();assert.equal(api.handleCamp(camp),false);});
test('all fifteen companion pairs have authored scenes',()=>{const{api}=load();const pairs=new Set(api.scenes.map(s=>[s.a,s.b].sort().join('|')));assert.equal(pairs.size,15);});
