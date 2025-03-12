/**
 * deployment.js
 * Nuxt 3 배포 시 사용하기 위한 스크립트
 *
 * build 시 서버가 멈추는 것을 방지하기 위해 제작됨
 * 빌드 시간 측정 및 코드 개선 추가
 * 무중단 배포 기능 강화
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const colors = require('colors');
const TimeTracker = require('./_deployment/timeTracker');
const timeTracker = new TimeTracker();

const {
  waitForServiceReady,
  warmupService,
  isRegistered,
  execCommand,
  getServicePort,
  sleep,
  verifyRunningServiceStability,
  verifyNginxLoadBalancing,
} = require('./_deployment/lib');
const config = require('./_deployment/config');
const {
  createSymlink,
  copyWithRsync,
  copyRecursive,
} = require('./_deployment/fs');

/**
 * 빌드 단계 실행 함수 - Nuxt 3 지원
 * @param {boolean} skipBuild - 빌드 과정 건너뛰기 여부
 * @returns {Promise<void>}
 */
async function buildNuxt(skipBuild) {
  timeTracker.startStep('빌드');

  if (skipBuild) {
    console.log(colors.yellow('<Alert> 빌드 단계를 건너뜁니다.'));
    timeTracker.endStep('빌드');
    return;
  }

  console.log(
    colors.bold.blue('<Alert> 메인의 Nuxt 프로젝트 빌드를 시작했습니다.'),
  );

  try {
    // Nuxt 3의 빌드 명령
    await execCommand('npm run build', { rejectOnAnyError: true }); // Nuxt 빌드 시 발생한 오류는 무조건 Reject
    console.log(
      colors.bold.green(
        '<Success> 메인의 Nuxt 프로젝트 빌드가 완료되었습니다.',
      ),
    );
    timeTracker.endStep('빌드');
  } catch (error) {
    timeTracker.endStep('빌드');
    throw new Error(`빌드 오류: ${error.message}`);
  }
}

/**
 * 메인 서버의 PM2 시작 함수
 * @returns {Promise<void>}
 */
async function startMainPM2() {
  timeTracker.startStep('메인 PM2 시작');

  console.log(colors.bold.blue('<Alert> 메인에서 pm2 재시작을 시작했습니다.'));

  try {
    const processName = `${config.currDirName}${config.pm2Names.main}`;

    if (await isRegistered(processName)) {
      await execCommand(`pm2 reload ${processName}`);
      console.log(
        colors.bold.green(
          '<Success> pm2 정보를 찾았습니다. 해당 프로세스를 reload 합니다.',
        ),
      );
    } else {
      await execCommand(`pm2 start ./ecosystem.config.js`);
      console.log(
        colors.bold.green(
          '<Success> pm2 정보를 찾을 수 없습니다. 해당 프로세스를 신규로 등록합니다.',
        ),
      );
    }

    if (!(await isRegistered(processName))) {
      throw new Error('pm2가 정상적으로 등록되지 않았습니다.');
    }

    // 서비스가 준비될 때까지 대기
    const port = await getServicePort(false);
    await waitForServiceReady(
      `${config.serviceHost}:${port}`,
      config.maxAttempts,
      config.checkInterval,
    );

    // 서비스 워밍업 (라우팅 초기화 및 성능 안정화)
    await warmupService(`${config.serviceHost}:${port}`);

    timeTracker.endStep('메인 PM2 시작');
  } catch (error) {
    timeTracker.endStep('메인 PM2 시작');
    throw new Error(`메인 PM2 시작 오류: ${error.message}`);
  }
}

/**
 * 운영 디렉토리에 파일 복사 함수 - Nuxt 3 용 경로 지원
 * @returns {Promise<void>}
 */
