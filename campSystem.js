// campSystem.js — explicit camp setup layered over the existing sleep/expedition systems.
(function (root) {
    'use strict';

    const BUILD = '20261001-camp-v1';
    const UNSAFE_TERRAIN = /\b(deep water|shallow water|river|lake|ocean|sea|lava)\b/i;
    const POOR_TERRAIN = /\b(swamp|marsh|mud)\b/i;
    const SETUP = Object.freeze({
        chooseSite: 5,
        tentPerTent: 12,
        bedrollPerSleeper: 3,
        armourPerWearer: 2,
        fireWithTinder: 8,
        fireWithoutTinder: 18,
        packUp: 10,
    });

    let installed = false;
    let camp = null;
    let lastSleeping = false;
    let labelTimer = null;

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
    const inventory = () => Array.isArray(root.partyInventory)
        ? root.partyInventory
        : (Array.isArray(root.player?.inventory) ? root.player.inventory : []);
    const itemCount = id => inventory().reduce((n, x) => n + (x === id ? 1 : 0), 0);
    const item = id => root.items?.[id] || null;
    const playerHex = () => root.player?.hex || { q: 0, r: 0 };

    function sentientParty() {
        return (root.entities || []).filter(e =>
            e?.alive && e.side === 'player' && !e.rider && !['Wolf', 'Horse'].includes(e.name)
        );
    }

    function isIndoor(hex = playerHex()) {
        if (typeof root.isPlayerIndoors === 'function' && hex === root.player?.hex) return !!root.isPlayerIndoors();
        if (typeof root.findInteriorRegion === 'function' && root.findInteriorRegion(hex)) return true;
        const name = root.getTerrainAt?.(hex.q, hex.r)?.name || '';
        return name === 'Wood Floor' || name === 'Cave Floor';
    }

    function terrainName(hex = playerHex()) {
        return root.getTerrainAt?.(hex.q, hex.r)?.name || 'open ground';
    }

    function evaluateCampsite() {
        const hex = playerHex();
        const indoor = isIndoor(hex);
        const terrain = terrainName(hex);
        if (!indoor && UNSAFE_TERRAIN.test(terrain)) {
            return {
                ok: false,
                terrain,
                indoor,
                reason: `You can't make camp on ${terrain.toLowerCase()}. Move onto dry, stable ground first.`,
            };
        }
        return {
            ok: true,
            terrain,
            indoor,
            poorGround: !indoor && POOR_TERRAIN.test(terrain),
        };
    }

    function canonical(entity) {
        if (!entity) return null;
        return (root.party || []).find(p => p === entity || (p?.name && p.name === entity.name)) || entity;
    }

    function relationValue(source, other) {
        if (!source || !other) return null;
        const keys = [other.id, other.name].filter(Boolean);
        const maps = [source.relationships, source.relationship, source.opinions, source.attitudes, source.affinity];
        for (const map of maps) {
            if (!map || typeof map !== 'object') continue;
            for (const key of keys) {
                const value = map[key];
                if (typeof value === 'number' && Number.isFinite(value)) return clamp(value, -100, 100);
                if (value && typeof value === 'object') {
                    for (const field of ['score', 'approval', 'attitude', 'affinity', 'value']) {
                        if (typeof value[field] === 'number') return clamp(value[field], -100, 100);
                    }
                }
            }
        }
        return null;
    }

    function relationshipScore(a, b) {
        if (!a || !b || a === b) return 100;
        const ca = canonical(a), cb = canonical(b);
        const directA = relationValue(ca, cb);
        const directB = relationValue(cb, ca);
        if (directA !== null || directB !== null) {
            if (directA !== null && directB !== null) return (directA + directB) / 2;
            return directA !== null ? directA : directB;
        }

        // The established relationship system is player<->companion rather than
        // companion<->companion. Use it when one side is the protagonist and
        // remain neutral for unauthored companion pairs.
        const protagonist = (root.party || [])[0];
        const other = ca === protagonist ? cb : (cb === protagonist ? ca : null);
        if (other && root.companionRelationships?.getRelationship) {
            const rel = root.companionRelationships.getRelationship(other);
            if (rel) {
                const approval = Number(rel.approval ?? 50) - 50;
                const trust = Number(rel.trust ?? 50) - 50;
                return clamp(approval * 1.2 + trust * 0.35, -100, 100);
            }
        }
        return 0;
    }

    function outdoorTemperature() {
        const hex = playerHex();
        if (typeof root.getAmbientTemperature === 'function') return Number(root.getAmbientTemperature(hex)) || 0;
        if (typeof root.getEffectiveTemperature === 'function') return Number(root.getEffectiveTemperature(root.player)) || 0;
        return 15;
    }

    function memberTemperature(entity) {
        if (typeof root.getEffectiveTemperature === 'function') {
            return Number(root.getEffectiveTemperature(entity)) || outdoorTemperature();
        }
        return outdoorTemperature();
    }

    function coldSharingBonus(tempC) {
        if (tempC <= -10) return 55;
        if (tempC <= 0) return 35;
        if (tempC <= 5) return 18;
        return 0;
    }

    function allocateTents(members, tentCount, capacity, tempC) {
        const remaining = [...members].sort((a, b) => memberTemperature(a) - memberTemperature(b));
        const tents = [];
        const coldBonus = coldSharingBonus(tempC);

        for (let t = 0; t < tentCount && remaining.length; t++) {
            const occupants = [remaining.shift()];
            while (occupants.length < capacity && remaining.length) {
                let bestIndex = -1;
                let bestScore = -Infinity;
                for (let i = 0; i < remaining.length; i++) {
                    const candidate = remaining[i];
                    const social = occupants.reduce((sum, other) => sum + relationshipScore(candidate, other), 0) / occupants.length;
                    const adjusted = social + coldBonus;
                    if (adjusted > bestScore) {
                        bestScore = adjusted;
                        bestIndex = i;
                    }
                }
                // By default neutral/friendly people share. Disliked companions
                // keep separate space when possible; severe cold makes them more
                // willing to tolerate one another, but never erases true hostility.
                if (bestIndex < 0 || bestScore < -25) break;
                occupants.push(remaining.splice(bestIndex, 1)[0]);
            }
            const rawScores = [];
            for (let i = 0; i < occupants.length; i++) {
                for (let j = i + 1; j < occupants.length; j++) rawScores.push(relationshipScore(occupants[i], occupants[j]));
            }
            tents.push({
                occupants,
                reluctant: rawScores.some(score => score < -20),
                harmony: rawScores.length ? rawScores.reduce((a, b) => a + b, 0) / rawScores.length : 0,
            });
        }
        return { tents, outside: remaining };
    }

    function hasArmour(entity) {
        return Object.values(entity?.equipped || {}).some(id => {
            const x = item(id);
            return x && ['armor', 'helmet', 'shield'].includes(x.type);
        });
    }

    function chooseBedrolls(members, available) {
        return [...members]
            .sort((a, b) => memberTemperature(a) - memberTemperature(b))
            .slice(0, Math.max(0, Math.min(available, members.length)));
    }

    function makeTasks(site, members, tentCount, bedrollCount) {
        const workers = Math.max(1, Math.min(3, members.length));
        const armoured = members.filter(hasArmour).length;
        const tasks = [];
        if (!site.indoor) tasks.push({ key: 'site', label: 'Choose and clear a dry campsite', minutes: SETUP.chooseSite });
        if (!site.indoor && tentCount) {
            tasks.push({
                key: 'tents',
                label: `Erect ${tentCount} tent${tentCount === 1 ? '' : 's'}`,
                minutes: Math.max(SETUP.tentPerTent, Math.ceil(tentCount * SETUP.tentPerTent / workers)),
            });
        }
        if (bedrollCount) {
            tasks.push({
                key: 'bedrolls',
                label: `Unroll ${bedrollCount} bedroll${bedrollCount === 1 ? '' : 's'}`,
                minutes: Math.max(SETUP.bedrollPerSleeper, Math.ceil(bedrollCount * SETUP.bedrollPerSleeper / workers)),
            });
        }
        if (armoured) {
            tasks.push({
                key: 'armour',
                label: `${armoured} sleeper${armoured === 1 ? '' : 's'} remove armour`,
                minutes: Math.max(SETUP.armourPerWearer, Math.ceil(armoured * SETUP.armourPerWearer / workers)),
            });
        }
        if (!site.indoor) {
            const tinder = itemCount('tinderbox') > 0;
            tasks.push({
                key: 'fire',
                label: tinder ? 'Light the campfire with a tinderbox' : 'Gather tinder and coax a campfire alight',
                minutes: tinder ? SETUP.fireWithTinder : SETUP.fireWithoutTinder,
            });
        }
        return tasks;
    }

    function qualityFor(entity, plan) {
        const inTent = plan.tents.some(t => t.occupants.includes(entity));
        const tent = plan.tents.find(t => t.occupants.includes(entity));
        const bedroll = plan.bedrolls.includes(entity);
        const fireBonus = plan.fireLit ? 4 : 0;
        let temp = plan.temperature + (inTent ? 3 : 0) + (bedroll ? 8 : 0) + fireBonus;
        if (plan.site.indoor) temp = 18 + (temp - 18) * 0.35;

        let score = 50;
        if (temp >= 12 && temp <= 24) score += 25;
        else if (temp >= 5 && temp <= 30) score += 10;
        else if (temp < 0 || temp > 35) score -= 30;
        else score -= 10;

        if (inTent) score += 10;
        if (bedroll) score += 15;
        else if (!plan.site.indoor) score -= 18;
        if (plan.site.poorGround) score -= 10;
        if (tent?.reluctant) score -= 8;

        score = clamp(score, 0, 100);
        return { score, temp, inTent, bedroll, reluctant: !!tent?.reluctant };
    }

    function qualityLabel(score) {
        if (score >= 80) return 'Excellent';
        if (score >= 65) return 'Good';
        if (score >= 45) return 'Adequate';
        return 'Poor';
    }

    function sleepHoursForQuality(score) {
        if (score >= 80) return 8;
        if (score >= 65) return 9;
        if (score >= 45) return 10;
        return 11;
    }

    function buildPlan() {
        const site = evaluateCampsite();
        if (!site.ok) return { ok: false, site };
        const members = sentientParty();
        if (!members.length) return { ok: false, site, reason: 'No conscious party member can make camp.' };

        const temperature = outdoorTemperature();
        const tentCount = site.indoor ? 0 : itemCount('tent');
        const capacity = Math.max(1, Number(item('tent')?.shelterCapacity) || 4);
        const allocation = allocateTents(members, tentCount, capacity, temperature);
        const bedrolls = chooseBedrolls(members, itemCount('bedroll'));
        const tasks = makeTasks(site, members, tentCount, bedrolls.length);
        const plan = {
            ok: true,
            site,
            members,
            temperature,
            tentCount,
            tentCapacity: capacity,
            tents: allocation.tents,
            outside: allocation.outside,
            bedrolls,
            fireLit: !site.indoor,
            tasks,
            setupMinutes: tasks.reduce((sum, task) => sum + task.minutes, 0),
            startedAt: Number(root.worldSeconds) || 0,
        };
        plan.qualities = members.map(entity => ({ entity, ...qualityFor(entity, plan) }));
        plan.averageQuality = plan.qualities.reduce((sum, q) => sum + q.score, 0) / Math.max(1, plan.qualities.length);
        plan.sleepHours = sleepHoursForQuality(plan.averageQuality);
        return plan;
    }

    function safeText(text) {
        return String(text ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function ensurePanel() {
        const d = root.document;
        if (!d?.body) return null;
        let panel = d.getElementById('camp-status-panel');
        if (!panel) {
            panel = d.createElement('div');
            panel.id = 'camp-status-panel';
            panel.style.cssText = [
                'position:fixed',
                'right:12px',
                'bottom:96px',
                'z-index:9500',
                'width:min(370px,calc(100vw - 24px))',
                'max-height:46vh',
                'overflow:auto',
                'padding:10px 12px',
                'border:1px solid rgba(255,255,255,.22)',
                'border-radius:10px',
                'background:rgba(20,20,24,.94)',
                'color:#f5f5f5',
                'box-shadow:0 5px 18px rgba(0,0,0,.45)',
                'font-size:13px',
                'line-height:1.35',
                'display:none',
                'pointer-events:none'
            ].join(';');
            d.body.appendChild(panel);
        }
        return panel;
    }

    function tentLine(tent, index) {
        const names = tent.occupants.map(x => x.name || 'Companion').join(', ');
        const mood = tent.reluctant ? ' · reluctantly sharing' : '';
        return `⛺ Tent ${index + 1}: ${safeText(names)}${mood}`;
    }

    function renderPanel(phase = 'sleeping') {
        if (!camp) return;
        const panel = ensurePanel();
        if (!panel) return;
        const guard = camp.members.find(e => e.onGuard);
        const tasks = camp.tasks.map(task => `✓ ${safeText(task.label)} · ${task.minutes}m`).join('<br>');
        const tents = camp.tents.length
            ? camp.tents.map(tentLine).join('<br>')
            : (camp.site.indoor ? '🏠 Sheltered indoors' : '⛺ No tent shelter');
        const bedding = camp.bedrolls.length
            ? `🛏 Bedrolls: ${camp.bedrolls.map(e => safeText(e.name)).join(', ')}`
            : '🛏 No bedrolls';
        const outside = camp.outside.length
            ? `<br>🌙 Outside tents: ${camp.outside.map(e => safeText(e.name)).join(', ')}`
            : '';
        const armour = camp.members.filter(hasArmour).map(e => safeText(e.name));
        const quality = `${qualityLabel(camp.averageQuality)} (${Math.round(camp.averageQuality)}/100) · ${camp.sleepHours}h target`;
        panel.innerHTML = `
            <div style="font-weight:700;font-size:15px;margin-bottom:5px">⛺ Camp · ${safeText(phase)}</div>
            <div>${safeText(camp.site.terrain)} · ${camp.temperature.toFixed(1)}°C ambient · ${safeText(quality)}</div>
            <div style="margin-top:6px">${camp.fireLit ? '🔥 Campfire lit' : '🔥 No campfire'}${guard ? ` · 👁 ${safeText(guard.name)} on watch` : ''}</div>
            <div style="margin-top:6px">${tents}${outside}<br>${bedding}</div>
            ${armour.length ? `<div style="margin-top:6px">🛡 Armour off for sleep: ${armour.join(', ')}</div>` : ''}
            <div style="margin-top:6px;color:#bbb">Setup: ${camp.setupMinutes} in-game minutes<br>${tasks}</div>
        `;
        panel.style.display = 'block';
    }

    function hidePanel() {
        const panel = root.document?.getElementById('camp-status-panel');
        if (panel) panel.style.display = 'none';
    }

    function announceCamp(plan) {
        const lines = [];
        for (const tent of plan.tents) {
            if (tent.occupants.length > 1) {
                const names = tent.occupants.map(e => e.name).join(' and ');
                lines.push(tent.reluctant
                    ? `${names} agree, somewhat reluctantly, to share a tent.`
                    : `${names} settle into the same tent.`);
            }
        }
        if (plan.outside.length) {
            lines.push(`${plan.outside.map(e => e.name).join(', ')} ${plan.outside.length === 1 ? 'has' : 'have'} no tent space tonight.`);
        }
        if (plan.temperature <= 5 && plan.tents.some(t => t.occupants.length > 1)) {
            lines.push('The cold makes sharing shelter more appealing than sleeping alone.');
        }
        if (plan.fireLit) lines.push('The campfire catches and the party gathers around it before turning in.');

        const selected = lines.slice(0, 3);
        selected.forEach(text => root.showMessage?.(`Camp: ${text}`));
        try {
            root.dispatchEvent?.(new CustomEvent('campDialogue', { detail: { camp: plan, lines: selected } }));
        } catch (_) { /* Narrow test harnesses may not implement CustomEvent. */ }
    }

    function advanceSetup(plan) {
        for (const task of plan.tasks) {
            if (typeof root.updateTime === 'function') root.updateTime(task.minutes * 60);
        }
    }

    function applySleepPlan(plan) {
        if (!root.isSleeping) return;
        for (const member of plan.members) {
            member._sleepTent = plan.tents.some(t => t.occupants.includes(member));
            member._sleepBedroll = plan.bedrolls.includes(member);
            member._campArmourRemoved = hasArmour(member) && !member.onGuard;
            // The core sleep code preserves a remaining timer across an ambush.
            // Only replace its default ten-hour value when this camp is first
            // established; resuming after combat must not reset sleep progress.
            if (!plan.sleepDurationApplied) member.sleepRemainingSeconds = plan.sleepHours * 3600;
        }
        plan.sleepDurationApplied = true;
        plan.establishedAt = Number(root.worldSeconds) || plan.startedAt;
        const guard = plan.members.find(e => e.onGuard);
        if (guard) root.showMessage?.(`Camp: ${guard.name} takes first watch.`);
        announceCamp(plan);
        renderPanel('sleeping');
    }

    function clearCamp({ packUp = true } = {}) {
        if (!camp) return;
        for (const member of camp.members || []) delete member._campArmourRemoved;
        if (packUp && typeof root.updateTime === 'function') root.updateTime(SETUP.packUp * 60);
        if (packUp) root.showMessage?.(`Camp packed away (${SETUP.packUp} minutes).`);
        camp = null;
        hidePanel();
    }

    function startCampThenSleep(baseToggle, args) {
        const site = evaluateCampsite();
        if (!site.ok) {
            root.showMessage?.(site.reason);
            return false;
        }
        if (camp && root._resumeSleepAfterCombat) {
            const result = baseToggle.apply(root, args);
            if (root.isSleeping) {
                applySleepPlan(camp);
                renderPanel('sleeping');
            }
            return result;
        }

        const plan = buildPlan();
        if (!plan.ok) {
            root.showMessage?.(plan.reason || plan.site?.reason || 'You cannot make camp here.');
            return false;
        }

        camp = plan;
        renderPanel('setting up');
        root.showMessage?.(`Making camp on ${plan.site.terrain.toLowerCase()}: ${plan.setupMinutes} minutes of setup.`);
        advanceSetup(plan);

        const result = baseToggle.apply(root, args);
        if (!root.isSleeping) {
            camp = null;
            hidePanel();
            return result;
        }
        applySleepPlan(plan);
        return result;
    }

    function installToggleWrapper() {
        if (typeof root.toggleSleep !== 'function' || root.toggleSleep._campSystem) return false;
        // Wait until the expedition wrapper is present so our pre-sleep setup
        // happens before its existing sleep-gear/watch integration, then we
        // deliberately apply the relationship-aware assignments afterwards.
        if (!root.toggleSleep._expedition) return false;
        const base = root.toggleSleep;
        const wrapped = function (...args) {
            if (root.isSleeping) {
                const result = base.apply(this, args);
                if (!root.isSleeping && !root._resumeSleepAfterCombat) clearCamp({ packUp: true });
                return result;
            }
            return startCampThenSleep(base.bind(this), args);
        };
        wrapped._campSystem = true;
        wrapped._baseToggleSleep = base;
        root.toggleSleep = wrapped;
        return true;
    }

    function labelSleepButton() {
        const btn = root.document?.getElementById('sleep-btn');
        if (!btn || root.isSleeping) return;
        btn.innerText = isIndoor() ? 'Sleep' : '⛺ Make Camp';
        btn.title = isIndoor()
            ? 'Sleep here.'
            : 'Choose a campsite, set up shelter and bedding, light a fire, remove armour, assign watch, then sleep.';
    }

    function installButtonWrapper() {
        if (typeof root.updateSleepButton !== 'function' || root.updateSleepButton._campSystem) return false;
        const base = root.updateSleepButton;
        const wrapped = function (...args) {
            const result = base.apply(this, args);
            labelSleepButton();
            return result;
        };
        wrapped._campSystem = true;
        wrapped._baseUpdateSleepButton = base;
        root.updateSleepButton = wrapped;
        labelSleepButton();
        return true;
    }

    function tick() {
        installToggleWrapper();
        installButtonWrapper();
        labelSleepButton();

        const sleeping = !!root.isSleeping;
        if (camp && sleeping) {
            for (const member of camp.members) member._campArmourRemoved = hasArmour(member) && !member.onGuard;
            renderPanel('sleeping');
        }

        if (camp && lastSleeping && !sleeping && !root._resumeSleepAfterCombat) {
            clearCamp({ packUp: true });
        }
        lastSleeping = sleeping;
    }

    function install() {
        if (installed) return;
        installed = true;
        root.campSystem = {
            build: BUILD,
            evaluateCampsite,
            buildPlan,
            relationshipScore,
            getCamp: () => camp,
            getSleepQuality: entity => {
                if (!camp) return null;
                const q = camp.qualities.find(x => x.entity === entity || x.entity?.name === entity?.name);
                return q ? { ...q, label: qualityLabel(q.score) } : null;
            },
            renderPanel,
            clearCamp,
            refreshHooks: tick,
        };
        tick();
        labelTimer = root.setInterval?.(tick, 500) || null;
    }

    if (root.document?.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { BUILD, evaluateCampsite, relationshipScore, qualityLabel, sleepHoursForQuality };
    }
})(typeof window !== 'undefined' ? window : globalThis);
