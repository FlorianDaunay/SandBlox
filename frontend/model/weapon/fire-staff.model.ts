import * as THREE from 'three';
import { RangedWeapon, ProjectileConfig } from './ranged-weapon.model.js';

export class FireStaff extends RangedWeapon {
    constructor(id: string) {
        super(id, 'Fire Staff', 25, 800, 45);
        this.initVisuals();
    }

    public initVisuals(): void {
        const geo = new THREE.CylinderGeometry(0.05, 0.05, 1.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
        this.mesh = new THREE.Mesh(geo, mat);
    }

    protected getProjectileConfig(): ProjectileConfig {
        return {
            speed: 20,
            useGravity: false,
            color: 0xff4500,
            size: new THREE.Vector3(0.4, 0.4, 0.4),
            projectileType: 'fireball'
        };
    }
}