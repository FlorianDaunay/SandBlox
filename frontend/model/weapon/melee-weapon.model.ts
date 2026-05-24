import * as THREE from 'three';
import { Weapon } from './weapon.model.js';

export type MeleeMotionPattern = 'slash' | 'thrust' | 'overhead';

export abstract class MeleeWeapon extends Weapon {
    public motionPattern: MeleeMotionPattern = 'slash';
    protected isAnimating: boolean = false;
    protected animationTime: number = 0;
    protected animationDuration: number = 0.2;

    constructor(id: string, name: string, damage: number, attackSpeed: number, range: number) {
        super(id, name, 'melee', damage, attackSpeed, range);
    }

    public executeAttackLogic(...args: any[]): void {
        this.isAnimating = true;
        this.animationTime = 0;
    }

    public abstract initVisuals(): void;

    public abstract update(dt: number, scene: THREE.Scene, mapData: number[][][]): void;
}