const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../companionDecisionAnticipation.js');

function makeOption(label, outcome) {
    // Use Function so toString contains the same completeQuest('...') form used
    // by the authored quest resolution arrows.
    const fn = new Function('completeQuest', `return () => completeQuest('${outcome}')`)(() => {});
    return { label, action: fn };
}

function fresh({ known = {}, partyNames = ['Mirabel Quill'] } = {}) {
    delete require.cache[modulePath];
    global.window = global;
    global.document = undefined;
    global.questLog = [];
    global.party = [{ name: 'Hero' }, ...partyNames.map(name => ({ name }))];
    const mutableKnown = JSON.parse(JSON.stringify(known));
    global.companionEvergreenPersonalityClues = { sync() {} };
    global.companionPersonalityKnowledge = {
        known(name) {
            return Object.entries(mutableKnown[name] || {}).map(([trait, spec]) => ({
                trait,
                level: spec.level,
                text: spec.text || `${name} clue about ${trait}.`,
            }));
        },
        get(name, trait) {
            const spec = mutableKnown[name]?.[trait];
            return { level: Number(spec?.level || 0), text: spec?.text || null };
        },
    };
    global.learnCompanionPersonality = (name, trait, amount) => {
        mutableKnown[name] ||= {};
        const prior = Number(mutableKnown[name][trait]?.level || 0);
        mutableKnown[name][trait] = {
            ...(mutableKnown[name][trait] || {}),
            level: Math.min(3, prior + Number(amount || 0)),
            text: mutableKnown[name][trait]?.text || `${name} clue about ${trait}.`,
        };
    };
    const calls = [];
    global.showDialogue = (speaker, message, options = []) => {
        calls.push({ speaker, message, options });
        return true;
    };
    const api = require(modulePath);
    return { api, calls };
}

test('extracts stable authored outcome ids without depending on button wording', () => {
    const { api } = fresh();
    const option = makeOption('This wording can change freely.', 'preserve_sealed');
    assert.equal(api.outcomeId(option), 'preserve_sealed');
});

test('supports explicit outcome metadata for future decision menus', () => {
    const { api } = fresh();
    assert.equal(api.outcomeId({ decisionOutcome: 'bounded_service', action() {} }), 'bounded_service');
});

test('catalog covers every authored companion-quest resolution set', () => {
    const { api } = fresh({ partyNames: [
        'Wren Talbot', 'Ser Aldric Thorne', 'Mirabel Quill', 'Fenn Oakheart', 'Reyna Fletcher', 'Brother Alden'
    ] });
    const expected = {
        wren_crown_quiet_hand: ['public_inquiry','restore_names','wren_decides','bury_for_stability'],
        aldric_measure_of_oath: ['literal_return','bounded_service','formal_release','aldric_decides','walk_away'],
        mirabel_unquiet_concordance: ['preserve_open','preserve_sealed','destroy_appendix','experiment'],
        fenn_living_boundary: ['preserve_marsh','drain_marsh','managed_spillway','compensate_preserve'],
        reyna_empty_blind: ['turn_in','witness_deal','double_agent','let_disappear'],
        alden_uncounted: ['restore_names','quiet_memorial','hunt_missing','rites_over_names'],
    };
    for (const [questId, outcomes] of Object.entries(expected)) {
        assert.deepEqual(Object.keys(api.decisions[questId].choices), outcomes);
    }
});

test('current Wren resolution ids backfill the same clues as legacy draft ids', () => {
    const { api } = fresh({ partyNames: ['Wren Talbot'] });
    global.party[1].playerRelationship = { conversationMemory: { topics: { crown_aftermath: { uses: 1 } } } };
    global.questLog = [{ id: 'wren_crown_quiet_hand', status: 'completed', resolution: 'bury_for_stability' }];
    api.syncCurrentWrenResolution();
    assert.equal(global.companionPersonalityKnowledge.get('Wren Talbot', 'authority').level, 2);
    assert.equal(global.companionPersonalityKnowledge.get('Wren Talbot', 'pragmatism').level, 3);

    global.questLog[0].resolution = 'wren_decides';
    api.syncCurrentWrenResolution();
    assert.equal(global.companionPersonalityKnowledge.get('Wren Talbot', 'authority').level, 3);
});

