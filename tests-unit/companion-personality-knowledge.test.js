const test = require('node:test');
const assert = require('node:assert/strict');

const knowledgePath = require.resolve('../companionPersonalityKnowledge.js');
const memoryPath = require.resolve('../companionConversationMemory.js');

function freshSystem({ history = [], legacyKnowledge = null } = {}) {
  delete require.cache[knowledgePath];
  delete require.cache[memoryPath];

  global.window = global;
  global.document = undefined;
  global.worldSeconds = 1000;
  global.gameTime = 1000;
  global.questLog = [];
  global.npcDialogueTrees = {};
  global.companionAttitude = {};

  for (const key of [
    'companionPersonalityKnowledge', 'learnCompanionPersonality',
    'getCompanionPersonalityKnowledge', 'COMPANION_PERSONALITY_KNOWLEDGE_BUILD',
    'companionConversationMemory', 'COMPANION_CONVERSATION_MEMORY_BUILD'
  ]) delete global[key];

  const hero = { name: 'Hero' };
  const wren = {
    name: 'Wren Talbot',
    playerAffinity: { friendship: 14 },
    playerRelationship: {
      familiarity: 23,
      trust: 31,
      history: [],
      knownConversationKeys: [],
      conversationMemory: {
        version: 3,
        topics: {},
        history: history.map(entry => ({ ...entry })),
        lastMeaningful: null
      }
    }
  };
  if (legacyKnowledge) wren.companionPersonalityKnowledge = legacyKnowledge;

  global.party = [hero, wren];
  // Deliberately control Wren: player knowledge must still belong to party[0].
  global.player = wren;
  global.entities = [];
  global.getCompanionRelationship = companion => companion.playerRelationship;
  global.getCompanionAffinity = companion => companion.playerAffinity;

  const dialogueCalls = [];
  global.showDialogue = (speaker, text, options) => dialogueCalls.push({ speaker, text, options });

  const knowledge = require(knowledgePath);
  const memory = require(memoryPath);
  return { hero, wren, knowledge, memory, dialogueCalls };
}

function registerWrenMercyTopic(memory, maxUses = 3) {
  memory.registerTopics('Wren Talbot', [{
    id: 'values_mercy_truth',
    label: 'What does mercy mean to you?',
    maxUses,
    cooldownDays: 0,
    render: (_ctx, state) => ({
      subject: 'mercy and responsibility',
      text: `Mercy conversation ${Number(state.uses || 0) + 1}.`,
      variantIndex: Number(state.uses || 0)
    })
  }]);
}

test('mapped value conversations immediately become player-known personality clues', () => {
  const { hero, wren, knowledge, memory } = freshSystem();
  registerWrenMercyTopic(memory);

  assert.equal(memory.playTopic('Wren Talbot', 'values_mercy_truth'), true);

  assert.equal(knowledge.get('Wren Talbot', 'mercy').level, 1);
  assert.match(knowledge.get('Wren Talbot', 'mercy').text, /frightened or trapped people/i);
  assert.equal(hero.companionPersonalityKnowledge['Wren Talbot'].mercy.level, 1);
  assert.equal(wren.companionPersonalityKnowledge, undefined);

  // Conversation memory changes, but ordinary talking does not hand out
  // relationship or affinity points.
  assert.equal(wren.playerRelationship.familiarity, 23);
  assert.equal(wren.playerRelationship.trust, 31);
  assert.equal(wren.playerAffinity.friendship, 14);
});

test('revisiting an authored value subject deepens the clue instead of exposing hidden scores', () => {
  const { knowledge, memory } = freshSystem();
  registerWrenMercyTopic(memory, 3);

  assert.equal(memory.playTopic('Wren Talbot', 'values_mercy_truth'), true);
  assert.equal(memory.playTopic('Wren Talbot', 'values_mercy_truth'), true);
  assert.equal(memory.playTopic('Wren Talbot', 'values_mercy_truth'), true);
  assert.equal(memory.playTopic('Wren Talbot', 'values_mercy_truth'), false);

  const mercy = knowledge.get('Wren Talbot', 'mercy');
  assert.equal(mercy.level, 3);
  assert.match(mercy.text, /gratuitous cruelty/i);
});

test('conversation hub can review learned clues even when there is nothing new to ask', () => {
  const { memory, dialogueCalls } = freshSystem();
  registerWrenMercyTopic(memory, 1);
  memory.playTopic('Wren Talbot', 'values_mercy_truth');

  dialogueCalls.length = 0;
  assert.equal(memory.openHub('Wren Talbot'), true);
  const hub = dialogueCalls.at(-1);
  assert.match(hub.text, /nothing new to ask/i);
  const review = hub.options.find(option => /Review what you’ve learned/.test(option.label));
  assert.ok(review, 'learned-clue review option should remain available');

  review.action();
  const notes = dialogueCalls.at(-1);
  assert.equal(notes.speaker.name, 'Your notes — Wren Talbot');
  assert.match(notes.text, /Wren is softer on frightened or trapped people/i);
  assert.doesNotMatch(notes.text, /expect obedience just because of rank/i);
  assert.doesNotMatch(notes.text, /approval|friendship|trust score/i);
});

test('old conversation history backfills clues and early split knowledge migrates to the lead character', () => {
  const { hero, knowledge } = freshSystem({
    history: [
      { topicId: 'values_mercy_truth', at: 100, use: 1 },
      { topicId: 'values_mercy_truth', at: 200, use: 2 }
    ],
    legacyKnowledge: {
      'Wren Talbot': {
        attachment: { level: 2, source: 'legacy', learnedAt: 500 }
      }
    }
  });

  const known = knowledge.known('Wren Talbot');
  assert.equal(known.find(item => item.trait === 'mercy').level, 2);
  assert.equal(known.find(item => item.trait === 'attachment').level, 2);
  assert.equal(hero.companionPersonalityKnowledge['Wren Talbot'].mercy.level, 2);
  assert.equal(hero.companionPersonalityKnowledge['Wren Talbot'].attachment.level, 2);
});
