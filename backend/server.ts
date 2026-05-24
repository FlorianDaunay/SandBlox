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

const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const players: Record<string, Player> = {};
let mapGrid: MapGrid = new MapGrid();
let mapData = mapGrid.grid;

const getLeaderboardData = () => {
    const list = Object.keys(players).map(id => {
        const p = players[id] as any;
        const kills = p.kills || 0;
        const deaths = p.deaths || 0;
        const points = (kills * 2) - deaths;
        return { name: p.name, kills, deaths, points };
    });

    list.sort((a, b) => b.points - a.points);

    let currentRank = 1;
    return list.map((item, index) => {
        if (index > 0 && item.points < list[index - 1].points) {
            currentRank = index + 1;
        }

        let suffix = "th";
        if (currentRank === 1) suffix = "st";
        else if (currentRank === 2) suffix = "nd";
        else if (currentRank === 3) suffix = "rd";

        return {
            rankString: `${currentRank}${suffix}`,
            name: item.name,
            points: item.points,
            kills: item.kills,
            deaths: item.deaths
        };
    }).slice(0, 3);
};

const broadcastLeaderboard = () => {
    io.emit('updateLeaderboard', getLeaderboardData());
};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    const playerData = socket.handshake.auth.player;
    const name = playerData?.name || 'Guest';
    const { x = 0, y = 10, z = 0 } = playerData?.pos || {};
    const color = playerData.color;

    players[socket.id] = new Player(socket.id, name, x, y, z, color);
    players[socket.id].id = socket.id;

    (players[socket.id] as any).kills = 0;
    (players[socket.id] as any).deaths = 0;

    socket.emit('initWorld', { mapData, otherPlayers: players, currentPlayer: players[socket.id] });
    socket.broadcast.emit('playerJoined', players[socket.id]);
    broadcastLeaderboard();

    socket.on('playerUpdate', (data: any) => {
        const player = players[socket.id];
        if (player && data && data.pos) {
            const x = typeof data.pos.x === 'number' ? data.pos.x : player.pos.x;
            const y = typeof data.pos.y === 'number' ? data.pos.y : player.pos.y;
            const z = typeof data.pos.z === 'number' ? data.pos.z : player.pos.z;

            player.pos.set(x, y, z);
            player.name = data.name;
            player.lifePoints = data.lifePoints;

            // Sync current active weapon metadata for remote player appearance updates
            if (data.equippedWeapon) {
                (player as any).equippedWeapon = {
                    name: data.equippedWeapon.name,
                    type: data.equippedWeapon.type
                };
            }
        }
    });

    socket.on('attackPlayer', (data: { targetId: string; damage: number }) => {
        const attacker = players[socket.id] as any;
        const target = players[data.targetId] as any;

        if (!attacker || !target) return;

        target.damage(data.damage);
        console.log(`Player ${attacker.name} hit ${target.name} for ${data.damage} damage. Target HP: ${target.lifePoints}`);

        io.emit('playerDamaged', {
            targetId: data.targetId,
            currentLifePoints: target.lifePoints
        });

        if (target.lifePoints <= 0) {
            console.log(`Player ${target.name} has died! Respawning...`);

            attacker.kills = (attacker.kills || 0) + 1;
            target.deaths = (target.deaths || 0) + 1;

            target.setLifePoints(target.maxLifePoints);

            const respawnX = 10;
            const respawnY = 15;
            const respawnZ = 10;

            target.pos.set(respawnX, respawnY, respawnZ);

            io.to(data.targetId).emit('playerRespawn', {
                x: respawnX,
                y: respawnY,
                z: respawnZ,
                lifePoints: target.maxLifePoints
            });

            io.emit('stateUpdate', players);
            broadcastLeaderboard();
        }
    });

    socket.on('triggerAttackAnimation', (data: { motionPattern: string }) => {
        socket.broadcast.emit('playerAttacked', {
            attackerId: socket.id,
            motionPattern: data?.motionPattern || 'slash'
        });
    });

    socket.on('spawnProjectile', (data: {
        projectileType: string;
        origin: { x: number; y: number; z: number };
        direction: { x: number; y: number; z: number };
        useGravity: boolean;
        speed: number;
    }) => {
        // Distribute projectile properties globally so clients can execute their local rendering calculations
        socket.broadcast.emit('projectileSpawned', {
            id: `${socket.id}-${Date.now()}`,
            ownerId: socket.id,
            ...data
        });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
        broadcastLeaderboard();
    });
});

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