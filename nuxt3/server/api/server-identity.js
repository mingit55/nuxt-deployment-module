// Nuxt 3 API 파일: /server/api/server-identity.js

// Nuxt 3는 서버 API를 서버 디렉토리 아래에 정의합니다
// 이 파일은 /api/server-identity 엔드포인트를 제공합니다

export default defineEventHandler(() => {
  // 서버 ID를 환경 변수에서 가져옵니다
  const serverId = process.env.SERVER_ID || 'unknown';

  // 간단한 JSON 응답을 반환합니다
  return {
    id: serverId,
    timestamp: new Date().toISOString(),
    node_version: process.version,
    nodeEnv: process.env.NODE_ENV,
  };
});
