// Broad rollout of player voice and companion reactions across authored campaign outcomes.
(() => {
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const BUILD = '20261001-party-conversation-rollout-v1';
const POLL_MS = 1200;
const questRegistry = new Map();
const seenQuestFingerprints = new Set();
let timer = null;
let installed = false;

const party = () => Array.isArray(root.party) ? root.party : [];
const pcd = () => root.partyConversationDynamics || null;
const completed = q => q && q.status === 'completed' && q.resolution;
const witnessedBy = () => party().slice(1).map(c => c?.name).filter(Boolean);

function spec(tags, context, extra = {}) {
  return { tags, context, ...extra };
}

const DEFAULT_QUEST_OUTCOMES = {
  aelwen_living_accord: {
    marked_buffer: spec(['procedural','proportionality','stewardship','accountable_authority'],'interstate_border'),
    joint_stewardship: spec(['collaboration','stewardship','distributed_authority','adaptive_governance'],'interstate_border'),
    press_silverhart: spec(['material_priority','centralising','expedient','stability_first'],'interstate_border'),
  },
  balrik_last_hold: {
    seal_below: spec(['caution','preservation','risk_averse'],'dangerous_legacy'),
    survey_only: spec(['evidence_first','procedural','controlled_risk','curiosity'],'dangerous_legacy'),
    bounded_reclamation: spec(['pragmatic','stewardship','controlled_risk','proportionality'],'dangerous_legacy'),
  },
  wizard_vendetta: {
    queen: spec(['institutional_trust','procedural','accountable_authority'],'political_evidence'),
    wizard: spec(['discretion','personal_loyalty','private_solution'],'political_evidence'),
    noble: spec(['factional_alliance','leverage','expedient'],'political_evidence'),
  },

  wren_price_of_silence: {
    protect_petra: spec(['mercy','discretion','personal_loyalty'],'family_justice'),
    proof: spec(['evidence_first','accountable_authority','procedural'],'family_justice'),
    vengeance: spec(['punitive','direct_action','personal_loyalty'],'family_justice'),
    leverage: spec(['pragmatic','leverage','expedient'],'family_justice'),
    wren_leads: spec(['delegates_judgement','companion_agency','trusts_others'],'family_justice',{delegated:true}),
  },
  wren_crown_quiet_hand: {
    public_inquiry: spec(['transparency','accountable_authority','procedural'],'crown_accountability'),
    restore_names: spec(['restorative_justice','transparency','mercy','dignity'],'crown_accountability'),
    bury_for_stability: spec(['secrecy','stability_first','expedient'],'crown_accountability'),
    wren_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'crown_accountability',{delegated:true}),
  },

  aldric_broken_vigil: {
    spare_patrol: spec(['mercy','proportionality','individual_responsibility'],'institutional_failure'),
    public_accountability: spec(['transparency','accountable_authority','procedural'],'institutional_failure'),
    private_closure: spec(['discretion','restorative_justice','private_solution'],'institutional_failure'),
    buried_for_money: spec(['secrecy','transactional','expedient'],'institutional_failure'),
  },
  aldric_measure_of_oath: {
    literal_obedience: spec(['duty_first','procedural','hierarchical'],'personal_duty'),
    release: spec(['individual_judgement','autonomy','proportionality'],'personal_duty'),
    bounded_service: spec(['compromise','proportionality','shared_burden'],'personal_duty'),
    aldric_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'personal_duty',{delegated:true}),
  },

  mirabel_unquiet_concordance: {
    restricted_research: spec(['caution','curiosity','procedural','controlled_risk'],'dangerous_knowledge'),
    experiment: spec(['curiosity','controlled_risk','expedient'],'dangerous_knowledge'),
    open_copy: spec(['transparency','curiosity','institutional_sharing'],'dangerous_knowledge'),
    destroy_appendix: spec(['caution','safety_first','irreversible_action'],'dangerous_knowledge'),
    mirabel_leads: spec(['delegates_judgement','companion_agency','trusts_others'],'dangerous_knowledge',{delegated:true}),
  },

  fenn_living_boundary: {
    restore_channel: spec(['preservation','stewardship','sacrifice_short_term'],'land_stewardship'),
    split_channel: spec(['compromise','stewardship','pragmatic','adaptive_governance'],'land_stewardship'),
    drain_marsh: spec(['material_priority','expedient','environmental_cost'],'land_stewardship'),
    fenn_leads: spec(['delegates_judgement','companion_agency','trusts_others'],'land_stewardship',{delegated:true}),
  },

  reyna_empty_blind: {
    turn_in: spec(['institutional_trust','punitive','procedural'],'corruption_investigation'),
    witness_deal: spec(['institutional_trust','proportionality','pragmatic'],'corruption_investigation'),
    double_agent: spec(['deception','security_first','expedient','controlled_risk'],'corruption_investigation'),
    let_disappear: spec(['institutional_distrust','discretion','personal_protection'],'corruption_investigation'),
    reyna_leads: spec(['delegates_judgement','companion_agency','trusts_others'],'corruption_investigation',{delegated:true}),
  },

  alden_uncounted: {
    restore_names: spec(['transparency','dignity','restorative_justice'],'institutional_memory'),
    close_record: spec(['procedural','closure','stability_first'],'institutional_memory'),
    keep_sealed: spec(['secrecy','caution','stability_first'],'institutional_memory'),
    alden_leads: spec(['delegates_judgement','companion_agency','trusts_others'],'institutional_memory',{delegated:true}),
  },

  aldric_weight_of_command: {
    shared_command: spec(['shared_burden','distributed_authority','collaboration'],'leadership'),
    take_every_burden: spec(['duty_first','centralising','self_sacrifice'],'leadership'),
    refuse_command: spec(['autonomy','limits_on_duty','restraint'],'leadership'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'leadership',{delegated:true}),
  },
  mirabel_borrowed_voice: {
    limited_testimony: spec(['caution','proportionality','dignity','controlled_risk'],'dangerous_knowledge'),
    full_reconstruction: spec(['curiosity','evidence_first','controlled_risk'],'dangerous_knowledge'),
    refuse_method: spec(['caution','dignity','safety_first'],'dangerous_knowledge'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'dangerous_knowledge',{delegated:true}),
  },
  mirabel_place_for_dangerous_books: {
    accept_curatorship: spec(['institutional_stewardship','duty_first','rootedness'],'dangerous_knowledge'),
    shared_archive: spec(['distributed_authority','accountable_authority','institutional_sharing'],'dangerous_knowledge'),
    keep_wandering: spec(['autonomy','personal_freedom','institutional_distance'],'dangerous_knowledge'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'dangerous_knowledge',{delegated:true}),
  },
  fenn_fire_in_understory: {
    mosaic_burn: spec(['adaptive_governance','stewardship','controlled_risk'],'land_stewardship'),
    obey_rule: spec(['procedural','preservation','risk_averse'],'land_stewardship'),
    hand_clear: spec(['pragmatic','stewardship','labour_intensive'],'land_stewardship'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'land_stewardship',{delegated:true}),
  },
  fenn_groves_answer: {
    return_traditional: spec(['tradition','duty_first','institutional_loyalty'],'community_leadership'),
    changed_charter: spec(['reform','adaptive_governance','accountable_authority'],'community_leadership'),
    remain_outside: spec(['autonomy','institutional_distance','independence'],'community_leadership'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'community_leadership',{delegated:true}),
  },
  reyna_shared_watch: {
    joint_watch: spec(['collaboration','institutional_trust','distributed_authority'],'security_governance'),
    reyna_centre: spec(['centralising','personal_responsibility','security_first'],'security_governance'),
    private_network: spec(['institutional_distrust','private_solution','pragmatic'],'security_governance'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'security_governance',{delegated:true}),
  },
  reyna_rangers_writ: {
    take_writ: spec(['institutional_trust','duty_first','accountable_authority'],'security_governance'),
    distributed_charter: spec(['distributed_authority','collaboration','institutional_reform'],'security_governance'),
    reject_writ: spec(['autonomy','institutional_distrust','independence'],'security_governance'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'security_governance',{delegated:true}),
  },
  alden_missing_sixth: {
    return_and_name: spec(['dignity','restorative_justice','particularity'],'institutional_memory'),
    pursue_network: spec(['evidence_first','engagement','accountable_authority'],'institutional_memory'),
    close_record: spec(['closure','procedural','stability_first'],'institutional_memory'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'institutional_memory',{delegated:true}),
  },
  alden_rule_for_living: {
    take_office: spec(['duty_first','institutional_stewardship','engagement'],'institutional_memory'),
    rotating_ministry: spec(['distributed_authority','shared_burden','institutional_stewardship'],'institutional_memory'),
    return_contemplation: spec(['personal_freedom','institutional_distance','restraint'],'institutional_memory'),
    companion_decides: spec(['delegates_judgement','companion_agency','trusts_others'],'institutional_memory',{delegated:true}),
  },
};

