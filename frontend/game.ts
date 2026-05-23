import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Camera } from './model/camera.model.js';
import { DirectionalLight } from './model/directional-light.model.js';
import { Player } from './model/player.model.js';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, CLIMB_BOOST, GRAVITY, JUMP_FORCE, MAP_SIZE, MAX_HEIGHT, PLAYER_SPEED, WATER } from './constant.js';
import { buildWorldFromData } from './service/map.service.js';

export class Game {

    public player: Player;
    public socket!: Socket;
    public mapData: number[][][] | null;
    public isInitialized: boolean;
    public scene: THREE.Scene;
    public camera: Camera;
    public d: number;
    public renderer: THREE.WebGLRenderer;
    public dirLight: DirectionalLight;
    public dirLightTarget: THREE.Object3D;
    public clock: THREE.Clock;
    public clientPlayers: Record<string, Player>;
    public keys: { [key: string]: boolean } = {};
    private serverUrl: string;


    constructor(server_url: string) {
        this.player = new Player("", "Me", 10, 4, 10, 0xff0000);
        this.serverUrl = server_url;
        this.mapData = null;
        this.isInitialized = false;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);

        this.camera = new Camera();
        this.d = this.camera.d;
        this.camera.position.set(20, 20, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);


        this.dirLight = new DirectionalLight();
        this.scene.add(this.dirLight);

        this.dirLightTarget = new THREE.Object3D();
        this.scene.add(this.dirLightTarget);
        this.dirLight.target = this.dirLightTarget;
        this.clock = new THREE.Clock();
        this.clientPlayers = {};

