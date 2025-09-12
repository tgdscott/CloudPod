import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    exclude: [
      'e2e/**/*',
      'node_modules/**/*',
      'dist/**/*'
    ],
  setupFiles: ['./src/tests/setupTests.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'lcov', 'cobertura'],
      reportsDirectory: 'coverage',
      include: [
        'src/components/**/VoicePicker.jsx',
        'src/components/dashboard/PodcastCreator.jsx',
        'src/lib/apiClient.js',
        'src/api/**/*.ts',
        'src/tests/**/*.{ts,tsx,js,jsx}',
      ],
      exclude: [
        'src/main.jsx',
        'src/App.jsx',
        'src/**/__tests__/**',
        'src/components/admin/**',
        'src/components/dashboard/**/!(PodcastCreator).jsx',
        'src/components/**/admin-*.jsx',
        'src/components/**/dashboard.jsx',
        'src/components/**/landing-page.jsx',
        'src/components/**/podcast-creator.jsx',
        'src/components/**/EpisodeHistory*.jsx',
        'src/components/**/Template*.jsx',
        'src/components/**/RssImporter.jsx',
        'src/components/**/Settings.jsx',
        'src/components/**/AdminSettings.jsx',
        'src/components/**/PodcastManager.jsx',
        'src/components/**/NewUserWizard.jsx',
        'src/components/media/**',
        'src/vendor/**',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 40,
        statements: 40,
        branches: 50,
        functions: 25,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
