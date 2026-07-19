// ironbondArc.js
// The Ironbond Company vs. the Silverhart throne — a rivalry with two
// tracks, neither ever shown to the player as a raw number:
//
//   surfacePower       — Ironbond's visible wealth/privilege/political reach.
//                         Reuses the existing window.factions.ironbond_company
//                         .merchantInfluence.silverhart_kingdom field (all the
//                         existing gating at >=40 for Reddale's Cut/the spy
//                         quests keeps working unchanged) — inferred by the
//                         player through world signals: watch presence
//                         thinning, Ironbond enforcers becoming common, and
//                         which merchants have the good gear (see
//                         applyIronbondWorldSignals below).
//   crownInfiltration  — the court spy's network growing inside Ironbond.
//                         Brand new. A crown-sider never sees this number
//                         directly; their own quests quietly feed it without
//                         them being told so, which is *why* Ironbond's rise
//                         feels unstoppable even while they're "helping" —
//                         their effort is real, they just can't see the
//                         ledger it lands in until the late-game reveal. An
//                         Ironbond-sider is let in early and has to actively
//                         suppress it (mole-hunt quests) before their own
//                         surfacePower growth means anything real.
//
// Both tracks climb passively on their own clock (tickIronbondArc), same
// "the world doesn't wait for you" principle as window.factionAgendas — so
// procrastinating is never free, on either side, and not picking a side at
// all just means the eventual resolution happens to the player instead of
// with them (see the no-side ambient epilogue in checkIronbondArcEndgame).

window.ironbondArc = {
    playerSide: null,             // 'crown' | 'ironbond' | null (never committed)
    phase: 'early',                // 'early' -> 'mid' -> 'end'
    sideChosenAtWorldSeconds: null,
    crownInfiltration: 5,          // 0-100, hidden
    crownInfiltrationRevealed: false, // has the player been told this track exists at all
    midMissionsCompleted: 0,
    tempSurfaceDriftModifiers: [], // [{ perHour, expiresAtWorldSeconds }]
    permSurfaceDriftPerHour: 0,     // accumulated permanent reduction (crown-side early quests)
    endgameTriggered: false,
    endgamePending: false,          // eligible, waiting on the next approach-dialogue check
    endgameQuadrant: null,          // 'coup' | 'counter_raid' | 'hard_mopup' | 'clean_sweep'
    endgameStage: 1,                // only meaningful for clean_sweep/ironbond's 2-stage comeback (see campaign2World.js)
    endgameResolution: null,
};

const IRONBOND_ARC_EARLY_PHASE_HOURS = 24;      // in-game hours after a side is chosen before "mid" begins
const IRONBOND_ARC_MIN_MID_MISSIONS = 3;         // repeatable missions required before the endgame can trigger
const IRONBOND_ARC_MIN_MID_PHASE_HOURS = 48;     // plus a minimum stretch of in-game time in mid phase
const SURFACE_POWER_BASE_DRIFT_PER_HOUR = 0.4;   // always climbing — Ironbond doesn't wait on the player
const CROWN_INFILTRATION_BASE_DRIFT_PER_HOUR = 0.3; // always climbing — the spy network builds itself

function getSurfacePower() {
    return window.factions?.ironbond_company?.merchantInfluence?.silverhart_kingdom ?? 0;
}
window.getSurfacePower = getSurfacePower;

function adjustSurfacePower(delta) {
    if (!window.factions?.ironbond_company) return;
    window.adjustMerchantInfluence(window.factions.ironbond_company, 'silverhart_kingdom', delta);
}
window.adjustSurfacePower = adjustSurfacePower;

function adjustCrownInfiltration(delta) {
    const arc = window.ironbondArc;
    arc.crownInfiltration = Math.max(0, Math.min(100, arc.crownInfiltration + delta));
}
window.adjustCrownInfiltration = adjustCrownInfiltration;

// Called once from the tavern shakedown's resolution (encourage_pay ->
// 'ironbond', fight -> 'crown') and reinforced the first time either side's
// repeatable-mission NPC hands the player a real mission. stay_out leaves
// the player uncommitted — the tracks still drift, they just never get
// offered either side's missions or breadcrumbs.
function setIronbondArcSide(side) {
    const arc = window.ironbondArc;
    if (arc.playerSide) return; // first commitment sticks
    arc.playerSide = side;
    arc.sideChosenAtWorldSeconds = window.worldSeconds || 0;
}
window.setIronbondArcSide = setIronbondArcSide;

