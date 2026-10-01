// companionFashionPreferences.js
// Temporary, orientation-capped outfit attraction and authored fashion opinions.
(function (root) {
'use strict';

const BUILD = '20261001-companion-fashion-preferences-v1';
const DAY = 86400;
const TOPIC_ID = 'fashion_opinion';
const CORE = Object.freeze(['Wren Talbot','Ser Aldric Thorne','Mirabel Quill','Fenn Oakheart','Reyna Fletcher','Brother Alden']);
const STYLE_KEYS = Object.freeze(['masculine','feminine','structured','fitted','practical','revealing','unusual','formal','flowing','ornate']);
const SLOT_WEIGHT = Object.freeze({ shirt:1, topOuter:.9, coat:.8, cloak:.65, pants:.9, tights:.55, bra:.35, underwear:.3 });
const STYLE_LABEL = Object.freeze({
  masculine:'the sharper, more masculine line', feminine:'the softer, more feminine line', structured:'the structure', fitted:'the fit',
  practical:'how practical it looks', revealing:'how much it shows', unusual:'that it is unusual', formal:'the formality', flowing:'the movement of it', ornate:'the detail',
});

const PROFILES = Object.freeze({
  'Wren Talbot': Object.freeze({
    style:Object.freeze({ masculine:.25, feminine:-.15, structured:.9, fitted:.75, practical:.45, revealing:.15, unusual:.05, formal:.15, flowing:-.1, ornate:-.1 }),
    beliefs:Object.freeze({ masculine:.78, feminine:-.15, structured:.30, fitted:.30, practical:.35, revealing:.05, unusual:0, formal:.1, flowing:0, ornate:0 }),
    colours:Object.freeze({ likes:[210,145], dislikes:[55], saturation:.45, value:.42 }), novelty:.08,
  }),
  'Ser Aldric Thorne': Object.freeze({
    style:Object.freeze({ masculine:.1, feminine:.15, structured:.85, fitted:.35, practical:.55, revealing:-.6, unusual:-.45, formal:.8, flowing:.1, ornate:.1 }),
    beliefs:Object.freeze({ masculine:.05, feminine:.2, structured:.75, fitted:.2, practical:.55, revealing:-.55, unusual:-.35, formal:.75, flowing:.1, ornate:.1 }),
    colours:Object.freeze({ likes:[220,355], dislikes:[65], saturation:.42, value:.34 }), novelty:-.2,
  }),
  'Mirabel Quill': Object.freeze({
    style:Object.freeze({ masculine:.1, feminine:.1, structured:.25, fitted:.35, practical:-.1, revealing:.2, unusual:.95, formal:.1, flowing:.35, ornate:.65 }),
    beliefs:Object.freeze({ masculine:0, feminine:.1, structured:.1, fitted:.25, practical:-.1, revealing:.15, unusual:.85, formal:.05, flowing:.25, ornate:.55 }),
    colours:Object.freeze({ likes:[285,185], dislikes:[85], saturation:.72, value:.58 }), novelty:.9,
  }),
  'Fenn Oakheart': Object.freeze({
    style:Object.freeze({ masculine:.05, feminine:.05, structured:-.2, fitted:.2, practical:.65, revealing:.25, unusual:.3, formal:-.55, flowing:.55, ornate:-.1 }),
    beliefs:Object.freeze({ masculine:0, feminine:0, structured:-.15, fitted:.1, practical:.6, revealing:.2, unusual:.2, formal:-.5, flowing:.5, ornate:-.1 }),
    colours:Object.freeze({ likes:[115,35], dislikes:[300], saturation:.45, value:.48 }), novelty:.3,
  }),
  'Reyna Fletcher': Object.freeze({
    style:Object.freeze({ masculine:.15, feminine:.2, structured:.35, fitted:.85, practical:.9, revealing:.45, unusual:.1, formal:-.65, flowing:-.2, ornate:-.35 }),
    beliefs:Object.freeze({ masculine:.1, feminine:.15, structured:.25, fitted:.7, practical:.85, revealing:.35, unusual:.05, formal:-.6, flowing:-.15, ornate:-.3 }),
    colours:Object.freeze({ likes:[135,215], dislikes:[55], saturation:.35, value:.28 }), novelty:.08,
  }),
  'Brother Alden': Object.freeze({
    style:Object.freeze({ masculine:0, feminine:0, structured:.2, fitted:.05, practical:.55, revealing:0, unusual:.15, formal:.15, flowing:.35, ornate:-.15 }),
    beliefs:Object.freeze({ masculine:0, feminine:0, structured:.15, fitted:.05, practical:.5, revealing:0, unusual:.1, formal:.15, flowing:.3, ornate:-.1 }),
    colours:Object.freeze({ likes:[200,35], dislikes:[], saturation:.25, value:.6 }), novelty:.15,
  }),
});

const CATALOG = Object.freeze({
  top_masc_toggle:{ masculine:1, structured:.55, practical:.75 },
  top_masc_lacework:{ masculine:.9, structured:.45, fitted:.45, ornate:.55 },
  top_masc_laced:{ masculine:.9, structured:.5, fitted:.5, practical:.45 },
  top_masc_buttoned:{ masculine:.85, structured:.7, practical:.8 },
  top_blouse:{ feminine:.75, flowing:.55, formal:.2 },
  top_dress:{ feminine:1, flowing:.7, formal:.45, revealing:.15 },
  top_shirt_f:{ feminine:.7, fitted:.85, structured:.45 },
  pants_trousers:{ practical:.85, structured:.35 },
  pants_breeches:{ practical:.8, fitted:.45, masculine:.2 },
  pants_hose:{ fitted:.75, revealing:.15, formal:.15 },
  pants_baggy_wraps:{ practical:.7, flowing:.45 },
  underwear_briefs:{ revealing:.25, fitted:.55 },
  underwear_briefs_gstring:{ revealing:1, fitted:.8, unusual:.35 },
  underwear_bra:{ revealing:.65, fitted:.65, feminine:.55 },
  underwear_bra_strapless:{ revealing:.75, fitted:.7, feminine:.6 },
  shirt_plunge:{ fitted:.75, revealing:.85, unusual:.35, feminine:.25 },
  shirt_tie_tank:{ fitted:.55, revealing:.55, practical:.35, unusual:.2 },
  corset_lace:{ structured:.95, fitted:.95, revealing:.5, ornate:.8, feminine:.5, unusual:.65 },
  pants_lattice:{ fitted:.8, revealing:.7, unusual:.9, ornate:.45 },
  cloak_full:{ flowing:.85, formal:.35, practical:.45 },
  shirt_collared:{ structured:.8, practical:.7, masculine:.45, formal:.35 },
  tights_fishnet:{ fitted:.65, revealing:.85, unusual:.85, ornate:.35 },
  shirt_mesh_turtleneck:{ fitted:.7, revealing:.75, unusual:.9, structured:.25 },
  shirt_dress_lace:{ feminine:.85, fitted:.75, revealing:.45, formal:.75, ornate:.8, unusual:.55 },
  pants_fitted_shorts:{ fitted:.65, practical:.65, revealing:.35 },
});

const VOICES = Object.freeze({
  'Wren Talbot':Object.freeze({
    strong:['Wren looks you over twice. “Yes. Keep that one.”','Wren tries for nonchalance and fails. “That works on you. Annoyingly well.”'],
    like:['Wren nods. “I like it. More than I expected, actually.”','“That suits you,” Wren says. “Don’t make me turn this into a detailed critique.”'],
    neutral:['Wren tilts her head. “It’s fine. I think I like you more than I like the clothes.”','“Not bad,” Wren says. “Not one I’d bully you into wearing again either.”'],
    dislike:['Wren grimaces apologetically. “Not my favourite on you. You asked.”','“I like you,” Wren says. “The outfit and I are less committed to one another.”'],
    discovery:'Wren studies you, then laughs at herself. “I thought it was the men’s clothes. I think it’s actually the sharper cuts—and perhaps how they sit on you.”',
  }),
  'Ser Aldric Thorne':Object.freeze({
    strong:['Aldric pauses. “You look exceptionally well. I am attempting to say that without sounding as though I am inspecting parade dress.”'],
    like:['“It suits you,” Aldric says. “Considered, but not fussy.”'], neutral:['Aldric considers it. “Perfectly respectable. I suspect the person wearing it is doing more of the work.”'],
    dislike:['Aldric chooses his words carefully. “It would not be my preference. I hope you did not ask me for diplomacy.”'],
  }),
  'Mirabel Quill':Object.freeze({
    strong:['Mirabel’s eyebrows rise. “Oh, that is interesting. Turn around.”','“Excellent,” Mirabel says. “At last, clothing with an argument.”'],
    like:['Mirabel smiles. “Yes. There is at least a decision being made here.”'], neutral:['“Competent,” Mirabel says. “Which is not the same thing as memorable.”'],
    dislike:['Mirabel squints. “It has somehow made you look more conventional than you are. A remarkable failure.”'],
  }),
  'Fenn Oakheart':Object.freeze({
    strong:['Fenn smiles slowly. “That looks like you, only more deliberately.”'], like:['“I like it,” Fenn says. “You can move, breathe, and still look good. Useful combination.”'],
    neutral:['Fenn shrugs. “It’s cloth. You’re still you underneath the decisions.”'], dislike:['Fenn gives it an unconvinced look. “Too much clothing trying to tell me what to think.”'],
  }),
  'Reyna Fletcher':Object.freeze({
    strong:['Reyna looks you over with no pretence at subtlety. “Yes. Very much yes.”','Reyna whistles once. “Useful? Debatable. Effective? Absolutely.”'],
    like:['“Looks good,” Reyna says. “And you can still run in it. Promising.”'], neutral:['Reyna shrugs. “Fine. Wouldn’t slow you down. Wouldn’t distract me either.”'],
    dislike:['Reyna frowns at the outfit. “You can wear it. I reserve the right to dislike its tactical decisions.”'],
  }),
  'Brother Alden':Object.freeze({
    strong:['Alden smiles. “That is aesthetically excellent on you. And before you ask: no, that sentence has not secretly become sexual.”'],
    like:['“The colour and shape suit you,” Alden says. “Aesthetic appreciation remains one of the many things asexuality did not remove from my eyes.”'],
    neutral:['Alden considers it. “Pleasant enough. I find I am mostly noticing that you seem comfortable.”'],
    dislike:['Alden smiles apologetically. “Not to my taste. Fortunately, my taste need not dress you.”'],
  }),
});

function party(){ return Array.isArray(root.party)?root.party:[]; }
function player(){ return party()[0]||root.player||null; }
function canonical(x){ const n=typeof x==='string'?x:x?.name; return n?party().find((m,i)=>i>0&&m?.name===n)||null:null; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,Number(v)||0)); }
function circ(a,b){ return Math.abs((((Number(a)-Number(b))+540)%360)-180); }
function hueName(h){ const n=((Number(h)||0)%360+360)%360; return n<15||n>=345?'red':n<45?'orange':n<70?'yellow':n<155?'green':n<190?'teal':n<255?'blue':n<315?'purple':'magenta'; }
function moving(e){ return !!e?.destination||!!e?.path?.length||!!e?.isMoving; }
function baseId(v){ return root.getEquipmentBaseId?.(v)||v; }
function itemSpec(id){ return root.clothingSystem?.getItemSpec?.(id)||null; }
function slotVisible(e,slot){ return root.equipmentAppearanceSystem?.isSlotVisible?.(e,slot)!==false; }

