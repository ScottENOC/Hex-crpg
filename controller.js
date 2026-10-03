// controller.js
//
// Gamepad support (standard mapping). Two ways to drive movement:
//   'cursor' — left stick moves a virtual mouse cursor, A clicks whatever's
//              under it. Works with the existing click-driven UI as-is.
//   'move'   — left stick drives the current character directly in real
//              time, snapped to the 6 hex directions. Holding a direction
//              that sits exactly between two hex directions (e.g. "pure
//              right", which is between up-right and down-right) naturally
//              alternates between the two as the stick drifts slightly,
//              matching a hex grid's lack of a true cardinal direction.
//
// X opens a radial for the system menus (character/inventory/spells/world
// map/quest log/save/load). Y opens a radial built from whatever's
// currently in the action bar (#actions) — Wait/Stealth/Mount/Shove/etc. —
// so it never goes stale as those buttons change with context. A is a
// context action: attacks/talks directly if exactly one target is in
// range, otherwise opens a target list cycled with LB/RB. B backs out of
// whatever's open.
//
// Standard gamepad button indices: 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 9=Start.
// Axes 0/1 = left stick.

window.controllerMode = window.controllerMode || 'cursor';
const CONTROLLER_DEADZONE = 0.35;
const CONTROLLER_STICK_MOVE_DEADZONE = 0.5;
const CONTROLLER_MOVE_STEP_MS = 220; // how often 'move' mode advances one hex while held

let gpIndex = null;
let prevButtons = [];
let cursorX = window.innerWidth / 2;
let cursorY = window.innerHeight / 2;
let lastMoveStepAt = 0;
let aButtonDownAt = 0;
let radialEl = null;
let radialItems = null; // currently-open radial's items, for confirm/cancel
let targetListEl = null;
let targetListTargets = null;
let targetListIndex = 0;

window.addEventListener('gamepadconnected', (e) => {
    gpIndex = e.gamepad.index;
    ensureCursorEl();
    if (!window._controllerLoopRunning) {
        window._controllerLoopRunning = true;
        requestAnimationFrame(controllerLoop);
    }
    if (window.showMessage) window.showMessage(`Controller connected: ${e.gamepad.id}`);
});
window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index === gpIndex) gpIndex = null;
});

function ensureCursorEl() {
    if (document.getElementById('controller-cursor')) return;
    const el = document.createElement('div');
    el.id = 'controller-cursor';
    el.style.cssText = 'position:fixed;width:24px;height:24px;pointer-events:none;z-index:99999;'
        + 'border:2px solid #fff;border-radius:50%;background:rgba(255,255,255,0.15);'
        + 'box-shadow:0 0 4px #000;transform:translate(-50%,-50%);display:none;';
    document.body.appendChild(el);
}

function toggleControllerMode() {
    window.controllerMode = window.controllerMode === 'cursor' ? 'move' : 'cursor';
    const btn = document.getElementById('controller-mode-btn');
    if (btn) btn.innerText = `Controller: ${window.controllerMode === 'cursor' ? 'Cursor' : 'Character'} Mode`;
    const cursorEl = document.getElementById('controller-cursor');
    if (cursorEl) cursorEl.style.display = window.controllerMode === 'cursor' ? 'block' : 'none';
}
window.toggleControllerMode = toggleControllerMode;

function applyDeadzone(v, dz) {
    if (Math.abs(v) < dz) return 0;
    const sign = v > 0 ? 1 : -1;
    return sign * (Math.abs(v) - dz) / (1 - dz);
}

// The 6 hex directions, in the same order as getNeighbors (hexMap.js),
// paired with their on-screen angle (atan2 with screen-down-positive y) so
// a stick angle can snap to the nearest one.
const HEX_DIRECTIONS = [
    { q: 1, r: 0, angle: 30 },
    { q: 1, r: -1, angle: -30 },
    { q: 0, r: -1, angle: -90 },
    { q: -1, r: 0, angle: -150 },
    { q: -1, r: 1, angle: 150 },
    { q: 0, r: 1, angle: 90 },
];

