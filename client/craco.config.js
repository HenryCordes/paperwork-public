// craco.config.js - Configure webpack to ignore source map warnings for react-datepicker
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add a plugin to ignore source map warnings for react-datepicker
      if (!webpackConfig.ignoreWarnings) {
        webpackConfig.ignoreWarnings = []
      }

      // Add specific warning pattern to ignore
      webpackConfig.ignoreWarnings.push({
        module: /node_modules\/react-datepicker/,
      })

      webpackConfig.ignoreWarnings.push(/Failed to parse source map/)

      return webpackConfig
    },
  },
  jest: {
    configure: (jestConfig) => {
      // Measure coverage against the whole src tree (CRA otherwise only counts
      // files a test imports, which inflates the %). See
      // specs/2026-06-09-coverage-thresholds/design.md.
      jestConfig.collectCoverageFrom = [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/index.tsx',
        '!src/setupTests.ts',
        '!src/reportWebVitals.ts',
        '!src/test-utils.tsx',
      ]
      // Client coverage gate (reached after the component/page/hook test waves;
      // enforced as a regression floor). The ww-marketing-website React profile
      // (85/90/50/80) didn't fit this CRA app's presentational JSX / routing /
      // chart+print glue; 65/65/65/55 reflects meaningful behavioral coverage.
      jestConfig.coverageThreshold = {
        global: {
          lines: 65,
          statements: 65,
          functions: 65,
          branches: 55,
        },
      }
      jestConfig.coverageReporters = ['text-summary', 'json-summary', 'lcov']
      return jestConfig
    },
  },
}