function inferredStyle(itemId){
  const id=baseId(itemId), item=root.items?.[id]||{}, known=CATALOG[id]||{};
  const out={}; for(const k of STYLE_KEYS) out[k]=Number(known[k]||0);
  const explicit=item.fashionTags&&typeof item.fashionTags==='object'?item.fashionTags:{};
  for(const k of STYLE_KEYS) if(explicit[k]!=null) out[k]=clamp(explicit[k],0,1);
  if(item.clothingGender==='male') out.masculine=Math.max(out.masculine,.75);
  if(item.clothingGender==='female') out.feminine=Math.max(out.feminine,.75);
  const tier=String(item.fashionTier||'');
  if(tier==='statement') out.unusual=Math.max(out.unusual,.8); else if(tier==='fashion') out.unusual=Math.max(out.unusual,.4);
  const text=`${id} ${item.name||''} ${item.description||''}`.toLowerCase();
  if(/mesh|fishnet|lattice|cutout|cut-out|open front|plung/.test(text)) out.revealing=Math.max(out.revealing,.7);
  if(/lace|embroider|ornate/.test(text)) out.ornate=Math.max(out.ornate,.55);
  if(/fitted|corset|hose/.test(text)) out.fitted=Math.max(out.fitted,.65);
  if(/cloak|dress|robe/.test(text)) out.flowing=Math.max(out.flowing,.55);
  if(/collared|button|corset|structured/.test(text)) out.structured=Math.max(out.structured,.6);
  return out;
}

