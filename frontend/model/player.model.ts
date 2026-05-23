import * as THREE from 'three';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, MAP_SIZE, MAX_HEIGHT, WATER } from '../constant.js';

export class Player {

    public id: string;
    public name: string;
    public color: THREE.ColorRepresentation;
    public pos: THREE.Vector3;
    public vel: THREE.Vector3;
    public radius: number;
    public bodyHeight: number;
    public height: number;
    public onGround: boolean;

    // Make these optional since they won't exist on the server
    public geo?: THREE.CapsuleGeometry;
    public mat?: THREE.MeshStandardMaterial;
    public mesh?: THREE.Mesh;
    public tag?: THREE.Sprite;

    constructor(id: string, name: string, x: number, y: number, z: number, color: THREE.ColorRepresentation) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.radius = 0.25;
        this.bodyHeight = 0.5;
        this.height = this.bodyHeight + (this.radius * 2);
        this.pos = new THREE.Vector3(x, y + this.height / 2, z);
        this.vel = new THREE.Vector3(0, 0, 0);

        this.onGround = false;

        if (typeof window !== 'undefined') {
            this.geo = new THREE.CapsuleGeometry(this.radius, this.bodyHeight, 4, 8);
            this.mat = new THREE.MeshStandardMaterial({ color: color });
            this.mesh = new THREE.Mesh(this.geo, this.mat);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;

            this.tag = this.create3DNameTag(this.name);
            this.tag.position.set(0, this.height + 0.5, 0);
            this.mesh.add(this.tag);
        }
    }

    public updateColor(color: THREE.ColorRepresentation) {
        this.color = color;
        if (this.mesh) {
            this.mat = new THREE.MeshStandardMaterial({ color: color });
            this.mesh = new THREE.Mesh(this.geo, this.mat);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
        }
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

    private create3DNameTag(name: string): THREE.Sprite {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        canvas.width = 256;  // Tighter texture bounds
        canvas.height = 64;

        // Fill the entire canvas area with a pill shape
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(0, 0, canvas.width, canvas.height, 16);
        ctx.fill();

        // Center the text perfectly
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);

        // Convert canvas to a Three.js texture
        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter; // Smooth filtering

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);

        // Scale the sprite box proportions (Width, Height, Depth)
        sprite.scale.set(2, 0.5, 1);
        sprite.renderOrder = 2;
        return sprite;
    }
}