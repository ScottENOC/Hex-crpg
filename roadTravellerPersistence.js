// roadTravellerPersistence.js
// Saves persistent road people separately from their transient on-map Entity
// shells, mirroring the generated-civilian persistence pattern without ever
// replacing the scheduler state belonging to other NPC systems.
(() => {
    'use strict';

    const SNAPSHOT_VERSION=1;
    const PREFIX='road-traveller:';
    let installed=false;
    let importEpoch=0;

    const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
    const road=()=>window.PersistentRoadTravellers;
    const scheduler=()=>window.NPCRoutineScheduler;
    const isRoadId=id=>String(id??'').startsWith(PREFIX);

    function exportState() {
        const r=road(), s=scheduler();
        if (!r?.records || !s?.exportState) return null;
        r.syncDeaths?.();
        const full=s.exportState();
        const states=(full.states||[]).filter(x=>isRoadId(x.id)).map(clone);
        const generationById=new Map(states.map(x=>[String(x.id),Number(x.eventGeneration||0)]));
        const events=(full.events||[])
            .filter(e=>isRoadId(e.npcId) && generationById.get(String(e.npcId))===Number(e.generation||0))
            .map(clone);
        const savedRecords=[...r.records.values()].map(record=>({ ...clone(record), materialisedEntityId:null }));
        return {version:SNAPSHOT_VERSION,records:savedRecords,scheduler:{version:1,states,events}};
    }

    function stripTransientEntities(gameState) {
        if (!gameState || !Array.isArray(gameState.entities)) return gameState;
        gameState.entities=gameState.entities.filter(e=>!e?.isRoadTraveller && !isRoadId(e?.id));
        return gameState;
    }

    function patchGameState(gameState,snapshot=exportState()) {
        if (!gameState || typeof gameState!=='object') return gameState;
        stripTransientEntities(gameState);
        gameState.roadTravellerState=snapshot;
        return gameState;
    }

    function clearTransientEntities() {
        if (Array.isArray(window.entities)) window.entities=window.entities.filter(e=>!e?.isRoadTraveller && !isRoadId(e?.id));
    }

    function restoreFresh() {
        const r=road();
        if (!r) return false;
        r.clear?.({unregister:true});
        clearTransientEntities();
        r.ensureTravellers?.();
        r.pulse?.();
        return true;
    }

    function importState(snapshot) {
        const r=road(), s=scheduler();
        if (!r?.records || !s?.registerNpc || !s?.scheduleEvent) return false;
        r.clear?.({unregister:true});
        clearTransientEntities();

        if (!snapshot || Number(snapshot.version)!==SNAPSHOT_VERSION || !Array.isArray(snapshot.records)) return restoreFresh();

        for (const raw of snapshot.records) {
            if (!raw?.id || !isRoadId(raw.id)) continue;
            r.records.set(String(raw.id),{...clone(raw),materialisedEntityId:null});
        }

        const savedStates=Array.isArray(snapshot.scheduler?.states)?snapshot.scheduler.states:[];
        const savedEvents=Array.isArray(snapshot.scheduler?.events)?snapshot.scheduler.events:[];
        const stateById=new Map(savedStates.map(x=>[String(x.id),x]));
        importEpoch++;
        const generationBase=3000000+importEpoch*100000;

        for (const record of r.records.values()) {
            if (!record.alive) continue;
            const raw=stateById.get(String(record.id));
            if (!raw) { r.registerRecord?.(record); continue; }
            const restored=clone(raw);
            restored.eventGeneration=generationBase+Number(raw.eventGeneration||0);
            // The saved live Entity was deliberately stripped. Resume at the
            // appropriate cheap simulation level until the party comes near.
            restored.simulationLevel=restored.travel?'abstract':'dormant';
            restored.activeReason=null;
            const state=s.registerNpc(record.id,restored);
            Object.assign(state,restored,{id:record.id});
        }

        for (const event of savedEvents) {
            const id=String(event?.npcId??'');
            const rawState=stateById.get(id);
            const record=r.records.get(id);
            if (!rawState || !record?.alive || !Number.isFinite(event?.at)) continue;
            if (Number(event.generation||0)!==Number(rawState.eventGeneration||0)) continue;
            s.scheduleEvent(id,event.at,event.type,clone(event.payload));
        }

        // Defensive fallback for any partial snapshot.
        for (const record of r.records.values()) if (record.alive && !s.getState(record.id)) r.registerRecord?.(record);
        r.pulse?.();
        window.drawMap?.();
        return true;
    }

    function localSaveKey(saveName) {
        if (saveName==='quick_save') return 'rpg_save_quick_save';
        const raw=String(saveName||'rpg_save_game');
        return raw.startsWith('rpg_save_')?raw:`rpg_save_${raw||'game'}`;
    }

    function installSaveWrapper() {
        const original=window.saveGame;
        if (typeof original!=='function') return false;
        if (original.__roadTravellerPersistence) return true;
        const wrapped=function(saveName='rpg_save_game') {
            const key=localSaveKey(saveName);
            const snapshot=exportState();
            const previousSetItem=Storage.prototype.setItem;
            Storage.prototype.setItem=function(k,value) {
                if (k===key) {
                    try { value=JSON.stringify(patchGameState(JSON.parse(value),snapshot)); }
                    catch (e) { console.warn('Could not attach road traveller save state',e); }
                }
                return previousSetItem.call(this,k,value);
            };
            try { return original.apply(this,arguments); }
            finally { Storage.prototype.setItem=previousSetItem; }
        };
        wrapped.__roadTravellerPersistence=true;
        wrapped.__original=original;
        window.saveGame=wrapped;
        return true;
    }

    function installLoadWrapper() {
        const original=window.loadGame;
        if (typeof original!=='function') return false;
        if (original.__roadTravellerPersistence) return true;
        const wrapped=function(saveName='rpg_save_game') {
            const key=localSaveKey(saveName);
            let snapshot;
            try { snapshot=JSON.parse(localStorage.getItem(key)||'null')?.roadTravellerState; }
            catch (_) { snapshot=undefined; }
            const result=original.apply(this,arguments);
            if (window.currentCampaign==='2') importState(snapshot);
            return result;
        };
        wrapped.__roadTravellerPersistence=true;
        wrapped.__original=original;
        window.loadGame=wrapped;
        return true;
    }

    function installExportWrapper() {
        const original=window.exportSaveCode;
        if (typeof original!=='function') return false;
        if (original.__roadTravellerPersistence) return true;
        const wrapped=function() {
            const code=original.apply(this,arguments);
            if (!code) return code;
            try {
                const json=decodeURIComponent(escape(atob(code)));
                const patched=patchGameState(JSON.parse(json));
                return btoa(unescape(encodeURIComponent(JSON.stringify(patched))));
            } catch (e) {
                console.warn('Could not attach road traveller export state',e);
                return code;
            }
        };
        wrapped.__roadTravellerPersistence=true;
        wrapped.__original=original;
        window.exportSaveCode=wrapped;
        return true;
    }

    function install() {
        if (!road() || !scheduler()) return false;
        const ok=installSaveWrapper() & installLoadWrapper() & installExportWrapper();
        if (ok) installed=true;
        window.RoadTravellerPersistence={SNAPSHOT_VERSION,exportState,importState,patchGameState,stripTransientEntities,install,get installed(){return installed;}};
        return !!ok;
    }

    if (!install()) {
        const timer=setInterval(()=>{if(install()) clearInterval(timer);},50);
        setTimeout(()=>clearInterval(timer),10000);
    }
})();
