require('dotenv').config();
const path = require('path');
const currDirName = path.basename(__dirname);
const isRunning = currDirName.includes('-running');
const domain = path.basename(__dirname).replace('-running', ''); // ex: test.sellymmon.com (현재 디렉토리명)
module.exports = {
  apps: [
    {
      name: isRunning ? domain : domain + '--spare',
      script: './node_modules/nuxt/bin/nuxt.js',
      args: 'start',
      env: {
        PORT: (__dirname.includes('-running') ? '1' : '') + process.env.PORT,
        SERVER_ID: isRunning ? 'running' : 'main',
      },
    },
  ],
};
