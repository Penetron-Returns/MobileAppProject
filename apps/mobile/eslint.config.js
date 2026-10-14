// eslint.config.js
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import prettierPlugin from 'eslint-plugin-prettier';

/**
 * The design system lives in packages/ui and is imported from the package
 * entry point only. These paths held the old scattered components: they are
 * gone, and deep imports of package internals are blocked so the barrel stays
 * the one public surface (docs/design-system.md).
 */
const OLD_COMPONENT_PATHS = [
  '@/components/ui',
  '@/components/ui/*',
  '@/components/flow/*',
  '@/components/states/*',
  '@/components/tab-bar/*',
  '@/components/{Surface,Ground,Page,Screen,Group,Chips,Capsule,InitialsDome,InsetInput,SearchInput,SegmentedControl,OptionSheet,Sheet,ConfirmDialog,FormField,StatusBadge,StatCard,ListItem,PersonAvatar,RetryCard,OfflineBanner,States,Header,StackHeader,TabHeader,Toaster}',
  '@/lib/depth',
  '@/lib/utils',
  '@/hooks/useDepth',
  '@/hooks/useAppColorScheme',
];

export const appImportRestrictions = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@booking/ui/*', '**/packages/ui/*', '**/packages/ui'],
          message:
            'Import from "@booking/ui" only. Package internals are private.',
        },
        {
          group: OLD_COMPONENT_PATHS,
          message:
            'This component moved into the design system. Import it from "@booking/ui".',
        },
      ],
    },
  ],
};

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.expo/**',
      'expo-env.d.ts',
      'plugins/',
    ],
  },
  {
    files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx'],
    ignores: ['node_modules/', 'dist/', 'expo-env.d.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 2024,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-native': reactNativePlugin,
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'react/react-in-jsx-scope': 'off',
      'react-native/no-inline-styles': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: appImportRestrictions,
  },
  {
    files: ['types.ts'],
    rules: {},
  },
];
