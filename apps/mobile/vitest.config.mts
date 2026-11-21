import { defineConfig } from 'vitest/config';

// Pure modules only (api/*, lib/*): no React Native runtime is loaded in tests.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
