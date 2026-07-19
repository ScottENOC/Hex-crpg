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
        regionId: 'hollowmere',
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
        regionId: 'aldervale',
        weight: () => {
            const sec = window.regions?.aldervale?.security ?? 50;
            return sec < 40 ? 4 : (sec < 55 ? 2 : 0);
        },
        apply: () => {
            window.adjustRegionStat?.('aldervale', 'security', -3);
            window.adjustRegionStat?.('aldervale', 'prosperity', -2);
            window.wildernessThreatMult = Math.min(2.5, window.wildernessThreatMult + 0.25);
            // D2: village guards go on alert for a day — see applyGuardAlert.
            window._guardAlertUntil = (window.worldSeconds || 0) + 24 * 3600;
            if (window.applyGuardAlert) window.applyGuardAlert();
            return "A wagon was robbed on the barony road. No one killed, thank the gods, but folk are traveling in groups now.";
        }
    },
    {
        type: 'caravan_arrived',
        regionId: 'aldervale',
        weight: () => {
            const pros = window.regions?.aldervale?.prosperity ?? 40;
            return pros > 45 ? 3 : 1;
        },
        apply: () => {
            window.adjustRegionStat?.('hollowmere', 'prosperity', 2);
            window.adjustRegionStat?.('aldervale', 'prosperity', 1);
            // Physical body spawned by checkCaravanSpawn below, not here —
            // spawning needs the player to be outdoors right now, which
            // isn't guaranteed at the moment this event happens to roll.
            window._pendingCaravanArrival = true;
            return "A trade caravan came through from the south — good cloth, better prices. The Tankard was full two nights running.";
        }
    },
    {
        type: 'patrol_sweep',
        regionId: 'hollowmere',
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
        regionId: 'hollowmere',
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
        regionId: 'emberlode',
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

function recordWorldEvent(type, text, regionId = null) {
    window.worldEvents.push({ type, text, regionId, worldSeconds: window.worldSeconds || 0 });
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
            recordWorldEvent(c.ev.type, text, c.ev.regionId || null);
            // Region-linked events (e.g. Hollowmere's prosperity shifting)
            // should show up in the village itself, not just as a rumor —
            // see applyRegionDressing (campaign2World.js).
            if (c.ev.regionId === 'hollowmere' && window.applyRegionDressing) window.applyRegionDressing();
            return { type: c.ev.type, text, regionId: c.ev.regionId || null };
        }
        roll -= c.w;
    }
    return null;
}

// A2: self-seeding bandit camps. If Aldervale's security stays below 30 for
// 3+ consecutive in-game days, a small bandit camp appears somewhere in the
// wilderness; clearing it (every camp bandit dead) rewards security back and
// lets the camp seed again — at a *different* random site next time — if
// security collapses again later. This is the direct mechanism against
// "cleared areas stay empty forever": the world can re-populate a threat
// exactly where the underlying condition (low security) recurs, not just
// once at a fixed hand-placed location.
const BANDIT_CAMP_SECURITY_THRESHOLD = 30;
const BANDIT_CAMP_SEED_SECONDS = 3 * 24 * 3600;
const BANDIT_CAMP_SECURITY_REWARD = 8;
window._banditCampLowSecurityAccum = window._banditCampLowSecurityAccum || 0;
window._activeBanditCamp = window._activeBanditCamp || null; // { hexes: [{q,r}], memberNames: [...] }

function findBanditCampSite() {
    // Same "unseen, unobstructed, not on top of existing content" search
    // checkWildernessEncounter (campaign2Dialogue.js) already uses for wolf
    // spawns — reused here via the same window.* helpers rather than
    // duplicating the algorithm.
    const cp = window.campaign2Landmarks?.crossroads || { q: 0, r: 0 };
    for (let attempt = 0; attempt < 20; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 40 + Math.floor(Math.random() * 30); // well clear of the village and its named content
        const candidate = window.hexRound(
            cp.q + Math.round(Math.cos(angle) * dist),
            cp.r + Math.round(Math.sin(angle) * dist)
        );
        if (window.getEntityAtHex && window.getEntityAtHex(candidate.q, candidate.r)) continue;
        if (window.getTerrainAt && window.getTerrainAt(candidate.q, candidate.r).name === 'Water') continue;
        if (window.isVisibleToPlayer && window.isVisibleToPlayer(candidate)) continue;
        if (window.isNearAnyBuilding && window.isNearAnyBuilding(candidate, 30)) continue;
        return candidate;
    }
    return null;
}

