import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Camera } from './model/camera.model.js';
import { DirectionalLight } from './model/directional-light.model.js';
import { Player } from './model/player.model.js';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, CLIMB_BOOST, GRAVITY, JUMP_FORCE, MAP_SIZE, MAX_HEIGHT, PLAYER_SPEED, WATER } from './constant.js';
import { buildWorldFromData } from './service/map.service.js';
import { LeaderboardComponent } from './component/leaderboard.component.js';

// Modular Architecture Core Classes
import { Weapon } from './model/weapon/weapon.model.js';
import { MeleeWeapon, MeleeMotionPattern } from './model/weapon/melee-weapon.model.js';

// Concrete Implementations
import { Sword } from './model/weapon/sword.model.js';
import { Lance } from './model/weapon/lance.model.js';
import { Bow } from './model/weapon/bow.model.js';
import { FireStaff } from './model/weapon/fire-staff.model.js';
import { ProjectileEntity } from './model/weapon/projectile.model.js';
import { RangedWeapon } from './model/weapon/ranged-weapon.model.js';

// Internal wrappers to visually track peer rendering entities
class RemoteProjectile {
    public mesh: THREE.Mesh;
    public direction: THREE.Vector3;
    public speed: number;
    public useGravity: boolean;
    public gravityScale: number;
    public maxRange: number;
    public distanceTraveled: number = 0;
    private velocity: THREE.Vector3;

    constructor(data: any) {
        // Fix: Freeze immutable vectors immediately upon receipt to protect against external player mutation
        this.direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize().clone();
        this.speed = data.speed;
        this.useGravity = data.useGravity;
        this.gravityScale = data.gravityScale ?? 8.0;
        this.maxRange = data.maxRange ?? 40;
        this.velocity = this.direction.clone().multiplyScalar(this.speed);

        if (data.projectileType === 'fireball') {
            this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4500 }));
        } else {
            this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.8), new THREE.MeshBasicMaterial({ color: 0xd2b48c }));
        }
        this.mesh.position.set(data.origin.x, data.origin.y, data.origin.z);
    }

    public update(dt: number, mapData: number[][][]): boolean {
        if (this.useGravity) {
            this.velocity.y -= this.gravityScale * dt;
            const lookTarget = this.mesh.position.clone().add(this.velocity);
            this.mesh.lookAt(lookTarget);
        }

        const deltaMove = this.velocity.clone().multiplyScalar(dt);
        this.mesh.position.add(deltaMove);
        this.distanceTraveled += deltaMove.length();

        if (this.distanceTraveled >= this.maxRange) return false;

        const gx = Math.floor(this.mesh.position.x / BLOCK_WIDTH);
        const gy = Math.floor(this.mesh.position.y / BLOCK_HEIGHT);
        const gz = Math.floor(this.mesh.position.z / BLOCK_DEPTH);

        if (mapData[gx]?.[gy]?.[gz] !== undefined && mapData[gx][gy][gz] !== AIR && mapData[gx][gy][gz] !== WATER) {
            return false;
        }
        return true;
    }
}

export class Game {
    public player!: Player;
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
    private leaderboard!: LeaderboardComponent;

    // Track active external projectiles independently
    private peerProjectiles: Map<string, RemoteProjectile> = new Map();
    private activeProjectiles: Map<string, ProjectileEntity> = new Map();

