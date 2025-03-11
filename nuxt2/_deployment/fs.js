/**
 * 최적화된 파일 복사 기능
 * 1. 스트림 기반 복사
 * 2. 심볼릭 링크 사용
 * 3. 시스템 명령어 활용
 */

const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');
const { createReadStream, createWriteStream } = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * 스트림 기반 파일 복사 함수
 * @param {string} src - 원본 파일 경로
 * @param {string} dest - 대상 파일 경로
 * @returns {Promise<void>}
 */
function copyFileStream(src, dest) {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(src);
    const writeStream = createWriteStream(dest);

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);

    readStream.pipe(writeStream);
  });
}

/**
 * 파일 재귀 복사
 * @param {string} src - 소스 경로
 * @param {string} dest - 대상 경로
 * @returns {Promise<void>}
 */
async function copyRecursive(src, dest) {
  try {
    const stats = await fs.stat(src);
    if (stats.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const files = await fs.readdir(src);

      // 디렉토리 내 파일을 배치 처리로 나누어 복사
      const batchSize = 50; // 한 번에 처리할 파일 수
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(
          batch.map((file) =>
            copyRecursive(path.join(src, file), path.join(dest, file)),
          ),
        );
      }
    } else {
      // 파일 크기에 따라 처리 방식 결정
      if (stats.size > 10 * 1024 * 1024) {
        // 10MB 이상인 경우
        await copyFileStream(src, dest); // 스트림 방식 사용
      } else {
        await fs.copyFile(src, dest); // 작은 파일은 기존 방식
      }
    }
  } catch (error) {
    console.error(`Copy error for ${src} to ${dest}: ${error.message}`);
    throw error;
  }
}

/**
 * rsync 명령어를 사용한 디렉토리 복사 함수
 * @param {string} src - 소스 경로
 * @param {string} dest - 대상 경로
 * @returns {Promise<void>}
 */
async function copyWithRsync(src, dest) {
  try {
    // rsync 명령어 옵션
    // -a: 아카이브 모드 (권한, 타임스탬프 등 보존)
    // -z: 압축 모드
    // --delete: 대상에 있지만 소스에 없는 파일 삭제
    await execAsync(`rsync -az --delete "${src}/" "${dest}/"`);
  } catch (error) {
    // rsync가 실패하면 대체 방법으로 시스템 cp 명령 시도
    try {
      await execAsync(`cp -R "${src}/" "${dest}/"`);
    } catch (cpError) {
      throw new Error(
        `Copy failed: ${error.message}, cp fallback failed: ${cpError.message}`,
      );
    }
  }
}

/**
 * 심볼릭 링크 생성 함수
 * @param {string} targetPath - 원본 경로
 * @param {string} linkPath - 링크 경로
 * @returns {Promise<void>}
 */
// 수정 후
async function createSymlink(targetPath, linkPath) {
  try {
    // 대상 디렉토리의 상위 경로가 존재하는지 확인하고 없으면 생성
    const linkDir = path.dirname(linkPath);
    if (!fsSync.existsSync(linkDir)) {
      await fs.mkdir(linkDir, { recursive: true });
    }

    // 경로가 이미 존재하면 삭제
    if (fsSync.existsSync(linkPath)) {
      // 심볼릭 링크인지 확인
      const stats = await fs.lstat(linkPath);
      if (stats.isSymbolicLink()) {
        await fs.unlink(linkPath);
      } else {
        await fs.rm(linkPath, { recursive: true, force: true });
      }
    }

    // 상대 경로로 심볼릭 링크 생성
    const relativePath = path.relative(path.dirname(linkPath), targetPath);
    await fs.symlink(relativePath, linkPath, 'junction');
  } catch (error) {
    console.error(
      `심볼릭 링크 생성 오류 - 타겟: ${targetPath}, 링크: ${linkPath}`,
    );
    throw new Error(`Symlink creation failed: ${error.message}`);
  }
}

module.exports = {
  copyRecursive,
  createSymlink,
  copyWithRsync,
};