function seedBanditCamp() {
    const site = findBanditCampSite();
    if (!site) return; // no clear spot found this attempt; tickWorldPulse will retry later ticks
    const memberNames = [];
    const count = 3 + Math.floor(Math.random() * 2); // 3-4 bandits
    for (let i = 0; i < count; i++) {
        const hex = { q: site.q + (i % 2), r: site.r + Math.floor(i / 2) };
        const bandit = window.createMonster('bandit', hex, null, null, 'enemy');
        bandit.behaviorType = 'campRoutine';
        bandit.isRandomEncounter = true; // eligible for corpse pruning once cleared and left behind
        bandit.banditCampId = site; // tags this member as belonging to this seeding, for the clear-check below
        window.entities.push(bandit);
        memberNames.push(bandit.name);
    }
    window.tileObjects[`${site.q},${site.r}`] = { type: 'fireplace', lightRadius: 6 };
    window._activeBanditCamp = { hexes: [site], memberIds: window.entities.filter(e => e.banditCampId === site).map(e => e.id) };
    if (window.recordWorldEvent) window.recordWorldEvent('bandit_camp_seeded', "Word spreads of a new bandit camp somewhere out past the barony road.", 'aldervale');
}

// Checked every tickWorldPulse call: has the active camp been fully cleared?
function checkBanditCampCleared() {
    if (!window._activeBanditCamp) return;
    const site = window._activeBanditCamp.hexes[0];
    const stillAlive = window.entities.some(e => e.banditCampId === site && e.alive);
    if (stillAlive) return;
    window.adjustRegionStat?.('aldervale', 'security', BANDIT_CAMP_SECURITY_REWARD);
    window._activeBanditCamp = null;
    window._banditCampLowSecurityAccum = 0; // give the world a fresh 3-day grace period before another can seed
    if (window.recordWorldEvent) window.recordWorldEvent('bandit_camp_cleared', "Word travels fast: that bandit camp on the barony road is gone.", 'aldervale');
}

function checkBanditCampSeeding(deltaSeconds) {
    checkBanditCampCleared();
    const sec = window.regions?.aldervale?.security ?? 50;
    if (window._activeBanditCamp) return; // only one live camp at a time
    if (sec >= BANDIT_CAMP_SECURITY_THRESHOLD) {
        window._banditCampLowSecurityAccum = 0;
        return;
    }
    window._banditCampLowSecurityAccum += deltaSeconds;
    if (window._banditCampLowSecurityAccum >= BANDIT_CAMP_SEED_SECONDS) {
        window._banditCampLowSecurityAccum = 0;
        seedBanditCamp();
    }
}

// A1: a physical caravan for the caravan_arrived event. Only actually spawns
// once the player is outdoors and not in combat (the flag just waits
// patiently otherwise) — 2 merchants + 1 guard walk the crossroads' north-
// south road column past the village and despawn at the far end. Capped at
// one live caravan at a time.
window._activeCaravan = window._activeCaravan || null; // { memberIds: [...] }

