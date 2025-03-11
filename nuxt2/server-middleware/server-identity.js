// server-middleware/server-identity.js

export default function (req, res) {
  // 기본 서버 정보
  const serverInfo = {
    id:
      process.env.SERVER_ID ||
      (__dirname.includes('-running') ? 'running' : 'main'),
    timestamp: Date.now(),
    hostname: require('os').hostname(),
    pid: process.pid,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().rss / (1024 * 1024), // MB 단위
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.end(JSON.stringify(serverInfo));
}
