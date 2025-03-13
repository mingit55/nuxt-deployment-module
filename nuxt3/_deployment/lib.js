const colors = require('colors');
const path = require('path');
const config = require('./config');
const { exec } = require('child_process');

/**
 * 일정 시간 대기하는 함수
 * @param {number} time - 대기 시간 (ms)
 * @returns {Promise<void>}
 */
function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * 서비스 준비 상태를 확인하는 함수
 * @param {string} host - 확인할 호스트 주소
 * @param {number} maxAttempts - 최대 시도 횟수
 * @param {number} interval - 각 시도 간 간격 (ms)
 * @returns {Promise<boolean>} - 서비스 준비 여부
 */
async function waitForServiceReady(host, maxAttempts = 30, interval = 1000) {
  const http = require('http');

  console.log(
    colors.bold.blue(
      `<Alert> ${host} 서비스가 준비될 때까지 대기 중입니다... (최대 ${maxAttempts}회 시도)`,
    ),
  );

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      const isReady = await new Promise((resolve) => {
        // index 페이지로 접근하여 서비스 상태 확인
        const req = http.get(`http://${host}/`, (res) => {
          // 응답 코드가 200대면 준비된 것으로 간주
          // 일부 300대 코드도 준비된 것으로 간주
          resolve((res.statusCode >= 200 && res.statusCode < 300 || [
            300, // Multiple Choice
            301, // Moved permanently
            302, // Found
            303, // See Other
            304, // Not Modified
            307, // Temporary Redirect
            308, // Permanent Redirect
          ]));

          // 응답 데이터는 필요 없으므로 무시
          res.resume();
        });

        req.on('error', () => {
          resolve(false);
        });

        // 타임아웃 설정 (500ms로 축소하여 더 빠른 체크)
        req.setTimeout(500, () => {
          req.abort();
          resolve(false);
        });
      });

      if (isReady) {
        console.log(
          colors.bold.green(
            `<Success> 서비스가 준비되었습니다. (${attempts}회 시도)`,
          ),
        );

        return true;
      }

      // 준비되지 않았으면 진행 상황 표시
      if (attempts % 5 === 0) {
        console.log(
          colors.yellow(
            `<Info> 서비스 준비 대기 중... (${attempts}/${maxAttempts})`,
          ),
        );
      }

      // 다음 시도까지 대기 (간격 줄임)
      await sleep(interval);
    } catch (error) {
      console.log(
        colors.yellow(`<Warning> 서비스 상태 확인 중 오류: ${error.message}`),
      );
      await sleep(interval);
    }
  }

  console.log(
    colors.yellow(
      `<Warning> 최대 시도 횟수(${maxAttempts})에 도달했습니다. 서비스가 아직 준비되지 않았을 수 있습니다.`,
    ),
  );
  return false;
}

/**
 * Nuxt 서비스 사전 워밍업 함수 - 개선된 버전
 * 모든 경로에 대한 성공적인 응답을 확인하고, 서비스 준비 상태를 더 정확하게 평가합니다.
 * @param {string} host - 호스트 주소 (예: localhost:3000)
 * @param {number} attempts - 각 경로당 최대 시도 횟수
 * @param {Object} options - 추가 옵션
 * @returns {Promise<boolean>} - 워밍업 성공 여부
 */
