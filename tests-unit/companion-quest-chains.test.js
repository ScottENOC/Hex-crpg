const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const modulePath=require.resolve('../companionQuestChains.js');

function boot({name='Mirabel Quill',previous='mirabel_unquiet_concordance',arc={restraint:20,rootedness:5}}={}){
 delete require.cache[modulePath];
 global.window=global;
 global.document=undefined;
 global.party=[{name:'Hero'},{name}];
 global.questLog=[{id:previous,status:'completed'}];
 global.worldSeconds=123;
 global.messages=[]; global.dialogues=[]; global.arcCalls=[]; global.relationshipCalls=[]; global.affinityCalls=[]; global.clues=[];
 global.showMessage=m=>messages.push(m);
 global.showDialogue=(npc,text,options)=>{dialogues.push({npc,text,options});};
 global.adjustCompanionRelationship=(c,d,r)=>relationshipCalls.push({c,d,r});
 global.adjustCompanionAffinity=(c,d,r,k)=>affinityCalls.push({c,d,r,k});
 global.learnCompanionPersonality=(n,t,a,s)=>clues.push({n,t,a,s});
 global.gainExp=()=>{}; global.noteCompanionConversation=()=>{};
 global.mirabelUnquietConcordance={getArcState:()=>arc,applyArcChange:(k,d,r)=>arcCalls.push({k,d,r})};
 global.fennLivingBoundary={getArcState:()=>arc,applyArcChange:(k,d,r)=>arcCalls.push({k,d,r})};
 global.reynaEmptyBlind={getArcState:()=>arc,applyArcChange:(k,d,r)=>arcCalls.push({k,d,r})};
 global.aldenUncounted={getArcState:()=>arc,applyArcChange:(k,d,r)=>arcCalls.push({k,d,r})};
 global.aldricMeasureOfOath={ensureArc:()=>arc,adjustArc:(k,d,r)=>arcCalls.push({k,d,r})};
 return require(modulePath);
}

test('ships all nine missing chapters',()=>{
 const api=boot();
 assert.equal(api.chapters.length,9);
 assert.deepEqual(api.chapters.filter(c=>c.chapter===3).map(c=>c.companion).sort(),['Brother Alden','Fenn Oakheart','Mirabel Quill','Reyna Fletcher','Ser Aldric Thorne'].sort());
});

test('chapter starts only after predecessor and advances through world consultation',()=>{
 const api=boot();
 const ch=api.chapter('mirabel_borrowed_voice');
 assert.equal(api.canStart(ch),true);
 const option=api.companionQuestOption('Mirabel Quill');
 assert.match(option.label,/Borrowed Voice/);
 option.action();
 const q=global.questLog.find(q=>q.id===ch.id);
 assert.equal(q.stage,'consult');
 const actorOption=api.actorQuestOption({name:'Court Wizard Thessaly'});
 assert.match(actorOption.label,/message-stone/);
 actorOption.action();
 assert.equal(q.consulted,true);
 assert.equal(q.stage,'reckoning');
});

test('direct resolution persists outcome and changes existing arc',()=>{
 const api=boot();
 const ch=api.chapter('mirabel_borrowed_voice');
 api.ensureQuest(ch); api.consult(ch,{name:'Court Wizard Thessaly'});
 assert.equal(api.complete(ch,'limited_testimony'),true);
 const q=global.questLog.find(q=>q.id===ch.id);
 assert.equal(q.status,'completed');
 assert.equal(q.resolution,'limited_testimony');
 assert.equal(q.effectiveResolution,'limited_testimony');
 assert.deepEqual(global.arcCalls[0].d,{restraint:20,rootedness:5});
 assert.equal(global.relationshipCalls.length,1);
 assert.ok(global.clues.some(c=>c.t==='curiosity'));
});

test('letting companion decide uses accumulated arc state but rewards trust',()=>{
 const api=boot({arc:{restraint:-35,rootedness:-20}});
 const ch=api.chapter('mirabel_borrowed_voice');
 api.ensureQuest(ch); api.consult(ch,{name:'Court Wizard Thessaly'});
 api.complete(ch,'companion_decides');
 const q=global.questLog.find(q=>q.id===ch.id);
 assert.equal(q.resolution,'companion_decides');
 assert.equal(q.effectiveResolution,'full_reconstruction');
 assert.deepEqual(global.arcCalls[0].d,{restraint:-22,rootedness:1});
 assert.equal(global.relationshipCalls[0].d.trust,12);
});

test('chapter three unlocks only after chapter two is completed',()=>{
 const api=boot();
 const ch2=api.chapter('mirabel_borrowed_voice');
 const ch3=api.chapter('mirabel_place_for_dangerous_books');
 assert.equal(api.canStart(ch3),false);
 global.questLog.push({id:ch2.id,status:'completed',completedAt:global.worldSeconds});
 assert.equal(api.canStart(ch3),false);
 global.worldSeconds += 43200;
 assert.equal(api.canStart(ch3),true);
 assert.equal(api.nextChapterFor('Mirabel Quill').id,ch3.id);
});

test('dialogue decoration adds relevant quest option without replacing existing choices',()=>{
 const api=boot();
 api.ensureQuest('mirabel_borrowed_voice');
 const options=[{label:'Ordinary archive business.',action(){}}];
 const decorated=api.decorateOptions({name:'Court Wizard Thessaly'},options);
 assert.equal(options.length,1);
 assert.equal(decorated.length,2);
 assert.ok(decorated.some(o=>o.__companionQuestChain==='mirabel_borrowed_voice'));
});