function colourRows(e,id){
  const spec=itemSpec(id), rows=[]; if(!spec?.layers?.length) return rows;
  for(const layer of spec.layers){
    const c=e?.clothingColors?.[id]?.[layer.id]||layer.defaultColor||{};
    rows.push({hue:Number(c.hue??0), saturation:clamp(c.saturation??50,0,100)/100, value:clamp(c.value??50,0,100)/100, opacity:clamp(c.opacity??1,0,1)});
  }
  return rows;
}

function outfitSnapshot(e=player()){
  if(!e?.equipped) return {garments:[],features:{},signature:'none',silhouette:'none',rarity:0,dominantHue:null};
  const slots=['shirt','topOuter','coat','cloak','pants','tights','bra','underwear'];
  const garments=[], features={}; let totalWeight=0, rarity=0, hueX=0,hueY=0,hueWeight=0;
  const outerOpacity={shirt:1,pants:1};
  for(const slot of slots){
    const id=baseId(e.equipped?.[slot]); if(!id||!slotVisible(e,slot)) continue;
    let w=Number(SLOT_WEIGHT[slot]||.5);
    if((slot==='bra'&&e.equipped?.shirt&&outerOpacity.shirt>.65)||(slot==='underwear'&&e.equipped?.pants&&outerOpacity.pants>.65)) w*=.15;
    const style=inferredStyle(id), colours=colourRows(e,id);
    const avgOpacity=colours.length?colours.reduce((s,c)=>s+c.opacity,0)/colours.length:1;
    if(slot==='shirt') outerOpacity.shirt=avgOpacity; if(slot==='pants') outerOpacity.pants=avgOpacity;
    const transparency=1-avgOpacity;
    if(transparency>.05) style.revealing=Math.max(style.revealing,clamp(transparency*1.2,0,1));
    for(const k of STYLE_KEYS) features[k]=(features[k]||0)+Number(style[k]||0)*w;
    totalWeight+=w;
    const tier=String(root.items?.[id]?.fashionTier||''); rarity=Math.max(rarity,tier==='statement'?1:tier==='fashion'?0.55:Number(style.unusual||0)*.7);
    for(const c of colours){ const cw=w*Math.max(.2,c.opacity); const r=c.hue*Math.PI/180; hueX+=Math.cos(r)*cw; hueY+=Math.sin(r)*cw; hueWeight+=cw; }
    garments.push({slot,id,style,colours,weight:w,avgOpacity});
  }
  if(totalWeight>0) for(const k of STYLE_KEYS) features[k]=clamp((features[k]||0)/totalWeight,0,1);
  const dominantHue=hueWeight?((Math.atan2(hueY,hueX)*180/Math.PI)+360)%360:null;
  const q=c=>`${Math.round((c.hue||0)/30)*30}:${Math.round((c.saturation||0)*5)}:${Math.round((c.value||0)*5)}:${Math.round((c.opacity||0)*5)}`;
  const signature=garments.map(g=>`${g.slot}:${g.id}:${g.colours.map(q).join(',')}`).join('|')||'none';
  const silhouette=garments.map(g=>`${g.slot}:${g.id}`).join('|')||'none';
  return {garments,features,signature,silhouette,rarity,dominantHue};
}

