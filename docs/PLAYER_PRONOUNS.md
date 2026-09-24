# Character identity and voiced pronouns

The character creator deliberately separates identity from presentation:

- **Gender**: Female, Male, Other. Changing this only supplies defaults.
- **Body Type**: Feminine or Masculine. Either is available to every gender.
- **Build**: Average or Broad. This remains independent of gender/body type.
- **Pronouns**: he / him / his, she / her / hers, they / them / theirs.

Gender defaults are Female → Feminine + she/her/hers, Male → Masculine + he/him/his, and Other → they/them/theirs plus either existing body-art family. After the default is applied, Body Type and Pronouns remain freely editable.

## Authoring pronoun-aware dialogue

For simple substitutions in a keyed `window.dialogueData` entry, use semantic tokens:

```js
dialogue_171: {
    speaker: 'Narrator',
    dialogue: '{Subject} has earned {possessive} place here.',
    pronounAware: true
}
```

Supported tokens are `{subject}`, `{object}`, `{possessive}`, `{possessiveAdjective}`, `{possessivePronoun}`, and `{reflexive}`. Capitalise the token's first letter when the resulting pronoun should be capitalised.

If grammar or wording changes, supply complete variants instead:

```js
dialogue_172: {
    speaker: 'Guard',
    pronounVariants: {
        he: 'He is the one we were told about.',
        she: 'She is the one we were told about.',
        they: 'They are the one we were told about.'
    }
}
```

A keyed line is considered pronoun-aware if it has `pronounAware: true`, contains a supported token, or defines `pronounVariants`.

## Recording checklist

In the browser console run:

```js
printPronounDialogueAuthoringReport()
```

That prints each keyed pronoun-aware line and the three recordings expected by the current audio pipeline, for example:

- `audio/dialogue/dialogue_171_he.m4a`
- `audio/dialogue/dialogue_171_she.m4a`
- `audio/dialogue/dialogue_171_they.m4a`

`getPronounDialogueAuthoringReport()` returns the same rows as data for tests or future tooling.

The repository currently plays dialogue as `.m4a`. The stable convention is the `_he`, `_she`, `_they` suffix; moving the pipeline to WAV later only requires changing extension handling.

Direct `showDialogue(...)` text also supports the semantic tokens, but fully voiced dialogue should progressively use stable `dialogueData` keys so every recording has a deterministic filename and appears in the checklist.
