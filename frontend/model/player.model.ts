import * as THREE from 'three';
import { AIR, BLOCK_DEPTH, BLOCK_HEIGHT, BLOCK_WIDTH, MAP_SIZE, MAX_HEIGHT, WATER } from '../constant.js';
import { Weapon } from './weapon/weapon.model.js';

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

    // Health properties
    public lifePoints: number;
    public maxLifePoints: number;

    // Weapon Inventory Properties
    public equippedWeapon: Weapon | null = null;
    private weaponHandNode?: THREE.Group; // Node tracking hand positioning

    // Make these optional since they won't exist on the server
    public geo?: THREE.CapsuleGeometry;
    public mat?: THREE.MeshStandardMaterial;
    public mesh?: THREE.Mesh;
    public tag?: THREE.Sprite;
    public healthBar?: THREE.Sprite;
    private healthCanvas?: HTMLCanvasElement;
    private healthCtx?: CanvasRenderingContext2D | null;

    constructor(id: string, name: string, x: number, y: number, z: number, color: THREE.ColorRepresentation, maxLifePoints: number = 100, lifePoints: number = 100) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.radius = 0.25;
        this.bodyHeight = 0.5;
        this.height = this.bodyHeight + (this.radius * 2);
        this.pos = new THREE.Vector3(x, y + this.height / 2, z);
        this.vel = new THREE.Vector3(0, 0, 0);

        this.onGround = false;

        // Initialize health
        this.maxLifePoints = maxLifePoints;
        this.lifePoints = lifePoints;

        if (typeof window !== 'undefined') {
            this.geo = new THREE.CapsuleGeometry(this.radius, this.bodyHeight, 4, 8);
            this.mat = new THREE.MeshStandardMaterial({ color: color });
            this.mesh = new THREE.Mesh(this.geo, this.mat);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;

            // Set up a standard relative attachment point for carrying items
            this.weaponHandNode = new THREE.Group();
            // Position down and forward relative to center capsule geometry
            this.weaponHandNode.position.set(0.3, -0.1, 0.3);
            this.mesh.add(this.weaponHandNode);

            // Name Tag Setup
            this.tag = this.create3DNameTag(this.name);
            this.tag.position.set(0, this.height + 0.6, 0);
            this.mesh.add(this.tag);

            // Health Bar Setup
            this.initHealthBar();
        }
    }

    public equipWeapon(weapon: Weapon | null) {
        // Drop current mesh from parent if it exists
        if (this.equippedWeapon && this.equippedWeapon.mesh && this.weaponHandNode) {
            this.weaponHandNode.remove(this.equippedWeapon.mesh);
        }

        this.equippedWeapon = weapon;
        if (!weapon) return;

        // Initialize client elements if running on DOM environments
        if (typeof window !== 'undefined' && this.weaponHandNode) {
            weapon.initVisuals();
            if (weapon.mesh) {
                // Orient item facing forward along default Z axes
                weapon.mesh.rotation.set(0, 0, 0);
                this.weaponHandNode.add(weapon.mesh);
            }
        }
    }

    public useWeapon(): boolean {
        if (!this.equippedWeapon) return false;
        return this.equippedWeapon.attack();
    }

    public verifyHit(target: Player, lookDirection: THREE.Vector3): boolean {
        if (!this.equippedWeapon) return false;

        const distance = this.pos.distanceTo(target.pos);
        if (distance > this.equippedWeapon.range) return false;

        if (this.equippedWeapon.type === 'melee') {
            // Directional conical boundary check for short range sweeps
            const toTarget = new THREE.Vector3().subVectors(target.pos, this.pos).normalize();
            const angle = lookDirection.angleTo(toTarget);

            // Allow ~45 degrees leeway left or right (PI / 4)
            return angle <= Math.PI / 4;
        } else {
            // Ranged validation uses simplified direct line-of-sight ray calculation
            const ray = new THREE.Ray(this.pos, lookDirection);
            const targetSphere = new THREE.Sphere(target.pos, target.radius + 0.1);
            return ray.intersectsSphere(targetSphere);
        }
    }

    private initHealthBar() {
        this.healthCanvas = document.createElement('canvas');
        this.healthCanvas.width = 128;
        this.healthCanvas.height = 16;
        this.healthCtx = this.healthCanvas.getContext('2d');

        const texture = new THREE.CanvasTexture(this.healthCanvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        this.healthBar = new THREE.Sprite(material);
        this.healthBar.scale.set(1.2, 0.15, 1);
        this.healthBar.position.set(0, this.height + 0.25, 0);
        this.healthBar.renderOrder = 3;

        this.mesh!.add(this.healthBar);
        this.drawHealthBar();
    }

    private drawHealthBar() {
        if (!this.healthCtx || !this.healthCanvas || !this.healthBar) return;

        const ctx = this.healthCtx;
        const w = this.healthCanvas.width;
        const h = this.healthCanvas.height;
        const healthPct = Math.max(0, Math.min(1, this.lifePoints / this.maxLifePoints));

        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 4);
        ctx.fill();

        if (healthPct > 0) {
            let healthColor = '#42f55a';
            if (healthPct < 0.25) {
                healthColor = '#f54242';
            } else if (healthPct < 0.6) {
                healthColor = '#f5a442';
            }

            ctx.fillStyle = healthColor;
            ctx.beginPath();
            ctx.roundRect(2, 2, (w - 4) * healthPct, h - 4, 2);
            ctx.fill();
        }

        if (this.healthBar.material.map) {
            this.healthBar.material.map.needsUpdate = true;
        }
    }

    public setLifePoints(points: number) {
        this.lifePoints = Math.max(0, Math.min(this.maxLifePoints, points));
        this.drawHealthBar();
    }

    public damage(amount: number) {
        this.setLifePoints(this.lifePoints - amount);
    }

    public heal(amount: number) {
        this.setLifePoints(this.lifePoints + amount);
    }

    public updateColor(color: THREE.ColorRepresentation) {
        this.color = color;
        if (this.mesh) {
            const oldMat = this.mat;
            this.mat = new THREE.MeshStandardMaterial({ color: color });
            this.mesh.material = this.mat;
            if (oldMat) oldMat.dispose();
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

        canvas.width = 256;
        canvas.height = 64;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(0, 0, canvas.width, canvas.height, 16);
        ctx.fill();

        ctx.font = 'bold 30px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2, 0.5, 1);
        sprite.renderOrder = 2;
        return sprite;
    }
}