// silverhartAvenueDetours.js
// Keeps Silverhart's six principal avenues continuous without bulldozing
// authored buildings that already occupy an ideal radial centreline. A blocked
// centreline hex gets a short lateral bypass; the authored interior remains
// untouched and the bypass becomes part of deterministic world generation.
(() => {
    'use strict';

    const BLOCKERS = new Set([
        'Wall', 'Palisade Wall', 'Climbable Wall', 'Keep Wall', 'Stone Wall',
        'Water', 'Wood Floor', 'Cave Floor'
    ]);
    const DIRS = [
        {q:1,r:0,name:'east'}, {q:1,r:-1,name:'north-east'},
        {q:0,r:-1,name:'north'}, {q:-1,r:0,name:'west'},
        {q:-1,r:1,name:'south-west'}, {q:0,r:1,name:'south'},
    ];
    let wrapperInstalled = false;

    const key = h => `${h.q},${h.r}`;
    function terrain(h) { return window.getTerrainAt?.(h.q,h.r)?.name || ''; }
    function dist(a,b) {
        if (typeof window.distance === 'function') return window.distance(a,b);
        return Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs((a.q+a.r)-(b.q+b.r)));
    }
    function centre() { return window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter || null; }

    function paintSafe(h) {
        const t=terrain(h);
        if(BLOCKERS.has(t)) return false;
        if(t!=='Path') window.setTerrainAt(h.q,h.r,'Path');
        return true;
    }

    function lateralCandidates(h, dir, c, radial) {
        return (window.getNeighbors?.(h.q,h.r)||[])
            .filter(n => {
                const t=terrain(n);
                const r=dist(c,n);
                // Stay alongside this point of the avenue rather than cutting
                // inward through a block or jumping onto another radial road.
                return !BLOCKERS.has(t) && Math.abs(r-radial)<=1;
            })
            .sort((a,b) => {
                // Prefer a true side-step over moving farther along the same
                // centreline. This makes the bypass visually legible.
                const aForward=(a.q-h.q)===dir.q&&(a.r-h.r)===dir.r;
                const bForward=(b.q-h.q)===dir.q&&(b.r-h.r)===dir.r;
                return Number(aForward)-Number(bForward);
            });
    }

    function ensureAvenueDetours() {
        const c=centre();
        const registry=window.SilverhartCapitalRegistry;
        if(!c||!registry||!window.setTerrainAt) return false;
        const inner=Number(window.campaign2SilverhartRingRoadRadius||registry.innerRingRadius||30);
        const wall=Number(window.campaign2SilverhartCityWallRadius||registry.cityWallRadius||60);
        const detours=[];
        const blocked=[];

        DIRS.forEach(dir => {
            for(let d=inner;d<=wall+8;d++) {
                const h={q:c.q+dir.q*d,r:c.r+dir.r*d};
                const t=terrain(h);
                if(t==='Path') continue;
                if(!BLOCKERS.has(t)) {
                    paintSafe(h);
                    continue;
                }
                blocked.push({direction:dir.name,d,hex:{...h},terrain:t});
                const candidates=lateralCandidates(h,dir,c,d);
                // Paint up to two side tiles. Consecutive blocked centreline
                // cells then naturally join into a parallel one-hex bypass.
                candidates.slice(0,2).forEach(n => {
                    if(paintSafe(n)) detours.push({direction:dir.name,d,hex:{...n},around:{...h}});
                });
            }
        });

        registry.avenueDiagnostics={blocked,detours};
        window._campaign2TerrainBaseline={...window.overrideTerrain};
        window._campaign2TileObjectsBaseline={...window.tileObjects};
        return true;
    }

    function installWrapper() {
        if(wrapperInstalled) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function'||!original.__silverhartCapitalCompletion) return false;
        if(original.__silverhartAvenueDetours){wrapperInstalled=true;return true;}
        const wrapped=function(...args){
            const result=original.apply(this,args);
            ensureAvenueDetours();
            return result;
        };
        wrapped.__silverhartAvenueDetours=true;
        wrapped.__silverhartCapitalCompletion=true;
        wrapped.__silverhartCapitalRebuild=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        wrapperInstalled=true;
        return true;
    }

    window.SilverhartAvenueDetours={ensureAvenueDetours,installWrapper};
    const timer=setInterval(()=>{
        if(installWrapper()) {
            if(window.currentCampaign==='2') ensureAvenueDetours();
            clearInterval(timer);
        }
    },25);
    setTimeout(()=>clearInterval(timer),5000);
})();
