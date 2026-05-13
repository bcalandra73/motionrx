import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @tensorflow-models/pose-detection statically imports @mediapipe/pose for its
      // BlazePose backend, but the package ships as a legacy IIFE with no ES exports.
      // We only use MoveNet so we redirect the import to a stub that satisfies the
      // bundler without pulling in the full BlazePose runtime.
      '@mediapipe/pose': path.resolve(__dirname, 'src/stubs/mediapipe-pose-stub.ts'),
    },
  },
})