function checkCaravanSpawn() {
    if (!window._pendingCaravanArrival || window._activeCaravan) return;
    if (window.isInCombat) return;
    const player = window.entities && window.entities.find(e => e.side === 'player' && !e.rider);
    if (!player) return;
    if (window.findInteriorRegion && window.findInteriorRegion(player.hex)) return; // wait until the player steps outside

    window._pendingCaravanArrival = false;
    const cp = window.campaign2Landmarks?.crossroads;
    if (!cp) return; // not in the Hollowmere overworld (e.g. a different campaign/scene)
    const startR = cp.r + 20;
    const endR = cp.r - 20;
    const roles = [
        { name: 'Caravan Guard', dialogueId: null, color: '#8a8a8a' },
        { name: 'Caravan Merchant', dialogueId: null, color: '#c9a35a' },
        { name: 'Caravan Merchant', dialogueId: null, color: '#c9a35a' },
    ];
    const memberIds = [];
    roles.forEach((role, i) => {
        const npc = window.buildNPC({
            name: role.name, title: 'Traveling South', race: 'human', gender: i % 2 === 0 ? 'male' : 'female',
            hex: { q: cp.q, r: startR - i }, side: 'neutral', factionId: 'silverhart_kingdom', color: role.color,
            dialogueId: 'caravan_merchant'
        });
        npc.prefersRoads = true;
        npc.isCaravanMember = true;
        npc.destination = { q: cp.q, r: endR - i };
        window.entities.push(npc);
        memberIds.push(npc.id);
    });
    // hiredGuard/ambushAt/ambushed/rewardPaid/raided: see talkToNPC's
    // 'caravan_merchant' dialogue (campaign2Dialogue.js), checkCaravanAmbush,
    // and raidCaravan below.
    window._activeCaravan = { memberIds, hiredGuard: false, raided: false };
}

// Checked every tickWorldPulse call: has the caravan finished crossing (every
// member arrived at its destination, i.e. destination cleared by the normal
// real-time movement system) or died? Either way, it's done — remove it so
// it doesn't just stand at the map edge forever.
function checkCaravanDespawn() {
    if (!window._activeCaravan) return;
    const caravan = window._activeCaravan;
    const members = window.entities.filter(e => caravan.memberIds.includes(e.id));
    const allDone = members.every(e => !e.alive || !e.destination);
    if (!allDone) return;
    // Pay the hired-guard fee once the crossing's actually done — win or
    // lose the ambush along the way, surviving members making it to the far
    // end is what the merchants are paying for.
    if (caravan.hiredGuard && !caravan.raided && members.some(e => e.alive)) {
        const reward = 50;
        window.player.gold = (window.player.gold || 0) + reward;
        if (window.adjustReputation && window.factions?.silverhart_kingdom) {
            window.adjustReputation(window.factions.silverhart_kingdom, 5, 5);
        }
        if (window.showMessage) window.showMessage(`The merchants pay you ${reward} gold for seeing them through safely.`);
    }
    // Drop every surviving caravan member once the crossing's done; a dead
    // one stays behind as a body, same convention as random wilderness
    // encounters (see pruneDistantEncounterCorpses, campaign2Dialogue.js).
    window.entities = window.entities.filter(e => !(caravan.memberIds.includes(e.id) && e.alive));
    window._activeCaravan = null;
}

// D3: hiring on as a caravan guard (see the 'caravan_merchant' dialogue,
// campaign2Dialogue.js) carries a real risk — once hired, a single ambush
// roll is scheduled for sometime later in the crossing. Bandits spawn near
// the caravan's current position and, being 'enemy' side, engage the player
// directly (the same default targeting every other bandit already uses —
// see the opponentSide resolution in gameEngine.js's tryAttack/AI code).
function checkCaravanAmbush() {
    const caravan = window._activeCaravan;
    if (!caravan || !caravan.hiredGuard || caravan.ambushed || caravan.raided) return;
    if ((window.worldSeconds || 0) < (caravan.ambushAt || Infinity)) return;
    caravan.ambushed = true;
    const members = window.entities.filter(e => caravan.memberIds.includes(e.id) && e.alive);
    const anchor = members[0]?.hex;
    if (!anchor) return;
    const count = 2 + Math.floor(Math.random() * 2); // 2-3 brigands
    for (let i = 0; i < count; i++) {
        const hex = { q: anchor.q + (i % 2 === 0 ? 1 : -1), r: anchor.r + Math.floor(i / 2) + 1 };
        const bandit = window.createMonster('bandit', hex, null, null, 'enemy');
        bandit.isRandomEncounter = true;
        window.entities.push(bandit);
    }
    if (window.recordWorldEvent) window.recordWorldEvent('caravan_ambushed', "Brigands hit the caravan on the road south — the guard held them off, from what folk say.", 'aldervale');
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
}
window.checkCaravanAmbush = checkCaravanAmbush;

