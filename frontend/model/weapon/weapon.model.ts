import * as THREE from 'three';

export type WeaponType = 'melee' | 'ranged';

export abstract class Weapon {
    public id: string;
    public name: string;
    public type: WeaponType;
    public damage: number;
    public attackSpeed: number; // Attacks per second
    public range: number;

    protected lastAttackTime: number = 0;
    public mesh?: THREE.Object3D;

    constructor(id: string, name: string, type: WeaponType, damage: number, attackSpeed: number, range: number) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.damage = damage;
        this.attackSpeed = attackSpeed;
        this.range = range;
    }

    public mountaineerCooldown(): number {
        return 1000 / this.attackSpeed;
    }

    public canAttack(): boolean {
        const now = performance.now();
        return now - this.lastAttackTime >= this.mountaineerCooldown();
    }

    public attack(): boolean {
        if (!this.canAttack()) return false;
        this.lastAttackTime = performance.now();
        this.executeAttackLogic();
        return true;
    }

    // Lifecycle hooks for attaching weapons to your Player entity
    public onEquip(parentMesh: THREE.Object3D): void {
        if (this.mesh) parentMesh.add(this.mesh);
    }

    public onUnequip(parentMesh: THREE.Object3D): void {
        if (this.mesh) parentMesh.remove(this.mesh);
    }

    protected abstract executeAttackLogic(): void;
    public abstract initVisuals(): void;
    public abstract update(dt: number, scene: THREE.Scene, mapData: number[][][]): void;
}