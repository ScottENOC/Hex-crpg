// companionContextualBanter.js
// Context-sensitive companion moments and companion-to-companion relationships.
// Adds finite authored lines to renewable situations instead of replacing the
// existing friendship/romance/personality systems with another visible meter.
(function (root) {
'use strict';

const BUILD = '20261001-companion-contextual-banter-v1';
const MINUTE = 60, HOUR = 3600, DAY = 86400;
const CORE = Object.freeze([
  'Wren Talbot','Ser Aldric Thorne','Mirabel Quill',
  'Fenn Oakheart','Reyna Fletcher','Brother Alden',
]);
const CONTEXT_TOPIC = 'recent_shared_context';
const MAX_PENDING = 12;
const PAIR_COOLDOWN = HOUR * 4;
const IDLE_COOLDOWN = HOUR * 3;

const BASE_WARMTH = Object.freeze({
  'Brother Alden|Fenn Oakheart':18,
  'Brother Alden|Mirabel Quill':10,
  'Brother Alden|Reyna Fletcher':9,
  'Brother Alden|Ser Aldric Thorne':16,
  'Brother Alden|Wren Talbot':11,
  'Fenn Oakheart|Mirabel Quill':12,
  'Fenn Oakheart|Reyna Fletcher':11,
  'Fenn Oakheart|Ser Aldric Thorne':4,
  'Fenn Oakheart|Wren Talbot':15,
  'Mirabel Quill|Reyna Fletcher':8,
  'Mirabel Quill|Ser Aldric Thorne':-2,
  'Mirabel Quill|Wren Talbot':13,
  'Reyna Fletcher|Ser Aldric Thorne':17,
  'Reyna Fletcher|Wren Talbot':18,
  'Ser Aldric Thorne|Wren Talbot':7,
});

const BANTER = Object.freeze({
  'Ser Aldric Thorne|Wren Talbot': Object.freeze([
    ['Wren Talbot','“Do you rehearse looking disapproving, or does it happen naturally?”','Ser Aldric Thorne','“Years of disciplined practice.”'],
    ['Ser Aldric Thorne','“There is a difference between confidence and recklessness.”','Wren Talbot','“Yes. Confidence works more often.”'],
    ['Wren Talbot','“If you check the perimeter again, I’m naming the next tree after you.”','Ser Aldric Thorne','“Then choose a defensible one.”'],
  ]),
  'Mirabel Quill|Wren Talbot': Object.freeze([
    ['Mirabel Quill','“I have a hypothesis about why you distrust scholars.”','Wren Talbot','“Is it because they say things like that?”'],
    ['Wren Talbot','“Does every book need notes in the margins?”','Mirabel Quill','“No. Some need arguments.”'],
    ['Mirabel Quill','“You know, curiosity is not a character flaw.”','Wren Talbot','“Depends what you’re curious about and whether it explodes.”'],
  ]),
  'Fenn Oakheart|Wren Talbot': Object.freeze([
    ['Fenn Oakheart','“You walk differently once we leave a city.”','Wren Talbot','“I stop expecting someone to charge me for standing still.”'],
    ['Wren Talbot','“You really can tell those two birds apart?”','Fenn Oakheart','“Yes.”','Wren Talbot','“Show-off.”'],
    ['Fenn Oakheart','“You do not have to fill every silence.”','Wren Talbot','“I know. Some silences are clearly your responsibility.”'],
  ]),
  'Reyna Fletcher|Wren Talbot': Object.freeze([
    ['Reyna Fletcher','“You missed a footprint.”','Wren Talbot','“I left it for you. Morale.”'],
    ['Wren Talbot','“Do you ever stop counting exits?”','Reyna Fletcher','“Do you ever stop noticing who is in charge?”','Wren Talbot','“Fair.”'],
    ['Reyna Fletcher','“You’re getting quieter when you move.”','Wren Talbot','“That sounded dangerously like praise.”'],
  ]),
  'Brother Alden|Wren Talbot': Object.freeze([
    ['Wren Talbot','“If you tell me anger is a passing cloud, I may become weather.”','Brother Alden','“I was going to ask whether you wanted tea.”'],
    ['Brother Alden','“You are allowed to rest before you have earned it.”','Wren Talbot','“That sounds suspiciously radical for a monk.”'],
    ['Wren Talbot','“You know your calm is occasionally infuriating?”','Brother Alden','“Yes. I try not to become proud of it.”'],
  ]),
  'Mirabel Quill|Ser Aldric Thorne': Object.freeze([
    ['Mirabel Quill','“Rules are fascinating. Mostly because people reveal themselves by which ones they break.”','Ser Aldric Thorne','“Some of us also reveal ourselves by keeping them.”'],
    ['Ser Aldric Thorne','“Must the experiment be conducted here?”','Mirabel Quill','“No. Here is simply where all the equipment is.”'],
    ['Mirabel Quill','“You know, caution can become superstition wearing armour.”','Ser Aldric Thorne','“And curiosity can become a casualty report wearing spectacles.”'],
  ]),
  'Fenn Oakheart|Ser Aldric Thorne': Object.freeze([
    ['Ser Aldric Thorne','“A road would make this journey considerably safer.”','Fenn Oakheart','“For us, perhaps. The forest may disagree.”'],
    ['Fenn Oakheart','“You keep asking what a place is for.”','Ser Aldric Thorne','“And you think that is the wrong question?”','Fenn Oakheart','“Incomplete.”'],
    ['Ser Aldric Thorne','“I admit the view is worth the climb.”','Fenn Oakheart','“Careful. That sounded almost inefficient.”'],
  ]),
  'Reyna Fletcher|Ser Aldric Thorne': Object.freeze([
    ['Reyna Fletcher','“Your shield discipline is good.”','Ser Aldric Thorne','“Your praise is alarmingly concise.”'],
    ['Ser Aldric Thorne','“You could have signalled before moving.”','Reyna Fletcher','“You saw me move.”','Ser Aldric Thorne','“That is not the same thing.”'],
    ['Reyna Fletcher','“You take first watch like it’s a moral obligation.”','Ser Aldric Thorne','“And you take it like you distrust everyone else.”','Reyna Fletcher','“Also correct.”'],
  ]),
  'Brother Alden|Ser Aldric Thorne': Object.freeze([
    ['Brother Alden','“Duty can be chosen without becoming identity.”','Ser Aldric Thorne','“I am still determining where one ends and the other begins.”'],
    ['Ser Aldric Thorne','“You make forgiveness sound deceptively simple.”','Brother Alden','“No. I make resentment sound expensive.”'],
    ['Brother Alden','“You may sit down, Aldric.”','Ser Aldric Thorne','“I am sitting.”','Brother Alden','“Internally, then.”'],
  ]),
  'Fenn Oakheart|Mirabel Quill': Object.freeze([
    ['Mirabel Quill','“If you wrote more of this down, fewer discoveries would die with their discoverers.”','Fenn Oakheart','“If you listened more, fewer things would need writing down.”'],
    ['Fenn Oakheart','“You named that mushroom incorrectly.”','Mirabel Quill','“I named it efficiently.”'],
    ['Mirabel Quill','“Nature is full of terrible experimental controls.”','Fenn Oakheart','“Nature did not realise it was applying for your approval.”'],
  ]),
  'Mirabel Quill|Reyna Fletcher': Object.freeze([
    ['Mirabel Quill','“You always sit with your back protected.”','Reyna Fletcher','“And you always sit where the light hits the page. We all have priorities.”'],
    ['Reyna Fletcher','“If it glows, don’t touch it.”','Mirabel Quill','“That rule would eliminate most of my profession.”'],
    ['Mirabel Quill','“I could enchant your arrows.”','Reyna Fletcher','“Could you enchant them to remain inexpensive?”'],
  ]),
  'Brother Alden|Mirabel Quill': Object.freeze([
    ['Mirabel Quill','“You have an answer for everything.”','Brother Alden','“Usually I have a question phrased slowly.”'],
    ['Brother Alden','“Must knowledge always be useful?”','Mirabel Quill','“Certainly not. Some of the best knowledge is gloriously inconvenient.”'],
    ['Mirabel Quill','“You know, for someone devoted to impermanence, you keep excellent notes.”','Brother Alden','“Impermanence is not an argument for poor filing.”'],
  ]),
  'Fenn Oakheart|Reyna Fletcher': Object.freeze([
    ['Reyna Fletcher','“That trail is faster.”','Fenn Oakheart','“And this one disturbs fewer nests.”','Reyna Fletcher','“Fine. Yours.”'],
    ['Fenn Oakheart','“You heard the deer before I did.”','Reyna Fletcher','“I’m going to treasure this confession.”'],
    ['Reyna Fletcher','“You dislike traps.”','Fenn Oakheart','“I dislike traps that catch whatever happens to walk there.”'],
  ]),
  'Brother Alden|Fenn Oakheart': Object.freeze([
    ['Fenn Oakheart','“You call it impermanence. I call it seasons.”','Brother Alden','“I suspect we are arguing over vocabulary rather than truth.”'],
    ['Brother Alden','“You are very patient with trees.”','Fenn Oakheart','“They rarely interrupt.”'],
    ['Fenn Oakheart','“Do monasteries teach people to sit that still?”','Brother Alden','“No. Benches do.”'],
  ]),
  'Brother Alden|Reyna Fletcher': Object.freeze([
    ['Reyna Fletcher','“You trust people quickly.”','Brother Alden','“No. I try to meet them without punishing them for people I met before.”'],
    ['Brother Alden','“You can rest. I am awake.”','Reyna Fletcher','“That sentence is more convincing from you than most people.”'],
    ['Reyna Fletcher','“If I ask what you’re thinking, will I get a sermon?”','Brother Alden','“Only if you are particularly unlucky.”'],
  ]),
});

const OPINIONS = Object.freeze({
  'Wren Talbot': Object.freeze({
    'Ser Aldric Thorne':'“Aldric can be exhausting, but he means what he says. I trust that more than I trust charm.”',
    'Mirabel Quill':'“Mirabel is dangerous in the way an unlocked door is dangerous to a curious child. I like her. That may be part of the problem.”',
    'Fenn Oakheart':'“Fenn notices things the rest of us trample past. I’m trying to do less trampling.”',
    'Reyna Fletcher':'“Reyna watches everything. Oddly, once you get used to it, that makes her easier to relax around.”',
    'Brother Alden':'“Alden never seems to need me to perform being all right. I appreciate that more than I tell him.”',
  }),
  'Ser Aldric Thorne': Object.freeze({
    'Wren Talbot':'“Wren challenges authority instinctively. At times that is maddening. At times it is precisely what authority requires.”',
    'Mirabel Quill':'“Mirabel treats caution as an opening bid. I respect her mind. I would prefer it came with better brakes.”',
    'Fenn Oakheart':'“Fenn reminds me that protecting people and controlling their surroundings are not always the same task.”',
    'Reyna Fletcher':'“Reyna is dependable under pressure. She dislikes ceremony, which may be one reason I believe her when she gives her word.”',
    'Brother Alden':'“Alden has an irritating habit of asking the question beneath the one I thought I was answering.”',
  }),
  'Mirabel Quill': Object.freeze({
    'Wren Talbot':'“Wren is much more intellectually curious than she wants scholars to know. Please do not tell her I said intellectually.”',
    'Ser Aldric Thorne':'“Aldric is a magnificent control group for the proposition that rules can become a personality. I am fond of him despite this.”',
    'Fenn Oakheart':'“Fenn knows things no library catalogues properly. I have stopped trying to decide whether that delights or infuriates me.”',
    'Reyna Fletcher':'“Reyna pretends observation is purely tactical. It is not. She understands people frighteningly well.”',
    'Brother Alden':'“Alden is infuriatingly difficult to shock. Naturally I regard this as a challenge.”',
  }),
  'Fenn Oakheart': Object.freeze({
    'Wren Talbot':'“Wren cares quickly and defends herself by pretending she decided not to. It is not very convincing.”',
    'Ser Aldric Thorne':'“Aldric wants to make safe paths through everything. I am trying to teach him that not everything wants to become a path.”',
    'Mirabel Quill':'“Mirabel listens to the world like it is about to reveal a secret. She simply needs reminding that secrets are not always invitations.”',
    'Reyna Fletcher':'“Reyna knows how to move through a place without demanding it accommodate her. I respect that.”',
    'Brother Alden':'“Alden and I disagree about words more often than we disagree about things.”',
  }),
  'Reyna Fletcher': Object.freeze({
    'Wren Talbot':'“Wren spots power games before most people realise a game started. Useful. Also exhausting at dinner.”',
    'Ser Aldric Thorne':'“Aldric is predictable in the best sense. When things go bad, you know exactly where he’ll stand.”',
    'Mirabel Quill':'“Mirabel sees five possibilities where I see one problem. Sometimes that saves us. Sometimes it creates six problems.”',
    'Fenn Oakheart':'“Fenn reads terrain better than most scouts. He just calls half the useful information ‘being polite to the land’.”',
    'Brother Alden':'“Alden is calmer than I am and somehow not smug about it. Suspicious, but useful.”',
  }),
  'Brother Alden': Object.freeze({
    'Wren Talbot':'“Wren’s anger is often a form of care that arrived before she had time to make it gentle.”',
    'Ser Aldric Thorne':'“Aldric gives duty enormous moral weight. I think he is learning that he himself also has weight.”',
    'Mirabel Quill':'“Mirabel’s curiosity is not frivolous. It is one of the ways she loves the world. That does not make every locked door wise to open.”',
    'Fenn Oakheart':'“Fenn has little interest in abstraction when a living thing is directly in front of him. This corrects me usefully.”',
    'Reyna Fletcher':'“Reyna’s vigilance is care wearing armour. I hope one day she needs the armour less often.”',
  }),
});

const CONTEXT = Object.freeze({
  'Wren Talbot': Object.freeze({
    hard_fight:['“That was too close,” Wren says. “I know this is what we do. I’m still allowed to hate how nearly it stopped.”','Wren exhales hard. “Right. Everyone still breathing? Good. I can be angry about the rest later.”'],
    player_badly_hurt:['Wren’s voice goes flat with worry. “Do not do that to me again.” She grimaces. “Unfair request. I know. I’m keeping it.”','Wren checks your injuries twice. “I had several clever things to say. Apparently fear has stolen all of them.”'],
    companion_badly_hurt:['Wren watches the injured companion longer than she means to. “I know they’re all right. I’d still like the world to stop proving it can take people.”'],
    camp_ambush:['Wren sits awake after the camp is secure again. “I object to enemies interrupting sleep. It feels personally rude.”'],
    first_shared_tent:['Wren looks at the shared shelter, then at you. “We’re treating this as practical unless either of us says otherwise. Agreed?”'],
    return_home:['Wren grows quieter as the familiar place comes into view. “Funny. You leave somewhere and it keeps existing without asking permission.”'],
    first_shared_watch:['Wren settles beside you on watch. “All right. You watch the darkness; I’ll watch you pretending not to be tired.”'],
    rainy_camp:['Wren stares at the rain running off the shelter. “Romantic weather, if your idea of romance is damp socks and smoke in your eyes.”'],
    relationship_strain:['Wren folds her arms. “I’m not asking you to fix this in one conversation. I am asking you not to make me guess whether you think it matters.”'],
    reconciliation:['Wren’s smile is cautious but real. “This feels better. Not erased. Better. I think I trust better more than pretending nothing happened.”'],
  }),
  'Ser Aldric Thorne': Object.freeze({
    hard_fight:['Aldric checks everyone before himself. “We prevailed. That is not the same as saying we paid nothing for it.”'],
    player_badly_hurt:['Aldric’s composure is too deliberate. “You frightened me.” After a pause: “I would rather state that plainly than disguise it as tactical criticism.”'],
    companion_badly_hurt:['Aldric remains near the injured companion. “No one under my protection is a resource to be spent casually. I include our own party in that.”'],
    camp_ambush:['Aldric resets the perimeter in grim silence. “We will sleep again. But not before I understand how they reached us.”'],
    first_shared_tent:['Aldric gestures to the shelter. “We can share without making assumptions. Comfort should not require ambiguity.”'],
    return_home:['Aldric’s posture changes almost imperceptibly. “I had forgotten how quickly old duties return to the body.”'],
    first_shared_watch:['Aldric takes the shared watch seriously for almost five minutes before admitting, “Company improves it.”'],
    rainy_camp:['Aldric looks at the rain, then the fire, then the rain again. “I have fought battles with clearer tactical advantages than keeping that flame alive.”'],
    relationship_strain:['Aldric’s voice is steady. “Commitment does not oblige either of us to call injury harmless. We should name what happened accurately.”'],
    reconciliation:['Aldric exhales as if setting down weight. “Trust restored is not trust unchanged. Perhaps that makes it more deliberate.”'],
  }),
  'Mirabel Quill': Object.freeze({
    hard_fight:['Mirabel stares at her shaking hand as though it belongs to someone else. “Fascinating. Adrenaline remains much less interesting from inside it.”'],
    player_badly_hurt:['Mirabel’s voice is sharper than usual. “You are not permitted to become a case study in survivable trauma merely because I know healing magic exists.”'],
    companion_badly_hurt:['Mirabel hovers near the injured companion with badly concealed worry. “I know what the prognosis is. Knowledge is being remarkably unhelpful.”'],
    camp_ambush:['Mirabel looks offended. “Ambushing a camp is tactically sensible and socially unforgivable.”'],
    first_shared_tent:['Mirabel peers into the shared shelter. “Good. We can test whether proximity increases snoring, philosophical disclosure, or homicide.”'],
    return_home:['Mirabel slows, taking the place in. “I remember leaving with a theory about who I was. How inconvenient that evidence accumulated.”'],
    first_shared_watch:['Mirabel arrives for watch with a notebook. “I have been informed that recording nocturnal phenomena is not the same thing as watching for danger. I can multitask.”'],
    rainy_camp:['Mirabel holds out a hand to the rain. “Excellent. The universe has invented a way to make every page curl simultaneously.”'],
    relationship_strain:['Mirabel looks unusually uncertain. “I can analyse this forever if you let me. Unfortunately, understanding the mechanism is not the same as repairing the damage.”'],
    reconciliation:['Mirabel’s expression softens. “I kept waiting for the moment we would declare the problem solved. This is better. We simply started being honest again.”'],
  }),
  'Fenn Oakheart': Object.freeze({
    hard_fight:['Fenn wipes blood from his hands and looks around at the disturbed ground. “Surviving is good. We should still notice what survival cost.”'],
    player_badly_hurt:['Fenn stays close until your breathing steadies. “I know you can endure pain. That does not make watching it easier.”'],
    companion_badly_hurt:['Fenn tends the injured companion without fuss. “Living things mend better when someone remains nearby. People pretend they are exceptions.”'],
    camp_ambush:['Fenn walks the edge of camp, reading the ground. “They came through here. Tomorrow we choose a place that tells us sooner.”'],
    first_shared_tent:['Fenn makes room without ceremony. “Warmth is warmth. If either of us wants distance, we say so.”'],
    return_home:['Fenn breathes more deeply as the familiar landscape returns. “Places remember differently from people. Sometimes that is kinder.”'],
    first_shared_watch:['Fenn sits beside you on watch, listening to the dark. “Most of the night is telling us nothing is wrong. You learn to appreciate that message.”'],
    rainy_camp:['Fenn seems less offended by the rain than everyone else. “The ground needed it.” He glances at the soaked bedrolls. “We did not.”'],
    relationship_strain:['Fenn is quiet for a while. “Something damaged does not become healthy because we refuse to touch the wound.”'],
    reconciliation:['Fenn smiles faintly. “You can tell when a thing starts growing again. Not because the scar disappears. Because something new forms around it.”'],
  }),
  'Reyna Fletcher': Object.freeze({
    hard_fight:['Reyna counts heads, arrows and wounds. Only when the numbers settle does she breathe. “Fine. I’m fine. That was still too close.”'],
    player_badly_hurt:['Reyna crouches beside you. “I saw the hit and had exactly one useful thought: get to you. I dislike having only one useful thought.”'],
    companion_badly_hurt:['Reyna keeps finding practical reasons to check on the injured companion. “They’re fine. I know. I’m verifying.”'],
    camp_ambush:['Reyna is already redesigning the watch. “Nobody failed. The plan did. Plans are easier to fix.”'],
    first_shared_tent:['Reyna eyes the shared shelter. “Clear expectations, adequate blankets, weapons within reach. Romance optional. Survival mandatory.”'],
    return_home:['Reyna’s eyes move automatically to old sight lines. “I remember every place I once thought I might have to run from.”'],
    first_shared_watch:['Reyna settles into the shared watch. “If we both hear something, point first and philosophise later.”'],
    rainy_camp:['Reyna wrings water from a sleeve. “Tracking is easier in rain, they said. Nobody mentioned the tracker also becomes a pond.”'],
    relationship_strain:['Reyna’s tone is controlled. “I can work with bad news. What I cannot work with is uncertainty about whether you’ll tell me the next piece.”'],
    reconciliation:['Reyna gives a small nod. “I believe you. That is not the same as forgetting. It is me choosing what to do with what happened.”'],
  }),
  'Brother Alden': Object.freeze({
    hard_fight:['Alden sits with the silence after the fight. “Relief deserves attention too. We spend so much time preparing for loss that we forget to notice survival.”'],
    player_badly_hurt:['Alden takes your hand if you allow it. “I am very glad you are still here. I see no wisdom in pretending I was serene about the alternative.”'],
    companion_badly_hurt:['Alden remains with the injured companion. “Pain makes time narrow. Company can widen it again.”'],
    camp_ambush:['Alden helps settle the camp again. “Fear has passed through us. That does not mean we must carry all of it into sleep.”'],
    first_shared_tent:['Alden smiles. “Shared shelter is allowed to mean only shared shelter. That simplicity is worth protecting.”'],
    return_home:['Alden looks around with quiet recognition. “Returning is useful. It shows us which parts of the place changed, and which parts of us did.”'],
    first_shared_watch:['Alden shares the watch in easy silence. Eventually he says, “Wakefulness is less lonely when nobody is trying to fill it.”'],
    rainy_camp:['Alden listens to rain on the shelter. “This would be meditative if the water were not finding the exact centre of my blanket.”'],
    relationship_strain:['Alden’s voice is gentle but firm. “Compassion does not require me to deny that I was hurt. I think honesty is kinder than pretending.”'],
    reconciliation:['Alden smiles. “Forgiveness is often described as release. I think, sometimes, it is simply the decision to be present together again.”'],
  }),
});

const ROLLOUT = Object.freeze({
  'Wren Talbot':Object.freeze({home:/hollowmere|millbrook/i}),
  'Ser Aldric Thorne':Object.freeze({home:/silverhart|vigil/i}),
  'Mirabel Quill':Object.freeze({home:/archive|library|academy|silverhart/i}),
  'Fenn Oakheart':Object.freeze({home:/grove|forest|greenwood|wildwood/i}),
  'Reyna Fletcher':Object.freeze({home:/northwatch|watchpost|ranger/i}),
  'Brother Alden':Object.freeze({home:/temple|monastery|abbey|sanctuary/i}),
});

let topicsInstalled=false, campListenerInstalled=false, runtimeTimer=null;
const runtime={lastMinute:null,lastHour:null,lastCombat:null,preCombatHp:null,lastIdleAt:0,lastLocation:null};

function party(){ return Array.isArray(root.party)?root.party:[]; }
function player(){ return party()[0]||root.player||null; }
function companions(){ return party().slice(1).filter(c=>c&&CORE.includes(c.name)); }
function canonical(x){ const n=typeof x==='string'?x:x?.name; return n?companions().find(c=>c.name===n)||null:null; }
function now(){ return Number(root.worldSeconds||0); }
function pairKey(a,b){ return [typeof a==='string'?a:a?.name,typeof b==='string'?b:b?.name].filter(Boolean).sort().join('|'); }
function hash(text){ let h=2166136261; for(const ch of String(text||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; }
function pick(rows,token){ return rows?.length?rows[hash(token)%rows.length]:null; }
function hpRatio(x){ const max=Number(x?.maxHp??x?.maxHP??x?.hpMax??0), hp=Number(x?.hp??x?.HP??0); return max>0?Math.max(0,Math.min(1,hp/max)):1; }
function entityFor(x){ const n=typeof x==='string'?x:x?.name; return (root.entities||[]).find(e=>e?.alive&&e.side==='player'&&e.name===n)||x||null; }
function moving(x){ const e=entityFor(x); return !!e?.destination||!!e?.path?.length||!!e?.isMoving; }
function stationary(){ return !root.isInCombat&&!moving(player())&&companions().every(c=>!moving(c)); }
function camp(){ return root.campSystem?.getCamp?.()||null; }

function memory(){
  const p=player(); if(!p) return null;
  const old=p.companionContextMemory||{};
  return p.companionContextMemory={
    version:1,
    pending:Array.isArray(old.pending)?old.pending:[],
    pairs:old.pairs&&typeof old.pairs==='object'?old.pairs:{},
    seen:old.seen&&typeof old.seen==='object'?old.seen:{},
    visits:old.visits&&typeof old.visits==='object'?old.visits:{},
    relationshipStates:old.relationshipStates&&typeof old.relationshipStates==='object'?old.relationshipStates:{},
    lastBanterAt:Number(old.lastBanterAt||0),
    lastBanterPair:old.lastBanterPair||null,
  };
}
function pairState(a,b){
  const m=memory(), key=pairKey(a,b); if(!m||!key||!key.includes('|')) return null;
  const old=m.pairs[key]||{};
  return m.pairs[key]={
    familiarity:Math.max(0,Math.min(100,Number(old.familiarity??10))),
    warmth:Math.max(-100,Math.min(100,Number(old.warmth??BASE_WARMTH[key]??5))),
    interactions:Number(old.interactions||0),
    lastAt:Number(old.lastAt||0),
  };
}
function pairBand(a,b){
  const s=pairState(a,b); if(!s) return 'unknown';
  if(s.warmth<=-20) return 'hostile';
  if(s.warmth<5) return 'friction';
  if(s.familiarity<20) return 'new';
  if(s.warmth>=30) return 'close';
  return 'familiar';
}
function tickPairs(){
  for(let i=0;i<companions().length;i++) for(let j=i+1;j<companions().length;j++){
    const s=pairState(companions()[i],companions()[j]); if(s) s.familiarity=Math.min(100,s.familiarity+1);
  }
}
function pairAffinity(a,b,delta,reason){
  const s=pairState(a,b); if(!s) return null;
  s.warmth=Math.max(-100,Math.min(100,s.warmth+Number(delta||0)));
  s.lastReason=reason||s.lastReason||null;
  return {...s};
}

function queue(companionOrName,type,detail={}){
  const c=canonical(companionOrName); const m=memory(); if(!c||!m) return false;
  const key=detail.key||`${type}:${detail.other||''}:${detail.location||''}`;
  const existing=m.pending.find(e=>e.companion===c.name&&e.key===key);
  if(existing){ existing.urgency=Math.max(existing.urgency||0,Number(detail.urgency||1)); existing.at=now(); return false; }
  m.pending.push({companion:c.name,type,key,at:now(),urgency:Number(detail.urgency||1),...detail});
  if(m.pending.length>MAX_PENDING) m.pending.splice(0,m.pending.length-MAX_PENDING);
  return true;
}
function pendingFor(name){
  const m=memory(); if(!m) return [];
  return m.pending.filter(e=>e.companion===name).sort((a,b)=>(b.urgency||0)-(a.urgency||0)||(b.at||0)-(a.at||0));
}
function consumePending(name,key){
  const m=memory(); if(!m) return false;
  const i=m.pending.findIndex(e=>e.companion===name&&e.key===key);
  if(i<0)return false; m.pending.splice(i,1); return true;
}
function contextText(name,event){
  const rows=CONTEXT[name]?.[event?.type]||[];
  if(!rows.length) return null;
  let text=pick(rows,`${event.key}:${event.at}`);
  if(event.other&&event.type==='companion_badly_hurt') text=`${text} ${event.other} seems to be who they mean.`;
  return text;
}
function contextLabel(event){
  const map={
    hard_fight:'Talk about that fight.',
    player_badly_hurt:'Talk about how close that was.',
    companion_badly_hurt:`Ask about ${event.other||'the injured companion'}.`,
    camp_ambush:'Talk about the attack on camp.',
    first_shared_tent:'Talk about sharing shelter.',
    return_home:'Ask what it is like being back.',
    first_shared_watch:'Talk about sharing watch.',
    rainy_camp:'Talk about the weather at camp.',
    relationship_strain:'Talk about what is strained between you.',
    reconciliation:'Talk about where things stand now.',
  };
  return map[event?.type]||'Talk about what just happened.';
}
function contextTopic(name){
  return {
    id:CONTEXT_TOPIC,
    reactive:true,
    label:()=>contextLabel(pendingFor(name)[0]),
    priority:()=>60+Math.min(25,Number(pendingFor(name)[0]?.urgency||0)*5),
    condition:()=>pendingFor(name).length>0,
    render:()=>{
      const event=pendingFor(name)[0], c=canonical(name); if(!event||!c)return{};
      const text=contextText(name,event); if(!text)return{};
      return {subject:event.type,text,eventKey:event.key};
    },
    onDiscuss:(ctx,state,result)=>{ if(result?.eventKey) consumePending(name,result.eventKey); },
  };
}
function opinionTopic(name,other){
  const id=`opinion_${other.toLowerCase().replace(/[^a-z0-9]+/g,'_')}`;
  return {
    id,
    label:`What do you make of ${other}?`,
    priority:18,
    cooldownSeconds:DAY*2,
    condition:()=>{
      const c=canonical(name),o=canonical(other),s=pairState(c,o);
      return !!c&&!!o&&s&&s.familiarity>=18;
    },
    render:()=>{
      const text=OPINIONS[name]?.[other]; if(!text)return{};
      const s=pairState(name,other);
      return {subject:`${other}`,text,variantIndex:Math.floor((s?.familiarity||0)/20)};
    },
  };
}
function installTopics(){
  const cm=root.companionConversationMemory; if(!cm?.registerTopics)return false;
  for(const name of CORE){
    const topics=[contextTopic(name),...CORE.filter(o=>o!==name).map(o=>opinionTopic(name,o))];
    cm.registerTopics(name,topics);
  }
  topicsInstalled=true; return true;
}

function formatExchange(row){
  if(!row)return null;
  const parts=[];
  for(let i=0;i<row.length;i+=2) parts.push(`${row[i]}: ${row[i+1]}`);
  return parts.join('  ');
}
function choosePair({context='idle'}={}){
  const cs=companions(); if(cs.length<2)return null;
  const candidates=[];
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){
    const a=cs[i],b=cs[j],key=pairKey(a,b),s=pairState(a,b),rows=BANTER[key];
    if(!rows?.length)continue;
    const age=now()-Number(s.lastAt||0);
    if(age<PAIR_COOLDOWN)continue;
    const score=(s.familiarity||0)+(s.warmth||0)*.3+(key!==memory()?.lastBanterPair?8:0);
    candidates.push({a,b,key,s,rows,score});
  }
  candidates.sort((x,y)=>y.score-x.score||x.key.localeCompare(y.key));
  return candidates[0]||null;
}
function runBanter({context='idle',force=false}={}){
  if(root.isInCombat||!stationary())return false;
  const m=memory(); if(!m)return false;
  if(!force&&now()-m.lastBanterAt<IDLE_COOLDOWN)return false;
  const chosen=choosePair({context}); if(!chosen)return false;
  const row=pick(chosen.rows,`${context}:${Math.floor(now()/MINUTE)}:${chosen.key}:${chosen.s.interactions}`);
  const text=formatExchange(row); if(!text)return false;
  chosen.s.interactions++; chosen.s.lastAt=now(); m.lastBanterAt=now(); m.lastBanterPair=chosen.key;
  root.showMessage?.(text);
  return {pair:chosen.key,text};
}

function snapshotHp(){
  const out={}; for(const member of party())out[member?.name||'unknown']={ratio:hpRatio(member),hp:Number(member?.hp??member?.HP??0)};
  return out;
}
function mostConnected(excludeName=null){
  return companions().filter(c=>c.name!==excludeName).map(c=>{
    const rel=root.getCompanionRelationship?.(c)||c.playerRelationship||{};
    const aff=root.getCompanionAffinity?.(c)||c.playerAffinity||{};
    return {c,score:Number(rel.trust||0)+Number(rel.familiarity||0)*.6+Number(aff.friendship||0)*.5};
  }).sort((a,b)=>b.score-a.score||a.c.name.localeCompare(b.c.name))[0]?.c||null;
}
function onCombatStart(){ runtime.preCombatHp=snapshotHp(); }
function onCombatEnd(){
  const before=runtime.preCombatHp||{}, p=player(); if(!p)return;
  const current=snapshotHp(), pRatio=current[p.name]?.ratio??1;
  const campNow=camp();
  let queued=false;
  if(campNow){
    const c=mostConnected(); if(c)queued=queue(c,'camp_ambush',{urgency:5,key:`camp_ambush:${Math.floor(now()/MINUTE)}`})||queued;
  }
  if(pRatio<=.35){
    const c=mostConnected(); if(c)queued=queue(c,'player_badly_hurt',{urgency:5,key:`player_hurt:${Math.floor(now()/MINUTE)}`})||queued;
  } else {
    const damage=1-pRatio;
    const severe=Object.values(current).some(x=>x.ratio<=.35)||damage>=.35;
    if(severe){ const c=mostConnected(); if(c)queued=queue(c,'hard_fight',{urgency:3,key:`hard_fight:${Math.floor(now()/MINUTE)}`})||queued; }
  }
  const injured=companions().filter(c=>(current[c.name]?.ratio??1)<=.30);
  for(const hurt of injured){
    const observer=companions().filter(c=>c.name!==hurt.name).sort((a,b)=>{
      const sa=pairState(a,hurt),sb=pairState(b,hurt); return ((sb?.familiarity||0)+(sb?.warmth||0))-((sa?.familiarity||0)+(sa?.warmth||0));
    })[0];
    if(observer){
      queue(observer,'companion_badly_hurt',{other:hurt.name,urgency:4,key:`hurt:${hurt.name}:${Math.floor(now()/MINUTE)}`});
      pairAffinity(observer,hurt,1,'survived a frightening fight together');
    }
  }
  runtime.preCombatHp=null;
  if(queued) root.showMessage?.('One of your companions seems to have something to say once things settle down.');
}
function processCombatTransition(){
  const current=!!root.isInCombat;
  if(runtime.lastCombat===null){runtime.lastCombat=current;if(current)onCombatStart();return;}
  if(current===runtime.lastCombat)return;
  if(current)onCombatStart(); else onCombatEnd();
  runtime.lastCombat=current;
}

function tentFor(member,c){
  return (c?.tents||[]).find(t=>(t.occupants||[]).some(x=>x===member||x?.name===member?.name))||null;
}
function weatherText(c=camp()){
  const values=[c?.weather,c?.conditions,c?.weatherType,root.currentWeather,root.weather];
  for(const v of values){
    if(typeof v==='string'&&v)return v;
    if(v&&typeof v==='object'){const t=v.name||v.type||v.id||v.description;if(t)return String(t);}
  }
  return '';
}
function isRainy(c=camp()){ return !!c?.raining||/rain|storm|drizzle|downpour|wet/i.test(weatherText(c)); }
function onGuard(member,c){
  return !!(c?.members||[]).find(x=>(x===member||x?.name===member?.name)&&x.onGuard);
}
function relationshipState(companion){
  const state=root.getCompanionRomanceState?.(companion)||root.companionRomance?.getRelationshipState?.(companion)||{};
  const affinity=state.affinity||root.getCompanionAffinity?.(companion)||companion?.playerAffinity||{};
  const agreement=state.agreement||affinity.agreement||{};
  if(agreement.state==='strained'||String(affinity.romanceState||'').startsWith('strained'))return 'strained';
  if(agreement.state==='ended'||String(affinity.romanceState||'').startsWith('ended'))return 'ended';
  return agreement.state||affinity.romanceState||'none';
}
function processRelationshipTransitions(){
  const m=memory(); if(!m)return;
  m.relationshipStates=m.relationshipStates&&typeof m.relationshipStates==='object'?m.relationshipStates:{};
  for(const c of companions()){
    const current=relationshipState(c),previous=m.relationshipStates[c.name];
    if(previous&&current!==previous){
      if(current==='strained')queue(c,'relationship_strain',{urgency:5,key:`strain:${c.name}:${Math.floor(now()/MINUTE)}`});
      else if(previous==='strained'&&current!=='ended')queue(c,'reconciliation',{urgency:4,key:`reconcile:${c.name}:${Math.floor(now()/MINUTE)}`});
    }
    m.relationshipStates[c.name]=current;
  }
}
function installOutsideConnectionHook(){
  const base=root.recordCompanionOutsideConnection;
  if(typeof base!=='function'||base.__contextualBanterAware)return false;
  const wrapped=function(partnerOrName,otherName,kind,opts){
    const result=base.apply(this,arguments);
    const c=canonical(partnerOrName);
    if(c&&result?.breach)queue(c,'relationship_strain',{urgency:6,key:`outside_breach:${c.name}:${otherName}:${kind}:${Math.floor(now()/MINUTE)}`});
    return result;
  };
  wrapped.__contextualBanterAware=true;
  wrapped.__base=base;
  root.recordCompanionOutsideConnection=wrapped;
  if(root.companionRomance?.recordOutsideConnection===base)root.companionRomance.recordOutsideConnection=wrapped;
  return true;
}

function handleCamp(c=camp()){
  if(!c)return false;
  const p=player(),m=memory(); if(!p||!m)return false;
  let queued=0;
  for(const comp of companions()){
    const a=tentFor(p,c),b=tentFor(comp,c);
    if(a&&b&&a===b){
      const key=`shared_tent:${comp.name}`;
      if(!m.seen[key]){
        m.seen[key]=true;
        if(queue(comp,'first_shared_tent',{urgency:2,key})) queued++;
      }
    }
    if(onGuard(p,c)&&onGuard(comp,c)){
      const key=`shared_watch:${comp.name}`;
      if(!m.seen[key]){
        m.seen[key]=true;
        if(queue(comp,'first_shared_watch',{urgency:2,key})) queued++;
      }
    }
  }
  if(isRainy(c)){
    const choices=companions().filter(comp=>!m.seen[`rain_camp:${comp.name}:${Number(c.startedAt||c.establishedAt||0)}`]);
    const chosen=choices.sort((a,b)=>String(a.name).localeCompare(String(b.name)))[0];
    if(chosen){
      const key=`rain_camp:${chosen.name}:${Number(c.startedAt||c.establishedAt||0)}`;
      m.seen[key]=true;
      if(queue(chosen,'rainy_camp',{urgency:1,key}))queued++;
    }
  }
  // Camp is an especially natural place for companions to talk to one another.
  runBanter({context:'camp',force:true});
  return queued>0;
}
function installCampListener(){
  if(campListenerInstalled||typeof root.addEventListener!=='function')return false;
  root.addEventListener('campDialogue',e=>handleCamp(e?.detail?.camp||camp()));
  campListenerInstalled=true; return true;
}

function locationText(){
  const p=player();
  const candidates=[
    root.currentLocationName,root.currentSettlementName,root.currentAreaName,root.currentRegionName,
    root.currentLocation,root.currentSettlement,root.currentArea,root.currentRegion,
    p?.locationName,p?.regionName,p?.currentLocation,p?.currentRegion,
  ];
  for(const value of candidates){
    if(typeof value==='string'&&value.trim())return value.trim();
    if(value&&typeof value==='object'){
      const text=value.name||value.title||value.id;
      if(text)return String(text);
    }
  }
  return null;
}
function processLocation(){
  const loc=locationText(); if(!loc||loc===runtime.lastLocation)return;
  runtime.lastLocation=loc;
  const m=memory(); if(!m)return;
  const key=loc.toLowerCase(),previous=Number(m.visits[key]||0); m.visits[key]=previous+1;
  if(previous<1)return;
  for(const c of companions()){
    if(ROLLOUT[c.name]?.home?.test(loc)) queue(c,'return_home',{location:loc,urgency:2,key:`return:${c.name}:${key}:${previous+1}`});
  }
}

function processMinute(){
  processCombatTransition();
  processLocation();
  processRelationshipTransitions();
  if(stationary()&&!camp()&&now()-Number(memory()?.lastBanterAt||0)>=IDLE_COOLDOWN){
    // Deterministic sparse trigger: roughly once per six eligible in-game minutes
    // after cooldown, without depending on frame rate.
    if(hash(`idle:${Math.floor(now()/MINUTE)}:${party().map(x=>x?.name).join('|')}`)%6===0)runBanter({context:'idle'});
  }
}
function tick(){
  const minute=Math.floor(now()/MINUTE), hour=Math.floor(now()/HOUR);
  if(hour!==runtime.lastHour){runtime.lastHour=hour;tickPairs();}
  if(minute!==runtime.lastMinute){runtime.lastMinute=minute;processMinute();}
}
function refresh(){
  if(!topicsInstalled)installTopics();
  installCampListener();
  installOutsideConnectionHook();
  tick();
}
const api={
  build:BUILD,core:CORE,baseWarmth:BASE_WARMTH,banter:BANTER,opinions:OPINIONS,contextLines:CONTEXT,
  pairKey,pairState,pairBand,pairAffinity,tickPairs,queue,pendingFor,consumePending,contextText,
  installTopics,runBanter,handleCamp,weatherText,isRainy,relationshipState,processRelationshipTransitions,installOutsideConnectionHook,locationText,processLocation,processCombatTransition,tick,refresh,
};
root.companionContextualBanter=api;
root.COMPANION_CONTEXTUAL_BANTER_BUILD=BUILD;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
refresh();
if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',refresh,{once:true});
if(typeof root.setInterval==='function'&&root.document)runtimeTimer=root.setInterval(refresh,1000);
})(typeof window!=='undefined'?window:globalThis);
