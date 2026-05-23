import * as THREE from 'three';

export class DirectionalLight extends THREE.DirectionalLight {

    constructor() {

        super(0xffffff, 0.9);
        this.position.set(30, 18, 10);
        this.castShadow = true;

        // Since the light angle is shallower, shadows stretch further. We expand the frustum box to capture them.
        this.shadow.camera.left = -20;
        this.shadow.camera.right = 20;
        this.shadow.camera.top = 20;
        this.shadow.camera.bottom = -20;
        this.shadow.camera.near = 0.5;
        this.shadow.camera.far = 80;

        this.shadow.mapSize.width = 2048;
        this.shadow.mapSize.height = 2048;
        this.shadow.bias = -0.0003;
    }
}