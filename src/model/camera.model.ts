import * as THREE from 'three';

export class Camera extends THREE.OrthographicCamera {
    public aspect: number;
    public d: number;

    constructor() {
        const aspect = window.innerWidth / window.innerHeight;
        const d = 8;

        super(-d * aspect, d * aspect, d, -d, 1, 1000);

        this.aspect = aspect;
        this.d = d;
    }
}