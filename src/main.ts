import * as THREE from 'three';
import { Camera } from './model/camera.model';
import { DirectionalLight } from './model/directional-light.model';
import { Player } from './model/player.model';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, CLIMB_BOOST, COBBLESTONE, DIRT, displayBorder, GRASS, GRAVITY, JUMP_FORCE, MAP_SIZE, MAX_HEIGHT, PLAYER_SPEED, SEA_LEVEL, WATER } from './constant';

function getRandomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min); // Random number in [min, max)
}



const mapData: number[][][] = Array.from({ length: MAP_SIZE }, () =>
  Array.from({ length: MAX_HEIGHT }, () =>
    Array.from({ length: MAP_SIZE }, () => AIR)
  )
);

// --- 1. SETUP THREE.JS SCENE & ISOMETRIC CAMERA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);


const camera = new Camera();
const d = camera.d;
camera.position.set(20, 20, 20);
camera.lookAt(MAP_SIZE / 2, 0, MAP_SIZE / 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- 2. LIGHTING & LOW-ANGLE SHADOW CONFIGURATION ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Dropped slightly so cast shadows look deeper
scene.add(ambientLight);

const dirLight = new DirectionalLight();
scene.add(dirLight);

// NEW: Explicit target object added to the scene so Three.js accurately computes the light angle
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

  // N'affiche la bordure que si displayBorder est vrai ET qu'on ne l'a pas désactivée de force
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

// --- 4. GENERATE ROLLING TERRAIN ---
let totalDirtBlocks = 0;
let totalGrassBlocks = 0;
let totalCobblestoneBlocks = 0;
let totalWaterBlocks = 0; // New
let totalBoostBlocks = 0;

for (let x = 0; x < MAP_SIZE; x++) {
  for (let z = 0; z < MAP_SIZE; z++) {
    const waveValue = Math.cos(x * 0.3) * Math.sin(z * 0.3);
    const normalizedHeight = (waveValue + 1) / 2;
    let height = Math.floor(normalizedHeight * (MAX_HEIGHT - 2)) + 2;
    height = height > 0 ? height : 1;

    // 1. Build the solid terrain
    for (let y = 0; y < height; y++) {
      if (y <= 1) {
        mapData[x][y][z] = COBBLESTONE;
        totalCobblestoneBlocks++;
      } else if (y === height - 1) {
        if (getRandomBetween(1, 5) === 1) {
          mapData[x][y][z] = BOOST;
          totalBoostBlocks++;
        } else {
          mapData[x][y][z] = GRASS;
          totalGrassBlocks++;
        }
      } else {
        mapData[x][y][z] = DIRT;
        totalDirtBlocks++;
      }
    }

    // 2. NEW: Fill empty space up to the sea level with water
    for (let y = height; y <= SEA_LEVEL; y++) {
      mapData[x][y][z] = WATER;
      totalWaterBlocks++;
    }
  }
}

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

  // --- LES SECRETS DU RENDU FLUIDE ---
  roughness: 0.1,
  metalness: 0.1,

  depthWrite: false, // Empêche la superposition visuelle des faces internes transparentes
  side: THREE.FrontSide // Force le moteur à ne calculer que les faces extérieures visibles
});
const boostMaterial = new THREE.MeshStandardMaterial({ map: createVoxelTexture(0xcc2222) });


const instancedDirtMesh = new THREE.InstancedMesh(geometry, dirtMaterial, totalDirtBlocks);
const instancedGrassMesh = new THREE.InstancedMesh(geometry, grassMaterial, totalGrassBlocks);
const instancedCobblestoneMesh = new THREE.InstancedMesh(geometry, cobblestoneMaterial, totalCobblestoneBlocks);
const instancedWaterMesh = new THREE.InstancedMesh(waterGeometry, waterMaterial, totalWaterBlocks);
const instancedBoostMesh = new THREE.InstancedMesh(geometry, boostMaterial, totalBoostBlocks);

instancedDirtMesh.castShadow = true;
instancedDirtMesh.receiveShadow = true;
instancedGrassMesh.castShadow = true;
instancedGrassMesh.receiveShadow = true;
instancedCobblestoneMesh.castShadow = true;
instancedCobblestoneMesh.receiveShadow = true;
instancedWaterMesh.castShadow = false;
instancedWaterMesh.receiveShadow = false;
instancedBoostMesh.castShadow = true;
instancedBoostMesh.receiveShadow = true;

