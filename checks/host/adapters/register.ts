import { register } from 'node:module';

// Compile production TSX with Vite before Node loads it. No feature code is replaced.
register(new URL('./source-loader.ts', import.meta.url));
