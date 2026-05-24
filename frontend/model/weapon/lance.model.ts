import * as THREE from 'three';
import { MeleeWeapon } from "./melee-weapon.model.js";

export class Lance extends MeleeWeapon {
    constructor(id: string) {
        super(id, 'Steel Lance', 40, 500, 4.0);
        this.motionPattern = 'thrust';
        this.initVisuals();
    }

    public initVisuals(): void {
        const group = new THREE.Group();
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 2.0),
            new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
        );
        shaft.rotation.x = Math.PI / 2; // Point forward
        shaft.position.z = 1.0; // Pivot from the base
        group.add(shaft);
        this.mesh = group;
        this.mesh.position.set(0.4, -0.3, 0.2);
    }

    public update(dt: number, scene: THREE.Scene, mapData: number[][][]): void {
        if (!this.mesh) return;

        if (this.isAnimating) {
            this.animationTime += dt;
            const progress = this.animationTime / this.animationDuration;

            if (progress >= 1) {
                this.isAnimating = false;
                this.mesh.position.set(0.4, -0.3, 0.2);
            } else {
                // Thrust animation: Push forward along Z axis and pull back
                const thrustOffset = Math.sin(progress * Math.PI) * 1.5;
                this.mesh.position.set(0.4, -0.3, 0.2 + thrustOffset);
            }
        } else {
            this.mesh.position.set(0.4, -0.3, 0.2);
        }
        this.mesh.rotation.set(0, 0, 0);
    }
}