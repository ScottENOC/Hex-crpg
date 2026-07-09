// lichHunt.js
// The other half of "you can become a lich, but what then": once
// window.playerIsLich is true, the crown's attention (crownAwareness, 0-100)
// climbs on its own, same "the world doesn't wait for you" principle as
// ironbondArc.js's tracks. Crossing a threshold sends a real hunting party
// after the player — repelling one buys a respite (awareness drops back,
// not to zero) but doesn't end it permanently. The source (a chapterhouse,
// see buildLichChapterhouse in campaign2World.js) can be found and
// destroyed for a real, permanent resolution — deliberately scoped to a
// regional fight, not an assault on the capital (that's out of scope while
// the capital itself is being redesigned).

window.lichHuntState = {
    active: false,             // true once the player has ever been a lich this game
    crownAwareness: 0,         // 0-100
    wavesSurvived: 0,
    huntTriggered: false,      // a hunting-party encounter is currently live
    chapterhouseRevealed: false,
    chapterhouseDestroyed: false,
};

const LICH_HUNT_AWARENESS_BASE_DRIFT_PER_HOUR = 0.5;
const LICH_HUNT_KILL_AWARENESS_BUMP = 4; // killing a human while a known lich draws more attention
const LICH_HUNT_THRESHOLD = 60;
const LICH_HUNT_RESET_AFTER_WIN = 20; // partial reset — repelling a wave buys time, doesn't erase the problem

const LICH_HUNTER_SPECS = [
    { name: 'Witch Hunter', title: 'Witch Hunter', race: 'human', gender: 'male', classLevels: ['fighter', 'fighter'], skillPicks: ['health', 'sword_hit', 'sword_dmg', 'light_armor_training'], equipment: ['sword', 'light_armor'], factionId: 'silverhart_kingdom', color: '#a0a0a0', expValue: 250, gold: 20 },
    { name: 'Witch Hunter', title: 'Witch Hunter', race: 'human', gender: 'female', classLevels: ['fighter', 'rogue'], skillPicks: ['health', 'bow_hit', 'bow_dmg'], equipment: ['bow', 'light_armor'], factionId: 'silverhart_kingdom', color: '#909090', expValue: 250, gold: 20 },
];

function tickLichHunt(deltaSeconds) {
    if (!window.playerIsLich) return;
    const state = window.lichHuntState;
    state.active = true;
    if (!state.chapterhouseDestroyed) {
        const hours = deltaSeconds / 3600;
        state.crownAwareness = Math.min(100, state.crownAwareness + LICH_HUNT_AWARENESS_BASE_DRIFT_PER_HOUR * hours);
    }
    checkLichHuntTrigger();
}
window.tickLichHunt = tickLichHunt;

// Called from handleLethalDamage (gameEngine.js) whenever a known lich kills
// a living human — being seen doing it draws more attention than just
// existing quietly does.
function bumpLichHuntAwarenessFromKill() {
    if (!window.playerIsLich || window.lichHuntState.chapterhouseDestroyed) return;
    window.lichHuntState.crownAwareness = Math.min(100, window.lichHuntState.crownAwareness + LICH_HUNT_KILL_AWARENESS_BUMP);
}
window.bumpLichHuntAwarenessFromKill = bumpLichHuntAwarenessFromKill;

function checkLichHuntTrigger() {
    const state = window.lichHuntState;
    if (!state.active || state.huntTriggered || state.chapterhouseDestroyed || state.crownAwareness < LICH_HUNT_THRESHOLD) return;
    const player = window.entities.find(e => e.side === 'player' && !e.rider);
    if (!player || !window.buildNPC) return;

    state.huntTriggered = true;
    const waveSize = Math.min(2 + state.wavesSurvived, 5);
    for (let i = 0; i < waveSize; i++) {
        const spec = LICH_HUNTER_SPECS[i % LICH_HUNTER_SPECS.length];
        const hunter = window.buildNPC({ ...spec, name: `${spec.name} ${i + 1}`, hex: { q: player.hex.q + 8 + i, r: player.hex.r - 6 }, side: 'enemy' });
        hunter.aiState = 'combat';
        hunter.isLichHuntCombatant = true;
        window.entities.push(hunter);
    }
    window.showMessage("Word of what you've become has reached the crown — a hunting party finds you, blades already drawn.");

    if (!state.chapterhouseRevealed) {
        state.chapterhouseRevealed = true;
        if (window.revealLichChapterhouseArea) window.revealLichChapterhouseArea();
        window.showMessage("One of them, dying, gasps out where the order that sent them keeps its chapterhouse — you could end this at the source.");
    }
}
window.checkLichHuntTrigger = checkLichHuntTrigger;

// Called from checkCombatEnd (gameEngine.js) once every isLichHuntCombatant
// is dead — a real respite, not a permanent fix, unless the chapterhouse
// itself is later destroyed (see resolveLichChapterhouseDestroyed below).
function resolveLichHuntWave() {
    const state = window.lichHuntState;
    state.huntTriggered = false;
    state.wavesSurvived++;
    state.crownAwareness = LICH_HUNT_RESET_AFTER_WIN;
    window.showMessage("The hunting party falls. This buys you time — not safety.");
}
window.resolveLichHuntWave = resolveLichHuntWave;

// Same "reveal a radius around a point" mechanism as the dragon lair's
// revealDragonLairArea (campaign2World.js).
function revealLichChapterhouseArea() {
    const center = window.campaign2LichChapterhouseCenter;
    if (!center) return;
    const REVEAL_RADIUS = 10;
    for (let dq = -REVEAL_RADIUS; dq <= REVEAL_RADIUS; dq++) {
        for (let dr = -REVEAL_RADIUS; dr <= REVEAL_RADIUS; dr++) {
            const hex = { q: center.q + dq, r: center.r + dr };
            if (window.distance(center, hex) <= REVEAL_RADIUS) window.exploredHexes.add(`${hex.q},${hex.r}`);
        }
    }
    if (window.drawMap) window.drawMap();
}
window.revealLichChapterhouseArea = revealLichChapterhouseArea;

// Called from checkCombatEnd once every isLichChapterhouseDefender is dead —
// the real, permanent resolution: crownAwareness stops drifting for good,
// no more hunting parties. Deliberately just a message + flag, not a trip to
// the capital — that confrontation is explicitly out of scope for now.
function resolveLichChapterhouseDestroyed() {
    const state = window.lichHuntState;
    if (state.chapterhouseDestroyed) return;
    state.chapterhouseDestroyed = true;
    state.crownAwareness = 0;
    const player = window.party?.[0];
    if (player) player.gold = (player.gold || 0) + 200;
    window.showMessage("The Chapterhouse of the Silver Flame burns. Whatever the crown does about you now, it won't be sending hunting parties again. (+200 gold)");
}
window.resolveLichChapterhouseDestroyed = resolveLichChapterhouseDestroyed;