function colourPreference(profile,snap){
  if(snap.dominantHue==null) return {score:0,label:null};
  const c=profile.colours||{}, h=snap.dominantHue;
  let bestLike=180,bestDislike=180;
  for(const x of c.likes||[]) bestLike=Math.min(bestLike,circ(h,x));
  for(const x of c.dislikes||[]) bestDislike=Math.min(bestDislike,circ(h,x));
  let score=bestLike<75?(1-bestLike/75):0;
  if(bestDislike<55) score-=1-bestDislike/55;
  const rows=snap.garments.flatMap(g=>g.colours); if(rows.length){
    const sat=rows.reduce((s,x)=>s+x.saturation,0)/rows.length, val=rows.reduce((s,x)=>s+x.value,0)/rows.length;
    score-=Math.abs(sat-Number(c.saturation??.5))*.45; score-=Math.abs(val-Number(c.value??.5))*.35;
  }
  return {score:clamp(score,-1,1),label:hueName(h)};
}

function memory(companion){
  const c=canonical(companion); if(!c) return null;
  c.playerAffinity ||= {};
  const p=PROFILES[c.name]||{}, old=c.playerAffinity.fashionTasteKnowledge||{};
  const beliefs={...p.beliefs,...(old.beliefs||{})};
  return c.playerAffinity.fashionTasteKnowledge={version:1,beliefs,samples:Number(old.samples||0),seenLooks:Array.isArray(old.seenLooks)?old.seenLooks:[],seenSilhouettes:Array.isArray(old.seenSilhouettes)?old.seenSilhouettes:[],discoveries:Array.isArray(old.discoveries)?old.discoveries:[],lastSpontaneousAt:Number(old.lastSpontaneousAt||0),lastPlayerSignature:old.lastPlayerSignature||null};
}

