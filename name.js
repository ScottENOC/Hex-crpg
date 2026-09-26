const names = {
    human: {
        male: ["Alden", "Bertram", "Cedric", "Doran", "Edmund", "Felix", "Gareth", "Harold", "Ivan", "Julian", "Kaelen", "Leopold", "Merrick", "Nathaniel", "Osmond", "Percival", "Quentin", "Roderick", "Silas", "Tobias"],
        female: ["Adela", "Beatrix", "Clara", "Dorothy", "Edith", "Felicia", "Gwen", "Hilda", "Isolde", "Juliana", "Katarina", "Lucia", "Millicent", "Norah", "Odette", "Philippa", "Rowena", "Sibyl", "Theodora", "Ursula"]
    },
    elf: {
        male: ["Aelien", "Belenos", "Caelum", "Draugr", "Eldrin", "Faolan", "Galanth", "Halar", "Ithil", "Jaelen", "Kaelan", "Luthian", "Mithrandir", "Nathra", "Orelen", "Paelen", "Quirin", "Raelian", "Saelen", "Thaelen"],
        female: ["Aeliana", "Belen", "Caelya", "Draugra", "Eldrina", "Faolana", "Galantha", "Halara", "Ithila", "Jaelena", "Kaelana", "Luthiana", "Mithra", "Nathrae", "Orelia", "Paelia", "Quirina", "Raelia", "Saelia", "Thaelia"]
    },
    dwarf: {
        male: ["Barek", "Dain", "Eitri", "Fili", "Gloin", "Halin", "Kili", "Loni", "Morni", "Nain", "Oin", "Pili", "Ruri", "Suri", "Thorin", "Uri", "Vari", "Zari", "Bifur", "Bofur"],
        female: ["Barka", "Daina", "Eitra", "Filia", "Gloina", "Halina", "Kilia", "Lonia", "Mornia", "Naina", "Oina", "Pilia", "Ruria", "Suria", "Thora", "Uria", "Varia", "Zaria", "Bifura", "Bofura"]
    },
    goblin: {
        male: ["Grukk", "Nizzik", "Vrag", "Snagrat", "Uzzik", "Krull", "Mugg", "Ratlik", "Fenzik", "Yorrik", "Dregnak", "Skitter", "Bogrik", "Wretch", "Cragnub", "Zorrik", "Malrik", "Pikk", "Snarl", "Grimtooth"],
        female: ["Nizza", "Skreea", "Vragga", "Snagra", "Uzza", "Krulla", "Mugga", "Ratlia", "Fenza", "Yorra", "Dregna", "Skitta", "Bogra", "Wretcha", "Cragna", "Zorra", "Malra", "Pikka", "Snarla", "Grimtootha"]
    },
    orc: {
        male: ["Grukan", "Tharok", "Vulgar", "Morgash", "Uthak", "Krezz", "Bralak", "Gornax", "Drakor", "Skarnok", "Ironhide", "Vraskul", "Mogrim", "Hurgash", "Zoggrim", "Bratak", "Krund", "Warguk", "Thromm", "Grimjaw"],
        female: ["Grukana", "Tharoka", "Vulgara", "Morgasha", "Uthaka", "Krezza", "Bralaka", "Gornaxa", "Drakora", "Skarnoka", "Vraskula", "Mogrima", "Hurgasha", "Zoggrima", "Brataka", "Krunda", "Warguka", "Thromma", "Grimjawa", "Ashka"]
    }
};

window.getRandomName = function(race, gender) {
    const list = names[race][gender];
    return list[Math.floor(Math.random() * list.length)];
};
window.generateName = window.getRandomName;