async function copyToRunningDir() {
  timeTracker.startStep('파일 복사');

  console.log(
    colors.bold.blue(
      '<Alert> Running 내 파일 제거 후 메인에서 재복사를 시작합니다.',
    ),
  );

  try {
    // 운영 디렉토리가 있으면 제거
    if (fsSync.existsSync(config.runningDir)) {
      await fs.rm(config.runningDir, { recursive: true, force: true });
    }

    // 운영 디렉토리 생성
    await fs.mkdir(config.runningDir, { recursive: true });

    // 1. 심볼릭 링크로 처리할 대용량 디렉토리
    for (const pathName of config.symlinkPaths) {
      const srcPath = path.resolve(`${__dirname}/${pathName}`);
      const destPath = path.join(config.runningDir, pathName);

      if (fsSync.existsSync(srcPath)) {
        await createSymlink(srcPath, destPath);
        console.log(
          colors.green(`<Success> 심볼릭 링크 생성 완료: ${pathName}`),
        );
      } else {
        console.log(
          colors.yellow(`<Warning> 심볼릭 링크 대상 경로가 없음: ${pathName}`),
        );
      }
    }

    // 2. rsync로 복사할 파일 및 디렉토리
    for (const pathName of config.copyPaths) {
      const srcPath = path.resolve(`${__dirname}/${pathName}`);
      const destPath = path.join(config.runningDir, pathName);

      if (fsSync.existsSync(srcPath)) {
        const stats = await fs.stat(srcPath);

        if (stats.isDirectory() && fsSync.existsSync(destPath)) {
          // 디렉토리가 이미 존재하면 rsync 사용
          await copyWithRsync(srcPath, destPath);
          console.log(colors.green(`<Success> rsync 복사 완료: ${pathName}`));
        } else {
          // 새로 생성하거나 파일인 경우 복사 함수 사용
          await copyRecursive(srcPath, destPath);
          console.log(colors.green(`<Success> 재귀 복사 완료: ${pathName}`));
        }
      } else {
        console.log(
          colors.yellow(`<Warning> 복사 대상 경로가 없음: ${pathName}`),
        );
      }
    }

    // 3. Nuxt 3 특정 파일 확인 및 로깅
    const criticalFiles = [
      '.output/server/index.mjs', // Nuxt 3 서버 엔트리 포인트
      'ecosystem.config.js', // PM2 설정
      '.env', // 환경 변수
    ];

    let allCriticalFilesExist = true;

    for (const file of criticalFiles) {
      const filePath = path.join(config.runningDir, file);
      if (!fsSync.existsSync(filePath)) {
        console.log(
          colors.red(`<Error> 필수 파일이 운영 디렉토리에 없습니다: ${file}`),
        );
        allCriticalFilesExist = false;
      }
    }

    if (!allCriticalFilesExist) {
      console.log(
        colors.yellow(
          '<Warning> 일부 필수 파일이 운영 디렉토리에 없습니다. 배포가 실패할 수 있습니다.',
        ),
      );
    }

    console.log(
      colors.bold.green('<Success> 모든 파일의 복사가 완료되었습니다.'),
    );
    timeTracker.endStep('파일 복사');
  } catch (error) {
    timeTracker.endStep('파일 복사');
    throw new Error(`파일 복사 오류: ${error.message}`);
  }
}

/**
 * 운영 서버의 PM2 시작 및 준비 함수 (무중단 배포 전략)
 * 서비스가 완전히 준비된 후에만 다음 단계로 진행합니다.
 * @returns {Promise<boolean>} - 서비스가 정상적으로 준비되었는지 여부
 */