function nearestHexDirection(dx, dy) {
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    let best = HEX_DIRECTIONS[0];
    let bestDiff = 999;
    for (const d of HEX_DIRECTIONS) {
        let diff = Math.abs(angle - d.angle);
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return best;
}

function getControlledEntity() {
    if (window.currentTurnEntity) return window.currentTurnEntity;
    if (window.player) {
        const byName = window.entities?.find(e => e.name === window.player.name);
        if (byName) return byName;
    }
    return window.entities?.find(e => e.side === 'player' && !e.rider) || null;
}
window.getControllerEntity = getControlledEntity;

function anyModalOpen() {
    const modals = document.querySelectorAll('.modal');
    for (const m of modals) if (m.style.display === 'block') return true;
    return !!radialEl || !!targetListEl;
}

function controllerLoop() {
    requestAnimationFrame(controllerLoop);
    if (gpIndex === null) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[gpIndex];
    if (!gp) return;

    const lx = applyDeadzone(gp.axes[0] || 0, CONTROLLER_DEADZONE);
    const ly = applyDeadzone(gp.axes[1] || 0, CONTROLLER_DEADZONE);
    const buttons = gp.buttons.map(b => b.pressed);
    const justPressed = (i) => buttons[i] && !prevButtons[i];

    // Radial menu / target list navigation takes over the stick and A/B
    // while open.
    if (radialEl) {
        handleRadialStick(lx, ly);
        if (justPressed(0)) confirmRadial();
        if (justPressed(1)) closeRadial();
        prevButtons = buttons;
        return;
    }
    if (targetListEl) {
        if (justPressed(4)) cycleTargetList(-1);
        if (justPressed(5)) cycleTargetList(1);
        if (justPressed(0)) confirmTargetList();
        if (justPressed(1)) closeTargetList();
        prevButtons = buttons;
        return;
    }

    if (justPressed(2)) openSystemRadial();
    if (justPressed(3)) openActionRadial();
    if (justPressed(1)) { /* B with nothing open: no-op for now */ }

    // A's behavior depends on mode: in cursor mode it's a plain click at the
    // cursor (works for modals, buttons, map hexes alike); in move mode
    // there's no cursor, so it's the attack/talk/target-cycle context action.
    if (window.controllerMode === 'cursor') {
        updateCursor(lx, ly);
        if (justPressed(0)) clickAtCursor();
    } else {
        if (justPressed(0)) aButtonDownAt = performance.now();
        const justReleased0 = !buttons[0] && prevButtons[0];
        if (justReleased0) {
            const held = performance.now() - (aButtonDownAt || performance.now());
            if (held > 500) {
                handleDoorHoldAction();
            } else {
                handleContextAction();
            }
        }
        if (!anyModalOpen()) updateCharacterMove(lx, ly);
    }

    prevButtons = buttons;
}

// Holding A near a door (instead of a quick tap) attacks it — the same
// alternate-action idea as right-click/long-press, just without a cursor
// position to build a lock/attack menu from, so it goes straight to attack.
function handleDoorHoldAction() {
    const entity = getControlledEntity();
    if (!entity) return;
    const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r).concat([entity.hex]);
    for (const n of neighbors) {
        const obj = window.tileObjects?.[`${n.q},${n.r}`];
        if (obj && (obj.type === 'door_open' || obj.type === 'door_closed') && window.attackDoor) {
            window.attackDoor(n.q, n.r, entity);
            return;
        }
    }
}

// ---------- Cursor mode ----------
function updateCursor(lx, ly) {
    const el = document.getElementById('controller-cursor');
    if (el) el.style.display = 'block';
    const speed = 14; // px per frame at full deflection
    cursorX = Math.max(0, Math.min(window.innerWidth, cursorX + lx * speed));
    cursorY = Math.max(0, Math.min(window.innerHeight, cursorY + ly * speed));
    if (el) { el.style.left = cursorX + 'px'; el.style.top = cursorY + 'px'; }
}

function clickAtCursor() {
    const target = document.elementFromPoint(cursorX, cursorY);
    if (!target) return;
    if (target === window.mapCanvas || window.mapCanvas?.contains(target)) {
        const evt = new MouseEvent('click', { clientX: cursorX, clientY: cursorY, bubbles: true });
        window.mapCanvas.dispatchEvent(evt);
    } else if (typeof target.click === 'function') {
        target.click();
    }
}