// D3: robbing the caravan yourself instead of guarding it — instant coin,
// but it's a crime against the crown's own trade, and it turns the caravan
// hostile (the guard fights back using the same 'enemy' targeting every
// other hostile entity already uses).
function raidCaravan() {
    const caravan = window._activeCaravan;
    if (!caravan || caravan.raided) return;
    caravan.raided = true;
    const members = window.entities.filter(e => caravan.memberIds.includes(e.id) && e.alive);
    members.forEach(e => { e.side = 'enemy'; });
    const loot = 40 + Math.floor(Math.random() * 60);
    window.player.gold = (window.player.gold || 0) + loot;
    if (window.showMessage) window.showMessage(`You seize ${loot} gold from the caravan's strongbox before the guard can react!`);
    if (window.adjustReputation && window.factions?.silverhart_kingdom) {
        window.adjustReputation(window.factions.silverhart_kingdom, -15, 15);
    }
    window.adjustRegionStat?.('aldervale', 'security', -2);
    window.adjustRegionStat?.('aldervale', 'prosperity', -1);
    if (window.recordWorldEvent) window.recordWorldEvent('caravan_raided', "Word is a caravan was robbed in broad daylight on the crossroads road.", 'aldervale');
}
window.raidCaravan = raidCaravan;

// D2: guards react to nearby world events. A bandit_activity event puts
// every patrol-behaviorType entity "on alert" for a day — a temporary
// visionBonus (the same field wolves' keen-scent bonus already uses, see
// canSee/gameEngine.js) so alert guards spot trouble sooner, reflecting
// "word got around, patrols are watching harder" rather than adding a new
// mechanic. Applied/cleared idempotently so calling it repeatedly (once at
// the moment the event fires, once whenever the alert window elapses) never
// double-stacks the bonus.
const GUARD_ALERT_VISION_BONUS = 8;

function applyGuardAlert() {
    const alert = (window.worldSeconds || 0) < (window._guardAlertUntil || 0);
    window.entities.forEach(e => {
        if (!e.alive || e.behaviorType !== 'patrol') return;
        if (alert && !e._guardAlertBonusApplied) {
            e.visionBonus = (e.visionBonus || 0) + GUARD_ALERT_VISION_BONUS;
            e._guardAlertBonusApplied = true;
        } else if (!alert && e._guardAlertBonusApplied) {
            e.visionBonus = (e.visionBonus || 0) - GUARD_ALERT_VISION_BONUS;
            e._guardAlertBonusApplied = false;
        }
    });
}
window.applyGuardAlert = applyGuardAlert;

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

    checkBanditCampSeeding(deltaSeconds);
    checkCaravanDespawn();
    checkCaravanSpawn();
    checkCaravanAmbush();

    // Expire the guard alert once its day is up (the event that started it
    // already applied the bonus at the moment it fired; this only ever
    // needs to *remove* it, but calling the same idempotent function keeps
    // there being exactly one code path for both directions).
    if (window._guardAlertUntil && (window.worldSeconds || 0) >= window._guardAlertUntil) {
        applyGuardAlert();
    }
}

// Most recent rumors first, for NPC smalltalk. An event stops circulating
// as a "current" rumor after ~5 in-game days — old news dies out of the
// tavern on its own instead of NPCs reciting month-old wolf sightings.
const RUMOR_FRESH_SECONDS = 5 * 24 * 3600;
// regionId: optional filter so a given NPC only repeats news about their own
// area (Emberlode's foreman shouldn't be reciting Hollowmere wolf sightings).
function getRecentWorldRumors(n = 2, regionId = null) {
    const now = window.worldSeconds || 0;
    return window.worldEvents
        .filter(ev => now - ev.worldSeconds < RUMOR_FRESH_SECONDS)
        .filter(ev => !regionId || ev.regionId === regionId)
        .slice(-n)
        .reverse()
        .map(ev => ev.text);
}

window.rollWorldPulseEvent = rollWorldPulseEvent;
window.tickWorldPulse = tickWorldPulse;
window.getRecentWorldRumors = getRecentWorldRumors;
window.recordWorldEvent = recordWorldEvent;
window.checkBanditCampSeeding = checkBanditCampSeeding;
window.findBanditCampSite = findBanditCampSite;
window.seedBanditCamp = seedBanditCamp;
window.checkCaravanSpawn = checkCaravanSpawn;
window.checkCaravanDespawn = checkCaravanDespawn;
