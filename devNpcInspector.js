// devNpcInspector.js
// Developer-only runtime inspector for NPC/entity progression. Enable it from
// the Cheat dropdown, then long-press a character on touch devices (or
// right-click on desktop) to inspect the exact build that exists in memory.
(() => {
    'use strict';

    const STORAGE_KEY = 'hex_crpg_dev_npc_inspector';
    const HOLD_MS = 480; // deliberately earlier than Monster Manual's 560ms hold
    const MOVE_CANCEL_PX = 14;
    const MODAL_ID = 'dev-npc-inspector-modal';
    const BUTTON_ID = 'cheat-npc-inspector-btn';
    const BADGE_ID = 'dev-npc-inspector-badge';

    let enabled = false;
    let holdState = null;
    let suppressClickUntil = 0;
    let currentEntity = null;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    function titleCase(value) {
        return String(value || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\b\w/g, ch => ch.toUpperCase());
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function positivePools(attributes) {
        return Object.fromEntries(Object.entries(attributes || {})
            .filter(([, points]) => number(points) > 0)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    }

    function sumPositive(attributes) {
        return Object.values(attributes || {}).reduce((sum, points) => sum + Math.max(0, number(points)), 0);
    }

    function classSequence(entity) {
        if (Array.isArray(entity?.classLevelSequence)) return [...entity.classLevelSequence];
        if (Array.isArray(entity?.classLevels)) return [...entity.classLevels];
        if (entity?.classLevels && typeof entity.classLevels === 'object') {
            const result = [];
            Object.entries(entity.classLevels).forEach(([cls, count]) => {
                for (let i = 0; i < Math.max(0, Math.floor(number(count))); i++) result.push(cls);
            });
            return result;
        }
        return [];
    }

    function classCounts(sequence) {
        const counts = {};
        (sequence || []).forEach(cls => { counts[cls] = (counts[cls] || 0) + 1; });
        return counts;
    }

    function progressionMode(entity) {
        if (entity?.npcProgressionMode) return entity.npcProgressionMode;
        const levels = classSequence(entity);
        if (entity?.npcAuthoredProgression || levels.length) return 'authored/legacy';
        if (entity?.isNPC) return 'legacy/unclassified';
        return 'not class-based';
    }

    function equipmentRows(entity) {
        const slots = ['weapon', 'offhand', 'armor', 'helmet', 'shirt', 'pants', 'bra', 'underwear', 'clothes'];
        return slots
            .map(slot => {
                const itemId = entity?.equipped?.[slot];
                if (!itemId) return null;
                return {
                    slot,
                    itemId,
                    name: window.items?.[itemId]?.name || titleCase(itemId),
                    type: window.items?.[itemId]?.type || null,
                };
            })
            .filter(Boolean);
    }

    function skillRows(entity) {
        const innate = entity?.npcInnateSkills || {};
        return Object.entries(entity?.skills || {})
            .filter(([, rank]) => number(rank) > 0)
            .map(([id, rank]) => {
                const skill = window.skills?.[id];
                return {
                    id,
                    name: skill?.name || titleCase(id),
                    tree: skill?.tree || 'unknown',
                    rank: number(rank),
                    maxRanks: number(skill?.maxRanks),
                    innateRank: number(innate[id]),
                    active: !!skill?.active,
                    reaction: !!skill?.reaction,
                };
            })
            .sort((a, b) => a.tree.localeCompare(b.tree) || a.name.localeCompare(b.name));
    }

    function equipmentWarnings(entity) {
        return (entity?.npcEquipmentLegalityWarnings || []).map(warning => ({
            itemId: warning?.itemId || 'unknown',
            missing: [...(warning?.missing || [])],
        }));
    }

    function progressionWarnings(entity) {
        return (entity?.npcProgressionWarnings || []).map(warning => ({ ...warning }));
    }

    function describeEntity(entity) {
        if (!entity) return null;
        const sequence = classSequence(entity);
        const unspentByPool = positivePools(entity.attributes);
        const unspent = sumPositive(entity.attributes);
        const budget = Number.isFinite(Number(entity.npcSkillPointBudget))
            ? number(entity.npcSkillPointBudget)
            : (progressionMode(entity) === 'civilian' ? 0 : null);
        const allocated = budget == null ? null : Math.max(0, budget - unspent);
        const skills = skillRows(entity);
        const gear = equipmentRows(entity);
        const warnings = progressionWarnings(entity);
        const gearWarnings = equipmentWarnings(entity);

        return {
            id: entity.id ?? null,
            name: entity.name || 'Unnamed entity',
            title: entity.title || null,
            race: entity.race || null,
            gender: entity.gender || null,
            side: entity.side || null,
            alive: entity.alive !== false,
            isNPC: !!entity.isNPC,
            aiControlled: !!entity.aiControlled,
            aiState: entity.aiState || null,
            level: number(entity.level, sequence.length || 1),
            progressionMode: progressionMode(entity),
            authored: !!entity.npcAuthoredProgression,
            classPackage: entity.npcClassPackage?.id || null,
            classSequence: sequence,
            classCounts: classCounts(sequence),
            monsterType: entity.npcMonsterType || null,
            combatArchetype: entity.combatArchetype || null,
            budget,
            allocated,
            unspent,
            unspentByPool,
            preferredSkills: { ...(entity.npcPreferredSkills || {}) },
            legacySkillPointTarget: entity.npcLegacySkillPointTarget ?? null,
            innateSkills: { ...(entity.npcInnateSkills || {}) },
            skills,
            gear,
            inventory: [...(entity.inventory || [])],
            equipmentWarnings: gearWarnings,
            warnings,
            hp: number(entity.hp),
            maxHp: number(entity.maxHp),
            mana: number(entity.currentMana),
            maxMana: number(entity.maxMana),
            hex: entity.hex ? { q: entity.hex.q, r: entity.hex.r } : null,
        };
    }

    function warningText(report) {
        const lines = [];
        (report.equipmentWarnings || []).forEach(w => {
            lines.push(`Equipment: ${w.itemId} missing ${w.missing.join(', ') || 'requirement'}`);
        });
        (report.warnings || []).forEach(w => {
            if (w.type === 'unspent_skill_points') {
                lines.push(`Progression: ${w.points} unspent (${Object.entries(w.pools || {}).map(([k, v]) => `${k} ${v}`).join(', ')})`);
            } else {
                lines.push(`Progression: ${w.type || JSON.stringify(w)}`);
            }
        });
        return lines;
    }

    function formatReport(entityOrReport) {
        const report = entityOrReport?.skills && Array.isArray(entityOrReport.skills)
            ? entityOrReport
            : describeEntity(entityOrReport);
        if (!report) return 'No entity selected.';
        const classes = report.classSequence.length
            ? report.classSequence.map(titleCase).join(' → ')
            : 'None';
        const budget = report.budget == null
            ? 'n/a'
            : `${report.allocated}/${report.budget} allocated; ${report.unspent} unspent`;
        const gear = report.gear.length
            ? report.gear.map(g => `${titleCase(g.slot)}=${g.name}`).join(', ')
            : 'None';
        const skills = report.skills.length
            ? report.skills.map(s => `${s.name} ${s.rank}${s.innateRank ? ` [innate ${s.innateRank}]` : ''}`).join(', ')
            : 'None';
        const warnings = warningText(report);
        return [
            `${report.name}${report.title ? ` — ${report.title}` : ''}`,
            `Race: ${titleCase(report.race || 'unknown')} | Level: ${report.level} | Mode: ${report.progressionMode}`,
            `Classes: ${classes}`,
            `Package: ${report.classPackage || 'none'} | Monster type: ${report.monsterType || 'none'} | Archetype: ${report.combatArchetype || 'none'}`,
            `Skill budget: ${budget}`,
            `Unspent pools: ${Object.keys(report.unspentByPool).length ? Object.entries(report.unspentByPool).map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}`,
            `Gear: ${gear}`,
            `Skills: ${skills}`,
            `Warnings: ${warnings.length ? warnings.join(' | ') : 'none'}`,
            `Runtime: side=${report.side || 'none'}, ai=${report.aiState || 'none'}, hp=${report.hp}/${report.maxHp}, mana=${report.mana}/${report.maxMana}, hex=${report.hex ? `${report.hex.q},${report.hex.r}` : 'n/a'}`,
        ].join('\n');
    }

    function createInterface() {
        if (!document.getElementById(MODAL_ID)) {
            const modal = document.createElement('div');
            modal.id = MODAL_ID;
            modal.className = 'modal';
            modal.style.display = 'none';
            modal.innerHTML = `
                <div class="dev-npc-inspector-card">
                    <button type="button" class="dev-npc-close" aria-label="Close NPC inspector">×</button>
                    <div class="dev-npc-heading">
                        <div>
                            <div class="dev-npc-eyebrow">Developer · live entity</div>
                            <h2 id="dev-npc-inspector-name">NPC Inspector</h2>
                            <div id="dev-npc-inspector-subtitle" class="dev-npc-muted"></div>
                        </div>
                        <button type="button" id="dev-npc-copy-report">Copy report</button>
                    </div>
                    <div id="dev-npc-inspector-body"></div>
                </div>`;
            document.body.appendChild(modal);

            const style = document.createElement('style');
            style.textContent = `
                #${MODAL_ID}{z-index:1300;background:rgba(0,0,0,.72);padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);overflow:auto}
                .dev-npc-inspector-card{position:relative;width:min(760px,94vw);max-height:88vh;overflow:auto;margin:5vh auto;background:#171a1f;color:#eceff1;border:1px solid #56606b;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.55);padding:18px;box-sizing:border-box;font-family:Arial,sans-serif}
                .dev-npc-close{position:absolute;right:10px;top:8px;border:0;background:transparent;color:#fff;font-size:30px;line-height:1;padding:4px 8px;z-index:1}
                .dev-npc-heading{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding-right:30px;border-bottom:1px solid #39424c;padding-bottom:12px;margin-bottom:12px}
                .dev-npc-heading h2{margin:2px 0 3px;font-size:1.35rem}.dev-npc-eyebrow{text-transform:uppercase;letter-spacing:.1em;color:#90a4ae;font-size:.7rem}.dev-npc-muted{color:#aab4bd;font-size:.85rem}
                #dev-npc-copy-report{width:auto;white-space:nowrap;background:#455a64;color:#fff;border:1px solid #607d8b;border-radius:6px;padding:8px 10px}
                .dev-npc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dev-npc-section{background:#20252b;border:1px solid #343d46;border-radius:8px;padding:10px;min-width:0}.dev-npc-section.full{grid-column:1/-1}.dev-npc-section h3{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;color:#90caf9;margin:0 0 8px}.dev-npc-kv{display:grid;grid-template-columns:minmax(90px,.8fr) minmax(0,1.7fr);gap:5px 9px;font-size:.84rem}.dev-npc-kv b{color:#b0bec5;font-weight:600}.dev-npc-kv span{overflow-wrap:anywhere}.dev-npc-ok{color:#81c784}.dev-npc-bad{color:#ef9a9a;font-weight:700}.dev-npc-warn{background:#38282a;border-color:#75484c}.dev-npc-chip{display:inline-block;margin:2px 4px 2px 0;padding:3px 6px;border-radius:999px;background:#303842;border:1px solid #47525e;font-size:.77rem}.dev-npc-skill-table{width:100%;border-collapse:collapse;font-size:.8rem}.dev-npc-skill-table th,.dev-npc-skill-table td{text-align:left;border-bottom:1px solid #343d46;padding:5px 4px;vertical-align:top}.dev-npc-skill-table th{color:#b0bec5;font-weight:600}.dev-npc-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.76rem;color:#cfd8dc;overflow-wrap:anywhere}
                #${BADGE_ID}{position:fixed;right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));z-index:1080;background:#5d4037;color:#fff;border:1px solid #a1887f;border-radius:999px;padding:6px 9px;font:700 11px Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:none}
                @media(max-width:620px){.dev-npc-inspector-card{width:96vw;margin:2vh auto;max-height:94vh;padding:14px}.dev-npc-grid{grid-template-columns:1fr}.dev-npc-section.full{grid-column:auto}.dev-npc-heading{display:block}.dev-npc-heading #dev-npc-copy-report{margin-top:9px}.dev-npc-kv{grid-template-columns:105px minmax(0,1fr)}}`;
            document.head.appendChild(style);

            modal.querySelector('.dev-npc-close').addEventListener('click', close);
            modal.addEventListener('click', event => { if (event.target === modal) close(); });
            modal.querySelector('#dev-npc-copy-report').addEventListener('click', copyCurrentReport);
        }

        if (!document.getElementById(BADGE_ID)) {
            const badge = document.createElement('div');
            badge.id = BADGE_ID;
            badge.textContent = 'NPC INSPECTOR · long-press';
            badge.style.display = 'none';
            document.body.appendChild(badge);
        }
        installToggleButton();
        refreshToggleUi();
    }

    function installToggleButton() {
        if (document.getElementById(BUTTON_ID)) return;
        const cheatButton = Array.from(document.querySelectorAll('.dropbtn')).find(btn => btn.textContent.trim() === 'Cheat');
        const menu = cheatButton?.nextElementSibling;
        if (!menu) return;
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.style.cssText = 'background-color:#5d4037;font-size:.7em;color:white;';
        button.addEventListener('click', event => {
            event.preventDefault();
            toggle();
        });
        button.addEventListener('touchend', event => {
            event.preventDefault();
            event.stopPropagation();
            toggle();
        }, { passive: false });
        menu.insertBefore(button, menu.firstChild);
    }

    function refreshToggleUi() {
        const button = document.getElementById(BUTTON_ID);
        if (button) {
            button.textContent = `Dev: NPC Inspector ${enabled ? 'ON' : 'OFF'}`;
            button.style.backgroundColor = enabled ? '#2e7d32' : '#5d4037';
        }
        const badge = document.getElementById(BADGE_ID);
        if (badge) badge.style.display = enabled ? 'block' : 'none';
    }

    function setEnabled(value) {
        enabled = !!value;
        try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (_) {}
        cancelHold();
        refreshToggleUi();
        return enabled;
    }

    function toggle() {
        return setEnabled(!enabled);
    }

    function close() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.style.display = 'none';
        currentEntity = null;
    }

    function render(entity) {
        const report = describeEntity(entity);
        if (!report) return;
        const modal = document.getElementById(MODAL_ID);
        const name = document.getElementById('dev-npc-inspector-name');
        const subtitle = document.getElementById('dev-npc-inspector-subtitle');
        const body = document.getElementById('dev-npc-inspector-body');
        if (!modal || !name || !subtitle || !body) return;

        name.textContent = report.name;
        subtitle.textContent = [report.title, report.race && titleCase(report.race), report.side && `side: ${report.side}`].filter(Boolean).join(' · ');
        const classText = report.classSequence.length ? report.classSequence.map(titleCase).join(' → ') : 'None';
        const countText = Object.entries(report.classCounts).length
            ? Object.entries(report.classCounts).map(([cls, count]) => `${titleCase(cls)} ${count}`).join(', ')
            : 'None';
        const budgetText = report.budget == null ? 'Not tracked' : `${report.allocated} / ${report.budget}`;
        const budgetClass = report.unspent === 0 ? 'dev-npc-ok' : 'dev-npc-bad';
        const warnings = warningText(report);
        const preferred = Object.entries(report.preferredSkills || {}).sort((a, b) => number(b[1]) - number(a[1]));

        body.innerHTML = `<div class="dev-npc-grid">
            <section class="dev-npc-section">
                <h3>Identity</h3>
                <div class="dev-npc-kv">
                    <b>Mode</b><span>${escapeHtml(report.progressionMode)}${report.authored ? ' · deterministic' : ''}</span>
                    <b>Race</b><span>${escapeHtml(titleCase(report.race || 'unknown'))}${report.gender ? ` · ${escapeHtml(titleCase(report.gender))}` : ''}</span>
                    <b>Level</b><span>${report.level}</span>
                    <b>Classes</b><span>${escapeHtml(classText)}</span>
                    <b>Counts</b><span>${escapeHtml(countText)}</span>
                    <b>Package</b><span>${escapeHtml(report.classPackage || 'none')}</span>
                    <b>Monster type</b><span>${escapeHtml(report.monsterType || 'none')}</span>
                    <b>Archetype</b><span>${escapeHtml(report.combatArchetype || 'none')}</span>
                </div>
            </section>
            <section class="dev-npc-section ${report.unspent ? 'dev-npc-warn' : ''}">
                <h3>Point budget</h3>
                <div class="dev-npc-kv">
                    <b>Allocated</b><span class="${budgetClass}">${escapeHtml(budgetText)}</span>
                    <b>Unspent</b><span class="${budgetClass}">${report.unspent}</span>
                    <b>Unspent pools</b><span>${Object.keys(report.unspentByPool).length ? Object.entries(report.unspentByPool).map(([k,v]) => `${escapeHtml(k)}=${v}`).join(', ') : '<span class="dev-npc-ok">none</span>'}</span>
                    <b>Legacy target</b><span>${report.legacySkillPointTarget ?? 'n/a'}</span>
                </div>
                ${preferred.length ? `<div style="margin-top:8px"><div class="dev-npc-muted">Preferred / authored targets</div>${preferred.map(([id, rank]) => `<span class="dev-npc-chip">${escapeHtml(titleCase(id))} ${rank}</span>`).join('')}</div>` : ''}
            </section>
            <section class="dev-npc-section">
                <h3>Equipment</h3>
                ${report.gear.length ? `<div class="dev-npc-kv">${report.gear.map(g => `<b>${escapeHtml(titleCase(g.slot))}</b><span>${escapeHtml(g.name)} <span class="dev-npc-muted">(${escapeHtml(g.itemId)})</span></span>`).join('')}</div>` : '<div class="dev-npc-muted">Nothing equipped.</div>'}
                <div style="margin-top:8px" class="${report.equipmentWarnings.length ? 'dev-npc-bad' : 'dev-npc-ok'}">${report.equipmentWarnings.length ? `${report.equipmentWarnings.length} legality warning(s)` : 'Equipment legal'}</div>
            </section>
            <section class="dev-npc-section ${warnings.length ? 'dev-npc-warn' : ''}">
                <h3>Runtime</h3>
                <div class="dev-npc-kv">
                    <b>Side / AI</b><span>${escapeHtml(report.side || 'none')} · ${escapeHtml(report.aiState || (report.aiControlled ? 'AI controlled' : 'none'))}</span>
                    <b>HP</b><span>${report.hp} / ${report.maxHp}</span>
                    <b>Mana</b><span>${report.mana} / ${report.maxMana}</span>
                    <b>Hex</b><span>${report.hex ? `${report.hex.q}, ${report.hex.r}` : 'n/a'}</span>
                    <b>Warnings</b><span class="${warnings.length ? 'dev-npc-bad' : 'dev-npc-ok'}">${warnings.length ? escapeHtml(warnings.join(' | ')) : 'none'}</span>
                </div>
            </section>
            <section class="dev-npc-section full">
                <h3>Learned skills (${report.skills.length})</h3>
                ${report.skills.length ? `<table class="dev-npc-skill-table"><thead><tr><th>Skill</th><th>Tree</th><th>Rank</th><th>Flags</th></tr></thead><tbody>${report.skills.map(skill => `<tr><td>${escapeHtml(skill.name)}<div class="dev-npc-code">${escapeHtml(skill.id)}</div></td><td>${escapeHtml(titleCase(skill.tree))}</td><td>${skill.rank}${skill.maxRanks > 0 ? ` / ${skill.maxRanks}` : ''}</td><td>${[skill.innateRank ? `innate ${skill.innateRank}` : '', skill.active ? 'active' : '', skill.reaction ? 'reaction' : ''].filter(Boolean).map(flag => `<span class="dev-npc-chip">${escapeHtml(flag)}</span>`).join('') || '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="dev-npc-muted">No learned skills.</div>'}
            </section>
        </div>`;
        modal.style.display = 'block';
    }

    function openForEntity(entity) {
        if (!entity) return false;
        currentEntity = entity;
        render(entity);
        return true;
    }

    function entityAtClientPoint(clientX, clientY) {
        if (!window.screenToHex || !Array.isArray(window.entities)) return null;
        const hex = window.screenToHex({ x: clientX, y: clientY });
        const matches = window.entities.filter(entity => {
            if (!entity || entity.alive === false) return false;
            if (typeof entity.getAllHexes === 'function') {
                return entity.getAllHexes().some(h => h.q === hex.q && h.r === hex.r);
            }
            return entity.hex?.q === hex.q && entity.hex?.r === hex.r;
        });
        if (!matches.length) return null;
        return matches.find(e => !e.rider && (e.npcProgressionMode || e.race || e.isNPC)) || matches[0];
    }

    function cancelHold() {
        if (!holdState) return;
        clearTimeout(holdState.timer);
        holdState = null;
    }

    function installMapGestures() {
        const canvas = document.getElementById('mapCanvas');
        if (!canvas || canvas.dataset.devNpcInspector === 'true') return;
        canvas.dataset.devNpcInspector = 'true';

        window.addEventListener('touchstart', event => {
            if (!enabled || event.touches.length !== 1 || event.target !== canvas) return;
            const touch = event.touches[0];
            const entity = entityAtClientPoint(touch.clientX, touch.clientY);
            if (!entity) return;
            cancelHold();
            holdState = {
                entity,
                startX: touch.clientX,
                startY: touch.clientY,
                timer: setTimeout(() => {
                    const selected = holdState?.entity;
                    holdState = null;
                    if (!selected || !enabled) return;
                    suppressClickUntil = Date.now() + 800;
                    // Other long-press systems (Monster Manual, doors) listen for
                    // touchcancel and will clear their later timers. This inspector
                    // fires at 480ms specifically so it owns the gesture while ON.
                    canvas.dispatchEvent(new Event('touchcancel', { bubbles: false, cancelable: false }));
                    openForEntity(selected);
                }, HOLD_MS),
            };
        }, { capture: true, passive: true });

        window.addEventListener('touchmove', event => {
            if (!holdState || event.touches.length !== 1) return;
            const touch = event.touches[0];
            if (Math.hypot(touch.clientX - holdState.startX, touch.clientY - holdState.startY) > MOVE_CANCEL_PX) cancelHold();
        }, { capture: true, passive: true });
        window.addEventListener('touchend', cancelHold, { capture: true, passive: true });
        window.addEventListener('touchcancel', cancelHold, { capture: true, passive: true });

        window.addEventListener('click', event => {
            if (Date.now() >= suppressClickUntil || event.target !== canvas) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        window.addEventListener('contextmenu', event => {
            if (!enabled || event.target !== canvas) return;
            const entity = entityAtClientPoint(event.clientX, event.clientY);
            if (!entity) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openForEntity(entity);
        }, true);
    }

    async function copyCurrentReport() {
        if (!currentEntity) return;
        const text = formatReport(currentEntity);
        const button = document.getElementById('dev-npc-copy-report');
        try {
            await navigator.clipboard.writeText(text);
            if (button) button.textContent = 'Copied';
        } catch (_) {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            try { document.execCommand('copy'); } catch (_) {}
            area.remove();
            if (button) button.textContent = 'Copied';
        }
        setTimeout(() => { if (button) button.textContent = 'Copy report'; }, 1200);
    }

    function initialise() {
        try { enabled = localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { enabled = false; }
        createInterface();
        installMapGestures();
        // If the top menu is created/restored later, one cheap retry is enough.
        if (!document.getElementById(BUTTON_ID)) setTimeout(installToggleButton, 500);
    }

    window.devNpcInspector = {
        get enabled() { return enabled; },
        setEnabled,
        toggle,
        describeEntity,
        formatReport,
        openForEntity,
        close,
        render: () => { if (currentEntity) render(currentEntity); },
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
    else initialise();
})();