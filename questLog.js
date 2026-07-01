// questLog.js
// Minimal quest log: window.questLog is a flat array of
// { id, title, giver, status, description }. No map markers or objective
// tracking yet beyond a status string — a foundation to build on, not a
// full quest system.

function renderQuestLog() {
    const listDiv = document.getElementById('quest-log-list');
    if (!listDiv) return;
    listDiv.innerHTML = '';

    const quests = window.questLog || [];
    if (quests.length === 0) {
        listDiv.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">No quests yet. Talk to people around the village.</p>';
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
