// characterBanter.js
// Ambient personality lines for party members/companions: short one-liners
// and occasional multi-line back-and-forth exchanges between two
// characters, each gated by a simple condition function and checked
// periodically from worldTime.js's tick. Deliberately separate from
// window.dialogueData (scripted, VO-tracked story beats) — these are meant
// to be numerous and lightweight, not individually voice-recorded.

window.characterBanterAccum = 0;
window.firedBanterIds = window.firedBanterIds || {}; // plain object, not a Set, so it round-trips through JSON save/load

function partyHas(name) {
    return !!(window.party && window.party.some(p => p.name === name));
}

function nearHex(hex, radius) {
    const p = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    return !!(p && hex && window.distance(p.hex, hex) <= radius);
}

// Each entry: { id, once?, cooldownSeconds?, condition(), lines: [{speaker, mood, text}, ...] }
// `lines` with more than one entry plays as a staggered exchange (2.5s apart)
// so it reads like a conversation rather than a wall of text.
window.characterBanterLines = [
    {
        id: 'wren_tavern_nostalgia',
        once: true,
        condition: () => partyHas('Wren Talbot') && window.hollowmereEventFired,
        lines: [{ speaker: 'Wren Talbot', mood: 'wistful', text: "Feels strange, doesn't it? A week ago the worst thing in my life was a bar tab." }]
    },
    {
        id: 'wren_aldric_banter_faith',
        once: true,
        condition: () => partyHas('Wren Talbot') && partyHas('Ser Aldric Thorne'),
        lines: [
            { speaker: 'Wren Talbot', mood: 'teasing', text: "So — a real paladin. Do you pray before every fight, or just the ones you might lose?" },
            { speaker: 'Ser Aldric Thorne', mood: 'wry', text: "Every fight. You'd be amazed how often it's the ones I expect to win that go sideways." },
            { speaker: 'Wren Talbot', mood: 'laughing', text: "Fair. I'll start praying too, then. Feels like it can't hurt." }
        ]
    },
    {
        id: 'aldric_low_attitude_warning',
        cooldownSeconds: 24 * 3600,
        condition: () => partyHas('Ser Aldric Thorne') && (window.companionAttitude?.['Ser Aldric Thorne'] ?? 100) < 30,
        lines: [{ speaker: 'Ser Aldric Thorne', mood: 'tense', text: "The goblins are still out there, you know. I didn't come this far to let it go quiet." }]
    },
    {
        id: 'wren_low_hp_worry',
        cooldownSeconds: 3600,
        condition: () => {
            const w = window.entities && window.entities.find(e => e.name === 'Wren Talbot');
            return !!(w && w.alive && w.hp < w.maxHp * 0.3);
        },
        lines: [{ speaker: 'Wren Talbot', mood: 'strained', text: "I've had better days, if anyone's asking." }]
    },
    {
        id: 'goblin_camp_first_sight',
        once: true,
        condition: () => nearHex(window.campaign2GoblinCampCenter, 15),
        lines: [{ speaker: 'Narrator', mood: 'grim', text: "Smoke rises ahead — huts, and the unmistakable shapes of goblins moving between them." }]
    },
    {
        id: 'aldric_sees_camp',
        once: true,
        condition: () => partyHas('Ser Aldric Thorne') && nearHex(window.campaign2GoblinCampCenter, 15),
        lines: [{ speaker: 'Ser Aldric Thorne', mood: 'hard', text: "There. That's the camp. However you mean to handle it, I'm with you — just don't make me watch you walk away from it." }]
    },
    {
        id: 'abandoned_house_first_sight',
        once: true,
        condition: () => nearHex(window.campaign2AbandonedHouseCenter, 10),
        lines: [{ speaker: 'Narrator', mood: 'uneasy', text: "A house stands alone off the road, shutters closed, no smoke from the chimney. Something moves near the door — bone-white, and not alive." }]
    },
    {
        id: 'millbrook_first_sight',
        once: true,
        condition: () => nearHex(window.campaign2MillbrookCenter, 10),
        lines: [{ speaker: 'Narrator', mood: 'neutral', text: "Millbrook comes into view — smaller than Hollowmere, but a welcome sight after so long on the road." }]
    }
];

// Real-time cadence (checked roughly every 5 seconds of accumulated wilderness
// clock, not every tick) since this is flavor, not something that needs
// tick-precision.
function checkCharacterBanter(delta) {
    window.characterBanterAccum += delta;
    if (window.characterBanterAccum < 5) return;
    window.characterBanterAccum = 0;

    for (const bark of window.characterBanterLines) {
        if (bark.once && window.firedBanterIds[bark.id]) continue;
        if (bark.cooldownSeconds && bark._lastFired && (window.worldSeconds - bark._lastFired) < bark.cooldownSeconds) continue;

        let conditionMet = false;
        try { conditionMet = !!bark.condition(); } catch (e) { conditionMet = false; }
        if (!conditionMet) continue;

        playBanterLines(bark.lines);
        bark._lastFired = window.worldSeconds;
        if (bark.once) window.firedBanterIds[bark.id] = true;
        return; // one bark per check — keeps multi-line exchanges from overlapping each other
    }
}
window.checkCharacterBanter = checkCharacterBanter;

function playBanterLines(lines) {
    lines.forEach((line, i) => {
        setTimeout(() => {
            const text = `${line.speaker} (${line.mood}): "${line.text}"`;
            window.showMessage(text);
            if (window.broadcastGameMessage) window.broadcastGameMessage(text);
        }, i * 2500);
    });
}
window.playBanterLines = playBanterLines;
