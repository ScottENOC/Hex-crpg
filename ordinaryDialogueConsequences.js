// Authored behavioural consequences for ordinary dialogue choices.
// Deliberately uses explicit scene/choice rules or option metadata rather than
// trying to infer morality/personality from arbitrary dialogue text.
(() => {
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const BUILD = '20261001-ordinary-dialogue-consequences-v2';
const sceneRules = new Map();
const wrappedTrees = new Set();
const expertiseScenes = new Set(['reddale_steward']);
let currentScene = null;
let installed = false;

const party = () => Array.isArray(root.party) ? root.party : [];
const rollout = () => root.partyConversationRollout || null;
const dynamics = () => root.partyConversationDynamics || null;
const firstName = n => { const p=String(n || '').trim().split(/\s+/); return (['ser','brother','sister','father','mother','queen','king'].includes(String(p[0]||'').toLowerCase()) ? p[1] : p[0]) || 'your companion'; };

function rule(sceneId, label, choiceId, context, tags, extra = {}) {
  return { sceneId, label, choiceId, context, tags, ...extra };
}

const DEFAULT_RULES = [
  rule('hollowmere_beggar','Give 2 gold.','give_beggar_gold','charity',['generosity','charity','material_sacrifice'],{
    when:() => Number(party()[0]?.gold || 0) >= 2,
  }),
  rule('guild_investigator',"No idea what you're talking about.",'deny_hidden_bodies','self_protection',['deception','secrecy','self_protection']),
  rule('guild_investigator','Say nothing.','silent_about_hidden_bodies','self_protection',['evasion','discretion','self_protection']),

  rule('thieves_guildmaster',"I'll handle it.",'accept_blood_price','criminal_contract',['punitive','contract_killing','criminal_loyalty','direct_action'],{
    promptIncludes:'He needs to stop, permanently.',
    reactions:[{
      companion:'Brother Alden', mergeKey:'ordinary:blood_price', topic:'taking the Guild assassination', urgency:2,
      criticismOfPlayer:true, deferredText:'Alden says, “There is a difference between knowing a man is an informant and accepting a contract to make him stop breathing. I hope we have not confused the two.”'
    }],
  }),
  rule('thieves_guildmaster','Not that far.','refuse_blood_price','criminal_contract',['restraint','limits_on_loyalty','refuses_killing'],{
    promptIncludes:'He needs to stop, permanently.',
  }),
  rule('thieves_guildmaster',"I'll do it.",'accept_guild_initiation','theft',['theft','criminal_affiliation','opportunistic'],{
    promptIncludes:'Perrin Vance',
  }),
  rule('thieves_guild_debtor','"Corvin Ashe sent me. Pay up."','pressure_guild_debtor','debt_collection',['coercive','intimidation','criminal_loyalty']),
  rule('thieves_guild_debtor','"I can wait a day or two." (let him off)','show_debtor_leniency','debt_collection',['mercy','leniency','personal_discretion']),

  rule('wick_hallow','Donate 5 fish/fruit/herbs to the village stores.','donate_village_food','community_aid',['generosity','community_support','material_sacrifice'],{
    when:() => {
      const inv = root.player?.inventory || party()[0]?.inventory || [];
      return inv.filter(i => ['fish','fruit','herbs'].includes(i)).length >= 5;
    },
  }),
  rule('hendra_wells',"I'll go look for him.",'help_find_missing_child','community_aid',['protective','altruism','community_support']),
  rule('old_mac',"I'll deal with the wolves.",'help_farm_wolves','community_aid',['helpful','community_support','protective']),

  rule('reddale_disciple',"Your secret's safe with me — for now.",'protect_cult_disciple','dangerous_secret',['secrecy','complicity','pragmatic','institutional_distrust'],{
    reactions:[{
      companion:'Brother Alden', mergeKey:'ordinary:disciple_secret', topic:'Mirella Thorn', urgency:2, sensitive:true,
      deferredText:'Alden says, “Keeping a frightened person’s confidence is one thing. Keeping a necromancer’s agent hidden from the people living beside her is another.”'
    }],
  }),
  rule('reddale_disciple','You serve the Vessel-Seeker.','confront_cult_disciple','dangerous_secret',['direct_confrontation','evidence_first','risk_taking']),
  rule('reddale_captain','Report a cult disciple hiding in town.','report_cult_disciple','dangerous_secret',['institutional_trust','protective','reports_danger','accountable_authority']),

  rule('reddale_guard','Ask him to bury the border sighting. (25 gold)','bribe_guard_bury_sighting','corruption',['bribery','secrecy','corruption','security_risk','expedient'],{
    when:() => Number(party()[0]?.gold || 0) >= 25,
    reactions:[
      { companion:'Reyna Fletcher', mergeKey:'ordinary:buried_border_sighting', topic:'the buried border report', urgency:3, criticismOfPlayer:true, sensitive:true,
        whisperText:'Paying a gate guard to erase hostile scouting is not subtle intelligence work. It is paying ourselves to go blind.',
        deferredText:'Reyna says, “We had a warning about somebody testing the border, and we paid the man holding it to forget. That is the sort of quiet that gets people killed later.”' },
      { companion:'Ser Aldric Thorne', mergeKey:'ordinary:buried_border_sighting', topic:'the buried border report', urgency:2, criticismOfPlayer:true,
        deferredText:'Aldric says, “A bribe to conceal a danger from the officer responsible for the town is not merely private dishonesty. Other people are relying on that report.”' },
    ],
  }),
  rule('reddale_reeve','Help you push back against Ironbond.','back_reddale_against_ironbond','local_governance',['community_support','institutional_independence','resists_coercion']),
  rule('reddale_reeve',"Broker the deal in Ironbond's favor. (+50 gold)",'broker_for_ironbond','local_governance',['transactional','material_gain','corporate_power','expedient'],{
    reactions:[{
      companion:'Wren Talbot', mergeKey:'ordinary:ironbond_reddale_deal', topic:'the Ironbond deal in Reddale', urgency:1, criticismOfPlayer:true,
      deferredText:'Wren says, “Maybe the deal keeps trade moving. But we took their money while helping the same Company lean harder on another town. I noticed.”'
    }],
  }),

  rule('reddale_baron',"I'm your man on the inside now.",'double_cross_for_baron','espionage',['deception','double_agent','factional_alliance','expedient'],{
    promptIncludes:'Ironbond',
  }),
  rule('reddale_guildmaster',"I'm your man on the inside now.",'double_cross_for_ironbond','espionage',['deception','double_agent','factional_alliance','expedient'],{
    promptIncludes:'Baron',
  }),
  rule('reddale_baron',"You're wrong about me.",'refuse_baron_double_cross','espionage',['refuses_double_cross','loyalty','restraint'],{
    promptIncludes:'Ironbond',
  }),
  rule('reddale_guildmaster',"You're wrong about me.",'refuse_ironbond_double_cross','espionage',['refuses_double_cross','loyalty','restraint'],{
    promptIncludes:'Baron',
  }),

  rule('chief_skarnub','I could help you, for the right price.','offer_paid_help_to_skarnub','goblin_negotiation',['transactional','pragmatic','negotiation']),
  rule('chief_skarnub','Leave this land, or face us.','threaten_skarnub','goblin_negotiation',['intimidation','coercive','direct_action']),
  rule('chief_skarnub','Agreed. Take what you need and go.','allow_goblin_departure','goblin_negotiation',['negotiation','mercy','deescalation','material_concession']),
  rule('chief_skarnub',"You don't have to leave. Stay.",'invite_goblin_alliance','goblin_negotiation',['pluralism','mercy','risk_taking','independent_judgement']),
  rule('nix_sharpear','Take your people and go.','allow_goblin_withdrawal','goblin_negotiation',['mercy','deescalation','pragmatic']),
];

function normaliseRule(raw) {
  if (!raw?.sceneId || !raw?.label) return null;
  return {
    ...raw,
    sceneId:String(raw.sceneId),
    label:String(raw.label),
    choiceId:String(raw.choiceId || raw.label),
    context:String(raw.context || 'ordinary_dialogue'),
    tags:Array.isArray(raw.tags) ? [...new Set(raw.tags.map(String))] : [],
    reactions:Array.isArray(raw.reactions) ? raw.reactions : (raw.reactions ? [raw.reactions] : []),
  };
}

function registerRule(raw) {
  const r = normaliseRule(raw);
  if (!r) return false;
  const arr = sceneRules.get(r.sceneId) || [];
  arr.push(r);
  sceneRules.set(r.sceneId, arr);
  return true;
}
for (const r of DEFAULT_RULES) registerRule(r);

function ruleFor(sceneId, prompt, option) {
  if (!sceneId || !option) return null;
  const label = String(option.label || '');
  return (sceneRules.get(String(sceneId)) || []).find(r =>
    r.label === label && (!r.promptIncludes || String(prompt || '').includes(r.promptIncludes))
  ) || null;
}

function semanticMeta(sceneId, prompt, option) {
  const explicit = option?.dialogueEvidence || option?.behaviourEvidence || null;
  if (explicit) return {
    sceneId:String(explicit.sceneId || sceneId || 'authored_scene'),
    label:String(option.label || ''),
    choiceId:String(explicit.choiceId || option.id || option.label || 'choice'),
    context:String(explicit.context || 'ordinary_dialogue'),
    tags:Array.isArray(explicit.tags) ? explicit.tags.map(String) : [],
    strength:Number(explicit.strength || 1),
    reactions:Array.isArray(explicit.reactions) ? explicit.reactions : (explicit.reactions ? [explicit.reactions] : []),
    when:explicit.when,
  };
  return ruleFor(sceneId,prompt,option);
}

function recordAndReact(meta) {
  if (!meta) return false;
  if (typeof meta.when === 'function' && !meta.when()) return false;
  const r = rollout();
  if (!r?.recordDialogueChoice) return false;
  const recorded = r.recordDialogueChoice(meta.sceneId,meta.choiceId,{
    context:meta.context,
    tags:meta.tags || [],
    strength:Number(meta.strength || 1),
  });
  if (!recorded) return false;
  const raise = dynamics()?.raiseReaction;
  for (const reaction of (meta.reactions || [])) {
    raise?.({
      ...reaction,
      eventId:reaction.eventId || `dialogue:${meta.sceneId}:${meta.choiceId}`,
      context:reaction.context || `After dialogue choice ${meta.sceneId}:${meta.choiceId}`,
    });
  }
  return true;
}

function withScene(sceneId, fn, self, args) {
  const previous = currentScene;
  currentScene = sceneId || previous;
  try { return typeof fn === 'function' ? fn.apply(self,args || []) : undefined; }
  finally { currentScene = previous; }
}

function maybeAddInsightExpert(sceneId, speaker, prompt, options) {
  const readIndex = options.findIndex(o => o && (o.label === 'Try to read him.' || o.label === 'Try to read her.'));
  if (readIndex < 0 || !speaker || typeof root.readTheRoom !== 'function') return options;
  const d = dynamics();
  if (!d?.findContributors || !d?.skillValue) return options;
  const pc = party()[0];
  const pcInsight = d.skillValue(pc,'insight');
  const expert = d.findContributors({skill:'insight',minSkill:1,includePlayer:false})
    .find(c => d.skillValue(c,'insight') > pcInsight);
  if (!expert) return options;
  const marker = `__ordinaryInsight_${sceneId}_${expert.name}`;
  if (options.some(o => o?.[marker])) return options;
  const extra = {
    label:`Ask ${firstName(expert.name)} what they make of ${speaker.name || 'them'}.`,
    [marker]:true,
    __partyExpertise:true,
    action:() => {
      const {text} = root.readTheRoom(speaker,expert) || {};
      const line = text
        ? `${expert.name} quietly sizes ${speaker.name || 'them'} up. ${text}`
        : `${expert.name} watches for a moment, but has nothing useful to add.`;
      root.showDialogue?.(expert,line,[{
        label:'Keep talking.',
        action:() => root.npcDialogueTrees?.[sceneId]?.(speaker),
      }]);
    },
  };
  const out = [...options];
  out.splice(readIndex,0,extra);
  return out;
}

function attributePartyKnowledge(sceneId, options) {
  if (sceneId !== 'reddale_disciple') return options;
  const pc = party()[0];
  const out = [...options];
  for (let i=0;i<out.length;i++) {
    const option = out[i];
    if (!option) continue;
    if (option.label === 'Look closer at her wares.' && typeof root.hasKnowledgeReligion === 'function' && !root.hasKnowledgeReligion(pc)) {
      const expert = party().slice(1).find(c => root.hasKnowledgeReligion(c));
      if (expert) out[i] = {...option,label:`Ask ${firstName(expert.name)} to look closer at her wares.`,__partyExpertise:true};
    } else if (option.label === 'Something about her unsettles you.' && typeof root.hasSpellUnlocked === 'function' && !root.hasSpellUnlocked(pc,'smite_evil')) {
      const expert = party().slice(1).find(c => root.hasSpellUnlocked(c,'smite_evil'));
      if (expert) out[i] = {...option,label:`${firstName(expert.name)} says something about her feels wrong.`,__partyExpertise:true};
    }
  }
  return out;
}

function decorateOptions(sceneId, speaker, prompt, options) {
  let out = Array.isArray(options) ? options.map(o => ({...o})) : [];
  out = attributePartyKnowledge(sceneId,out);
  out = maybeAddInsightExpert(sceneId,speaker,prompt,out);
  return out.map(option => {
    if (!option || option.__ordinaryDialogueConsequences) return option;
    const original = option.action;
    const meta = semanticMeta(sceneId,prompt,option);
    return {
      ...option,
      __ordinaryDialogueConsequences:true,
      action:function(...args){
        return withScene(sceneId, function(){
          recordAndReact(meta);
          return typeof original === 'function' ? original.apply(this,args) : undefined;
        }, this, []);
      },
    };
  });
}

function installShowDialogueHook() {
  const cur = root.showDialogue;
  if (typeof cur !== 'function') return false;
  if (cur.__ordinaryDialogueConsequences) return true;
  const wrapped = function(speaker,prompt,options,...rest){
    const sceneId = currentScene || speaker?.dialogueId || null;
    return cur.call(this,speaker,prompt,decorateOptions(sceneId,speaker,prompt,options),...rest);
  };
  wrapped.__ordinaryDialogueConsequences = true;
  wrapped.__ordinaryDialogueConsequencesBase = cur;
  // If the party-conversation hook is already underneath us, preserve its
  // marker so its watchdog does not wrap the chain a second time.
  if (cur.__partyConversationDynamics) wrapped.__partyConversationDynamics = true;
  root.showDialogue = wrapped;
  return true;
}

function wrapTree(sceneId) {
  const trees = root.npcDialogueTrees;
  const original = trees?.[sceneId];
  if (typeof original !== 'function') return false;
  if (original.__ordinaryDialogueScene) return true;
  const wrapped = function(...args){ return withScene(sceneId,original,this,args); };
  wrapped.__ordinaryDialogueScene = sceneId;
  wrapped.__ordinaryDialogueSceneBase = original;
  trees[sceneId] = wrapped;
  wrappedTrees.add(sceneId);
  return true;
}

function registerExpertiseScene(sceneId) {
  if (!sceneId) return false;
  expertiseScenes.add(String(sceneId));
  return wrapTree(String(sceneId)) || true;
}

function installSceneHooks() {
  if (!root.npcDialogueTrees) return 0;
  let count = 0;
  const ids = new Set([...sceneRules.keys(), ...expertiseScenes]);
  for (const id of ids) if (wrapTree(id)) count++;
  return count;
}

function tagOption(option, evidence = {}) {
  return option && typeof option === 'object'
    ? {...option,dialogueEvidence:{...(option.dialogueEvidence || {}),...evidence}}
    : option;
}

function makeExpertiseOption({sceneId,speaker,requirement,label,render} = {}) {
  const d = dynamics();
  if (!d?.findContributors) return null;
  const experts = d.findContributors({...requirement,includePlayer:requirement?.includePlayer ?? false});
  const expert = experts[0];
  if (!expert) return null;
  return {
    label:typeof label === 'function' ? label(expert) : (label || `Ask ${firstName(expert.name)}.`),
    __partyExpertise:true,
    action:() => withScene(sceneId,() => render?.(expert,speaker),null,[]),
  };
}

function install() {
  if (installed) {
    installShowDialogueHook();
    installSceneHooks();
    return api;
  }
  installed = true;
  installShowDialogueHook();
  installSceneHooks();
  return api;
}

const api = {
  BUILD,
  DEFAULT_RULES,
  registerRule,
  registerExpertiseScene,
  ruleFor,
  semanticMeta,
  recordAndReact,
  decorateOptions,
  attributePartyKnowledge,
  tagOption,
  makeExpertiseOption,
  installShowDialogueHook,
  installSceneHooks,
  install,
  wrappedTrees,
  expertiseScenes,
};
root.ordinaryDialogueConsequences = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
}

})();
