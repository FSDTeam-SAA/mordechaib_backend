import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var module = { exports: {} };

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);