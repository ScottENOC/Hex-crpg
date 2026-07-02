// questLog.js
// Minimal quest log: window.questLog is a flat array of
// { id, title, giver, status, description }. No map markers or objective
// tracking yet beyond a status string — a foundation to build on, not a
// full quest system.

function renderQuestLog() {
    const listDiv = document.getElementById('quest-log-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    // Companion attitude meters (BG3-style approval) — shown above the quest
    // list itself, since it's a standing readout rather than a task.
    const attitudes = window.companionAttitude || {};
    const trackedNames = Object.keys(attitudes).filter(name => window.party && window.party.some(p => p.name === name));
    if (trackedNames.length > 0) {
        const attitudeDiv = document.createElement('div');
        attitudeDiv.style.marginBottom = '12px';
        trackedNames.forEach(name => {
            const value = Math.round(attitudes[name]);
            const row = document.createElement('div');
            row.style.marginBottom = '6px';
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:#fff; font-size:0.9em;">
                    <span>${name}</span><span>${value}/100</span>
                </div>
                <div style="background:#333; border-radius:3px; height:6px; overflow:hidden;">
                    <div style="width:${value}%; height:100%; background:${value >= 50 ? '#4caf50' : value >= 20 ? '#ffb300' : '#c62828'};"></div>
                </div>
            `;
            attitudeDiv.appendChild(row);
        });
        listDiv.appendChild(attitudeDiv);
    }

    const quests = window.questLog || [];
    if (quests.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.style.cssText = 'color: #888; text-align: center; padding: 20px;';
        emptyMsg.innerText = 'No quests yet. Talk to people around the village.';
        listDiv.appendChild(emptyMsg);
        return;
    }

    quests.forEach(q => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.marginBottom = '8px';
        div.style.borderRadius = '6px';
        div.style.background = 'rgba(255,255,255,0.05)';
        div.style.borderLeft = `4px solid ${q.status === 'completed' ? '#4caf50' : '#ffb300'}`;

        const statusLabel = q.status === 'completed' ? 'Completed' : 'Active';
        div.innerHTML = `
            <strong style="color:#fff;">${q.title}</strong>
            <span style="float:right; color:${q.status === 'completed' ? '#4caf50' : '#ffb300'}; font-size:0.85em;">${statusLabel}</span>
            <br><small style="color:#aaa;">From: ${q.giver}</small>
            <p style="margin: 6px 0 0 0; color:#ccc; font-size:0.9em;">${q.description}</p>
        `;
        listDiv.appendChild(div);
    });
}

window.renderQuestLog = renderQuestLog;
