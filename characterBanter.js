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

// The player's world-map position (see finalizePlayerAction's playerWorldPos
// sync, gameEngine.js) resolved against worldMapData's settlement names — a
// "city" is one of the two larger settlements (Silverhart, the capital;
// Reddale, "bigger than Hollowmere, with an honest-to-goodness guardhouse"),
// distinct from villages/hamlets like Hollowmere or Millbrook. Used only for
// flavor (companion/mount personality banter below), not any mechanical gate.
function isInCityRegion() {
    const pos = window.playerWorldPos;
    if (!pos || !window.worldMapData) return false;
    const cell = window.worldMapData[pos.y]?.[pos.x];
    return !!(cell && ['Silverhart', 'Reddale'].includes(cell.n));
}

// The player's current permanent animal companion or ridden mount, if any —
// used by the companion/mount personality banter below. Returns the actual
// entity (not party data) since that's what carries .name for the speech
// bubble's speaker-lookup (spawnSpeechBubble matches by entity name).
function getCompanionOrMount() {
    const p = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    if (!p) return null;
    return p.animalCompanion || p.riding || null;
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
        id: 'wren_parents_north',
        once: true,
        condition: () => partyHas('Wren Talbot') && window.hollowmereEventFired,
        lines: [{ speaker: 'Wren Talbot', mood: 'distant', text: "My parents went north a couple years back — work in Millbrook, they said. Stopped writing after the first winter. I used to tell myself the roads were just bad." }]
    },
    {
        id: 'wren_aldric_parents_comfort',
        once: true,
        condition: () => partyHas('Wren Talbot') && partyHas('Ser Aldric Thorne') && !!window.firedBanterIds['wren_parents_north'],
        lines: [
            { speaker: 'Ser Aldric Thorne', mood: 'gentle', text: "You mentioned your parents went north. Have you ever gone looking?" },
            { speaker: 'Wren Talbot', mood: 'guarded', text: "Every time I think about it, I find a reason not to. Easier to imagine they're just... settled somewhere, than to go find out otherwise." },
            { speaker: 'Ser Aldric Thorne', mood: 'solemn', text: "Then when you're ready, you won't go alone. That much I can promise." }
        ]
    },
    {
        id: 'wren_uneasy_near_house',
        once: true,
        condition: () => partyHas('Wren Talbot') && nearHex(window.campaign2AbandonedHouseCenter, 10) && !!window.firedBanterIds['wren_parents_north'],
        lines: [{ speaker: 'Wren Talbot', mood: 'shaken', text: "I don't know why, but I don't like this place. Let's just... keep moving, if we can." }]
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
    },
    {
        id: 'reddale_first_sight',
        once: true,
        condition: () => nearHex({ q: 133, r: 24 }, 15),
        lines: [{ speaker: 'Narrator', mood: 'neutral', text: "Reddale rises ahead — bigger than Hollowmere, with an honest-to-goodness guardhouse watching the road." }]
    },
    // Recurring, plot-agnostic travel chatter — just personality, meant to
    // fill quiet stretches of road rather than mark a location or beat.
    {
        id: 'wren_aldric_idle_travel_1',
        cooldownSeconds: 3 * 3600,
        condition: () => partyHas('Wren Talbot') && partyHas('Ser Aldric Thorne'),
        lines: [
            { speaker: 'Wren Talbot', mood: 'idle', text: "Tell me honestly — does the armor ever stop being heavy, or do you just stop noticing?" },
            { speaker: 'Ser Aldric Thorne', mood: 'dry', text: "You stop noticing. Right up until you take it off, and then your own shirt feels like a burden." }
        ]
    },
    {
        id: 'wren_idle_travel_2',
        cooldownSeconds: 3 * 3600,
        condition: () => partyHas('Wren Talbot'),
        lines: [{ speaker: 'Wren Talbot', mood: 'idle', text: "Remind me — when this is all over, I'm owed a very long sit by a very warm fire." }]
    },
    {
        id: 'aldric_idle_travel',
        cooldownSeconds: 4 * 3600,
        condition: () => partyHas('Ser Aldric Thorne'),
        lines: [{ speaker: 'Ser Aldric Thorne', mood: 'thoughtful', text: "Quiet roads make me nervous. Give me an honest fight over a suspicious silence any day." }]
    },
    // Reacts to the necromancer arc's phylactery-shard item (see resources.js) —
    // party unease scales with how long you've been carrying it.
    {
        id: 'wren_uneasy_about_shard',
        cooldownSeconds: 2 * 3600,
        condition: () => partyHas('Wren Talbot') && !!(window.player && window.player.inventory && window.player.inventory.includes('phylactery_shard')),
        lines: [{ speaker: 'Wren Talbot', mood: 'uneasy', text: "That thing you're carrying — I don't like how cold it feels standing near you. What is it, really?" }]
    },
    {
        id: 'aldric_lich_rank_warning',
        cooldownSeconds: 6 * 3600,
        condition: () => partyHas('Ser Aldric Thorne') && !!(window.player && window.player.skills && Object.keys(window.player.skills).some(k => k.startsWith('lich_'))),
        lines: [{ speaker: 'Ser Aldric Thorne', mood: 'grave', text: "Something's changed in you. I won't pretend I understand it, but I'll be watching — for your sake as much as anyone's." }]
    },
    // Companion/mount personality flavor: animal companions (Nature's
    // permanent summon, see resolveSpell's animal_companion branch,
    // gameEngine.js) and purchased horses aren't silent scenery — a couple
    // of ambient one-liners react to being somewhere they plainly don't
    // belong. speaker matches the animal entity's own .name so the speech
    // bubble anchors on it, not the player.
    {
        id: 'unicorn_uneasy_in_city',
        cooldownSeconds: 3 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Unicorn' && isInCityRegion(); },
        lines: [{ speaker: 'Unicorn', mood: 'restless', text: "*stamps a hoof impatiently, ears pinned back at the crowded street*" }]
    },
    {
        id: 'horse_uneasy_in_city',
        cooldownSeconds: 3 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Horse' && isInCityRegion(); },
        lines: [{ speaker: 'Horse', mood: 'skittish', text: "*shifts its weight and snorts at the crowd, unhappy with the noise*" }]
    },
    {
        id: 'wolf_content_wilderness',
        cooldownSeconds: 4 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Wolf' && !isInCityRegion(); },
        lines: [{ speaker: 'Wolf', mood: 'content', text: "*trots along at the treeline, nose to the wind*" }]
    },
    {
        id: 'tiger_content_wilderness',
        cooldownSeconds: 4 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Tiger' && !isInCityRegion(); },
        lines: [{ speaker: 'Tiger', mood: 'content', text: "*pads along low and silent, eyes on the shadows between the trees*" }]
    },
    {
        id: 'boar_content_wilderness',
        cooldownSeconds: 4 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Boar' && !isInCityRegion(); },
        lines: [{ speaker: 'Boar', mood: 'content', text: "*snorts contentedly, rooting at the undergrowth as it walks*" }]
    },
    {
        id: 'unicorn_reverence_wilderness',
        cooldownSeconds: 5 * 3600,
        condition: () => { const c = getCompanionOrMount(); return !!c && c.name === 'Unicorn' && !isInCityRegion(); },
        lines: [{ speaker: 'Unicorn', mood: 'serene', text: "*walks with an unhurried, deliberate grace, utterly at ease among the trees*" }]
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
            if (window.spawnSpeechBubble) window.spawnSpeechBubble(line.speaker, line.text);
        }, i * 2500);
    });
}
window.playBanterLines = playBanterLines;

