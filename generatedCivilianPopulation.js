// generatedCivilianPopulation.js
// Cheap persistent background population for Campaign 2.
(() => {
    'use strict';

    const DEFAULT_POPULATION = 180;
    const MAX_MATERIALISED = 40;
    const SETTLEMENT_WAKE_RADIUS = 95;
    const MATERIALISE_RADIUS = 52;
    const PULSE_MS = 1200;
    const EVENT_TYPE = 'routine:generated-civilian-transition';

    const records = new Map();
    const materialised = new Map();
    let handlerInstalled = false;
    let pulseCount = 0;
    let materialiseCount = 0;
    let dematerialiseCount = 0;

    const FIRST_NAMES = {
        female: ['Alys', 'Brina', 'Celia', 'Dara', 'Elin', 'Fenna', 'Gwen', 'Hesta', 'Iris', 'Jora', 'Kara', 'Lina', 'Mara', 'Nessa', 'Orla', 'Pella'],
        male: ['Alden', 'Bram', 'Corin', 'Darin', 'Ewan', 'Fenn', 'Garran', 'Hale', 'Iven', 'Jory', 'Kellan', 'Loric', 'Marek', 'Nolan', 'Orrin', 'Perrin']
    };
    const SURNAMES = ['Ashbrook', 'Briar', 'Clay', 'Dale', 'Fen', 'Gorse', 'Hearth', 'Kettle', 'Mere', 'Oak', 'Reed', 'Stone', 'Thatch', 'Vale', 'Wren', 'Yarrow'];
    const OCCUPATIONS = [
        { key: 'farmer', weight: 24, prop: 'basket', colour: '#8b6f47' },
        { key: 'labourer', weight: 18, prop: 'sack', colour: '#77695b' },
        { key: 'merchant', weight: 9, prop: 'pouch', colour: '#7d5d8e' },
        { key: 'smith', weight: 6, prop: 'hammer', colour: '#5f6469' },
        { key: 'fisher', weight: 8, prop: 'net', colour: '#526f78' },
        { key: 'hunter', weight: 7, prop: 'bundle', colour: '#596b45' },
        { key: 'clerk', weight: 6, prop: 'scroll', colour: '#6d6381' },
        { key: 'tavern_worker', weight: 8, prop: 'jug', colour: '#8a593d' },
        { key: 'craftsperson', weight: 8, prop: 'tool', colour: '#6f7055' },
        { key: 'unemployed', weight: 6, prop: null, colour: '#68635c' },
    ];
    const RACES = [
        { key: 'human', weight: 72 },
        { key: 'dwarf', weight: 8 },
        { key: 'elf', weight: 8 },
        { key: 'goblin', weight: 6 },
        { key: 'orc', weight: 6 },
    ];
    const HAIR = ['short', 'long', 'cropped', 'braided', 'tied_back', 'wavy', 'bald'];
    const BUILDS = ['slender', 'average', 'average', 'average', 'broad', 'stocky'];
    const CLOTHING = ['plain', 'earth', 'patched', 'dyed', 'workwear', 'clean'];

    const scheduler = () => window.NPCRoutineScheduler;
    const nowSeconds = () => Number(window.worldSeconds || 0);
    const crossroads = () => window.campaign2Landmarks?.crossroads || null;

    function unit(seed, channel) {
        const s = scheduler();
        if (s?.deterministicUnit) return s.deterministicUnit(seed, channel);
        const text = `${seed}|${channel}`;
        let hash = 2166136261;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0) / 4294967296;
    }

    function pick(seed, channel, list) {
        return list[Math.min(list.length - 1, Math.floor(unit(seed, channel) * list.length))];
    }

    function weighted(seed, channel, list) {
        let roll = unit(seed, channel) * list.reduce((sum, x) => sum + x.weight, 0);
        for (const entry of list) {
            roll -= entry.weight;
            if (roll <= 0) return entry;
        }
        return list[list.length - 1];
    }

    function makeNode(seed, channel, kind) {
        const c = crossroads() || { q: 8, r: 24 };
        const angle = unit(seed, `${channel}:angle`) * Math.PI * 2;
        const base = kind === 'home' ? 18 : kind === 'work' ? 24 : 10;
        const spread = kind === 'home' ? 19 : kind === 'work' ? 25 : 15;
        const radius = base + unit(seed, `${channel}:radius`) * spread;
        return {
            key: `${kind}:${Math.floor(unit(seed, `${channel}:key`) * 64)}`,
            hex: {
                q: Math.round(c.q + Math.cos(angle) * radius),
                r: Math.round(c.r + Math.sin(angle) * radius),
            }
        };
    }

    function makeRecord(index) {
        const seed = `hollowmere-civilian-${index}`;
        const gender = unit(seed, 'gender') < 0.5 ? 'female' : 'male';
        const occupation = weighted(seed, 'occupation', OCCUPATIONS);
        return {
            id: `generated-civilian:${index}`,
            seed,
            name: `${pick(seed, 'first-name', FIRST_NAMES[gender])} ${pick(seed, 'surname', SURNAMES)}`,
            alive: true,
            gender,
            race: weighted(seed, 'race', RACES).key,
            occupation: occupation.key,
            prop: occupation.prop,
            colour: occupation.colour,
            appearance: {
                ageBand: pick(seed, 'age', ['young_adult', 'adult', 'adult', 'adult', 'older']),
                heightScale: 0.90 + unit(seed, 'height') * 0.20,
                build: pick(seed, 'build', BUILDS),
                hair: pick(seed, 'hair', HAIR),
                clothing: pick(seed, 'clothing', CLOTHING),
                skinVariant: Math.floor(unit(seed, 'skin') * 5),
            },
            nodes: {
                home: makeNode(seed, 'home', 'home'),
                work: makeNode(seed, `work:${occupation.key}`, 'work'),
                social: makeNode(seed, 'social', 'social'),
            },
            commuteMinutes: 8 + Math.floor(unit(seed, 'commute') * 14),
            dayOffsetMinutes: Math.floor((unit(seed, 'day-offset') - 0.5) * 50),
        };
    }

    function routineHours(record) {
        const offset = record.dayOffsetMinutes / 60;
        return [
            { hour: 7.5 + offset, target: 'work', activity: 'working' },
            { hour: 17 + offset, target: 'social', activity: 'socialising' },
            { hour: 21 + offset, target: 'home', activity: 'sleeping' },
        ];
    }

    function targetForTime(record, at = nowSeconds()) {
        const hour = ((((at % 86400) + 86400) % 86400) / 3600);
        const [work, social, home] = routineHours(record);
        if (hour < work.hour || hour >= home.hour) return 'home';
        if (hour < social.hour) return 'work';
        return 'social';
    }

    function nextTransition(record, at = nowSeconds()) {
        const dayStart = Math.floor(at / 86400) * 86400;
        const candidates = routineHours(record).map(x => ({
            at: dayStart + x.hour * 3600,
            target: x.target,
            activity: x.activity,
        }));
        return candidates.find(x => x.at > at + 0.001) || { ...candidates[0], at: candidates[0].at + 86400 };
    }

    function registerRecord(record, at = nowSeconds()) {
        const s = scheduler();
        if (!s || !record?.alive) return;
        const targetKey = targetForTime(record, at);
        const node = record.nodes[targetKey];
        s.registerNpc(record.id, {
            simulationLevel: 'dormant',
            activity: targetKey === 'home' ? 'sleeping' : targetKey === 'work' ? 'working' : 'socialising',
            currentNode: node.key,
            currentHex: node.hex,
            metadata: {
                generatedCivilian: true,
                occupation: record.occupation,
                race: record.race,
                gender: record.gender,
            }
        });
        const next = nextTransition(record, at);
        s.scheduleEvent(record.id, next.at, EVENT_TYPE, { target: next.target, activity: next.activity });
    }

    function handleRoutineTransition(state, event, at) {
        const record = records.get(String(state.id));
        if (!record?.alive) return;
        const target = record.nodes[event.payload?.target];
        if (!target) return;
        const current = scheduler().getAbstractLocation(record.id, at);
        scheduler().beginAbstractTravel(record.id, {
            fromNode: state.currentNode || 'unknown',
            toNode: target.key,
            fromHex: current?.hex || state.currentHex || record.nodes.home.hex,
            toHex: target.hex,
            departedAt: at,
            arrivesAt: at + record.commuteMinutes * 60,
            activity: 'travelling',
            arrivalActivity: event.payload?.activity || 'scheduled',
        });
        const next = nextTransition(record, at + 1);
        scheduler().scheduleEvent(record.id, next.at, EVENT_TYPE, { target: next.target, activity: next.activity });
    }

    function ensureHandler() {
        if (handlerInstalled || !scheduler()) return !!scheduler();
        scheduler().registerHandler(EVENT_TYPE, handleRoutineTransition);
        handlerInstalled = true;
        return true;
    }

    function ensurePopulation(count = DEFAULT_POPULATION) {
        const target = Math.max(0, Math.floor(Number(count) || 0));
        if (!crossroads() || !ensureHandler()) return 0;
        for (let i = records.size; i < target; i++) {
            const record = makeRecord(i);
            records.set(record.id, record);
            registerRecord(record);
        }
        return records.size;
    }

    function partyAnchor() {
        return (window.entities || []).find(e => e?.alive && e.side === 'player' && !e.rider)?.hex || null;
    }

    function hexDistance(a, b) {
        if (!a || !b) return Infinity;
        if (typeof window.distance === 'function') return window.distance(a, b);
        return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
    }

    function passableSpawnHex(desired) {
        if (!desired) return null;
        const occupied = new Set((window.entities || []).filter(e => e?.alive && e.hex).map(e => `${e.hex.q},${e.hex.r}`));
        const queue = [{ q: Math.round(desired.q), r: Math.round(desired.r) }];
        const seen = new Set();
        while (queue.length && seen.size < 80) {
            const hex = queue.shift();
            const key = `${hex.q},${hex.r}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const terrain = typeof window.getTerrainAt === 'function' ? window.getTerrainAt(hex.q, hex.r) : null;
            const name = terrain?.name;
            if (!occupied.has(key) && name !== 'Wall' && name !== 'Water' && name !== 'Palisade Wall') return hex;
            if (typeof window.getNeighbors === 'function') queue.push(...window.getNeighbors(hex.q, hex.r));
        }
        return { q: Math.round(desired.q), r: Math.round(desired.r) };
    }

    function recordLocation(record, at = nowSeconds()) {
        const location = scheduler()?.getAbstractLocation(record.id, at);
        if (location?.hex) return location.hex;
        return scheduler()?.getState(record.id)?.currentHex || record.nodes.home.hex;
    }

    function materialise(record, at = nowSeconds()) {
        if (!record?.alive || materialised.has(record.id) || typeof window.Entity !== 'function') return null;
        const hex = passableSpawnHex(recordLocation(record, at));
        if (!hex) return null;

        const entity = new window.Entity(record.name, record.colour, hex, 10);
        entity.id = record.id;
        entity.side = 'neutral';
        entity.isNPC = true;
        entity.race = record.race;
        entity.gender = record.gender;
        entity.tags = ['humanoid', 'civilian'];
        entity.occupation = record.occupation;
        entity.ambientProp = record.prop;
        entity.appearance = { ...record.appearance };
        entity.generatedCivilianSeed = record.seed;
        entity.isGeneratedCivilian = true;
        entity.hp = 6 + (record.appearance.build === 'broad' || record.appearance.build === 'stocky' ? 2 : 0);
        entity.maxHp = entity.hp;
        entity.visualQ = entity.startQ = hex.q;
        entity.visualR = entity.startR = hex.r;

        const state = scheduler()?.getState(record.id);
        if (state?.travel?.toHex) {
            entity.destination = { q: Math.round(state.travel.toHex.q), r: Math.round(state.travel.toHex.r) };
            entity.prefersRoads = true;
        }
        window.entities.push(entity);
        materialised.set(record.id, entity);
        scheduler()?.promoteNpc(record.id, 'materialised-near-player');
        materialiseCount++;
        return entity;
    }

    function dematerialise(recordId, { force = false } = {}) {
        const entity = materialised.get(recordId);
        if (!entity || (window.isInCombat && !force)) return false;
        const record = records.get(recordId);
        if (!entity.alive) {
            if (record) record.alive = false;
            scheduler()?.unregisterNpc(recordId);
        } else {
            const state = scheduler()?.getState(recordId);
            scheduler()?.demoteNpc(recordId, state?.travel ? 'abstract' : 'dormant');
        }
        const index = window.entities.indexOf(entity);
        if (index >= 0) window.entities.splice(index, 1);
        materialised.delete(recordId);
        dematerialiseCount++;
        return true;
    }

    function syncDeaths() {
        for (const [id, entity] of materialised) {
            if (!entity.alive) {
                const record = records.get(id);
                if (record) record.alive = false;
            }
        }
    }

    function pulseMaterialisation() {
        pulseCount++;
        if (window.currentCampaign !== '2' || !window.entities || !scheduler()) {
            return { active: false, materialised: materialised.size };
        }
        if (!records.size) ensurePopulation(DEFAULT_POPULATION);
        syncDeaths();

        const party = partyAnchor();
        const centre = crossroads();
        if (!party || !centre) return { active: false, materialised: materialised.size };

        // Important scale shortcut: outside Hollowmere, do not scan records.
        if (hexDistance(party, centre) > SETTLEMENT_WAKE_RADIUS) {
            if (!window.isInCombat) for (const id of [...materialised.keys()]) dematerialise(id);
            return { active: false, materialised: materialised.size, scanned: 0 };
        }

        const at = nowSeconds();
        const candidates = [];
        for (const record of records.values()) {
            if (!record.alive) continue;
            const distance = hexDistance(party, recordLocation(record, at));
            if (distance <= MATERIALISE_RADIUS) candidates.push({ record, distance });
        }
        candidates.sort((a, b) => a.distance - b.distance || a.record.id.localeCompare(b.record.id));
        const selected = candidates.slice(0, MAX_MATERIALISED);
        const wanted = new Set(selected.map(x => x.record.id));

        for (const { record } of selected) materialise(record, at);
        if (!window.isInCombat) {
            for (const id of [...materialised.keys()]) if (!wanted.has(id)) dematerialise(id);
        }
        return { active: true, materialised: materialised.size, scanned: records.size, candidates: candidates.length };
    }

    function clearGeneratedPopulation() {
        for (const id of [...materialised.keys()]) dematerialise(id, { force: true });
        for (const id of records.keys()) scheduler()?.unregisterNpc(id);
        records.clear();
        return 0;
    }

    function canBoot() {
        return window.currentCampaign === '2' && !!scheduler() && !!crossroads() &&
            typeof window.Entity === 'function' && (window.entities || []).some(e => e?.alive && e.side === 'player');
    }

    function bootAndPulse() {
        if (!canBoot()) return false;
        ensurePopulation(DEFAULT_POPULATION);
        pulseMaterialisation();
        return true;
    }

    window.GeneratedCivilianPopulation = {
        ensurePopulation,
        pulseMaterialisation,
        clearGeneratedPopulation,
        materialise,
        dematerialise,
        recordLocation,
        targetForTime,
        get records() { return records; },
        get materialised() { return materialised; },
        get stats() {
            return {
                population: records.size,
                living: [...records.values()].filter(r => r.alive).length,
                materialised: materialised.size,
                pulseCount,
                materialiseCount,
                dematerialiseCount,
                maxMaterialised: MAX_MATERIALISED,
            };
        },
        DEFAULT_POPULATION,
        MAX_MATERIALISED,
        SETTLEMENT_WAKE_RADIUS,
        MATERIALISE_RADIUS,
    };

    // One timer, one pulse. It also notices Campaign 2 starting after the title
    // screen, so no page reload or extra game-engine hook is required.
    window.__generatedCivilianPopulationTimer = setInterval(bootAndPulse, PULSE_MS);
    bootAndPulse();
})();