let dirtInstanceIdx = 0;
let grassInstanceIdx = 0;
let cobblestoneInstanceIdx = 0;
let waterInstanceIdx = 0; // New
let boostInstanceIdx = 0; // New
const dummy = new THREE.Object3D();

for (let x = 0; x < MAP_SIZE; x++) {
  for (let y = 0; y < MAX_HEIGHT; y++) {
    for (let z = 0; z < MAP_SIZE; z++) {
      const blockId = mapData[x][y][z];

      if (blockId !== AIR) {
        dummy.position.set(
          (x + 0.5) * BLOCK_WIDTH,
          (y + 0.5) * BLOCK_HEIGHT,
          (z + 0.5) * BLOCK_DEPTH
        );
        dummy.updateMatrix();

        if (blockId === COBBLESTONE) {
          instancedCobblestoneMesh.setMatrixAt(cobblestoneInstanceIdx++, dummy.matrix);
        } else if (blockId === GRASS) {
          instancedGrassMesh.setMatrixAt(grassInstanceIdx++, dummy.matrix);
        } else if (blockId === DIRT) {
          instancedDirtMesh.setMatrixAt(dirtInstanceIdx++, dummy.matrix);
        } else if (blockId === WATER) {
          instancedWaterMesh.setMatrixAt(waterInstanceIdx++, dummy.matrix); // New
        } else if (blockId === BOOST) {
          instancedBoostMesh.setMatrixAt(boostInstanceIdx++, dummy.matrix); // New
        }
      }
    }
  }
}

scene.add(instancedDirtMesh);
scene.add(instancedGrassMesh);
scene.add(instancedCobblestoneMesh);
scene.add(instancedWaterMesh);
scene.add(instancedBoostMesh);

// --- FORCER L'ORDRE DE RENDU ---
// Les blocs opaques s'affichent en premier (0 par défaut)
instancedDirtMesh.renderOrder = 0;
instancedGrassMesh.renderOrder = 0;
instancedCobblestoneMesh.renderOrder = 0;
instancedBoostMesh.renderOrder = 0;

// L'eau transparente s'affiche en dernier par-dessus tout le monde
instancedWaterMesh.renderOrder = 1;

// --- 5. THE PLAYER ---


const player = new Player();

scene.add(player.mesh);


// --- 6. INPUT HANDLING ---
const keys: { [key: string]: boolean } = {};
window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);

// --- 7. FULL BODY AABB COLLISION DETECTION ---