function evaluate(companionOrName,e=player(),{includeNovelty=true}={}){
  const companion=canonical(companionOrName), profile=PROFILES[companion?.name], snap=outfitSnapshot(e);
  if(!companion||!profile) return null;
  const mem=memory(companion), compatibility=root.companionAffinity?.compatibilityFor?.(companion,e)||{attractionCap:100};
  const base=Number(companion.playerAffinity?.attraction||0), cap=Number(compatibility.attractionCap??100);
  let raw=0, dominant={key:null,value:0};
  for(const k of STYLE_KEYS){ const contribution=Number(profile.style[k]||0)*Number(snap.features[k]||0); raw+=contribution; if(Math.abs(contribution)>Math.abs(dominant.value)) dominant={key:k,value:contribution}; }
  raw*=1.35;
  const colour=colourPreference(profile,snap); raw+=colour.score*1.25;
  const unseen=!mem.seenSilhouettes.includes(snap.silhouette);
  if(includeNovelty&&unseen) raw+=Number(profile.novelty||0)*Number(snap.rarity||0)*1.8;
  let modifier=clamp(Math.round(raw),-4,6); if(cap<=0) modifier=0;
  const effective=clamp(base+modifier,0,cap);
  return {companion:companion.name,baseAttraction:base,attractionCap:cap,modifier,effectiveAttraction:effective,aestheticScore:raw,dominantStyle:dominant.key,dominantContribution:dominant.value,colour,snapshot:snap,unseenSilhouette:unseen};
}
function effectiveAttractionFor(companionOrName,e=player()){ return evaluate(companionOrName,e,{includeNovelty:true})?.effectiveAttraction??0; }
function outfitAttractionModifier(companionOrName,e=player()){ return evaluate(companionOrName,e,{includeNovelty:true})?.modifier??0; }

function observe(companionOrName,e=player()){
  const companion=canonical(companionOrName), profile=PROFILES[companion?.name], ev=evaluate(companion,e,{includeNovelty:true}); if(!companion||!profile||!ev) return null;
  const mem=memory(companion), newLook=!mem.seenLooks.includes(ev.snapshot.signature);
  if(newLook){ mem.seenLooks.push(ev.snapshot.signature); if(mem.seenLooks.length>80) mem.seenLooks.splice(0,mem.seenLooks.length-80); }
  if(!mem.seenSilhouettes.includes(ev.snapshot.silhouette)){ mem.seenSilhouettes.push(ev.snapshot.silhouette); if(mem.seenSilhouettes.length>50) mem.seenSilhouettes.splice(0,mem.seenSilhouettes.length-50); }
  if(newLook){
    mem.samples++;
    for(const k of STYLE_KEYS){ const strength=Number(ev.snapshot.features[k]||0); if(strength<.2) continue; const target=Number(profile.style[k]||0), current=Number(mem.beliefs[k]||0), alpha=.08+.16*strength; mem.beliefs[k]=current+(target-current)*alpha; }
  }
  return ev;
}