async function warmupService(host, attempts = 3, options = {}) {
  const {
    warmupPaths = config.warmupPaths || ['/', '/favicon.ico'],
    timeout = 10000, // 전체 워밍업 최대 시간 (ms)
    requiredPaths = ['/'], // 반드시 성공해야 하는 경로들
  } = options;

  console.log(
    colors.bold.blue(
      `<Alert> ${host} 서비스 워밍업 중... (경로: ${warmupPaths.length}개, 반복: ${attempts}회)`,
    ),
  );

  // 성공한 요청 추적
  const successfulPaths = new Set();
  const failedPaths = new Set();
  const startTime = Date.now();

  // 각 경로마다 시도 카운터 별도 관리
  const pathAttempts = warmupPaths.reduce((acc, path) => {
    acc[path] = 0;
    return acc;
  }, {});

  // 점진적으로 타임아웃 증가하는 기본값
  const baseTimeout = 300;
  let currentTimeout = baseTimeout;

  // 워밍업 프로세스 시작
  while (
    Object.keys(pathAttempts).length > 0 &&
    Object.values(pathAttempts).some((count) => count < attempts)
  ) {
    // 전체 최대 실행 시간 체크
    if (Date.now() - startTime > timeout) {
      const pendingPaths = Object.keys(pathAttempts);
      console.log(
        colors.yellow(
          `<Warning> 워밍업 제한 시간(${timeout}ms)을 초과했습니다. 남은 경로: ${pendingPaths.join(
            ', ',
          )}`,
        ),
      );
      // 필수 경로들의 성공 여부 확인
      for (const path of requiredPaths) {
        if (!successfulPaths.has(path)) {
          failedPaths.add(path);
        }
      }
      break;
    }

    // 아직 시도 횟수가 부족한 경로만 필터링
    const pendingPaths = Object.keys(pathAttempts).filter(
      (path) => pathAttempts[path] < attempts,
    );

    if (pendingPaths.length === 0) break;

    // 경로 배치 처리 - 병렬 요청으로 처리 속도 향상
    await Promise.all(
      pendingPaths.map(async (path) => {
        // 시도 횟수 증가
        pathAttempts[path]++;

        try {
          const result = await sendHttpRequest(host, path, currentTimeout);

          // 성공 응답인 경우 (200-299 상태 코드)
          if (result.statusCode >= 200 && result.statusCode < 300) {
            successfulPaths.add(path);

            // 모든 시도 완료한 경로는 제거
            if (pathAttempts[path] >= attempts) {
              delete pathAttempts[path];
            }
          } else {
            console.log(
              colors.yellow(
                `<Warning> 경로 '${path}' 응답 코드: ${result.statusCode}`,
              ),
            );
          }
        } catch (error) {
          console.log(
            colors.yellow(
              `<Warning> 경로 '${path}' 요청 실패: ${error.message}`,
            ),
          );

          // 오류 발생 시 해당 경로를 실패 목록에 추가
          if (pathAttempts[path] >= attempts) {
            failedPaths.add(path);
            delete pathAttempts[path];
          } else {
            // 에러 발생시 타임아웃 증가
            currentTimeout = Math.min(currentTimeout * 1.5, 2000);
          }
        }
      }),
    );

    // 진행 상황 로깅
    const completed = warmupPaths.length - Object.keys(pathAttempts).length;
    const successCount = successfulPaths.size;

    if (completed > 0) {
      console.log(
        colors.yellow(
          `<Info> 워밍업 진행 중: ${completed}/${warmupPaths.length} 경로 완료, ${successCount} 성공`,
        ),
      );
    }

    // 요청 간 간격 조정 (성공률에 따라)
    const successRate = successfulPaths.size / warmupPaths.length;
    await sleep(successRate > 0.7 ? 100 : 200);
  }

  // 워밍업 결과 평가
  const allPaths = new Set([...warmupPaths]);
  const remainingPaths = new Set(
    [...allPaths].filter((p) => !successfulPaths.has(p) && !failedPaths.has(p)),
  );

  // 요약 통계
  const endTime = Date.now();
  const elapsedTime = (endTime - startTime) / 1000;

  console.log(colors.cyan('===== 워밍업 결과 요약 ====='));
  console.log(colors.cyan(`총 경로 수: ${allPaths.size}`));
  console.log(colors.green(`성공한 경로: ${successfulPaths.size}`));
  console.log(colors.red(`실패한 경로: ${failedPaths.size}`));
  console.log(colors.yellow(`미완료 경로: ${remainingPaths.size}`));
  console.log(colors.cyan(`소요 시간: ${elapsedTime.toFixed(1)}초`));

  // 필수 경로 확인
  const failedRequiredPaths = requiredPaths.filter(
    (path) => !successfulPaths.has(path),
  );
  const isSuccessful =
    failedRequiredPaths.length === 0 && failedPaths.size === 0;

  if (failedRequiredPaths.length > 0) {
    console.log(
      colors.red(
        `<Error> 필수 경로 '${failedRequiredPaths.join(
          ', ',
        )}'에 대한 워밍업이 실패했습니다!`,
      ),
    );
  }

  if (isSuccessful) {
    console.log(
      colors.bold.green(
        `<Success> 서비스 워밍업 완료 - 모든 경로가 성공적으로 응답했습니다. (${elapsedTime.toFixed(
          1,
        )}초 소요)`,
      ),
    );
  } else {
    console.log(
      colors.bold.yellow(
        `<Warning> 서비스 워밍업 부분 완료 - 일부 경로에서 문제가 발생했습니다.`,
      ),
    );
  }

  return isSuccessful;
}

