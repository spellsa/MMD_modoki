import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    exclude: ['@babylonjs/loaders', '@babylonjs/loaders/glTF'],
  },
});
