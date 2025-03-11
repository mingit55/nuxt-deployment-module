const path = require('path');
const os = require('os');
const v8 = require('v8');
const colors = require('colors');
const fs = require('fs').promises;
const fsSync = require('fs');

module.exports = class TimeTracker {
  constructor() {
    this.start = null;
    this.end = null;
    this.steps = {};
    this.systemInfo = {
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
    };
  }

  // CPU 사용량 측정
  getCpuUsage() {
    const cpus = os.cpus();

    // 모든 CPU 코어의 평균 사용률 계산
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce(
      (acc, cpu) => acc + Object.values(cpu.times).reduce((a, b) => a + b, 0),
      0,
    );

    // 유휴 시간이 아닌 비율을 CPU 사용률로 계산 (백분율)
    return {
      usage: ((1 - totalIdle / totalTick) * 100).toFixed(2) + '%',
      cpuInfo: `${cpus[0].model} (${cpus.length} cores)`,
    };
  }

  // 메모리 사용량 측정
  getMemoryUsage() {
    const totalMemoryGB = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMemoryGB = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedMemoryGB = (totalMemoryGB - freeMemoryGB).toFixed(2);
    const memoryUsagePercent = (
      (1 - os.freemem() / os.totalmem()) *
      100
    ).toFixed(2);

    // 프로세스 메모리 사용량
    const processMemoryUsage = process.memoryUsage();
    const heapUsed = (processMemoryUsage.heapUsed / (1024 * 1024)).toFixed(2);
    const heapTotal = (processMemoryUsage.heapTotal / (1024 * 1024)).toFixed(2);
    const rss = (processMemoryUsage.rss / (1024 * 1024)).toFixed(2);

    // V8 힙 통계
    const heapStats = v8.getHeapStatistics();
    const heapSizeLimit = (heapStats.heap_size_limit / (1024 * 1024)).toFixed(
      2,
    );

    return {
      systemMemory: {
        total: `${totalMemoryGB} GB`,
        free: `${freeMemoryGB} GB`,
        used: `${usedMemoryGB} GB`,
        usagePercent: `${memoryUsagePercent}%`,
      },
      processMemory: {
        rss: `${rss} MB`, // Resident Set Size (실제 물리 메모리 사용량)
        heapTotal: `${heapTotal} MB`, // V8 힙 총 크기
        heapUsed: `${heapUsed} MB`, // V8 힙 사용량
        heapSizeLimit: `${heapSizeLimit} MB`, // V8 힙 최대 크기
      },
    };
  }

  // 단계별 시간 측정 시작
  startStep(step) {
    this.steps[step] = {
      start: Date.now(),
      end: null,
      duration: null,
      cpuUsageStart: this.getCpuUsage(),
      memoryUsageStart: this.getMemoryUsage(),
    };
    return this.steps[step].start;
  }

  // 단계별 시간 측정 종료
  endStep(step) {
    if (!this.steps[step]) {
      this.startStep(step);
    }

    this.steps[step].end = Date.now();
    this.steps[step].duration = this.steps[step].end - this.steps[step].start;
    this.steps[step].cpuUsageEnd = this.getCpuUsage();
    this.steps[step].memoryUsageEnd = this.getMemoryUsage();
    return this.steps[step].duration;
  }

  // 전체 시간 측정 시작
  startAll(logSaveFlag = false) {
    this.logSaveFlag = logSaveFlag;
    this.start = Date.now();
    this.initialCpuUsage = this.getCpuUsage();
    this.initialMemoryUsage = this.getMemoryUsage();
    return this.start;
  }

  // 전체 시간 측정 종료
  endAll() {
    this.end = Date.now();
    this.finalCpuUsage = this.getCpuUsage();
    this.finalMemoryUsage = this.getMemoryUsage();
    return this.end - this.start;
  }

  // 시간 포맷팅 (ms -> 00:00:00 형식)
  formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(
      2,
      '0',
    )}:${String(seconds % 60).padStart(2, '0')}`;
  }

  // 결과 출력
  printResult() {
    console.log(
      colors.bold.cyan('\n===== 빌드 시간 및 자원 사용량 측정 결과 ====='),
    );

    console.log(colors.cyan('\n[시스템 정보]'));
    console.log(
      colors.cyan(
        `CPU: ${this.systemInfo.cpuCount}코어 (${os.cpus()[0].model})`,
      ),
    );
    console.log(
      colors.cyan(
        `메모리: ${(this.systemInfo.totalMemory / (1024 * 1024 * 1024)).toFixed(
          2,
        )} GB`,
      ),
    );
    console.log(colors.cyan(`운영체제: ${os.type()} ${os.release()}`));

    console.log(colors.cyan('\n[전체 프로세스 자원 사용량]'));
    console.log(colors.cyan(`초기 CPU 사용률: ${this.initialCpuUsage.usage}`));
    console.log(colors.cyan(`최종 CPU 사용률: ${this.finalCpuUsage.usage}`));
    console.log(
      colors.cyan(
        `초기 메모리 사용률: ${this.initialMemoryUsage.systemMemory.usagePercent}`,
      ),
    );
    console.log(
      colors.cyan(
        `최종 메모리 사용률: ${this.finalMemoryUsage.systemMemory.usagePercent}`,
      ),
    );
    console.log(
      colors.cyan(
        `프로세스 메모리(RSS): ${this.initialMemoryUsage.processMemory.rss} → ${this.finalMemoryUsage.processMemory.rss}`,
      ),
    );
    console.log(
      colors.cyan(
        `힙 메모리: ${this.initialMemoryUsage.processMemory.heapUsed} → ${this.finalMemoryUsage.processMemory.heapUsed}`,
      ),
    );

    console.log(colors.cyan('\n[단계별 소요 시간 및 자원 사용량]'));
    Object.keys(this.steps).forEach((step) => {
      const stepData = this.steps[step];
      const duration = stepData.duration;

      console.log(colors.bold.cyan(`\n[${step}]`));
      console.log(
        colors.cyan(`소요시간: ${this.formatTime(duration)} (${duration}ms)`),
      );

      // CPU 사용량 변화
      console.log(
        colors.cyan(
          `CPU 사용률: ${stepData.cpuUsageStart.usage} → ${stepData.cpuUsageEnd.usage}`,
        ),
      );

      // 메모리 사용량 변화
      console.log(
        colors.cyan(
          `시스템 메모리 사용률: ${stepData.memoryUsageStart.systemMemory.usagePercent} → ${stepData.memoryUsageEnd.systemMemory.usagePercent}`,
        ),
      );
      console.log(
        colors.cyan(
          `프로세스 메모리(RSS): ${stepData.memoryUsageStart.processMemory.rss} → ${stepData.memoryUsageEnd.processMemory.rss}`,
        ),
      );
      console.log(
        colors.cyan(
          `힙 메모리: ${stepData.memoryUsageStart.processMemory.heapUsed} → ${stepData.memoryUsageEnd.processMemory.heapUsed}`,
        ),
      );
    });

    console.log(
      colors.bold.cyan(
        `\n총 소요시간: ${this.formatTime(this.end - this.start)} (${
          this.end - this.start
        }ms)`,
      ),
    );
    console.log(
      colors.bold.cyan('===============================================\n'),
    );

    // 로그 파일에 기록
    if (this.logSaveFlag) {
      this.saveToLogFile();
    }
  }

  // 로그 파일에 결과 저장
  async saveToLogFile() {
    try {
      const logDir = path.join(__dirname, 'logs');
      const now = new Date();
      const dateString = now.toISOString().replace(/[:.]/g, '-').split('T')[0];
      const timeString = now
        .toISOString()
        .replace(/[:.]/g, '-')
        .split('T')[1]
        .split('Z')[0];
      const logFileName = `deployment-${dateString}_${timeString}.log`;

      // 로그 디렉토리가 없으면 생성
      if (!fsSync.existsSync(logDir)) {
        await fs.mkdir(logDir, { recursive: true });
      }

      // 로그 데이터 준비
      let logData = '===== 빌드 시간 및 자원 사용량 측정 결과 =====\n\n';

      logData += '[시스템 정보]\n';
      logData += `CPU: ${this.systemInfo.cpuCount}코어 (${
        os.cpus()[0].model
      })\n`;
      logData += `메모리: ${(
        this.systemInfo.totalMemory /
        (1024 * 1024 * 1024)
      ).toFixed(2)} GB\n`;
      logData += `운영체제: ${os.type()} ${os.release()}\n\n`;

      logData += '[전체 프로세스 자원 사용량]\n';
      logData += `초기 CPU 사용률: ${this.initialCpuUsage.usage}\n`;
      logData += `최종 CPU 사용률: ${this.finalCpuUsage.usage}\n`;
      logData += `초기 메모리 사용률: ${this.initialMemoryUsage.systemMemory.usagePercent}\n`;
      logData += `최종 메모리 사용률: ${this.finalMemoryUsage.systemMemory.usagePercent}\n`;
      logData += `프로세스 메모리(RSS): ${this.initialMemoryUsage.processMemory.rss} → ${this.finalMemoryUsage.processMemory.rss}\n`;
      logData += `힙 메모리: ${this.initialMemoryUsage.processMemory.heapUsed} → ${this.finalMemoryUsage.processMemory.heapUsed}\n\n`;

      logData += '[단계별 소요 시간 및 자원 사용량]\n';
      Object.keys(this.steps).forEach((step) => {
        const stepData = this.steps[step];
        const duration = stepData.duration;

        logData += `\n[${step}]\n`;
        logData += `소요시간: ${this.formatTime(duration)} (${duration}ms)\n`;
        logData += `CPU 사용률: ${stepData.cpuUsageStart.usage} → ${stepData.cpuUsageEnd.usage}\n`;
        logData += `시스템 메모리 사용률: ${stepData.memoryUsageStart.systemMemory.usagePercent} → ${stepData.memoryUsageEnd.systemMemory.usagePercent}\n`;
        logData += `프로세스 메모리(RSS): ${stepData.memoryUsageStart.processMemory.rss} → ${stepData.memoryUsageEnd.processMemory.rss}\n`;
        logData += `힙 메모리: ${stepData.memoryUsageStart.processMemory.heapUsed} → ${stepData.memoryUsageEnd.processMemory.heapUsed}\n`;
      });

      logData += `\n총 소요시간: ${this.formatTime(this.end - this.start)} (${
        this.end - this.start
      }ms)\n`;
      logData += '===============================================\n';

      // 로그 파일에 기록
      await fs.writeFile(path.join(logDir, logFileName), logData);
      console.log(
        colors.green(
          `로그 파일이 생성되었습니다: ${path.join(logDir, logFileName)}`,
        ),
      );
    } catch (error) {
      console.error(colors.red(`로그 파일 생성 중 오류: ${error.message}`));
    }
  }
};
