// siegeActorSectorIntegration.js
// Connects Northwatch's existing scripted siege actors to the persistent
// six-sector model without replacing their combat AI. Spawn functions remain
// authoritative for pacing/rosters; this layer only gives those actors a
// physical sector objective and lets later waves exploit real breaches.
(() => {
    'use strict';

    let installed = false;
    const INSTALL_RETRY_MS = 25;
    const INSTALL_TIMEOUT_MS = 5000;
    const hexKey = h => `${h.q},${h.r}`;

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function mergeForcedBreaches(s) {
        if (!s?.segments) return s;
        for (const sector of s.segments) {
            if (!Array.isArray(sector.forcedBreachHexes)) sector.forcedBreachHexes = [];
            const merged = new Map((sector.breachHexes || []).map(h => [hexKey(h), { ...h }]));
            sector.forcedBreachHexes.forEach(h => merged.set(hexKey(h), { ...h }));
            sector.breachHexes = [...merged.values()];
            if (sector.breachHexes.length) {
                sector.breached = true;
                sector.status = 'breached';
            }
        }
        window.SiegeSectorSystem?.updateSummary?.(s);
        return s;
    }

    function state() {
        const s = window.siegeState;
        if (s && window.SiegeSectorSystem?.upgradeState) window.SiegeSectorSystem.upgradeState(s);
        if (s) mergeForcedBreaches(s);
        return s;
    }

    function nearestSectorToHex(hex, s = state()) {
        if (!hex || !s?.segments?.length) return null;
        let best = null, bestDistance = Infinity;
        for (const sector of s.segments) {
            for (const wallHex of (sector.wallHexes || [])) {
                const d = distance(hex, wallHex);
                if (d < bestDistance) {
                    bestDistance = d;
                    best = sector;
                }
            }
        }
        return best;
    }

    function sectorTargetHex(sector, fallback = null) {
        if (!sector) return fallback ? { ...fallback } : null;
        if (sector.breachHexes?.length) return { ...sector.breachHexes[0] };
        const center = window.campaign2NorthwatchCenter;
        if (!sector.wallHexes?.length) return fallback ? { ...fallback } : center ? { ...center } : null;
        // Use the wall hex nearest the fort centre as the sector's stable
        // objective. It is deterministic and keeps abstract/local state tied
        // to a real piece of fort geometry.
        let best = sector.wallHexes[0];
        for (const h of sector.wallHexes) {
            if (distance(h, center) < distance(best, center)) best = h;
        }
        return { ...best };
    }

    function chooseAssaultSector(s = state()) {
        if (!s?.segments?.length) return null;
        const breached = s.segments.filter(x => x.breached || x.breachHexes?.length);
        const candidates = breached.length ? breached : s.segments;
        let best = candidates[0];
        for (const sector of candidates.slice(1)) {
            const p = window.SiegeSectorSystem?.localPressure?.(sector) ?? 0;
            const bp = window.SiegeSectorSystem?.localPressure?.(best) ?? 0;
            if (p > bp) best = sector;
        }
        return best;
    }

    function appendEvent(sector, event) {
        if (!sector) return;
        sector.eventLog = Array.isArray(sector.eventLog) ? sector.eventLog : [];
        sector.eventLog.push({ worldSeconds: window.worldSeconds || 0, ...event });
        if (sector.eventLog.length > 20) sector.eventLog.splice(0, sector.eventLog.length - 20);
    }

    function noteSectorActor(sector, entity, role) {
        if (!sector || !entity) return;
        appendEvent(sector, {
            type: 'actor_assigned',
            role,
            entityId: entity.id,
            entityName: entity.name,
        });
    }

    function recordForcedBreach(sectorId, breachHex, source, moraleShock = 12) {
        const s = state();
        const sector = s?.segments?.find(x => x.id === sectorId) || s?.segments?.[sectorId];
        if (!sector || !breachHex) return false;
        sector.forcedBreachHexes = Array.isArray(sector.forcedBreachHexes) ? sector.forcedBreachHexes : [];
        if (!sector.forcedBreachHexes.some(h => h.q === breachHex.q && h.r === breachHex.r)) {
            sector.forcedBreachHexes.push({ q: breachHex.q, r: breachHex.r });
            sector.morale = Math.max(0, (Number.isFinite(sector.morale) ? sector.morale : 100) - moraleShock);
            appendEvent(sector, { type: source, q: breachHex.q, r: breachHex.r, moraleShock });
        }
        mergeForcedBreaches(s);
        return true;
    }

    function syncResolvedEngineBreaches() {
        const s = window.siegeState;
        if (!s?.segments?.length) return false;
        let changed = false;
        const ram = window.campaign2NorthwatchRam;
        if (ram && ram.roundsRemaining <= 0 && ram.siegeSectorId !== undefined && !ram._sectorBreachRecorded) {
            const gate = window.campaign2NorthwatchGateHex || ram.siegeTargetHex;
            if (gate && window.getTerrainAt?.(gate.q, gate.r)?.name === 'Rubble') {
                changed = recordForcedBreach(ram.siegeSectorId, gate, 'ram_breach', 16) || changed;
                ram._sectorBreachRecorded = true;
            }
        }
        const sapper = window.campaign2NorthwatchSapper;
        if (sapper && sapper.roundsRemaining <= 0 && sapper.siegeSectorId !== undefined && !sapper._sectorBreachRecorded) {
            const target = sapper.siegeTargetHex;
            if (target && window.getTerrainAt?.(target.q, target.r)?.name === 'Rubble') {
                changed = recordForcedBreach(sapper.siegeSectorId, target, 'sapper_breach', 20) || changed;
                sapper._sectorBreachRecorded = true;
            }
        }
        if (!changed) mergeForcedBreaches(s);
        return changed;
    }

    function bindActor(entity, sector, role, fallbackHex = null) {
        if (!entity || !sector) return false;
        const target = sectorTargetHex(sector, fallbackHex);
        entity.siegeSectorId = sector.id;
        entity.siegeRole = role;
        if (target) {
            entity.siegeTargetHex = { ...target };
            entity.combatDirective = entity.combatDirective || {};
            entity.combatDirective.siegeObjective = { hex: { ...target } };
        }
        noteSectorActor(sector, entity, role);
        return true;
    }

    function newlyCreated(beforeIds, predicate = () => true) {
        return (window.entities || []).filter(e => !beforeIds.has(e.id) && predicate(e));
    }

    function bindInitialWave(entities) {
        const s = state();
        if (!s) return;
        const gate = window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter;
        const sector = nearestSectorToHex(gate, s) || chooseAssaultSector(s);
        entities.forEach(e => bindActor(e, sector, 'assault-wave-1', gate));
        s.primaryAssaultSectorId = sector?.id ?? null;
    }

    function bindRamAndSapper() {
        const s = state();
        if (!s) return;
        const gate = window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter;
        const ram = window.campaign2NorthwatchRam;
        const sapper = window.campaign2NorthwatchSapper;
        if (ram) {
            const gateSector = nearestSectorToHex(gate, s);
            bindActor(ram, gateSector, 'battering-ram', gate);
            if (gateSector) s.gateSectorId = gateSector.id;
        }
        if (sapper) {
            const rearTarget = sapper.siegeTargetHex;
            const rearSector = nearestSectorToHex(rearTarget, s);
            bindActor(sapper, rearSector, 'sapper', rearTarget);
            if (rearSector) s.sapperSectorId = rearSector.id;
        }
    }

    function bindReinforcementWave(entities, role) {
        syncResolvedEngineBreaches();
        const s = state();
        if (!s) return;
        const sector = chooseAssaultSector(s);
        const fallback = window.campaign2NorthwatchGateHex || window.campaign2NorthwatchCenter;
        entities.forEach(e => bindActor(e, sector, role, fallback));
        if (sector) s.primaryAssaultSectorId = sector.id;
    }

    function bindCatapultFromPhysicalDamage(catapult, beforeIntegrity) {
        const s = state();
        if (!s?.segments?.length) return;
        window.SiegeSectorSystem?.refreshAllWallStates?.(s);
        mergeForcedBreaches(s);
        let struck = null, biggestLoss = 0;
        for (const sector of s.segments) {
            const before = beforeIntegrity.get(sector.id) ?? sector.wallIntegrity;
            const loss = before - sector.wallIntegrity;
            if (loss > biggestLoss) { biggestLoss = loss; struck = sector; }
        }
        if (!struck) struck = nearestSectorToHex(catapult?.hex, s);
        if (catapult && struck) {
            catapult.siegeSectorId = struck.id;
            catapult.siegeRole = 'catapult';
            catapult.siegeTargetHex = sectorTargetHex(struck);
            noteSectorActor(struck, catapult, 'catapult-shot');
            s.catapultSectorId = struck.id;
            window.SiegeSectorSystem?.updateSummary?.(s);
        }
    }

    function wrapSpawner(name, binder) {
        const fn = window[name];
        if (typeof fn !== 'function') return false;
        if (fn.__siegeSectorActorWrapper) return true;
        const wrapped = function(...args) {
            const beforeIds = new Set((window.entities || []).map(e => e.id));
            const result = fn.apply(this, args);
            binder(newlyCreated(beforeIds, e => e.factionTag === 'greenskin_assault' || e.isBatteringRam || e.isSiegeSapper));
            return result;
        };
        wrapped.__siegeSectorActorWrapper = true;
        wrapped.__original = fn;
        window[name] = wrapped;
        return true;
    }

    function install() {
        if (installed) return true;
        if (!window.SiegeSectorSystem || typeof window.spawnGreenskinAssaultWave !== 'function') return false;

        wrapSpawner('spawnGreenskinAssaultWave', bindInitialWave);
        wrapSpawner('spawnBatteringRamAndSapper', () => bindRamAndSapper());
        wrapSpawner('spawnSecondGreenskinWave', entities => bindReinforcementWave(entities, 'assault-wave-2'));
        wrapSpawner('spawnThirdGreenskinWave', entities => bindReinforcementWave(entities, 'assault-wave-3'));

        const fire = window.fireCatapultShot;
        if (typeof fire === 'function' && !fire.__siegeSectorActorWrapper) {
            const wrappedFire = function(catapult, ...args) {
                const s = state();
                const before = new Map((s?.segments || []).map(x => [x.id, x.wallIntegrity]));
                const result = fire.call(this, catapult, ...args);
                bindCatapultFromPhysicalDamage(catapult, before);
                return result;
            };
            wrappedFire.__siegeSectorActorWrapper = true;
            wrappedFire.__original = fire;
            window.fireCatapultShot = wrappedFire;
        }

        // Existing ambient catapult gets an initial sector association even
        // before its first shot; the first real hit will refine this using
        // actual wall-integrity loss.
        if (window.campaign2NorthwatchCatapult) {
            const s = state() || window.activateNorthwatchSiege?.();
            if (s) {
                const sector = nearestSectorToHex(window.campaign2NorthwatchCatapult.hex, s);
                if (sector) {
                    window.campaign2NorthwatchCatapult.siegeSectorId = sector.id;
                    window.campaign2NorthwatchCatapult.siegeRole = 'catapult';
                    s.catapultSectorId = sector.id;
                }
            }
        }

        installed = true;
        return true;
    }

    window.SiegeActorSectorIntegration = {
        install,
        nearestSectorToHex,
        sectorTargetHex,
        chooseAssaultSector,
        bindActor,
        bindRamAndSapper,
        bindReinforcementWave,
        recordForcedBreach,
        syncResolvedEngineBreaches,
        mergeForcedBreaches,
    };

    if (install()) return;
    const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    setTimeout(() => clearInterval(timer), INSTALL_TIMEOUT_MS);
})();
