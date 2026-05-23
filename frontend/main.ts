import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Camera } from './model/camera.model.js';
import { DirectionalLight } from './model/directional-light.model.js';
import { Player } from './model/player.model.js';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, CLIMB_BOOST, COBBLESTONE, DIRT, displayBorder, GRASS, GRAVITY, JUMP_FORCE, MAP_SIZE, MAX_HEIGHT, PLAYER_SPEED, WATER } from './constant.js';
import { buildWorldFromData } from './service/map.service.js';

// --- 1. NETWORKING SETUP ---
const SERVER_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;


let player = new Player("", "Me", 10, 4, 10, 0xff0000);


const socket: Socket = io(SERVER_URL, {
  auth: {
    player: player
  }
});

let mapData: number[][][] | null = null;

let isInitialized = false;

// --- 2. SETUP THREE.JS SCENE & ISOMETRIC CAMERA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new Camera();
const d = camera.d;
camera.position.set(20, 20, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new DirectionalLight();
scene.add(dirLight);

const dirLightTarget = new THREE.Object3D();
scene.add(dirLightTarget);
dirLight.target = dirLightTarget;






const keys: { [key: string]: boolean } = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

const clientPlayers: Record<string, Player> = {}; // Local player instances with meshes

// 1. Handshake: Get all current players when joining
socket.on('initWorld', ({ mapData: serverMap, otherPlayers, currentPlayer }) => {
  mapData = serverMap;
  buildWorldFromData(mapData!, scene);
  isInitialized = true;

  player.id = currentPlayer.id;
  player.name = currentPlayer.name || player.name;
  player.pos.set(currentPlayer.pos.x, currentPlayer.pos.y, currentPlayer.pos.z);

  scene.add(player.mesh!);

  for (const id in otherPlayers) {
    if (id !== socket.id && !clientPlayers[id]) {
      const p = otherPlayers[id];
      const pName = p.name || `Player_${id.slice(0, 4)}`;

      clientPlayers[id] = new Player(id, pName, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);

      scene.add(clientPlayers[id].mesh!);
    }
  }
});

// 2. Someone else joins later
socket.on('playerJoined', (p) => {
  if (p.id !== socket.id && !clientPlayers[p.id]) {
    const pName = p.name || `Player_${p.id.slice(0, 4)}`;

    clientPlayers[p.id] = new Player(p.id, pName, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);

    scene.add(clientPlayers[p.id].mesh!);
  }
});

// 3. Keep positions in sync (The 30Hz loop)
socket.on('stateUpdate', (serverPlayers) => {
  for (const id in serverPlayers) {
    if (id !== socket.id) {
      const serverPlayerData = serverPlayers[id];
      const localPlayer = clientPlayers[id];

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
        clientPlayers[id] = new Player(
          id,
          serverPlayerData.name,
          serverPlayerData.pos.x,
          serverPlayerData.pos.y,
          serverPlayerData.pos.z,
          serverPlayerData.color || 0x5555cc
        );

        if (clientPlayers[id].mesh) {
          scene.add(clientPlayers[id].mesh!);
        }
      }
    }
  }
});

// 4. Clean up when someone leaves
socket.on('playerLeft', (id) => {
  if (clientPlayers[id]) {
    scene.remove(clientPlayers[id].mesh!); // Delete their capsule from the game world
    delete clientPlayers[id];
  }
});