(() => {
    function randomInt(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
    function setRandomSlider(id) { const el=document.getElementById(id); if(!el)return; el.value=String(randomInt(Number(el.min||0),Number(el.max||100))); }
    function setRandomSelect(id) { const el=document.getElementById(id); if(!el||!el.options.length)return; const options=Array.from(el.options).filter(option=>!option.disabled); if(!options.length)return; el.value=options[randomInt(0,options.length-1)].value; }
    window.randomizeCharacterAppearance=function({sync=true}={}){setRandomSlider('shirt-hue-slider');setRandomSlider('pants-hue-slider');setRandomSlider('hair-hue-slider');setRandomSelect('hair-style-select');setRandomSelect('body-type-select');const fantasy=!!document.getElementById('fantasy-skin-check')?.checked;setRandomSlider(fantasy?'skin-hue-slider':'skin-tone-slider');if(window.updateSkinToneControlMode)window.updateSkinToneControlMode();if(window.updateAppearancePreview)window.updateAppearancePreview();if(sync&&window.syncCharacterToServer)window.syncCharacterToServer();};
    window.randomizeCharacterName=function(){const input=document.getElementById('character-name');const race=document.getElementById('race-select')?.value||'human';const gender=document.getElementById('gender-select')?.value||'female';if(!input||!window.getRandomName)return;input.value=window.getRandomName(race,gender);input.dispatchEvent(new Event('input',{bubbles:true}));};
    function creatorButton(id,text,onclick){const button=document.createElement('button');button.id=id;button.type='button';button.textContent=text;button.style.fontSize='0.78em';button.style.padding='6px 9px';button.style.backgroundColor='#546e7a';button.style.color='white';button.style.flexShrink='0';button.addEventListener('click',onclick);return button;}
    function installCharacterCreatorRandomControls(){const nameInput=document.getElementById('character-name');if(nameInput&&!document.getElementById('randomize-name-btn')){const row=document.createElement('div');row.style.display='flex';row.style.gap='6px';row.style.alignItems='center';nameInput.parentNode.insertBefore(row,nameInput);row.appendChild(nameInput);nameInput.style.flex='1';nameInput.style.minWidth='0';row.appendChild(creatorButton('randomize-name-btn','Random name',()=>window.randomizeCharacterName()));}const preview=document.getElementById('appearance-preview-canvas');const appearanceGroup=preview?.closest('.form-group');if(appearanceGroup&&!document.getElementById('randomize-appearance-btn')){const appearanceButton=creatorButton('randomize-appearance-btn','🎲 Randomise appearance',()=>window.randomizeCharacterAppearance());appearanceButton.style.margin='0 0 7px 0';const appearanceLayout=preview.parentElement;appearanceGroup.insertBefore(appearanceButton,appearanceLayout);}}
    installCharacterCreatorRandomControls();
    window.randomizeCharacterAppearance({sync:false});
})();

const PRESENTATION_BUILD = '20260926-source-target-asset-anchors';
const freshScriptUrl = (path) => `${path}?build=${encodeURIComponent(PRESENTATION_BUILD)}`;
window.PRESENTATION_BUILD = PRESENTATION_BUILD;
const presentationBuildMeta=document.querySelector('meta[name="app-build"]');if(presentationBuildMeta)presentationBuildMeta.content=PRESENTATION_BUILD;

async function fetchRemotePresentationBuild(){const response=await fetch(`name.js?app-update-check=${Date.now()}`,{cache:'no-store'});if(!response.ok)return null;const source=await response.text();const match=source.match(/const\s+PRESENTATION_BUILD\s*=\s*['\"]([^'\"]+)['\"]/);return match?.[1]||null;}
window.fetchRemotePresentationBuild=fetchRemotePresentationBuild;
let appBuildCheckInFlight=null;
window.checkForAppUpdate=function({reload=false}={}){if(appBuildCheckInFlight)return appBuildCheckInFlight;appBuildCheckInFlight=(async()=>{try{const remoteBuild=await fetchRemotePresentationBuild();if(!remoteBuild||remoteBuild===PRESENTATION_BUILD){window.__appUpdateAvailable=null;return false;}window.__appUpdateAvailable=remoteBuild;window.dispatchEvent(new CustomEvent('appupdateavailable',{detail:{build:remoteBuild}}));if(reload){if('caches'in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)));}const target=new URL(window.location.href);target.searchParams.set('build',remoteBuild);window.location.replace(target.href);}return true;}catch(err){console.warn('App update check failed',err);return false;}finally{appBuildCheckInFlight=null;}})();return appBuildCheckInFlight;};
setTimeout(()=>window.checkForAppUpdate({reload:false}),15000);
setInterval(()=>{if(document.visibilityState==='visible')window.checkForAppUpdate({reload:false});},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')window.checkForAppUpdate({reload:false});});

if('serviceWorker'in navigator){navigator.serviceWorker.register(`sw.js?build=${encodeURIComponent(PRESENTATION_BUILD)}`,{updateViaCache:'none'}).catch(err=>console.warn('Service worker registration failed:',err));}

(() => {
    const scripts = [
        ['rigDebug.js','rigDebug'],
        ['characterRig.js','characterRig'],
        ['renderPerfTuning.js','renderPerfTuning'],
        ['facingSystem.js','facingSystem'],
        ['directionalHairTuning.js','directionalHairTuning'],
        ['directionalWeaponTuning.js','directionalWeaponTuning'],
        ['directionalEquipmentTuning.js','directionalEquipmentTuning'],
        ['directionalCharacterUI.js','directionalCharacterUi'],
        ['raceSkinPalettes.js','raceSkinPalettes'],
    ];
    for (const [src,key] of scripts) {
        const attr = `data-${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}`;
        if (document.querySelector(`script[${attr}]`)) continue;
        const script=document.createElement('script');
        script.src=freshScriptUrl(src);
        script.setAttribute(attr,'true');
        script.async=false;
        document.head.appendChild(script);
    }
})();