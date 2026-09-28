// roadsideWorldTextureV2.js
// Five cheap authored micro-locations for Campaign 2. These are deterministic
// world texture rather than quests: no markers, no polling, no simulation.
(() => {
    'use strict';

    let built = false;
    let installed = false;
    let clickCanvas = null;
    let clickHandler = null;
    const placed = new Map();
    const key = h => `${h.q},${h.r}`;

    const DEFINITIONS = {
        'ruined-toll-post': {
            title: 'Ruined Toll Post', type: 'signpost',
            text: 'Two leaning posts and the stump of a barrier mark an old toll point. The kingdom stopped collecting here years ago, but someone has recently scratched fresh wagon tallies into the back of the sign.',
            searchedText: 'The old toll post has nothing else to give up. Fresh wagon marks still cut across the weathered timber.',
            loot: ['torch'],
            search: 'A dry torch is wedged behind the fallen barrier. The fresh tally marks suggest someone still watches traffic on this road, even if they no longer wear a tollkeeper’s badge.',
        },
        'charcoal-burner-clearing': {
            title: 'Charcoal Burner’s Clearing', type: 'fireplace',
            text: 'A blackened earth mound slumps beside a ring of cut saplings. The burn was abandoned halfway through; charcoal dust coats everything, but there are no tools and no footprints newer than the rain.',
            searchedText: 'Only soot and damp charcoal remain in the clearing.',
            loot: ['wood', 'torch'],
            search: 'You recover one dry billet from under the mound and a pitch-wrapped torch from a covered basket. Whoever worked here left in enough of a hurry to abandon useful fuel.',
        },
        'old-road-cairn': {
            title: 'Old Road Cairn', type: 'journal', flavourOnly: true,
            text: 'A shoulder-high cairn stands a few paces off the road. Flat stones have been added over generations. Beneath the newest one, somebody has tucked a tiny carved horse and three wilted flowers.',
            searchedText: 'The cairn is unchanged except for the stone you set back into place.',
            actionLabel: 'Set the stone back carefully.',
            search: 'You replace the loose stone without taking anything. There is no inscription and no reward; only the sense that many travellers knew what this place meant without needing it explained.',
        },
        'abandoned-fishing-spot': {
            title: 'Abandoned Fishing Spot', type: 'fireplace',
            text: 'A low fire ring, a forked rod-rest and a line of fish scales sit beside the reeds. The line was cut cleanly and left tied to the branch, as though its owner decided very suddenly that fishing was no longer important.',
            searchedText: 'The bank is quiet. The cut line still flutters from the branch.',
            loot: ['herbs'],
            search: 'A small bundle of watermint and bitterleaf is tucked beneath a dry stone. The fishing gear itself is worthless, but the cleanly cut line is odd enough to remember.',
        },
        'minor-cave-shelter': {
            title: 'Shallow Cave Shelter', type: 'journal',
            text: 'A narrow break in the rock opens into a shallow dry pocket. Someone once slept here: there is old ash, a cracked cup and a knife-scratched line on the wall counting seven nights.',
            searchedText: 'The shallow cave has already been searched. The seven tally cuts remain on the wall.',
            loot: ['torch', 'dagger'],
            search: 'Behind a loose stone you find a wrapped torch and a plain knife. Nothing deeper opens beyond the shelter; whoever stayed here was hiding, not exploring.',
        },
    };

    function actor() {
        const turn = window.currentTurnEntity;
        if (turn?.side === 'player') return turn;
        return window.player || (window.entities || []).find(e => e?.alive && e.side === 'player') || null;
    }

    function free(h, allowed = ['Grass', 'Forest', 'Dirt', 'Path']) {
        const terrain = window.getTerrainAt?.(h.q, h.r)?.name;
        if (!allowed.includes(terrain)) return false;
        if (window.tileObjects?.[key(h)]) return false;
        return !(window.entities || []).some(e => e?.alive && e.hex?.q === h.q && e.hex?.r === h.r);
    }

    function nearestFree(target, allowed) {
        const all = [target];
        for (let radius = 1; radius <= 8; radius++) {
            for (let dq = -radius; dq <= radius; dq++) {
                for (let dr = -radius; dr <= radius; dr++) {
                    const h = { q:target.q+dq, r:target.r+dr };
                    if (window.distance && window.distance(target,h) !== radius) continue;
                    all.push(h);
                }
            }
        }
        return all.find(h => free(h,allowed)) || null;
    }

    function place(id, target, opts={}) {
        const def = DEFINITIONS[id];
        if (!def) return null;
        const h = nearestFree(target, opts.allowed || ['Grass','Forest','Dirt','Path']);
        if (!h) return null;
        if (opts.terrain) window.setTerrainAt?.(h.q,h.r,opts.terrain);
        window.tileObjects[key(h)] = {
            type:def.type,
            lightRadius:0,
            roadsideDiscoveryId:id,
            searched:false,
            flavourOnly:!!def.flavourOnly,
        };
        placed.set(id,{ id, hex:{...h} });
        return h;
    }

    function decorateToll(h) {
        if (!h) return;
        const debris = [{q:h.q-1,r:h.r},{q:h.q+1,r:h.r},{q:h.q+2,r:h.r-1}];
        debris.forEach((p,i)=>{
            if (!window.tileObjects[key(p)]) window.tileObjects[key(p)] = { type:'fence_broken', lightRadius:0, decorative:true, roadsideSite:'ruined-toll-post', piece:i };
        });
    }

    function decorateCharcoal(h) {
        if (!h) return;
        [{q:h.q-1,r:h.r+1},{q:h.q+1,r:h.r},{q:h.q,r:h.r-1}].forEach((p,i)=>{
            if (!window.tileObjects[key(p)]) window.tileObjects[key(p)] = { type:'fence_broken', lightRadius:0, decorative:true, roadsideSite:'charcoal-burner-clearing', piece:i };
        });
    }

    function decorateFishing(h) {
        if (!h) return;
        const bank = [{q:h.q+1,r:h.r},{q:h.q+1,r:h.r-1},{q:h.q,r:h.r-1}];
        bank.forEach(p=>{
            const t = window.getTerrainAt?.(p.q,p.r)?.name;
            if (t === 'Grass' || t === 'Dirt' || t === 'Forest') window.setTerrainAt?.(p.q,p.r,'Dirt');
        });
    }

    function decorateCave(h) {
        if (!h) return;
        const cave = [h,{q:h.q-1,r:h.r},{q:h.q-1,r:h.r+1}];
        cave.forEach(p=>window.setTerrainAt?.(p.q,p.r,'Cave Floor'));
        const rock = [
            {q:h.q-2,r:h.r-1},{q:h.q-2,r:h.r},{q:h.q-2,r:h.r+1},{q:h.q-1,r:h.r-1},{q:h.q,r:h.r-1}
        ];
        rock.forEach(p=>{
            if (!window.tileObjects[key(p)]) window.setTerrainAt?.(p.q,p.r,'Wall');
        });
    }

    function build() {
        if (built || window.currentCampaign !== '2') return built;
        const c = window.campaign2Landmarks?.crossroads;
        if (!c || !window.tileObjects || !window.getTerrainAt) return false;
        placed.clear();

        const toll = place('ruined-toll-post',{q:c.q+138,r:c.r+5},{allowed:['Grass','Dirt','Path','Forest']});
        const charcoal = place('charcoal-burner-clearing',{q:c.q-58,r:c.r-44},{allowed:['Forest','Grass','Dirt']});
        place('old-road-cairn',{q:c.q+4,r:c.r-126},{allowed:['Grass','Dirt','Forest','Path']});
        const fishing = place('abandoned-fishing-spot',{q:c.q+34,r:c.r+72},{allowed:['Grass','Dirt','Forest']});
        const cave = place('minor-cave-shelter',{q:c.q-118,r:c.r+28},{allowed:['Grass','Forest','Dirt']});

        decorateToll(toll);
        decorateCharcoal(charcoal);
        decorateFishing(fishing);
        decorateCave(cave);

        window._campaign2TerrainBaseline = { ...window.overrideTerrain };
        window._campaign2TileObjectsBaseline = { ...window.tileObjects };
        built = true;
        return true;
    }

    function giveItems(who, ids) {
        const partyRecord = window.party?.find(p=>p.name === who?.name);
        if (!who || !ids?.length) return [];
        who.inventory = who.inventory || [];
        if (partyRecord) partyRecord.inventory = partyRecord.inventory || [];
        const names=[];
        ids.forEach(id=>{
            if (!window.items?.[id]) return;
            who.inventory.push(id);
            if (partyRecord && partyRecord.inventory !== who.inventory) partyRecord.inventory.push(id);
            names.push(window.items[id].name);
        });
        return names;
    }

    function show(def,text,choices) {
        const speaker={ name:def.title, customImage:def.type === 'fireplace' ? 'journal' : def.type, gender:'other', race:'human' };
        if (window.showDialogue) window.showDialogue(speaker,text,choices);
        else window.showMessage?.(text);
    }

    function markSearched(h,obj,who) {
        const replacement={...obj,searched:true,searchedBy:who.name};
        window.tileObjects[key(h)] = replacement;
        return replacement;
    }

    function interact(id,obj,h,who=actor()) {
        const def=DEFINITIONS[id];
        if (!def || !obj || !who) return false;
        if (obj.searched) {
            show(def,def.searchedText,[{label:'Leave it.',action:()=>{}}]);
            return true;
        }
        show(def,def.text,[
            { label:def.actionLabel || (def.flavourOnly ? 'Look a little longer.' : 'Search carefully.'), action:()=>{
                const names=giveItems(who,def.loot || []);
                markSearched(h,obj,who);
                const suffix=names.length ? ` You take ${names.join(', ')}.` : '';
                show(def,`${def.search}${suffix}`,[{label:'Continue.',action:()=>{}}]);
                window.drawMap?.();
            }},
            {label:'Leave it alone.',action:()=>{}},
        ]);
        return true;
    }

    function installClick() {
        const canvas=window.mapCanvas || document.getElementById('mapCanvas') || document.querySelector('canvas');
        if (!canvas || !window.screenToHex) return false;
        if (clickCanvas === canvas && clickHandler) return true;
        if (clickCanvas && clickHandler) clickCanvas.removeEventListener('click',clickHandler,true);
        clickHandler=e=>{
            if (window.totalDragDistance > 10) return;
            const h=window.screenToHex({x:e.clientX,y:e.clientY});
            const obj=window.tileObjects?.[key(h)];
            if (!obj?.roadsideDiscoveryId) return;
            const who=actor();
            if (!who || (window.distance?.(who.hex,h) ?? 99) > 1) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            interact(obj.roadsideDiscoveryId,obj,h,who);
        };
        canvas.addEventListener('click',clickHandler,true);
        clickCanvas=canvas;
        return true;
    }

    function installWorldWrapper() {
        if (installed) return true;
        const original=window.setupVillageScene;
        if (typeof original !== 'function') return false;
        if (original.__roadsideWorldTextureV2) { installed=true; return true; }
        const wrapped=function(...args) {
            built=false;
            placed.clear();
            const result=original.apply(this,args);
            build();
            installClick();
            return result;
        };
        wrapped.__roadsideWorldTextureV2=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        installed=true;
        return true;
    }

    function install() {
        installWorldWrapper();
        installClick();
        if (window.currentCampaign === '2' && !built) build();
        return installed;
    }

    window.RoadsideWorldTextureV2 = {
        install,build,interact,
        definitions:DEFINITIONS,
        getPlaced:id=>placed.get(id) || null,
        get allPlaced(){return [...placed.values()];},
        get stats(){return {installed,built,placed:placed.size};},
    };

    if (!install()) {
        const timer=setInterval(()=>{if(install()) clearInterval(timer);},50);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();
