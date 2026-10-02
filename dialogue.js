// dialogue.js

// iOS/mobile-friendly image diagnostics. Console logs are easy to miss on-device,
// so persistent image failures are also surfaced in the in-game message log.
// The global capture listener sees failures from detached image-loader objects
// as well as ordinary <img> elements. Existing retry code gets time to recover
// first, so a transient GitHub Pages/cache hiccup does not immediately spam chat.
(() => {
    if (window.__imageLoadDiagnosticsInstalled) return;
    window.__imageLoadDiagnosticsInstalled = true;

    const reportedAssets = new Set();
    const pendingChecks = new WeakMap();
    const pendingMessages = [];
    const RETRY_SETTLE_MS = 450;
    const MAX_SETTLE_MS = 5000;

    function cleanAssetUrl(src) {
        try {
            const url = new URL(String(src || ''), document.baseURI);
            // assetLoadScheduler adds this when bypassing a stale browser cache.
            // Strip it so retry URLs dedupe back to the real asset.
            url.searchParams.delete('assetRetry');
            return url;
        } catch (_) {
            return null;
        }
    }

    function assetKey(src) {
        const url = cleanAssetUrl(src);
        if (!url) return String(src || 'unknown image');
        return `${url.origin}${url.pathname}${url.search}`;
    }

    function assetLabel(src) {
        const url = cleanAssetUrl(src);
        if (!url) return String(src || 'unknown image');
        if (url.protocol === 'data:') return '[inline data image]';
        if (url.protocol === 'blob:') return '[blob image]';
        try {
            const base = new URL('.', document.baseURI);
            if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
                return decodeURIComponent(url.pathname.slice(base.pathname.length)) + url.search;
            }
        } catch (_) {}
        return decodeURIComponent(url.pathname) + url.search;
    }

    function appendToMessageLog(message) {
        if (typeof window.showMessage === 'function') {
            window.showMessage(message);
            return true;
        }

        // dialogue.js loads before ui.js, but the message-log DOM already exists.
        // Use the same simple format as ui.js until showMessage is installed.
        const log = document.getElementById('message-log');
        if (!log) return false;
        const line = document.createElement('div');
        line.style.marginBottom = '2px';
        line.innerText = `> ${message}`;
        log.appendChild(line);
        while (log.childNodes.length > 200) log.removeChild(log.firstChild);
        log.scrollTop = log.scrollHeight;
        return true;
    }

    function announce(message) {
        console.warn(`[Image diagnostics] ${message}`);
        if (appendToMessageLog(message)) return;
        pendingMessages.push(message);
    }

    function flushPendingMessages() {
        if (!pendingMessages.length) return;
        const messages = pendingMessages.splice(0);
        for (const message of messages) {
            if (!appendToMessageLog(message)) pendingMessages.push(message);
        }
    }

    async function classifyAndAnnounce(src) {
        const key = assetKey(src);
        if (reportedAssets.has(key)) return;
        reportedAssets.add(key);

        const label = assetLabel(src);
        const url = cleanAssetUrl(src);
        if (!url || url.protocol === 'data:' || url.protocol === 'blob:') {
            announce(`⚠ IMAGE DECODE/READ FAILED — ${label}`);
            return;
        }

        try {
            const response = await fetch(url.href, {
                method: 'HEAD',
                cache: 'no-store',
                credentials: 'same-origin'
            });

            if (response.status === 404) {
                announce(`⚠ IMAGE 404 — not found: ${label}`);
                return;
            }
            if (!response.ok) {
                announce(`⚠ IMAGE HTTP ${response.status} — load failed: ${label}`);
                return;
            }

            const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
                announce(`⚠ IMAGE INVALID RESPONSE — got ${contentType} instead of an image: ${label}`);
                return;
            }

            announce(`⚠ IMAGE DECODE/READ FAILED — file exists (HTTP ${response.status}) but the browser could not read it: ${label}`);
        } catch (_) {
            announce(`⚠ IMAGE LOAD FAILED — network/cache error or status check unavailable: ${label}`);
        }
    }

    function schedulePersistentFailureCheck(img, src) {
        const prior = pendingChecks.get(img);
        if (prior?.timer) clearTimeout(prior.timer);

        const state = {
            startedAt: prior?.startedAt || performance.now(),
            src,
            timer: null
        };

        const check = () => {
            // A successful retry makes naturalWidth non-zero. Say nothing in that
            // case: the existing retry machinery recovered and chat stays clean.
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                pendingChecks.delete(img);
                return;
            }

            const elapsed = performance.now() - state.startedAt;
            // While a retry is actively downloading, `complete` is false. Give a
            // slow GitHub Pages response up to five seconds before calling it bad.
            if (!img.complete && elapsed < MAX_SETTLE_MS) {
                state.timer = setTimeout(check, RETRY_SETTLE_MS);
                pendingChecks.set(img, state);
                return;
            }

            pendingChecks.delete(img);
            void classifyAndAnnounce(state.src);
        };

        state.timer = setTimeout(check, RETRY_SETTLE_MS);
        pendingChecks.set(img, state);
    }

    window.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement)) return;
        const src = img.currentSrc || img.src;
        if (!src) return;
        schedulePersistentFailureCheck(img, src);
    }, true);

    // Expose this for any future loader that catches an error before the browser
    // emits an image error event.
    window.reportImageLoadFailure = function reportImageLoadFailure(src) {
        void classifyAndAnnounce(src);
    };

    document.addEventListener('DOMContentLoaded', flushPendingMessages, { once: true });
    window.setTimeout(flushPendingMessages, 1000);
})();

