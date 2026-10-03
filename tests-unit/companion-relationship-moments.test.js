const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../companionRelationshipMoments.js');

function boot(overrides = {}) {
  delete require.cache[require.resolve(modulePath)];
  global.window = global;
  global.document = undefined;
  global.entities = [];
  global.messages = [];
  global.worldSeconds = 1000;
  global.isInCombat = false;
  global.updatePartyTabs = () => { global.tabUpdates = (global.tabUpdates || 0) + 1; };
  global.showMessage = text => messages.push(text);
  global.showDialogue = () => {};
  global.tabUpdates = 0;
  global.npcDialogueTrees = {
    companion_wren_talbot() {},
    companion_ser_aldric() {},
  };
  global._registered = new Map();
  global._installedEntries = [];
  global.companionConversationMemory = {
    registerTopics(name, topics) { global._registered.set(name, topics); return true; },
    installDialogueEntry(id, name) { global._installedEntries.push({ id, name }); return true; },
  };
  global.getCompanionRelationship = companion => companion._relationship || { trust: 60, familiarity: 60 };
  global.getCompanionAffinity = companion => companion.playerAffinity || {};
  global.getCompanionRomanceState = companion => companion._romanceState || null;
  global.companionRomance = {
    interpretRelationship: companion => companion._romanceState?.interpretation || null,
    getRelationshipState: companion => companion._romanceState || null,
  };
  global.campSystem = { getCamp: () => null };
  const names = ['Wren Talbot','Ser Aldric Thorne','Mirabel Quill','Fenn Oakheart','Reyna Fletcher','Brother Alden'];
  global.party = [{ name: 'Hero' }, ...names.map(name => ({
    name,
    playerAffinity: { friendship: 20, romanticBond: 0, attraction: 0 },
    _relationship: { trust: 50, familiarity: 50 },
    _romanceState: {
      affinity: { friendship: 20, romanticBond: 0, attraction: 0 },
      agreement: { state: 'none' },
      interpretation: { mode: 'early' },
    },
  }))];
  Object.assign(global, overrides);
  return require(modulePath);
}

function companion(name) { return global.party.find(x => x.name === name); }
function setState(name, { mode='early', agreement='none', friendship=20, romanticBond=0, attraction=0, trust=60 } = {}) {
  const c = companion(name);
  c.playerAffinity = { friendship, romanticBond, attraction };
  c._relationship = { trust, familiarity: 70 };
  c._romanceState = {
    affinity: c.playerAffinity,
    agreement: { state: agreement },
    interpretation: { mode },
  };
  return c;
}

test('authors relationship material for all six core companions', () => {
  const api = boot();
  assert.deepEqual(Object.keys(api.pools).sort(), ['Brother Alden','Fenn Oakheart','Mirabel Quill','Reyna Fletcher','Ser Aldric Thorne','Wren Talbot'].sort());
  for (const [name, pools] of Object.entries(api.pools)) {
    assert.ok(pools.early.length >= 4, `${name} early`);
    assert.ok(pools.friend.length >= 4, `${name} friend`);
    assert.ok(pools.romantic.length >= 4, `${name} romantic`);
    assert.ok(pools.committed.length >= 4, `${name} committed`);
    assert.ok(pools.campFriend.length >= 3, `${name} camp friend`);
    assert.ok(pools.campRomantic.length >= 3, `${name} camp romance`);
  }
});

test('relationship band follows established agreement before raw chemistry', () => {
  const api = boot();
  setState('Mirabel Quill', { mode:'attracted', attraction:80 });
  assert.equal(api.relationshipBand('Mirabel Quill'), 'attracted');
  setState('Mirabel Quill', { mode:'romantic', friendship:70, romanticBond:70, attraction:80 });
  assert.equal(api.relationshipBand('Mirabel Quill'), 'romantic');
  setState('Mirabel Quill', { mode:'attracted', agreement:'committed', attraction:80 });
  assert.equal(api.relationshipBand('Mirabel Quill'), 'committed');
  setState('Mirabel Quill', { mode:'romantic', agreement:'strained', romanticBond:80 });
  assert.equal(api.relationshipBand('Mirabel Quill'), 'strained');
});

