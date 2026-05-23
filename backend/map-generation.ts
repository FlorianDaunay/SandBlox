import { AIR, BOOST, COBBLESTONE, DIRT, GRASS, MAP_SIZE, MAX_HEIGHT, SEA_LEVEL, WATER } from "../frontend/constant";
import { getRandomBetween } from "./utils";



export class MapGrid {
    public grid: number[][][] = [];


    constructor() {
        this.generateServerMap();
    }

    generateServerMap() {
        this.grid = Array.from({ length: MAP_SIZE }, () =>
            Array.from({ length: MAX_HEIGHT }, () =>
                Array.from({ length: MAP_SIZE }, () => AIR)
            )
        );

        for (let x = 0; x < MAP_SIZE; x++) {
            for (let z = 0; z < MAP_SIZE; z++) {
                const waveValue = Math.cos(x * 0.3) * Math.sin(z * 0.3);
                const normalizedHeight = (waveValue + 1) / 2;
                let height = Math.floor(normalizedHeight * (MAX_HEIGHT - 2)) + 2;
                height = height > 0 ? height : 1;

                for (let y = 0; y < height; y++) {
                    if (y <= 1) {
                        this.grid[x][y][z] = COBBLESTONE;
                    } else if (y === height - 1) {
                        if (getRandomBetween(1, 5) === 1) {
                            this.grid[x][y][z] = BOOST;
                        } else {
                            this.grid[x][y][z] = GRASS;
                        }
                    } else {
                        this.grid[x][y][z] = DIRT;
                    }
                }

                for (let y = height; y <= SEA_LEVEL; y++) {
                    this.grid[x][y][z] = WATER;
                }
            }
        }
    }
}