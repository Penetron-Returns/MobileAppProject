// Base ESLint config for TypeScript/React Native code: parser, plugins and the shared rules.
// Run ESLint with the consuming package as the working directory: parserOptions.project reads its tsconfig.json.
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import prettierPlugin from 'eslint-plugin-prettier';

export const baseConfig = [
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
];