test('Alden can have a full romantic relationship without sexual attraction', () => {
  const api = boot();
  setState('Brother Alden', { mode:'asexual_romance', friendship:80, romanticBond:75, attraction:0 });
  assert.equal(api.relationshipBand('Brother Alden'), 'romantic');
  const moment = api.chooseMoment('Brother Alden', 0);
  assert.match(moment.text, /love|closeness|attachment|intimacy/i);
  assert.doesNotMatch(moment.text, /kiss|sex with|sleep with|lust/i);
});

test('relationship topics register for everyone without awarding hidden relationship points', () => {
  let affinityAdjusts = 0;
  let relationshipAdjusts = 0;
  const api = boot({
    adjustCompanionAffinity: () => { affinityAdjusts++; },
    adjustCompanionRelationship: () => { relationshipAdjusts++; },
  });
  assert.equal(global._registered.size, 6);
  const topic = global._registered.get('Wren Talbot')[0];
  const rendered = topic.render({ companion: companion('Wren Talbot') }, { uses: 0 });
  assert.ok(rendered.text);
  assert.equal(affinityAdjusts, 0);
  assert.equal(relationshipAdjusts, 0);
  assert.equal(api.pools['Wren Talbot'].attracted.some(line => /permission|allowed to notice|request/i.test(line)), true);
});

test('recruited companions receive accessible companion dialogue roots', () => {
  const api = boot();
  global.entities = global.party.slice(1).map(c => ({ name:c.name, alive:true, side:'player' }));
  api.refresh();
  for (const name of ['Mirabel Quill','Fenn Oakheart','Reyna Fletcher','Brother Alden']) {
    const id = api.dialogueIds[name];
    assert.equal(typeof global.npcDialogueTrees[id], 'function', name);
    assert.equal(companion(name).dialogueId, id, `${name} party id`);
    assert.equal(global.entities.find(e => e.name === name).dialogueId, id, `${name} entity id`);
    assert.ok(global._installedEntries.some(x => x.id === id && x.name === name), `${name} memory hook`);
  }
  assert.equal(typeof global.npcDialogueTrees.companion_wren_talbot, 'function');
  assert.equal(typeof global.npcDialogueTrees.companion_ser_aldric, 'function');
});

test('camp context notices watch, cold and shared shelter without changing relationships', () => {
  const api = boot();
  setState('Wren Talbot', { mode:'romantic', friendship:75, romanticBond:70, attraction:20 });
  const wren = companion('Wren Talbot');
  wren.onGuard = true;
  const camp = {
    startedAt: 4321,
    temperature: 2,
    members: [global.party[0], wren],
    tents: [{ occupants:[global.party[0], wren] }],
    bedrolls: [global.party[0], wren],
    outside: [],
  };
  const ctx = api.campContext('Wren Talbot', camp);
  assert.equal(ctx.sameTent, true);
  assert.equal(ctx.onGuard, true);
  assert.equal(ctx.cold, true);
  const moment = api.chooseMoment('Wren Talbot', 0, { camp, token:'test' });
  assert.ok(api.pools['Wren Talbot'].campWatch.includes(moment.text));
});

test('automatic camp vignette fires at most once for the same camp', () => {
  const api = boot();
  setState('Reyna Fletcher', { mode:'romantic', friendship:80, romanticBond:75, attraction:70, trust:85 });
  const reyna = companion('Reyna Fletcher');
  const camp = {
    startedAt: 9000,
    temperature: 15,
    members: [global.party[0], reyna],
    tents: [{ occupants:[global.party[0], reyna] }],
    bedrolls: [global.party[0], reyna],
    outside: [],
  };
  assert.equal(api.handleCamp(camp), true);
  assert.equal(api.handleCamp(camp), false);
  assert.equal(global.messages.length, 1);
  assert.match(global.messages[0], /Reyna Fletcher:/);
  assert.equal(global.party[0].companionRelationshipMomentMemory.lastCampStartedAt, 9000);
});
