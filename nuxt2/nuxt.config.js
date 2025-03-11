export default {
  build: {
    cache: true,
    parallel: true,
    publicPath: '/_nuxt/',
    optimization: {
      splitChunks: {
        chunks: 'all',
        maxSize: 250000,
        automaticNameDelimiter: '.',
        name: undefined,
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          styles: {
            name: 'styles',
            test: /\.(css|vue)$/,
            chunks: 'all',
            enforce: true,
          },
        },
      },
    },
    filenames: {
      css: ({ isDev }) =>
        isDev ? '[name].css' : 'css/[name].[contenthash:7].css',
    },
    terser: {
      cache: true,
      parallel: true,
      terserOptions: {
        compress: {
          drop_console: process.env.NODE_ENV === 'production',
        },
      },
    },
  },
  serverMiddleware: [
    {
      path: '/api/server-identity',
      handler: '~/server-middleware/server-identity.js',
    },
  ],
}