const CROSS_REACTIONS = {
  'aelwen_living_accord:press_silverhart': [
    {companion:'Fenn Oakheart',mergeKey:'accord:farmland_over_forest',topic:'the Silverhart–elven boundary',urgency:2,sensitive:true,
      publicText:'If the boundary only works when the forest loses every close decision, it is not stewardship. It is a fence that keeps moving.',
      deferredText:'Fenn says, “A farm can be hungry and still not own every stream and browsing trail around it. I hope we have not called taking land a boundary settlement.”'},
  ],
  'balrik_last_hold:survey_only': [
    {companion:'Mirabel Quill',mergeKey:'last_hold:survey',topic:'the sealed Deep',urgency:0,defer:true,
      deferredText:'Mirabel says, “Survey first, touch later. I know I am not famous for restraint, so please appreciate how alarming it is that even I think that is sensible.”'},
  ],
  'wizard_vendetta:wizard': [
    {companion:'Ser Aldric Thorne',mergeKey:'vendetta:private_justice',topic:'the Court Wizard evidence',urgency:1,sensitive:true,
      deferredText:'Aldric says, “Thessaly may handle her own house honestly. I would still rather an accusation against someone powerful leave a record somewhere outside that house.”'},
  ],
  'wizard_vendetta:noble': [
    {companion:'Reyna Fletcher',mergeKey:'vendetta:factional_evidence',topic:'the Court Wizard evidence',urgency:2,sensitive:true,
      whisperText:'Evidence stops being evidence very quickly when you hand it to someone who mainly wants ammunition.',
      deferredText:'Reyna says, “Maybe the noble does something useful with it. Just remember: we gave a political weapon to somebody who already wanted a target.”'},
  ],
  'wren_price_of_silence:vengeance': [
    {companion:'Brother Alden',mergeKey:'wren:vengeance',topic:'what happened over Wren’s parents',urgency:1,criticismOfPlayer:true,
      deferredText:'Alden says, “Anger can be truthful without being a verdict. I am not sure we left enough space between learning who was responsible and deciding what they deserved.”'},
  ],
  'wren_price_of_silence:leverage': [
    {companion:'Reyna Fletcher',mergeKey:'wren:leverage',topic:'using the murder evidence as leverage',urgency:1,sensitive:true,
      whisperText:'Useful leverage. Also the sort of leverage that changes what the evidence is for.',
      deferredText:'Reyna says, “It worked. I am only saying that once evidence becomes currency, everyone starts asking its price instead of whether it is true.”'},
  ],
  'aldric_broken_vigil:buried_for_money': [
    {companion:'Wren Talbot',mergeKey:'aldric:paid_silence',topic:'the Broken Vigil evidence',urgency:3,criticismOfPlayer:true,
      publicText:'We found out people were abandoned for money, and the answer is more money for silence? No. I am not pretending that makes sense.',
      deferredText:'Wren says, “You can call it settlement if you want. I heard us put a price on keeping quiet.”'},
  ],
  'reyna_empty_blind:double_agent': [
    {companion:'Brother Alden',mergeKey:'reyna:double_agent',topic:'the compromised scout',urgency:1,sensitive:true,
      deferredText:'Alden says, “Perhaps using her as a double agent prevents worse harm. I only want us to remember that a frightened person is not merely a useful channel to the enemy.”'},
  ],
  'alden_uncounted:keep_sealed': [
    {companion:'Wren Talbot',mergeKey:'alden:sealed_names',topic:'the sealed burial record',urgency:2,criticismOfPlayer:true,
      deferredText:'Wren says, “People disappearing into paperwork is still disappearing. Sealing the record does not make the missing less real.”'},
  ],
  'mirabel_borrowed_voice:full_reconstruction': [
    {companion:'Brother Alden',mergeKey:'mirabel:borrowed_voice',topic:'reconstructing the dead courier’s voice',urgency:1,sensitive:true,
      deferredText:'Alden says, “I understand why the testimony mattered. I also think there is a line between hearing what the dead left behind and finishing their sentences for them.”'},
  ],
};

