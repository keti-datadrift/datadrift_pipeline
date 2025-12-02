import pluginReact from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';
// import nextPlugin from '@next/eslint-plugin-next'; // We'll rely on eslint-config-next for Next.js specifics
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // 1. Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      'dist/**',
      '.DS_Store',
      'next-eslint.d.ts', // Ignore our declaration file
    ],
  },

  // 2. Base configuration for JS/TS files using Next.js's recommended setup
  // 'eslint-config-next' is designed for Next.js projects and includes React, TypeScript, and Next.js specific rules.
  // It often handles the new JSX transform correctly.
  ...compat.extends('next/core-web-vitals'),

  // 3. Additional TypeScript specific rules (if needed, or to override)
  // Note: 'next/core-web-vitals' already includes substantial TypeScript linting.
  // This section can be used for fine-tuning or if specific tseslint rules are preferred.
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Spread recommended rules if you want to build upon them
      // ...tseslint.configs.recommended.rules,
      // Or, if 'next/core-web-vitals' is sufficient, this can be minimal or removed.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Add other specific TypeScript overrides here
    },
  },

  // 4. React specific settings (mostly covered by 'next/core-web-vitals')
  // This section is for any explicit overrides or additional React rules.
  {
    files: ['**/*.jsx', '**/*.tsx'],
    plugins: {
      react: pluginReact,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // ...pluginReact.configs.recommended.rules, // Spread if you want the base set
      'react/react-in-jsx-scope': 'off', // Next.js handles this
      'react/prop-types': 'off', // Usually not needed with TypeScript
      // Add other specific React overrides here
    },
  },

  // 5. Global language options (applies to all matched files unless overridden)
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // 6. Prettier - must be last to override other styling rules
  eslintConfigPrettier,

  // 7. React Hooks
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    // ...
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default eslintConfig;
