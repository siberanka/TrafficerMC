module.exports = {
  extends: ['eslint:recommended', '@electron-toolkit', '@electron-toolkit/eslint-config-prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  // Formatting is verified by `prettier --check`. eslint-plugin-prettier 5.5.x
  // can deadlock under Node 24 while traversing large ESM modules.
  rules: {
    'prettier/prettier': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]
  }
}