    constructor(server_url: string) {
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

    private parseWeaponBlueprint(weaponData: any): Weapon {
        const name = weaponData?.name || 'Sword';
        if (name === 'Bow') return new Bow('remote-bow');
        if (name === 'Steel Lance') return new Lance('remote-lance');
        if (name === 'Fire Staff') return new FireStaff('remote-staff');
        return new Sword('remote-sword');
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

                    const remotePlayer = new Player(id, pName, p.pos.x, p.pos.y, p.pos.z, p.color);
                    remotePlayer.equipWeapon(this.parseWeaponBlueprint(p.equippedWeapon));

                    this.clientPlayers[id] = remotePlayer;
                    this.scene.add(this.clientPlayers[id].mesh!);
                }
            }
        });

        this.socket.on('playerJoined', (p) => {
            if (p.id !== this.socket.id && !this.clientPlayers[p.id]) {
                const pName = p.name || `Player_${p.id.slice(0, 4)}`;
                const remotePlayer = new Player(p.id, pName, p.pos.x, p.pos.y, p.pos.z, p.color);

                remotePlayer.equipWeapon(this.parseWeaponBlueprint(p.equippedWeapon));

                this.clientPlayers[p.id] = remotePlayer;
                this.scene.add(this.clientPlayers[p.id].mesh!);
            }
        });

        this.socket.on('stateUpdate', (serverPlayers) => {
            for (const id in serverPlayers) {
                if (id !== this.socket.id) {
                    const serverPlayerData = serverPlayers[id];
                    const localPlayer = this.clientPlayers[id];

                    if (localPlayer) {
                        localPlayer.pos.set(serverPlayerData.pos.x, serverPlayerData.pos.y, serverPlayerData.pos.z);
                        localPlayer.setLifePoints(serverPlayerData.lifePoints);
                        localPlayer.mesh?.position.copy(localPlayer.pos);

                        if (serverPlayerData.rotation && localPlayer.mesh) {
                            localPlayer.mesh.rotation.set(
                                serverPlayerData.rotation.x,
                                serverPlayerData.rotation.y,
                                serverPlayerData.rotation.z
                            );
                        }

                        if (serverPlayerData.equippedWeapon && localPlayer.equippedWeapon?.name !== serverPlayerData.equippedWeapon.name) {
                            localPlayer.equipWeapon(this.parseWeaponBlueprint(serverPlayerData.equippedWeapon));
                        }
                    } else {
                        const remotePlayer = new Player(
                            id,
                            serverPlayerData.name,
                            serverPlayerData.pos.x,
                            serverPlayerData.pos.y,
                            serverPlayerData.pos.z,
                            serverPlayerData.color || 0x5555cc,
                            100,
                            serverPlayerData.lifePoints
                        );
                        remotePlayer.equipWeapon(this.parseWeaponBlueprint(serverPlayerData.equippedWeapon));

                        this.clientPlayers[id] = remotePlayer;
                        if (this.clientPlayers[id].mesh) {
                            this.scene.add(this.clientPlayers[id].mesh!);
                        }
                    }
                }
            }
        });

        this.socket.on('playerRespawn', ({ x, y, z, lifePoints }) => {
            this.player.pos.set(x, y, z);
            this.player.vel.set(0, 0, 0);
            this.player.setLifePoints(lifePoints);

            if (this.player.mesh) {
                this.player.mesh.position.set(x, y + (this.player.height / 2), z);
            }
        });

        this.socket.on('playerLeft', (id) => {
            if (this.clientPlayers[id]) {
                this.scene.remove(this.clientPlayers[id].mesh!);
                delete this.clientPlayers[id];
            }
        });

        this.socket.on('playerDamaged', ({ targetId, currentLifePoints }) => {
            if (targetId === this.player.id) {
                this.player.setLifePoints(currentLifePoints);
            } else if (this.clientPlayers[targetId]) {
                this.clientPlayers[targetId].setLifePoints(currentLifePoints);
            }
        });

        this.socket.on('updateLeaderboard', (data) => {
            this.leaderboard.update(data);
        });

        this.socket.on('playerAttacked', ({ attackerId, motionPattern }) => {
            const externalAttacker = this.clientPlayers[attackerId];
            if (externalAttacker && externalAttacker.equippedWeapon) {
                if (externalAttacker.equippedWeapon instanceof MeleeWeapon) {
                    externalAttacker.equippedWeapon.motionPattern = motionPattern as MeleeMotionPattern;
                }
                externalAttacker.useWeapon();
            }
        });

        this.socket.on('projectileSpawned', (data) => {
            const wrapper = new RemoteProjectile(data);
            this.scene.add(wrapper.mesh);
            this.peerProjectiles.set(data.id, wrapper);
        });
    }

    private handlePlayerAttack() {
        if (!this.isInitialized || !this.player.equippedWeapon) return;

        const currentWeapon = this.player.equippedWeapon;

        if (this.player.useWeapon()) {
            const lookDirection = new THREE.Vector3(0, 0, 1);
            lookDirection.applyQuaternion(this.player.mesh!.quaternion).normalize();

            if (currentWeapon.type === 'melee') {
                const melee = currentWeapon as MeleeWeapon;

                // Trigger the animation locally
                melee.executeAttackLogic();

                this.socket.emit('triggerAttackAnimation', { motionPattern: melee.motionPattern });

                for (const targetId in this.clientPlayers) {
                    const targetPlayer = this.clientPlayers[targetId];
                    if (this.player.verifyHit(targetPlayer, lookDirection)) {
                        this.socket.emit('attackPlayer', {
                            targetId: targetId,
                            damage: currentWeapon.damage
                        });
                    }
                }
            }
            else if (currentWeapon.type === 'ranged') {
                const ranged = currentWeapon as RangedWeapon;

                const lookDirection = new THREE.Vector3(0, 0, 1);
                lookDirection.applyQuaternion(this.player.mesh!.quaternion).normalize();

                const fireSpecs = ranged.fire(this.scene, lookDirection, this.player.pos, this.player.height);

                if (fireSpecs) {
                    const uniqueProjId = Math.random().toString(36).substring(2, 9);

                    const localProj = new ProjectileEntity(
                        uniqueProjId,
                        this.socket.id || '',
                        fireSpecs.origin,
                        fireSpecs.direction,
                        currentWeapon.damage,
                        currentWeapon.range,
                        fireSpecs
                    );

                    this.scene.add(localProj.mesh);
                    this.activeProjectiles.set(uniqueProjId, localProj);

                    this.socket.emit('spawnProjectile', {
                        id: uniqueProjId,
                        projectileType: fireSpecs.projectileType,
                        origin: { x: fireSpecs.origin.x, y: fireSpecs.origin.y, z: fireSpecs.origin.z },
                        direction: { x: fireSpecs.direction.x, y: fireSpecs.direction.y, z: fireSpecs.direction.z },
                        useGravity: fireSpecs.useGravity,
                        speed: fireSpecs.speed,
                        damage: currentWeapon.damage,
                        range: currentWeapon.range
                    });
                }
            }
        }
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

        if (isSwimming) {
            if (inputDir.lengthSq() > 0) {
                const angle = Math.atan2(inputDir.x, inputDir.z);
                this.player.mesh!.rotation.set(0, angle, 0);
                this.player.mesh!.rotateX(Math.PI / 2);
            } else {
                this.player.mesh!.rotation.set(Math.PI / 2, 0, 0);
            }
            this.player.mesh!.position.set(this.player.pos.x, this.player.pos.y + (this.player.height * 0.1), this.player.pos.z);
            this.player.tag!.position.set(0, 0, this.player.height + 0.5);
            this.player.tag!.rotation.set(-Math.PI / 2, 0, 0);
        } else {
            if (inputDir.lengthSq() > 0) {
                const angle = Math.atan2(inputDir.x, inputDir.z);
                this.player.mesh!.rotation.set(0, angle, 0);
            }
            this.player.mesh!.position.set(this.player.pos.x, this.player.pos.y + (this.player.height / 2), this.player.pos.z);
            this.player.tag!.position.set(0, this.player.height + 0.5, 0);
            this.player.tag!.rotation.set(0, 0, 0);
        }

        const targetCamX = this.player.pos.x + 15;
        const targetCamY = this.player.pos.y + 15;
        const targetCamZ = this.player.pos.z + 15;

        this.camera.position.x += (targetCamX - this.camera.position.x) * 0.1;
        this.camera.position.y += (targetCamY - this.camera.position.y) * 0.1;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * 0.1;
        this.camera.lookAt(this.player.pos.x, this.player.pos.y, this.player.pos.z);

        this.dirLightTarget.position.set(this.player.pos.x, this.player.pos.y, this.player.pos.z);
        this.dirLight.position.set(this.player.pos.x - 25, this.player.pos.y + 18, this.player.pos.z - 10);

        this.socket.emit('playerUpdate', {
            name: this.player.name,
            pos: {
                x: this.player.pos.x,
                y: this.player.pos.y + this.player.height / 2,
                z: this.player.pos.z
            },
            rotation: {
                x: this.player.mesh!.rotation.x,
                y: this.player.mesh!.rotation.y,
                z: this.player.mesh!.rotation.z
            },
            equippedWeapon: this.player.equippedWeapon ? {
                name: this.player.equippedWeapon.name,
                type: this.player.equippedWeapon.type
            } : null,
            lifePoints: this.player.lifePoints
        });
    }

    animate() {
        requestAnimationFrame(this.animate);
        const dt = Math.min(this.clock.getDelta(), 0.1);

        this.updatePhysics(dt);

        if (this.player && this.player.equippedWeapon) {
            this.player.equippedWeapon.update(dt, this.scene, this.mapData!);
        }

        for (const id in this.clientPlayers) {
            const peer = this.clientPlayers[id];
            if (peer && peer.equippedWeapon) {
                peer.equippedWeapon.update(dt, this.scene, this.mapData!);
            }
        }

        // Loop through and update every travelling projectile object instance inside the scene
        this.activeProjectiles.forEach((proj, id) => {
            const alive = proj.update(dt, this.mapData!);

            if (alive) {
                for (const targetId in this.clientPlayers) {
                    const peer = this.clientPlayers[targetId];
                    const peerPos = new THREE.Vector3().copy(peer.pos);

                    if (proj.mesh.position.distanceTo(peerPos) < 1.2) {
                        this.socket.emit('attackPlayer', { targetId: targetId, damage: proj.damage });
                        this.scene.remove(proj.mesh);
                        this.activeProjectiles.delete(id);
                        return;
                    }
                }
            } else {
                this.scene.remove(proj.mesh);
                this.activeProjectiles.delete(id);
            }
        });

        // Fix: Actually execute updates across the peer projectiles registry map so remote items fly too
        this.peerProjectiles.forEach((remoteProj, id) => {
            const alive = remoteProj.update(dt, this.mapData!);
            if (!alive) {
                this.scene.remove(remoteProj.mesh);
                this.peerProjectiles.delete(id);
            }
        });

        this.renderer.render(this.scene, this.camera);
    }

    initGame() {
        const storedName = sessionStorage.getItem("username") || "Guest Player";
        const storedColorRaw = sessionStorage.getItem("playerColor");
        const finalColorNum = storedColorRaw ? parseInt(storedColorRaw, 10) : 0xff0000;

        this.player = new Player("", storedName, 10, 4, 10, finalColorNum);

        const chosenWeaponKey = sessionStorage.getItem("selectedWeapon") || "sword";

        if (chosenWeaponKey === "lance") this.player.equipWeapon(new Lance("local-lance"));
        else if (chosenWeaponKey === "bow") this.player.equipWeapon(new Bow("local-bow"));
        else if (chosenWeaponKey === "firestaff") this.player.equipWeapon(new FireStaff("local-staff"));
        else this.player.equipWeapon(new Sword("local-sword"));

        this.leaderboard = new LeaderboardComponent();

        this.socket = io(this.serverUrl, {
            auth: {
                player: this.player
            }
        });

        this.addSocketOn();

        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        window.addEventListener('keypress', (e) => {
            if (e.code === 'Digit1') this.player.equipWeapon(new Sword("local-sword"));
            if (e.code === 'Digit2') this.player.equipWeapon(new Lance("local-lance"));
            if (e.code === 'Digit3') this.player.equipWeapon(new Bow("local-bow"));
            if (e.code === 'Digit4') this.player.equipWeapon(new FireStaff("local-staff"));
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.handlePlayerAttack();
            }
        });

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