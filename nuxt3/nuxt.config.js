export defualt defineNuxtConfig({
  vite: {
    build: {
      minify: 'esbuild',
      target: 'esnext', // 최신 브라우저 타겟팅
    },
    esbuild: {
      treeShaking: true,
      drop:
        process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    },
  },

  modules: ['nuxt-gtag'],
  plugins: ['@/plugins/toastify'],
  gtag: {
    id: process.env.GA,
  },

  devtools: {
    enabled: process.env.MODE !== 'production',
  },
});