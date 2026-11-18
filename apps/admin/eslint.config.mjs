import base from '@tennis/config/eslint.config.js';

export default [
  ...base,
  {
    rules: {
      // JSX components are PascalCase functions, not classes — nothing to relax
      // beyond the shared base; kept as its own file so admin-only overrides
      // (none yet) have somewhere to go without touching the shared config.
    },
  },
];
