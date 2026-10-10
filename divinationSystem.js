// divinationSystem.js
// Deterministic divine foresight: prophecies point at real future events rather than rolling a fake fortune check.
(function () {
    function getState() {
        if (!window.divinationState) window.divinationState = { nextId: 1, active: [] };
        if (!Array.isArray(window.divinationState.active)) window.divinationState.active = [];
        return window.divinationState;
    }
    function dist(a,b) { return window.distance ? window.distance(a,b) : 999; }
    function parseKey(key) { const p = String(key).split(',').map(Number); return p.length === 2 && p.every(Number.isFinite) ? {q:p[0],r:p[1]} : null; }
    function nearbyHidden(caster) {
        const out=[];
        Object.keys(window.tileObjects || {}).forEach(key => {
            const o=window.tileObjects[key], h=parseKey(key);
            if (!o || o.discovered || !h || !['secret_door','secret_stash'].includes(o.type)) return;
            const d=dist(caster.hex,h); if (d<=12) out.push({key,h,o,d});
        });
        out.sort((a,b)=>a.d-b.d); return out[0] || null;
    }
    function nearbyItem(caster) {
        const out=[];
        Object.keys(window.mapItems || {}).forEach(key => {
            const ids=window.mapItems[key], h=parseKey(key);
            if (!Array.isArray(ids) || !ids.length || !h) return;
            const d=dist(caster.hex,h); if (d<=12) out.push({key,h,ids:ids.slice(),d});
        });
        out.sort((a,b)=>a.d-b.d); return out[0] || null;
    }
    function replaceForCaster(id) {
        const s=getState(); s.active=s.active.filter(p=>p.casterId!==id && !p.fulfilled);
    }
    function create(caster) {
        replaceForCaster(caster.id);
        const s=getState(), expires=(window.worldSeconds||0)+3600, hidden=nearbyHidden(caster), item=nearbyItem(caster);
        let p;
        if (hidden) {
            p={id:s.nextId++,casterId:caster.id,kind:'hidden',targetKey:hidden.key,expiresAt:expires,fulfilled:false,
               text:hidden.o.type==='secret_door' ? 'What is hidden will open to you. Before you leave this place, look where the stone does not quite belong.' : 'Something lost is waiting beneath the ordinary. Before you leave this place, search where your eye would normally pass over it.'};
        } else if (item) {
            p={id:s.nextId++,casterId:caster.id,kind:'found_item',targetKey:item.key,expiresAt:expires,fulfilled:false,
               text:'A small fortune lies ahead, already within your reach. You will find what the world has placed in your path before you rest.'};
        } else {
            p={id:s.nextId++,casterId:caster.id,kind:'true_strike',expiresAt:expires,fulfilled:false,
               text:'The next time you strike in anger, your hand will not miss. The blow has already happened in the sight beyond sight.'};
        }
        s.active.push(p); return p;
    }
    function revealHidden(p,caster) {
        const o=window.tileObjects?.[p.targetKey]; if (!o || o.discovered) return false;
        o.discovered=true;
        if (o.type==='secret_door') {
            window.tileObjects[p.targetKey]={type:'door_closed',lightRadius:0,locked:false,hp:20,maxHp:20,closedTerrain:o.closedTerrain||'Wall',openTerrain:o.openTerrain||'Wood Floor'};
            window.showMessage(caster.name+'\'s vision proves true: a hidden door reveals itself.');
        } else {
            const pl=window.party?.[0]; if(pl){pl.gold=(pl.gold||0)+(o.gold||0);(o.items||[]).forEach(id=>pl.inventory.push(id));}
            delete window.tileObjects[p.targetKey];
            const names=(o.items||[]).map(id=>window.items?.[id]?.name||id).join(', ');
            const loot=[o.gold ? (o.gold+' gold') : null,names].filter(Boolean).join(', ');
            window.showMessage(caster.name+'\'s vision proves true: a hidden stash is found'+(loot?' ('+loot+')':'.'));
        }
        p.fulfilled=true; window.drawMap?.(); window.renderEntities?.(); return true;
    }
    function fulfilItem(p,caster) {
        const ids=window.mapItems?.[p.targetKey], pl=window.party?.[0]; if(!Array.isArray(ids)||!ids.length||!pl) return false;
        ids.forEach(id=>pl.inventory.push(id)); window.mapItems[p.targetKey]=[]; p.fulfilled=true;
        window.showMessage(caster.name+'\'s vision proves true: '+ids.map(id=>window.items?.[id]?.name||id).join(', ')+' was waiting here.');
        window.showInventoryScreen?.(); return true;
    }
    function tryFulfilNearPlayer(caster) {
        getState().active.filter(p=>p.casterId===caster.id&&!p.fulfilled).forEach(p=>{
            const h=parseKey(p.targetKey); if(!h) return;
            if(p.kind==='hidden' && dist(caster.hex,h)<=2) revealHidden(p,caster);
            if(p.kind==='found_item' && dist(caster.hex,h)<=1) fulfilItem(p,caster);
        });
    }
    function consumeTrueStrike(caster) {
        const now=window.worldSeconds||0, p=getState().active.find(x=>x.casterId===caster.id&&x.kind==='true_strike'&&!x.fulfilled&&x.expiresAt>=now);
        if(!p) return false; p.fulfilled=true; window.showMessage('The blow lands exactly as the vision foretold.'); return true;
    }
    function tick() { const now=window.worldSeconds||0; getState().active=getState().active.filter(p=>!p.fulfilled&&p.expiresAt>now); }
    function cast(caster) { const p=create(caster); window.showMessage(caster.name+' looks beyond the present...'); window.showMessage('Divination: '+p.text); return p; }
    window.divinationSystem={state:getState,cast,tick,tryFulfilNearPlayer,consumeTrueStrike,fulfil:id=>{const p=getState().active.find(x=>x.id===id&&!x.fulfilled);if(!p)return false;p.fulfilled=true;return true;}};
})();
