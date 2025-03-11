/**
 * 서비스 폴더명이 서비스의 도메인명으로 관리되어야 한다.
 * 해당 파일의 경로 ex) /domain.com/ecosystem.config.js
 */

require('dotenv').config();
const path = require('path');
const currDirName = path.basename(__dirname);
const isRunning = currDirName.includes('-running');
const domain = path.basename(__dirname).replace('-running', ''); // ex: domain.com (현재 디렉토리명)

module.exports = {
  apps: [
    {
      name: isRunning ? domain : domain + '--spare',
      // Nuxt 3 uses node to run the output server instead of nuxt start
      script: 'node',
      args: '.output/server/index.mjs', // Nuxt 3 output path
      env: {
        PORT: (__dirname.includes('-running') ? '1' : '') + process.env.PORT,
        SERVER_ID: isRunning ? 'running' : 'main',
        // Nuxt 3 recommended environment variables
        NODE_ENV: 'production',
        NITRO_HOST: '0.0.0.0',
        NITRO_PORT:
          (__dirname.includes('-running') ? '1' : '') + process.env.PORT,
      },
      // Add health check options for better PM2 monitoring
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      watch: false,
      max_restarts: 10,
    },
  ],
};
