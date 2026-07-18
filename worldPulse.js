// worldPulse.js
// Discrete, autonomous world events on the world clock — the visible layer
// on top of the continuous simulations that already run (regions.js decay,
// factions.js agendas, lichHunt, war pressure). Those systems drift numbers;
// this one makes *things happen*: a caravan arrives, wolves recolonize the
// western woods, the Baron's patrols sweep a road. Every event does three
// things at once:
//   1. Nudges the region stats it's about (so the simulation and the
//      fiction never disagree),
//   2. Records itself as a rumor NPCs can repeat (see getRecentWorldRumors
//      and Garrick's "what's the word?" dialogue option),
//   3. Where it has a physical meaning near the player, sets a world
//      modifier gameplay reads directly (wildernessThreatMult scales the
//      random-encounter chance in checkWildernessEncounter).
// This is the anti-"cleared zone stays empty forever" mechanism: places the
// player has pacified drift back toward danger if the underlying security
// collapses again, and safe prosperous places visibly *stay busy* instead
// of just holding a high number in a hidden stat.

window.worldEvents = window.worldEvents || [];
// Multiplier on wilderness random-encounter chance. Drifts back toward 1.0
// over in-game days (see tickWorldPulse) so no single event permanently
// re-tunes the world — lasting change comes from region stats, not this.
window.wildernessThreatMult = window.wildernessThreatMult || 1.0;

const WORLD_EVENT_LOG_CAP = 30;
const PULSE_INTERVAL_SECONDS = 6 * 3600; // one roll every 6 in-game hours
const THREAT_MULT_DECAY_PER_HOUR = 0.02; // exponential drift back toward 1.0

// Each candidate: eligibility+weight from current region stats, and an
// apply() that mutates the world and returns the rumor text. Weights are
// relative among eligible candidates; QUIET_WEIGHT competes against all of
// them so most rolls produce nothing — events should feel like news, not
// like a ticker spamming every few hours.
const QUIET_WEIGHT = 10;

const WORLD_EVENT_TYPES = [
    {
        type: 'wolf_resurgence',
        weight: () => {
            const sec = window.regions?.hollowmere?.security ?? 50;
            return sec < 45 ? 4 : 1; // wild country creeps back when patrols thin out
        },
        apply: () => {
            window.wildernessThreatMult = Math.min(2.5, window.wildernessThreatMult + 0.5);
            window.adjustRegionStat?.('hollowmere', 'security', -2);
            return "Hunters say the wolf packs are moving back into the western woods — bolder than last season, too.";
        }
    },
    {
        type: 'bandit_activity',
        weight: () => {
            const sec = window.regions?.aldervale?.security ?? 50;
            return sec < 40 ? 4 : (sec < 55 ? 2 : 0);
        },
        apply: () => {
            window.adjustRegionStat?.('aldervale', 'security', -3);
            window.adjustRegionStat?.('aldervale', 'prosperity', -2);
            window.wildernessThreatMult = Math.min(2.5, window.wildernessThreatMult + 0.25);
            return "A wagon was robbed on the barony road. No one killed, thank the gods, but folk are traveling in groups now.";
        }
    },
    {
        type: 'caravan_arrived',
        weight: () => {
            const pros = window.regions?.aldervale?.prosperity ?? 40;
            return pros > 45 ? 3 : 1;
        },
        apply: () => {
            window.adjustRegionStat?.('hollowmere', 'prosperity', 2);
            window.adjustRegionStat?.('aldervale', 'prosperity', 1);
            return "A trade caravan came through from the south — good cloth, better prices. The Tankard was full two nights running.";
        }
    },
    {
        type: 'patrol_sweep',
        weight: () => {
            const kSec = window.regions?.silverhart_kingdom?.security ?? 55;
            return kSec > 50 ? 3 : 1;
        },
        apply: () => {
            window.adjustRegionStat?.('hollowmere', 'security', 2);
            window.wildernessThreatMult = Math.max(0.5, window.wildernessThreatMult - 0.25);
            return "Riders in Silverhart colors swept the roads this week. Quietest the woods have been in a while.";
        }
    },
    {
        type: 'harvest_festival',
        weight: () => {
            const r = window.regions?.hollowmere;
            return (r && r.security > 55 && r.prosperity > 45) ? 2 : 0;
        },
        apply: () => {
            window.adjustRegionStat?.('hollowmere', 'prosperity', 3);
            return "There's talk of a festival when the harvest comes in. First time in years anyone's felt safe enough to plan one.";
        }
    },
    {
        type: 'mine_trouble',
        weight: () => {
            const r = window.regions?.emberlode;
            return (r && r.prosperity < 30) ? 3 : 1;
        },
        apply: () => {
            window.adjustRegionStat?.('emberlode', 'prosperity', -2);
            return "Emberlode's ore shipments are late again. Miners drinking away their last coin instead of swinging picks, they say.";
        }
    }
];

function recordWorldEvent(type, text) {
    window.worldEvents.push({ type, text, worldSeconds: window.worldSeconds || 0 });
    if (window.worldEvents.length > WORLD_EVENT_LOG_CAP) {
        window.worldEvents.splice(0, window.worldEvents.length - WORLD_EVENT_LOG_CAP);
    }
}

// One roll: pick among eligible events (plus "nothing happens") by weight.
// rng is injectable for tests; defaults to Math.random.
function rollWorldPulseEvent(rng = Math.random) {
    const candidates = WORLD_EVENT_TYPES
        .map(ev => ({ ev, w: ev.weight() }))
        .filter(c => c.w > 0);
    const total = QUIET_WEIGHT + candidates.reduce((s, c) => s + c.w, 0);
    let roll = rng() * total;
    if (roll < QUIET_WEIGHT) return null;
    roll -= QUIET_WEIGHT;
    for (const c of candidates) {
        if (roll < c.w) {
            const text = c.ev.apply();
            recordWorldEvent(c.ev.type, text);
            return { type: c.ev.type, text };
        }
        roll -= c.w;
    }
    return null;
}

let _pulseAccum = 0;
function tickWorldPulse(deltaSeconds) {
    // Threat multiplier drifts home toward 1.0 continuously (same
    // unconditionally-stable exponential-approach shape tickRegions uses).
    const hours = deltaSeconds / 3600;
    window.wildernessThreatMult = 1 + (window.wildernessThreatMult - 1) * Math.exp(-THREAT_MULT_DECAY_PER_HOUR * hours);

    _pulseAccum += deltaSeconds;
    while (_pulseAccum >= PULSE_INTERVAL_SECONDS) {
        _pulseAccum -= PULSE_INTERVAL_SECONDS;
        // Via window so tests (and mods) can observe/wrap the roll.
        window.rollWorldPulseEvent();
    }
}

// Most recent rumors first, for NPC smalltalk. An event stops circulating
// as a "current" rumor after ~5 in-game days — old news dies out of the
// tavern on its own instead of NPCs reciting month-old wolf sightings.
const RUMOR_FRESH_SECONDS = 5 * 24 * 3600;
function getRecentWorldRumors(n = 2) {
    const now = window.worldSeconds || 0;
    return window.worldEvents
        .filter(ev => now - ev.worldSeconds < RUMOR_FRESH_SECONDS)
        .slice(-n)
        .reverse()
        .map(ev => ev.text);
}

window.rollWorldPulseEvent = rollWorldPulseEvent;
window.tickWorldPulse = tickWorldPulse;
window.getRecentWorldRumors = getRecentWorldRumors;
window.recordWorldEvent = recordWorldEvent;