function updatePhysics(dt: number) {
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
  if (inputDir.lengthSq() > 0) {
    inputDir.normalize();
  }

  // --- DÉTECTION DE L'EAU ---
  const playerGridX = Math.floor(player.pos.x / BLOCK_WIDTH);
  const playerGridY = Math.floor((player.pos.y + 0.1) / BLOCK_HEIGHT); // Check au niveau des pieds/bas du corps
  const playerGridZ = Math.floor(player.pos.z / BLOCK_DEPTH);

  let isSwimming = false;
  if (playerGridX >= 0 && playerGridX < MAP_SIZE &&
    playerGridY >= 0 && playerGridY < MAX_HEIGHT &&
    playerGridZ >= 0 && playerGridZ < MAP_SIZE) {
    if (mapData[playerGridX][playerGridY][playerGridZ] === WATER) {
      isSwimming = true;
    }

  }

  // --- APPLICATION DES FORCES (NAGE VS MARCHE) ---
  player.vel.x = inputDir.x * PLAYER_SPEED;
  player.vel.z = inputDir.z * PLAYER_SPEED;
  const feetGridX = Math.floor(player.pos.x / BLOCK_WIDTH);
  const feetGridY = Math.floor((player.pos.y - 0.1) / BLOCK_HEIGHT);
  const feetGridZ = Math.floor(player.pos.z / BLOCK_DEPTH);

  if (isSwimming) {
    // Physique dans l'eau : Gravité très faible (flottaison)
    player.vel.y += (GRAVITY * 0.15) * dt;
    // Frein hydrodynamique pour pas couler à l'infini
    player.vel.y *= 0.9;

    // Contrôle vertical dans l'eau (touche Espace pour remonter)
    if (keys['Space']) {
      if (mapData[feetGridX][feetGridY + 1][feetGridZ] === AIR) {
        player.vel.y -= (GRAVITY * 0.15) * dt;
        console.log(player.vel.y);
        if (player.vel.y < 0.05) {
          player.vel.y = 0;

        }
      }
      else {
        player.vel.y = PLAYER_SPEED * 0.6;

      }
    }
    player.onGround = false;
  } else {
    // Physique normale au sol
    player.vel.y += GRAVITY * dt;

    if (keys['Space'] && player.onGround) {
      // --- DÉTECTION DU BLOC DE BOOST SOUS LES PIEDS ---
      // On cherche le bloc juste en dessous (Y - 0.1) du bas de la hitbox du joueur


      let currentJumpForce = JUMP_FORCE;

      if (feetGridX >= 0 && feetGridX < MAP_SIZE &&
        feetGridY >= 0 && feetGridY < MAX_HEIGHT &&
        feetGridZ >= 0 && feetGridZ < MAP_SIZE) {

        if (mapData[feetGridX][feetGridY][feetGridZ] === BOOST) {
          currentJumpForce = JUMP_FORCE * 1.5; // Double la force de saut !
        }
      }

      player.vel.y = currentJumpForce;
      player.onGround = false;
    }
  }

  const nextPos = player.pos.clone();


  // 1. Mouvement X
  nextPos.x += player.vel.x * dt;
  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.x = nextPos.x;
  } else {
    // Si on est dans l'eau et qu'on tape un mur en X, on essaie de grimper
    if (isSwimming && inputDir.x !== 0) {
      const checkClimbPos = player.pos.clone();
      checkClimbPos.y += BLOCK_HEIGHT; // On vérifie s'il y a de la place un bloc plus haut
      checkClimbPos.x += Math.sign(player.vel.x) * 0.2; // Un peu vers l'avant en X

      if (!player.checkVoxelBoxCollision(checkClimbPos, mapData)) {
        player.vel.y = CLIMB_BOOST; // Donne l'impulsion verticale pour sortir de l'eau
      }
    }
    nextPos.x = player.pos.x;
    player.vel.x = 0;
  }

  // 2. Mouvement Z
  nextPos.z += player.vel.z * dt;
  if (!player.checkVoxelBoxCollision(nextPos, mapData)) {
    player.pos.z = nextPos.z;
  } else {
    // Si on est dans l'eau et qu'on tape un mur en Z, on essaie de grimper
    if (isSwimming && inputDir.z !== 0) {
      const checkClimbPos = player.pos.clone();
      checkClimbPos.y += BLOCK_HEIGHT; // On vérifie s'il y a de la place un bloc plus haut
      checkClimbPos.z += Math.sign(player.vel.z) * 0.2; // Un peu vers l'avant en Z

      if (!player.checkVoxelBoxCollision(checkClimbPos, mapData)) {
        player.vel.y = CLIMB_BOOST; // Donne l'impulsion verticale pour sortir de l'eau
      }
    }
    nextPos.z = player.pos.z;
    player.vel.z = 0;
  }

  // 3. Mouvement Y
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

  // --- MISE À JOUR VISUELLE DU JOUEUR (BASCULE HORIZONTALE) ---
  if (isSwimming) {
    // 1. Aligner la rotation de la capsule avec la direction de son déplacement
    if (inputDir.lengthSq() > 0) {
      const angle = Math.atan2(inputDir.x, inputDir.z);
      player.mesh.rotation.set(0, angle, 0);       // Rotation de base face à la direction
      player.mesh.rotateX(Math.PI / 2);            // Couche la capsule en avant
    } else {
      // Si immobile dans l'eau, reste couché vers l'avant par défaut
      player.mesh.rotation.set(Math.PI / 2, 0, 0);
    }

    // 2. Plonger à mi-hauteur : On abaisse la position visuelle du mesh par rapport à sa hitbox réelle
    player.mesh.position.set(
      player.pos.x,
      player.pos.y + (player.height * 0.1), // Rabaissé pour l'effet "immergé à moitié"
      player.pos.z
    );

  } else {
    // Mode normal : Debout, pas de rotation en X/Z
    player.mesh.rotation.set(0, 0, 0);
    player.mesh.position.set(player.pos.x, player.pos.y + (player.height / 2), player.pos.z);
  }

  // --- CAMÉRA & LUMIÈRE ---
  const targetCamX = player.pos.x + 15;
  const targetCamY = player.pos.y + 15;
  const targetCamZ = player.pos.z + 15;

  camera.position.x += (targetCamX - camera.position.x) * 0.1;
  camera.position.y += (targetCamY - camera.position.y) * 0.1;
  camera.position.z += (targetCamZ - camera.position.z) * 0.1;
  camera.lookAt(player.pos.x, player.pos.y, player.pos.z);

  dirLightTarget.position.set(player.pos.x, player.pos.y, player.pos.z);
  dirLight.position.set(player.pos.x - 25, player.pos.y + 18, player.pos.z - 10);
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