// monsterManual.js
// Observation-driven bestiary / field notebook. The manual deliberately records
// what the party has actually seen (creatures, visible equipment, used abilities
// and repeated class-training samples) rather than revealing template stats.
(() => {
    const KNOWLEDGE_VERSION = 1;
    const LONG_PRESS_MS = 560;
    const MOVE_CANCEL_PX = 14;
    const CLASS_SAMPLE_MIN = 3;
    const MAX_ENTITY_IDS = 160;
    const CLASS_LABELS = {
        fighter: 'Fighter', rogue: 'Rogue', cleric: 'Cleric',
        wizard: 'Wizard', druid: 'Druid', monk: 'Monk'
    };

    let selectedKey = null;
    let messageObserverTimer = null;
    let scanTimer = null;
    let longPressState = null;
    let suppressClickUntil = 0;
    const flaggedAbilityKeys = new Set();

    const abilityPatterns = [
        { id: 'quarterstaff_trip', test: text => /\btrip(?:s|ped|ping)?\b/i.test(text) },
        { id: 'furious_charge', test: text => /\bcharg(?:e|es|ed|ing)\b/i.test(text) },
        { id: 'gore_charge', test: text => /\bcharg(?:e|es|ed|ing)\b|\bgore(?:s|d)?\b/i.test(text) },
        { id: 'petrify_gaze', test: text => /\bgaze\b|petrif/i.test(text) },
        { id: 'siren_song', test: text => /\bsong\b|entranc/i.test(text) },
        { id: 'life_drain', test: text => /\bdrain(?:s|ed|ing)?\b/i.test(text) },
        { id: 'revenant_revive', test: text => /rises again|refuses to stay dead/i.test(text) },
        { id: 'shield_bash', test: text => /shield bash/i.test(text) },
        { id: 'shove', test: text => /\bshov(?:e|es|ed|ing)\b/i.test(text) },
        { id: 'disarm', test: text => /\bdisarm(?:s|ed|ing)?\b/i.test(text) },
        { id: 'poison_bite', test: text => /\bpoison(?:s|ed|ing)?\b/i.test(text) },
    ];

    function titleCase(text) {
        return String(text || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    function freshKnowledge() {
        return { version: KNOWLEDGE_VERSION, species: {} };
    }

    function getKnowledge() {
        const leader = window.party?.[0];
        let store = leader?.monsterManualKnowledge || window._pendingMonsterManualKnowledge;
        if (!store || typeof store !== 'object') store = freshKnowledge();
        if (!store.species || typeof store.species !== 'object') store.species = {};
        store.version = KNOWLEDGE_VERSION;

        if (leader) {
            leader.monsterManualKnowledge = store;
            window._pendingMonsterManualKnowledge = store;
            // window.player is sometimes the same object and sometimes a live
            // entity/data mirror. Sharing the same reference keeps both paths in
            // sync without introducing a second persistence format.
            if (window.player && typeof window.player === 'object') {
                window.player.monsterManualKnowledge = store;
            }
        } else {
            window._pendingMonsterManualKnowledge = store;
        }
        return store;
    }

    function speciesIdentity(entity) {
        if (!entity) return null;
        // PC-style NPCs already carry their underlying race; grouping those by
        // race is what lets repeated encounters reveal race-level tendencies.
        if (entity.race) {
            const key = String(entity.race).toLowerCase();
            return { key, label: titleCase(key) };
        }
        // Template monsters do not currently retain their template id, so use
        // their visible name. Named bosses therefore get their own honest entry
        // rather than being silently folded into a species we cannot prove.
        const label = String(entity.name || 'Unknown Creature').trim();
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown_creature';
        return { key, label };
    }

    function ensureEntry(entity) {
        const identity = speciesIdentity(entity);
        if (!identity) return null;
        const store = getKnowledge();
        let entry = store.species[identity.key];
        if (!entry) {
            entry = store.species[identity.key] = {
                key: identity.key,
                label: identity.label,
                sightings: 0,
                combatants: 0,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
                entityIds: [],
                combatEntityIds: [],
                classSampleIds: [],
                classIndividuals: 0,
                classLevels: {},
                abilities: {},
                equipment: {},
                tags: [],
            };
        }
        entry.label = entry.label || identity.label;
        entry.lastSeen = Date.now();
        return entry;
    }

    function entityId(entity) {
        return entity?.id != null ? String(entity.id) : null;
    }

    function rememberId(list, id) {
        if (!id || list.includes(id) || list.length >= MAX_ENTITY_IDS) return false;
        list.push(id);
        return true;
    }

    function observeVisibleEquipment(entity, entry) {
        if (!entity?.equipped || !entry) return;
        const slots = ['weapon', 'offhand', 'armor', 'helmet', 'clothes', 'shirt', 'pants'];
        const seen = new Set();
        slots.forEach(slot => {
            const itemId = entity.equipped[slot];
            if (!itemId || seen.has(itemId)) return;
            seen.add(itemId);
            const item = window.items?.[itemId];
            const label = item?.name || titleCase(itemId);
            const record = entry.equipment[itemId] || { label, sightings: 0 };
            record.label = label;
            record.sightings += 1;
            entry.equipment[itemId] = record;
        });
    }

    function observeEntity(entity) {
        if (!entity || entity.side !== 'enemy' || !entity.hasBeenSeenByPlayer) return null;
        const entry = ensureEntry(entity);
        if (!entry) return null;
        const id = entityId(entity);
        if (rememberId(entry.entityIds, id)) {
            entry.sightings += 1;
            observeVisibleEquipment(entity, entry);
            entry.tags = Array.from(new Set([...(entry.tags || []), ...(entity.tags || [])]));
        }
        return entry;
    }

    function recordCombatSample(entity) {
        const entry = observeEntity(entity);
        if (!entry) return;
        const id = entityId(entity);
        if (rememberId(entry.combatEntityIds, id)) entry.combatants += 1;

        // Only genuine PC-style builds carry classLevels. Generic monster
        // templates currently use skill/equipment archetypes instead, so they
        // deliberately do not contribute invented Fighter/Rogue levels.
        if (!Array.isArray(entity.classLevels) || entity.classLevels.length === 0) return;
        if (!rememberId(entry.classSampleIds, id)) return;
        entry.classIndividuals += 1;
        entity.classLevels.forEach(cls => {
            const key = String(cls).toLowerCase();
            entry.classLevels[key] = (entry.classLevels[key] || 0) + 1;
        });
    }

    function skillLabel(skillId) {
        const skill = window.skills?.[skillId];
        if (skill?.name) return skill.name;
        if (/_parry$/.test(skillId)) return `${titleCase(skillId.replace(/_parry$/, ''))} Parry`;
        if (/_riposte$/.test(skillId)) return `${titleCase(skillId.replace(/_riposte$/, ''))} Riposte`;
        return titleCase(skillId);
    }

    function observeAbility(entity, abilityId, label, tree) {
        if (!entity || entity.side !== 'enemy') return;
        // An action itself is enough to establish that the creature was
        // encountered even if fog bookkeeping has not completed this frame.
        if (!entity.hasBeenSeenByPlayer) entity.hasBeenSeenByPlayer = true;
        const entry = ensureEntry(entity);
        if (!entry) return;
        observeEntity(entity);
        recordCombatSample(entity);
        const id = String(abilityId || label || 'unknown_ability');
        const skill = window.skills?.[id];
        const record = entry.abilities[id] || {
            label: label || skillLabel(id),
            uses: 0,
            firstSeen: Date.now(),
            tree: tree || skill?.tree || null,
        };
        record.label = label || record.label || skillLabel(id);
        record.tree = tree || record.tree || skill?.tree || null;
        record.uses += 1;
        record.lastSeen = Date.now();
        entry.abilities[id] = record;
        if (isManualOpen() && selectedKey === entry.key) renderSelectedEntry();
    }

    function actorAtStart(text, entity) {
        const name = String(entity?.name || '').trim();
        if (!name) return false;
        return text === name || text.startsWith(`${name} `) || text.startsWith(`${name}'s `);
    }

    function observeCombatMessage(rawText) {
        const text = String(rawText || '').replace(/<[^>]+>/g, '').trim();
        if (!text || !window.entities) return;
        const enemies = window.entities.filter(e => e?.side === 'enemy' && e.alive !== false && actorAtStart(text, e));
        enemies.forEach(entity => {
            observeEntity(entity);
            if (entity.aiState === 'combat' || window.isInCombat) recordCombatSample(entity);

            abilityPatterns.forEach(pattern => {
                if (entity.skills?.[pattern.id] && pattern.test(text)) {
                    observeAbility(entity, pattern.id);
                }
            });

            const weaponId = entity.equipped?.weapon;
            if (weaponId && /\bparried\b|\bparry\b/i.test(text) && entity.skills?.[`${weaponId}_parry`]) {
                observeAbility(entity, `${weaponId}_parry`);
            }
            if (weaponId && /\briposte(?:s|d)?\b/i.test(text) && entity.skills?.[`${weaponId}_riposte`]) {
                observeAbility(entity, `${weaponId}_riposte`);
            }

            (entity.createdSpells || []).forEach(spell => {
                if (!spell?.name) return;
                const spellName = String(spell.name);
                const used = text.toLowerCase().includes(spellName.toLowerCase()) ||
                    (/\bcasts?\b|\bunleashes?\b|\bsummons?\b/i.test(text) && text.toLowerCase().includes(spellName.split(' ')[0].toLowerCase()));
                if (used) {
                    const id = `spell:${spell.baseId || spell.name.toLowerCase().replace(/\s+/g, '_')}`;
                    observeAbility(entity, id, spell.name, spell.school || null);
                }
            });
        });
    }

    function installMessageObserver() {
        const current = window.showMessage;
        if (typeof current !== 'function' || current.__monsterManualObserver) return;
        const wrapped = function (...args) {
            try { observeCombatMessage(args[0]); } catch (err) { console.warn('Monster Manual observation failed', err); }
            return current.apply(this, args);
        };
        wrapped.__monsterManualObserver = true;
        wrapped.__monsterManualOriginal = current;
        window.showMessage = wrapped;
    }

    function scanSeenEnemies() {
        installMessageObserver();
        const enemies = (window.entities || []).filter(e => e?.side === 'enemy' && e.hasBeenSeenByPlayer);
        enemies.forEach(entity => {
            observeEntity(entity);
            if (entity.aiState === 'combat' || window.isInCombat) recordCombatSample(entity);
            if (entity.skills?.petrify_gaze && entity.hasUsedGaze) observeAbilityOnceFlag(entity, 'petrify_gaze');
            if (entity.skills?.siren_song && entity.hasUsedSong) observeAbilityOnceFlag(entity, 'siren_song');
            if (entity.skills?.revenant_revive && entity.revenantRevived) observeAbilityOnceFlag(entity, 'revenant_revive');
        });
    }

    function observeAbilityOnceFlag(entity, skillId) {
        const key = `${entityId(entity) || entity.name}:${skillId}`;
        if (flaggedAbilityKeys.has(key)) return;
        flaggedAbilityKeys.add(key);
        observeAbility(entity, skillId);
    }

    function evidenceStrength(entry) {
        const n = entry?.classIndividuals || 0;
        if (n >= 12) return 'Well-supported';
        if (n >= 6) return 'Emerging';
        if (n >= CLASS_SAMPLE_MIN) return 'Tentative';
        return 'Insufficient';
    }

    function classTendencySentence(entry) {
        const rows = Object.entries(entry.classLevels || {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
        if (rows.length === 0) return 'No formal class-training pattern has been established.';
        if ((entry.classIndividuals || 0) < CLASS_SAMPLE_MIN) {
            return `The party has fought ${entry.classIndividuals || 0} ${entry.classIndividuals === 1 ? 'individual' : 'individuals'} with recognisable formal training; that is too little evidence for a broader pattern.`;
        }
        const [topClass, topCount] = rows[0];
        const [secondClass, secondCount = 0] = rows[1] || [];
        const topLabel = CLASS_LABELS[topClass] || titleCase(topClass);
        if (!secondClass || secondCount <= 0) return `${topLabel} training dominates the formally trained opponents observed so far.`;
        const secondLabel = CLASS_LABELS[secondClass] || titleCase(secondClass);
        const ratio = topCount / secondCount;
        if (ratio >= 2.6) return `${topLabel} training appears far more common than ${secondLabel} training among formally trained opponents observed.`;
        if (ratio >= 1.65) return `${topLabel} training appears roughly twice as common as ${secondLabel} training among formally trained opponents observed.`;
        if (ratio >= 1.25) return `${topLabel} training appears somewhat more common than ${secondLabel} training among formally trained opponents observed.`;
        return `${topLabel} and ${secondLabel} training appear similarly common among formally trained opponents observed.`;
    }

    function isManualOpen() {
        return document.getElementById('monster-manual-modal')?.style.display === 'block';
    }

    function createInterface() {
        if (document.getElementById('monster-manual-modal')) return;
        const rosterButton = document.getElementById('roster-btn');
        if (rosterButton && !document.getElementById('monster-manual-btn')) {
            const button = document.createElement('button');
            button.id = 'monster-manual-btn';
            button.textContent = 'Monster Manual';
            button.style.backgroundColor = '#455a3b';
            rosterButton.insertAdjacentElement('afterend', button);
            button.addEventListener('click', () => openManual());
        }

        const style = document.createElement('style');
        style.id = 'monster-manual-style';
        style.textContent = `
            #monster-manual-modal .mm-shell{width:min(920px,94vw);height:min(78vh,720px);max-width:none;display:flex;flex-direction:column;background:#171812;border:1px solid #626b4d;}
            #monster-manual-modal .mm-subtitle{margin:-8px 0 12px;color:#aaa;font-size:.86em;}
            #monster-manual-modal .mm-layout{display:grid;grid-template-columns:minmax(190px,30%) 1fr;gap:12px;min-height:0;flex:1;}
            #monster-manual-modal .mm-sidebar,#monster-manual-modal .mm-detail{background:#20221b;border:1px solid #3d4134;border-radius:7px;min-height:0;overflow:auto;}
            #monster-manual-modal .mm-sidebar{padding:8px;}
            #monster-manual-modal .mm-search{box-sizing:border-box;width:100%;margin-bottom:8px;background:#111;color:#eee;border:1px solid #555;border-radius:5px;padding:8px;}
            #monster-manual-modal .mm-entry-btn{display:block;width:100%;text-align:left;margin:0 0 5px;padding:9px 10px;background:#292d23;color:#eee;border:1px solid #454b3b;border-radius:5px;}
            #monster-manual-modal .mm-entry-btn.selected{border-color:#b5c77a;background:#39412d;}
            #monster-manual-modal .mm-entry-meta{display:block;color:#9ca18f;font-size:.75em;margin-top:2px;}
            #monster-manual-modal .mm-detail{padding:16px;}
            #monster-manual-modal .mm-detail h3{margin:0 0 4px;color:#d6e2ac;font-size:1.5em;}
            #monster-manual-modal .mm-kicker{color:#909680;font-size:.8em;margin-bottom:16px;}
            #monster-manual-modal .mm-section{margin:15px 0 0;padding-top:12px;border-top:1px solid #3b3f33;}
            #monster-manual-modal .mm-section h4{margin:0 0 8px;color:#c8d39f;}
            #monster-manual-modal .mm-note{color:#a7a7a7;font-size:.84em;line-height:1.45;}
            #monster-manual-modal .mm-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #303329;}
            #monster-manual-modal .mm-row:last-child{border-bottom:0;}
            #monster-manual-modal .mm-count{color:#969c89;white-space:nowrap;font-size:.82em;}
            #monster-manual-modal .mm-class-row{display:grid;grid-template-columns:80px 1fr;gap:8px;align-items:center;margin:7px 0;}
            #monster-manual-modal .mm-bar{height:8px;background:#111;border-radius:99px;overflow:hidden;}
            #monster-manual-modal .mm-bar > span{display:block;height:100%;background:#879b59;border-radius:99px;}
            #monster-manual-modal .mm-empty{color:#999;line-height:1.5;padding:18px;}
            @media(max-width:650px){
                #monster-manual-modal .mm-shell{width:94vw;height:86vh;padding:14px;}
                #monster-manual-modal .mm-layout{grid-template-columns:1fr;grid-template-rows:minmax(120px,30%) 1fr;}
                #monster-manual-modal .mm-entry-btn{padding:8px;}
                #monster-manual-modal .mm-detail{padding:12px;}
            }
        `;
        document.head.appendChild(style);

        const modal = document.createElement('div');
        modal.id = 'monster-manual-modal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-content mm-shell">
                <button class="close-btn" id="close-monster-manual-modal">&times;</button>
                <h2 style="margin-bottom:8px;">Monster Manual</h2>
                <div class="mm-subtitle">Field notes: only what the party has actually seen, heard or fought.</div>
                <div class="mm-layout">
                    <div class="mm-sidebar">
                        <input id="monster-manual-search" class="mm-search" type="search" placeholder="Search known creatures…" autocomplete="off">
                        <div id="monster-manual-list"></div>
                    </div>
                    <div id="monster-manual-detail" class="mm-detail"></div>
                </div>
            </div>`;
        document.body.appendChild(modal);
        document.getElementById('close-monster-manual-modal').addEventListener('click', closeManual);
        document.getElementById('monster-manual-search').addEventListener('input', renderList);
        modal.addEventListener('click', ev => { if (ev.target === modal) closeManual(); });
    }

    function closeManual() {
        const modal = document.getElementById('monster-manual-modal');
        if (modal) modal.style.display = 'none';
        window.lastModalClosedTime = Date.now();
    }

    function openManual(key = null) {
        createInterface();
        scanSeenEnemies();
        const entries = Object.values(getKnowledge().species || {}).sort((a, b) => a.label.localeCompare(b.label));
        if (key && getKnowledge().species[key]) selectedKey = key;
        else if (!selectedKey || !getKnowledge().species[selectedKey]) selectedKey = entries[0]?.key || null;
        const modal = document.getElementById('monster-manual-modal');
        if (modal) modal.style.display = 'block';
        renderList();
        renderSelectedEntry();
    }

    function openForEntity(entity) {
        if (!entity || entity.side !== 'enemy') return false;
        if (!entity.hasBeenSeenByPlayer) entity.hasBeenSeenByPlayer = true;
        const entry = observeEntity(entity) || ensureEntry(entity);
        if (!entry) return false;
        selectedKey = entry.key;
        openManual(entry.key);
        return true;
    }

    function renderList() {
        const list = document.getElementById('monster-manual-list');
        if (!list) return;
        const query = (document.getElementById('monster-manual-search')?.value || '').trim().toLowerCase();
        const entries = Object.values(getKnowledge().species || {})
            .filter(e => !query || e.label.toLowerCase().includes(query))
            .sort((a, b) => a.label.localeCompare(b.label));
        list.innerHTML = '';
        if (!entries.length) {
            list.innerHTML = '<div class="mm-empty">No matching field notes.</div>';
            return;
        }
        entries.forEach(entry => {
            const button = document.createElement('button');
            button.className = `mm-entry-btn${entry.key === selectedKey ? ' selected' : ''}`;
            button.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><span class="mm-entry-meta">Seen ${entry.sightings || 0} · fought ${entry.combatants || 0}</span>`;
            button.addEventListener('click', () => {
                selectedKey = entry.key;
                renderList();
                renderSelectedEntry();
            });
            list.appendChild(button);
        });
    }

    function renderSelectedEntry() {
        const detail = document.getElementById('monster-manual-detail');
        if (!detail) return;
        const entry = selectedKey ? getKnowledge().species[selectedKey] : null;
        if (!entry) {
            detail.innerHTML = '<div class="mm-empty"><strong>No entries yet.</strong><br>Creatures are added when the party actually sees them. Long-press a visible enemy to jump straight to its notes.</div>';
            return;
        }

        const abilities = Object.values(entry.abilities || {}).sort((a, b) => (b.uses || 0) - (a.uses || 0) || a.label.localeCompare(b.label));
        const gear = Object.values(entry.equipment || {}).sort((a, b) => (b.sightings || 0) - (a.sightings || 0) || a.label.localeCompare(b.label));
        const classRows = Object.entries(entry.classLevels || {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
        const maxClass = classRows[0]?.[1] || 1;
        const canInferClasses = (entry.classIndividuals || 0) >= CLASS_SAMPLE_MIN;

        detail.innerHTML = `
            <h3>${escapeHtml(entry.label)}</h3>
            <div class="mm-kicker">${entry.sightings || 0} distinct sighting${entry.sightings === 1 ? '' : 's'} · ${entry.combatants || 0} fought</div>
            <div class="mm-note">These are field observations, not a stat block. A missing ability means “not seen yet”, not “cannot do this”.</div>

            <div class="mm-section">
                <h4>Observed abilities</h4>
                ${abilities.length ? abilities.map(a => `<div class="mm-row"><span><strong>${escapeHtml(a.label)}</strong>${a.tree ? `<br><span class="mm-note">${escapeHtml(titleCase(a.tree))} technique</span>` : ''}</span><span class="mm-count">seen used ${a.uses || 1}×</span></div>`).join('') : '<div class="mm-note">No distinctive abilities have been witnessed yet.</div>'}
            </div>

            <div class="mm-section">
                <h4>Observed gear</h4>
                ${gear.length ? gear.map(g => `<div class="mm-row"><span>${escapeHtml(g.label)}</span><span class="mm-count">on ${g.sightings || 1} sighting${g.sightings === 1 ? '' : 's'}</span></div>`).join('') : '<div class="mm-note">No notable carried or worn equipment has been recorded.</div>'}
            </div>

            <div class="mm-section">
                <h4>Training tendencies</h4>
                <div class="mm-note"><strong>${escapeHtml(evidenceStrength(entry))} evidence.</strong> ${escapeHtml(classTendencySentence(entry))}</div>
                ${canInferClasses && classRows.length ? `<div style="margin-top:10px;">${classRows.map(([cls, count]) => `<div class="mm-class-row"><span>${escapeHtml(CLASS_LABELS[cls] || titleCase(cls))}</span><div class="mm-bar" title="Relative frequency in observed formally trained opponents"><span style="width:${Math.max(8, Math.round((count / maxClass) * 100))}%"></span></div></div>`).join('')}</div>` : ''}
                <div class="mm-note" style="margin-top:8px;">Training patterns are only inferred from opponents that actually follow formal class disciplines. Unclassed creatures are left unclassified rather than forced into a class.</div>
            </div>`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
    }

    function enemyAtClientPoint(clientX, clientY) {
        if (!window.screenToHex || !window.entities) return null;
        const hex = window.screenToHex({ x: clientX, y: clientY });
        return window.entities.find(entity =>
            entity?.alive !== false && entity.side === 'enemy' && entity.hasBeenSeenByPlayer &&
            typeof entity.getAllHexes === 'function' && entity.getAllHexes().some(h => h.q === hex.q && h.r === hex.r)
        ) || null;
    }

    function installMapShortcut() {
        const canvas = document.getElementById('mapCanvas');
        if (!canvas || canvas.dataset.monsterManualShortcut === 'true') return;
        canvas.dataset.monsterManualShortcut = 'true';

        canvas.addEventListener('touchstart', event => {
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            const entity = enemyAtClientPoint(touch.clientX, touch.clientY);
            if (!entity) return;
            longPressState = {
                entity,
                startX: touch.clientX,
                startY: touch.clientY,
                timer: setTimeout(() => {
                    suppressClickUntil = Date.now() + 700;
                    openForEntity(entity);
                    longPressState = null;
                }, LONG_PRESS_MS),
            };
        }, { passive: true });

        canvas.addEventListener('touchmove', event => {
            if (!longPressState || event.touches.length !== 1) return;
            const touch = event.touches[0];
            if (Math.hypot(touch.clientX - longPressState.startX, touch.clientY - longPressState.startY) > MOVE_CANCEL_PX) {
                clearTimeout(longPressState.timer);
                longPressState = null;
            }
        }, { passive: true });

        const cancelHold = () => {
            if (!longPressState) return;
            clearTimeout(longPressState.timer);
            longPressState = null;
        };
        canvas.addEventListener('touchend', cancelHold, { passive: true });
        canvas.addEventListener('touchcancel', cancelHold, { passive: true });

        canvas.addEventListener('click', event => {
            if (Date.now() < suppressClickUntil) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);

        canvas.addEventListener('contextmenu', event => {
            const entity = enemyAtClientPoint(event.clientX, event.clientY);
            if (!entity) return; // preserve the existing door context menu elsewhere
            event.preventDefault();
            event.stopImmediatePropagation();
            openForEntity(entity);
        }, true);
    }

    function initialise() {
        createInterface();
        installMapShortcut();
        installMessageObserver();
        if (!messageObserverTimer) messageObserverTimer = setInterval(installMessageObserver, 1000);
        if (!scanTimer) scanTimer = setInterval(scanSeenEnemies, 700);
    }

    window.monsterManual = {
        open: openManual,
        openForEntity,
        observeEntity,
        observeAbility,
        recordCombatSample,
        getKnowledge,
        render: () => { renderList(); renderSelectedEntry(); },
    };
    // Tiny public hook for future combat code: exact action sites can call this
    // directly and bypass message-pattern inference without changing the data/UI.
    window.observeMonsterAbility = observeAbility;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();