function selfDiscovery(companion){
  const c=canonical(companion), mem=memory(c), p=PROFILES[c?.name]; if(!c||!p||mem.samples<3) return null;
  if(c.name==='Wren Talbot'&&!mem.discoveries.includes('wren_sharp_cuts')){
    const initial=Number(p.beliefs.masculine||0), now=Number(mem.beliefs.masculine||0), structure=Math.max(Number(mem.beliefs.structured||0),Number(mem.beliefs.fitted||0));
    if(initial-now>.08&&structure>.38){ mem.discoveries.push('wren_sharp_cuts'); return VOICES[c.name].discovery; }
  }
  return null;
}

function reasonPhrase(ev){
  if(!ev) return '';
  const key=ev.dominantStyle, positive=ev.dominantContribution>=0;
  if(key&&Math.abs(ev.dominantContribution)>.18){
    const label=STYLE_LABEL[key]||key; return positive?`I think it’s ${label}.`:`I think it’s ${label} that loses me.`;
  }
  if(ev.colour?.label&&Math.abs(ev.colour.score)>.25) return ev.colour.score>0?`The ${ev.colour.label} is helping.`:`I’m less convinced by the ${ev.colour.label}.`;
  return '';
}
function opinionBand(ev){ return ev.aestheticScore>=2.7?'strong':ev.aestheticScore>=.55?'like':ev.aestheticScore<=-1.4?'dislike':'neutral'; }
function commentText(companionOrName,{observeNow=true}={}){
  const c=canonical(companionOrName); if(!c) return null;
  const ev=observeNow?observe(c):evaluate(c,player(),{includeNovelty:false}); if(!ev) return null;
  const discovery=selfDiscovery(c); if(discovery) return {text:discovery,evaluation:ev,discovery:true};
  const band=opinionBand(ev), rows=VOICES[c.name]?.[band]||[], mem=memory(c), index=(mem.samples+Math.abs(Math.round(ev.aestheticScore*10)))%Math.max(1,rows.length), lead=rows[index]||'They consider the outfit.';
  const reason=reasonPhrase(ev); return {text:`${lead}${reason?' '+reason:''}`,evaluation:ev,band};
}

function familiarity(c){ return Number(root.getCompanionRelationship?.(c)?.familiarity??c?.playerRelationship?.familiarity??0); }
function topicFor(name){ return {id:TOPIC_ID,label:'What do you think of what I’m wearing?',priority:18,cooldownSeconds:DAY/8,condition:ctx=>familiarity(ctx?.companion||canonical(name))>=30&&outfitSnapshot(ctx?.player||player()).garments.length>0,render:ctx=>{ const result=commentText(ctx?.companion||name,{observeNow:true}); return result?{subject:'your clothing',text:result.text}:{}; }}; }
function installTopics(){ const cm=root.companionConversationMemory; if(!cm?.registerTopics) return false; for(const name of CORE) cm.registerTopics(name,[topicFor(name)]); return true; }

function spontaneousLine(c,ev){ const band=opinionBand(ev); if(!['strong','dislike'].includes(band)) return null; const rows=VOICES[c.name]?.[band]||[]; if(!rows.length) return null; return rows[Math.abs(Math.round(ev.aestheticScore*11)+memory(c).samples)%rows.length]; }
function poll(){
  installWrappers(); installTopics(); const p=player(); if(!p||root.isInCombat||moving(p)) return;
  const sig=outfitSnapshot(p).signature; if(sig==='none') return;
  const candidates=[];
  for(const name of CORE){ const c=canonical(name); if(!c||moving(c)||familiarity(c)<25) continue; const mem=memory(c); if(mem.lastPlayerSignature===null){ mem.lastPlayerSignature=sig; observe(c,p); continue; } if(mem.lastPlayerSignature===sig) continue; mem.lastPlayerSignature=sig;
    const ev=evaluate(c,p,{includeNovelty:true}); if(!ev) continue; const already=mem.seenLooks.includes(sig); observe(c,p); if(already) continue; const now=Number(root.worldSeconds||0); if(mem.lastSpontaneousAt&&now-mem.lastSpontaneousAt<DAY/4) continue; const line=spontaneousLine(c,ev); if(line) candidates.push({c,ev,line});
  }
  candidates.sort((a,b)=>Math.abs(b.ev.aestheticScore)-Math.abs(a.ev.aestheticScore)); const chosen=candidates[0]; if(!chosen) return; memory(chosen.c).lastSpontaneousAt=Number(root.worldSeconds||0); root.showMessage?.(`${chosen.c.name}: ${chosen.line}`);
}

