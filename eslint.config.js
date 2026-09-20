import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['dist/', 'node_modules/'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } }
    },
    {
        files: ['sw.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.serviceworker } }
    },
    {
        files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }
    },
    {
        rules: {
            'no-unused-vars': ['error', { caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            // The Persian/Arabic normalisation regexes intentionally contain combining marks and escapes.
            'no-misleading-character-class': 'off',
            'no-useless-escape': 'off'
        }
    }
];