async function startAndWarmupRunningPM2() {
  timeTracker.startStep('운영 PM2 시작 및 준비');

  console.log(
    colors.bold.blue('<Alert> Running 에서 pm2 프로세스 시작을 시작합니다.'),
  );

  try {
    const processName = `${config.currDirName}${config.pm2Names.running}`;
    const port = await getServicePort(true);
    const ecosystemConfigPath = path.resolve(
      config.runningDir,
      'ecosystem.config.js',
    );

    // 1. PM2 프로세스 시작
    if (await isRegistered(processName)) {
      // 이미 등록된 경우 재시작
      await execCommand(`pm2 reload ${processName}`);
      console.log(
        colors.bold.green(
          `<Success> Running 프로세스(${processName})를 재시작했습니다.`,
        ),
      );
    } else {
      // 새로 등록
      await execCommand(
        `cd ${config.runningDir} && pm2 start ${ecosystemConfigPath}`,
      );
      console.log(
        colors.bold.green(
          `<Success> Running 프로세스(${processName})를 신규 등록했습니다.`,
        ),
      );
    }

    // 2. PM2 프로세스 상태 확인
    await sleep(2000); // PM2 프로세스가 등록되는데 시간이 필요함 (Nuxt 3에서는 조금 더 필요할 수 있음)
    const isRunning = await isRegistered(processName);

    if (!isRunning) {
      throw new Error('PM2 프로세스가 정상적으로 등록되지 않았습니다.');
    }

    // PM2 상태 추가 확인
    const pmStatus = await execCommand(`pm2 show ${processName} | grep status`);
    if (!pmStatus.includes('online')) {
      console.log(
        colors.yellow(
          `<Warning> PM2 프로세스가 online 상태가 아닙니다: ${pmStatus}`,
        ),
      );
      // 추가 대기 (Nuxt 3은 초기화 시간이 더 필요할 수 있음)
      console.log(colors.yellow('<Info> 추가 대기 중... (5초)'));
      await sleep(5000);
    }

    // 3. 서비스 준비 확인 단계
    try {
      timeTracker.startStep('서비스 준비 대기');

      // 3.1 기본 서비스 준비 확인 - HTTP 응답 확인
      console.log(
        colors.blue(
          `<Info> 서비스 준비 확인 중 (${config.serviceHost}:${port})...`,
        ),
      );

      const serviceReady = await waitForServiceReady(
        `${config.serviceHost}:${port}`,
        config.maxAttempts,
        config.checkInterval,
      );

      if (!serviceReady) {
        throw new Error('기본 서비스 준비 상태 확인에 실패했습니다.');
      }

      // 3.2 워밍업을 통한 서비스 준비 완료 확인
      const warmupOptions = {
        warmupPaths: config.warmupPaths,
        timeout: 20000, // 20초 제한 (Nuxt 3는 초기 로딩이 더 필요할 수 있음)
        requiredPaths: ['/'], // 메인 페이지는 반드시 성공해야 함
      };

      const warmupSuccess = await warmupService(
        `${config.serviceHost}:${port}`,
        config.warmupAttempts,
        warmupOptions,
      );

      if (!warmupSuccess) {
        console.log(
          colors.yellow(
            '<Warning> 워밍업이 완전히 성공하지 않았습니다. 추가 대기 중...',
          ),
        );

        // 추가 대기 후 한 번 더 핵심 경로 확인
        await sleep(5000); // Nuxt 3는 초기화 시간이 더 필요할 수 있음

        const finalCheckSuccess = await waitForServiceReady(
          `${config.serviceHost}:${port}`,
          5,
          1000,
        );

        if (!finalCheckSuccess) {
          throw new Error(
            '최종 서비스 준비 확인에 실패했습니다. 서비스가 불안정할 수 있습니다.',
          );
        } else {
          console.log(
            colors.green(
              '<Success> 추가 확인 결과 서비스가 응답합니다. 진행합니다.',
            ),
          );
        }
      }

      timeTracker.endStep('서비스 준비 대기');
    } catch (error) {
      timeTracker.endStep('서비스 준비 대기');
      throw new Error(`서비스 준비 대기 오류: ${error.message}`);
    }

    console.log(
      colors.bold.green(
        '<Success> 운영 서버의 PM2 프로세스가 완전히 준비되었습니다.',
      ),
    );
    timeTracker.endStep('운영 PM2 시작 및 준비');
    return true;
  } catch (error) {
    timeTracker.endStep('운영 PM2 시작 및 준비');
    throw new Error(`운영 PM2 시작 오류: ${error.message}`);
  }
}

