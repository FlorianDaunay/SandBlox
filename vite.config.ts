import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'dist', // Ensures the output folder matches what Express is looking for
        emptyOutDir: true,
    },
});