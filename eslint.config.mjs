import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['web/*.js', 'web/vendor/**', 'node_modules/**', '.build-check/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSAsExpression', message: 'Type assertions (including as const) are not allowed.' },
        { selector: 'TSTypeAssertion', message: 'Type assertions are not allowed.' },
        { selector: 'TSNonNullExpression', message: 'Non-null assertions are not allowed.' },
      ],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        { ignore: [0, 1, -1], ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreTypeIndexes: true, enforceConst: true },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['web/src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
);
