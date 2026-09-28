// proactiveQuestGivers.js
// Gives authored Campaign 2 quest NPCs a little agency around a well-known
// player. Helpful NPCs with unseen quest content can approach a player who is
// lingering in a public settlement; frightened civilian quest-givers move away
// from a player they have good reason to expect harm from, then resume their
// ordinary schedule after the immediate danger passes.
(() => {
    'use strict';

    const TICK_MS = 350;
    const PUBLIC_LINGER_MS = 5000;
    const APPROACH_RADIUS = 32;
    const APPROACH_STOP_DISTANCE = 2;
    const APPROACH_COOLDOWN_MS = 5 * 60 * 1000;
    const FEAR_TRIGGER_RADIUS = 12;
    const FEAR_SAFE_DISTANCE = 20;
    const FEAR_CLEAR_MS = 8000;
    const FLEE_SEARCH_RADIUS = 8;

    const BLOCKED_TERRAIN = new Set(['Wall', 'Water', 'Palisade Wall', 'Keep Wall', 'Stone Wall']);
    const states = new Map();
    const dialogueQuestCache = new Map();
    let activeApproacherId = null;
    let publicSince = 0;
    let stationarySince = 0;
    let lastPlayerHexKey = null;
    let lastTickAt = 0;

    function nowMs() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function hexKey(hex) {
        return hex ? `${Math.round(hex.q)},${Math.round(hex.r)}` : '';
    }

    function distance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
    }

    function leader() {
        return (window.entities || []).find(e => e?.alive && e.side === 'player' && !e.rider) || window.player || null;
    }

    function factionFor(npc) {
        return npc?.factionId ? window.factions?.[npc.factionId] || null : null;
    }

    function reputationSignals(npc) {
        const personal = npc?.reputation || null;
        const faction = factionFor(npc);
        return {
            personalStanding: Number(personal?.standing || 0),
            personalKnowledge: Number(personal?.knowledge || 0),
            factionStanding: Number(faction?.standing || 0),
            factionKnowledge: Number(faction?.knowledge || 0),
        };
    }

    function knowsPlayerAsHelper(npc) {
        const r = reputationSignals(npc);
        return (r.personalKnowledge >= 10 && r.personalStanding >= 12)
            || (r.factionKnowledge >= 15 && r.factionStanding >= 20);
    }

    function expectsPlayerHarm(npc) {
        const r = reputationSignals(npc);
        return (r.personalKnowledge >= 10 && r.personalStanding <= -20)
            || (r.factionKnowledge >= 15 && r.factionStanding <= -30);
    }

    function likelyToStandGround(npc) {
        if (!npc) return true;
        if (npc.proactiveCourage === 'flee') return false;
        if (npc.proactiveCourage === 'stand') return true;
        if (npc.combatDirective || npc.side !== 'neutral') return true;
        const role = `${npc.title || ''} ${npc.occupation || ''}`.toLowerCase();
        return /guard|captain|soldier|knight|warrior|warden|chief|queen|king|baron|commander|inquisitor/.test(role);
    }

    function dialogueQuestInfo(dialogueId) {
        if (!dialogueId) return { questLike: false, ids: [] };
        const handler = window.npcDialogueTrees?.[dialogueId];
        if (typeof handler !== 'function') return { questLike: false, ids: [] };
        if (dialogueQuestCache.has(handler)) return dialogueQuestCache.get(handler);

        const source = Function.prototype.toString.call(handler);
        const questLike = /questLog\s*\.\s*push\s*\(/.test(source)
            || /questLog\s*=\s*.*?quest/i.test(source)
            || /Quest added:/.test(source);
        const ids = [];
        const seen = new Set();
        const idPattern = /\bid\s*:\s*['"`]([A-Za-z0-9_-]+)['"`]/g;
        let match;
        while ((match = idPattern.exec(source))) {
            if (!seen.has(match[1])) {
                seen.add(match[1]);
                ids.push(match[1]);
            }
        }
        const info = { questLike, ids };
        dialogueQuestCache.set(handler, info);
        return info;
    }

    function hasUnseenQuestContent(npc) {
        if (!npc || npc.proactiveQuestGiver === false) return false;
        if (npc.proactiveQuestGiver === true) return true;
        const info = dialogueQuestInfo(npc.dialogueId);
        if (!info.questLike) return false;
        if (!info.ids.length) return true;
        const known = new Set((window.questLog || []).map(q => q?.id).filter(Boolean));
        return info.ids.some(id => !known.has(id));
    }

    function isQuestNpc(npc) {
        if (!(npc?.alive && npc.isNPC && npc.side === 'neutral' && npc.dialogueId)) return false;
        if (npc.proactiveQuestGiver === true) return true;
        if (npc.proactiveQuestGiver === false) return false;
        return dialogueQuestInfo(npc.dialogueId).questLike;
    }

    function settlementAt(hex) {
        const fromScale = window.SettlementScale?.settlementAt?.(hex);
        if (fromScale) return fromScale;

        const fallbacks = [
            ['hollowmere', window.campaign2Landmarks?.crossroads, 75],
            ['reddale', window.campaign2ReddaleCenter, 105],
            ['silverhart', window.campaign2SilverhartCenter || window.campaign2PalaceThroneCenter, 170],
            ['millbrook', window.campaign2MillbrookCenter, 70],
        ];
        let best = null;
        let bestDistance = Infinity;
        for (const [id, centre, radius] of fallbacks) {
            if (!centre) continue;
            const d = distance(hex, centre);
            if (d <= radius && d < bestDistance) {
                best = { id, centre, radius };
                bestDistance = d;
            }
        }
        return best;
    }

    function isPublicPlayerLocation(player) {
        if (!player?.hex || !settlementAt(player.hex)) return false;
        const terrain = window.getTerrainAt?.(player.hex.q, player.hex.r)?.name;
        // Cave interiors are dungeons/crypts/mines in Campaign 2, not places
        // where locals plausibly hear that the adventurer is hanging around.
        if (terrain === 'Cave Floor') return false;
        return true;
    }

    function anyBlockingModalOpen() {
        if (typeof document === 'undefined') return false;
        const creator = document.getElementById('characterCreator');
        if (creator && getComputedStyle(creator).display !== 'none') return true;
        return Array.from(document.querySelectorAll('.modal')).some(el => getComputedStyle(el).display !== 'none');
    }

    function occupied(hex, ignore) {
        return (window.entities || []).some(e => e && e !== ignore && e.alive && e.hex
            && Math.round(e.hex.q) === Math.round(hex.q) && Math.round(e.hex.r) === Math.round(hex.r));
    }

    function passable(hex, ignore) {
        if (!hex) return false;
        const terrain = window.getTerrainAt?.(hex.q, hex.r)?.name;
        if (BLOCKED_TERRAIN.has(terrain)) return false;
        return !occupied(hex, ignore);
    }

    function neighbors(hex) {
        if (typeof window.getNeighbors === 'function') return window.getNeighbors(hex.q, hex.r);
        return [
            { q: hex.q + 1, r: hex.r }, { q: hex.q - 1, r: hex.r },
            { q: hex.q, r: hex.r + 1 }, { q: hex.q, r: hex.r - 1 },
            { q: hex.q + 1, r: hex.r - 1 }, { q: hex.q - 1, r: hex.r + 1 },
        ];
    }

    function approachHex(npc, player) {
        const options = neighbors(player.hex).filter(h => passable(h, npc));
        if (!options.length) return { q: player.hex.q, r: player.hex.r };
        options.sort((a, b) => distance(npc.hex, a) - distance(npc.hex, b));
        return { q: options[0].q, r: options[0].r };
    }

    function fleeHex(npc, player) {
        const queue = [{ hex: { q: Math.round(npc.hex.q), r: Math.round(npc.hex.r) }, depth: 0 }];
        const seen = new Set();
        let best = null;
        let bestScore = -Infinity;
        while (queue.length) {
            const current = queue.shift();
            const key = hexKey(current.hex);
            if (seen.has(key)) continue;
            seen.add(key);
            if (current.depth > FLEE_SEARCH_RADIUS) continue;
            if (current.depth > 0 && passable(current.hex, npc)) {
                const playerDistance = distance(current.hex, player.hex);
                const homeDistance = distance(current.hex, npc.hex);
                const score = playerDistance * 10 - homeDistance;
                if (score > bestScore) {
                    bestScore = score;
                    best = current.hex;
                }
            }
            if (current.depth < FLEE_SEARCH_RADIUS) {
                for (const n of neighbors(current.hex)) {
                    if (!seen.has(hexKey(n))) queue.push({ hex: n, depth: current.depth + 1 });
                }
            }
        }
        return best ? { q: best.q, r: best.r } : null;
    }

    function stateFor(npc) {
        const key = String(npc.id);
        if (!states.has(key)) states.set(key, {
            mode: 'idle',
            destination: null,
            cooldownUntil: 0,
            safeSince: 0,
            lastHailAt: 0,
            returnHex: null,
            returnDestination: null,
        });
        return states.get(key);
    }

    function setOwnedDestination(npc, state, destination, mode) {
        if (!destination) return false;
        if (state.mode === 'idle') {
            state.returnHex = npc.hex ? { q: npc.hex.q, r: npc.hex.r } : null;
            state.returnDestination = npc.destination ? { q: npc.destination.q, r: npc.destination.r } : null;
        }
        state.mode = mode;
        state.destination = { q: destination.q, r: destination.r };
        npc.destination = { q: destination.q, r: destination.r };
        npc.prefersRoads = true;
        window.NPCRoutineScheduler?.promoteNpc?.(npc.id, mode === 'flee' ? 'flee-player' : 'proactive-quest');
        return true;
    }

    function releaseNpc(npc, state, cooldown = true) {
        if (activeApproacherId === npc.id) activeApproacherId = null;
        state.mode = 'idle';
        state.destination = null;
        state.safeSince = 0;
        if (cooldown) state.cooldownUntil = nowMs() + APPROACH_COOLDOWN_MS;

        if (window.EventDrivenNamedNpcSchedules?.transitionNow?.(npc.name)) {
            state.returnHex = null;
            state.returnDestination = null;
            return;
        }

        // With the legacy scheduler, restore only this NPC. Calling the global
        // schedule updater here would also overwrite another NPC that is in the
        // middle of fleeing or approaching.
        const returnTarget = state.returnDestination || state.returnHex;
        npc.destination = returnTarget && distance(npc.hex, returnTarget) > 1
            ? { q: returnTarget.q, r: returnTarget.r }
            : null;
        window.NPCRoutineScheduler?.demoteNpc?.(npc.id, 'abstract');
        state.returnHex = null;
        state.returnDestination = null;
    }

    function beginFlee(npc, player, state) {
        if (activeApproacherId === npc.id) activeApproacherId = null;
        const destination = fleeHex(npc, player);
        if (!destination) return false;
        state.safeSince = 0;
        return setOwnedDestination(npc, state, destination, 'flee');
    }

    function maintainFlee(npc, player, state, now) {
        if (!expectsPlayerHarm(npc)) {
            releaseNpc(npc, state, false);
            return;
        }
        const d = distance(npc.hex, player.hex);
        if (d >= FEAR_SAFE_DISTANCE) {
            if (!state.safeSince) state.safeSince = now;
            if (now - state.safeSince >= FEAR_CLEAR_MS) releaseNpc(npc, state, false);
            else npc.destination = state.destination ? { ...state.destination } : npc.destination;
            return;
        }
        state.safeSince = 0;
        if (!state.destination || distance(npc.hex, state.destination) <= 1 || !npc.destination) {
            const destination = fleeHex(npc, player);
            if (destination) state.destination = destination;
        }
        if (state.destination) npc.destination = { ...state.destination };
    }

    function beginApproach(npc, player, state) {
        const destination = approachHex(npc, player);
        activeApproacherId = npc.id;
        state.lastHailAt = 0;
        return setOwnedDestination(npc, state, destination, 'approach');
    }

    function maintainApproach(npc, player, state, now) {
        if (!knowsPlayerAsHelper(npc) || !hasUnseenQuestContent(npc) || !isPublicPlayerLocation(player)) {
            releaseNpc(npc, state);
            return;
        }
        if (expectsPlayerHarm(npc) && !likelyToStandGround(npc)) {
            beginFlee(npc, player, state);
            return;
        }

        const d = distance(npc.hex, player.hex);
        if (d <= APPROACH_STOP_DISTANCE) {
            npc.destination = null;
            state.destination = null;
            state.mode = 'engaged';
            state.lastHailAt = now;
            if (!anyBlockingModalOpen()) {
                window.showMessage?.(`${npc.name} comes over to speak with you.`);
                window.talkToNPC?.(npc);
            }
            return;
        }

        const destination = approachHex(npc, player);
        state.destination = destination;
        npc.destination = { ...destination };
    }

    function maintainEngaged(npc, state, now) {
        if (anyBlockingModalOpen()) return;
        if (now - state.lastHailAt < 600) return;
        releaseNpc(npc, state);
    }

    function updatePublicLinger(player, now) {
        const isPublic = isPublicPlayerLocation(player);
        if (!isPublic) {
            publicSince = 0;
            stationarySince = 0;
            lastPlayerHexKey = null;
            return false;
        }
        if (!publicSince) publicSince = now;

        const key = hexKey(player.hex);
        if (key !== lastPlayerHexKey || player.destination) {
            lastPlayerHexKey = key;
            stationarySince = now;
        } else if (!stationarySince) {
            stationarySince = now;
        }
        return now - publicSince >= PUBLIC_LINGER_MS && now - stationarySince >= PUBLIC_LINGER_MS;
    }

    function eligibleQuestNpcs(player) {
        return (window.entities || []).filter(npc => isQuestNpc(npc) && npc !== player && npc.hex);
    }

    function chooseApproacher(candidates, player, now) {
        return candidates
            .filter(npc => {
                const state = stateFor(npc);
                const d = distance(npc.hex, player.hex);
                return state.mode === 'idle'
                    && now >= state.cooldownUntil
                    && d > APPROACH_STOP_DISTANCE
                    && d <= APPROACH_RADIUS
                    && knowsPlayerAsHelper(npc)
                    && hasUnseenQuestContent(npc)
                    && !expectsPlayerHarm(npc);
            })
            .sort((a, b) => distance(a.hex, player.hex) - distance(b.hex, player.hex))[0] || null;
    }

    function tick() {
        const now = nowMs();
        if (now - lastTickAt < TICK_MS * 0.75) return;
        lastTickAt = now;
        if (window.currentCampaign !== '2' || window.isInCombat) return;
        const player = leader();
        if (!player?.hex) return;

        const candidates = eligibleQuestNpcs(player);

        // Fear wins over every social behaviour. It is deliberately local:
        // bad reputation does not teleport an NPC out of town; they react once
        // the threatening player is actually close enough to matter.
        for (const npc of candidates) {
            const state = stateFor(npc);
            if (state.mode === 'flee') {
                maintainFlee(npc, player, state, now);
                continue;
            }
            if (!likelyToStandGround(npc) && expectsPlayerHarm(npc)
                && distance(npc.hex, player.hex) <= FEAR_TRIGGER_RADIUS) {
                beginFlee(npc, player, state);
            }
        }

        // Maintain the one active approach after fear processing, so an NPC
        // can switch directly from seeking the player to avoiding them if the
        // relationship changes while they are en route.
        if (activeApproacherId !== null) {
            const npc = candidates.find(e => e.id === activeApproacherId);
            if (!npc) {
                activeApproacherId = null;
            } else {
                const state = stateFor(npc);
                if (state.mode === 'approach') maintainApproach(npc, player, state, now);
                else if (state.mode === 'engaged') maintainEngaged(npc, state, now);
                else if (state.mode !== 'flee') activeApproacherId = null;
            }
        }

        if (activeApproacherId === null && updatePublicLinger(player, now) && !anyBlockingModalOpen()) {
            const npc = chooseApproacher(candidates, player, now);
            if (npc) beginApproach(npc, player, stateFor(npc));
        } else if (!isPublicPlayerLocation(player)) {
            updatePublicLinger(player, now);
        }
    }

    function reset() {
        states.clear();
        dialogueQuestCache.clear();
        activeApproacherId = null;
        publicSince = 0;
        stationarySince = 0;
        lastPlayerHexKey = null;
    }

    window.ProactiveQuestGivers = {
        tick,
        reset,
        knowsPlayerAsHelper,
        expectsPlayerHarm,
        likelyToStandGround,
        dialogueQuestInfo,
        hasUnseenQuestContent,
        isPublicPlayerLocation,
        fleeHex,
        approachHex,
        stateFor,
        constants: {
            PUBLIC_LINGER_MS,
            APPROACH_RADIUS,
            APPROACH_STOP_DISTANCE,
            FEAR_TRIGGER_RADIUS,
            FEAR_SAFE_DISTANCE,
            FEAR_CLEAR_MS,
        },
        get activeApproacherId() { return activeApproacherId; },
    };

    setInterval(tick, TICK_MS);
})();