// Dialogue owns the foreground interaction layer. If a normal menu is still
// open behind it, that menu can remain the iOS hit-test target even when the
// dialogue is visually on top. Close ordinary menus first instead of trying to
// pass taps through overlapping modal layers.
(() => {
    if (window.__dialogueMenuPrecedenceInstalled) return;
    window.__dialogueMenuPrecedenceInstalled = true;

    const MENU_MODAL_IDS = [
        'character-screen-modal',
        'spell-menu-modal',
        'world-map-modal',
        'quest-log-modal',
        'roster-modal',
        'shop-modal',
        'save-game-modal',
        'load-game-modal',
        'mercenary-creation-modal',
        'entity-details-modal',
        'settings-modal',
    ];

    function closeMenusForDialogue() {
        // Inventory is special: equipmentInterface.js keeps the selected slot in
        // private state. Use its real X handler whenever Inventory/the slot picker
        // is open so that state is cleared as well as the visible DOM.
        const inventoryModal = document.getElementById('inventory-modal');
        const equipmentPicker = document.querySelector('[data-equipment-slot-picker]');
        if (inventoryModal?.style.display === 'block' || equipmentPicker) {
            const inventoryClose = document.getElementById('close-inventory-modal');
            if (inventoryClose) inventoryClose.click();
            else if (inventoryModal) inventoryModal.style.display = 'none';
        }
        // Belt-and-braces for an older inventory shell that may not have wired
        // the X button yet. The current shell removes this itself.
        document.querySelector('[data-equipment-slot-picker]')?.remove();

        for (const id of MENU_MODAL_IDS) {
            const modal = document.getElementById(id);
            if (modal?.style.display === 'block') modal.style.display = 'none';
        }

        // A top-menu dropdown is not a modal, but it is still an interaction
        // layer and should not stay open under dialogue.
        document.querySelectorAll('.dropdown-content.show').forEach(menu => menu.classList.remove('show'));
    }

    function installDialogueMenuPrecedence() {
        const baseShowDialogue = window.showDialogue;
        if (typeof baseShowDialogue !== 'function') return false;
        if (baseShowDialogue.__closesMenusBeforeDialogue) return true;

        const wrappedShowDialogue = function() {
            closeMenusForDialogue();
            return baseShowDialogue.apply(this, arguments);
        };
        wrappedShowDialogue.__closesMenusBeforeDialogue = true;
        wrappedShowDialogue.__baseShowDialogue = baseShowDialogue;
        window.showDialogue = wrappedShowDialogue;
        return true;
    }

    window.closeMenusForDialogue = closeMenusForDialogue;

    // ui.js defines showDialogue later in the parser, so install immediately
    // after parser-blocking scripts have run. No polling or frame work is added.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installDialogueMenuPrecedence, { once: true });
    } else {
        installDialogueMenuPrecedence();
    }
})();

