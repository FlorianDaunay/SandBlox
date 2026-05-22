import * as THREE from 'three';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, MAP_SIZE, MAX_HEIGHT, WATER } from '../constant.js';

export class Player {

    public id: string;
    public name: string;
    public pos: THREE.Vector3;
    public vel: THREE.Vector3;
    public radius: number;
    public bodyHeight: number;
    public height: number;
    public onGround: boolean;

    public geo: THREE.CapsuleGeometry;
    public mat: THREE.MeshStandardMaterial;
    public mesh: THREE.Mesh;

    constructor(id: string, name: string, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
        this.id = id;
        this.name = name;
        this.pos = new THREE.Vector3(x, y, z);
        this.vel = new THREE.Vector3(0, 0, 0);
        this.radius = 0.25;
        this.bodyHeight = 0.5;
        this.height = this.bodyHeight + (this.radius * 2)
        this.onGround = false;

        this.geo = new THREE.CapsuleGeometry(this.radius, this.bodyHeight, 4, 8);
        this.mat = new THREE.MeshStandardMaterial({ color: color });
        this.mesh = new THREE.Mesh(this.geo, this.mat);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
    }

    public checkVoxelBoxCollision(pos: THREE.Vector3, mapData: number[][][]): boolean {
        const minX = pos.x - this.radius;
        const maxX = pos.x + this.radius;
        const minY = pos.y;
        const maxY = pos.y + this.height;
        const minZ = pos.z - this.radius;
        const maxZ = pos.z + this.radius;

        const startGridX = Math.floor(minX / BLOCK_WIDTH);
        const endGridX = Math.floor(maxX / BLOCK_WIDTH);
        const startGridY = Math.floor(minY / BLOCK_HEIGHT);
        const endGridY = Math.floor(maxY / BLOCK_HEIGHT);
        const startGridZ = Math.floor(minZ / BLOCK_DEPTH);
        const endGridZ = Math.floor(maxZ / BLOCK_DEPTH);

        for (let x = startGridX; x <= endGridX; x++) {
            for (let y = startGridY; y <= endGridY; y++) {
                for (let z = startGridZ; z <= endGridZ; z++) {
                    if (x < 0 || x >= MAP_SIZE || z < 0 || z >= MAP_SIZE) return true;
                    if (y < 0) return true;
                    if (y >= MAX_HEIGHT) continue;

                    if (mapData[x][y][z] !== AIR && mapData[x][y][z] !== WATER) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}