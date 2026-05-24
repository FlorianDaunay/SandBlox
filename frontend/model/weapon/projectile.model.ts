import * as THREE from 'three';
import { BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_DEPTH, AIR, WATER } from '../../constant.js';

export class ProjectileEntity {
    public mesh: THREE.Mesh;
    public velocity: THREE.Vector3;
    public maxRange: number;
    public distanceTraveled: number = 0;
    public useGravity: boolean;
    public gravityScale: number;
    public damage: number;
    public id: string;
    public ownerId: string;

    constructor(id: string, ownerId: string, origin: THREE.Vector3, direction: THREE.Vector3, damage: number, maxRange: number, config: any) {
        this.id = id;
        this.ownerId = ownerId;
        this.damage = damage;
        this.maxRange = maxRange;
        this.useGravity = config.useGravity;
        this.gravityScale = config.gravityScale ?? 9.8;

        this.velocity = direction.clone().normalize().multiplyScalar(config.speed);

        // Create visible geometry based on type
        let geometry: THREE.BufferGeometry;
        if (config.projectileType === 'fireball') {
            geometry = new THREE.SphereGeometry(config.size.x / 2, 8, 8);
        } else {
            geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
        }

        const material = new THREE.MeshBasicMaterial({
            color: config.color,
            toneMapped: false
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(origin);

        // Point the mesh geometry down its path of movement
        this.mesh.lookAt(origin.clone().add(this.velocity));
    }

    /**
     * Updates frame updates. Returns false if the projectile needs to be destroyed.
     */
    public update(dt: number, mapData: number[][][]): boolean {
        // Apply ballistic curve calculations if gravity is active
        if (this.useGravity) {
            this.velocity.y -= this.gravityScale * dt;
            this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
        }

        // Calculate dynamic translation steps
        const stepMove = this.velocity.clone().multiplyScalar(dt);
        this.mesh.position.add(stepMove);
        this.distanceTraveled += stepMove.length();

        // Check 1: Maximum range falloff
        if (this.distanceTraveled >= this.maxRange) return false;

        // Check 2: Voxel grid map structure collisions
        const gx = Math.floor(this.mesh.position.x / BLOCK_WIDTH);
        const gy = Math.floor(this.mesh.position.y / BLOCK_HEIGHT);
        const gz = Math.floor(this.mesh.position.z / BLOCK_DEPTH);

        if (mapData[gx]?.[gy]?.[gz] !== undefined) {
            const blockType = mapData[gx][gy][gz];
            // If the block is not air or water, it's solid map terrain -> Collide!
            if (blockType !== AIR && blockType !== WATER) {
                return false;
            }
        }

        return true; // Keep traveling
    }
}