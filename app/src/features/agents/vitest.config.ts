import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['app/src/features/agents/verification.test.ts'], environment: 'node' } });
