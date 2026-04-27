import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@babylonjs/loaders',
      '@babylonjs/loaders/glTF',
      'babylon-mmd/esm/Runtime/Optimized/Physics/Bind/Impl/physicsRuntimeEvaluationType',
      'babylon-mmd/esm/Runtime/Optimized/wasm/mpr',
      'babylon-mmd/esm/Runtime/Optimized/wasm/spr',
    ],
  },
});