// --- 7. PHYSICS & GAME LOOP ---
function updatePhysics(dt: number) {
  if (!isInitialized || !mapData) return;

  const moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const moveZ = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  camForward.normalize();

  const camRight = new THREE.Vector3();
  camRight.crossVectors(camForward, camera.up).normalize();

  const inputDir = new THREE.Vector3();
  inputDir.addScaledVector(camRight, moveX);
  inputDir.addScaledVector(camForward, -moveZ);
  if (inputDir.lengthSq() > 0) inputDir.normalize();

  // Water detection
  const playerGridX = Math.floor(player.pos.x / BLOCK_WIDTH);
  const playerGridY = Math.floor((player.pos.y + 0.1) / BLOCK_HEIGHT);
  const playerGridZ = Math.floor(player.pos.z / BLOCK_DEPTH);

  let isSwimming = false;
  if (playerGridX >= 0 && playerGridX < MAP_SIZE && playerGridY >= 0 && playerGridY < MAX_HEIGHT && playerGridZ >= 0 && playerGridZ < MAP_SIZE) {
    if (mapData[playerGridX][playerGridY][playerGridZ] === WATER) isSwimming = true;
  }

  player.vel.x = inputDir.x * PLAYER_SPEED;
  player.vel.z = inputDir.z * PLAYER_SPEED;

  const feetGridX = Math.floor(player.pos.x / BLOCK_WIDTH);
  const feetGridY = Math.floor((player.pos.y - 0.1) / BLOCK_HEIGHT);
  const feetGridZ = Math.floor(player.pos.z / BLOCK_DEPTH);

  if (isSwimming) {
    player.vel.y += (GRAVITY * 0.15) * dt;
    player.vel.y *= 0.9;

    if (keys['Space']) {
      if (mapData[feetGridX]?.[feetGridY + 1]?.[feetGridZ] === AIR) {
        player.vel.y -= (GRAVITY * 0.15) * dt;
        if (player.vel.y < 0.05) player.vel.y = 0;
      } else {
        player.vel.y = PLAYER_SPEED * 0.6;
      }
    }
    player.onGround = false;
  } else {
    player.vel.y += GRAVITY * dt;

    if (keys['Space'] && player.onGround) {
      let currentJumpForce = JUMP_FORCE;
      if (feetGridX >= 0 && feetGridX < MAP_SIZE && feetGridY >= 0 && feetGridY < MAX_HEIGHT && feetGridZ >= 0 && feetGridZ < MAP_SIZE) {
        if (mapData[feetGridX][feetGridY][feetGridZ] === BOOST) {
          currentJumpForce = JUMP_FORCE * 1.5;
        }
      }
      player.vel.y = currentJumpForce;
      player.onGround = false;
    }
  }

  const nextPos = player.pos!.clone();

  // X movement
  nextPos.x += player.vel.x * dt;
  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.x = nextPos.x;
  } else {
    if (isSwimming && inputDir.x !== 0) {
      const checkClimbPos = player.pos!.clone();
      checkClimbPos.y += BLOCK_HEIGHT;
      checkClimbPos.x += Math.sign(player.vel.x) * 0.2;
      if (!player.checkVoxelBoxCollision(checkClimbPos, mapData)) player.vel.y = CLIMB_BOOST;
    }
    nextPos.x = player.pos.x;
    player.vel.x = 0;
  }

  // Z movement
  nextPos.z += player.vel.z * dt;
  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.z = nextPos.z;
  } else {
    if (isSwimming && inputDir.z !== 0) {
      const checkClimbPos = player.pos!.clone();
      checkClimbPos.y += BLOCK_HEIGHT;
      checkClimbPos.z += Math.sign(player.vel.z) * 0.2;
      if (!player.checkVoxelBoxCollision(checkClimbPos, mapData)) player.vel.y = CLIMB_BOOST;
    }
    nextPos.z = player.pos.z;
    player.vel.z = 0;
  }

  // Y movement
  nextPos.y += player.vel.y * dt;
  if (!isSwimming) player.onGround = false;

  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.y = nextPos.y;
  } else {
    if (player.vel.y < 0) {
      player.pos.y = Math.ceil(nextPos.y / BLOCK_HEIGHT) * BLOCK_HEIGHT;
      player.vel.y = 0;
      if (!isSwimming) player.onGround = true;
    } else if (player.vel.y > 0) {
      player.pos.y = Math.floor(nextPos.y / BLOCK_HEIGHT) * BLOCK_HEIGHT;
      player.vel.y = 0;
    }
    nextPos.y = player.pos.y;
  }

  // Visual Update
  if (isSwimming) {
    if (inputDir.lengthSq() > 0) {
      const angle = Math.atan2(inputDir.x, inputDir.z);
      player.mesh!.rotation.set(0, angle, 0);
      player.mesh!.rotateX(Math.PI / 2);
    } else {
      player.mesh!.rotation.set(Math.PI / 2, 0, 0);
    }
    player.mesh!.position.set(player.pos.x, player.pos.y + (player.height * 0.1), player.pos.z);

    // --- ADD THIS LINE ---
    // If the player is swimming (flipped), move the tag relative to the side 
    // and rotate it back upright so it doesn't lay flat.
    player.tag!.position.set(0, 0, player.height + 0.5);
    player.tag!.rotation.set(-Math.PI / 2, 0, 0);
  } else {
    player.mesh!.rotation.set(0, 0, 0);
    player.mesh!.position.set(player.pos.x, player.pos.y + (player.height / 2), player.pos.z);

    // --- ADD THIS LINE ---
    // Reset to normal floating position above the upright cylinder
    player.tag!.position.set(0, player.height + 0.5, 0);
    player.tag!.rotation.set(0, 0, 0);
  }

  // Camera & Light tracking
  const targetCamX = player.pos.x + 15;
  const targetCamY = player.pos.y + 15;
  const targetCamZ = player.pos.z + 15;

  camera.position.x += (targetCamX - camera.position.x) * 0.1;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;
  camera.lookAt(player.pos.x, player.pos.y, player.pos.z);

  dirLightTarget.position.set(player.pos.x, player.pos.y, player.pos.z);
  dirLight.position.set(player.pos.x - 25, player.pos.y + 18, player.pos.z - 10);

  // --- EMIT POSITION TO SERVER ---
  socket.emit('playerUpdate', {
    name: player.name,
    pos: {
      x: player.pos.x,
      y: player.pos.y + player.height / 2,
      z: player.pos.z
    }
  });
}

// --- 8. MAIN GAME LOOP ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  updatePhysics(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  const newAspect = window.innerWidth / window.innerHeight;
  camera.left = -d * newAspect;
  camera.right = d * newAspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();