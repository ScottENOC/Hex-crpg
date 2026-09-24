// npcReliability.js
// Shared hardening for generated settlement NPCs: complete their appearance
// before first render/dialogue, keep civilians out of doorways, make baldness
// a real (rare male) hairstyle, and give otherwise-silent NPCs useful small talk.
(() => {
    'use strict';

    const DOOR_CLEARANCE_RADIUS = 1;
    const MALE_BALD_CHANCE = 0.06;
    const styledEntities = new WeakSet();
    let talkWrapperInstalled = false;
    let dialogueWrapperInstalled = false;
    let renderWrapperInstalled = false;
    let creatorInstalled = false;
    let maintenancePasses = 0;
    let doorwayMoves = 0;

    const BLOCKED_TERRAIN = new Set(['Wall', 'Water', 'Palisade Wall', 'Keep Wall', 'Stone Wall']);
    const DOOR_TYPES = new Set(['door_open', 'door_closed']);

    const SMALL_TALK = {
        generic: [
            "Morning. Or evening. Hard to keep track when the work runs long.",
            "Roads have been busy lately. That's usually good news, until it isn't.",
            "If you're travelling far, fill your water skin before you leave town.",
            "Everyone's heard a different version of what happened on the road. I trust about half of any of them.",
            "Funny thing about a quiet day: you don't notice how valuable it is until you haven't had one in a while.",
            "You look like you've been further from home than I have lately.",
            "There's always somebody arriving with news and somebody leaving before they hear it.",
            "Watch your footing outside the paved streets. Rain's made a mess of the edges.",
            "I keep meaning to take a day off. Then the day arrives and there's always something that needs doing.",
            "No grand wisdom from me. Eat when you can, sleep somewhere dry, and don't borrow from people with matching uniforms."
        ],
        farmer: [
            "Good soil forgives a lot. Bad weather doesn't.",
            "Half of farming is growing things. The other half is arguing with animals about where they're allowed to stand.",
            "If the rain holds another day, I'll stop complaining about it. Maybe."
        ],
        labourer: [
            "If someone tells you a job will only take an hour, they've never done the job.",
            "Back's sore, hands are sore, pay could be better. So: a normal day.",
            "You learn which loads are heavy and which foremen only look heavy."
        ],
        merchant: [
            "Good roads make cheap goods. Bad roads make interesting excuses.",
            "I can tell how safe a road is by how loudly merchants complain about tolls instead of bandits.",
            "Everyone wants a bargain until they're the one selling."
        ],
        smith: [
            "You can hurry hot metal once. Usually right before you ruin it.",
            "People notice a sword. They don't notice the hundred ordinary hinges that keep a town working.",
            "Coal, iron, time. Mostly time."
        ],
        fisher: [
            "Fish don't care what time you woke up. That's the trouble with fish.",
            "The water tells you plenty if you stop trying to make it agree with you.",
            "Best catch is always the one somebody swears they nearly landed yesterday."
        ],
        hunter: [
            "Fresh tracks tell the truth better than frightened travellers do.",
            "Woods are noisy when they're safe. Silence is when I start looking around.",
            "If you see one deer, there are three you didn't see."
        ],
        clerk: [
            "Ink is cheaper than steel and somehow still starts fights.",
            "Every urgent message becomes less urgent once somebody has to write it down properly.",
            "I know exactly where that record is. I simply don't know which stack it's in."
        ],
        tavern_worker: [
            "You can learn a lot carrying cups. Mostly things nobody intended to tell you.",
            "Quiet patrons worry me more than loud ones. Loud ones usually tell you what the problem is.",
            "If a table wobbles, fold paper under the short leg. If a patron wobbles, point them toward the door."
        ],
        craftsperson: [
            "People call it simple work once they no longer remember how to do it themselves.",
            "Measure twice. Then measure again because somebody talked to you halfway through the second one.",
            "A good tool feels expensive once and cheap every day after."
        ],
        artisan: [
            "The last little correction always takes longer than the whole first attempt.",
            "If you can see the join, I wasn't finished yet.",
            "There's a difference between decoration and care. Good work usually has both."
        ],
        porter: [
            "Everyone packs as if somebody else will carry it.",
            "The shortest route across town changes depending on what you're carrying.",
            "Give me a crate with handles and I'll forgive whoever packed it."
        ],
        servant: [
            "Big houses have the same problems as little ones. They just happen in more rooms.",
            "The trick is doing the work before anyone important notices it needed doing.",
            "You hear every bell in the house eventually."
        ],
        weaver: [
            "One bad thread isn't much. A hundred bad threads is a reputation.",
            "Patterns look clever until you've repeated them six hundred times.",
            "Good cloth starts long before the loom."
        ],
        carter: [
            "A wheel always breaks at the exact point furthest from someone who can fix it.",
            "Road looks flat until you've pulled a loaded cart over it.",
            "Horses have opinions about schedules. Strong ones."
        ],
        guard_support: [
            "The guards get the songs. Somebody still has to count their boots and arrows.",
            "A patrol without food comes home early, no matter how brave it sounded leaving.",
            "Most defence is dull work done before anything exciting happens."
        ],
        dependent: [
            "I'm not supposed to go past the next street on my own.",
            "I know a shortcut, but I'm not telling everybody.",
            "Grown-ups say 'in a minute' when they mean much longer than a minute."
        ]
    };

    function hashUnit(text) {
        let h = 2166136261;
        const s = String(text || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0) / 4294967296;
    }

    function eachPopulation(callback) {
        const sources = [window.GeneratedCivilianPopulation, window.SilverhartPopulation];
        for (const population of sources) {
            if (!population?.records) continue;
            callback(population);
        }
    }

    function findRecord(entity) {
        if (!entity?.id) return null;
        return window.GeneratedCivilianPopulation?.records?.get(entity.id)
            || window.SilverhartPopulation?.records?.get(entity.id)
            || null;
    }

    function normaliseHairRecord(record) {
        if (!record?.appearance) return false;
        const was = record.appearance.hair;
        const child = record.appearance.ageBand === 'child';
        if (record.gender === 'male' && !child) {
            const bald = hashUnit(`${record.seed || record.id}:rare-bald`) < MALE_BALD_CHANCE;
            record.appearance.hair = bald ? 'bald' : (was === 'bald' ? 'cropped' : was);
        } else if (was === 'bald') {
            record.appearance.hair = record.gender === 'female' ? 'tied_back' : 'cropped';
        }
        return record.appearance.hair !== was;
    }

    function normalisePopulationHair() {
        let changed = 0;
        eachPopulation(population => {
            for (const record of population.records.values()) if (normaliseHairRecord(record)) changed++;
        });
        return changed;
    }

    function installTransparentBaldHair() {
        const sets = window.DIRECTIONAL_CHARACTER_ASSETS;
        if (!sets || typeof document === 'undefined') return false;
        const transparent = document.createElement('canvas');
        transparent.width = 1; transparent.height = 1;
        for (const set of Object.values(sets)) {
            if (!set?.hair || set.hair.bald) continue;
            set.hair.bald = { front: transparent, side: transparent, back: transparent };
        }
        return true;
    }

    function applyBaldRuntimeHints(entity, record = findRecord(entity)) {
        const bald = entity?.hairStyle === 'bald' || record?.appearance?.hair === 'bald';
        if (!entity) return false;
        if (bald) {
            entity.hairStyle = 'bald';
            entity.hairSizeMult = 0; // legacy elf/dwarf full-hair renderer
        } else if (entity.hairSizeMult === 0 && entity.__baldHairSizeOwned) {
            delete entity.hairSizeMult;
        }
        entity.__baldHairSizeOwned = bald;
        return bald;
    }

    function styleEntityNow(entity, record = findRecord(entity)) {
        if (!entity || !record) return false;
        normaliseHairRecord(record);
        entity.equipped = entity.equipped || { weapon:null, offhand:null, armor:null, helmet:null };
        if (window.CivilianVisualDiversity?.styleEntity) {
            window.CivilianVisualDiversity.styleEntity(entity, record);
        }
        if (record.appearance?.hair === 'bald') entity.hairStyle = 'bald';
        applyBaldRuntimeHints(entity, record);
        styledEntities.add(entity);
        return true;
    }

    function styleGeneratedResidents() {
        let styled = 0;
        eachPopulation(population => {
            if (!population.materialised) return;
            for (const entity of population.materialised.values()) {
                if (!styledEntities.has(entity) || !entity.__civilianVisualStyled) {
                    if (styleEntityNow(entity, population.records.get(entity.id))) styled++;
                } else {
                    applyBaldRuntimeHints(entity, population.records.get(entity.id));
                }
            }
        });
        return styled;
    }

    function doors() {
        const out = [];
        for (const [coord, obj] of Object.entries(window.tileObjects || {})) {
            if (!DOOR_TYPES.has(obj?.type)) continue;
            const [q, r] = coord.split(',').map(Number);
            if (Number.isFinite(q) && Number.isFinite(r)) out.push({ q, r });
        }
        return out;
    }

    function hexDistance(a, b) {
        if (window.distance) return window.distance(a, b);
        return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((a.q+a.r)-(b.q+b.r)));
    }

    function inDoorClearance(hex, doorList = doors()) {
        return !!hex && doorList.some(d => hexDistance(hex, d) <= DOOR_CLEARANCE_RADIUS);
    }

    function occupied(hex, ignore) {
        return (window.entities || []).some(e => e !== ignore && e?.alive && e.hex?.q === hex.q && e.hex?.r === hex.r);
    }

    function safeCivilianHex(start, entity, doorList) {
        if (!start) return null;
        const queue = [{ q:Math.round(start.q), r:Math.round(start.r) }];
        const seen = new Set();
        while (queue.length && seen.size < 80) {
            const h = queue.shift();
            const k = `${h.q},${h.r}`;
            if (seen.has(k)) continue;
            seen.add(k);
            const terrain = window.getTerrainAt?.(h.q, h.r)?.name;
            if (!BLOCKED_TERRAIN.has(terrain) && !occupied(h, entity) && !inDoorClearance(h, doorList)) return h;
            if (window.getNeighbors) queue.push(...window.getNeighbors(h.q, h.r));
        }
        return null;
    }

    function clearGeneratedDoorways() {
        const doorList = doors();
        if (!doorList.length) return 0;
        let moved = 0;
        for (const entity of window.entities || []) {
            if (!entity?.alive || !entity.isGeneratedCivilian || !entity.hex) continue;
            if (inDoorClearance(entity.hex, doorList)) {
                const safe = safeCivilianHex(entity.hex, entity, doorList);
                if (safe) {
                    entity.hex = { ...safe };
                    entity.visualQ = entity.startQ = safe.q;
                    entity.visualR = entity.startR = safe.r;
                    entity.destination = null;
                    moved++; doorwayMoves++;
                }
            } else if (entity.destination && inDoorClearance(entity.destination, doorList)) {
                const safeDest = safeCivilianHex(entity.destination, entity, doorList);
                entity.destination = safeDest ? { ...safeDest } : null;
            }
        }
        return moved;
    }

    function smallTalkLine(npc) {
        const pool = SMALL_TALK[npc?.occupation] || SMALL_TALK.generic;
        npc.__smallTalkCount = (npc.__smallTalkCount || 0) + 1;
        const salt = `${npc?.id || npc?.name}|${npc.__smallTalkCount}|${Math.floor((window.worldSeconds || 0) / 3600)}`;
        const primary = pool[Math.floor(hashUnit(salt) * pool.length) % pool.length];
        if (npc?.occupation && pool !== SMALL_TALK.generic && npc.__smallTalkCount % 3 === 0) {
            const generic = SMALL_TALK.generic[Math.floor(hashUnit(`${salt}:general`) * SMALL_TALK.generic.length) % SMALL_TALK.generic.length];
            return generic;
        }
        return primary;
    }

    function installTalkFallback() {
        const original = window.talkToNPC;
        if (typeof original !== 'function') return false;
        if (original.__npcReliabilitySmallTalk) { talkWrapperInstalled = true; return true; }
        const wrapped = function(npc, ...args) {
            const hasTree = !!(npc?.dialogueId && window.npcDialogueTrees?.[npc.dialogueId]);
            if (hasTree || npc?.arenaFlavorLine || !npc?.isNPC) return original.call(this, npc, ...args);
            styleEntityNow(npc);
            window.showDialogue?.(npc, smallTalkLine(npc), [
                { label: 'Take care.', action: () => {} }
            ]);
        };
        wrapped.__npcReliabilitySmallTalk = true;
        wrapped.__original = original;
        window.talkToNPC = wrapped;
        talkWrapperInstalled = true;
        return true;
    }

    function installDialogueStyling() {
        const original = window.showDialogue;
        if (typeof original !== 'function') return false;
        if (original.__npcReliabilityAppearance) { dialogueWrapperInstalled = true; return true; }
        const wrapped = function(npc, ...args) {
            if (npc?.isGeneratedCivilian) styleEntityNow(npc);
            else applyBaldRuntimeHints(npc);
            return original.call(this, npc, ...args);
        };
        wrapped.__npcReliabilityAppearance = true;
        wrapped.__original = original;
        window.showDialogue = wrapped;
        dialogueWrapperInstalled = true;
        return true;
    }

    function installRenderStyling() {
        const original = window.renderEntities;
        if (typeof original !== 'function') return false;
        if (original.__npcReliabilityAppearance) { renderWrapperInstalled = true; return true; }
        const wrapped = function(...args) {
            styleGeneratedResidents();
            clearGeneratedDoorways();
            return original.apply(this, args);
        };
        wrapped.__npcReliabilityAppearance = true;
        wrapped.__original = original;
        window.renderEntities = wrapped;
        renderWrapperInstalled = true;
        return true;
    }

    function installCreatorBaldOption() {
        const select = document.getElementById('hair-style-select');
        if (!select) return false;
        if (!select.querySelector('option[value="bald"]')) select.appendChild(new Option('Bald', 'bald'));
        creatorInstalled = true;
        return true;
    }

    function syncPlayerBaldSelection() {
        const style = document.getElementById('hair-style-select')?.value;
        if (!style) return;
        const char = window.party?.[0];
        if (char) {
            char.hairStyle = style;
            applyBaldRuntimeHints(char, null);
        }
        const entity = char && (window.entities || []).find(e => e.name === char.name && e.side === 'player');
        if (entity) {
            entity.hairStyle = style;
            applyBaldRuntimeHints(entity, null);
        }
    }

    function installCreatorSync() {
        if (!installCreatorBaldOption()) return false;
        const select = document.getElementById('hair-style-select');
        if (!select.dataset.npcReliabilityBaldListener) {
            select.dataset.npcReliabilityBaldListener = 'true';
            select.addEventListener('change', () => {
                syncPlayerBaldSelection();
                window.updateAppearancePreview?.();
            });
        }
        return true;
    }

    function maintenance() {
        maintenancePasses++;
        installTransparentBaldHair();
        normalisePopulationHair();
        styleGeneratedResidents();
        clearGeneratedDoorways();
        installTalkFallback();
        installDialogueStyling();
        installRenderStyling();
        installCreatorSync();
        syncPlayerBaldSelection();
    }

    window.NPCReliability = {
        maintenance,
        normaliseHairRecord,
        normalisePopulationHair,
        styleEntityNow,
        styleGeneratedResidents,
        inDoorClearance,
        clearGeneratedDoorways,
        safeCivilianHex,
        smallTalkLine,
        installTransparentBaldHair,
        get stats() {
            return { maintenancePasses, doorwayMoves, talkWrapperInstalled, dialogueWrapperInstalled, renderWrapperInstalled, creatorInstalled };
        },
        DOOR_CLEARANCE_RADIUS,
        MALE_BALD_CHANCE,
        SMALL_TALK,
    };

    const timer = setInterval(maintenance, 350);
    maintenance();
    window.addEventListener('load', () => { maintenance(); setTimeout(() => clearInterval(timer), 15000); }, { once:true });
})();