// Instant, temporary, and permanent knockdowns against surfacePower's climb
// — the early crown-sider's "stalling tactics" toolkit. Temporary modifiers
// expire on their own; permanent ones accumulate forever (but the whole
// point is they taper off in usefulness as surfacePower's base drift and
// crownInfiltration's importance grow past them).
function applyTempSurfaceDriftReduction(perHour, hours) {
    window.ironbondArc.tempSurfaceDriftModifiers.push({
        perHour: -Math.abs(perHour),
        expiresAtWorldSeconds: (window.worldSeconds || 0) + hours * 3600,
    });
}
window.applyTempSurfaceDriftReduction = applyTempSurfaceDriftReduction;

function applyPermSurfaceDriftReduction(perHour) {
    window.ironbondArc.permSurfaceDriftPerHour -= Math.abs(perHour);
}
window.applyPermSurfaceDriftReduction = applyPermSurfaceDriftReduction;

// Repeatable mid-game missions — same shape as window.WAR_MISSION_TYPES/
// offerWarMission/completeWarMission (gameEngine.js), so the mid-game never
// runs dry waiting on scripted content: Reeve Finch (crown) and Guildmaster
// Petra Voss (ironbond) can hand these out on a cooldown indefinitely.
window.IRONBOND_ARC_MISSION_TYPES = {
    // Crown-side, early: hits surfacePower directly — explicitly "buying
    // time," not a path to victory (see the design note above).
    disrupt_shipment: { side: 'crown', label: 'Disrupt an Ironbond shipment', surfaceDelta: -6 },
    audit_ledgers: { side: 'crown', label: 'Audit a Company ledger', surfaceDelta: -4, tempPerHour: 0.05, tempHours: 48 },
    rally_watch: { side: 'crown', label: 'Rally the city watch', permPerHour: 0.015 },
    // Crown-side, mid/late: quietly feeds crownInfiltration instead — the
    // player is never told this is what these accomplish.
    feed_informant: { side: 'crown', label: "Pass word to a nervous Company clerk", infiltrationDelta: 8 },
    protect_asset: { side: 'crown', label: 'Protect a frightened witness', infiltrationDelta: 10 },
    // Ironbond-side: a mix of growing surfacePower and suppressing
    // crownInfiltration, present at every phase (no taper — see design note).
    expand_trade: { side: 'ironbond', label: 'Expand Company trade routes', surfaceDelta: 6 },
    bribe_official: { side: 'ironbond', label: 'Bribe a kingdom official', surfaceDelta: 8 },
    root_out_mole: { side: 'ironbond', label: 'Root out a suspected mole', infiltrationDelta: -8 },
    secure_loyalty: { side: 'ironbond', label: "Secure a lieutenant's loyalty", infiltrationDelta: -6, surfaceDelta: 2 },
};