test('adds one Consider your companions action to recognised major decisions', () => {
    const { api } = fresh();
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const options = [
        makeOption('A', 'preserve_open'),
        makeOption('B', 'preserve_sealed'),
        { label: 'Not yet.', action() {} },
    ];
    const decorated = api.decorateOptions({ name: 'Mirabel Quill' }, 'Decision', options);
    assert.equal(decorated.filter(x => x.__companionDecisionAnticipation).length, 1);
    assert.equal(decorated.at(-2).label, 'Consider your companions.');
    assert.equal(options.length, 3, 'authored option array is not mutated');
});

test('unknown personality stays uncertain rather than exposing hidden values', () => {
    const { api } = fresh();
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const options = [makeOption('Experiment', 'experiment'), makeOption('Seal it', 'preserve_sealed')];
    const decision = api.activeDecision({ name: 'Mirabel Quill' }, options);
    const result = api.analyseChoice(decision, 'experiment');
    assert.equal(result.length, 1);
    assert.equal(result[0].unknown, true);
    assert.match(api.impressionText(result[0]), /do not know them well enough/i);
});

test('Mirabel experiment can produce a genuine mixed inference from learned clues', () => {
    const { api } = fresh({
        known: {
            'Mirabel Quill': {
                curiosity: { level: 3, text: 'Mirabel strongly values preserving and understanding dangerous knowledge.' },
                responsibility: { level: 3, text: 'Mirabel separates understanding dangerous knowledge from permission to use it.' },
            },
        },
    });
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const options = [makeOption('Experiment', 'experiment'), makeOption('Seal it', 'preserve_sealed')];
    const decision = api.activeDecision({ name: 'Mirabel Quill' }, options);
    const impression = api.analyseChoice(decision, 'experiment')[0];
    assert.equal(impression.direction, 'mixed');
    const text = api.impressionText(impression);
    assert.match(text, /pull in different directions/i);
    assert.match(text, /dangerous knowledge/i);
});

test('shallow knowledge is explicitly presented as a rough read', () => {
    const { api } = fresh({
        known: { 'Mirabel Quill': { responsibility: { level: 1, text: 'Mirabel notices who bears experimental risk.' } } },
    });
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const options = [makeOption('Open', 'preserve_open'), makeOption('Seal', 'preserve_sealed')];
    const decision = api.activeDecision({ name: 'Mirabel Quill' }, options);
    const impression = api.analyseChoice(decision, 'preserve_sealed')[0];
    assert.match(api.impressionText(impression), /read is still rough/i);
});

test('review UI uses only qualitative inference and returns to the live decision', () => {
    const { api, calls } = fresh({
        known: { 'Mirabel Quill': { curiosity: { level: 2, text: 'Mirabel values preserving knowledge.' } } },
    });
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const options = [makeOption('Keep it', 'preserve_open'), makeOption('Destroy it', 'destroy_appendix')];
    const decorated = api.decorateOptions({ name: 'Mirabel Quill' }, 'What do we do?', options);
    decorated.find(x => x.__companionDecisionAnticipation).action();
    const menu = calls.at(-1);
    assert.equal(menu.speaker.name, 'Your judgement');
    menu.options[0].action();
    const detail = calls.at(-1);
    assert.match(detail.message, /inferences from what you have actually learned/i);
    assert.doesNotMatch(detail.message, /[+-]\d+|approval score|friendship score|trust score|best choice/i);
    detail.options.find(x => /Back to the decision/.test(x.label)).action();
    assert.equal(calls.at(-1).speaker.name, 'Mirabel Quill');
});

test('installing and reviewing choices does not alter relationship or affinity state', () => {
    const rel = { familiarity: 20, trust: 30, approval: 55 };
    const affinity = { friendship: 12, romanticBond: 0 };
    const { api } = fresh({
        known: { 'Mirabel Quill': { curiosity: { level: 2 } } },
    });
    global.party[1].playerRelationship = rel;
    global.party[1].playerAffinity = affinity;
    global.questLog = [{ id: 'mirabel_unquiet_concordance', status: 'active' }];
    const before = JSON.stringify({ rel, affinity });
    api.decorateOptions({ name: 'Mirabel Quill' }, 'Decision', [makeOption('A', 'preserve_open'), makeOption('B', 'preserve_sealed')]);
    api.analyseChoice({ spec: api.decisions.mirabel_unquiet_concordance }, 'preserve_open');
    assert.equal(JSON.stringify({ rel, affinity }), before);
});