function registerQuestOutcomes(questId, outcomes, options = {}) {
  if (!questId || !outcomes || typeof outcomes !== 'object') return false;
  const id = String(questId);
  const prior = questRegistry.get(id) || { outcomes:{}, reactions:{}, options:{} };
  prior.outcomes = { ...prior.outcomes, ...outcomes };
  prior.options = { ...prior.options, ...options };
  questRegistry.set(id, prior);
  return true;
}

function registerQuestReaction(questId, resolution, reaction) {
  if (!questId || !resolution || !reaction) return false;
  const id = String(questId);
  const prior = questRegistry.get(id) || { outcomes:{}, reactions:{}, options:{} };
  const key = String(resolution);
  prior.reactions[key] = [ ...(prior.reactions[key] || []), ...(Array.isArray(reaction) ? reaction : [reaction]) ];
  questRegistry.set(id, prior);
  return true;
}

for (const [id, outcomes] of Object.entries(DEFAULT_QUEST_OUTCOMES)) registerQuestOutcomes(id, outcomes);
for (const [key, reactions] of Object.entries(CROSS_REACTIONS)) {
  const i = key.indexOf(':');
  registerQuestReaction(key.slice(0,i), key.slice(i+1), reactions);
}

function actualWorldResolution(q) {
  return q?.effectiveResolution
    || q?.wrenDecision
    || q?.aldricDecision
    || q?.mirabelDecision
    || q?.fennDecision
    || q?.reynaDecision
    || q?.aldenDecision
    || q?.companionDecision
    || q?.resolution
    || null;
}

