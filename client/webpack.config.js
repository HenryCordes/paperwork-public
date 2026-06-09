// This file configures webpack to ignore source map warnings for react-datepicker
const path = require('path')

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Find the source-map-loader rule
      const rules = webpackConfig.module.rules.find((rule) =>
        Array.isArray(rule.oneOf),
      ).oneOf

      for (const rule of rules) {
        if (rule.use && Array.isArray(rule.use)) {
          const sourceMapLoader = rule.use.find(
            (loader) =>
              loader === 'source-map-loader' ||
              (typeof loader === 'object' &&
                loader.loader === 'source-map-loader'),
          )

          if (sourceMapLoader) {
            // Add exclude pattern for react-datepicker
            rule.exclude = [
              /node_modules\/react-datepicker/,
              ...(Array.isArray(rule.exclude)
                ? rule.exclude
                : rule.exclude
                  ? [rule.exclude]
                  : []),
            ]
          }
        }
      }

      return webpackConfig
    },
  },
}
