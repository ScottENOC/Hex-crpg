const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../companionEvergreenPersonalityClues.js');
const WREN = 'Wren Talbot';
const ALDRIC = 'Ser Aldric Thorne';
const MIRABEL = 'Mirabel Quill';
const FENN = 'Fenn Oakheart';
const REYNA = 'Reyna Fletcher';
const ALDEN = 'Brother Alden';

function member(name) {
    return { name, playerRelationship: { conversationMemory: { topics: {} } } };
}

function fresh({ existingEvergreen = false, existingOtherEvergreen = false } = {}) {
    delete require.cache[modulePath];
    global.window = global;
    global.document = undefined;
    global.questLog = [];
    global.party = [{ name: 'Hero' }, member(WREN), member(ALDRIC), member(MIRABEL), member(FENN), member(REYNA), member(ALDEN)];

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

    if (existingOtherEvergreen) {
        const mirabelTopic = { id: 'lich_response', render: () => ({ text: 'old', variantIndex: 0 }) };
        global.otherCompanionEvergreenDialogue = {
            mirabelTopics: [mirabelTopic], fennTopics: [], reynaTopics: [], aldenTopics: []
        };
        global.companionConversationMemory.registerTopics(MIRABEL, [mirabelTopic]);
    } else {
        delete global.otherCompanionEvergreenDialogue;
    }

    const api = require(modulePath);
    return { api, registered, levels };
}

function clues(result) { return result.personalityClues || []; }
function partyMember(name) { return global.party.find(x => x.name === name); }

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

test('existing dialogue exposes new traits for Mirabel, Fenn, Reyna and Alden', () => {
    const { registered } = fresh();
    global.questLog = [
        { id: 'mirabel_unquiet_concordance', resolution: 'experiment' },
        { id: 'fenn_living_boundary', resolution: 'managed_spillway' },
        { id: 'alden_uncounted', resolution: 'restore_names' }
    ];

    const specs = [
        [MIRABEL, { id: 'concordance_aftermath', render: () => ({ text: 'line', variantIndex: 0 }) }, [{ trait: 'responsibility', amount: 3 }]],
        [FENN, { id: 'boundary_aftermath', render: () => ({ text: 'line', variantIndex: 0 }) }, [{ trait: 'stewardship', amount: 1 }, { trait: 'reciprocity', amount: 2 }]],
        [REYNA, { id: 'northwatch', render: () => ({ text: 'line', variantIndex: 0 }) }, [{ trait: 'interdependence', amount: 1 }]],
        [ALDEN, { id: 'death_and_necromancy', render: () => ({ text: 'line', variantIndex: 2 }) }, [{ trait: 'impermanence', amount: 1 }]],
    ];

    for (const [name, topic, expected] of specs) {
        global.companionConversationMemory.registerTopics(name, [topic]);
        assert.deepEqual(clues(registered.get(name)[0].render({}, { uses: 0 })), expected);
    }
});

test('ordinary evergreen lines also deepen existing discoverable traits', () => {
    const { registered } = fresh();
    global.questLog = [{ id: 'alden_uncounted', resolution: 'restore_names' }];
    const specs = [
        [MIRABEL, { id: 'road_smalltalk', render: () => ({ text: 'line', variantIndex: 4 }) }, [{ trait: 'roots', amount: 1 }]],
        [FENN, { id: 'nessa', render: () => ({ text: 'line', variantIndex: 1 }) }, [{ trait: 'independence', amount: 1 }]],
        [REYNA, { id: 'institutions', render: () => ({ text: 'line', variantIndex: 2 }) }, [{ trait: 'justice', amount: 1 }]],
        [ALDEN, { id: 'uncounted_aftermath', render: () => ({ text: 'line', variantIndex: 0 }) }, [{ trait: 'dignity', amount: 2 }]],
    ];

    for (const [name, topic, expected] of specs) {
        global.companionConversationMemory.registerTopics(name, [topic]);
        assert.deepEqual(clues(registered.get(name)[0].render({}, { uses: 0 })), expected);
    }
});

test('late installation re-registers both already loaded evergreen modules', () => {
    const { registered } = fresh({ existingEvergreen: true, existingOtherEvergreen: true });
    assert.deepEqual(clues(registered.get(ALDRIC)[0].render({}, { uses: 0 })), [{ trait: 'burden', amount: 1 }]);
    assert.deepEqual(clues(registered.get(MIRABEL)[0].render({}, { uses: 0 })), [{ trait: 'responsibility', amount: 1 }]);
});

test('old conversation state backfills only clues proven by heard variants', () => {
    const { api, levels } = fresh();
    global.questLog = [
        { id: 'wren_crown_quiet_hand', status: 'completed', resolution: 'wren_chose' },
        { id: 'aldric_measure_of_oath', status: 'completed', resolution: 'bounded_service' },
        { id: 'mirabel_unquiet_concordance', status: 'completed', resolution: 'preserve_open' },
        { id: 'fenn_living_boundary', status: 'completed', resolution: 'managed_spillway' },
        { id: 'alden_uncounted', status: 'completed', resolution: 'restore_names' }
    ];
    partyMember(WREN).playerRelationship.conversationMemory.topics = {
        crown_aftermath: { uses: 1 },
        injury_check: { uses: 2 }
    };
    partyMember(ALDRIC).playerRelationship.conversationMemory.topics = {
        shared_burden: { uses: 1 },
        measure_aftermath: { uses: 2 }
    };
    partyMember(MIRABEL).playerRelationship.conversationMemory.topics = {
        concordance_aftermath: { uses: 2 },
        road_smalltalk: { uses: 4 },
        old_stories: { uses: 4 }
    };
    partyMember(FENN).playerRelationship.conversationMemory.topics = {
        boundary_aftermath: { uses: 1 },
        nessa: { uses: 2 },
        aelwen_accord: { uses: 1 }
    };
    partyMember(REYNA).playerRelationship.conversationMemory.topics = {
        empty_blind_aftermath: { uses: 2 },
        northwatch: { uses: 1 },
        institutions: { uses: 2 }
    };
    partyMember(ALDEN).playerRelationship.conversationMemory.topics = {
        uncounted_aftermath: { uses: 2 },
        aldric: { uses: 1 },
        death_and_necromancy: { uses: 1 },
        lich_response: { uses: 1 }
    };

    for (const name of [WREN, ALDRIC, MIRABEL, FENN, REYNA, ALDEN]) api.sync(name);

    assert.equal(levels[`${WREN}:authority`], 3);
    assert.equal(levels[`${WREN}:pragmatism`] || 0, 0, 'two injury uses do not prove variant 2 was heard');
    assert.equal(levels[`${ALDRIC}:burden`], 3);
    assert.equal(levels[`${MIRABEL}:responsibility`], 2);
    assert.equal(levels[`${MIRABEL}:roots`], 1, 'four road uses do not prove Mirabel road variant 4 was heard');
    assert.equal(levels[`${FENN}:stewardship`], 1);
    assert.equal(levels[`${FENN}:independence`], 2);
    assert.equal(levels[`${FENN}:reciprocity`], 3);
    assert.equal(levels[`${REYNA}:justice`], 3);
    assert.equal(levels[`${REYNA}:interdependence`], 2);
    assert.equal(levels[`${ALDEN}:dignity`], 3);
    assert.equal(levels[`${ALDEN}:engagement`], 2);
    assert.equal(levels[`${ALDEN}:impermanence`], 2);
});
