// deepholdsFreightDoorFix.js
// The Deepholds expansion paints its short exterior freight road after carving
// the freight vestibule. The original loop begins on the door hex itself,
// replacing the doorway's Cave Floor with Path while leaving door_open there.
// Keep the exterior road, but restore the actual threshold after world build.
(() => {
    'use strict';
    let installed=false;

    function repair() {
        const d=window.campaign2DeepholdsFreightDoor;
        if(!d||!window.setTerrainAt||!window.tileObjects) return false;
        const obj=window.tileObjects[`${d.q},${d.r}`];
        if(obj?.type!=='door_open') return false;
        window.setTerrainAt(d.q,d.r,'Cave Floor');
        return true;
    }

    function installWrapper() {
        if(installed) return true;
        const original=window.setupVillageScene;
        if(typeof original!=='function') return false;
        if(original.__deepholdsFreightDoorFix){installed=true;return true;}
        const wrapped=function(...args){
            const result=original.apply(this,args);
            if(repair()) {
                window._campaign2TerrainBaseline={...window.overrideTerrain};
                window._campaign2TileObjectsBaseline={...window.tileObjects};
            }
            return result;
        };
        wrapped.__deepholdsFreightDoorFix=true;
        wrapped.__original=original;
        window.setupVillageScene=wrapped;
        installed=true;
        return true;
    }

    function install(){
        installWrapper();
        if(window.currentCampaign==='2') repair();
        return installed;
    }

    window.DeepholdsFreightDoorFix={install,repair};
    if(!install()) {
        const timer=setInterval(()=>{if(install())clearInterval(timer);},100);
        setTimeout(()=>clearInterval(timer),5000);
    }
})();