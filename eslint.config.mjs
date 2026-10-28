import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * 分层约束（可在 CI 里挡住架构腐化）：
 *
 *   shared  ← 谁都可以依赖，但它不能依赖任何人
 *   engine  ← 只依赖 shared，纯逻辑，禁止碰 Electron / DOM / React
 *   main    ← 依赖 shared + engine，禁止依赖 renderer
 *   renderer/ui       ← 只依赖 shared + React，禁止依赖 features / engine
 *   renderer/features ← 可以依赖 ui + engine + shared
 */
const layerRules = [
  {
    files: ['src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@engine/*', '@ui/*', '@features/*', '@/main/*', 'electron', 'react*'], message: 'shared 层必须保持零依赖' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@ui/*', '@features/*', '@/main/*', 'electron', 'react*', 'react-dom*'], message: 'engine 层是纯逻辑，不能依赖 UI / Electron' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@ui/*', '@features/*', '@/*'], message: '主进程不能依赖渲染层' }],
        },
      ],
    },
  },
  {
    files: ['src/renderer/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['@features/*', '@engine/*'], message: 'UI 层不能反向依赖业务与引擎' }],
        },
      ],
    },
  },
  {
    files: ['src/renderer/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['../ui/../features/*', 'src/main/*'], message: '业务层不能依赖主进程' }],
        },
      ],
    },
  },
]

export default tseslint.config(
  {
    ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'resources/**', 'tests/fixtures/.cache/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  ...layerRules,
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
)