/**
 * HTTP 요청 전송 및 응답 처리 헬퍼 함수
 * @param {string} host - 호스트 주소 (예: localhost:3000)
 * @param {string} path - 요청 경로 (예: /api/users)
 * @param {number} timeout - 요청 타임아웃 (ms)
 * @returns {Promise<Object>} - 응답 결과 객체 (statusCode, headers 등)
 */
function sendHttpRequest(host, path, timeout) {
  // URL 파싱
  let protocol = 'http:';
  let hostname = host;
  let port = 80;

  // 프로토콜 체크 및 제거
  if (host.startsWith('https://')) {
    protocol = 'https:';
    hostname = host.substring(8);
    port = 443;
  } else if (host.startsWith('http://')) {
    hostname = host.substring(7);
  }

  // 호스트와 포트 분리
  if (hostname.includes(':')) {
    const parts = hostname.split(':');
    hostname = parts[0];
    port = parseInt(parts[1], 10);
  }

  const httpModule = protocol === 'https:' ? require('https') : require('http');

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: hostname,
      port: port,
      path: path,
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'User-Agent': 'NuxtWarmupService/1.0',
      },
    };

    const req = httpModule.request(reqOptions, (res) => {
      // 응답 데이터는 소비해야 함 (메모리 누수 방지)
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * 포트 번호를 가져오는 함수
 * @param {boolean} isRunning - 운영 서버인지 여부
 * @returns {Promise<string>} - 포트 번호
 */
async function getServicePort(isRunning) {
  try {
    // ecosystem.config.js 파일에서 포트 정보 추출
    const ecosystem = require(path.resolve(
      isRunning ? config.runningDir : `${__dirname}/..`,
      'ecosystem.config.js',
    ));

    // 환경변수에서 PORT 값 가져오기
    const envPort = process.env.PORT || '3000';

    // ecosystem.config.js의 env.PORT 값 또는 기본 환경변수 PORT 사용
    // Nuxt 3에서는 NITRO_PORT도 확인
    const port =
      ecosystem.apps[0].env.PORT ||
      ecosystem.apps[0].env.NITRO_PORT ||
      (isRunning ? '1' + envPort : envPort);

    return port;
  } catch (error) {
    console.log(
      colors.yellow(`<Warning> 포트 정보를 가져오는 중 오류: ${error.message}`),
    );
    return isRunning ? '13000' : '3000'; // 기본값
  }
}

/**
 * 명령어 실행 함수
 * @param {string} command - 실행할 명령어
 * @param {Object} [options] - 실행 옵션
 * @param {boolean} [options.rejectOnAnyError=false] - true일 경우 모든 오류에 대해 reject
 * @returns {Promise<string>} - 명령어 실행 결과
 */
async function execCommand(command, options = {}) {
  const rejectOnAnyError = options.rejectOnAnyError || false;

  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        if (rejectOnAnyError) {
          console.log(err);
          console.log(stderr);
          reject(new Error(`명령어 실행 오류: ${stderr}`));
          return;
        } else if (err.code !== 1) {
          console.log(err);
          console.log(stderr);
          reject(new Error(`예상치 못한 실행 오류: ${stderr}`));
          return;
        }
      }
      resolve(stdout);
    });
  });
}


/**
 * PM2에 프로세스가 등록되었는지 확인하는 함수
 * @param {string} targetName - 확인할 프로세스 이름
 * @returns {Promise<boolean>} - 등록 여부
 */
async function isRegistered(targetName = null) {
  try {
    const processName = targetName || config.currDirName;
    const output = await execCommand(`pm2 list | grep " ${processName} "`);
    return output.length > 0;
  } catch (error) {
    console.log(colors.yellow(`PM2 프로세스 확인 중 오류: ${error.message}`));
    return false;
  }
}

/**
 * Nuxt 애플리케이션의 리소스와 API 엔드포인트를 검증하는 함수
 * 실제 콘텐츠 응답과 JavaScript 리소스 로드 확인
 * Nuxt 3용으로 업데이트
 * @param {string} host - 호스트 주소 (예: localhost:3000)
 * @returns {Promise<boolean>} - 모든 검증이 성공했는지 여부
 */