function fingerprint(q) {
  return `${q?.id || ''}|${q?.status || ''}|${q?.resolution || ''}|${q?.completedAt ?? q?.updatedAt ?? ''}`;
}

function outcomeSpec(q) {
  return questRegistry.get(String(q?.id || ''))?.outcomes?.[String(q?.resolution || '')] || null;
}

function recordQuestOutcome(q) {
  const dynamics = pcd();
  const entry = outcomeSpec(q);
  if (!dynamics?.recordPlayerChoice || !entry || !completed(q)) return false;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  return dynamics.recordPlayerChoice({
    sourceId:`quest:${q.id}`,
    choiceId:String(q.resolution),
    context:String(entry.context || `quest:${q.id}`),
    tags,
    strength:Number(entry.strength || 1),
    witnessedBy:entry.witnessedBy || witnessedBy(),
  });
}

function emitQuestReactions(q) {
  const dynamics = pcd();
  if (!dynamics?.raiseReaction || !completed(q)) return 0;
  const reg = questRegistry.get(String(q.id));
  if (!reg) return 0;
  const concrete = String(actualWorldResolution(q) || q.resolution);
  const list = reg.reactions?.[concrete] || [];
  let count = 0;
  for (const raw of list) {
    const reaction = {
      ...raw,
      eventId:raw.eventId || `quest:${q.id}:${concrete}`,
      context:raw.context || `After ${q.id} resolved as ${concrete}`,
    };
    const result = dynamics.raiseReaction(reaction);
    if (result) count++;
  }
  return count;
}

