# 소스 구조와 제출본

## 주요 소스

| 위치 | 역할 |
| --- | --- |
| `src/app/` | 페이지 진입점, 공통 레이아웃과 스타일 |
| `src/components/dashboard.tsx` | 화면 상태와 사용자 동작 연결 |
| `src/components/dashboard/` | 워크스페이스·모델·평가·학습·드리프트·재구성 화면 |
| `src/components/model-api/` | API 등록 목록, 추론 결과와 요청 이력 |
| `src/components/drift/` | 복합 드리프트 판정과 요약 |
| `src/hooks/use-platform-catalog.ts` | 화면별 데이터 조회와 주기적 갱신 |
| `src/lib/` | 공통 API 요청, 타입과 표시 형식 |
| `backend/api.py` | FastAPI 초기화, 예외 처리와 라우터 연결 |
| `backend/routes/` | 워크스페이스·데이터·레이블·모델·작업별 HTTP 처리 |
| `backend/schemas/` | 요청 형식, 속성 사전과 입력 검증 |
| `backend/data/` | 영속 저장, 데이터 버전, 이미지 업로드·삭제와 재구성 |
| `backend/catalog.py` | 기본 모델 등록과 기존 레이블 데이터 가져오기 |
| `backend/worker.py` | 작업 선점, 종류별 실행과 재시작 복구 |
| `backend/jobs/` | 하위 프로세스 실행, 진행·취소, 작업 입력과 결과 반영 |
| `backend/models/` | 모델 API, vLLM 추론과 평가 배치 처리 |
| `backend/drift/` | 통계 검정, 이미지 특징 추출과 드리프트 판정 |
| `backend/training.py`, `backend/relabeling.py` | Transformers+PEFT 학습·평가와 레이블링 실행 |
| `backend/vllm_runtime.py` | 모델 API 접수 상태에 따른 추론 서비스 관리 |
| `backend/migrate_taxonomy.py`, `backend/standardize_catalog.py` | 카탈로그와 레이블 기준 전환 명령 |

백엔드 루트에는 실행 진입점을 두고, 내부 모듈은 위 폴더에서 관리한다.
속성 사전 JSON은 `backend/schemas/`에 있으며 두 ZIP 모두 같은 경로로 포함한다.

설치·서비스 실행 명령, 포트와 API 경로는 바뀌지 않는다.
`uvicorn backend.api:app`, `python -m backend.worker`,
`python -m backend.catalog`, `python -m backend.vllm_runtime`과
학습·레이블링·카탈로그 전환 명령은 기존 경로를 사용한다.
`backend.api.Reconstruction`과 `backend.api.reconstruct`도 같은 경로로 가져올 수 있다.
내부 모듈을 직접 가져오는 별도 코드는 위 표의 패키지 경로를 사용한다.

## 개발 검사

프로젝트 루트에서 실행한다. Python 3.12와 Node.js 22 환경에서 검증했다.

```sh
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/ruff check backend scripts tests
.venv/bin/ruff format --check backend scripts tests
.venv/bin/python -m pytest -q
npm run typecheck
npx prettier --check src next.config.ts
npm run build
```

Python의 불필요한 import, 잘못된 구문과 반복적인 코드를 Ruff로 검사한다.
TypeScript의 사용하지 않는 지역 변수와 인수는 컴파일 검사에서 거절한다.
브라우저 검증과 실제 GPU를 쓰는 검증의 구분은 [검증 결과](verification.md)를 참고한다.

## 제출용 ZIP

```sh
.venv/bin/python scripts/package_source.py --output dist/submission
```

실행하면 `dist/submission/`에 내용 해시로 구분한 소스 복사 폴더와 ZIP이 생성된다.
동일 소스로 재실행하면 같은 ZIP 바이트와 SHA256이 나온다.

제출 ZIP에는 다음 소스와 프로젝트 설정을 포함한다.

- `backend/` 아래 Python 소스
- `src/` 아래 TypeScript·TSX·JavaScript·CSS 소스
- `next.config.ts`, `postcss.config.mjs`
- `package.json`, `package-lock.json`, `tsconfig.json`
- `requirements.txt`, `requirements.lock.txt`
- `backend/schemas/`의 속성 사전 JSON과 기존 `LICENSE`

README·문서·테스트·운영 스크립트·서버별 서비스 설정,
이미지·모델 가중치·DB·로그·환경변수·빌드 결과는 넣지 않는다.
파일 목록과 SHA256은 ZIP 바깥의 `.manifest.json`, `.sha256` 파일에 기록한다.
각 ZIP 파일의 경로·내용 해시와 압축 무결성도 생성 과정에서 확인한다.

의존성을 설치하고 모델과 GPU 환경을 준비하면 제출용 ZIP에서도 웹·API·워커를
실행할 수 있다. 서비스 등록은 설치 환경에 맞게 구성한다.

## 서비스 설정을 포함한 ZIP

기존 서버의 systemd 서비스 파일도 참고용으로 포함하려면 다음 명령을 사용한다.

```sh
.venv/bin/python scripts/package_source.py --profile runnable --output dist/submission
```

실행 구성 ZIP에는 제출용 ZIP과 같은 소스·프로젝트 설정에 systemd 서비스 파일을 추가한다.
README·문서·DB·이미지·모델·설치된 의존성·빌드 결과는 포함하지 않는다.
서비스 파일의 경로·GPU·접속 주소는 설치 환경에 맞게 변경해야 한다.
[실행·사용 방법](program-user-guide.md)은 별도 문서로 제공하며 두 ZIP 모두에 포함하지 않는다.
