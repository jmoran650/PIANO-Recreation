import tseslint from 'typescript-eslint';

export default tseslint.config(
  tseslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['eslint.config.mjs', 'dist/*', 'public/*','webpack.config.cjs'],
  }
);