async function verifyNuxtAppResources(host) {
  const http = require('http');

  console.log(colors.blue('<Info> Nuxt 애플리케이션 리소스 검증 중...'));

  // 먼저 메인 페이지 로드하여 HTML 응답 확인 및 스크립트 경로 추출
  try {
    // 1. 메인 페이지 요청
    const mainPageResponse = await new Promise((resolve, reject) => {
      const req = http.get(`http://${host}/`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
          });
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(5000, () => {
        req.abort();
        reject(new Error('메인 페이지 요청 타임아웃'));
      });
    });

    // 2. 메인 페이지 응답 검증
    if (
      mainPageResponse.statusCode < 200 ||
      mainPageResponse.statusCode >= 300
    ) {
      console.log(
        colors.yellow(
          `<Warning> 메인 페이지에서 비정상 상태 코드: ${mainPageResponse.statusCode}`,
        ),
      );
      return false;
    }

    // 3. Nuxt 앱 컨테이너 확인 (Nuxt 3에서는 id="__nuxt"를 사용)
    const htmlContent = mainPageResponse.data;
    if (!htmlContent.includes('<div id="__nuxt">')) {
      console.log(
        colors.yellow(
          '<Warning> Nuxt 앱 컨테이너가 페이지에 없습니다. Nuxt가 제대로 렌더링되지 않았을 수 있습니다.',
        ),
      );
      return false;
    }

    // 4. 실제 JS 파일 경로 추출 (해시된 파일명 처리)
    // Nuxt 3에서는 /_nuxt/ 대신 /_nuxt/ 또는 /./_nuxt/를 사용할 수 있음
    const scriptRegex = /<script[^>]+src="(\/?\.?\/_nuxt\/[^"]+)"/g;
    const scriptMatches = [...htmlContent.matchAll(scriptRegex)];
    const scriptPaths = scriptMatches.map((match) => match[1]);

    if (scriptPaths.length === 0) {
      console.log(
        colors.yellow(
          '<Warning> 페이지에서 Nuxt 스크립트 경로를 찾을 수 없습니다.',
        ),
      );
      return false;
    }

    console.log(
      colors.blue(
        `<Info> 검증할 스크립트 파일 ${scriptPaths.length}개를 발견했습니다.`,
      ),
    );

    // 5. 주요 스크립트 파일 검증 (최대 3개만 검증)
    const criticalScripts = scriptPaths.slice(0, 3);
    const scriptResults = await Promise.all(
      criticalScripts.map(async (scriptPath) => {
        try {
          // 스크립트 경로가 /로 시작하지 않으면 추가
          const fullPath = scriptPath.startsWith('/')
            ? scriptPath
            : `/${scriptPath.replace(/^\.\//, '')}`;

          const response = await new Promise((resolve, reject) => {
            const req = http.get(`http://${host}${fullPath}`, (res) => {
              let data = '';
              res.on('data', (chunk) => {
                data += chunk;
              });
              res.on('end', () => {
                resolve({
                  statusCode: res.statusCode,
                  headers: res.headers,
                  data: data,
                  path: scriptPath,
                });
              });
            });

            req.on('error', (err) => reject(err));
            req.setTimeout(3000, () => {
              req.abort();
              reject(new Error(`스크립트 요청 타임아웃: ${scriptPath}`));
            });
          });

          // 스크립트 파일 응답 검증
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return {
              path: scriptPath,
              success: false,
              reason: `상태 코드: ${response.statusCode}`,
            };
          }

          // 스크립트 콘텐츠 기본 검증
          if (response.data.length < 100) {
            return {
              path: scriptPath,
              success: false,
              reason: '스크립트 파일이 비정상적으로 작습니다.',
            };
          }

          // 실제 JavaScript 내용 확인
          const isValidJs =
            response.data.includes('function') ||
            response.data.includes('var') ||
            response.data.includes('const') ||
            response.data.includes('export');

          if (!isValidJs) {
            return {
              path: scriptPath,
              success: false,
              reason: '유효한 JavaScript 내용이 아닙니다.',
            };
          }

          return { path: scriptPath, success: true };
        } catch (error) {
          return { path: scriptPath, success: false, reason: error.message };
        }
      }),
    );

    // 스크립트 검증 결과 확인
    const failedScripts = scriptResults.filter((r) => !r.success);

    if (failedScripts.length > 0) {
      console.log(
        colors.yellow('<Warning> 다음 Nuxt 스크립트 검증에 실패했습니다:'),
      );
      failedScripts.forEach((f) => {
        console.log(colors.yellow(`  - ${f.path}: ${f.reason}`));
      });
      return false;
    }

    // 6. 정적 자산 폴더 접근 가능 여부 확인
    try {
      const staticDirResponse = await new Promise((resolve, reject) => {
        const req = http.get(`http://${host}/_nuxt/`, (res) => {
          resolve({ statusCode: res.statusCode });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(2000, () => {
          req.abort();
          reject(new Error('정적 자산 폴더 접근 타임아웃'));
        });
      });

      // 404도 허용 (디렉터리 리스팅이 비활성화된 경우)
      if (
        staticDirResponse.statusCode !== 200 &&
        staticDirResponse.statusCode !== 404
      ) {
        console.log(
          colors.yellow(
            `<Warning> 정적 자산 폴더 접근 불가: 상태 코드 ${staticDirResponse.statusCode}`,
          ),
        );
      }
    } catch (error) {
      console.log(
        colors.yellow(
          `<Warning> 정적 자산 폴더 확인 중 오류: ${error.message}`,
        ),
      );
      // 이 오류는 경고만 표시하고 전체 검증 실패로 처리하지 않음 (선택적 체크)
    }

    console.log(
      colors.green(
        `<Success> 모든 Nuxt 애플리케이션 리소스가 정상적으로 로드되었습니다.`,
      ),
    );
    return true;
  } catch (error) {
    console.log(
      colors.yellow(`<Warning> Nuxt 리소스 검증 중 오류: ${error.message}`),
    );
    return false;
  }
}

