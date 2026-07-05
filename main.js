// main.js - VERSION 2.0 - DEFINITIVE
console.log("--- MAIN.JS VERSION 2.0 LOADED ---");

document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM Content Loaded - Preloading assets and setting up listeners");
    preloadAssets();

    const createCharacterButton = document.getElementById("createCharacterButton");
    if (createCharacterButton) {
        createCharacterButton.addEventListener("click", window.startGame);
        // onclick/click alone has been unreliable on iOS Safari for this
        // exact button — same touch-hardening already applied to the party
        // tabs elsewhere in this UI. preventDefault stops the click that
        // would otherwise follow touchend from firing startGame twice.
        createCharacterButton.addEventListener("touchend", (e) => {
            e.preventDefault();
            window.startGame();
        }, { passive: false });
    }

    // Asset Preloading Logic
    async function preloadAssets() {
        const priorityImages = [
            {key: 'floor1', src: 'images/arenaHexFloor1.png'},
            {key: 'floor2', src: 'images/arenaHexFloor2.png'},
            {key: 'floor3', src: 'images/arenaHexFloor3.png'},
            {key: 'floor4', src: 'images/arenaHexFloor4.png'}
        ];
        
        const otherImages = [
            {key: 'playerBase', src: 'images/elf.png'},
            {key: 'leatherArmor', src: 'images/elfleatherarmour.png'},
            {key: 'chainArmor', src: 'images/elfchainarmour.png'},
            {key: 'monsterDefault', src: 'images/goblin.png'},
            {key: 'orcBase', src: 'images/orc.png'},
            {key: 'swordIcon', src: 'images/sword.png'},
            {key: 'humanBase', src: 'images/humanfemale.png'},
            {key: 'humanHair', src: 'images/humanfemalehair.png'},
            {key: 'humanMaleHair', src: 'images/humanmalehair.png'},
            {key: 'humanLight', src: 'images/humanlightarmour.png'},
            {key: 'humanMedium', src: 'images/humanmediumarmour.png'},
            {key: 'humanHeavy', src: 'images/humanheavyarmour.png'},
            {key: 'horse', src: 'images/horse.png'},
            {key: 'nasal_helm', src: 'images/nasalHelm.png'},
            {key: 'humanMaleBase', src: 'images/humanmale.png'},
            {key: 'elfMaleBase', src: 'images/elfmale.png'},
            {key: 'elfMaleHair', src: 'images/elfmalehair.png'},
            {key: 'elfFemaleBase', src: 'images/elffemale.png'},
            {key: 'elfFemaleHair', src: 'images/elffemalehair.png'},
            {key: 'dwarfMaleBase', src: 'images/dwarfmale.png'},
            {key: 'dwarfMaleHair', src: 'images/dwarfmalehair.png'},
            {key: 'dwarfFemaleBase', src: 'images/dwarffemale.png'},
            {key: 'dwarfFemaleHair', src: 'images/dwarffemalehair.png'},
            {key: 'shield', src: 'images/shield.png'},
            {key: 'skeleton', src: 'images/skeleton.svg'},
            {key: 'zombie', src: 'images/zombie.svg'},
            {key: 'imp', src: 'images/imp.svg'},
            {key: 'wolf', src: 'images/wolf.png'},
            {key: 'torch_lit', src: 'images/torch_lit.svg'},
            {key: 'fireplace', src: 'images/fireplace.svg'},
            {key: 'axe', src: 'images/axe.png'},
            {key: 'troll', src: 'images/troll.png'},
            {key: 'spear', src: 'images/spear.png'},
            {key: 'club', src: 'images/club.png'},
            {key: 'spiderweb', src: 'images/spiderweb.png'},
            {key: 'spider1', src: 'images/spider1.png'},
            {key: 'spider2', src: 'images/spider2.png'},
            {key: 'arenaannouncer', src: 'images/arenaannouncer.png'},
            {key: 'arenamercenary', src: 'images/arenamercenary.png'},
            {key: 'arenashopkeeper', src: 'images/arenashopkeeper.png'},
            {key: 'grishnak', src: 'images/Grishnak.png'},
            {key: 'overlay_blood', src: 'images/overlay blood.png'},
            {key: 'overlay_skull', src: 'images/overlay skull.png'},
            {key: 'pedestal', src: 'images/mediumpillar.png'},
            {key: 'water', src: 'images/water.png'},
            {key: 'boar', src: 'images/boar.png'},
            {key: 'tiger', src: 'images/tiger.png'},
            {key: 'eagle', src: 'images/eagle.png'},
            {key: 'eagleflying', src: 'images/eagleflying.png'},
            {key: 'foliage', src: 'images/foliage.png'},
            {key: 'wood_floor', src: 'images/wood_floor.svg'},
            {key: 'table', src: 'images/table.svg'},
            {key: 'bench', src: 'images/bench.svg'},
            {key: 'throne', src: 'images/throne.svg'},
            {key: 'apple', src: 'images/apple.svg'},
            {key: 'door_open', src: 'images/door_open.svg'},
            {key: 'door_closed', src: 'images/door_closed.svg'},
            {key: 'path', src: 'images/path.svg'},
            {key: 'signpost', src: 'images/signpost.svg'},
            {key: 'corpse_marker', src: 'images/corpse_marker.svg'},
            {key: 'fence_h', src: 'images/fence_h.svg'},
            {key: 'fence_v', src: 'images/fence_v.svg'},
            {key: 'dirt', src: 'images/dirt.svg'},
            {key: 'hut', src: 'images/hut.svg'},
            {key: 'hut_large', src: 'images/hut_large.svg'},
            {key: 'journal', src: 'images/journal.svg'}
        ];

        window.gameVisuals = {};

        function load(asset) {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { window.gameVisuals[asset.key] = img; resolve(); };
                img.onerror = () => { console.warn("Failed:", asset.src); resolve(); };
                img.src = asset.src;
            });
        }

        // Priority load
        await Promise.all(priorityImages.map(load));
        console.log("Priority assets loaded");
        if (window.updateAppearancePreview) window.updateAppearancePreview(); // sprites just finished loading — refresh the (until-now-blank) preview
        
        // Background load
        await Promise.all(otherImages.map(load));
        console.log("All assets loaded");

        // Audio pre-fetch (minimal)
        if (typeof window.playMusic === 'function') {
            console.log("Preloading audio buffers...");
        }
    }

    // Menu/Cheat dropdowns rely on CSS :hover, which is unreliable on
    // trackpads/touch — also toggle them on click, closing any other open
    // dropdown and closing when the click lands outside of one entirely.
    function handleMenuDropdownToggle(e) {
        // A <select> (or its <option>s) inside a dropdown-content needs the
        // dropdown to stay open while its own native picker is up — closing
        // the container mid-tap (especially on mobile, where the picker is
        // tied to the select's live DOM/visibility state) can abort the
        // picker before it ever opens. Interacting with the teleport-cheat
        // location select is exactly this case.
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        const clickedDropbtn = e.target.classList && e.target.classList.contains('dropbtn');
        document.querySelectorAll('.dropdown-content.show').forEach(dc => {
            if (!clickedDropbtn || dc !== e.target.nextElementSibling) dc.classList.remove('show');
        });
        if (clickedDropbtn) {
            const content = e.target.nextElementSibling;
            if (content) {
                content.classList.toggle('show');
                if (content.classList.contains('show')) clampDropdownToViewport(content);
            }
        }
    }

    // .dropdown-content has no explicit left/right, so it inherits whatever
    // static position its trigger button ends up at in the wrapped #top-menu
    // button row — on a narrow phone screen the Cheat button can land near
    // the right edge, and the dropdown (widened further by the teleport
    // select+button) then spills straight off-screen. Clamp it back on
    // screen after it opens, rather than trying to predict button position
    // in CSS (which has no reliable "distance from viewport edge" query).
    function clampDropdownToViewport(content) {
        content.style.left = '';
        const rect = content.getBoundingClientRect();
        const overflowRight = rect.right - window.innerWidth;
        if (overflowRight > 0) {
            content.style.left = `-${Math.ceil(overflowRight) + 8}px`;
        }
    }
    window.addEventListener('click', handleMenuDropdownToggle);

    // Global click listener for ANY button click in the window
    function handleGlobalButtonAction(e) {
        const btnId = e.target.id;
        if (btnId) console.log("Window clicked element ID:", btnId);

        if (btnId === "create-room-btn") {
            window.createRoom();
        } else if (btnId === "join-room-btn") {
            window.joinRoom();
        } else if (btnId === "leave-room-btn") {
            window.leaveRoom();
        } else if (btnId === "character-screen-btn") {
            const modal = document.getElementById("character-screen-modal");
            if (modal) {
                modal.style.display = "block";
                window.showCharacterScreen();
                if (window.updateMusicState) window.updateMusicState();
            }
        } else if (btnId === "spell-menu-btn") {
            const modal = document.getElementById("spell-menu-modal");
            if (modal) {
                modal.style.display = "block";
                window.showSpellScreen();
                if (window.updateMusicState) window.updateMusicState();
            }
        } else if (btnId === "inventory-btn") {
            console.log("Inventory button CLICKED - Opening modal");
            const modal = document.getElementById("inventory-modal");
            if (modal) {
                modal.style.display = "block";
                window.showInventoryScreen();
                if (window.updateMusicState) window.updateMusicState();
            } else {
                console.error("CRITICAL: inventory-modal not found in HTML!");
            }
        } else if (btnId === "world-map-btn") {
            const modal = document.getElementById("world-map-modal");
            if (modal) {
                modal.style.display = "block";
                window.renderWorldMap();
            }
        } else if (btnId === "quest-log-btn") {
            const modal = document.getElementById("quest-log-modal");
            if (modal) {
                modal.style.display = "block";
                window.renderQuestLog();
            }
        } else if (btnId === "move-group-btn") {
            window.groupMoveMode = !window.groupMoveMode;
            const btn = document.getElementById("move-group-btn");
            btn.innerText = `Move Group: ${window.groupMoveMode ? 'ON' : 'OFF'}`;
            btn.style.backgroundColor = window.groupMoveMode ? '#ff9800' : '#795548';
        } else if (btnId === "party-formation-btn") {
            window.cyclePartyFormation();
        } else if (btnId === "load-btn-initial") {
            const modal = document.getElementById("load-game-modal");
            if (modal) {
                window.updateSaveList();
                modal.style.display = "block";
            }
        } else if (btnId === "save-menu-btn") {
            const modal = document.getElementById("save-game-modal");
            if (modal) {
                const charName = window.party[0].name;
                // Default name: CharacterName + lowest available number
                let i = 1;
                while (localStorage.getItem(`rpg_save_${charName}_${i}`)) { i++; }
                document.getElementById("save-name-input").value = `${charName}_${i}`;
                modal.style.display = "block";
            }
        } else if (btnId === "load-menu-btn" || btnId === "game-over-load-btn") {
            document.getElementById("game-over-modal").style.display = "none";
            const modal = document.getElementById("load-game-modal");
            if (modal) {
                window.updateSaveList();
                modal.style.display = "block";
            }
        } else if (btnId === "game-over-menu-btn") {
            document.getElementById("game-over-modal").style.display = "none";
            window.gameOver = false;
            location.reload();
        } else if (btnId === "confirm-save-btn") {
            const saveName = document.getElementById("save-name-input").value || "ManualSave";
            window.saveGame(saveName);
            document.getElementById("save-game-modal").style.display = "none";
        } else if (btnId === "quick-save-btn") {
            window.saveGame("quick_save");
        } else if (btnId === "quick-load-btn") {
            window.loadGame("quick_save");
        } else if (btnId === "settings-menu-btn") {
            const modal = document.getElementById("settings-modal");
            if (modal) {
                modal.style.display = "block";
                if (window.updateMusicState) window.updateMusicState();
                if (window.initSettingsUI) window.initSettingsUI();
            }
        } else if (btnId === "host-game-btn") {
            if (window.createRoom) window.createRoom();
        } else if (btnId === "confirm-hire-btn") {
            const mainChar = window.party[0];
            if (mainChar.gold < 100) {
                window.showMessage("Not enough gold to hire a mercenary!");
                return;
            }
            
            const race = document.getElementById("merc-race").value;
            const gender = document.getElementById("merc-gender").value;
            const cls = document.getElementById("merc-class").value;
            const voice = document.getElementById("merc-voice-select").value;
            let name = document.getElementById("merc-name").value;
            if (!name) name = window.getRandomName(race, gender);

            mainChar.gold -= 100;
            const merc = window.createCharacterData(race, cls, name, gender, voice);
            
            // Sync EXP
            const targetTotalExp = window.calculateTotalExp(mainChar.level, mainChar.exp);
            let currentTotal = 0;
            while (true) {
                const req = merc.level * 1000;
                if (currentTotal + req <= targetTotalExp) {
                    window.applyLevelUp(merc, cls);
                    currentTotal += req;
                } else {
                    merc.exp = targetTotalExp - currentTotal;
                    break;
                }
            }

            window.party.push(merc);
            
            // Spawn next to player
            const pEnt = window.entities.find(e => e.name === mainChar.name);
            const neighbors = window.getNeighbors(pEnt.hex.q, pEnt.hex.r);
            const spawnHex = neighbors.find(n => !window.getEntityAtHex(n.q, n.r) && window.getTerrainAt(n.q, n.r).name !== 'Water') || pEnt.hex;
            
            const mercEnt = new window.Entity(merc.name, "blue", spawnHex, merc.attributes.agility + 10);
            mercEnt.side = 'player';
            Object.assign(mercEnt, merc);
            mercEnt.skills = merc.skills;
            window.entities.push(mercEnt);

            window.showMessage(`${merc.name} the ${race} ${cls} joined the party!`);
            document.getElementById("mercenary-creation-modal").style.display = "none";
            window.updatePartyTabs();
            window.renderEntities();
        } else if (btnId === "cancel-hire-btn") {
            document.getElementById("mercenary-creation-modal").style.display = "none";
        } else if (btnId === "close-shop-modal") {
            document.getElementById("shop-modal").style.display = "none";
        } else if (btnId === "cheat-jerry-btn") {
            window.addJerry();
        } else if (btnId === "cheat-horse-btn") {
            // Spawn Horse logic
            const char = window.party[window.selectedCharacterIndex];
            const p = window.entities.find(e => e.name === char.name);
            if (p) {
                const neighbors = window.getNeighbors(p.hex.q, p.hex.r);
                const h = neighbors.find(n => !window.entities.some(e => e.alive && e.getAllHexes().some(oh => oh.q === n.q && oh.r === n.r)) && window.getTerrainAt(n.q, n.r).name !== 'Water');
                if (h) {
                    const horse = window.createMonster('horse', h, null, null, 'player');
                    window.entities.push(horse);
                    window.drawMap();
                    window.renderEntities();
                    window.showMessage("Horse spawned!");
                } else {
                    window.showMessage("No space for a horse!");
                }
            }
        } else if (btnId === "cheat-all-equip-btn") {
            window.addAllEquipment();
        } else if (btnId === "cheat-fly-btn") {
            window.toggleFlyCheat();
        } else if (btnId === "cheat-max-skills-btn") {
            window.cheatMaxSkills();
        } else if (btnId === "cheat-teleport-btn") {
            const sel = document.getElementById("cheat-teleport-select");
            if (sel && window.teleportPartyToLocation) window.teleportPartyToLocation(sel.value);
        } else if (btnId === "cancel-moves-btn") {
            window.cancelAllMoveOrders();
        } else if (btnId === "rest-btn") {
            window.toggleRest();
        } else if (btnId === "sleep-btn") {
            window.toggleSleep();
        } else if (btnId === "time-speed-btn") {
            window.toggleTimeSpeed();
        } else if (btnId === "controller-mode-btn") {
            if (window.toggleControllerMode) window.toggleControllerMode();
        }
    }
    window.addEventListener('click', handleGlobalButtonAction);

    // Modal Close Logic
    function handleModalCloseClick(e) {
        const isCloseBtn = e.target.classList.contains('close-btn');
        const isModalOverlay = e.target.classList.contains('modal');

        if (isCloseBtn || isModalOverlay) {
            const modal = isCloseBtn ? e.target.closest(".modal") : e.target;
            if (modal) {
                if (modal.id === "end-run-modal" && isModalOverlay) return;

                modal.style.display = "none";
                window.isPausedForReaction = false;
                window.lastModalClosedTime = Date.now(); // Track for ghost click prevention

                if (window.updateMusicState) window.updateMusicState();

                if (modal.id === "character-screen-modal" && window.isInitialCharacterScreen) {
                    window.isInitialCharacterScreen = false;
                    console.log("Initial character screen closed - Starting Core");
                    window.startGameCore();
                }
            }
        }
    }
    window.addEventListener('click', handleModalCloseClick);

    // iOS Safari: a synthetic 'click' delegated all the way up to window can
    // be unreliable, especially for buttons that only became visible a
    // moment earlier via a class toggle (the dropdown menu) — same
    // touch-hardening already applied to the party tabs elsewhere in this
    // UI. Fire the same three handlers directly off touchend for anything
    // these actually act on (id'd buttons, dropdown buttons, modal
    // close/overlay), and suppress the resulting synthetic click so the
    // action doesn't run twice. Scoped to exactly the ids/classes these
    // three handlers switch on — NOT "any element with an id" (that
    // swallowed the touch on other id'd controls with their own separate
    // click listeners, e.g. createCharacterButton and campaign-select,
    // breaking character creation on touch devices entirely).
    const GLOBAL_BUTTON_ACTION_IDS = new Set([
        'create-room-btn', 'join-room-btn', 'leave-room-btn', 'character-screen-btn', 'spell-menu-btn',
        'inventory-btn', 'world-map-btn', 'quest-log-btn', 'move-group-btn', 'party-formation-btn',
        'load-btn-initial', 'save-menu-btn', 'load-menu-btn', 'game-over-load-btn', 'game-over-menu-btn',
        'confirm-save-btn', 'quick-save-btn', 'quick-load-btn', 'settings-menu-btn', 'host-game-btn',
        'confirm-hire-btn', 'cancel-hire-btn', 'close-shop-modal', 'cheat-jerry-btn', 'cheat-horse-btn',
        'cheat-all-equip-btn', 'cheat-fly-btn', 'cheat-max-skills-btn', 'cheat-teleport-btn', 'cancel-moves-btn', 'rest-btn',
        'sleep-btn', 'time-speed-btn', 'controller-mode-btn'
    ]);
    window.addEventListener('touchend', (e) => {
        const t = e.target;
        const actionable = GLOBAL_BUTTON_ACTION_IDS.has(t.id) ||
            (t.classList && (t.classList.contains('dropbtn') || t.classList.contains('close-btn') || t.classList.contains('modal')));
        if (!actionable) return;
        e.preventDefault();
        handleMenuDropdownToggle(e);
        handleGlobalButtonAction(e);
        handleModalCloseClick(e);
    }, { passive: false });

    window.initHexMap();
    if (window.initWorldMapEvents) window.initWorldMapEvents();
    
    // Initialize Roguelike data
    window.roguelikeData = JSON.parse(localStorage.getItem('rpg_roguelike_data') || JSON.stringify({
        permanentSkillBonuses: {}, // tree -> count
        relics: [],
        mercenaryGraveyard: [], // Snapshots of mercenaries
        fightsCompleted: 0
    }));