        this.animate = this.animate.bind(this);
    }

    addSocketOn() {
        this.socket.on('initWorld', ({ mapData: serverMap, otherPlayers, currentPlayer }) => {
            this.mapData = serverMap;
            buildWorldFromData(this.mapData!, this.scene);
            this.isInitialized = true;

            this.player.id = currentPlayer.id;
            this.player.name = currentPlayer.name || this.player.name;
            this.player.pos.set(currentPlayer.pos.x, currentPlayer.pos.y, currentPlayer.pos.z);

            this.scene.add(this.player.mesh!);

            for (const id in otherPlayers) {
                if (id !== this.socket.id && !this.clientPlayers[id]) {
                    const p = otherPlayers[id];
                    const pName = p.name || `Player_${id.slice(0, 4)}`;

                    this.clientPlayers[id] = new Player(id, pName, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);

                    this.scene.add(this.clientPlayers[id].mesh!);
                }
            }
        });

        // 2. Someone else joins later
        this.socket.on('playerJoined', (p) => {
            if (p.id !== this.socket.id && !this.clientPlayers[p.id]) {
                const pName = p.name || `Player_${p.id.slice(0, 4)}`;

                this.clientPlayers[p.id] = new Player(p.id, pName, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);

                this.scene.add(this.clientPlayers[p.id].mesh!);
            }
        });

        // 3. Keep positions in sync (The 30Hz loop)
        this.socket.on('stateUpdate', (serverPlayers) => {
            for (const id in serverPlayers) {
                if (id !== this.socket.id) {
                    const serverPlayerData = serverPlayers[id];
                    const localPlayer = this.clientPlayers[id];

                    if (localPlayer) {
                        // 💡 FIX: Copy values over, or re-instantiate the vector so methods exist!
                        localPlayer.pos.set(
                            serverPlayerData.pos.x,
                            serverPlayerData.pos.y,
                            serverPlayerData.pos.z
                        );

                        // Sync up visual mesh location if it exists
                        localPlayer.mesh?.position.copy(localPlayer.pos);
                    } else {
                        // If it's a completely new player your client hasn't spawned yet
                        // Use your class constructor to build them cleanly
                        this.clientPlayers[id] = new Player(
                            id,
                            serverPlayerData.name,
                            serverPlayerData.pos.x,
                            serverPlayerData.pos.y,
                            serverPlayerData.pos.z,
                            serverPlayerData.color || 0x5555cc
                        );

                        if (this.clientPlayers[id].mesh) {
                            this.scene.add(this.clientPlayers[id].mesh!);
                        }
                    }
                }
            }
        });

        // 4. Clean up when someone leaves
        this.socket.on('playerLeft', (id) => {
            if (this.clientPlayers[id]) {
                this.scene.remove(this.clientPlayers[id].mesh!); // Delete their capsule from the game world
                delete this.clientPlayers[id];
            }
        });
    }

    updatePhysics(dt: number) {
        if (!this.isInitialized || !this.mapData) return;

        const moveX = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
        const moveZ = (this.keys['KeyS'] ? 1 : 0) - (this.keys['KeyW'] ? 1 : 0);

        const camForward = new THREE.Vector3();
        this.camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, this.camera.up).normalize();

        const inputDir = new THREE.Vector3();
        inputDir.addScaledVector(camRight, moveX);
        inputDir.addScaledVector(camForward, -moveZ);
        if (inputDir.lengthSq() > 0) inputDir.normalize();

        // Water detection
        const playerGridX = Math.floor(this.player.pos.x / BLOCK_WIDTH);
        const playerGridY = Math.floor((this.player.pos.y + 0.1) / BLOCK_HEIGHT);
        const playerGridZ = Math.floor(this.player.pos.z / BLOCK_DEPTH);

        let isSwimming = false;
        if (playerGridX >= 0 && playerGridX < MAP_SIZE && playerGridY >= 0 && playerGridY < MAX_HEIGHT && playerGridZ >= 0 && playerGridZ < MAP_SIZE) {
            if (this.mapData[playerGridX][playerGridY][playerGridZ] === WATER) isSwimming = true;
        }

        this.player.vel.x = inputDir.x * PLAYER_SPEED;
        this.player.vel.z = inputDir.z * PLAYER_SPEED;

        const feetGridX = Math.floor(this.player.pos.x / BLOCK_WIDTH);
        const feetGridY = Math.floor((this.player.pos.y - 0.1) / BLOCK_HEIGHT);
        const feetGridZ = Math.floor(this.player.pos.z / BLOCK_DEPTH);

        if (isSwimming) {
            this.player.vel.y += (GRAVITY * 0.15) * dt;
            this.player.vel.y *= 0.9;

            if (this.keys['Space']) {
                if (this.mapData[feetGridX]?.[feetGridY + 1]?.[feetGridZ] === AIR) {
                    this.player.vel.y -= (GRAVITY * 0.15) * dt;
                    if (this.player.vel.y < 0.05) this.player.vel.y = 0;
                } else {
                    this.player.vel.y = PLAYER_SPEED * 0.6;
                }
            }
            this.player.onGround = false;
        } else {
            this.player.vel.y += GRAVITY * dt;

            if (this.keys['Space'] && this.player.onGround) {
                let currentJumpForce = JUMP_FORCE;
                if (feetGridX >= 0 && feetGridX < MAP_SIZE && feetGridY >= 0 && feetGridY < MAX_HEIGHT && feetGridZ >= 0 && feetGridZ < MAP_SIZE) {
                    if (this.mapData[feetGridX][feetGridY][feetGridZ] === BOOST) {
                        currentJumpForce = JUMP_FORCE * 1.5;
                    }
                }
                this.player.vel.y = currentJumpForce;
                this.player.onGround = false;
            }
        }

        const nextPos = this.player.pos!.clone();

        // X movement
        nextPos.x += this.player.vel.x * dt;
        if (!this.player.checkVoxelBoxCollision(nextPos, this.mapData)) {
            this.player.pos.x = nextPos.x;
        } else {
            if (isSwimming && inputDir.x !== 0) {
                const checkClimbPos = this.player.pos!.clone();
                checkClimbPos.y += BLOCK_HEIGHT;
                checkClimbPos.x += Math.sign(this.player.vel.x) * 0.2;
                if (!this.player.checkVoxelBoxCollision(checkClimbPos, this.mapData)) this.player.vel.y = CLIMB_BOOST;
            }
            nextPos.x = this.player.pos.x;
            this.player.vel.x = 0;
        }

        // Z movement
        nextPos.z += this.player.vel.z * dt;
        if (!this.player.checkVoxelBoxCollision(nextPos, this.mapData)) {
            this.player.pos.z = nextPos.z;
        } else {
            if (isSwimming && inputDir.z !== 0) {
                const checkClimbPos = this.player.pos!.clone();
                checkClimbPos.y += BLOCK_HEIGHT;
                checkClimbPos.z += Math.sign(this.player.vel.z) * 0.2;
                if (!this.player.checkVoxelBoxCollision(checkClimbPos, this.mapData)) this.player.vel.y = CLIMB_BOOST;
            }
            nextPos.z = this.player.pos.z;
            this.player.vel.z = 0;
        }

        // Y movement
        nextPos.y += this.player.vel.y * dt;
        if (!isSwimming) this.player.onGround = false;

        if (!this.player.checkVoxelBoxCollision(nextPos, this.mapData)) {
            this.player.pos.y = nextPos.y;
        } else {
            if (this.player.vel.y < 0) {
                this.player.pos.y = Math.ceil(nextPos.y / BLOCK_HEIGHT) * BLOCK_HEIGHT;
                this.player.vel.y = 0;
                if (!isSwimming) this.player.onGround = true;
            } else if (this.player.vel.y > 0) {
                this.player.pos.y = Math.floor(nextPos.y / BLOCK_HEIGHT) * BLOCK_HEIGHT;
                this.player.vel.y = 0;
            }
            nextPos.y = this.player.pos.y;
        }

        // Visual Update
        if (isSwimming) {
            if (inputDir.lengthSq() > 0) {
                const angle = Math.atan2(inputDir.x, inputDir.z);
                this.player.mesh!.rotation.set(0, angle, 0);
                this.player.mesh!.rotateX(Math.PI / 2);
            } else {
                this.player.mesh!.rotation.set(Math.PI / 2, 0, 0);
            }
            this.player.mesh!.position.set(this.player.pos.x, this.player.pos.y + (this.player.height * 0.1), this.player.pos.z);

            // --- ADD THIS LINE ---
            // If the player is swimming (flipped), move the tag relative to the side 
            // and rotate it back upright so it doesn't lay flat.
            this.player.tag!.position.set(0, 0, this.player.height + 0.5);
            this.player.tag!.rotation.set(-Math.PI / 2, 0, 0);
        } else {
            this.player.mesh!.rotation.set(0, 0, 0);
            this.player.mesh!.position.set(this.player.pos.x, this.player.pos.y + (this.player.height / 2), this.player.pos.z);

            // --- ADD THIS LINE ---
            // Reset to normal floating position above the upright cylinder
            this.player.tag!.position.set(0, this.player.height + 0.5, 0);
            this.player.tag!.rotation.set(0, 0, 0);
        }

        // Camera & Light tracking
        const targetCamX = this.player.pos.x + 15;
        const targetCamY = this.player.pos.y + 15;
        const targetCamZ = this.player.pos.z + 15;

        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.1;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.1;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.1;
        this.camera.lookAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);

        this.dirLightTarget.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
        this.dirLight.position.set(this.player.pos.x - 25, this.player.pos.y + 18, this.player.pos.z - 10);

        // --- EMIT POSITION TO SERVER ---
        this.socket.emit('playerUpdate', {
            name: this.player.name,
            pos: {
                x: this.player.pos.x,
                y: this.player.pos.y + this.player.height / 2,
                z: this.player.pos.z
            }
        });
    }

    animate() {
        requestAnimationFrame(this.animate);
        const dt = Math.min(this.clock.getDelta(), 0.1);

        this.updatePhysics(dt);
        this.renderer.render(this.scene, this.camera);
    }

    initGame() {
        // 1. Fetch the user's customized name from sessionStorage
        const savedName = sessionStorage.getItem("username") || "Me";
        this.player.name = savedName;

        // 2. Safely open the connection now that we have the real username
        this.socket = io(this.serverUrl, {
            auth: {
                player: this.player
            }
        });

        // 3. Bind events to the socket
        this.addSocketOn();

        // 4. Bind listeners and kick off loop
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        window.addEventListener('resize', () => {
            const newAspect = window.innerWidth / window.innerHeight;
            this.camera.left = -this.d * newAspect;
            this.camera.right = this.d * newAspect;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        this.animate();
    }
}