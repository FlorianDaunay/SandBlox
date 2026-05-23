import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, BOOST, COBBLESTONE, DIRT, displayBorder, GRASS, MAP_SIZE, MAX_HEIGHT, WATER } from "../constant.js";
import * as THREE from 'three';


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

export function buildWorldFromData(data: number[][][], scene: THREE.Scene) {
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
