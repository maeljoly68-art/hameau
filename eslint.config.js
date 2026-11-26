import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // L'extension Chrome : l'objet « chrome » existe dans ses pages et son service.
  { files: ['extension/**/*.js'], languageOptions: { globals: { chrome: 'readonly' } } },
  // Le widget de l'iPhone tourne dans l'app Scriptable, qui fournit ces objets.
  {
    files: ['scriptable/**/*.js'],
    languageOptions: { globals: { ListWidget: 'readonly', Request: 'readonly', Color: 'readonly', Font: 'readonly', config: 'readonly', args: 'readonly', Script: 'readonly' } },
  },
);
