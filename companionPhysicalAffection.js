// companionPhysicalAffection.js
// Optional, state-aware physical affection for the six core companions.
//
// This is presentation, not a new relationship meter. Every gesture is offered
// rather than assumed, uses the existing friendship/romance/attraction/consent
// state, and never awards affinity merely for clicking an affection option.
(function (root) {
'use strict';

const BUILD = '20261001-companion-physical-affection-v1';
const DAY = 86400;
const TOPIC_ID = 'physical_affection';
const CORE_NAMES = Object.freeze([
  'Wren Talbot', 'Ser Aldric Thorne', 'Mirabel Quill',
  'Fenn Oakheart', 'Reyna Fletcher', 'Brother Alden',
]);

const RESPONSES = Object.freeze({
  'Wren Talbot': Object.freeze({
    hugFriend: [
      'Wren blinks, then steps into the hug with a quiet little laugh. “All right. But if you tell anyone I enjoy sincere affection, I’ll deny it.”',
      'Wren accepts the hug and squeezes once, firmly. “Yeah. That was actually nice. Don’t get unbearable about it.”',
    ],
    hugRomantic: [
      'Wren folds her arms around you and rests there for a moment longer than either of you needs to. “This bit I’m good with,” she murmurs.',
      'Wren smiles and leans into you. “No test. No hidden question. Just a hug. I’m learning.”',
    ],
    hand: [
      'Wren looks at your offered hand, then threads her fingers through yours. “Very dramatic,” she says, making no effort to let go.',
      'Wren takes your hand and gives it a small squeeze. “I like being asked. Even when the answer is obviously yes.”',
    ],
    kiss: [
      'Wren searches your face for a beat, then nods. The kiss is gentle and unhurried; when she pulls back she smiles. “Yes. That kind of yes.”',
      '“Come here, then,” Wren says softly. She meets you halfway, and afterwards keeps her forehead against yours for a moment.',
    ],
    campClose: [
      'Wren settles against your shoulder beneath the shared blanket. “If I steal all of this in my sleep, wake me. Or accept defeat.”',
      'Wren shifts close enough to share warmth and smiles into the dark. “Much better. The weather has accidentally made a good decision.”',
    ],
  }),
  'Ser Aldric Thorne': Object.freeze({
    hugFriend: [
      'Aldric hesitates only long enough to understand the offer, then embraces you warmly. “I am discovering that not every form of support requires words.”',
      'Aldric returns the hug with careful strength. “Thank you. I did not realise how much I needed something uncomplicated.”',
    ],
    hugRomantic: [
      'Aldric draws you close, armour and solemnity both temporarily irrelevant. “This,” he says quietly, “I could become accustomed to.”',
      'Aldric smiles as he holds you. “I have spent years practising how to stand alone. I am glad that skill is not always required.”',
    ],
    hand: [
      'Aldric looks at your offered hand with surprising tenderness before taking it. “No vow required?” he asks. “Good. I prefer this because we want to.”',
      'Aldric takes your hand, thumb brushing once across your knuckles. His smile is small and entirely unguarded.',
    ],
    kiss: [
      'Aldric’s answer is a quiet “Yes.” He kisses you with deliberate tenderness, then exhales as though he had been holding that breath for some time.',
      'Aldric nods, meets you halfway, and afterwards looks faintly astonished by how happy he is. “I believe that answered the question.”',
    ],
    campClose: [
      'Aldric settles beside you under the blankets, close without crowding. “Wake me if you need space,” he murmurs. “Or if you need less of it.”',
      'Aldric lets his shoulder rest against yours as the camp goes quiet. For once he does not volunteer for another task.',
    ],
  }),
  'Mirabel Quill': Object.freeze({
    hugFriend: [
      'Mirabel accepts the hug with amused surprise. “Oh. We’re doing actual affection instead of discussing it abstractly. Efficient. I approve.”',
      'Mirabel hugs you back and then studies you. “Interesting. Considerably better than several magical substitutes I could name.”',
    ],
    hugRomantic: [
      'Mirabel slips her arms around you readily. “There. An experiment with an excellent replication rate.”',
      'Mirabel leans into the embrace and sighs. “I travel light, apparently, except for the people I keep deciding to carry with me.”',
    ],
    hand: [
      'Mirabel looks at your hand, smiles, and takes it. “You realise this is how one acquires sentimental habits.” She sounds pleased by the prospect.',
      'Mirabel laces her fingers with yours. “I could make a scholarly argument for this. I am heroically choosing not to.”',
    ],
    kiss: [
      'Mirabel’s smile answers before she does. “Yes.” She kisses you, then adds, “For methodological rigour, I may eventually require replication.”',
      '“That depends,” Mirabel says, eyes bright. “Are you asking?” When you confirm, she closes the distance herself.',
    ],
    campClose: [
      'Mirabel tucks herself against you under the shared warmth. “Excellent. We have improved the local thermal environment through applied scholarship.”',
      'Mirabel settles close with a book she absolutely does not intend to finish. Within minutes her head is resting against you instead.',
    ],
  }),
  'Fenn Oakheart': Object.freeze({
    hugFriend: [
      'Fenn smiles and opens his arms. The hug is warm, easy and entirely without ceremony. “See? Humans did invent at least one sensible social custom.”',
      'Fenn returns the hug with an easy squeeze. “Good. You looked like you were carrying more than the pack.”',
    ],
    hugRomantic: [
      'Fenn pulls you close and rests his cheek briefly against your hair. “I like affection that doesn’t need defending in court.”',
      'Fenn’s embrace is warm and relaxed. “Stay there a moment. Nothing urgent is improved by us stopping early.”',
    ],
    hand: [
      'Fenn takes your hand without hesitation. “Nice thing about hands,” he says. “Useful for axes, seedlings, and this.”',
      'Fenn curls his fingers around yours and smiles. “No ownership implied. Just company.”',
    ],
    kiss: [
      'Fenn grins. “Yes, I’d like that.” The kiss is warm and uncomplicated, and he looks pleased that the question was asked plainly.',
      '“Gladly,” Fenn says, meeting you halfway. Afterwards he adds, “Still a fan of clear communication.”',
    ],
    campClose: [
      'Fenn settles close beneath the blankets, radiating warmth. “There. Much more sensible than both of us pretending the cold is character-building.”',
      'Fenn makes room beside him and draws the blanket over both of you. “Shared resources,” he says solemnly. “Very druidic.”',
    ],
  }),
  'Reyna Fletcher': Object.freeze({
    hugFriend: [
      'Reyna gives you a suspicious look, then steps into the hug. “Fine. This information remains operationally restricted.” Her arms tighten briefly before she lets go.',
      'Reyna returns the hug with surprising fierceness. “All right. That was useful. Never quote me saying that.”',
    ],
    hugRomantic: [
      'Reyna wraps her arms around you and visibly lets some tension leave her shoulders. “Good,” she says into your shoulder. “No tactical purpose whatsoever.”',
      'Reyna accepts the embrace and stays there. “I can watch the exits later.” For her, this is practically poetry.',
    ],
    hand: [
      'Reyna glances at your offered hand, then takes it. “You ask. I answer. See how easy civilisation can be?”',
      'Reyna threads her fingers through yours. “If something attacks us, I’m blaming you for occupying my good hand.” She does not release it.',
    ],
    kiss: [
      'Reyna’s mouth quirks. “Yes.” She kisses you decisively, then adds, “Much better than meaningful staring.”',
      '“You asked. I appreciate that.” Reyna closes the remaining distance and kisses you, one hand briefly at your jaw.',
    ],
    campClose: [
      'Reyna settles close enough to share warmth while keeping her bow within reach. “You, blankets, clear exit. Excellent arrangement.”',
      'Reyna shifts beside you under the blanket. “If I wake first, I’m not moving just to preserve your dignity.”',
    ],
  }),
  'Brother Alden': Object.freeze({
    hugFriend: [
      'Alden smiles and accepts the hug, resting his hands lightly at your back. “Affection is simpler when nobody insists it must be evidence of something else.”',
      'Alden embraces you warmly. “Thank you. Physical comfort and sexual desire are not the same language, despite how often people confuse them.”',
    ],
    hugRomantic: [
      'Alden folds you into a quiet embrace and stays there, entirely at ease. “This kind of closeness matters very much to me.”',
      'Alden rests against you for a moment. “Nothing missing,” he says softly. “Just this, exactly as it is.”',
    ],
    hand: [
      'Alden takes your offered hand with a warm smile. “I like this. It asks nothing beyond what it is.”',
      'Alden’s fingers settle comfortably around yours. “Attachment without possession,” he says. “Still one of my favourite discoveries.”',
    ],
    kiss: [
      'Alden considers the question, then smiles. “Yes. Affectionate, not sexual. I would like that.” The kiss is soft and unhurried.',
      '“Yes,” Alden says simply. He kisses you gently, then rests his forehead against yours. “That is a kind of closeness I enjoy.”',
    ],
    campClose: [
      'Alden settles close beneath the blanket after asking whether you are comfortable. “Warmth, affection, sleep. None needs to imply more than itself.”',
      'Alden rests beside you, shoulder touching yours. “This is intimate to me,” he says quietly. “Not because it is sexual. Because it is trusted.”',
    ],
  }),
});

function party() { return Array.isArray(root.party) ? root.party : []; }
function protagonist() { return party()[0] || null; }
function canonical(x) {
  const name = typeof x === 'string' ? x : x?.name;
  return name ? party().find((m, i) => i > 0 && m?.name === name) || null : null;
}
function entityFor(x) {
  const name = typeof x === 'string' ? x : x?.name;
  return (root.entities || []).find(e => e?.alive && e.side === 'player' && e.name === name) || x || null;
}
function relationship(companion) { return root.getCompanionRelationship?.(companion) || companion?.playerRelationship || {}; }
function affinity(companion) { return root.getCompanionAffinity?.(companion) || companion?.playerAffinity || {}; }
function romanceState(companion) { return root.getCompanionRomanceState?.(companion) || root.companionRomance?.getRelationshipState?.(companion) || null; }
function band(companion) { return root.companionRelationshipMoments?.relationshipBand?.(companion) || 'early'; }
function firstName(name) {
  const bits = String(name || '').split(/\s+/).filter(Boolean);
  return bits[0] === 'Ser' ? (bits[1] || name) : (bits[0] || name || 'them');
}
function camp() { return root.campSystem?.getCamp?.() || null; }
function campContext(companion) { return root.companionRelationshipMoments?.campContext?.(companion, camp()) || null; }
function isMoving(x) {
  const e = entityFor(x);
  return !!e?.destination || !!e?.path?.length || !!e?.isMoving;
}
function canPauseTogether(companion) {
  if (!companion || root.isInCombat) return false;
  if (camp()) return true;
  return !isMoving(protagonist()) && !isMoving(companion);
}
function friendlyTouchAllowed(companion) {
  const rel = relationship(companion), aff = affinity(companion), b = band(companion);
  if (b === 'strained' || b === 'early') return false;
  return Number(aff.friendship || 0) >= 55 && Number(rel.trust || 0) >= 25;
}
function romanticTouchAllowed(companion) {
  const b = band(companion);
  return ['romantic', 'committed', 'casual'].includes(b);
}
function kissAllowed(companion) {
  const state = romanceState(companion) || {};
  const aff = state.affinity || affinity(companion);
  const agreement = state.agreement || aff.agreement || {};
  const mode = state.interpretation?.mode || root.companionRomance?.interpretRelationship?.(companion)?.mode || 'early';
  const b = band(companion);
  if (!['romantic', 'committed', 'casual'].includes(b)) return false;
  if (agreement.state === 'strained' || String(aff.romanceState || '').startsWith('strained')) return false;
  if (companion.name === 'Wren Talbot' && mode === 'love_desire_conflict') {
    return agreement.state === 'committed' && aff.physicalBoundary === 'mutual_slow';
  }
  if (companion.name === 'Brother Alden') {
    return agreement.state === 'dating' || agreement.state === 'committed' || mode === 'asexual_romance';
  }
  if (b === 'casual') return Number(aff.attraction || 0) >= 50;
  return agreement.state === 'dating' || agreement.state === 'committed'
    || Number(aff.romanticBond || 0) >= 55;
}
function physicalMemory(companion) {
  const player = protagonist();
  if (!player || !companion) return { counts:{} };
  player.companionPhysicalAffectionMemory ||= {};
  const existing = player.companionPhysicalAffectionMemory[companion.name] || {};
  return player.companionPhysicalAffectionMemory[companion.name] = {
    counts: existing.counts && typeof existing.counts === 'object' ? existing.counts : {},
    lastAt: Number(existing.lastAt || 0),
    lastGesture: existing.lastGesture || null,
  };
}
function pick(companion, key) {
  const rows = RESPONSES[companion.name]?.[key] || [];
  if (!rows.length) return null;
  const memory = physicalMemory(companion);
  const n = Number(memory.counts[key] || 0);
  return rows[n % rows.length];
}
function recordGesture(companion, key) {
  const m = physicalMemory(companion);
  m.counts[key] = Number(m.counts[key] || 0) + 1;
  m.lastAt = Number(root.worldSeconds || 0);
  m.lastGesture = key;
}
function showGesture(companion, key) {
  const text = pick(companion, key);
  if (!text) return false;
  recordGesture(companion, key);
  const back = () => root.companionConversationMemory?.openHub?.(companion);
  root.showDialogue?.(companion, text, [
    { label: 'Stay together a moment.', action: () => {} },
    { label: 'Talk about something else.', action: back },
  ]);
  return true;
}
function gestureOptions(companion) {
  const options = [];
  const ctx = campContext(companion);
  const name = firstName(companion.name);
  if (friendlyTouchAllowed(companion)) {
    options.push({ label: `Offer ${name} a hug.`, action: () => showGesture(companion, romanticTouchAllowed(companion) ? 'hugRomantic' : 'hugFriend') });
  }
  if (romanticTouchAllowed(companion)) {
    options.push({ label: `Offer ${name} your hand.`, action: () => showGesture(companion, 'hand') });
  }
  if (kissAllowed(companion)) {
    options.push({ label: `Ask ${name} if they want a kiss.`, action: () => showGesture(companion, 'kiss') });
  }
  if (ctx && (ctx.sameTent || ctx.cold) && (friendlyTouchAllowed(companion) || romanticTouchAllowed(companion))) {
    options.push({ label: ctx.cold ? `Offer to share warmth with ${name}.` : `Settle close to ${name} before sleep.`, action: () => showGesture(companion, 'campClose') });
  }
  return options;
}
function topicFor(name) {
  return {
    id: TOPIC_ID,
    label: ctx => {
      const companion = ctx?.companion || canonical(name);
      const b = band(companion);
      if (['romantic', 'committed', 'casual'].includes(b)) return `Be close to ${firstName(name)} for a while.`;
      return `Share a little affection with ${firstName(name)}.`;
    },
    priority: ctx => ['committed', 'romantic', 'casual'].includes(band(ctx?.companion)) ? 52 : 32,
    cooldownSeconds: DAY / 6,
    condition: ctx => {
      const companion = ctx?.companion || canonical(name);
      return canPauseTogether(companion) && gestureOptions(companion).length > 0;
    },
    render: ctx => {
      const companion = ctx?.companion || canonical(name);
      const options = gestureOptions(companion);
      if (!options.length) return {};
      const b = band(companion);
      const prompt = b === 'friend'
        ? `${companion.name} seems content to linger with you for a while.`
        : `${companion.name} stays close, leaving the next gesture to be something you choose together.`;
      return { subject:'physical affection', text:prompt, options };
    },
  };
}
function install() {
  const memory = root.companionConversationMemory;
  if (!memory?.registerTopics) return false;
  for (const name of CORE_NAMES) memory.registerTopics(name, [topicFor(name)]);
  root.companionPhysicalAffection = api;
  return true;
}

const api = {
  build: BUILD,
  responses: RESPONSES,
  canPauseTogether,
  friendlyTouchAllowed,
  romanticTouchAllowed,
  kissAllowed,
  gestureOptions,
  showGesture,
  install,
};
root.companionPhysicalAffection = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

install();
if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', install, { once:true });
if (root.document && typeof root.setInterval === 'function') root.setInterval(install, 1000);
})(typeof window !== 'undefined' ? window : globalThis);
