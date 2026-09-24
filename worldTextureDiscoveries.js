// worldTextureDiscoveries.js
// Small deterministic environmental stories scattered through Campaign 2.
// These are deliberately not a new quest framework: most are one-screen
// discoveries whose changed tile-object fields ride on the existing
// tileObjects-vs-world-baseline save diff in persistence.js.
(() => {
    'use strict';

    let installed = false;
    let built = false;
    let clickCanvas = null;
    let clickHandler = null;
    const placed = new Map();
    const key = h => `${h.q},${h.r}`;

    function playerActor() {
        const turn = window.currentTurnEntity;
        if (turn?.side === 'player') return turn;
        return window.player || window.entities?.find(e => e.alive && e.side === 'player') || null;
    }

    function giveItems(actor, itemIds) {
        if (!actor || !Array.isArray(itemIds) || !itemIds.length) return [];
        const partyRecord = window.party?.find(p => p.name === actor.name);
        actor.inventory = actor.inventory || [];
        if (partyRecord) partyRecord.inventory = partyRecord.inventory || [];
        const granted = [];
        for (const id of itemIds) {
            if (!window.items?.[id]) continue;
            actor.inventory.push(id);
            if (partyRecord && partyRecord.inventory !== actor.inventory) partyRecord.inventory.push(id);
            granted.push(window.items[id].name);
        }
        return granted;
    }

    function show(subject, text, choices) {
        const speaker = {
            name: subject.title,
            customImage: subject.portrait || 'journal',
            gender: 'other',
            race: 'human',
        };
        if (typeof window.showDialogue === 'function') window.showDialogue(speaker, text, choices);
        else window.showMessage?.(text);
    }

    const DEFINITIONS = {
        'oak-road-corpse': {
            title: 'The Body Beneath the Oak', portrait: 'corpse_marker', type: 'corpse_marker',
            text: 'A traveller sits slumped against the roots as if they stopped to rest and simply never stood again. The coat is rain-stiff and old. One boot is missing; the other is split at the sole. There is no purse in easy sight.',
            searchedText: 'The dead traveller still rests beneath the tree. The satchel has already been searched; nothing else here looks worth disturbing.',
            loot: ['torch', 'herbs', 'dagger'],
            search: 'Inside a narrow satchel you find a wrapped torch, a bundle of dried herbs and a plain dagger. A folded scrap names no murderer—only a delivery that was already two days late. Whatever happened here may have been more ordinary than heroic.',
        },
        'north-road-shrine': {
            title: 'Weathered Wayside Shrine', portrait: 'journal', type: 'signpost', flavourOnly: true,
            text: 'Someone has stacked river stones around a weathered wooden post. Strips of faded cloth are tied beneath a little sunburst carving. Most bear names; a few simply say “home”.',
            searchedText: 'Your strip of cloth moves with the older offerings when the wind comes through.',
            search: 'You tear a narrow strip from an old rag and tie it among the others. Nothing answers. Nothing changes. For a moment, the road feels less lonely.',
        },
        'hunter-cold-camp': {
            title: 'Cold Hunter’s Camp', portrait: 'journal', type: 'fireplace',
            text: 'The fire ring is cold and half-filled with rainwater. A hide-scraping frame stands empty nearby. Whoever slept here packed in a hurry but left a small food bundle wedged under a flat stone.',
            searchedText: 'The abandoned camp is quiet. The food bundle is gone, and rain has softened yesterday’s tracks into nothing useful.',
            loot: ['game_meat', 'herbs'],
            search: 'The bundle holds smoked game and a handful of bitter medicinal leaves. The tracks leaving camp split twice around trees, as though the hunter was trying not to be followed.',
        },
        'east-road-broken-cart': {
            title: 'Broken Cart in the Verge', portrait: 'journal', type: 'fence_broken',
            text: 'A wheel-less handcart lies on its side in the weeds. The useful cargo is long gone, but a snapped axle, two good boards and a rain-blackened tool wrap were apparently beneath everyone else’s notice.',
            searchedText: 'The stripped cart has little left now beyond iron nails too bent to bother with.',
            loot: ['wood', 'wood', 'torch'],
            search: 'You pull two sound lengths of timber free and find an unused torch in the tool wrap. The cart’s owner scratched three tally marks into the axle before abandoning it. There is no way to know what they counted.',
        },
        'west-road-lost-pack': {
            title: 'Pack Beside the Ditch', portrait: 'journal', type: 'journal',
            text: 'A canvas travelling pack has been pushed beneath a thorn bush, too carefully placed to be simple litter. Its straps are cut rather than torn. A child’s blue ribbon is knotted around one buckle.',
            searchedText: 'The empty pack remains beneath the thorn bush. You left the blue ribbon where it was.',
            loot: ['traveler_garb', 'fruit'],
            search: 'The outer pocket holds a folded traveller’s shirt and two bruised apples. There is no name. You leave the blue ribbon tied to the buckle in case somebody comes looking for the pack rather than its contents.',
        },
    };

    function candidateFree(h, allowed = ['Grass', 'Forest', 'Dirt']) {
        const terrain = window.getTerrainAt?.(h.q, h.r)?.name;
        if (!allowed.includes(terrain)) return false;
        if (window.tileObjects?.[key(h)]) return false;
        if (window.entities?.some(e => e.alive && e.hex?.q === h.q && e.hex?.r === h.r)) return false;
        return true;
    }

    function nearestFree(target, allowed, wantTree = false) {
        const candidates = [target];
        for (let radius = 1; radius <= 8; radius++) {
            for (let dq = -radius; dq <= radius; dq++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    const h = { q: target.q + dq, r: target.r + dr };
                    if (typeof window.distance === 'function' && window.distance(target, h) !== radius) continue;
                    candidates.push(h);
                }
            }
        }
        const valid = candidates.filter(h => candidateFree(h, allowed));
        if (!wantTree || typeof window.pseudoRandom !== 'function') return valid[0] || null;
        // Match hexMap.js's deterministic foliage-overlay choice so this
        // particular corpse really does sit under the tall-tree variant.
        const tree = valid.find(h => {
            const roll = window.pseudoRandom(h.q * 7.13 + 401, h.r * 5.71 + 401 * 1.7);
            return Math.floor(roll * 3) === 2;
        });
        return tree || valid[0] || null;
    }

    function place(id, target, options = {}) {
        const def = DEFINITIONS[id];
        if (!def) return null;
        const h = nearestFree(target, options.allowed || ['Grass', 'Forest', 'Dirt'], !!options.wantTree);
        if (!h) return null;
        if (options.forceForest) window.setTerrainAt?.(h.q, h.r, 'Forest');
        const obj = {
            type: def.type,
            lightRadius: 0,
            worldDiscoveryId: id,
            searched: false,
            flavourOnly: !!def.flavourOnly,
        };
        window.tileObjects[key(h)] = obj;
        placed.set(id, { id, hex: { ...h }, object: obj });
        return h;
    }

    function build() {
        if (built || window.currentCampaign !== '2') return built;
        const c = window.campaign2Landmarks?.crossroads;
        if (!c || !window.tileObjects || typeof window.getTerrainAt !== 'function') return false;
        placed.clear();

        place('oak-road-corpse', { q: c.q + 72, r: c.r + 7 }, { wantTree: true, forceForest: true });
        place('north-road-shrine', { q: c.q + 5, r: c.r - 86 }, { allowed: ['Grass', 'Dirt', 'Forest'] });
        place('hunter-cold-camp', { q: c.q - 48, r: c.r + 63 }, { allowed: ['Grass', 'Forest', 'Dirt'] });
        place('east-road-broken-cart', { q: c.q + 104, r: c.r + 5 }, { allowed: ['Grass', 'Dirt', 'Forest'] });
        place('west-road-lost-pack', { q: c.q - 78, r: c.r + 6 }, { allowed: ['Grass', 'Dirt', 'Forest'] });

        // setupVillageScene's original baseline was captured before this
        // wrapper returned. Include our deterministic additions in the fresh
        // baseline so saves contain only searched/resolved differences.
        window._campaign2TerrainBaseline = { ...window.overrideTerrain };
        window._campaign2TileObjectsBaseline = { ...window.tileObjects };
        built = true;
        return true;
    }

    function interact(id, obj, h, actor = playerActor()) {
        const def = DEFINITIONS[id];
        if (!def || !obj || !actor) return false;
        const already = !!obj.searched;
        if (already) {
            show(def, def.searchedText || def.text, [{ label: 'Leave it.', action: () => {} }]);
            return true;
        }

        const actionLabel = def.flavourOnly ? 'Leave an offering.' : 'Search carefully.';
        show(def, def.text, [
            {
                label: actionLabel,
                action: () => {
                    const names = giveItems(actor, def.loot || []);
                    obj.searched = true;
                    obj.searchedBy = actor.name;
                    const suffix = names.length ? ` You take ${names.join(', ')}.` : '';
                    show(def, `${def.search}${suffix}`, [{ label: 'Continue.', action: () => {} }]);
                    window.drawMap?.();
                    window.renderEntities?.();
                },
            },
            { label: 'Leave it alone.', action: () => {} },
        ]);
        return true;
    }

    function installClickInterceptor() {
        const canvas = window.mapCanvas || document.getElementById('mapCanvas') || document.querySelector('canvas');
        if (!canvas || typeof window.screenToHex !== 'function') return false;
        if (clickCanvas === canvas && clickHandler) return true;
        if (clickCanvas && clickHandler) clickCanvas.removeEventListener('click', clickHandler, true);

        clickHandler = e => {
            if (window.totalDragDistance > 10) return;
            const h = window.screenToHex({ x: e.clientX, y: e.clientY });
            const obj = window.tileObjects?.[key(h)];
            if (!obj?.worldDiscoveryId) return;
            const actor = playerActor();
            if (!actor || (window.distance?.(actor.hex, h) ?? 99) > 1) return; // normal click-to-move until close enough
            e.preventDefault();
            e.stopImmediatePropagation();
            interact(obj.worldDiscoveryId, obj, h, actor);
        };
        canvas.addEventListener('click', clickHandler, true);
        clickCanvas = canvas;
        return true;
    }

    function installWorldWrapper() {
        if (installed) return true;
        const original = window.setupVillageScene;
        if (typeof original !== 'function') return false;
        if (original.__worldTextureDiscoveries) { installed = true; return true; }
        const wrapped = function(...args) {
            built = false;
            placed.clear();
            const result = original.apply(this, args);
            build();
            installClickInterceptor();
            return result;
        };
        wrapped.__worldTextureDiscoveries = true;
        wrapped.__original = original;
        window.setupVillageScene = wrapped;
        installed = true;
        return true;
    }

    function install() {
        installWorldWrapper();
        installClickInterceptor();
        if (window.currentCampaign === '2' && window.campaign2Landmarks?.crossroads && !built) build();
        return installed;
    }

    window.WorldTextureDiscoveries = {
        install, build, interact,
        definitions: DEFINITIONS,
        getPlaced: id => placed.get(id) || null,
        get allPlaced() { return [...placed.values()]; },
        get stats() { return { installed, built, placed: placed.size }; },
    };

    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, 50);
        setTimeout(() => clearInterval(timer), 5000);
    }
})();
