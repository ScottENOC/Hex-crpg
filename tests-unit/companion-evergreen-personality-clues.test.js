const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../companionEvergreenPersonalityClues.js');
const WREN = 'Wren Talbot';
const ALDRIC = 'Ser Aldric Thorne';

function fresh({ existingEvergreen = false } = {}) {
    delete require.cache[modulePath];
    global.window = global;
    global.document = undefined;
    global.questLog = [];
    global.party = [{ name: 'Hero' }, {
        name: WREN,
        playerRelationship: { conversationMemory: { topics: {} } }
    }, {
        name: ALDRIC,
        playerRelationship: { conversationMemory: { topics: {} } }
    }];

    const registered = new Map();
    global.companionConversationMemory = {
        registerTopics(name, topics) {
            registered.set(name, topics.map(topic => ({ ...topic })));
            return true;
        }
    };

    const levels = {};
    global.companionPersonalityKnowledge = {
        get(name, trait) { return { level: Number(levels[`${name}:${trait}`] || 0) }; }
    };
    global.learnCompanionPersonality = (name, trait, amount) => {
        const key = `${name}:${trait}`;
        levels[key] = Math.min(3, Number(levels[key] || 0) + Number(amount || 0));
    };

    if (existingEvergreen) {
        const oldTopic = { id: 'shared_burden', render: () => ({ text: 'old', variantIndex: 0 }) };
        global.wrenAldricEvergreenDialogue = { wrenTopics: [], aldricTopics: [oldTopic] };
        global.companionConversationMemory.registerTopics(ALDRIC, [oldTopic]);
    } else {
        delete global.wrenAldricEvergreenDialogue;
    }

    const api = require(modulePath);
    return { api, registered, levels };
}

function clues(result) { return result.personalityClues || []; }

test('Wren pragmatism only appears on the revealing injury variant', () => {
    const { registered } = fresh();
    const topic = { id: 'injury_check', render: (_ctx, state) => ({ text: 'line', variantIndex: state.uses }) };
    global.companionConversationMemory.registerTopics(WREN, [topic]);
    const tagged = registered.get(WREN)[0];

    assert.deepEqual(clues(tagged.render({}, { uses: 0 })), []);
    assert.deepEqual(clues(tagged.render({}, { uses: 1 })), []);
    assert.deepEqual(clues(tagged.render({}, { uses: 2 })), [{ trait: 'pragmatism', amount: 3 }]);
});

test('Wren Crown aftermath reveals authority and stability choice reveals pragmatism limit', () => {
    const { registered } = fresh();
    global.questLog = [{ id: 'wren_crown_quiet_hand', status: 'completed', resolution: 'buried_for_stability' }];
    const topic = { id: 'crown_aftermath', render: () => ({ text: 'line', variantIndex: 0 }) };
    global.companionConversationMemory.registerTopics(WREN, [topic]);

    assert.deepEqual(clues(registered.get(WREN)[0].render({}, { uses: 0 })), [
        { trait: 'authority', amount: 2 },
        { trait: 'pragmatism', amount: 3 }
    ]);
});

test('Aldric shared-burden conversation advances burden one observation at a time', () => {
    const { registered } = fresh();
    const topic = { id: 'shared_burden', render: (_ctx, state) => ({ text: 'line', variantIndex: state.uses % 3 }) };
    global.companionConversationMemory.registerTopics(ALDRIC, [topic]);
    const tagged = registered.get(ALDRIC)[0];

    assert.deepEqual(clues(tagged.render({}, { uses: 0 })), [{ trait: 'burden', amount: 1 }]);
    assert.deepEqual(clues(tagged.render({}, { uses: 1 })), [{ trait: 'burden', amount: 1 }]);
    assert.deepEqual(clues(tagged.render({}, { uses: 2 })), [{ trait: 'burden', amount: 1 }]);
});

test('late installation re-registers already loaded evergreen topics', () => {
    const { registered } = fresh({ existingEvergreen: true });
    const tagged = registered.get(ALDRIC)[0];
    assert.deepEqual(clues(tagged.render({}, { uses: 0 })), [{ trait: 'burden', amount: 1 }]);
});

test('old conversation state backfills only clues proven by heard variants', () => {
    const { api, levels } = fresh();
    global.questLog = [
        { id: 'wren_crown_quiet_hand', status: 'completed', resolution: 'wren_chose' },
        { id: 'aldric_measure_of_oath', status: 'completed', resolution: 'bounded_service' }
    ];
    global.party[1].playerRelationship.conversationMemory.topics = {
        crown_aftermath: { uses: 1 },
        injury_check: { uses: 2 }
    };
    global.party[2].playerRelationship.conversationMemory.topics = {
        shared_burden: { uses: 1 },
        measure_aftermath: { uses: 2 }
    };

    api.sync(WREN);
    api.sync(ALDRIC);

    assert.equal(levels[`${WREN}:authority`], 3);
    assert.equal(levels[`${WREN}:pragmatism`] || 0, 0, 'two injury uses do not prove variant 2 was heard');
    assert.equal(levels[`${ALDRIC}:burden`], 3);
});
