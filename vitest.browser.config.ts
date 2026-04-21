import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@mediapipe/pose': path.resolve(__dirname, 'src/stubs/mediapipe-pose-stub.ts'),
    },
  },
  // Serve test_data/ at the root so browser tests can fetch files via /test_1/..., /test_2/...
  publicDir: 'test_data',
  server: {
    fs: { allow: ['.', 'test_data'] },
  },
  test: {
    include: ['src/**/*.browser.test.ts'],
    testTimeout: 120_000, // video extraction can take a while for large MOV files
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
