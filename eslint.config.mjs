import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Layer rules from the architecture doc:
// engine/ is pure (no adapters, UI or features); one advertiser module never imports another.
const layer = (from, banned, message) => ({
  files: [from],
  rules: { 'no-restricted-imports': ['error', { patterns: banned.map((group) => ({ group: [group], message })) }] },
});

export default tseslint.config(
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  layer('src/engine/**', ['@/adapters/*', '@/features/*', '@/components/*', '@/app/*', 'react', 'next/*'], 'engine/ must stay pure: no Google, UI or features.'),
  layer('src/advertisers/**', ['@/adapters/*', '@/features/*', '@/components/*', '@/app/*', 'react', 'next/*'], 'Advertiser modules only use engine/ and shared/.'),
  // Inside a module folder: only its own files (./), the shared contract (../types), engine/ and shared/.
  {
    files: ['src/advertisers/*/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/advertisers/**', '../**', '!../types'], message: 'One advertiser module must not import another.' }, { group: ['@/adapters/*', '@/features/*', '@/components/*', '@/app/*', 'react', 'next/*'], message: 'Advertiser modules only use engine/ and shared/.' }] }],
    },
  },
  layer('src/shared/**', ['@/adapters/*', '@/features/*', '@/components/*', '@/app/*', '@/engine/*', '@/advertisers/*'], 'shared/ is the bottom layer.'),
);
