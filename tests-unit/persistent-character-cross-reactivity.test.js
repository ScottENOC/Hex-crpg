const test = require('node:test');
const assert = require('node:assert/strict');

function fresh({
  vampire = false,
  hunt = false,
  lich = null,
  phylacteryReturned = false,
  infiltration = false,
  petraStance = 'pragmatic_factor',
  reyna = null,
  wren = null,
  aldric = null,
} = {}) {
  const relPath = require.resolve('../persistentCharacterRelationships.js');
  const crossPath = require.resolve('../persistentCharacterCrossReactivity.js');
  delete require.cache[relPath];
  delete require.cache[crossPath];

  for (const key of [
    'persistentCharacterRelationships', 'persistentCharacterRelationshipState',
    'getPersistentCharacterProfile', 'getPersistentCharacterRelationship',
    'setPersistentCharacterRelationship', 'adjustPersistentCharacterRelationship',
    'notePersistentCharacterConversation', 'recordPersistentCharacterEvent',
    'persistentCharacterCrossReactivity', 'PERSISTENT_CHARACTER_CROSS_REACTIVITY_BUILD',
    'phylacteryReturned', 'playerIsLich', 'necromancerAllied', 'vampireLeadConfirmed',
    'ironbondArc', 'petraIronbondFactor'
  ]) delete global[key];

  global.window = global;
  global.document = { readyState: 'complete' };
  global.party = [{ name: 'Hero' }];
  global.player = global.party[0];
  global.entities = [
    { name: 'Queen Seraphine Corrin', reputation: { standing: 0 } },
    { name: 'Court Wizard Thessaly', reputation: { standing: 0 } },
    { name: 'High Cleric Adelram', reputation: { standing: 0 } },
    { name: 'Guildmaster Petra Voss', reputation: { standing: 0 } },
    { name: 'Captain Ilsa Rennick', reputation: { standing: 0 } },
  ];
  global.questLog = [];
  if (hunt) global.questLog.push({ id: 'necromancer_hunt', status: 'completed' });
  if (lich) {
    global.questLog.push({ id: 'necromancer_lichdom', status: 'completed', resolution: lich });
    if (lich === 'allied') {
      global.playerIsLich = true;
      global.necromancerAllied = true;
    }
  }
  if (reyna) global.questLog.push({ id: 'reyna_empty_blind', status: 'completed', resolution: reyna });
  if (wren) global.questLog.push({ id: 'wren_price_of_silence', status: 'completed', resolution: wren });
  if (aldric) global.questLog.push({ id: 'aldric_broken_vigil', status: 'completed', resolution: aldric });
  global.vampireLeadConfirmed = vampire;
  global.phylacteryReturned = phylacteryReturned;
  global.ironbondArc = { crownInfiltrationRevealed: infiltration };
  global.petraIronbondFactor = { factorStance: () => petraStance };

  global.showDialogue = () => {};
  global.npcDialogueTrees = {
    silverhart_queen: npc => global.showDialogue(npc, 'Queen', [{ label: 'Leave.', action: () => {} }]),
    royal_wizard: npc => global.showDialogue(npc, 'Wizard', [{ label: 'Leave.', action: () => {} }]),
    high_cleric: npc => global.showDialogue(npc, 'Cleric', [{ label: 'Leave.', action: () => {} }]),
    reddale_guildmaster: npc => global.showDialogue(npc, 'Petra', [{ label: 'Leave.', action: () => {} }]),
    reddale_captain: npc => global.showDialogue(npc, 'Ilsa', [{ label: 'Leave.', action: () => {} }]),
  };

  const relationships = require('../persistentCharacterRelationships.js');
  const system = require('../persistentCharacterCrossReactivity.js');
  return { system, relationships };
}

test('audit preserves already-authored links and identifies the two missing network circles', () => {
  const { system } = fresh({ phylacteryReturned: true, infiltration: true });
  const audit = system.networkAudit();
  assert.deepEqual(audit.alreadyIntegrated, [
    'aelwen-seraphine-nessa',
    'balrik-thrain',
    'thessaly-mirabel',
    'adelram-alden',
    'ilsa-reyna',
  ]);
  assert.equal(audit.silverhartCourtActive, true);
  assert.equal(audit.reddaleInstitutionActive, true);
  assert.equal(audit.crownIronbondActive, true);
});

