// trapSystem.js
// Prepared, material-driven traps. Traps are world objects built before combat,
// found with perception, and dismantled with mechanical and/or arcane expertise.
// The legacy `trap_setting` skill key is retained for save compatibility but is
// presented as the broader Traps skill and is no longer a combat action.
(() => {
    'use strict';

    const TRAP_SKILL = 'trap_setting';
    const ARCANA_SKILL = 'arcana';
    const POLL_MS = 250;
    const DETECT_RADIUS = 2;
    const RUNE_MANA_COST = 8;

    const RECIPES = Object.freeze({
        snare: Object.freeze({
            id: 'snare',
            name: 'Snare',
            minRank: 1,
            minutes: 5,
            materials: Object.freeze({ wood: 2 }),
            concealment: 45,
            disarmDifficulty: 45,
            damage: 2,
            tpLoss: 4,
            description: 'A concealed cord-and-spring snare. Cheap and quick, but not subtle work once triggered.'
        }),
        deadfall: Object.freeze({
            id: 'deadfall',
            name: 'Deadfall',
            minRank: 2,
            minutes: 10,
            materials: Object.freeze({ wood: 1, stone: 2 }),
            concealment: 55,
            disarmDifficulty: 58,
            damage: 5,
            tpLoss: 2,
            description: 'A braced weight released by a hidden trigger. Uses timber and quarried stone.'
        }),
        pressure_spikes: Object.freeze({
            id: 'pressure_spikes',
            name: 'Pressure-Plate Spikes',
            minRank: 3,
            minutes: 15,
            materials: Object.freeze({ wood: 1, ore_iron: 1 }),
            concealment: 65,
            disarmDifficulty: 70,
            damage: 8,
            tpLoss: 3,
            description: 'A concealed pressure mechanism driving iron spikes. Harder to spot and harder to dismantle.'
        })
    });

    const RUNE_LAYER = Object.freeze({
        name: 'Tamper Rune',
        materials: Object.freeze({ stone: 1, ore_iron: 1 }),
        minutes: 5,
        baseDifficulty: 55,
        baseDamage: 5,
        description: 'Runes hidden on the disarm mechanism flare when someone tampers with the mundane trigger.'
    });

    function skillRank(actor, key) {
        return Math.max(0, Number(actor?.skills?.[key] || 0));
    }

    function itemName(id) {
        return window.items?.[id]?.name || id.replaceAll('_', ' ');
    }

    function materialsText(materials) {
        return Object.entries(materials).map(([id, n]) => `${n}x ${itemName(id)}`).join(', ');
    }

    function inventoryFor(actor) {
        // Party inventories are normally wired to the same array. Prefer the
        // selected actor's view, then the active player, without inventing a
        // separate trap-material stash.
        return actor?.inventory || window.player?.inventory || [];
    }

    function countItem(inventory, itemId) {
        let count = 0;
        for (const id of inventory) if (id === itemId) count++;
        return count;
    }

    function hasMaterials(actor, materials) {
        const inv = inventoryFor(actor);
        return Object.entries(materials).every(([id, n]) => countItem(inv, id) >= n);
    }

    function consumeMaterials(actor, materials) {
        const oldInv = inventoryFor(actor);
        let inv = oldInv;
        for (const [id, n] of Object.entries(materials)) {
            let removed = 0;
            inv = inv.filter(item => {
                if (item === id && removed < n) {
                    removed++;
                    return false;
                }
                return true;
            });
        }
        actor.inventory = inv;
        if (window.player === actor) window.player.inventory = inv;
        // Shared-party inventories are usually the same reference. If another
        // party record still points at the old array, keep the shared model
        // coherent rather than duplicating harvested materials.
        if (Array.isArray(window.party)) {
            for (const member of window.party) {
                if (member === actor || member.inventory === oldInv) member.inventory = inv;
            }
        }
        return inv;
    }

    function combineMaterials(a, b) {
        const out = { ...a };
        for (const [id, n] of Object.entries(b || {})) out[id] = (out[id] || 0) + n;
        return out;
    }

    function actorKey(actor) {
        return actor?.id || actor?.name || 'unknown';
    }

    function stableUnit(seed) {
        let h = 2166136261;
        const text = String(seed);
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967296;
    }

    function trapAt(q, r) {
        const obj = window.tileObjects?.[`${q},${r}`];
        return obj?.type === 'prepared_trap' ? obj : null;
    }

    function replaceTrap(q, r, patch) {
        const key = `${q},${r}`;
        const old = window.tileObjects?.[key];
        if (!old || old.type !== 'prepared_trap') return null;
        const next = { ...old, ...patch };
        window.tileObjects[key] = next;
        return next;
    }

    function worldHexKey(hex) {
        return `${hex.q},${hex.r}`;
    }

    function canPrepare(actor) {
        return !!actor && skillRank(actor, TRAP_SKILL) > 0 && !window.isInCombat;
    }

    function availableRecipes(actor) {
        const rank = skillRank(actor, TRAP_SKILL);
        return Object.values(RECIPES).filter(recipe => rank >= recipe.minRank);
    }

    function canAddRune(actor) {
        return skillRank(actor, TRAP_SKILL) > 0 && skillRank(actor, ARCANA_SKILL) > 0;
    }

    function suitableTrapHex(hex) {
        if (!hex || !window.tileObjects) return { ok: false, reason: 'No valid location.' };
        const key = worldHexKey(hex);
        if (window.tileObjects[key]) return { ok: false, reason: 'Something already occupies that spot.' };
        const terrain = window.getTerrainAt?.(hex.q, hex.r);
        const name = terrain?.name || '';
        if (name === 'Water' || name === 'Wall' || name === 'Palisade Wall') {
            return { ok: false, reason: `You cannot prepare a trap on ${name || 'that terrain'}.` };
        }
        const occupant = window.getEntityAtHex?.(hex.q, hex.r) ||
            (window.entities || []).find(e => e?.alive && e.hex?.q === hex.q && e.hex?.r === hex.r);
        if (occupant) return { ok: false, reason: `${occupant.name || 'Someone'} is standing there.` };
        return { ok: true };
    }

    function buildTrap(actor, hex, recipeId, addRune = false) {
        const recipe = RECIPES[recipeId];
        if (!actor || !recipe) return { ok: false, reason: 'Unknown trap design.' };
        if (window.isInCombat) return { ok: false, reason: 'There is no time to construct a trap during combat.' };
        const rank = skillRank(actor, TRAP_SKILL);
        if (rank < recipe.minRank) return { ok: false, reason: `Traps rank ${recipe.minRank} is required for ${recipe.name}.` };
        if (addRune && !canAddRune(actor)) {
            return { ok: false, reason: 'A tamper rune requires both Traps and Arcana on the character building it.' };
        }
        const location = suitableTrapHex(hex);
        if (!location.ok) return location;

        const materials = addRune ? combineMaterials(recipe.materials, RUNE_LAYER.materials) : { ...recipe.materials };
        if (!hasMaterials(actor, materials)) {
            return { ok: false, reason: `You need ${materialsText(materials)}.` };
        }
        if (addRune && Number(actor.currentMana || 0) < RUNE_MANA_COST) {
            return { ok: false, reason: `You need ${RUNE_MANA_COST} mana to bind the tamper rune.` };
        }

        consumeMaterials(actor, materials);
        if (addRune) actor.currentMana = Math.max(0, Number(actor.currentMana || 0) - RUNE_MANA_COST);

        const minutes = recipe.minutes + (addRune ? RUNE_LAYER.minutes : 0);
        const concealment = recipe.concealment + Math.max(0, rank - recipe.minRank) * 4;
        const arcanaRank = skillRank(actor, ARCANA_SKILL);
        const trap = {
            type: 'prepared_trap',
            trapVersion: 1,
            recipeId,
            name: recipe.name,
            armed: true,
            spent: false,
            ownerSide: actor.side || 'player',
            ownerName: actor.name || 'Unknown trapper',
            builtAt: Number(window.worldSeconds || 0),
            materials,
            concealment,
            disarmDifficulty: recipe.disarmDifficulty,
            discoveredByPlayer: (actor.side || 'player') === 'player',
            detectionAttempts: {},
            ward: addRune ? {
                type: 'tamper_rune',
                armed: true,
                discoveredByPlayer: (actor.side || 'player') === 'player',
                difficulty: RUNE_LAYER.baseDifficulty + arcanaRank * 5,
                damage: RUNE_LAYER.baseDamage + arcanaRank * 2,
                creatorArcanaRank: arcanaRank
            } : null
        };
        window.tileObjects[worldHexKey(hex)] = trap;
        if (typeof window.updateTime === 'function') window.updateTime(minutes * 60);
        else window.worldSeconds = Number(window.worldSeconds || 0) + minutes * 60;
        if (window.invalidateTerrainBuffer) window.invalidateTerrainBuffer();
        if (window.drawMap) window.drawMap();
        if (window.showInventoryScreen && document.getElementById('inventory-modal')?.style.display === 'block') {
            window.showInventoryScreen();
        }
        return { ok: true, trap, minutes, materials };
    }

    function perceptionScore(actor) {
        const agility = Number(actor?.attributes?.agility ?? actor?.agility ?? 0);
        return 35 + agility * 2 + skillRank(actor, 'keen_perception') * 10;
    }

    function arcanaScore(actor) {
        const intellect = Number(actor?.attributes?.intelligence ?? actor?.attributes?.intellect ?? actor?.intelligence ?? 0);
        return 35 + intellect * 2 + skillRank(actor, ARCANA_SKILL) * 12;
    }

    function attemptDetectTrap(actor, q, r, trap = trapAt(q, r)) {
        if (!actor || !trap || trap.spent || trap.ownerSide === actor.side) return false;
        if (trap.discoveredByPlayer && actor.side === 'player') {
            attemptDetectWard(actor, q, r, trap);
            return true;
        }
        const key = actorKey(actor);
        if (trap.detectionAttempts?.[key]) return false;
        const roll = Math.floor(stableUnit(`${q},${r}|${key}|mechanical`) * 21);
        const detected = perceptionScore(actor) + roll >= trap.concealment;
        const attempts = { ...(trap.detectionAttempts || {}), [key]: true };
        if (detected && actor.side === 'player') {
            trap = replaceTrap(q, r, { detectionAttempts: attempts, discoveredByPlayer: true });
            window.showMessage?.(`${actor.name} notices a concealed ${trap.name || 'trap'}.`);
            attemptDetectWard(actor, q, r, trap);
        } else {
            replaceTrap(q, r, { detectionAttempts: attempts });
        }
        return detected;
    }

    function attemptDetectWard(actor, q, r, trap = trapAt(q, r)) {
        if (!actor || !trap?.ward?.armed || trap.ward.discoveredByPlayer || skillRank(actor, ARCANA_SKILL) <= 0) return false;
        const roll = Math.floor(stableUnit(`${q},${r}|${actorKey(actor)}|ward`) * 21);
        const detected = arcanaScore(actor) + roll >= trap.ward.difficulty;
        if (detected && actor.side === 'player') {
            const ward = { ...trap.ward, discoveredByPlayer: true };
            replaceTrap(q, r, { ward });
            window.showMessage?.(`${actor.name} spots arcane runes hidden around the trap's disarm mechanism.`);
        }
        return detected;
    }

    function nearbyKnownTraps(actor, radius = 1) {
        if (!actor?.hex || !window.tileObjects) return [];
        const found = [];
        for (const [key, obj] of Object.entries(window.tileObjects)) {
            if (obj?.type !== 'prepared_trap' || obj.spent || !obj.discoveredByPlayer) continue;
            const [q, r] = key.split(',').map(Number);
            if (window.distance?.(actor.hex, { q, r }) <= radius) found.push({ q, r, trap: obj });
        }
        return found;
    }

    function triggerDamage(target, amount, label, sourceSide = 'environment') {
        if (!target?.alive || amount <= 0) return;
        target.hp = Number(target.hp || 0) - amount;
        if (Number.isFinite(target.timePoints)) target.timePoints = Math.max(0, target.timePoints);
        window.spawnFloatingText?.(target.hex, `-${amount}`, '#ff4d4d');
        window.showMessage?.(`${target.name} is hit by ${label} for ${amount} damage.`);
        if (target.hp <= 0 && target.alive && window.handleLethalDamage) {
            const owner = (window.entities || []).find(e => e?.side === sourceSide) || { side: sourceSide };
            window.handleLethalDamage(target, owner);
        }
    }

    function triggerTrap(q, r, target, reason = 'step') {
        const trap = trapAt(q, r);
        if (!trap?.armed || trap.spent || !target?.alive) return false;
        const recipe = RECIPES[trap.recipeId] || RECIPES.snare;
        replaceTrap(q, r, { armed: false, spent: true, triggeredBy: target.name || 'unknown', triggeredReason: reason });
        if (recipe.tpLoss && Number.isFinite(target.timePoints)) target.timePoints = Math.max(0, target.timePoints - recipe.tpLoss);
        if (target.destination) target.destination = null;
        triggerDamage(target, recipe.damage, `the ${trap.name || recipe.name}`, trap.ownerSide);
        window.drawMap?.();
        window.renderEntities?.();
        return true;
    }

    function triggerWard(q, r, target) {
        const trap = trapAt(q, r);
        if (!trap?.ward?.armed || !target?.alive) return false;
        const ward = { ...trap.ward, armed: false, triggered: true };
        replaceTrap(q, r, { ward });
        window.showMessage?.(`Runes hidden in the disarm mechanism flare as ${target.name} touches it!`);
        triggerDamage(target, ward.damage || RUNE_LAYER.baseDamage, 'a tamper rune', trap.ownerSide);
        return true;
    }

    function mechanicalDisarmScore(actor) {
        const agility = Number(actor?.attributes?.agility ?? actor?.agility ?? 0);
        return 25 + agility * 2 + skillRank(actor, TRAP_SKILL) * 18;
    }

    function disarmTrap(actor, q, r) {
        const trap = trapAt(q, r);
        if (!actor || !trap || trap.spent || !trap.armed) return { ok: false, reason: 'There is no armed trap there.' };
        if (window.isInCombat) return { ok: false, reason: 'You cannot carefully dismantle a prepared trap during combat.' };
        if (!trap.discoveredByPlayer && actor.side === 'player') return { ok: false, reason: 'You have not found a trap there.' };
        if (skillRank(actor, TRAP_SKILL) <= 0) return { ok: false, reason: 'You need the Traps skill to dismantle the mechanism.' };

        // This is the hybrid-trap sting: the mundane mechanism looks like the
        // obvious problem, but touching it is exactly what the hidden rune is
        // waiting for. A rogue without arcane expertise springs the ward before
        // they ever get to the pressure plate itself.
        if (trap.ward?.armed) {
            const canReadWard = skillRank(actor, ARCANA_SKILL) > 0;
            if (!canReadWard || !trap.ward.discoveredByPlayer) {
                triggerWard(q, r, actor);
                return { ok: false, wardTriggered: true, reason: 'A hidden magical ward triggers when you touch the mechanism.' };
            }
            return { ok: false, wardPresent: true, reason: 'An armed tamper rune protects the mechanism. Suppress it first.' };
        }

        const roll = Math.floor(Math.random() * 21);
        const success = mechanicalDisarmScore(actor) + roll >= trap.disarmDifficulty;
        if (!success) {
            window.showMessage?.(`${actor.name} slips while dismantling the ${trap.name}.`);
            triggerTrap(q, r, actor, 'failed_disarm');
            return { ok: false, triggered: true, reason: 'The mechanical disarm failed and triggered the trap.' };
        }
        replaceTrap(q, r, { armed: false, spent: true, disarmed: true, disarmedBy: actor.name || 'unknown' });
        window.showMessage?.(`${actor.name} safely dismantles the ${trap.name}.`);
        return { ok: true };
    }

    function suppressWard(actor, q, r) {
        const trap = trapAt(q, r);
        if (!actor || !trap?.ward?.armed) return { ok: false, reason: 'There is no active magical ward there.' };
        if (window.isInCombat) return { ok: false, reason: 'You cannot carefully unravel a ward during combat.' };
        if (skillRank(actor, ARCANA_SKILL) <= 0) return { ok: false, reason: 'You need Arcana to understand the ward.' };
        attemptDetectWard(actor, q, r, trap);
        const refreshed = trapAt(q, r);
        if (!refreshed?.ward?.discoveredByPlayer) {
            triggerWard(q, r, actor);
            return { ok: false, triggered: true, reason: 'You misread the hidden rune and set it off.' };
        }
        const roll = Math.floor(Math.random() * 21);
        const success = arcanaScore(actor) + roll >= refreshed.ward.difficulty;
        if (!success) {
            triggerWard(q, r, actor);
            return { ok: false, triggered: true, reason: 'The rune collapses violently while you suppress it.' };
        }
        replaceTrap(q, r, { ward: { ...refreshed.ward, armed: false, suppressed: true, suppressedBy: actor.name || 'unknown' } });
        window.showMessage?.(`${actor.name} unthreads the tamper rune without disturbing the mechanical trap.`);
        return { ok: true };
    }

    function recoverOwnTrap(actor, q, r) {
        const trap = trapAt(q, r);
        if (!actor || !trap || trap.spent || trap.ownerSide !== (actor.side || 'player')) return { ok: false, reason: 'That is not one of your armed traps.' };
        if (window.isInCombat) return { ok: false, reason: 'You cannot pack up a trap during combat.' };
        const inv = inventoryFor(actor);
        for (const [id, n] of Object.entries(trap.materials || {})) {
            const recovered = Math.floor(n / 2);
            for (let i = 0; i < recovered; i++) inv.push(id);
        }
        delete window.tileObjects[`${q},${r}`];
        window.showMessage?.(`${actor.name} packs up the trap, salvaging what can be reused.`);
        return { ok: true };
    }

    function adjacentHexes(actor) {
        if (!actor?.hex) return [];
        const hexes = window.getNeighbors?.(actor.hex.q, actor.hex.r) || [];
        return hexes.map(h => ({ q: h.q, r: h.r }));
    }

    function showResult(result) {
        if (!result?.ok && result?.reason) window.showMessage?.(result.reason);
        return result;
    }

    function chooseLocation(actor, recipeId, addRune) {
        const options = adjacentHexes(actor).map((hex, index) => {
            const check = suitableTrapHex(hex);
            return {
                label: `${check.ok ? 'Prepare' : 'Blocked'} ${index + 1}: (${hex.q}, ${hex.r})${check.ok ? '' : ` — ${check.reason}`}`,
                action: () => {
                    if (!check.ok) return window.showMessage?.(check.reason);
                    const result = buildTrap(actor, hex, recipeId, addRune);
                    if (result.ok) {
                        const runeText = addRune ? ' with a hidden tamper rune' : '';
                        window.showMessage?.(`${actor.name} spends ${result.minutes} minutes preparing a ${RECIPES[recipeId].name}${runeText}.`);
                    } else showResult(result);
                    refreshTrapButtons();
                }
            };
        });
        options.push({ label: 'Cancel.', action: () => {} });
        window.showDialogue?.({ name: 'Prepare Trap' }, 'Choose an adjacent hex. The work takes real world time and consumes the listed materials.', options);
    }

    function openPrepareMenu(actor = window.player) {
        if (!actor) return;
        if (window.isInCombat) return window.showMessage?.('Traps have to be prepared before the fight, not thrown down during it.');
        const recipes = availableRecipes(actor);
        if (!recipes.length) return window.showMessage?.('You do not know how to prepare traps.');
        const options = [];
        for (const recipe of recipes) {
            options.push({
                label: `${recipe.name} — ${materialsText(recipe.materials)}, ${recipe.minutes} min`,
                action: () => chooseLocation(actor, recipe.id, false)
            });
            if (canAddRune(actor)) {
                const hybridMaterials = combineMaterials(recipe.materials, RUNE_LAYER.materials);
                options.push({
                    label: `Hybrid ${recipe.name} + Tamper Rune — ${materialsText(hybridMaterials)}, ${recipe.minutes + RUNE_LAYER.minutes} min, ${RUNE_MANA_COST} mana`,
                    action: () => chooseLocation(actor, recipe.id, true)
                });
            }
        }
        options.push({ label: 'Cancel.', action: () => {} });
        const hybridHint = canAddRune(actor)
            ? ' Your Rogue/Wizard training also lets you hide an arcane tamper rune on the disarm mechanism.'
            : '';
        window.showDialogue?.({ name: 'Prepare Trap' }, `Choose a design.${hybridHint}`, options);
    }

    function openNearbyTrapMenu(actor = window.player) {
        const traps = nearbyKnownTraps(actor, 1);
        if (!traps.length) return window.showMessage?.('There are no discovered traps close enough to work on.');
        const options = [];
        for (const entry of traps) {
            const { q, r, trap } = entry;
            if (trap.ownerSide === (actor.side || 'player')) {
                options.push({ label: `Recover your ${trap.name} at (${q}, ${r})`, action: () => showResult(recoverOwnTrap(actor, q, r)) });
                continue;
            }
            if (trap.ward?.armed && skillRank(actor, ARCANA_SKILL) > 0) {
                options.push({ label: `Suppress ${trap.ward.discoveredByPlayer ? 'Tamper Rune' : 'suspected magic'} at (${q}, ${r})`, action: () => showResult(suppressWard(actor, q, r)) });
            }
            if (skillRank(actor, TRAP_SKILL) > 0) {
                options.push({ label: `Disarm ${trap.name} at (${q}, ${r})`, action: () => showResult(disarmTrap(actor, q, r)) });
            }
        }
        options.push({ label: 'Leave it.', action: () => {} });
        window.showDialogue?.({ name: 'Trap Work' }, 'Work carefully. A mechanism may have more than one layer.', options);
    }

    function appendButton(container, id, label, action) {
        if (!container || document.getElementById(id)) return;
        const button = document.createElement('button');
        button.id = id;
        button.innerText = label;
        button.style.backgroundColor = '#6d4c41';
        button.onclick = action;
        button.ontouchstart = event => {
            event.preventDefault();
            action();
        };
        container.appendChild(button);
    }

    function refreshTrapButtons() {
        const container = document.getElementById('actions');
        if (!container || !window.player) return;
        for (const id of ['prepare-trap-btn', 'nearby-trap-btn']) document.getElementById(id)?.remove();
        if (!window.isInCombat && skillRank(window.player, TRAP_SKILL) > 0) {
            appendButton(container, 'prepare-trap-btn', 'Prepare Trap', () => openPrepareMenu(window.player));
        }
        const nearby = nearbyKnownTraps(window.player, 1);
        if (!window.isInCombat && nearby.length && (skillRank(window.player, TRAP_SKILL) > 0 || skillRank(window.player, ARCANA_SKILL) > 0)) {
            appendButton(container, 'nearby-trap-btn', 'Trap Work', () => openNearbyTrapMenu(window.player));
        }
    }

    function installActionUiWrapper() {
        const original = window.updateActionButtons;
        if (typeof original !== 'function' || original.__preparedTrapUi) return false;
        const wrapped = function(...args) {
            const result = original.apply(this, args);
            refreshTrapButtons();
            return result;
        };
        wrapped.__preparedTrapUi = true;
        wrapped.__original = original;
        window.updateActionButtons = wrapped;
        refreshTrapButtons();
        return true;
    }

    function installSkillDefinitions() {
        if (!window.skills) return false;
        const legacy = window.skills[TRAP_SKILL];
        if (legacy) {
            legacy.name = 'Traps';
            legacy.description = 'Knowledge of constructing and safely dismantling mundane traps. Traps are prepared outside combat, consume real materials and world time, and higher ranks unlock more complex mechanisms.';
            legacy.maxRanks = 3;
            legacy.active = false;
        } else {
            window.skills[TRAP_SKILL] = {
                name: 'Traps',
                description: 'Knowledge of constructing and safely dismantling mundane traps. Traps are prepared outside combat, consume real materials and world time, and higher ranks unlock more complex mechanisms.',
                tree: 'rogue',
                maxRanks: 3,
                apply: () => {}
            };
        }
        if (!window.skills[ARCANA_SKILL]) {
            window.skills[ARCANA_SKILL] = {
                name: 'Arcana',
                description: 'Recognise, understand and suppress magical mechanisms and wards. A character who also knows Traps can build hybrid mechanical traps protected by hidden tamper runes.',
                tree: 'wizard',
                maxRanks: 3,
                apply: () => {}
            };
        }
        return true;
    }

    function inspectAroundParty() {
        if (!window.tileObjects || !window.distance) return;
        const partyActors = (window.entities || []).filter(e => e?.alive && e.side === 'player' && !e.rider);
        if (!partyActors.length && window.player?.hex) partyActors.push(window.player);
        for (const actor of partyActors) {
            if (!actor?.hex) continue;
            // Do not scan the whole map. The detection radius is tiny; probe
            // just the local hex ring and look the key up directly.
            for (let dq = -DETECT_RADIUS; dq <= DETECT_RADIUS; dq++) {
                for (let dr = -DETECT_RADIUS; dr <= DETECT_RADIUS; dr++) {
                    const hex = { q: actor.hex.q + dq, r: actor.hex.r + dr };
                    if (window.distance(actor.hex, hex) > DETECT_RADIUS) continue;
                    const trap = trapAt(hex.q, hex.r);
                    if (trap?.armed && !trap.spent) attemptDetectTrap(actor, hex.q, hex.r, trap);
                }
            }
        }
    }

    function triggerSteppedTraps() {
        if (!window.tileObjects) return;
        for (const entity of (window.entities || [])) {
            if (!entity?.alive || !entity.hex) continue;
            const trap = trapAt(entity.hex.q, entity.hex.r);
            if (!trap?.armed || trap.spent) continue;
            if (trap.ownerSide === entity.side) continue;
            triggerTrap(entity.hex.q, entity.hex.r, entity, 'step');
        }
    }

    function maintenance() {
        installSkillDefinitions();
        installActionUiWrapper();
        inspectAroundParty();
        triggerSteppedTraps();
        refreshTrapButtons();
    }

    window.PreparedTrapSystem = {
        TRAP_SKILL,
        ARCANA_SKILL,
        recipes: RECIPES,
        runeLayer: RUNE_LAYER,
        availableRecipes,
        canAddRune,
        buildTrap,
        attemptDetectTrap,
        attemptDetectWard,
        disarmTrap,
        suppressWard,
        triggerTrap,
        triggerWard,
        recoverOwnTrap,
        nearbyKnownTraps,
        openPrepareMenu,
        openNearbyTrapMenu,
        refreshTrapButtons,
        maintenance,
        mechanicalDisarmScore,
        perceptionScore,
        arcanaScore
    };

    installSkillDefinitions();
    installActionUiWrapper();
    const timer = window.setInterval(maintenance, POLL_MS);
    window.addEventListener?.('beforeunload', () => window.clearInterval(timer), { once: true });
})();
