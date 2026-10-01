const test = require('node:test');
const assert = require('node:assert/strict');

function boot({ quests = [], knowledge = {}, partyNames = [] } = {}) {
  delete require.cache[require.resolve('../companionObservedPersonality.js')];
  const lead = { name: 'Hero', companionPersonalityKnowledge: knowledge };
  const party = [lead, ...partyNames.map(name => ({ name }))];
  const learned = [];
  const relationSnapshot = JSON.stringify(party.map(p => p.playerRelationship || null));
  const affinitySnapshot = JSON.stringify(party.map(p => p.playerAffinity || null));
  global.window = {
    party,
    questLog: quests,
    worldSeconds: 123,
    showDialogue() { return 'shown'; },
    learnCompanionPersonality(name, trait, amount, source) {
      const traits = lead.companionPersonalityKnowledge[name] ||= {};
      const previous = Number(traits[trait]?.level || 0);
      const level = Math.min(3, previous + amount);
      traits[trait] = { level, source };
      const result = { name, trait, level, advanced: level > previous };
      learned.push(result);
      return result;
    },
  };
  const api = require('../companionObservedPersonality.js');
  return { api, lead, learned, relationSnapshot, affinitySnapshot, party };
}

const q = (id, extra = {}) => ({ id, status: 'active', clues: {}, ...extra });

test('Mirabel appendix teaches curiosity and responsibility exactly once', () => {
  const { api, lead, learned } = boot({ quests: [q('mirabel_unquiet_concordance', { clues: { restricted_appendix: { found: true } } })] });
  assert.equal(lead.companionPersonalityKnowledge['Mirabel Quill'].curiosity.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Mirabel Quill'].responsibility.level, 1);
  assert.equal(learned.length, 2);
  api.sync();
  assert.equal(learned.length, 2);
});

test('Fenn old-channel behaviour teaches stewardship and reciprocity', () => {
  const { lead } = boot({ quests: [q('fenn_living_boundary', { clues: { old_channel: { found: true } } })] });
  assert.equal(lead.companionPersonalityKnowledge['Fenn Oakheart'].stewardship.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Fenn Oakheart'].reciprocity.level, 1);
});

test('Reyna confrontation teaches interdependence but not unrelated justice', () => {
  const { lead } = boot({ quests: [q('reyna_empty_blind', { clues: { coercion: { found: true } } })] });
  assert.equal(lead.companionPersonalityKnowledge['Reyna Fletcher'].interdependence.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Reyna Fletcher'].justice, undefined);
});

test('Alden initiating the uncounted investigation teaches dignity and engagement', () => {
  const { lead } = boot({ quests: [q('alden_uncounted', { clues: { alden_memory: { found: true } } })] });
  assert.equal(lead.companionPersonalityKnowledge['Brother Alden'].dignity.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Brother Alden'].engagement.level, 1);
});

test('Wren learns from her own final choice only when player ceded the decision', () => {
  const { lead } = boot({ quests: [q('wren_crown_quiet_hand', { status: 'completed', resolution: 'wren_decides', effectiveResolution: 'restore_names' })] });
  assert.equal(lead.companionPersonalityKnowledge['Wren Talbot'].authority.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Wren Talbot'].mercy.level, 1);
  const no = boot({ quests: [q('wren_crown_quiet_hand', { status: 'completed', resolution: 'restore_names' })] });
  assert.equal(no.lead.companionPersonalityKnowledge['Wren Talbot'], undefined);
});

test('Aldric deciding his own oath teaches duty and burden', () => {
  const { lead } = boot({ quests: [q('aldric_measure_of_oath', { status: 'completed', resolution: 'aldric_decides', effectiveResolution: 'bounded_service' })] });
  assert.equal(lead.companionPersonalityKnowledge['Ser Aldric Thorne'].duty.level, 1);
  assert.equal(lead.companionPersonalityKnowledge['Ser Aldric Thorne'].burden.level, 1);
});

test('observations are stored on stable lead character with human-readable evidence', () => {
  const { api, lead } = boot({ quests: [q('mirabel_unquiet_concordance', { clues: { restricted_appendix: {} } })], partyNames: ['Mirabel Quill'] });
  const entries = api.evidence('Mirabel Quill');
  assert.equal(entries.length, 1);
  assert.match(entries[0].description, /watched Mirabel copy/i);
  assert.ok(lead.companionPersonalityObservations['mirabel:copies_restricted_appendix']);
});

test('showDialogue wrapper syncs a newly visible behaviour before rendering', () => {
  const { api, lead } = boot({ quests: [q('fenn_living_boundary')] });
  const quest = window.questLog[0];
  quest.clues.old_channel = { found: true };
  window.showDialogue({ name: 'Fenn Oakheart' }, 'scene', []);
  assert.equal(lead.companionPersonalityKnowledge['Fenn Oakheart'].stewardship.level, 1);
  assert.equal(api.evidence('Fenn Oakheart').length, 1);
});

test('behaviour observations never touch relationship or affinity state', () => {
  const ctx = boot({ quests: [q('alden_uncounted', { clues: { alden_memory: {} } })], partyNames: ['Brother Alden'] });
  assert.equal(JSON.stringify(ctx.party.map(p => p.playerRelationship || null)), ctx.relationSnapshot);
  assert.equal(JSON.stringify(ctx.party.map(p => p.playerAffinity || null)), ctx.affinitySnapshot);
});