test('Seraphine deliberately splits phylactery custody across Crown, Cathedral and wizard', () => {
  const { system } = fresh({ phylacteryReturned: true });
  const text = system.seraphineCourtText();
  assert.match(text, /Crown inventory/);
  assert.match(text, /Cathedral witness/);
  assert.match(text, /wizardly containment record/);
  assert.match(text, /stops asking questions/);
});

test('Thessaly and Adelram disagree productively rather than becoming magic-vs-religion caricatures', () => {
  const { system } = fresh({ phylacteryReturned: true });
  const thessaly = system.thessalyAdelramText();
  const adelram = system.adelramThessalyText();
  assert.match(thessaly, /different failure modes/);
  assert.match(thessaly, /preservation quietly becomes permission/);
  assert.match(adelram, /ignorance for containment/);
  assert.match(adelram, /understanding never becomes entitlement/);
});

test('Ashgrave alliance makes the court network converge on the study-versus-use distinction', () => {
  const { system } = fresh({ lich: 'allied' });
  assert.match(system.seraphineCourtText(), /fascination becoming policy/);
  assert.match(system.thessalyAdelramText(), /appetite learning to call itself study/);
  assert.match(system.adelramThessalyText(), /Keeping a record of Ashgrave’s path is not walking it/);
});

test('Seraphine gives Ilsa the investigation while keeping Petra useful without absolving her', () => {
  const { system } = fresh({ infiltration: true, petraStance: 'internal_reformer' });
  const text = system.seraphineIronbondText();
  assert.match(text, /Ilsa gets the criminal investigation/);
  assert.match(text, /Petra keeps the factorhouse operating/);
  assert.match(text, /usefulness is not absolution/);
  assert.match(text, /guilty exposed without making the innocent pay/);
});

test('a defensive Petra triggers independent access rather than trusting Ironbond to investigate itself', () => {
  const { system } = fresh({ infiltration: true, petraStance: 'company_defensive' });
  const text = system.seraphineIronbondText();
  assert.match(text, /Ilsa gets independent access/);
  assert.match(text, /Ironbond does not investigate Ironbond/);
});

test('Petra and Ilsa can agree that witness status is not absolution', () => {
  const { system } = fresh({ reyna: 'witness_deal' });
  assert.match(system.petraIlsaText(), /Protection did not make them innocent/);
  assert.match(system.petraIlsaText(), /witness, employee and culprit are not synonyms/);

  const protectedPetra = fresh({ wren: 'protect_petra' }).system.ilsaPetraText();
  assert.match(protectedPetra, /Protected witness does not mean innocent witness/);
  assert.match(protectedPetra, /keeping her alive and talking mattered more/);
});

test('off-books tracker outcomes reinforce Petra and Ilsa institutional concerns', () => {
  const { system } = fresh({ reyna: 'double_agent' });
  const text = system.petraIlsaText();
  assert.match(text, /Off-books arrangements/);
  assert.match(text, /plausible deniability/);
});

test('cross-character dialogue options appear only when their shared context exists', () => {
  const inactive = fresh().system;
  assert.equal(inactive.decorateThessaly({ name: 'Court Wizard Thessaly' }, []).length, 0);
  assert.equal(inactive.decoratePetra({ name: 'Guildmaster Petra Voss' }, []).length, 0);

  const active = fresh({ hunt: true, aldric: 'public_accountability' }).system;
  assert.ok(active.decorateThessaly({ name: 'Court Wizard Thessaly' }, []).some(o => /Adelram/.test(o.label)));
  assert.ok(active.decorateAdelram({ name: 'High Cleric Adelram' }, []).some(o => /Thessaly/.test(o.label)));
  assert.ok(active.decoratePetra({ name: 'Guildmaster Petra Voss' }, []).some(o => /Rennick/.test(o.label)));
  assert.ok(active.decorateIlsa({ name: 'Captain Ilsa Rennick' }, []).some(o => /Petra/.test(o.label)));
});

test('cross-character conversations remain friendship-only and are idempotent', () => {
  const { system, relationships } = fresh({ hunt: true });
  let captured = null;
  global.showDialogue = (_npc, _text, options) => { captured = options; };
  const npc = global.entities.find(e => e.name === 'Court Wizard Thessaly');
  global.npcDialogueTrees.royal_wizard(npc);
  const option = captured.find(o => /Adelram/.test(o.label));
  assert.ok(option);
  option.action();
  const once = relationships.getRelationship('Court Wizard Thessaly');
  option.action();
  const twice = relationships.getRelationship('Court Wizard Thessaly');
  assert.deepEqual(twice, once);
  assert.equal(twice.romanticBond, 0);
  assert.equal(twice.attraction, 0);
});
