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

// Build token for dynamically loaded presentation/performance modules. Changing
// this value gives every deployment a new URL, avoiding stale Safari/GitHub
// Pages script cache entries without separate per-file version numbers.
const PRESENTATION_BUILD = '20260917-home-screen-refresh';
const freshScriptUrl = (path) => `${path}?build=${encodeURIComponent(PRESENTATION_BUILD)}`;
window.PRESENTATION_BUILD = PRESENTATION_BUILD;

// iOS Home Screen web apps can resume an old in-memory document for days,
// bypassing normal navigation and service-worker update checks. Compare this
// running document with a no-cache copy of index.html whenever the app becomes
// visible (and periodically while it remains open). A new build gets one clean
// reload with the build token in the document URL, which also defeats Safari's
// standalone-page cache.
let appBuildCheckInFlight = null;
window.checkForAppUpdate = function({ reload = true } = {}) {
    if (appBuildCheckInFlight) return appBuildCheckInFlight;
    appBuildCheckInFlight = (async () => {
        try {
            const response = await fetch(`index.html?app-update-check=${Date.now()}`, { cache:'no-store' });
            if (!response.ok) return false;
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const remoteBuild = doc.querySelector('meta[name="app-build"]')?.content;
            if (!remoteBuild || remoteBuild === PRESENTATION_BUILD) return false;
            if (reload) {
                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(key => caches.delete(key)));
                }
                const target = new URL(window.location.href);
                target.searchParams.set('build', remoteBuild);
                window.location.replace(target.href);
            }
            return true;
        } catch (err) {
            console.warn('App update check failed', err);
            return false;
        } finally {
            appBuildCheckInFlight = null;
        }
    })();
    return appBuildCheckInFlight;
};

setTimeout(() => window.checkForAppUpdate(), 15000);
setInterval(() => {
    if (document.visibilityState === 'visible') window.checkForAppUpdate();
}, 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.checkForAppUpdate();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`sw.js?build=${encodeURIComponent(PRESENTATION_BUILD)}`, {
        updateViaCache: 'none'
    }).catch(err => console.warn('Service worker registration failed:', err));
}

(() => {
    if (!document.querySelector('script[data-render-perf-tuning]')) {
        const perf = document.createElement('script');
        perf.src = freshScriptUrl('renderPerfTuning.js');
        perf.dataset.renderPerfTuning = 'true';
        perf.async = false;
        document.head.appendChild(perf);
    }

    if (!document.querySelector('script[data-facing-system]')) {
        const facing = document.createElement('script');
        facing.src = freshScriptUrl('facingSystem.js');
        facing.dataset.facingSystem = 'true';
        facing.async = false;
        document.head.appendChild(facing);
    }

    if (!document.querySelector('script[data-directional-hair-tuning]')) {
        const tuning = document.createElement('script');
        tuning.src = freshScriptUrl('directionalHairTuning.js');
        tuning.dataset.directionalHairTuning = 'true';
        tuning.async = false;
        document.head.appendChild(tuning);
    }

    if (!document.querySelector('script[data-directional-weapon-tuning]')) {
        const weaponTuning = document.createElement('script');
        weaponTuning.src = freshScriptUrl('directionalWeaponTuning.js');
        weaponTuning.dataset.directionalWeaponTuning = 'true';
        weaponTuning.async = false;
        document.head.appendChild(weaponTuning);
    }

    if (!document.querySelector('script[data-directional-character-ui]')) {
        const ui = document.createElement('script');
        ui.src = freshScriptUrl('directionalCharacterUI.js');
        ui.dataset.directionalCharacterUi = 'true';
        ui.async = false;
        document.head.appendChild(ui);
    }
})();
