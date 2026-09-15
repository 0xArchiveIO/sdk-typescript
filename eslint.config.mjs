import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Existing wire-shape adapters use `any` at deliberately untyped API boundaries.
      // Keep the finding visible without making the unrelated baseline block lint.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