window.updateRoguelikePreview = function() {
        const campaign = document.getElementById("campaign-select").value;
        const relicsEnabled = document.getElementById("relics-activated-check").checked;
        const preview = document.getElementById("roguelike-benefits-preview");
        if (!preview) return;

        if (campaign === "1" && relicsEnabled) {
            const bonuses = window.roguelikeData.permanentSkillBonuses;
            const keys = Object.keys(bonuses);
            if (keys.length > 0) {
                let html = `<h4 style="margin: 0 0 5px 0; color: #ffeb3b;">Unlocked Roguelike Bonuses:</h4>`;
                html += `<p style="margin: 0;">`;
                html += keys.map(k => `+${bonuses[k]} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
                html += `</p>`;
                preview.innerHTML = html;
                preview.style.display = "block";
            } else {
                preview.style.display = "none";
            }
        } else {
            preview.style.display = "none";
        }
    };

    window.toggleArenaOptions = function() {
        const campaign = document.getElementById("campaign-select").value;
        const optionsDiv = document.getElementById("arena-roguelike-options");
        const ironmanCheck = document.getElementById("ironman-check");

        if (campaign === "1") {
            if (optionsDiv) optionsDiv.style.display = "block";
            if (ironmanCheck) {
                ironmanCheck.checked = true;
                ironmanCheck.disabled = true;
            }
        } else {
            if (optionsDiv) optionsDiv.style.display = "none";
            if (ironmanCheck) {
                ironmanCheck.disabled = false;
            }
        }
        window.updateRoguelikePreview();
    };
    window.toggleArenaOptions(); // Initial call

    const relicsCheck = document.getElementById("relics-activated-check");
    if (relicsCheck) {
        relicsCheck.addEventListener("change", window.updateRoguelikePreview);
    }

    const resetBtn = document.getElementById("reset-roguelike-btn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to reset all roguelike progress? This cannot be undone.")) {
                window.roguelikeData = {
                    permanentSkillBonuses: {},
                    relics: [],
                    mercenaryGraveyard: [],
                    fightsCompleted: 0
                };
                localStorage.setItem('rpg_roguelike_data', JSON.stringify(window.roguelikeData));
                window.updateRoguelikePreview();
                alert("Progress reset!");
            }
        });
    }

    const exportBtn = document.getElementById("export-roguelike-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", () => {
            const data = localStorage.getItem('rpg_roguelike_data') || JSON.stringify(window.roguelikeData);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rpg_progression.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    const importFileInput = document.getElementById("import-roguelike-file");
    const importBtn = document.getElementById("import-roguelike-btn");
    if (importBtn && importFileInput) {
        importBtn.addEventListener("click", () => importFileInput.click());
        importFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const parsed = JSON.parse(ev.target.result);
                    if (typeof parsed !== 'object' || parsed === null) throw new Error("Invalid format");
                    window.roguelikeData = {
                        permanentSkillBonuses: parsed.permanentSkillBonuses || {},
                        relics: parsed.relics || [],
                        mercenaryGraveyard: parsed.mercenaryGraveyard || [],
                        fightsCompleted: parsed.fightsCompleted || 0,
                        bossesDefeated: parsed.bossesDefeated || []
                    };
                    localStorage.setItem('rpg_roguelike_data', JSON.stringify(window.roguelikeData));
                    window.updateRoguelikePreview();
                    alert("Progression imported successfully!");
                } catch {
                    alert("Failed to import: file is not valid progression data.");
                }
                importFileInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    
    window.updateRoguelikePreview();

    // Live preview of the chosen race/gender/clothing-color combo — color
    // only, never shape/race (see spriteRecolor.js for the recolor itself).
    // Self-contained (doesn't depend on window.gameVisuals/CHAR_CONFIG,
    // which aren't populated until startGameCore runs after character
    // creation) — loads base body sprites directly the first time they're
    // needed and caches them.
    const APPEARANCE_BASE_SRC = {
        human_female: 'images/humanfemale.png', human_male: 'images/humanmale.png',
        elf_female: 'images/elffemale.png', elf_male: 'images/elfmale.png',
        dwarf_female: 'images/dwarffemale.png', dwarf_male: 'images/dwarfmale.png'
    };
    const APPEARANCE_HAIR_SRC = {
        human_female: 'images/humanfemalehair.png', human_male: 'images/humanmalehair.png',
        elf_female: 'images/elffemalehair.png', elf_male: 'images/elfmalehair.png',
        dwarf_female: 'images/dwarffemalehair.png', dwarf_male: 'images/dwarfmalehair.png'
    };
    const _appearancePreviewImages = {};
    function loadAppearancePreviewImage(src) {
        let img = _appearancePreviewImages[src];
        if (!img) {
            img = new Image();
            img.onload = () => window.updateAppearancePreview();
            img.src = src;
            _appearancePreviewImages[src] = img;
        }
        return img;
    }
    window.updateAppearancePreview = function() {
        const canvas = document.getElementById("appearance-preview-canvas");
        const shirtSlider = document.getElementById("shirt-hue-slider");
        const pantsSlider = document.getElementById("pants-hue-slider");
        const hairSlider = document.getElementById("hair-hue-slider");
        const skinSlider = document.getElementById("skin-hue-slider");
        const raceSelect = document.getElementById("race-select");
        const genderSelect = document.getElementById("gender-select");
        if (!canvas || !shirtSlider || !pantsSlider || !hairSlider || !skinSlider || !raceSelect || !genderSelect || !window.getRecoloredSprite) return;

        const key = `${raceSelect.value}_${genderSelect.value}`;
        const bodySrc = APPEARANCE_BASE_SRC[key];
        const hairSrc = APPEARANCE_HAIR_SRC[key];
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!bodySrc) return;

        const bodyImg = loadAppearancePreviewImage(bodySrc);
        if (!bodyImg.complete || !bodyImg.naturalWidth) return; // redraws via onload once loaded

        const tintedBody = window.getRecoloredSprite(bodyImg, {
            shirtHue: parseInt(shirtSlider.value, 10),
            pantsHue: parseInt(pantsSlider.value, 10),
            skinHue: parseInt(skinSlider.value, 10)
        });
        const scale = Math.min(canvas.width / bodyImg.naturalWidth, canvas.height / bodyImg.naturalHeight);
        const w = bodyImg.naturalWidth * scale, h = bodyImg.naturalHeight * scale;
        const drawX = (canvas.width - w) / 2, drawY = (canvas.height - h) / 2;
        ctx.drawImage(tintedBody, drawX, drawY, w, h);

        if (hairSrc && window.getRecoloredHairSprite) {
            const hairImg = loadAppearancePreviewImage(hairSrc);
            if (hairImg.complete && hairImg.naturalWidth) {
                const tintedHair = window.getRecoloredHairSprite(hairImg, parseInt(hairSlider.value, 10));
                // Some hairstyles (e.g. human_male, dwarf_female) are a small
                // "cap" meant to be drawn at a fraction of body size near the
                // top of the head, not stretched over the whole body — same
                // convention as drawPlayerCharacter's hair.type === 'small'.
                // Skipping this made the preview render those as a full-body
                // hair overlay, comically oversized.
                const hairCfg = window.CHAR_CONFIG?.[key]?.hair;
                if (hairCfg && hairCfg.type === 'small') {
                    const hW = w * hairCfg.wFrac;
                    const hH = h * hairCfg.hFrac;
                    const topFrac = hairCfg.topFrac !== undefined ? hairCfg.topFrac : 0.2;
                    ctx.drawImage(tintedHair, drawX + w / 2 - hW / 2, drawY + topFrac * h - hH / 2, hW, hH);
                } else {
                    ctx.drawImage(tintedHair, drawX, drawY + (hairCfg?.yRaw || 0), w, h);
                }
            }
        }
    };
    window.updateAppearancePreview();

    window.updateSelectionPreview = function() {
        const race = document.getElementById("race-select").value;
        const cls = document.getElementById("class-select").value;
        const preview = document.getElementById("selection-preview");
        if (!preview) return;

        const rb = window.raceData[race].bonus;
        const cb = window.classData[cls].bonus;

        let html = `<h4 style="margin: 0 0 5px 0; color: #90caf9;">Growth per Level:</h4>`;
        
        html += `<p style="margin: 0 0 5px 0;"><strong>${race.charAt(0).toUpperCase() + race.slice(1)}:</strong> `;
        html += Object.entries(rb).map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
        html += `</p>`;

        html += `<p style="margin: 0;"><strong>${cls.charAt(0).toUpperCase() + cls.slice(1)}:</strong> `;
        html += Object.entries(cb).map(([k, v]) => `+${v} ${k.charAt(0).toUpperCase() + k.slice(1)}`).join(", ");
        html += `</p>`;

        preview.innerHTML = html;
    };
    window.updateSelectionPreview(); // Initial call
});

window.toggleFlyCheat = function() {
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player');
    const isAnyCheat = friendlies.some(f => f.flyCheat);
    const newState = !isAnyCheat;

    friendlies.forEach(f => {
        f.flyCheat = newState;
        if (newState) f.isFlying = true;
        else f.isFlying = false;
    });

    const btn = document.getElementById("cheat-fly-btn");
    if (btn) {
        btn.innerText = newState ? "Cheat: Remove Flying" : "Cheat: Fly All";
        btn.style.backgroundColor = newState ? "#f44336" : "#03a9f4";
    }

    window.showMessage(newState ? "All friendlies are now flying units!" : "Flying capability removed from all friendlies.");
    window.drawMap();
    window.renderEntities();
    window.updateTurnIndicator();
    if (window.updateActionButtons) window.updateActionButtons();
};

// Cheat: teleport the whole (non-combat-ally) party to any named location
// this campaign has actually built. Each entry is a getter, not a static
// hex, since these building centers (campaign2MillbrookCenter etc.) aren't
// assigned until setupVillageScene finishes running at game start.
window.campaign2TeleportLocations = {
    'Hollowmere (Village)': () => window.campaign2Landmarks?.crossroads,
    'Millbrook (Village)': () => window.campaign2MillbrookCenter,
    'Silverhart (Capital)': () => window.campaign2PalaceThroneCenter,
    'Reddale (Town)': () => window.campaign2ReddaleGuardhouseCenter,
    'Emberlode (Mining Village)': () => window.campaign2EmberlodeCenter,
    "Old Mac's Farmstead": () => window.campaign2FarmHouseCenter,
    'Goblin Stronghold': () => window.campaign2GoblinCampCenter,
    'Abandoned House': () => window.campaign2AbandonedHouseCenter,
};

window.teleportPartyToLocation = function(locationName) {
    const getHex = window.campaign2TeleportLocations[locationName];
    const hex = getHex && getHex();
    if (!hex || hex.q === undefined) {
        window.showMessage(`Cheat: "${locationName}" isn't built yet.`);
        return;
    }
    // Real party members/mounts only — never temporary combat allies, who
    // should stay wherever the fight they belong to left them.
    const friendlies = window.entities.filter(e => e.alive && e.side === 'player' && !e.aiControlled);
    const spread = window.getNeighbors ? window.getNeighbors(hex.q, hex.r) : [];
    friendlies.forEach((f, i) => {
        const dest = i === 0 ? hex : (spread[i - 1] || hex);
        f.hex = { q: dest.q, r: dest.r };
        f.destination = null;
    });
    window.cameraFollowEnabled = true;
    if (window.centerCameraOn) window.centerCameraOn(hex);
    if (window.drawMap) window.drawMap();
    if (window.renderEntities) window.renderEntities();
    window.showMessage(`Cheat: teleported to ${locationName}.`);
};

window.testVoice = function(voiceId) {
    if (window.playDialogue) window.playDialogue(`${voiceId}_enemy_seen`);
};

window.cheatMaxSkills = function() {
    window.party.forEach(char => {
        if (!char.attributes) char.attributes = { strength: 0, endurance: 0, agility: 0, wildcard: 0 };
        // Reset to base stats first to avoid double-application
        char.maxHp = 10 + ((char.attributes.endurance || 0) * 5);
        char.baseDamage = 1 + ((char.attributes.strength || 0) * 1); // Simple base
        // (Other base stats could be reset here)

        for (const skillKey in window.skills) {
            const skill = window.skills[skillKey];
            if (skill.tree === 'monster_skills') continue; // Skip flight/land
            const max = skill.maxRanks || 100;
            char.skills[skillKey] = max;
            if (skill.apply) {
                // Apply skill rank benefits
                for (let i = 0; i < max; i++) {
                    skill.apply(char);
                }
            }
        }
        char.hp = char.maxHp;
    });
    // Sync entities
    window.entities.forEach(ent => {
        const partyMember = window.party.find(p => p.name === ent.name);
        if (partyMember) {
            ent.skills = { ...partyMember.skills };
            ent.maxHp = partyMember.maxHp;
            ent.hp = partyMember.hp;
            // No need to re-apply in loop here if we synced stats
        }
    });
    window.showMessage("Cheat: All skills maxed for the party!");
    window.showCharacter();
    window.showCharacterScreen();
};
window.startGame = function() {
  console.log("Starting game...");

  // Set timestamp to prevent the click that started the game from bleeding through to the map
  window.lastModalClosedTime = Date.now();

  const race = document.getElementById("race-select").value;
  const cls = document.getElementById("class-select").value;
  const gender = document.getElementById("gender-select").value;
  const campaign = document.getElementById("campaign-select").value;
  const voice = document.getElementById("voice-select").value;
  let name = document.getElementById("character-name").value;
  if (!name) name = window.getRandomName(race, gender);

  window.initializePlayer(race, cls, gender, campaign, voice);
  window.party[0].name = name; // Update with generated name if needed

  // Player's chosen shirt/pants/hair/skin colors (see the character
  // creator's sliders) — set explicitly so drawPlayerCharacter uses them
  // instead of the name-derived defaults every other character gets
  // (see spriteRecolor.js).
  const shirtSlider = document.getElementById("shirt-hue-slider");
  const pantsSlider = document.getElementById("pants-hue-slider");
  const hairSlider = document.getElementById("hair-hue-slider");
  const skinSlider = document.getElementById("skin-hue-slider");
  if (shirtSlider) window.party[0].shirtHue = parseInt(shirtSlider.value, 10);
  if (pantsSlider) window.party[0].pantsHue = parseInt(pantsSlider.value, 10);
  if (hairSlider) window.party[0].hairHue = parseInt(hairSlider.value, 10);
  if (skinSlider) window.party[0].skinHue = parseInt(skinSlider.value, 10);
  
  window.ironmanMode = document.getElementById("ironman-check").checked;

  // Roguelike: Apply permanent skill bonuses
  window.relicsEnabled = document.getElementById("relics-activated-check").checked;
  if (campaign === "1" && window.relicsEnabled) {
      window.party.forEach(char => {
          for (const tree in window.roguelikeData.permanentSkillBonuses) {
              const bonus = window.roguelikeData.permanentSkillBonuses[tree];
              char.attributes[tree] = (char.attributes[tree] || 0) + bonus;
          }
      });
      // Give relics to inventory
      (window.roguelikeData.relics || []).forEach(rid => {
          window.party[0].inventory.push(rid);
      });
      window.roguelikeData.fightsCompleted = 0; 
      window.runMaxEnemySkills = {}; // Reset tracking
  }

  // Campaign Level Caps
  window.campaignLevelCaps = { "1": 50, "2": 5, "3": 50 };
  window.currentLevelCap = window.campaignLevelCaps[campaign] || 50;

  if (window.updatePartyTabs) window.updatePartyTabs();

  document.getElementById("characterCreator").style.display = "none";
  document.getElementById("gameContainer").style.display = "flex";
  document.getElementById("top-menu").style.display = "flex";
  
  // Flag that we are in the initial setup
  window.isInitialCharacterScreen = true;
  document.getElementById("character-screen-modal").style.display = "block";
  window.showCharacterScreen();
  // startGameCore() will be called when this modal closes
};