function offerIronbondArcMission(type) {
    const spec = window.IRONBOND_ARC_MISSION_TYPES[type];
    if (!spec) return null;
    window.questLog = window.questLog || [];
    const mission = {
        id: `ironbond_arc_mission_${type}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        type, title: spec.label, status: 'active', isIronbondArcMission: true,
    };
    window.questLog.push(mission);
    window.showMessage(`New mission: ${spec.label}`);
    return mission;
}
window.offerIronbondArcMission = offerIronbondArcMission;

function completeIronbondArcMission(missionId) {
    const mission = (window.questLog || []).find(q => q.id === missionId);
    if (!mission || mission.status !== 'active') return;
    const spec = window.IRONBOND_ARC_MISSION_TYPES[mission.type];
    if (!spec) return;
    mission.status = 'completed';
    setIronbondArcSide(spec.side);
    if (spec.surfaceDelta) adjustSurfacePower(spec.surfaceDelta);
    if (spec.infiltrationDelta) adjustCrownInfiltration(spec.infiltrationDelta);
    if (spec.tempPerHour) applyTempSurfaceDriftReduction(spec.tempPerHour, spec.tempHours);
    if (spec.permPerHour) applyPermSurfaceDriftReduction(spec.permPerHour);
    window.ironbondArc.midMissionsCompleted++;
    window.showMessage(`Mission complete: ${spec.label}.`);
}
window.completeIronbondArcMission = completeIronbondArcMission;

// World signal: surfacePower is never shown as a number, only inferred. The
// one place it's a genuine mechanical gate (not just flavor) is the merchant
// pair — Ironbond's quartermaster only has good stock once surfacePower is
// real (see ironbond_merchant in campaign2Dialogue.js), and Silverhart's own
// general-goods merchant's best stock dries up under the same threshold
// (see silverhart_general_goods) unless the player's kingdom standing
// compensates. Both read window.getSurfacePower() directly at dialogue time
// — no entity flags to keep in sync here, just the one shared getter.
//
// A stronger signal (thinning city-watch patrols, more Ironbond enforcers
// underfoot) is deliberately left as a future addition: it would need a real
// AI-behavior hook (guards refusing to intervene, or fewer of them spawning)
// that doesn't exist anywhere in the engine yet, and stubbing in an unused
// flag for it here would just be dead state pretending to be a feature.

function tickIronbondArc(deltaSeconds) {
    const arc = window.ironbondArc;
    const hours = deltaSeconds / 3600;
    const now = window.worldSeconds || 0;
    const difficultyDriftFactor = window.difficultyMode === 'easy' ? 0.5 : 1; // easy mode: the plot waits on you more

    // Expire temp modifiers, sum active ones.
    arc.tempSurfaceDriftModifiers = arc.tempSurfaceDriftModifiers.filter(m => m.expiresAtWorldSeconds > now);
    const tempDrift = arc.tempSurfaceDriftModifiers.reduce((sum, m) => sum + m.perHour, 0);

    const surfaceDriftPerHour = SURFACE_POWER_BASE_DRIFT_PER_HOUR + tempDrift + arc.permSurfaceDriftPerHour;
    adjustSurfacePower(surfaceDriftPerHour * hours * difficultyDriftFactor);
    adjustCrownInfiltration(CROWN_INFILTRATION_BASE_DRIFT_PER_HOUR * hours * difficultyDriftFactor);

    // Phase advance: early -> mid once a side is chosen and enough in-game
    // time has passed for that side's "immediate followup" content to have
    // had a chance to happen (not gated on any specific quest, so optional
    // content never blocks the phase clock).
    if (arc.phase === 'early' && arc.playerSide && arc.sideChosenAtWorldSeconds !== null) {
        if (now - arc.sideChosenAtWorldSeconds >= IRONBOND_ARC_EARLY_PHASE_HOURS * 3600) {
            arc.phase = 'mid';
        }
    }

    if (arc.phase === 'mid' && !arc.endgameTriggered) {
        const midPhaseElapsed = now - (arc.sideChosenAtWorldSeconds || 0) - IRONBOND_ARC_EARLY_PHASE_HOURS * 3600;
        const eligible = arc.midMissionsCompleted >= IRONBOND_ARC_MIN_MID_MISSIONS &&
            midPhaseElapsed >= IRONBOND_ARC_MIN_MID_PHASE_HOURS * 3600;
        if (eligible) {
            const sp = getSurfacePower();
            const ci = arc.crownInfiltration;
            // Only fire once the world state has actually resolved into a
            // clear quadrant — a near-tie (40-59) just waits for more drift
            // rather than forcing an ambiguous outcome.
            if ((sp >= 60 || sp < 40) && (ci >= 60 || ci < 40)) {
                arc.endgamePending = true;
            }
        }
    }
}
window.tickIronbondArc = tickIronbondArc;

// Fires the actual confrontation once endgamePending is set — checked
// separately from the tick above (same "check every tick, act once
// conditions are met" shape as checkGuildAssassinTrigger/
// checkWarPressureThresholds) so the approach dialogue only shows once, not
// every tick it stays eligible.
function checkIronbondArcEndgame() {
    const arc = window.ironbondArc;
    if (!arc.endgamePending || arc.endgameTriggered) return;
    arc.endgameTriggered = true;
    arc.endgamePending = false;
    arc.phase = 'end';

    const highSP = getSurfacePower() >= 60;
    const highCI = arc.crownInfiltration >= 60;
    arc.endgameQuadrant = highSP ? (highCI ? 'counter_raid' : 'coup') : (highCI ? 'clean_sweep' : 'hard_mopup');

    // No side ever committed: the world resolves this without the player.
    // Surfaced only as a line of dialogue if/when they later ask someone
    // about it (see silverhart_queen/reddale_guildmaster's ambient checks),
    // not as an interrupting event — consistent with "not picking a side
    // doesn't freeze the world, it just happens without you."
    if (!arc.playerSide) {
        arc.endgameResolution = highSP ? 'ironbond_ascendant_offscreen' : 'crown_secure_offscreen';
        return;
    }

    if (window.launchIronbondArcEndgame) window.launchIronbondArcEndgame();
}
window.checkIronbondArcEndgame = checkIronbondArcEndgame;

window.tickFactionAgendas = (function(original) {
    return function(deltaSeconds) {
        if (original) original(deltaSeconds);
        tickIronbondArc(deltaSeconds);
        checkIronbondArcEndgame();
    };
})(window.tickFactionAgendas);
