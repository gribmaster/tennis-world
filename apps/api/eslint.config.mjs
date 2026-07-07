import base from '@tennis/config/eslint.config.js';

export default [
  ...base,
  {
    rules: {
      // NestJS DI relies heavily on decorators / classes — relax a couple of
      // rules that fight that idiom.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
