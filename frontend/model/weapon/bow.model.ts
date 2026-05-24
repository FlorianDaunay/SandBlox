import * as THREE from 'three';
import { RangedWeapon, ProjectileConfig } from './ranged-weapon.model.js';

export class Bow extends RangedWeapon {
    constructor(id: string) {
        super(id, 'Bow', 15, 600, 55);
        this.initVisuals();
    }

    public initVisuals(): void {
        const bowGroup = new THREE.Group();

        const limbGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0);
        const limbMat = new THREE.MeshBasicMaterial({ color: 0x8b4513 });
        const limb = new THREE.Mesh(limbGeo, limbMat);
        limb.rotation.z = Math.PI / 4;
        bowGroup.add(limb);

        const stringGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.9);
        const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const bowString = new THREE.Mesh(stringGeo, stringMat);
        bowString.position.x = -0.15;
        bowGroup.add(bowString);

        this.mesh = bowGroup;
    }

    protected getProjectileConfig(): ProjectileConfig {
        return {
            speed: 30,
            useGravity: true,
            gravityScale: 12.0,
            color: 0xd2b48c,
            size: new THREE.Vector3(0.08, 0.08, 0.8),
            projectileType: 'arrow'
        };
    }
}