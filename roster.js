// roster.js
// Party roster cap: only the main character plus 5 others (6 total) can be
// "active" (a real entity in window.entities, controllable, participates in
// combat) at once. Anyone else recruited/hired is held in
// window.benchedCompanions as plain character data — no entity, invisible,
// safe — until swapped in via the Roster UI. Swapping is only ever offered
// out of combat (see the roster-btn handler in main.js).

window.MAX_ACTIVE_PARTY = 6;
if (!window.benchedCompanions) window.benchedCompanions = [];

// Adds a newly-recruited companion (plain character data, same shape as
// window.party entries) to the active party if there's room, or to the
// bench otherwise. Returns 'active' or 'benched'.
function addCompanionToRoster(companionData) {
    if (window.party.length < window.MAX_ACTIVE_PARTY) {
        window.party.push(companionData);
        if (window.wireSharedInventory) window.wireSharedInventory(companionData);
        const near = window.player?.hex || window.entities.find(e => e.side === 'player')?.hex || { q: 0, r: 0 };
        const spawnHex = (window.getNeighbors(near.q, near.r).find(h => !window.getEntityAtHex(h.q, h.r) && window.getTerrainAt(h.q, h.r).name !== 'Wall' && window.getTerrainAt(h.q, h.r).name !== 'Water')) || near;
        const ent = new window.Entity(companionData.name, 'red', spawnHex, (companionData.attributes?.agility || 10) + 10);
        ent.side = 'player';
        Object.assign(ent, companionData);
        ent.hex = spawnHex;
        ent.visualQ = spawnHex.q; ent.visualR = spawnHex.r;
        ent.startQ = spawnHex.q; ent.startR = spawnHex.r;
        ent.destination = null;
        ent.moveCooldown = 0;
        window.entities.push(ent);
        if (window.updatePartyTabs) window.updatePartyTabs();
        return 'active';
    }
    window.benchedCompanions.push(companionData);
    return 'benched';
}
window.addCompanionToRoster = addCompanionToRoster;

// Moves an active party member (never the main character, party[0]) to the
// bench: removes their entity from window.entities, keeps their character
// data in benchedCompanions. Out-of-combat only — callers must check
// window.isInCombat first (see roster-btn / renderRoster).
function benchPartyMember(name) {
    if (window.party[0] && window.party[0].name === name) {
        window.showMessage("Your main character can't be benched.");
        return false;
    }
    const idx = window.party.findIndex(p => p.name === name);
    if (idx === -1) return false;
    const [companionData] = window.party.splice(idx, 1);
    const entIdx = window.entities.findIndex(e => e.name === name && e.side === 'player');
    if (entIdx !== -1) {
        const wasSelected = window.player && window.player.name === name;
        window.entities.splice(entIdx, 1);
        if (wasSelected && window.selectCharacterByName && window.party[0]) {
            window.selectCharacterByName(window.party[0].name);
        }
    }
    window.benchedCompanions.push(companionData);
    if (window.updatePartyTabs) window.updatePartyTabs();
    window.showMessage(`${name} waits safely, off the field.`);
    return true;
}
window.benchPartyMember = benchPartyMember;

// Brings a benched companion back into the active party (if there's room),
// spawning them adjacent to the current player. Out-of-combat only.
function activatePartyMember(name) {
    if (window.party.length >= window.MAX_ACTIVE_PARTY) {
        window.showMessage(`Only ${window.MAX_ACTIVE_PARTY} can be active at once — bench someone first.`);
        return false;
    }
    const idx = window.benchedCompanions.findIndex(p => p.name === name);
    if (idx === -1) return false;
    const [companionData] = window.benchedCompanions.splice(idx, 1);
    addCompanionToRoster(companionData);
    window.showMessage(`${name} rejoins the party.`);
    return true;
}
window.activatePartyMember = activatePartyMember;

function renderRoster() {
    const activeDiv = document.getElementById('roster-active-list');
    const benchedDiv = document.getElementById('roster-benched-list');
    if (!activeDiv || !benchedDiv) return;

    activeDiv.innerHTML = '';
    (window.party || []).forEach((p, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; margin-bottom:4px; background:rgba(255,255,255,0.05); border-radius:4px;';
        const label = document.createElement('span');
        label.style.color = '#fff';
        label.innerText = i === 0 ? `${p.name} (Main Character)` : p.name;
        row.appendChild(label);
        if (i !== 0) {
            const btn = document.createElement('button');
            btn.innerText = 'Bench';
            btn.onclick = () => { window.benchPartyMember(p.name); window.renderRoster(); };
            row.appendChild(btn);
        }
        activeDiv.appendChild(row);
    });

    benchedDiv.innerHTML = '';
    if ((window.benchedCompanions || []).length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'color:#888; text-align:center;';
        empty.innerText = 'No one waiting.';
        benchedDiv.appendChild(empty);
    }
    (window.benchedCompanions || []).forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:6px; margin-bottom:4px; background:rgba(255,255,255,0.05); border-radius:4px;';
        const label = document.createElement('span');
        label.style.color = '#fff';
        label.innerText = p.name;
        row.appendChild(label);
        const btn = document.createElement('button');
        btn.innerText = 'Activate';
        btn.disabled = window.party.length >= window.MAX_ACTIVE_PARTY;
        btn.onclick = () => { window.activatePartyMember(p.name); window.renderRoster(); };
        row.appendChild(btn);
        benchedDiv.appendChild(row);
    });
}
window.renderRoster = renderRoster;