// ---------- Character-move mode ----------
function updateCharacterMove(lx, ly) {
    if (Math.hypot(lx, ly) < CONTROLLER_STICK_MOVE_DEADZONE) return;
    const now = performance.now();
    if (now - lastMoveStepAt < CONTROLLER_MOVE_STEP_MS) return;

    const entity = getControlledEntity();
    if (!entity || !entity.alive) return;
    if (window.isInCombat && window.currentTurnEntity !== entity) return;

    const dir = nearestHexDirection(lx, ly);
    const nextHex = { q: entity.hex.q + dir.q, r: entity.hex.r + dir.r };
    if (window.getTerrainAt(nextHex.q, nextHex.r).name === 'Wall') return;
    // Same convention as the rest of the movement code: only enemies block a hex.
    const occupant = window.getEntityAtHex(nextHex.q, nextHex.r);
    if (occupant && occupant.side !== entity.side) return;

    lastMoveStepAt = now;
    entity.destination = nextHex;
    if (window.isInCombat && window.gamePhase === 'PLAYER_TURN' && window.currentTurnEntity === entity) {
        setTimeout(() => window.autoMoveProcess(entity), 20);
    }
}

// ---------- Radial menus ----------
// Generic circular menu: items = [{label, action}]. Rendered as a ring of
// buttons around the screen center; the stick just highlights the nearest
// one, A confirms it, B cancels.
function buildRadialItems(items) {
    radialEl = document.createElement('div');
    radialEl.id = 'controller-radial';
    radialEl.style.cssText = 'position:fixed;inset:0;z-index:99998;pointer-events:none;';
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const radius = Math.min(220, window.innerWidth / 3);
    radialItems = items.map((item, i) => {
        const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const angleDeg = angle * 180 / Math.PI;
        const div = document.createElement('div');
        div.innerText = item.label;
        div.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);`
            + 'padding:10px 14px;border-radius:8px;background:rgba(30,30,30,0.9);color:#ccc;'
            + 'border:2px solid #555;font-size:0.95em;white-space:nowrap;';
        radialEl.appendChild(div);
        return { ...item, el: div, angle: angleDeg };
    });
    const center = document.createElement('div');
    center.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;transform:translate(-50%,-50%);`
        + 'width:16px;height:16px;border-radius:50%;background:#fff;opacity:0.6;';
    radialEl.appendChild(center);
    document.body.appendChild(radialEl);
    highlightNearestRadialItem(0, -1); // default highlight "up"
}

function highlightNearestRadialItem(lx, ly) {
    if (!radialItems || radialItems.length === 0) return;
    const angle = Math.atan2(ly, lx) * 180 / Math.PI;
    let best = radialItems[0], bestDiff = 999;
    radialItems.forEach(it => {
        let diff = Math.abs(angle - it.angle);
        if (diff > 180) diff = 360 - diff;
        if (diff < bestDiff) { bestDiff = diff; best = it; }
    });
    radialItems.forEach(it => {
        it.el.style.borderColor = it === best ? '#ffd700' : '#555';
        it.el.style.background = it === best ? 'rgba(80,60,0,0.9)' : 'rgba(30,30,30,0.9)';
    });
    radialEl._selected = best;
}

function handleRadialStick(lx, ly) {
    if (Math.hypot(lx, ly) < CONTROLLER_STICK_MOVE_DEADZONE) return;
    highlightNearestRadialItem(lx, ly);
}

function confirmRadial() {
    const selected = radialEl?._selected;
    closeRadial();
    if (selected && selected.action) selected.action();
}

function closeRadial() {
    if (radialEl) radialEl.remove();
    radialEl = null;
    radialItems = null;
}

function clickElId(id) {
    const el = document.getElementById(id);
    if (el) el.click();
}

function openSystemRadial() {
    if (radialEl) { closeRadial(); return; }
    buildRadialItems([
        { label: 'Character', action: () => clickElId('character-screen-btn') },
        { label: 'Spells', action: () => clickElId('spell-menu-btn') },
        { label: 'Inventory', action: () => clickElId('inventory-btn') },
        { label: 'World Map', action: () => clickElId('world-map-btn') },
        { label: 'Quest Log', action: () => clickElId('quest-log-btn') },
        { label: 'Quicksave', action: () => clickElId('quick-save-btn') },
        { label: 'Quickload', action: () => clickElId('quick-load-btn') },
    ]);
}

// Built from whatever's actually in the action bar right now (Wait,
// Stealth, Mount, Shove, Force-Attack, Parley, spell buttons, etc.) so it
// never drifts out of sync with what abilities are actually available.
function openActionRadial() {
    if (radialEl) { closeRadial(); return; }
    const actionsDiv = document.getElementById('actions');
    if (!actionsDiv) return;
    const buttons = Array.from(actionsDiv.querySelectorAll('button')).filter(b => b.offsetParent !== null);
    if (buttons.length === 0) { if (window.showMessage) window.showMessage('No actions available.'); return; }
    buildRadialItems(buttons.map(b => ({ label: b.innerText || '...', action: () => b.click() })));
}

// ---------- A context action: attack/talk, or target list ----------
function handleContextAction() {
    const entity = getControlledEntity();
    if (!entity) return;

    if (window.isInCombat) {
        if (window.gamePhase !== 'PLAYER_TURN' || window.currentTurnEntity !== entity) return;
        const attackHexes = (window.highlightedHexes || []).filter(h => h.type === 'attack');
        const targets = attackHexes
            .map(h => window.getEntityAtHex(h.q, h.r))
            .filter(t => t && t.side !== entity.side);
        if (targets.length === 1) {
            clickHex(targets[0].hex.q, targets[0].hex.r);
        } else if (targets.length > 1) {
            openTargetList(targets);
        } else if (window.showMessage) {
            window.showMessage('No targets in range.');
        }
        return;
    }

    // Out of combat: talk to / interact with the nearest adjacent NPC or
    // interactable, since there's no cursor position in move mode.
    const neighbors = window.getNeighbors(entity.hex.q, entity.hex.r);
    const nearbyNpc = window.entities.find(e => e.isNPC && neighbors.some(n => n.q === e.hex.q && n.r === e.hex.r));
    if (nearbyNpc) {
        clickHex(nearbyNpc.hex.q, nearbyNpc.hex.r);
        return;
    }
    const key = `${entity.hex.q},${entity.hex.r}`;
    for (const n of neighbors) {
        const obj = window.tileObjects?.[`${n.q},${n.r}`];
        if (obj && (obj.type === 'door_open' || obj.type === 'door_closed' || obj.type === 'journal')) {
            clickHex(n.q, n.r);
            return;
        }
    }
}

function clickHex(q, r) {
    const { x, y } = window.hexToPixel(q, r);
    const evt = new MouseEvent('click', { clientX: x, clientY: y, bubbles: true });
    window.mapCanvas.dispatchEvent(evt);
}

function openTargetList(targets) {
    targetListTargets = targets;
    targetListIndex = 0;
    targetListEl = document.createElement('div');
    targetListEl.id = 'controller-target-list';
    targetListEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);'
        + 'z-index:99998;background:rgba(20,20,20,0.95);border:2px solid #ffd700;border-radius:10px;'
        + 'padding:16px;color:#eee;font-size:1em;min-width:220px;';
    renderTargetList();
    document.body.appendChild(targetListEl);
}

function renderTargetList() {
    targetListEl.innerHTML = '<div style="margin-bottom:8px;color:#ffd700;">Select target (LB/RB, A confirm)</div>'
        + targetListTargets.map((t, i) =>
            `<div style="padding:4px 0;${i === targetListIndex ? 'color:#ffd700;font-weight:bold;' : 'color:#aaa;'}">${i === targetListIndex ? '> ' : '  '}${t.name} (${Math.ceil(t.hp)}/${t.maxHp} HP)</div>`
        ).join('');
}

function cycleTargetList(dir) {
    if (!targetListTargets || targetListTargets.length === 0) return;
    targetListIndex = (targetListIndex + dir + targetListTargets.length) % targetListTargets.length;
    renderTargetList();
}

function confirmTargetList() {
    const t = targetListTargets?.[targetListIndex];
    closeTargetList();
    if (t) clickHex(t.hex.q, t.hex.r);
}

function closeTargetList() {
    if (targetListEl) targetListEl.remove();
    targetListEl = null;
    targetListTargets = null;
}