// Speech bubbles: banter previously only showed up in the scrolling text log,
// which made a party of characters walking around in real time feel mute.
// Cheap canvas overlay above the speaking entity's own hex — no new art,
// same "transient VFX, nothing persisted" spirit as combatFX.js.
window.speechBubbles = [];
function spawnSpeechBubble(speakerName, text, durationMs = 3200) {
    window.speechBubbles.push({ speakerName, text, start: performance.now(), duration: durationMs });
}
window.spawnSpeechBubble = spawnSpeechBubble;

function renderSpeechBubbles(ctx, hexToPixel, zoom) {
    const now = performance.now();
    window.speechBubbles = window.speechBubbles.filter(b => now - b.start < b.duration);
    window.speechBubbles.forEach(b => {
        const ent = window.entities && window.entities.find(e => e.name === b.speakerName && e.alive);
        if (!ent || !ent.hex) return;

        const { x, y } = hexToPixel(ent.hex.q, ent.hex.r);
        const maxTextWidth = 160 * zoom;
        const padding = 8 * zoom;
        const lineHeight = 14 * zoom;

        ctx.save();
        ctx.font = `${Math.round(12 * zoom)}px sans-serif`;
        ctx.textAlign = 'center';

        const words = b.text.split(' ');
        const lines = [];
        let current = '';
        words.forEach(word => {
            const candidate = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(candidate).width > maxTextWidth) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        });
        if (current) lines.push(current);

        const boxWidth = Math.min(maxTextWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
        const boxHeight = lines.length * lineHeight + padding * 2;
        const boxX = x - boxWidth / 2;
        const boxY = y - 45 * zoom - boxHeight;

        ctx.fillStyle = 'rgba(20,20,20,0.85)';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6 * zoom);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.stroke();

        // Speech-bubble tail pointing down at the speaker.
        ctx.beginPath();
        ctx.moveTo(x - 6 * zoom, boxY + boxHeight);
        ctx.lineTo(x + 6 * zoom, boxY + boxHeight);
        ctx.lineTo(x, boxY + boxHeight + 8 * zoom);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fff';
        lines.forEach((line, i) => ctx.fillText(line, x, boxY + padding + (i + 1) * lineHeight - 4 * zoom));
        ctx.restore();
    });
}
window.renderSpeechBubbles = renderSpeechBubbles;
