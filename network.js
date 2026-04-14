// network.js
// If on GitHub Pages, connect to the hosted backend. Otherwise, connect to current origin.
const backendUrl = window.location.hostname === 'scottenoc.github.io' 
    ? 'https://your-rpg-backend.onrender.com' // Replace with your actual hosted backend URL
    : window.location.origin;

const socket = io(backendUrl);

window.multiplayer = {
    roomCode: null,
    isHost: false,
    players: {},
    socket: socket,
    availableSavedCharacters: [],
    gameState: {}
};

socket.on('connect', () => {
    document.getElementById('multiplayer-status').innerText = 'Status: Online';
    document.getElementById('multiplayer-status').style.color = '#27ae60';
});

socket.on('roomCreated', ({ roomCode, players }) => {
    window.multiplayer.roomCode = roomCode;
    window.multiplayer.isHost = true;
    window.multiplayer.players = players;
    window.multiplayer.gameState = { started: false };
    
    // If we hosted from within a game, set networkId on our local entity
    if (document.getElementById('gameContainer').style.display === 'flex') {
        window.multiplayer.gameState.started = true;
        if (window.party && window.party[0]) {
            const myName = window.party[0].name;
            const localEnt = window.entities.find(e => e.name === myName);
            if (localEnt) localEnt.networkId = socket.id;
        }
        setTimeout(() => window.broadcastFullState(), 500);
    }
    
    updateMultiplayerUI();
});

socket.on('roomJoined', ({ roomCode, players, gameState, savedCharacters }) => {
    window.multiplayer.roomCode = roomCode;
    window.multiplayer.isHost = false;
    window.multiplayer.players = players;
    window.multiplayer.gameState = gameState;
    window.multiplayer.availableSavedCharacters = savedCharacters || [];

    if (gameState.worldSeconds) window.worldSeconds = gameState.worldSeconds;
    if (gameState.overrideTerrain) window.overrideTerrain = gameState.overrideTerrain;
    if (gameState.tileObjects) window.tileObjects = gameState.tileObjects;
    if (gameState.isInArena !== undefined) window.isInArena = gameState.isInArena;
    
    updateMultiplayerUI();

    // AUTOMATIC JUMP-IN: If game already started AND no characters to claim, launch into world
    if (gameState.started && window.multiplayer.availableSavedCharacters.length === 0) {
        console.log("Room already started, jumping in...");
        window.initializeMultiplayerGame(players);
    } else if (gameState.started && window.multiplayer.availableSavedCharacters.length > 0) {
        window.showMessage("Game is in progress! Choose a character below to resume, or click Join Game with your new character.");
    }
});

socket.on('playerJoined', ({ id, characterData }) => {
    window.multiplayer.players[id] = characterData;
    window.showMessage(`${characterData.name} joined the room!`);
    updateMultiplayerUI();

    if (document.getElementById('gameContainer').style.display === 'flex') {
        syncRemotePlayerEntity(id, characterData);
        // Host should re-broadcast state to the new joiner
        if (window.multiplayer.isHost) window.broadcastFullState();
    }
});

socket.on('gameStarted', ({ players }) => {
    window.multiplayer.players = players;
    window.initializeMultiplayerGame(players);
});

socket.on('syncFullState', ({ players, gameState, entities, mapItems, worldSeconds, overrideTerrain, tileObjects, isInArena }) => {
    console.log("Full State Sync Received...");
    window.multiplayer.players = players;
    window.worldSeconds = worldSeconds;
    window.mapItems = mapItems;
    
    if (overrideTerrain) window.overrideTerrain = overrideTerrain;
    if (tileObjects) window.tileObjects = tileObjects;
    if (isInArena !== undefined) window.isInArena = isInArena;

    window.entities = [];
    entities.forEach(data => {
        let ent;
        if (data.isEnemy) ent = new window.Enemy(data.name, data.color, data.hex, data.initiative);
        else ent = new window.Entity(data.name, data.color, data.hex, data.initiative);
        Object.assign(ent, data);
        window.entities.push(ent);
        
        // Re-link local player reference
        if (ent.networkId === socket.id) {
            window.player = ent;
            if (window.party) {
                const pIdx = window.party.findIndex(p => p.name === ent.name);
                if (pIdx > -1) window.party[pIdx] = ent;
                else window.party.push(ent);
            }
        }
    });

    if (document.getElementById('gameContainer').style.display !== 'flex') {
        // Only auto-initialize if we aren't already in the world
        // If we ARE in the lobby and there are saved characters, we wait for a claim or manual join
        if (window.multiplayer.availableSavedCharacters.length === 0) {
            window.initializeMultiplayerGame(players);
        }
    } else {
        window.drawMap();
        window.renderEntities();
        if (window.player && window.centerCameraOn) window.centerCameraOn(window.player.hex);
    }
});

