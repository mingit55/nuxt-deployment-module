// server/middleware/rate-limit.ts
const ipRequestCounts = new Map();
const LIMIT = 100; // 1분당 최대 요청 수
const WINDOW = 60 * 1000; // 1분

export default defineEventHandler((event) => {
  const clientIp = getRequestHeader(event, 'x-forwarded-for') || 'unknown';
  const requestPath = event.path || event.node.req.url || 'unknown-path';

  // 현재 시간 기준 IP별 요청 카운트 및 타임스탬프 관리
  if (!ipRequestCounts.has(clientIp)) {
    ipRequestCounts.set(clientIp, {
      count: 0,
      resetAt: Date.now() + WINDOW,
    });
  }

  const record = ipRequestCounts.get(clientIp);

  // 타임 윈도우가 지난 경우 카운트 리셋
  if (Date.now() > record.resetAt) {
    record.count = 0;
    record.resetAt = Date.now() + WINDOW;
  }

  record.count++;

  // 제한 초과 시 429 응답
  if (record.count > LIMIT) {
    setResponseStatus(event, 429);
    return 'Too Many Requests';
  }
});