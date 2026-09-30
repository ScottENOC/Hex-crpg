// companionPersonalityKnowledge.js
// Player knowledge of companion values, learned from authored conversations.
(() => {
'use strict';
const root = typeof window !== 'undefined' ? window : globalThis;
const BUILD = '20261001-personality-knowledge-v4';
const CLUES = {
 'Wren Talbot': {
  authority:['Wren is wary of people who expect obedience just because of rank.','Wren dislikes inherited or unearned authority, but respects leadership that proves useful and protects people.','Wren responds best to authority that is accountable and chosen; coercive loyalty is likely to push her away.'],
  mercy:['Wren is softer on frightened or trapped people than on the people doing the trapping.','For Wren, mercy still requires owning harm and trying to repair it.','Wren can accept hard choices, but gratuitous cruelty and treating vulnerable people as expendable cut deeply against her values.'],
  attachment:['Wren notices whether people stay by choice.','Loss and abandonment are tangled together for Wren; reliability matters to her more than she readily admits.','Wren increasingly values freely chosen commitment over loyalty produced by fear, obligation or dependence.'],
  pragmatism:['Wren is not especially impressed by rules merely because they are rules.','Wren can tolerate bending procedure when there is a concrete reason and the cost is owned honestly.','Wren’s pragmatism has limits: she distinguishes breaking a rule to protect people from using people as tools.']
 },
 'Ser Aldric Thorne': {
  duty:['Aldric takes promises unusually seriously.','Aldric cares about the obligation underneath an oath, not only its literal wording.','Aldric respects honest renegotiation of duty far more than quietly deciding a promise has become inconvenient.'],
  burden:['Aldric’s first instinct is often to carry a difficult responsibility himself.','Aldric respects sacrifice, but is learning that sharing a burden need not cheapen it.','Aldric increasingly distinguishes genuine duty from martyrdom performed because accepting help feels uncomfortable.'],
  justice:['Aldric distinguishes force needed to stop a threat from punishment delivered afterwards.','Aldric values restraint, surrender and institutions that make justice less dependent on whoever holds the sword.','Aldric respects institutions only while they constrain the powerful as well as everyone else.']
 },
 'Mirabel Quill': {
  curiosity:['Mirabel finds dangerous questions difficult to leave alone.','Mirabel strongly values preserving knowledge, including knowledge that should not be used casually.','Mirabel is most comfortable with dangerous knowledge when it is understood, documented and constrained rather than destroyed or exploited.'],
  roots:['Mirabel values commitments that remain genuine choices.','Mirabel distrusts grand permanent promises made under pressure.','Mirabel has learned that freedom includes the freedom to stay, not merely the freedom to leave.'],
  responsibility:['Mirabel knows curiosity does not excuse exposing other people to risks they did not choose.','Mirabel distinguishes responsible limits from control: she prefers warnings, context and constrained access to secrecy for its own sake.','Mirabel is especially wary of successful dangerous knowledge, because success can make harm easier to rationalise; she wants knowledge judged separately from permission to use it.']
 },
 'Fenn Oakheart': {
  stewardship:['Fenn sees people as part of nature rather than something outside it.','Fenn thinks both intervention and doing nothing can create responsibilities.','Fenn increasingly judges stewardship by whether farms, woods and rivers can continue functioning without one being sacrificed for another.'],
  independence:['Fenn treats tradition as stored experience rather than automatic truth.','Fenn respects teachers who leave their students able to disagree intelligently.','Fenn responds well when people can explain what a tradition protects instead of merely saying it has always existed.'],
  reciprocity:['Fenn notices who actually bears the cost of a principled decision.','Fenn thinks need creates a reason to ask or renegotiate, not automatic permission to take from somebody else.','Fenn trusts compromises and accords when responsibilities are shared openly and maintained after the dramatic decision is over.']
 },
 'Reyna Fletcher': {
  trust:['Reyna values reliability when it is inconvenient.','Reyna judges people heavily by what they do after they fail.','Reyna can learn to rely on others, but prefers small demonstrated reliability before a large gamble.'],
  justice:['Reyna does not trust institutions merely because they have a crest.','Reyna values systems that admit mistakes, protect people who bring bad news and discipline their own.','Reyna can tolerate institutional imperfection; what she needs is evidence that the institution is correctable.'],
  interdependence:['Reyna’s default is self-reliance; she is more comfortable when she knows exactly which mistakes are hers.','Reyna is learning that being capable alone is different from proving she needs nobody.','Reyna can rely deeply on other competent people when responsibility is clear and reliability has been demonstrated.']
 },
 'Brother Alden': {
  engagement:['Alden values detachment only when it frees people from pride and anger.','Alden does not think impartial compassion requires pretending every action is equally harmless.','Alden increasingly sees personal attachment as one way abstract moral principles become real.'],
  dignity:['For Alden, a number can describe a tragedy without fully describing the people in it.','Alden believes universal compassion should preserve rather than erase individual lives and names.','Alden is suspicious of tidy solutions whose arithmetic only works if nobody looks closely at who pays the cost.'],
  impermanence:['Alden sees mortality and loss as conditions to be faced, not automatically problems to be engineered away.','Alden distinguishes accepting impermanence from refusing care, memory or action; he resists both denial and easy slogans.','Alden judges attempts to escape death by what they do to persons and compassion, not by a blanket rule that undeath either erases or preserves moral worth.']
 }
};
const TOPIC_TRAITS = {
 'Wren Talbot': {values_mercy_truth:'mercy',values_loyalty_independence:'attachment'},
 'Ser Aldric Thorne': {values_duty_mercy:'duty',values_justice:'justice'},
 'Mirabel Quill': {values_knowledge:['curiosity','responsibility'],values_freedom:'roots'},
 'Fenn Oakheart': {values_stewardship:'stewardship',values_authority:'independence'},
 'Reyna Fletcher': {values_trust:'trust',values_institutions:'justice'},
 'Brother Alden': {values_compassion:'engagement',values_names:'dignity'}
};
function player(){ return (Array.isArray(root.party) && root.party[0]) || root.player || null; }
function mergeStore(target,source){
 if(!source||source===target)return target;
 for(const [name,traits] of Object.entries(source)){
  if(!traits||typeof traits!=='object')continue;
  const dest=target[name] ||= {};
  for(const [trait,value] of Object.entries(traits)){
   if(!value||typeof value!=='object')continue;
   if((Number(value.level)||0)>(Number(dest[trait]?.level)||0))dest[trait]={...value};
  }
 }
 return target;
}
function state(){
 const p=player(); if(!p)return null;
 const store=p.companionPersonalityKnowledge ||= {};
 // Early builds used the currently controlled character (`window.player`) as
 // the owner. Fold any such knowledge into the stable lead character so party
 // switching cannot split what the human player has learned.
 if(Array.isArray(root.party))for(const member of root.party)if(member&&member!==p)mergeStore(store,member.companionPersonalityKnowledge);
 return store;
}
function learn(name,trait,amount=1,source=''){
 const levels=CLUES[name]?.[trait], store=state(); if(!levels||!store)return null;
 const char=store[name] ||= {}, previous=Number(char[trait]?.level)||0;
 const level=Math.max(previous,Math.min(levels.length,previous+Math.max(1,amount|0)));
 char[trait]={level,source:source||char[trait]?.source||'',learnedAt:Number(root.worldSeconds||root.gameTime)||0};
 return {name,trait,level,text:levels[level-1],advanced:level>previous};
}
function syncFromConversationHistory(name){
 const companion=(root.party||[]).find((m,i)=>i>0&&m?.name===name); if(!companion)return;
 const history=companion.playerRelationship?.conversationMemory?.history||[];
 const map=TOPIC_TRAITS[name]||{}, store=state(); if(!store)return;
 for(const [topicId,mapped] of Object.entries(map)){
  const uses=history.filter(entry=>entry?.topicId===topicId).length;
  for(const trait of(Array.isArray(mapped)?mapped:[mapped])){
   const current=Number(store[name]?.[trait]?.level)||0;
   const target=Math.min(CLUES[name][trait].length,uses);
   if(target>current) learn(name,trait,target-current,topicId);
  }
 }
}
function get(name,trait){ syncFromConversationHistory(name); const level=Number(state()?.[name]?.[trait]?.level)||0; return {level,text:level?CLUES[name]?.[trait]?.[Math.min(level,CLUES[name][trait].length)-1]:null}; }
function known(name){ syncFromConversationHistory(name); return Object.keys(CLUES[name]||{}).map(trait=>({trait,...get(name,trait)})).filter(x=>x.level>0); }
function allClues(name){ return CLUES[name]?JSON.parse(JSON.stringify(CLUES[name])):{}; }
function discoverableTraits(name){ return Object.keys(CLUES[name]||{}); }
const api={build:BUILD,learn,get,known,allClues,discoverableTraits,syncFromConversationHistory};
root.companionPersonalityKnowledge=api; root.learnCompanionPersonality=learn; root.getCompanionPersonalityKnowledge=get; root.COMPANION_PERSONALITY_KNOWLEDGE_BUILD=BUILD;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
