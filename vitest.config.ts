import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@/src': path.resolve(__dirname, 'src'),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'src/**/*.tsx', 'entrypoints/**/*.ts'],
            exclude: ['**/__tests__/**', '**/node_modules/**', '**/*.d.ts'],
        },
    },
});