socket.on('playerLeft', (id) => {
    const data = window.multiplayer.players[id];
    if (data) {
        window.showMessage(`${data.name} left the room.`);
        const ent = window.entities.find(e => e.networkId === id);
        if (ent) {
            delete ent.networkId; 
            ent.isRemote = false;
        }
    }
    delete window.multiplayer.players[id];
    updateMultiplayerUI();
});

socket.on('playerMoved', ({ id, hex, destination }) => {
    const entity = window.entities.find(e => e.networkId === id);
    if (entity) {
        if (hex) entity.hex = { ...hex };
        if (destination !== undefined) entity.destination = destination;
    }
});

socket.on('error', (msg) => {
    alert(msg);
});

function updateMultiplayerUI() {
    const controls = document.getElementById('multiplayer-controls');
    const info = document.getElementById('room-info');
    const codeSpan = document.getElementById('current-room-code');
    const playerList = document.getElementById('player-list');
    const startBtn = document.getElementById('start-multiplayer-btn');
    
    const ingameCodeInfo = document.getElementById('multiplayer-room-info-ingame');
    const ingameCodeSpan = document.getElementById('ingame-room-code');
    const ingamePlayerList = document.getElementById('ingame-player-list');

    if (window.multiplayer.roomCode) {
        if (controls) controls.style.display = 'none';
        if (info) info.style.display = 'block';
        if (codeSpan) codeSpan.innerText = window.multiplayer.roomCode;
        
        if (ingameCodeInfo) ingameCodeInfo.style.display = 'block';
        if (ingameCodeSpan) ingameCodeSpan.innerText = window.multiplayer.roomCode;
        
        const names = Object.values(window.multiplayer.players).map(p => p.name).join(', ');
        
        let claimHTML = "";
        if (window.multiplayer.availableSavedCharacters.length > 0 && !window.multiplayer.isHost) {
            claimHTML = "<div style='margin-top:10px; border-top:1px solid #444; padding-top:5px;'>Resume Character:<br>";
            window.multiplayer.availableSavedCharacters.forEach(name => {
                claimHTML += `<button onclick="window.claimCharacter('${name}')" style="font-size:0.7em; margin:2px; padding:2px 5px; background:#8e44ad; color:white; border:none; border-radius:3px; cursor:pointer;">${name}</button>`;
            });
            claimHTML += "</div>";
        }

        if (playerList) playerList.innerHTML = `Players: ${names}${claimHTML}`;
        if (ingamePlayerList) ingamePlayerList.innerText = `Players: ${Object.keys(window.multiplayer.players).length}`;
        
        if (startBtn) {
            if (window.multiplayer.isHost) {
                startBtn.style.display = 'block';
                startBtn.innerText = "Start Multiplayer Game";
            } else if (window.multiplayer.gameState && window.multiplayer.gameState.started) {
                startBtn.style.display = 'block';
                startBtn.innerText = "Join Game (New Character)";
            } else {
                startBtn.style.display = 'none';
            }
        }
    } else {
        if (controls) controls.style.display = 'block';
        if (info) info.style.display = 'none';
        if (ingameCodeInfo) ingameCodeInfo.style.display = 'none';
    }
}

window.claimCharacter = (name) => {
    socket.emit('claimCharacter', { roomCode: window.multiplayer.roomCode, name: name });
};

socket.on('characterClaimed', ({ id, name }) => {
    if (id === socket.id) {
        window.showMessage(`You have claimed ${name}!`);
        if (window.multiplayer.players[socket.id]) window.multiplayer.players[socket.id].name = name;

        if (document.getElementById('gameContainer').style.display === 'flex') {
            const ent = window.entities.find(e => e.name === name);
            if (ent) ent.networkId = socket.id;
        } else {
            // If in lobby, start the game with the claimed name
            window.initializeMultiplayerGame(window.multiplayer.players);
        }
    }
    window.multiplayer.availableSavedCharacters = window.multiplayer.availableSavedCharacters.filter(n => n !== name);
    updateMultiplayerUI();
});

function syncRemotePlayerEntity(socketId, data) {
    if (socketId === socket.id) return;
    
    const existing = window.entities.find(e => e.name === data.name);
    if (existing) {
        existing.networkId = socketId;
        existing.isRemote = true;
        if (data.hex) existing.hex = { ...data.hex };
        return;
    }

    if (window.entities.some(e => e.networkId === socketId)) {
        const ent = window.entities.find(e => e.networkId === socketId);
        if (data.hex) ent.hex = { ...data.hex };
        return;
    }

    const spawnHex = data.hex || { q: 0, r: 0 };
    const remoteEntity = new window.Entity(data.name || "Unknown", data.color || "blue", spawnHex, (data.attributes?.agility || 10) + 10);
    remoteEntity.side = 'player';
    remoteEntity.networkId = socketId;
    Object.assign(remoteEntity, data);
    remoteEntity.isRemote = true; 
    
    window.entities.push(remoteEntity);
    window.renderEntities();
}

