require('dotenv').config();
const path = require('path');

module.exports = {
  currDirName: path.basename(path.resolve(`${__dirname}/..`)), // ex: test.sellymmon.com (현재 디렉토리명)
  runningDir: path.resolve(
    `${__dirname}/../../${path.basename(
      path.resolve(`${__dirname}/..`),
    )}-running`,
  ),
  // ※ 서비스마다 NODE_ENV가 아닐 수 있음
  externalHost:
    process.env.NODE_ENV === 'development'
      ? 'https://beta.realtymmon.com'
      : 'https://realtymmon.com',
  serviceHost: 'localhost', // 서비스 호스트
  maxAttempts: 20, // 최대 확인 시도 횟수 (줄임)
  checkInterval: 500, // 상태 확인 간격 (ms) (줄임)
  symlinkPaths: ['static'], // 링크할 대용량 디렉토리
  copyPaths: [
    // 복사할 파일
    'node_modules',
    '_deployment',
    '.nuxt',
    'store',
    '.env',
    'nuxt.config.js',
    'package.json',
    'package-lock.json',
    'ecosystem.config.js',
  ],
  pm2Names: {
    main: '--spare', // 메인 서버 PM2 이름 접미사
    running: '', // 운영 서버 PM2 이름 접미사
  },
  warmupPaths: ['/', '/favicon.ico'], // 미리 로드할 경로
  warmupAttempts: 2, // 워밍업 시도 횟수
  warmupConcurrency: 3, // 동시에 처리할 최대 요청 수

  nuxtResourceValidation: {
    enabled: true, // Nuxt 리소스 검증 활성화 여부
    minScriptSize: 100, // 최소 스크립트 파일 크기 (바이트)
    maxScriptsToCheck: 3, // 검증할 최대 스크립트 파일 수
    timeout: {
      mainPage: 5000, // 메인 페이지 요청 타임아웃
      scripts: 3000, // 스크립트 요청 타임아웃
      staticDir: 2000, // 정적 자산 폴더 요청 타임아웃
    },
    stabilityCheckRetries: 3, // 안정성 검증 시도 횟수
    responseTimeWarning: 1000, // 응답 시간 경고 기준값 (ms)
  },
};
