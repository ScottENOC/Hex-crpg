// Identity, body presentation and pronoun handling for the character creator.
//
// Legacy rendering still uses character.gender as a visual body-art key
// ('female'/'male'). Player-facing identity is stored separately as
// genderIdentity, while bodyPresentation drives that compatibility field.
(() => {
    const PRONOUN_SETS = {
        he: { label:'he / him / his', subject:'he', object:'him', possessive:'his', possessiveAdjective:'his', possessivePronoun:'his', reflexive:'himself', audioSuffix:'he' },
        she:{ label:'she / her / hers', subject:'she', object:'her', possessive:'her', possessiveAdjective:'her', possessivePronoun:'hers', reflexive:'herself', audioSuffix:'she' },
        they:{ label:'they / them / theirs', subject:'they', object:'them', possessive:'their', possessiveAdjective:'their', possessivePronoun:'theirs', reflexive:'themselves', audioSuffix:'they' }
    };
    window.PLAYER_PRONOUN_SETS = PRONOUN_SETS;

    function defaultForGender(genderIdentity) {
        if (genderIdentity === 'male') return { bodyPresentation:'male', pronounSet:'he' };
        if (genderIdentity === 'female') return { bodyPresentation:'female', pronounSet:'she' };
        // Other does not imply a body type. Choose either existing body-art
        // family as a neutral starting point; the player can change it freely.
        return { bodyPresentation:Math.random() < 0.5 ? 'female' : 'male', pronounSet:'they' };
    }

    function getCreatorIdentitySelection() {
        const genderIdentity = document.getElementById('gender-select')?.value || 'female';
        const bodyPresentation = document.getElementById('body-presentation-select')?.value
            || (genderIdentity === 'male' ? 'male' : 'female');
        const pronounSet = document.getElementById('pronoun-select')?.value
            || (genderIdentity === 'male' ? 'he' : genderIdentity === 'female' ? 'she' : 'they');
        return { genderIdentity, bodyPresentation, pronounSet };
    }
    window.getCreatorIdentitySelection = getCreatorIdentitySelection;

    function applyCreatorIdentityToCharacter(character, selection = getCreatorIdentitySelection()) {
        if (!character) return character;
        character.genderIdentity = selection.genderIdentity;
        character.bodyPresentation = selection.bodyPresentation;
        character.pronounSet = selection.pronounSet;
        character.pronouns = { ...PRONOUN_SETS[selection.pronounSet] };
        // Compatibility: existing sprite/rig code reads .gender to choose art.
        character.gender = selection.bodyPresentation;
        return character;
    }
    window.applyCreatorIdentityToCharacter = applyCreatorIdentityToCharacter;

    function getPlayerPronounSetId() {
        return window.player?.pronounSet
            || window.party?.[0]?.pronounSet
            || document.getElementById('pronoun-select')?.value
            || 'they';
    }
    function getPlayerPronouns() {
        return PRONOUN_SETS[getPlayerPronounSetId()] || PRONOUN_SETS.they;
    }
    window.getPlayerPronouns = getPlayerPronouns;

    const TOKEN_RE = /\{(Subject|subject|Object|object|Possessive|possessive|PossessiveAdjective|possessiveAdjective|PossessivePronoun|possessivePronoun|Reflexive|reflexive)\}/g;
    function hasPlayerPronounTokens(text) {
        if (typeof text !== 'string') return false;
        TOKEN_RE.lastIndex = 0;
        return TOKEN_RE.test(text);
    }
    window.hasPlayerPronounTokens = hasPlayerPronounTokens;

    function formatPlayerPronouns(text, pronouns = getPlayerPronouns()) {
        if (typeof text !== 'string') return text;
        TOKEN_RE.lastIndex = 0;
        return text.replace(TOKEN_RE, (_, token) => {
            const key = token.charAt(0).toLowerCase() + token.slice(1);
            const value = pronouns[key] || (key === 'possessive' ? pronouns.possessive : null);
            if (!value) return `{${token}}`;
            return token[0] === token[0].toUpperCase()
                ? value.charAt(0).toUpperCase() + value.slice(1)
                : value;
        });
    }
    window.formatPlayerPronouns = formatPlayerPronouns;

    function isPronounAwareDialogue(key, entry) {
        return !!entry?.pronounAware
            || !!entry?.pronounVariants
            || hasPlayerPronounTokens(entry?.dialogue);
    }
    window.isPronounAwareDialogue = isPronounAwareDialogue;

    function resolvePronounDialogueText(entry, pronounSet = getPlayerPronounSetId()) {
        if (!entry) return '';
        const variant = entry.pronounVariants?.[pronounSet];
        return formatPlayerPronouns(variant ?? entry.dialogue ?? '', PRONOUN_SETS[pronounSet] || PRONOUN_SETS.they);
    }
    window.resolvePronounDialogueText = resolvePronounDialogueText;

    function getPronounDialogueAudioKey(key, pronounSet = getPlayerPronounSetId()) {
        const entry = window.dialogueData?.[key];
        if (!isPronounAwareDialogue(key, entry)) return key;
        return `${key}_${(PRONOUN_SETS[pronounSet] || PRONOUN_SETS.they).audioSuffix}`;
    }
    window.getPronounDialogueAudioKey = getPronounDialogueAudioKey;

    function getPronounDialogueAuthoringReport() {
        return Object.entries(window.dialogueData || {})
            .filter(([key, entry]) => isPronounAwareDialogue(key, entry))
            .map(([key, entry]) => ({
                key,
                text: entry.dialogue || '[full he/she/they text variants]',
                he: `audio/dialogue/${key}_he.m4a`,
                she: `audio/dialogue/${key}_she.m4a`,
                they: `audio/dialogue/${key}_they.m4a`
            }));
    }
    window.getPronounDialogueAuthoringReport = getPronounDialogueAuthoringReport;
    window.printPronounDialogueAuthoringReport = function() {
        const rows = getPronounDialogueAuthoringReport();
        console.table(rows);
        return rows;
    };

    function preloadSelectedBody() {
        const race = document.getElementById('race-select')?.value;
        const body = document.getElementById('body-presentation-select')?.value;
        if (race && body && window._preloadRaceGender) window._preloadRaceGender(race, body);
    }

    function installCreatorControls() {
        const genderSelect = document.getElementById('gender-select');
        if (!genderSelect) return;

        if (!genderSelect.querySelector('option[value="other"]')) {
            genderSelect.appendChild(new Option('Other', 'other'));
        }

        if (!document.getElementById('pronoun-select')) {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.innerHTML = `
                <label for="pronoun-select">Pronouns:</label>
                <select id="pronoun-select">
                    <option value="she">she / her / hers</option>
                    <option value="he">he / him / his</option>
                    <option value="they">they / them / theirs</option>
                </select>`;
            genderSelect.closest('.form-group')?.after(group);
            group.querySelector('#pronoun-select')?.addEventListener('change', () => {
                if (window.syncCharacterToServer) window.syncCharacterToServer();
            });
        }

        const buildSelect = document.getElementById('body-type-select');
        if (buildSelect) {
            const buildLabel = document.querySelector('label[for="body-type-select"]');
            if (buildLabel) buildLabel.textContent = 'Build';
            if (!document.getElementById('body-presentation-select')) {
                const bodyLabel = document.createElement('label');
                bodyLabel.htmlFor = 'body-presentation-select';
                bodyLabel.style.cssText = 'font-weight: normal; font-size: 0.85em;';
                bodyLabel.textContent = 'Body Type';
                const bodySelect = document.createElement('select');
                bodySelect.id = 'body-presentation-select';
                bodySelect.innerHTML = '<option value="female">Feminine</option><option value="male">Masculine</option>';
                buildLabel.before(bodyLabel, bodySelect);
                bodySelect.addEventListener('change', () => {
                    preloadSelectedBody();
                    if (window.updateAppearancePreview) window.updateAppearancePreview();
                    if (window.syncCharacterToServer) window.syncCharacterToServer();
                });
            }
        }

        const pronounSelect = document.getElementById('pronoun-select');
        const bodySelect = document.getElementById('body-presentation-select');
        if (!genderSelect.dataset.identityListenerInstalled) {
            genderSelect.dataset.identityListenerInstalled = 'true';
            genderSelect.addEventListener('change', () => {
                const defaults = defaultForGender(genderSelect.value);
                if (bodySelect) bodySelect.value = defaults.bodyPresentation;
                if (pronounSelect) pronounSelect.value = defaults.pronounSet;
                preloadSelectedBody();
                if (window.updateAppearancePreview) window.updateAppearancePreview();
                if (window.syncCharacterToServer) window.syncCharacterToServer();
            });
        }

        const defaults = defaultForGender(genderSelect.value);
        if (bodySelect && !bodySelect.dataset.identityInitialised) {
            bodySelect.value = defaults.bodyPresentation;
            bodySelect.dataset.identityInitialised = 'true';
        }
        if (pronounSelect && !pronounSelect.dataset.identityInitialised) {
            pronounSelect.value = defaults.pronounSet;
            pronounSelect.dataset.identityInitialised = 'true';
        }

        // Capture-phase bridge for the legacy startGame click listener. main.js
        // binds the old function by reference, so temporarily place the chosen
        // visual body in #gender-select before that listener runs, then restore
        // identity and attach the new metadata immediately afterwards.
        const createButton = document.getElementById('createCharacterButton');
        if (createButton && !createButton.dataset.identityBridgeInstalled) {
            createButton.dataset.identityBridgeInstalled = 'true';
            const prepareLegacyStart = () => {
                const selection = getCreatorIdentitySelection();
                const name = document.getElementById('character-name');
                if (name && !name.value.trim() && window.getRandomName) {
                    name.value = window.getRandomName(document.getElementById('race-select')?.value || 'human', selection.genderIdentity);
                }
                const identity = genderSelect.value;
                genderSelect.value = selection.bodyPresentation;
                setTimeout(() => {
                    applyCreatorIdentityToCharacter(window.party?.[0], selection);
                    const mainChar = window.party?.[0];
                    if (mainChar) {
                        const entity = window.entities?.find(e => e.name === mainChar.name && e.side === 'player');
                        if (entity) {
                            entity.genderIdentity = mainChar.genderIdentity;
                            entity.bodyPresentation = mainChar.bodyPresentation;
                            entity.pronounSet = mainChar.pronounSet;
                            entity.pronouns = { ...mainChar.pronouns };
                            entity.gender = mainChar.gender;
                        }
                    }
                    genderSelect.value = identity;
                }, 0);
            };
            createButton.addEventListener('click', prepareLegacyStart, true);
            createButton.addEventListener('touchend', prepareLegacyStart, true);
        }
    }

    // Keep the existing race-specific name pools. For Other, draw from both
    // historical female/male pools rather than inventing a duplicate third list.
    const baseGetRandomName = window.getRandomName;
    if (baseGetRandomName && !baseGetRandomName.__identityAware) {
        const identityAwareName = function(race, gender) {
            const poolGender = gender === 'other' ? (Math.random() < 0.5 ? 'female' : 'male') : gender;
            return baseGetRandomName(race, poolGender);
        };
        identityAwareName.__identityAware = true;
        window.getRandomName = identityAwareName;
        window.generateName = identityAwareName;
    }

    installCreatorControls();

    document.addEventListener('DOMContentLoaded', () => {
        installCreatorControls();
        setTimeout(() => {
            // main.js's preview still keys art by #gender-select. Swap in body
            // presentation only for the duration of the draw.
            const basePreview = window.updateAppearancePreview;
            if (basePreview && !basePreview.__identityAware) {
                const wrappedPreview = function(...args) {
                    const gender = document.getElementById('gender-select');
                    const body = document.getElementById('body-presentation-select');
                    if (!gender || !body) return basePreview.apply(this, args);
                    const identity = gender.value;
                    gender.value = body.value;
                    try { return basePreview.apply(this, args); }
                    finally { gender.value = identity; }
                };
                wrappedPreview.__identityAware = true;
                window.updateAppearancePreview = wrappedPreview;
                wrappedPreview();
            }

            // The Appearance randomiser includes visual body presentation but
            // intentionally never changes Gender or Pronouns.
            const baseRandomize = window.randomizeCharacterAppearance;
            if (baseRandomize && !baseRandomize.__identityAware) {
                const wrappedRandomize = function(...args) {
                    const result = baseRandomize.apply(this, args);
                    const body = document.getElementById('body-presentation-select');
                    if (body) body.value = Math.random() < 0.5 ? 'female' : 'male';
                    preloadSelectedBody();
                    if (window.updateAppearancePreview) window.updateAppearancePreview();
                    if (window.syncCharacterToServer) window.syncCharacterToServer();
                    return result;
                };
                wrappedRandomize.__identityAware = true;
                window.randomizeCharacterAppearance = wrappedRandomize;
            }

            // Central dialogue rendering supports pronoun tokens even for
            // direct showDialogue calls that have not yet moved into dialogueData.
            const baseShowDialogue = window.showDialogue;
            if (baseShowDialogue && !baseShowDialogue.__pronounAware) {
                const wrappedShowDialogue = function(npc, message, options = []) {
                    return baseShowDialogue.call(this, npc, formatPlayerPronouns(message), (options || []).map(option => ({
                        ...option,
                        label: formatPlayerPronouns(option.label)
                    })));
                };
                wrappedShowDialogue.__pronounAware = true;
                window.showDialogue = wrappedShowDialogue;
            }

            // Keyed ambient dialogue can additionally provide complete
            // pronounVariants when verb agreement or wording must differ.
            const baseTriggerAmbient = window.triggerAmbientDialogue;
            if (baseTriggerAmbient && !baseTriggerAmbient.__pronounAware) {
                const wrappedTriggerAmbient = function(key, ...args) {
                    const entry = window.dialogueData?.[key];
                    if (!entry || !isPronounAwareDialogue(key, entry)) return baseTriggerAmbient.call(this, key, ...args);
                    const original = entry.dialogue;
                    entry.dialogue = resolvePronounDialogueText(entry);
                    try { return baseTriggerAmbient.call(this, key, ...args); }
                    finally { entry.dialogue = original; }
                };
                wrappedTriggerAmbient.__pronounAware = true;
                window.triggerAmbientDialogue = wrappedTriggerAmbient;
            }

            // Existing audio uses audio/dialogue/<key>.m4a. Pronoun-aware
            // entries transparently request <key>_he/_she/_they instead.
            const basePlayDialogue = window.playDialogue;
            if (basePlayDialogue && !basePlayDialogue.__pronounAware) {
                const wrappedPlayDialogue = function(key, ...args) {
                    return basePlayDialogue.call(this, getPronounDialogueAudioKey(key), ...args);
                };
                wrappedPlayDialogue.__pronounAware = true;
                window.playDialogue = wrappedPlayDialogue;
            }
        }, 0);
    });
})();
