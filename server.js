const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', ({ characterData, savedCharacters, isAlreadyStarted }) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        characterData.hex = characterData.hex || { q: 0, r: 0 };
        rooms[roomCode] = {
            players: { [socket.id]: characterData },
            savedCharacters: savedCharacters || [],
            gameState: {
                worldSeconds: 8 * 3600,
                isInCombat: false,
                started: isAlreadyStarted || false
            }
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
        console.log(`Room created: ${roomCode} (Started: ${isAlreadyStarted})`);
    });

    socket.on('joinRoom', ({ roomCode, characterData }) => {
        const room = rooms[roomCode];
        if (room) {
            characterData.hex = characterData.hex || { q: 0, r: 0 };
            room.players[socket.id] = characterData;
            socket.join(roomCode);
            
            socket.emit('roomJoined', { 
                roomCode, 
                players: room.players, 
                gameState: room.gameState,
                savedCharacters: room.savedCharacters
            });
            io.to(roomCode).emit('playerJoined', { id: socket.id, characterData });
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('claimCharacter', ({ roomCode, name }) => {
        const room = rooms[roomCode];
        if (room) {
            room.savedCharacters = room.savedCharacters.filter(n => n !== name);
            if (room.players[socket.id]) {
                room.players[socket.id].name = name;
                room.players[socket.id].isClaimed = true;
            }
            io.to(roomCode).emit('characterClaimed', { id: socket.id, name });
        }
    });

    socket.on('broadcastState', ({ roomCode, worldSeconds, mapItems, entities }) => {
        const room = rooms[roomCode];
        if (room) {
            room.gameState.worldSeconds = worldSeconds;
            io.to(roomCode).emit('syncFullState', { 
                players: room.players, 
                gameState: room.gameState,
                entities,
                mapItems,
                worldSeconds
            });
        }
    });

    socket.on('startGame', ({ roomCode, assignedHexes }) => {
        const room = rooms[roomCode];
        if (room) {
            room.gameState.started = true;
            if (assignedHexes) {
                for (const id in assignedHexes) {
                    if (room.players[id]) room.players[id].hex = assignedHexes[id];
                }
            }
            io.to(roomCode).emit('gameStarted', { players: room.players });
        }
    });

    socket.on('move', ({ roomCode, destination }) => {
        const room = rooms[roomCode];
        if (room && room.players[socket.id]) {
            room.players[socket.id].hex = destination;
            socket.to(roomCode).emit('playerMoved', { id: socket.id, destination });
        }
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].players[socket.id]) {
                delete rooms[roomCode].players[socket.id];
                io.to(roomCode).emit('playerLeft', socket.id);
                if (Object.keys(rooms[roomCode].players).length === 0) {
                    delete rooms[roomCode];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
