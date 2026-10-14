// The package shares the app's lint rules (ESLint runs with this directory as
// its base, so type-aware rules read ./tsconfig.json; see package.json "lint").
import appConfig from '../../apps/mobile/eslint.config.js';

export default [
  ...appConfig,
  {
    // The design system never reaches into the app that consumes it.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '@shared/*', '**/apps/**', '@booking/ui'],
              message:
                'The design system is self-contained: no imports from the app or from its own entry point. Use relative imports.',
            },
          ],
        },
      ],
    },
  },
];