function processQuest(q, {emitReactions=false} = {}) {
  if (!completed(q) || !outcomeSpec(q)) return {processed:false, recorded:false, reactions:0};
  const key = fingerprint(q);
  if (seenQuestFingerprints.has(key)) return {processed:false, recorded:false, reactions:0, reason:'seen'};
  const recorded = !!recordQuestOutcome(q);
  const reactions = emitReactions ? emitQuestReactions(q) : 0;
  seenQuestFingerprints.add(key);
  return {processed:true, recorded, reactions};
}

function syncCompleted({emitReactions=true} = {}) {
  if (!pcd()) return {processed:0, recorded:0, reactions:0, reason:'dynamics_unavailable'};
  let processed = 0, recorded = 0, reactions = 0;
  for (const q of (root.questLog || [])) {
    const r = processQuest(q,{emitReactions});
    if (r.processed) processed++;
    if (r.recorded) recorded++;
    reactions += Number(r.reactions || 0);
  }
  return {processed,recorded,reactions};
}

// Small opt-in helpers for ordinary authored dialogue. They deliberately require
// an explicit call from the scene; generic shop/inn chatter is not classified.
function recordDialogueChoice(sourceId, choiceId, {context='dialogue',tags=[],strength=1,witnessedBy:who} = {}) {
  return pcd()?.recordPlayerChoice?.({
    sourceId:`dialogue:${sourceId}`,
    choiceId:String(choiceId),
    context,
    tags,
    strength,
    witnessedBy:Array.isArray(who) ? who : witnessedBy(),
  }) || false;
}

function wrapDialogueOption(option, evidence = {}) {
  if (!option || typeof option !== 'object') return option;
  const original = option.action;
  const sourceId = evidence.sourceId || evidence.sceneId || 'authored_scene';
  const choiceId = evidence.choiceId || option.choiceId || option.id || option.label || 'choice';
  return {
    ...option,
    __partyConversationRollout:true,
    action:function(...args){
      recordDialogueChoice(sourceId,choiceId,evidence);
      return typeof original === 'function' ? original.apply(this,args) : undefined;
    },
  };
}

function shapeOptions(baseOptions, variants, options = {}) {
  const dynamics = pcd();
  if (!dynamics?.shapePlayerOptions) return Array.isArray(baseOptions) ? [...baseOptions] : [];
  return dynamics.shapePlayerOptions({
    baseOptions:Array.isArray(baseOptions) ? baseOptions : [],
    variants:Array.isArray(variants) ? variants : [],
    ...options,
  });
}

function findPartyExperts(requirement) {
  return pcd()?.findContributors?.(requirement || {}) || [];
}

function registrySnapshot() {
  const out = {};
  for (const [id, reg] of questRegistry) out[id] = {
    outcomes:Object.keys(reg.outcomes || {}),
    reactions:Object.keys(reg.reactions || {}),
  };
  return out;
}

function install() {
  if (installed) return api;
  installed = true;
  // Existing saves gain behavioural history, but do not receive a burst of old reactions.
  syncCompleted({emitReactions:false});
  if (typeof document !== 'undefined' && typeof setInterval === 'function') {
    timer = setInterval(() => syncCompleted({emitReactions:true}), POLL_MS);
    timer?.unref?.();
  }
  return api;
}

function stop() {
  if (timer != null && typeof clearInterval === 'function') clearInterval(timer);
  timer = null;
  return true;
}

const api = {
  BUILD,
  registerQuestOutcomes,
  registerQuestReaction,
  actualWorldResolution,
  outcomeSpec,
  recordQuestOutcome,
  emitQuestReactions,
  processQuest,
  syncCompleted,
  recordDialogueChoice,
  wrapDialogueOption,
  shapeOptions,
  findPartyExperts,
  registrySnapshot,
  install,
  stop,
  DEFAULT_QUEST_OUTCOMES,
  CROSS_REACTIONS,
};
root.partyConversationRollout = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
install();

})();
