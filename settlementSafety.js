// settlementSafety.js
// Central invariant for procedural hostile spawning. Towns and cities are
// authored spaces: random wolves, raiders, hunters, camps, etc. may not appear
// inside a settlement or within ordinary sight of its limits. Deliberately
// authored quest/world enemies are unaffected because only procedural spawn
// systems consult this gate.
(() => {
    'use strict';

    const DEFAULT_VISION_BUFFER = 25;
    const LIMITS = Object.freeze({
        // Hollowmere's rebuilt cottages/fields extend well beyond the original
        // crossroads core. 55 contains the built village, then vision is added.
        hollowmere: 55,
        // Reddale remains a compact walled/roadside town in the current map.
        reddale: 55,
        // Silverhart's city wall is radius ~60; embassies and the Warrens spill
        // just outside it, so 78 is the authored urban limit rather than the
        // much larger descriptive population radius in SettlementScale.
        silverhart: 78,
    });

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function standardVisionBuffer() {
        return Math.max(1, Number(window.LIVE_VISION_RANGE || DEFAULT_VISION_BUFFER));
    }

    function settlementEntries() {
        const scale = window.SettlementScale;
        scale?.seedCampaign2Settlements?.();
        if (!scale?.settlements) return [];
        return [...scale.settlements.values()].filter(s => s?.centre);
    }

    function limitsRadius(settlement) {
        if (!settlement) return 0;
        return Number(settlement.noRandomHostileRadius || LIMITS[settlement.id] || settlement.radius || 0);
    }

    function settlementSafetyAt(hex, extraBuffer = 0) {
        const buffer = standardVisionBuffer() + Math.max(0, Number(extraBuffer || 0));
        let best = null;
        for (const settlement of settlementEntries()) {
            const limit = limitsRadius(settlement);
            const d = distance(hex, settlement.centre);
            if (d <= limit + buffer && (!best || d - limit < best.distanceBeyondLimit)) {
                best = {
                    settlement,
                    distance: d,
                    limitsRadius: limit,
                    visionBuffer: buffer,
                    distanceBeyondLimit: Math.max(0, d - limit),
                };
            }
        }
        return best;
    }

    function isProceduralHostileSpawnBlocked(hex, { extraBuffer = 0 } = {}) {
        if (!hex) return true;
        if (settlementSafetyAt(hex, extraBuffer)) return true;
        // Keep the older hand-authored-site protection too. This covers forts,
        // isolated quest buildings and dungeons which are not settlements.
        const legacy = window.__settlementSafetyOriginalIsNearAnyBuilding;
        if (typeof legacy === 'function' && legacy(hex, standardVisionBuffer() + Math.max(0, Number(extraBuffer || 0)))) return true;
        return false;
    }

    function isProceduralHostileSpawnAllowed(hex, options) {
        return !isProceduralHostileSpawnBlocked(hex, options);
    }

    function installLegacyGates() {
        if (typeof window.isNearAnyBuilding === 'function' && !window.isNearAnyBuilding.__settlementSafety) {
            const original = window.isNearAnyBuilding;
            window.__settlementSafetyOriginalIsNearAnyBuilding = original;
            const wrapped = function(hex, radius = 0) {
                if (original(hex, radius)) return true;
                // worldPulse's bandit-camp finder still calls this older helper;
                // broadening it here makes that path obey the same settlement
                // invariant without changing authored createMonster calls.
                return !!settlementSafetyAt(hex, Math.max(0, Number(radius || 0) - standardVisionBuffer()));
            };
            wrapped.__settlementSafety = true;
            wrapped.__original = original;
            window.isNearAnyBuilding = wrapped;
        }

        // Existing wolf/orc/lich loops dynamically call this window function.
        // Remove the former "dire security" exception completely: low security
        // may enable authored riots/sieges, never arbitrary wilderness spawns in
        // a populated street.
        const proceduralGate = function(hex, radius = 0) {
            return isProceduralHostileSpawnBlocked(hex, {
                extraBuffer: Math.max(0, Number(radius || 0) - standardVisionBuffer()),
            });
        };
        proceduralGate.__settlementSafety = true;
        window.isNearAnyBuildingUnlessDire = proceduralGate;
        return true;
    }

    window.SettlementSafety = {
        LIMITS,
        standardVisionBuffer,
        limitsRadius,
        settlementSafetyAt,
        isProceduralHostileSpawnBlocked,
        isProceduralHostileSpawnAllowed,
        installLegacyGates,
    };

    installLegacyGates();
    const timer = setInterval(() => {
        installLegacyGates();
        if (window.isNearAnyBuilding?.__settlementSafety && window.isNearAnyBuildingUnlessDire?.__settlementSafety) clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 5000);
})();