/**
 * 메인 서버의 PM2 정지 함수
 * @returns {Promise<void>}
 */
async function stopMainPM2() {
  timeTracker.startStep('메인 PM2 정지');

  console.log(colors.bold.green('<Alert> 메인의 pm2 프로세스를 중지합니다.'));

  try {
    const processName = `${config.currDirName}${config.pm2Names.main}`;
    await execCommand(`pm2 stop ${processName}`);
    console.log(
      colors.bold.green('<Success> 메인의 pm2 프로세스를 중지했습니다.'),
    );

    timeTracker.endStep('메인 PM2 정지');
  } catch (error) {
    timeTracker.endStep('메인 PM2 정지');
    throw new Error(`메인 PM2 정지 오류: ${error.message}`);
  }
}

/**
 * 서비스 상태 확인 함수
 * @returns {Promise<void>}
 */
async function checkServiceStatus() {
  timeTracker.startStep('서비스 상태 확인');

  try {
    console.log(colors.bold.blue('<Alert> 서비스 상태를 확인합니다...'));

    // 운영 PM2 프로세스 상태 확인
    const processName = `${config.currDirName}${config.pm2Names.running}`;
    const output = await execCommand(`pm2 show ${processName} | grep status`);

    if (output.includes('online')) {
      console.log(
        colors.bold.green('<Success> 서비스가 정상적으로 실행 중입니다.'),
      );
    } else {
      console.log(
        colors.bold.yellow(
          '<Warning> 서비스가 실행 중이지만 상태가 불안정할 수 있습니다.',
        ),
      );
    }

    // 최종 서비스 접근 테스트
    const port = await getServicePort(true);
    const serviceReady = await waitForServiceReady(
      `${config.serviceHost}:${port}`,
      5,
      1000,
    );

    if (serviceReady) {
      console.log(
        colors.bold.green('<Success> 서비스가 정상적으로 응답합니다.'),
      );
    } else {
      console.log(
        colors.bold.yellow(
          '<Warning> 서비스 접근이 원활하지 않을 수 있습니다.',
        ),
      );
    }

    timeTracker.endStep('서비스 상태 확인');
  } catch (error) {
    console.log(
      colors.bold.yellow('<Warning> 서비스 상태를 확인할 수 없습니다.'),
    );
    timeTracker.endStep('서비스 상태 확인');
  }
}

/**
 * 메인 함수 - 무중단 배포 전략 적용
 */
