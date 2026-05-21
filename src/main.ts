import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { Camera } from './model/camera.model.js';
import { DirectionalLight } from './model/directional-light.model.js';
import { Player } from './model/player.model.js';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, CLIMB_BOOST, COBBLESTONE, DIRT, displayBorder, GRASS, GRAVITY, JUMP_FORCE, MAP_SIZE, MAX_HEIGHT, PLAYER_SPEED, WATER } from './constant.js';

// --- 1. NETWORKING SETUP ---
const SERVER_URL = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;


const socket: Socket = io(SERVER_URL);

let mapData: number[][][] | null = null;
// CHANGED: Store instances of the Player class instead of raw THREE.Mesh
const remotePlayers: Record<string, Player> = {};
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

// --- 3. BORDER TEXTURE GENERATOR ---
function createVoxelTexture(baseColorHex: number, forceNoBorder: boolean = false): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = `#${baseColorHex.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, 16, 16);

  if (displayBorder && !forceNoBorder) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 16, 16);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

// Geometries & Materials
const geometry = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH);
const waterGeometry = new THREE.PlaneGeometry(BLOCK_WIDTH, BLOCK_DEPTH);
waterGeometry.rotateX(-Math.PI / 2);
waterGeometry.translate(0, BLOCK_HEIGHT / 2, 0);

const dirtMaterial = new THREE.MeshStandardMaterial({ map: createVoxelTexture(0x95522c) });
const grassMaterial = new THREE.MeshStandardMaterial({ map: createVoxelTexture(0x7cfc00) });
const cobblestoneMaterial = new THREE.MeshStandardMaterial({ map: createVoxelTexture(0xbbbbbb) });
const waterMaterial = new THREE.MeshStandardMaterial({
  map: createVoxelTexture(0x1e90ff, true),
  transparent: true,
  opacity: 0.6,
  roughness: 0.1,
  metalness: 0.1,
  depthWrite: false,
  side: THREE.FrontSide
});
const boostMaterial = new THREE.MeshStandardMaterial({ map: createVoxelTexture(0xcc2222) });

// --- 4. MAP RENDERING FUNCTION ---
function buildWorldFromData(data: number[][][]) {
  let totalDirt = 0, totalGrass = 0, totalCobble = 0, totalWater = 0, totalBoost = 0;

  for (let x = 0; x < MAP_SIZE; x++) {
    for (let y = 0; y < MAX_HEIGHT; y++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        const id = data[x][y][z];
        if (id === COBBLESTONE) totalCobble++;
        else if (id === GRASS) totalGrass++;
        else if (id === DIRT) totalDirt++;
        else if (id === WATER) totalWater++;
        else if (id === BOOST) totalBoost++;
      }
    }
  }

  const instancedDirtMesh = new THREE.InstancedMesh(geometry, dirtMaterial, totalDirt);
  const instancedGrassMesh = new THREE.InstancedMesh(geometry, grassMaterial, totalGrass);
  const instancedCobblestoneMesh = new THREE.InstancedMesh(geometry, cobblestoneMaterial, totalCobble);
  const instancedWaterMesh = new THREE.InstancedMesh(waterGeometry, waterMaterial, totalWater);
  const instancedBoostMesh = new THREE.InstancedMesh(geometry, boostMaterial, totalBoost);

  const meshes = [instancedDirtMesh, instancedGrassMesh, instancedCobblestoneMesh, instancedBoostMesh];
  meshes.forEach(m => { m.castShadow = true; m.receiveShadow = true; m.renderOrder = 0; });
  instancedWaterMesh.castShadow = false; instancedWaterMesh.receiveShadow = false; instancedWaterMesh.renderOrder = 1;

  let dIdx = 0, gIdx = 0, cIdx = 0, wIdx = 0, bIdx = 0;
  const dummy = new THREE.Object3D();

  for (let x = 0; x < MAP_SIZE; x++) {
    for (let y = 0; y < MAX_HEIGHT; y++) {
      for (let z = 0; z < MAP_SIZE; z++) {
        const blockId = data[x][y][z];
        if (blockId !== AIR) {
          dummy.position.set((x + 0.5) * BLOCK_WIDTH, (y + 0.5) * BLOCK_HEIGHT, (z + 0.5) * BLOCK_DEPTH);
          dummy.updateMatrix();

          if (blockId === COBBLESTONE) instancedCobblestoneMesh.setMatrixAt(cIdx++, dummy.matrix);
          else if (blockId === GRASS) instancedGrassMesh.setMatrixAt(gIdx++, dummy.matrix);
          else if (blockId === DIRT) instancedDirtMesh.setMatrixAt(dIdx++, dummy.matrix);
          else if (blockId === WATER) instancedWaterMesh.setMatrixAt(wIdx++, dummy.matrix);
          else if (blockId === BOOST) instancedBoostMesh.setMatrixAt(bIdx++, dummy.matrix);
        }
      }
    }
  }

  scene.add(instancedDirtMesh, instancedGrassMesh, instancedCobblestoneMesh, instancedWaterMesh, instancedBoostMesh);
}

// --- 5. LOCAL PLAYER & INPUTS ---
const player = new Player("", 10, 4, 10, 0xff0000);
scene.add(player.mesh);

const keys: { [key: string]: boolean } = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

const clientPlayers: Record<string, Player> = {}; // Local player instances with meshes

// 1. Handshake: Get all current players when joining
socket.on('initWorld', ({ mapData: serverMap, currentPlayers }) => {
  mapData = serverMap;
  buildWorldFromData(mapData!);
  isInitialized = true;

  for (const id in currentPlayers) {
    if (id !== socket.id && !clientPlayers[id]) {
      const p = currentPlayers[id];
      clientPlayers[id] = new Player(id, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);
      scene.add(clientPlayers[id].mesh);
    }
  }
});

// 2. Someone else joins later
socket.on('playerJoined', (p) => {
  if (p.id !== socket.id && !clientPlayers[p.id]) {
    clientPlayers[p.id] = new Player(p.id, p.pos.x, p.pos.y, p.pos.z, 0x0000ff);
    scene.add(clientPlayers[p.id].mesh);
  }
});

// 3. Keep positions in sync (The 30Hz loop)
socket.on('stateUpdate', (serverPlayers) => {
  for (const id in serverPlayers) {
    if (id !== socket.id) {
      const serverPlayerData = serverPlayers[id];
      const localPlayer = clientPlayers[id];

      if (localPlayer && serverPlayerData && serverPlayerData.pos) {
        // Read the raw JSON properties safely and update the Three.js mesh position
        localPlayer.pos.set(serverPlayerData.pos.x, serverPlayerData.pos.y + localPlayer.height / 2, serverPlayerData.pos.z);
        localPlayer.mesh.position.copy(localPlayer.pos);
      }
    }
  }
});

// 4. Clean up when someone leaves
socket.on('playerLeft', (id) => {
  if (clientPlayers[id]) {
    scene.remove(clientPlayers[id].mesh); // Delete their capsule from the game world
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

  const nextPos = player.pos.clone();

  // X movement
  nextPos.x += player.vel.x * dt;
  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.x = nextPos.x;
  } else {
    if (isSwimming && inputDir.x !== 0) {
      const checkClimbPos = player.pos.clone();
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
      const checkClimbPos = player.pos.clone();
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
      player.mesh.rotation.set(0, angle, 0);
      player.mesh.rotateX(Math.PI / 2);
    } else {
      player.mesh.rotation.set(Math.PI / 2, 0, 0);
    }
    player.mesh.position.set(player.pos.x, player.pos.y + (player.height * 0.1), player.pos.z);
  } else {
    player.mesh.rotation.set(0, 0, 0);
    player.mesh.position.set(player.pos.x, player.pos.y + (player.height / 2), player.pos.z);
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
    pos: {
      x: player.pos.x,
      y: player.pos.y,
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