/**
 * 운영 서버가 안정적으로 실행 중인지 추가 확인하는 함수
 * 여러 경로에 대한 응답과 성능을 확인하고, Nuxt 애플리케이션의 실제 리소스와 API를 검증
 * @returns {Promise<boolean>} - 서비스가 안정적인지 여부
 */
async function verifyRunningServiceStability() {
  try {
    console.log(colors.bold.blue('<Alert> 운영 서버의 안정성을 확인합니다...'));

    const port = await getServicePort(true);
    const processName = `${config.currDirName}${config.pm2Names.running}`;
    const host = `${config.serviceHost}:${port}`;

    // 1. PM2 프로세스 상태 확인
    const pmStatus = await execCommand(`pm2 show ${processName} | grep status`);
    const pmUptime = await execCommand(`pm2 show ${processName} | grep uptime`);
    const pmRestarts = await execCommand(
      `pm2 show ${processName} | grep restart`,
    );

    if (!pmStatus.includes('online')) {
      console.log(
        colors.yellow(
          `<Warning> 운영 서버 PM2 프로세스가 online 상태가 아닙니다: ${pmStatus}`,
        ),
      );
      return false;
    }

    const restartCount = parseInt(pmRestarts.match(/\d+/)?.[0] || '0');

    console.log(colors.green(`<Success> PM2 상태: ${pmStatus.trim()}`));
    console.log(colors.green(`<Success> PM2 가동 시간: ${pmUptime.trim()}`));
    console.log(colors.green(`<Success> PM2 재시작 횟수: ${restartCount}회`));

    // 2. 메모리 사용량 확인 (과도한 메모리 사용은 서비스 불안정 신호)
    const memoryUsage = await execCommand(
      `pm2 show ${processName} | grep memory`,
    );
    console.log(colors.green(`<Success> 메모리 사용량: ${memoryUsage.trim()}`));

    // 3. 기본 서비스 엔드포인트 접근성 검증
    const basicEndpoints = [...config.warmupPaths];

    let allEndpointsAccessible = true;
    for (const path of basicEndpoints) {
      const pathReady = await waitForServiceReady(`${host}${path}`, 3, 300);

      if (!pathReady) {
        console.log(
          colors.yellow(
            `<Warning> 기본 경로 '${path}'에 대한 접근이 불가능합니다.`,
          ),
        );
        allEndpointsAccessible = false;
      }
    }

    if (!allEndpointsAccessible) {
      console.log(
        colors.yellow(
          '<Warning> 일부 기본 엔드포인트에 접근할 수 없습니다. 서비스가 완전히 초기화되지 않았을 수 있습니다.',
        ),
      );
      return false;
    }

    // 4. Nuxt 애플리케이션 실제 리소스 검증
    const nuxtResourcesValid = await verifyNuxtAppResources(host);

    if (!nuxtResourcesValid) {
      console.log(
        colors.yellow(
          '<Warning> Nuxt 애플리케이션 리소스 검증에 실패했습니다. 애플리케이션이 완전히 로드되지 않았을 수 있습니다.',
        ),
      );
      return false;
    }

    // 5. 응답 시간 측정 (응답 성능 검증)
    console.log(colors.blue('<Info> 응답 시간을 측정합니다...'));

    const startTime = Date.now();
    await waitForServiceReady(`${host}/`, 1, 3000);
    const responseTime = Date.now() - startTime;

    console.log(
      colors.green(`<Success> 메인 페이지 응답 시간: ${responseTime}ms`),
    );

    // 응답 시간이 너무 느린 경우 (1초 이상) 경고 표시
    if (responseTime > 1000) {
      console.log(
        colors.yellow(
          `<Warning> 메인 페이지 응답 시간이 느립니다 (${responseTime}ms). 성능 문제가 있을 수 있습니다.`,
        ),
      );
    }

    // 6. 최종 안정화를 위한 대기
    console.log(colors.blue('<Info> 최종 안정화를 위해 잠시 대기합니다...'));
    await sleep(3000);

    console.log(
      colors.bold.green(
        '<Success> 운영 서버가 안정적으로 실행 중입니다. 메인 서버를 중지해도 됩니다.',
      ),
    );

    return true;
  } catch (error) {
    console.log(
      colors.yellow(
        `<Warning> 운영 서버 안정성 확인 중 오류 발생: ${error.message}`,
      ),
    );
    return false;
  }
}