function installWrappers(){
  if(typeof root.getCompanionAffinity==='function'&&!root.getCompanionAffinity.__fashionAware){ const base=root.getCompanionAffinity; const wrapped=function(x){ const state=base.apply(this,arguments); const c=canonical(x); if(!state||!c) return state; const ev=evaluate(c,player(),{includeNovelty:true}); return ev?{...state,outfitAttractionModifier:ev.modifier,effectiveAttraction:ev.effectiveAttraction}:state; }; wrapped.__fashionAware=true; wrapped.__base=base; root.getCompanionAffinity=wrapped; }
  if(typeof root.getCompanionRomanceReadiness==='function'&&!root.getCompanionRomanceReadiness.__fashionAware){ const base=root.getCompanionRomanceReadiness; const wrapped=function(x){ const state=base.apply(this,arguments); const c=canonical(x); if(!state||!c) return state; const ev=evaluate(c,player(),{includeNovelty:true}); if(!ev) return state; const sig=root.companionAffinity?.attractionSignals?.(ev.effectiveAttraction,state.romanticBond,state.strongPhysicalDesireThreshold)||{}; return {...state,...sig,baseAttraction:state.attraction,outfitAttractionModifier:ev.modifier,effectiveAttraction:ev.effectiveAttraction}; }; wrapped.__fashionAware=true; wrapped.__base=base; root.getCompanionRomanceReadiness=wrapped; }
  const cr=root.companionRomance; if(cr?.interpretRelationship&&!cr.interpretRelationship.__fashionAware){ const base=cr.interpretRelationship; const wrapped=function(x){ const original=base.apply(this,arguments), c=canonical(x); if(!original||!c) return original; const state=root.getCompanionAffinity?.(c)||c.playerAffinity||{}, f=Number(state.friendship||0), r=Number(state.romanticBond||0), a=Number(state.effectiveAttraction ?? state.attraction ?? 0), style=original.style||root.companionAffinity?.profileFor?.(c)?.relationshipStyle||{}; let mode='early';
      if(c.name==='Brother Alden'&&r>=55&&f>=50) mode='asexual_romance';
      else if(c.name==='Wren Talbot'&&state.presentation==='feminine'&&r>=60&&a<=30&&f>=60) mode='love_desire_conflict';
      else if(c.name==='Ser Aldric Thorne'&&a>=50&&r<30) mode='restrained_attraction';
      else if(r>=60&&f>=50) mode='romantic';
      else if(a>=60&&r<25&&f<45&&style.casualSex) mode='casual_hookup';
      else if(a>=50&&r<35&&f>=55&&style.friendsWithBenefits) mode='friends_with_benefits';
      else if(f>=65&&r<40) mode='close_friend';
      else if(r>=35&&a<=30) mode='romantic_low_desire';
      else if(a>=40) mode='attracted';
      return {...original,mode,baseAttraction:Number(state.attraction||0),attraction:a,outfitAttractionModifier:Number(state.outfitAttractionModifier||0),line:cr.voiceLines?.[c.name]?.[mode]||original.line}; };
    wrapped.__fashionAware=true; wrapped.__base=base; cr.interpretRelationship=wrapped;
  }
  return true;
}

const api={build:BUILD,profiles:PROFILES,catalog:CATALOG,inferredStyle,outfitSnapshot,evaluate,effectiveAttractionFor,outfitAttractionModifier,observe,memory,selfDiscovery,commentText,installTopics,installWrappers,poll};
root.companionFashion=api; root.getCompanionEffectiveAttraction=effectiveAttractionFor; root.COMPANION_FASHION_BUILD=BUILD;
if(typeof module!=='undefined'&&module.exports) module.exports=api;
installWrappers(); installTopics();
if(root.document?.readyState==='loading') root.document.addEventListener('DOMContentLoaded',()=>{installWrappers();installTopics();},{once:true});
if(typeof root.setInterval==='function'&&root.document) root.setInterval(poll,2000);
})(typeof window!=='undefined'?window:globalThis);
