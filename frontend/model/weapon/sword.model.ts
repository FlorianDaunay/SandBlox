import * as THREE from 'three';
import { MeleeWeapon } from "./melee-weapon.model.js";

export class Sword extends MeleeWeapon {
    constructor(id: string) {
        super(id, 'Iron Sword', 30, 400, 2.5);
        this.motionPattern = 'slash';
        this.initVisuals();
    }

    public initVisuals(): void {
        const group = new THREE.Group();
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 1.2, 0.1),
            new THREE.MeshStandardMaterial({ color: 0xcccccc })
        );
        blade.position.y = 0.6; // Pivot from the handle bottom
        group.add(blade);
        this.mesh = group;
        this.mesh.position.set(0.4, -0.3, 0.4);
    }

    public update(dt: number, scene: THREE.Scene, mapData: number[][][]): void {
        if (!this.mesh) return;

        this.mesh.position.set(0.4, -0.3, 0.4);

        if (this.isAnimating) {
            this.animationTime += dt;
            const progress = this.animationTime / this.animationDuration;

            if (progress >= 1) {
                this.isAnimating = false;
                this.mesh.rotation.set(0, 0, 0);
            } else {
                // Slash animation: Rotate along the Y and Z axes over time
                const angle = Math.sin(progress * Math.PI) * 1.2;
                this.mesh.rotation.set(0, -angle, -angle);
            }
        } else {
            this.mesh.rotation.set(0, 0, 0);
        }
    }
}