// Nginx 로드 밸런싱 검증 함수
async function verifyNginxLoadBalancing(externalHost) {
  console.log(colors.blue('<Info> Nginx 로드 밸런싱 상태를 확인합니다...'));

  const sampleSize = 10;
  let runningServerHits = 0;
  let mainServerHits = 0;
  let failedRequests = 0;

  // 여러 번 요청하여 트래픽 분배 확인
  for (let i = 0; i < sampleSize; i++) {
    try {
      // 무작위 쿼리 파라미터로 캐싱 방지
      const randomParam = `?_=${Date.now()}${Math.random()}`;
      const response = await sendHttpRequest(
        externalHost,
        `/api/server-identity${randomParam}`,
        2000,
      );

      if (response.statusCode === 200) {
        const data = JSON.parse(response.data);
        if (data.id === 'running') {
          runningServerHits++;
        } else if (data.id === 'main') {
          mainServerHits++;
        }
      } else {
        failedRequests++;
      }
    } catch (error) {
      failedRequests++;
    }

    // 요청 간 짧은 대기
    await sleep(300);
  }

  // 결과 분석
  console.log(
    colors.cyan(`운영 서버 요청 수: ${runningServerHits}/${sampleSize}`),
  );
  console.log(
    colors.cyan(`메인 서버 요청 수: ${mainServerHits}/${sampleSize}`),
  );
  console.log(colors.cyan(`실패한 요청 수: ${failedRequests}/${sampleSize}`));

  const runningServerPercentage = (runningServerHits / sampleSize) * 100;

  if (runningServerPercentage >= 90) {
    console.log(
      colors.green(
        '<Success> Nginx가 대부분의 트래픽을 운영 서버로 라우팅하고 있습니다.',
      ),
    );
    return true;
  } else if (runningServerPercentage >= 50) {
    console.log(
      colors.yellow(
        `<Warning> Nginx가 일부 트래픽만 운영 서버로 라우팅하고 있습니다. (${runningServerPercentage.toFixed(
          1,
        )}%)`,
      ),
    );
    return true;
  } else {
    console.log(
      colors.red(
        '<Error> Nginx가 대부분의 트래픽을 운영 서버로 라우팅하지 않고 있습니다.',
      ),
    );
    return false;
  }
}

module.exports = {
  sleep,
  waitForServiceReady,
  warmupService,
  getServicePort,
  execCommand,
  isRegistered,
  verifyNuxtAppResources,
  verifyRunningServiceStability,
  verifyNginxLoadBalancing,
};