async function main() {
  const logSaveFlag =
    process.argv.includes('--log') || process.argv.includes('-L');
  const skipBuild =
    process.argv.includes('--pass-build') || process.argv.includes('-P');
  const forceMainStop =
    process.argv.includes('--force-stop') || process.argv.includes('-F');

  timeTracker.startAll(logSaveFlag);

  try {
    // 1. 메인의 Nuxt 프로젝트 빌드
    await buildNuxt(skipBuild);

    // 2. 메인에서 pm2 재시작
    await startMainPM2();

    // 3. 운영 내 파일 제거 후 메인에서 재복사
    await copyToRunningDir();

    // 4. 운영에서 PM2 시작 및 서비스 준비 완료 대기 (무중단 배포 핵심)
    const runningStarted = await startAndWarmupRunningPM2();

    // 5. 운영 서버 추가 안정성 확인 및 Nginx 로드 밸런싱 확인
    if (runningStarted) {
      console.log(
        colors.green(
          '<Success> 운영 서버 시작이 완료되었습니다. 추가 안정성 확인 중...',
        ),
      );

      // 5.1 서버 안정성 확인
      timeTracker.startStep('운영 서버 안정성 확인');
      let stabilityConfirmed = false;
      let retryCount = 0;
      const maxRetries =
        config.nuxtResourceValidation?.stabilityCheckRetries || 3;

      while (!stabilityConfirmed && retryCount < maxRetries) {
        stabilityConfirmed = await verifyRunningServiceStability();

        if (!stabilityConfirmed) {
          retryCount++;
          console.log(
            colors.yellow(
              `<Warning> 운영 서버 안정성 확인 실패 (${retryCount}/${maxRetries}). 추가 대기 후 재시도합니다...`,
            ),
          );
          await sleep(3000 * retryCount); // 시간을 늘려가며 재시도
        }
      }
      timeTracker.endStep('운영 서버 안정성 확인');

      // 5.2 Nginx 로드 밸런싱 확인 (추가됨)
      timeTracker.startStep('Nginx 로드 밸런싱 확인');
      console.log(
        colors.blue('<Info> Nginx 트래픽 라우팅 상태를 확인합니다...'),
      );

      const externalHost = config.externalHost; // Nginx 호스트 (외부 접근)
      let nginxRoutingConfirmed = false;
      let nginxRetryCount = 0;
      const maxNginxRetries = 3;

      while (!nginxRoutingConfirmed && nginxRetryCount < maxNginxRetries) {
        nginxRoutingConfirmed = await verifyNginxLoadBalancing(externalHost);

        if (!nginxRoutingConfirmed) {
          nginxRetryCount++;
          console.log(
            colors.yellow(
              `<Warning> Nginx 라우팅 확인 실패 (${nginxRetryCount}/${maxNginxRetries}). 추가 대기 후 재시도합니다...`,
            ),
          );
          await sleep(3000 * nginxRetryCount);
        }
      }

      timeTracker.endStep('Nginx 로드 밸런싱 확인');

      // 5.3 안정성 확인 및 Nginx 라우팅 결과에 따른 분기
      if ((stabilityConfirmed && nginxRoutingConfirmed) || forceMainStop) {
        if ((!stabilityConfirmed || !nginxRoutingConfirmed) && forceMainStop) {
          console.log(
            colors.yellow(
              '<Warning> 서버 안정성 또는 Nginx 라우팅이 확인되지 않았지만, 강제 중지 옵션이 설정되어 있어 계속 진행합니다.',
            ),
          );
        }

        // 6. 메인의 pm2 중지
        await stopMainPM2();

        // 7. 서비스 상태 확인
        await checkServiceStatus();

        console.log(
          colors.green('<Success> 무중단으로 새 버전 서비스가 가동 중입니다.'),
        );
      } else {
        console.log(
          colors.bold.red(
            '<e> 운영 서버 안정성 또는 Nginx 트래픽 라우팅이 확보되지 않아 메인 서버를 유지합니다. 수동으로 확인이 필요합니다.',
          ),
        );

        if (!stabilityConfirmed) {
          console.log(
            colors.yellow(
              '운영 서버가 불안정합니다. 서버 로그와 리소스를 확인하세요.',
            ),
          );
        }

        if (!nginxRoutingConfirmed) {
          console.log(
            colors.yellow(
              'Nginx가 트래픽을 새 운영 서버로 제대로 라우팅하지 않습니다. Nginx 설정과 상태를 확인하세요.',
            ),
          );
        }

        console.log(
          colors.yellow(
            '수동 확인 후 안정성이 확보되면 다음 명령으로 메인 서버를 중지할 수 있습니다:',
          ),
        );
        console.log(
          colors.yellow(
            `pm2 stop ${config.currDirName}${config.pm2Names.main}`,
          ),
        );
      }
    } else {
      throw new Error('운영 서버 시작에 실패했습니다. 메인 서버를 유지합니다.');
    }

    timeTracker.endAll();
    timeTracker.printResult();

    console.log(
      colors.bold.bgGreen(
        '<Complete> 모든 배포 과정을 완료했습니다! (무중단 배포)',
      ),
    );
  } catch (error) {
    timeTracker.endAll();
    timeTracker.printResult();

    console.error(
      colors.bold.red(
        `<e> 배포 과정에서 오류가 발생했습니다: ${error.message}`,
      ),
    );
    process.exit(1);
  }
}

// 스크립트 실행
main();
