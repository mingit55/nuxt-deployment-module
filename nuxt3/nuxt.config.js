export default defineNuxtConfig({
  vite: {
    logLevel: process.env.MODE === 'production' ? 'error' : 'info',
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

  // Gtag 가 있는 경우
  modules: ['nuxt-gtag'],
  gtag: {
    id: process.env.GA,
  },
  nitro: {
    routeRules: {
      '/**': {
        headers: {
          'X-XSS-Protection': '1; mode=block',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY', // Iframe 으로 사용되지 않는 서비스 한정
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        },
      },
    },
    compressPublicAssets: {
      brotli: true,
    },
  },
  devtools: {
    enabled: process.env.MODE !== 'production',
  },
});