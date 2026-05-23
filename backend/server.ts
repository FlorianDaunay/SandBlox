/// <reference types="node" />
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { Player } from '../frontend/model/player.model.js';
import { MAP_SIZE, MAX_HEIGHT, SEA_LEVEL, AIR, COBBLESTONE, DIRT, GRASS, BOOST, WATER } from '../frontend/constant.js';
import { MapGrid } from './map-generation.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, '../dist')));
const httpServer = createServer(app);

const PORT = process.env.PORT || 3000;

// Configure CORS so your frontend can connect to Render
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust this to your specific frontend URL in production
        methods: ["GET", "POST"]
    }
});

const players: Record<string, Player> = {};
let mapGrid: MapGrid = new MapGrid();
let mapData = mapGrid.grid;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Register the new player locally
    const playerData = socket.handshake.auth.player;
    const name = playerData?.name || 'Guest';
    const { x = 0, y = 10, z = 0 } = playerData?.pos || {};
    const color = playerData.color;
    players[socket.id] = new Player(socket.id, name, x, y, z, color);
    players[socket.id].id = socket.id;

    // 2. Send the newly joined player the world data and current players
    socket.emit('initWorld', { mapData, otherPlayers: players, currentPlayer: players[socket.id] });

    // 3. Inform other players that a new player joined
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 4. Listen for structural movement updates from this specific client
    socket.on('playerUpdate', (data: any) => {
        const player = players[socket.id];
        if (player && data && data.pos) {
            // Read properties safely even if it's a plain primitive object JSON structure
            const x = typeof data.pos.x === 'number' ? data.pos.x : player.pos.x;
            const y = typeof data.pos.y === 'number' ? data.pos.y : player.pos.y;
            const z = typeof data.pos.z === 'number' ? data.pos.z : player.pos.z;

            player.pos.set(x, y, z);
            player.name = data.name;
        }
    });

    // 5. Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// Broadcast state updates to all clients every 33ms (~30 updates per second)
setInterval(() => {
    io.emit('stateUpdate', players);
}, 33);


httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});




process.on('uncaughtException', (err) => {
    console.error('CRITICAL SERVER ERROR WORKED:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED PROMISE REJECTION:', reason);
});