const dialogueData = {
    'arena_lobby_1': {
        speaker: 'Arena Announcer',
        mood: 'impatient',
        dialogue: "Apologies folk, our next gladiators appear to be having cold feet. They’re still shopping instead of coming out to die for your entertainment. You can boo if you like!"
    },
    'arena_lobby_2': {
        speaker: 'Arena Announcer',
        mood: 'excited',
        dialogue: "Look at them! Fresh meat for the grinder! Place your bets now!"
    },
    'arena_lobby_3': {
        speaker: 'Shopkeeper',
        mood: 'friendly',
        dialogue: "Need a sharper blade? Better armor? Don't be shy, your life depends on it!"
    },
    'arena_lobby_4': {
        speaker: 'LobbyMercenary',
        mood: 'friendly',
        dialogue: "Need a helping hand? I have contacts with an array of deadly people. You're better off fighting with them than against them."
    },
    'arena_fight_start': {
        speaker: 'Arena Announcer',
        mood: 'booming',
        dialogue: "Let the carnage begin! Only one side leaves this pit alive!"
    },
    'arena_fight_mid': {
        speaker: 'Arena Announcer',
        mood: 'bloodthirsty',
        dialogue: "I love the smell of sweat and blood in the morning! Keep it coming!"
    },
    'arena_victory': {
        speaker: 'Arena Announcer',
        mood: 'impressed',
        dialogue: "We have a winner! Clean up the mess and bring them back to the lobby!"
    },
    'arena_entrance': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "You make your way through the corridors into the arena."
    },
    'arena_indoor': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The air grows stale and cold... you are in an indoor pit."
    },
    'arena_outdoor_night': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The moon and stars shine down on the open arena."
    },
    'arena_outdoor_day': {
        speaker: 'Narrator',
        mood: 'neutral',
        dialogue: "The sun shines brightly down on the open arena."
    },
    'grishnak_entry': {
        speaker: 'Arena Announcer',
        mood: 'neutral',
        dialogue: "In one corner, the crowd favourite, the ferocious champion Grishnak! In the other corner, his prey."
    },
    'alistair_entry': {
        speaker: 'Arena Announcer',
        mood: 'heroic',
        dialogue: "Make way for the righteous! Sir Alistair enters the fray to purge the arena of weakness!"
    },
    'viper_entry': {
        speaker: 'Arena Announcer',
        mood: 'mysterious',
        dialogue: "Watch your backs, folks. You won't see the Viper until his blade is already between your ribs."
    },
    'krog_entry': {
        speaker: 'Arena Announcer',
        mood: 'fearful',
        dialogue: "HE'S HERE! Krog the Unstoppable! I hope you've all said your prayers, because he's not planning on stopping!"
    },
    'sylvara_entry': {
        speaker: 'Arena Announcer',
        mood: 'admiring',
        dialogue: "The wild comes to the arena! Sylvara the Huntress and her deadly companion seek a new trophy!"
    }
};

window.dialogueData = dialogueData;

window.triggerAmbientDialogue = function(key) {
    const data = window.dialogueData[key];
    if (data) {
        const text = `${data.speaker} (${data.mood}): "${data.dialogue}"`;
        window.showMessage(text);
        if (window.broadcastGameMessage) window.broadcastGameMessage(text);
        if (window.playDialogue) window.playDialogue(key);
    }
};
