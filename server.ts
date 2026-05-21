/// <reference types="node" />
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { Player } from './src/model/player.model.js';
import { MAP_SIZE, MAX_HEIGHT, SEA_LEVEL, AIR, COBBLESTONE, DIRT, GRASS, BOOST, WATER } from './src/constant.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'dist')));
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
let mapData: number[][][] | null = null;

function getRandomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min);
}

// Generate the map ONCE on the server
function generateServerMap() {
    mapData = Array.from({ length: MAP_SIZE }, () =>
        Array.from({ length: MAX_HEIGHT }, () =>
            Array.from({ length: MAP_SIZE }, () => AIR)
        )
    );

    for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
            const waveValue = Math.cos(x * 0.3) * Math.sin(z * 0.3);
            const normalizedHeight = (waveValue + 1) / 2;
            let height = Math.floor(normalizedHeight * (MAX_HEIGHT - 2)) + 2;
            height = height > 0 ? height : 1;

            for (let y = 0; y < height; y++) {
                if (y <= 1) {
                    mapData[x][y][z] = COBBLESTONE;
                } else if (y === height - 1) {
                    if (getRandomBetween(1, 5) === 1) {
                        mapData[x][y][z] = BOOST;
                    } else {
                        mapData[x][y][z] = GRASS;
                    }
                } else {
                    mapData[x][y][z] = DIRT;
                }
            }

            for (let y = height; y <= SEA_LEVEL; y++) {
                mapData[x][y][z] = WATER;
            }
        }
    }
}

generateServerMap();

// Socket.io Game Loop (Broadcasting state at 30Hz/60Hz)
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Send the newly joined player the world data and current players
    socket.emit('initWorld', { mapData, currentPlayers: players });

    // 2. Register the new player locally
    players[socket.id] = new Player(socket.id, 10, 4, 10);

    // 3. Inform other players that a new player joined
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // 4. Listen for structural movement updates from this specific client
    socket.on('playerUpdate', (data: Omit<Player, 'id'>) => {
        if (players[socket.id]) {
            players[socket.id].pos.set(data.pos.x, data.pos.y, data.pos.z);
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