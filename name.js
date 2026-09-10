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

// Build token for dynamically loaded presentation modules. Changing this value
// gives every deployment a new URL, avoiding stale Safari/GitHub Pages script
// cache entries without having to maintain separate per-file version numbers.
const PRESENTATION_BUILD = '20260910-1015-a70c263';
const freshScriptUrl = (path) => `${path}?build=${encodeURIComponent(PRESENTATION_BUILD)}`;
window.PRESENTATION_BUILD = PRESENTATION_BUILD;

// Install a lightweight network-first service worker. updateViaCache:'none'
// ensures the browser checks the worker script itself rather than trusting an
// old HTTP cache entry. Once controlling the page, the worker revalidates
// HTML/JS/CSS from the network on every request.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`sw.js?build=${encodeURIComponent(PRESENTATION_BUILD)}`, {
        updateViaCache: 'none'
    }).catch(err => console.warn('Service worker registration failed:', err));
}

// Directional character presentation is intentionally split into a map-facing
// module and UI helpers. characterRig.js is already bootstrapped by
// graphicsSettings.js; these modules wait for their own dependencies.
(() => {
    if (!document.querySelector('script[data-facing-system]')) {
        const facing = document.createElement('script');
        facing.src = freshScriptUrl('facingSystem.js');
        facing.dataset.facingSystem = 'true';
        facing.async = false;
        document.head.appendChild(facing);
    }

    if (!document.querySelector('script[data-directional-character-ui]')) {
        const ui = document.createElement('script');
        ui.src = freshScriptUrl('directionalCharacterUI.js');
        ui.dataset.directionalCharacterUi = 'true';
        ui.async = false;
        document.head.appendChild(ui);
    }
})();
