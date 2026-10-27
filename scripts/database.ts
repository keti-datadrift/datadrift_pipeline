import { Client, ClientConfig } from 'pg';
import fs from 'fs';
import path from 'path';

// 환경 변수에서 PostgreSQL 접속 정보 읽기
const POSTGRE_HOST = process.env.POSTGRE_HOST;
const POSTGRE_PORT = process.env.POSTGRE_PORT
  ? parseInt(process.env.POSTGRE_PORT, 10)
  : 5432;
const POSTGRE_USER = process.env.POSTGRE_USER;
const POSTGRE_PASSWORD = process.env.POSTGRE_PASSWORD; // 비밀번호는 없을 수도 있음
const DASHBOARD_DB_NAME = 'dashboard'; // 사용할 데이터베이스 이름

/**
 * PostgreSQL 접속 설정을 생성하는 함수
 * @param dbName 접속할 데이터베이스 이름 (옵션)
 * @returns pg 라이브러리용 접속 설정 객체
 */
const createDbConfig = (dbName?: string): ClientConfig => {
  const config: ClientConfig = {
    host: POSTGRE_HOST,
    port: POSTGRE_PORT,
    user: POSTGRE_USER,
  };
  if (POSTGRE_PASSWORD) {
    config.password = POSTGRE_PASSWORD;
  }
  if (dbName) {
    config.database = dbName;
  }
  return config;
};

async function main() {
  // 필수 환경 변수 확인
  if (!POSTGRE_HOST || !POSTGRE_USER) {
    console.error(
      '오류: POSTGRE_HOST 와 POSTGRE_USER 환경 변수가 반드시 설정되어야 합니다.',
    );
    process.exit(1);
  }

  // 1. 기본 'postgres' 데이터베이스에 연결하여 'dashboard' 데이터베이스 생성 또는 확인
  const postgresConfig = createDbConfig('postgres'); // 'postgres' DB 또는 기본 유지보수 DB
  console.info(
    `기본 데이터베이스에 연결 중: host=${postgresConfig.host} port=${postgresConfig.port} user=${postgresConfig.user} dbname=${postgresConfig.database || 'postgres'}`,
  );
  const postgresClient = new Client(postgresConfig);

  try {
    await postgresClient.connect();
    console.info("'postgres' 데이터베이스에 성공적으로 연결되었습니다.");

    // 'dashboard' 데이터베이스 존재 여부 확인
    const dbExistsResult = await postgresClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [DASHBOARD_DB_NAME],
    );

    if (dbExistsResult.rowCount === 0) {
      console.info(
        `'${DASHBOARD_DB_NAME}' 데이터베이스가 존재하지 않습니다. 생성 중...`,
      );
      await postgresClient.query(`CREATE DATABASE ${DASHBOARD_DB_NAME}`);
      console.info(
        `'${DASHBOARD_DB_NAME}' 데이터베이스가 성공적으로 생성되었습니다.`,
      );
    } else {
      console.info(`'${DASHBOARD_DB_NAME}' 데이터베이스가 이미 존재합니다.`);
    }
  } catch (error) {
    console.error(`초기 연결 또는 데이터베이스 생성 중 오류 발생: ${error}`);
    process.exit(1);
  } finally {
    await postgresClient.end();
    console.info("'postgres' 데이터베이스 연결이 종료되었습니다.");
  }

  // 2. 'dashboard' 데이터베이스에 연결하여 SQL 스크립트 실행
  const dashboardConfig = createDbConfig(DASHBOARD_DB_NAME);
  console.info(
    `'${DASHBOARD_DB_NAME}' 데이터베이스에 연결 중: host=${dashboardConfig.host} port=${dashboardConfig.port} user=${dashboardConfig.user} dbname=${DASHBOARD_DB_NAME}`,
  );
  const dashboardClient = new Client(dashboardConfig);

  try {
    await dashboardClient.connect();
    console.info(
      `'${DASHBOARD_DB_NAME}' 데이터베이스에 성공적으로 연결되었습니다.`,
    );

    // 데이터베이스 설정 SQL 실행
    // __dirname은 현재 실행 중인 스크립트가 위치한 디렉토리를 가리킵니다.
    // init.sql 파일이 database.ts와 동일한 디렉토리에 있다고 가정합니다.
    const sqlFilePath = path.join(__dirname, 'init.sql');
    console.info(`다음 경로에서 SQL 설정 실행 중: ${sqlFilePath}`);

    if (!fs.existsSync(sqlFilePath)) {
      console.error(
        `오류: SQL 파일(${sqlFilePath})을 찾을 수 없습니다. 'init.sql' 파일이 스크립트와 동일한 디렉토리에 있는지 확인하세요.`,
      );
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    console.info('SQL 설정 스크립트 실행 중...');
    await dashboardClient.query(sqlContent);
    console.info('데이터베이스 설정이 성공적으로 완료되었습니다.');
  } catch (error) {
    console.error(
      `'${DASHBOARD_DB_NAME}' 데이터베이스 설정 중 오류 발생: ${error}`,
    );
    process.exit(1);
  } finally {
    await dashboardClient.end();
    console.info(`'${DASHBOARD_DB_NAME}' 데이터베이스 연결이 종료되었습니다.`);
  }
}

main().catch((error) => {
  console.error('스크립트 실행 중 처리되지 않은 오류:', error);
  process.exit(1);
});
