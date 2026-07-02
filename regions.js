// regions.js
// Security & prosperity for villages/baronies/kingdoms — a "fragile peace"
// simulation layered on top of factions.js's reputation system (which
// tracks how NPCs/factions feel about the player; this tracks how safe and
// well-off a *place* is, independent of anyone's opinion of the player).
//
// Two cascades run in opposite directions:
//   - Player-driven deltas (a quest outcome) ripple weakly UP the chain
//     (village -> barony -> kingdom), mirroring factions.js's
//     cascadeReputation.
//   - Each region's decay target (its "baseline") is set partly by its own
//     local conditions and partly by its PARENT's current stats, cascading
//     DOWN the chain — a thriving kingdom raises the floor every village
//     under it decays toward ("the baron sends more patrols"). This is the
//     new mechanism: it's what lets a high-level player fix a kingdom-tier
//     problem once and have it lift every village underneath, instead of
//     re-visiting each one.
//
// Security and prosperity also feed each other: a region's own prosperity
// (once high enough) adds to its security baseline too — prosperous places
// attract trade, which brings guards and traffic, which makes them safer.
// This is deliberately a slow, decay-based approach, not an instant fix —
// "fragile peace," not a switch.

window.regions = {
    hollowmere: {
        id: 'hollowmere', name: 'Hollowmere', tier: 'village', parentId: 'aldervale',
        security: 50, prosperity: 40,
        localSecurityFloor: 35, localProsperityFloor: 25
    },
    aldervale: {
        id: 'aldervale', name: 'Aldervale', tier: 'barony', parentId: 'silverhart_kingdom',
        security: 50, prosperity: 45,
        localSecurityFloor: 40, localProsperityFloor: 35
    },
    silverhart_kingdom: {
        id: 'silverhart_kingdom', name: 'The Silverhart Kingdom', tier: 'kingdom', parentId: null,
        security: 55, prosperity: 50,
        localSecurityFloor: 55, localProsperityFloor: 50
    }
};

// How much of a parent's current stat lifts (or drags down) its child's
// baseline. Deliberately well under 1 — a region's own conditions still
// dominate; the parent's strength is a supporting tide, not a fix-all.
const PARENT_BASELINE_WEIGHT = 0.4;

// Prosperity high enough starts pulling security up too (trade -> guards).
// Below this threshold, prosperity doesn't affect the security baseline.
const PROSPERITY_SECURITY_THRESHOLD = 60;
const PROSPERITY_SECURITY_WEIGHT = 0.3;

function getRegionBaseline(region, stat) {
    const localFloor = stat === 'security' ? region.localSecurityFloor : region.localProsperityFloor;
    const parent = region.parentId && window.regions[region.parentId];
    let baseline = localFloor + (parent ? PARENT_BASELINE_WEIGHT * parent[stat] : 0);
    if (stat === 'security' && region.prosperity > PROSPERITY_SECURITY_THRESHOLD) {
        baseline += (region.prosperity - PROSPERITY_SECURITY_THRESHOLD) * PROSPERITY_SECURITY_WEIGHT;
    }
    return Math.max(0, Math.min(100, baseline));
}

// Direct, player-driven change to one region's stat (e.g. a quest reward) —
// applied immediately, clamped, not run through decay.
function adjustRegionStat(regionId, stat, delta) {
    const region = window.regions[regionId];
    if (!region) return;
    region[stat] = Math.max(0, Math.min(100, region[stat] + delta));
}

// Same as adjustRegionStat, but ripples a shrinking fraction of the delta
// up the parent chain — mirrors factions.js's cascadeReputation, just
// walking parentId links instead of an explicit passed-in chain.
function cascadeRegionStat(regionId, stat, delta, falloff = 0.3) {
    let region = window.regions[regionId];
    let mult = 1;
    while (region) {
        adjustRegionStat(region.id, stat, delta * mult);
        mult *= falloff;
        region = region.parentId && window.regions[region.parentId];
    }
}

// Autonomous decay toward each region's baseline, on the world clock —
// independent of whether the player is anywhere near it. Deliberately
// slow: a region should visibly drift back toward its baseline over
// real in-game days, not snap to it.
const DECAY_RATE_PER_HOUR = 0.01;

function tickRegions(deltaSeconds) {
    const hours = deltaSeconds / 3600;
    for (const id in window.regions) {
        const region = window.regions[id];
        ['security', 'prosperity'].forEach(stat => {
            const baseline = getRegionBaseline(region, stat);
            // Exponential approach to the baseline rather than a linear Euler
            // step — unconditionally stable no matter how large deltaSeconds
            // is (e.g. a backgrounded tab resuming after a long real-time
            // gap), never overshoots past the baseline.
            region[stat] = baseline + (region[stat] - baseline) * Math.exp(-DECAY_RATE_PER_HOUR * hours);
            region[stat] = Math.max(0, Math.min(100, region[stat]));
        });
    }
}

window.getRegionBaseline = getRegionBaseline;
window.adjustRegionStat = adjustRegionStat;
window.cascadeRegionStat = cascadeRegionStat;
window.tickRegions = tickRegions;