window.initializeMultiplayerGame = (players) => {
    const myData = players[socket.id];
    
    if (document.getElementById('gameContainer').style.display !== 'flex') {
        const race = document.getElementById('race-select').value;
        const cls = document.getElementById('class-select').value;
        const gender = document.getElementById('gender-select').value;
        const campaign = document.getElementById('campaign-select').value;
        const voice = document.getElementById('voice-select').value;
        
        const name = myData ? myData.name : (document.getElementById('character-name').value || "Hero");
        
        // Use existing entity data if available (for claimed/resumed characters)
        // Ensure we don't grab an entity that already belongs to someone else
        const existingEnt = window.entities.find(e => e.name === name && (!e.networkId || e.networkId === socket.id));
        
        if (existingEnt) {
            console.log("Resuming existing entity:", name);
            window.party = [ existingEnt ];
            window.player = existingEnt;
            existingEnt.networkId = socket.id; // Ensure it's set
        } else {
            window.initializePlayer(race, cls, gender, campaign, voice);
            window.party[0].name = name;
            window.player = window.party[0];
        }
        
        document.getElementById("characterCreator").style.display = "none";
        document.getElementById("gameContainer").style.display = "flex";
        document.getElementById("top-menu").style.display = "flex";
        
        window.startGameCore();
        
        const localEnt = window.entities.find(e => e.name === name && (!e.networkId || e.networkId === socket.id));
        if (localEnt) {
            localEnt.networkId = socket.id;
            if (myData && myData.hex) localEnt.hex = { ...myData.hex };
            if (window.snapVisuals) window.snapVisuals();
        }
    }

    for (const id in players) {
        syncRemotePlayerEntity(id, players[id]);
    }
};

function getReadyCharacterData() {
    const race = document.getElementById('race-select').value;
    const gender = document.getElementById('gender-select').value;
    const cls = document.getElementById('class-select').value;
    const voice = document.getElementById('voice-select').value;
    
    let charName = document.getElementById('character-name').value;
    if (!charName && window.generateName) {
        charName = window.generateName(race, gender);
    }
    
    if (!charName) charName = "Hero " + socket.id.substring(0,3);
    document.getElementById('character-name').value = charName;
    
    return window.createCharacterData(race, cls, charName, gender, voice);
}

window.createRoom = () => {
    const isStarted = document.getElementById('gameContainer').style.display === 'flex';
    
    let characterData;
    if (isStarted && window.party && window.party[0]) {
        characterData = { ...window.party[0] };
    } else {
        characterData = getReadyCharacterData();
    }

    // Saved characters are player entities that are NOT the host and have NO networkId
    const savedChars = window.entities ? window.entities.filter(e => e.side === 'player' && e.name !== characterData.name && !e.networkId).map(e => e.name) : [];
    
    socket.emit('createRoom', { 
        characterData: characterData,
        savedCharacters: savedChars,
        isAlreadyStarted: isStarted
    });
};

window.joinRoom = () => {
    const roomCode = document.getElementById('room-code-input').value.toUpperCase();
    if (!roomCode) return alert("Enter a room code!");
    socket.emit('joinRoom', { roomCode, characterData: getReadyCharacterData() });
};

window.startMultiplayerGame = () => {
    if (window.multiplayer.roomCode && window.multiplayer.isHost) {
        const players = Object.keys(window.multiplayer.players);
        const assignedHexes = {};
        const campaign = document.getElementById('campaign-select').value;
        let origin = { q: 0, r: 0 };
        if (campaign === "1") origin = { q: -8, r: -2 };
        else if (campaign === "3") origin = { q: 220, r: 200 };

        players.forEach((id, i) => {
            const pData = window.multiplayer.players[id];
            if (!pData.hex || (pData.hex.q === 0 && pData.hex.r === 0)) {
                assignedHexes[id] = { q: origin.q + i, r: origin.r };
            } else {
                assignedHexes[id] = pData.hex;
            }
        });

        socket.emit('startGame', { 
            roomCode: window.multiplayer.roomCode, 
            assignedHexes: assignedHexes 
        });
    } else if (window.multiplayer.roomCode && !window.multiplayer.isHost && window.multiplayer.gameState && window.multiplayer.gameState.started) {
        console.log("Non-host joining ongoing game...");
        window.initializeMultiplayerGame(window.multiplayer.players);
    }
};

window.leaveRoom = () => {
    location.reload(); 
};

window.broadcastFullState = () => {
    if (!window.multiplayer.isHost || !window.multiplayer.roomCode) return;
    
    socket.emit('broadcastState', {
        roomCode: window.multiplayer.roomCode,
        worldSeconds: window.worldSeconds,
        mapItems: window.mapItems,
        overrideTerrain: window.overrideTerrain,
        tileObjects: window.tileObjects,
        isInArena: window.isInArena,
        entities: window.entities.map(e => {
            const data = { ...e };
            delete data.visualQ; delete data.visualR; 
            return data;
        })
    });
};

document.addEventListener('click', (e) => {
    if (e.target.id === 'start-multiplayer-btn') {
        window.startMultiplayerGame();
    }
});
