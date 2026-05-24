import * as THREE from 'three';
import { Weapon } from './weapon.model.js';

export interface ProjectileConfig {
    speed: number;
    useGravity: boolean;
    gravityScale?: number;
    color: number;
    size: THREE.Vector3;
    projectileType: 'arrow' | 'fireball';
}

export abstract class RangedWeapon extends Weapon {
    constructor(id: string, name: string, damage: number, attackSpeed: number, range: number) {
        super(id, name, 'ranged', damage, attackSpeed, range);
    }

    public use(): boolean {
        const now = performance.now();
        if (now - this.lastAttackTime < this.attackSpeed) return false;
        this.lastAttackTime = now;
        return true;
    }

    public executeAttackLogic(...args: any[]): void { }

    public fire(scene: THREE.Scene, lookDirection: THREE.Vector3, playerWorldPos: THREE.Vector3, playerHeight: number): any {
        if (!this.mesh) return null;

        const isolatedDirection = lookDirection.clone().normalize();
        const spawnOrigin = playerWorldPos.clone();
        spawnOrigin.y += playerHeight / 2;
        spawnOrigin.addScaledVector(isolatedDirection, 1.2);

        const config = this.getProjectileConfig();

        return {
            origin: spawnOrigin,
            direction: isolatedDirection,
            ...config
        };
    }

    protected abstract getProjectileConfig(): ProjectileConfig;
    public abstract initVisuals(): void;

    public update(dt: number, scene: THREE.Scene, mapData: number[][][]): void {
        if (!this.mesh) return;
        this.mesh.position.set(0.5, -0.2, 0.5);
        this.mesh.rotation.set(0, 0, 0);
    }
}