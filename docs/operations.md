# 실행 및 운영

## 구성

- UI: Next.js, `http://121.126.210.3:18091/ko/workspaces`
- API: FastAPI, loopback `127.0.0.1:18092` (UI의 `/api/*`로 프록시)
- API 문서: 서버에서 `http://127.0.0.1:18092/api/docs`
- 저장소: `.runtime/catalog.sqlite`, SQLite WAL; 단일 호스트/단일 워커 구성
- GPU: 기존 전용 Python 환경 `/data/hslim/venvs/gemma4-12b-transformers-dev/bin/python`
- 기본 모델: `/data/hslim/models/Qwen3.5-2B`, `/data/hslim/models/Qwen3.5-4B`
- 모델·로그·입력 스냅샷: `.runtime/jobs/<job-id>/`
- 로그인 없음. 기존 내부망 접근 범위에서 운영하며 방화벽이나 외부 공개 설정은 변경하지 않습니다.

## 설치

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
DATADRIFT_INPUT_ROOT=/home/hslim/Code/datadrift .venv/bin/python -m backend.catalog
npm run build
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
```

GPU 환경은 별도입니다. 현재 검증 환경은 torch 2.10.0+cu128,
transformers 5.18.0.dev0, peft 0.20.0이며 Qwen3_5ForConditionalGeneration을 지원해야 합니다.
기존 GPU 환경을 변경하지 않습니다. 모델은 로컬 파일만 읽습니다.
서비스 파일의 작업 경로·실행 파일·포트·환경변수를 환경에 맞춰 확인한 뒤 설치합니다.

```sh
cp deploy/datadrift-pipeline-*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now datadrift-pipeline-api datadrift-pipeline-worker datadrift-pipeline-web
```

`DATADRIFT_STATE`, `DATADRIFT_INPUT_ROOT`, `DATADRIFT_MODELS`,
`DATADRIFT_TRAIN_PYTHON`, `DATADRIFT_GPU`, `DATADRIFT_PUBLIC_ORIGIN`으로 경로와 실행 환경을 지정합니다.
프록시를 통한 브라우저 쓰기 요청은 `DATADRIFT_PUBLIC_ORIGIN`과 일치해야 합니다.
CLI 요청은 Origin 없이 내부 API에 접근합니다.

## 서비스 유지·관찰

```sh
systemctl --user status datadrift-pipeline-api datadrift-pipeline-worker datadrift-pipeline-web
journalctl --user -u datadrift-pipeline-api -u datadrift-pipeline-worker -u datadrift-pipeline-web -f
systemctl --user restart datadrift-pipeline-web
curl -f http://121.126.210.3:18091/api/health
loginctl show-user "$USER" -p Linger
```

API/UI 재시작은 실행 중인 워커 학습을 끊지 않습니다. 워커 재시작은 실행 중 작업과
해당 자식 프로세스를 종료합니다. 재시작 시 그 작업은 실패로 표시되며, 부분 산출물을
보존합니다. 사용자가 새 작업을 등록해야 합니다. 실행 중 모델 학습의 자동 이어하기는 제공하지 않습니다.
서비스의 Restart=always와 사용자 linger로 로그인 세션과 독립적으로 실행합니다.

## 데이터와 평가 해석

무신사 1,000개는 Codex의 시각 검토 레이블, GS SHOP 651개는 Gemma4의 의사 레이블입니다.
둘 다 사람 검증 정답이 아닙니다. 원본 SHA256, 출처, 기존 train/validation/test 분할,
평가 제외 속성을 보존합니다. 원본 이미지와 레이블 파일을 Git에 올리지 않습니다.
무신사 700/100/200, GS SHOP 490/81/80 분할을 사용합니다.
가져오기는 전체 검증 후 원자적으로 저장하며 동일 내용의 재실행은 중복 생성하지 않습니다.

재구성은 학습 분할만 변경하고 검증/테스트는 원본 그대로 보존합니다.
출처 균형 또는 고정 시드 무작위 선별을 지원하며 각 결과를 불변 데이터셋으로 저장합니다.
레이블 내보내기는 이미지 경로를 제외한 JSONL이며 이미지 파일 자체는 원본 저장소에 남습니다.

학습은 배치 1, SFT+LoRA rank/alpha 8, BF16, 언어 attention 레이어만 갱신합니다.
unknown과 평가 제외 속성 값은 손실에서 마스킹합니다. 학습 스텝 수는 전체 에포크 수와 다릅니다.
성공한 학습은 레지스트리에 새 어댑터 모델로 등록됩니다.
평가는 검증/테스트 분할에서 생성한 JSON과 AI 레이블의 일치도를 측정하며 파싱 실패도 오답으로 계산합니다.
2스텝/소수 샘플 검증은 작동 확인이며 모델 품질 검증이나 전체 학습을 의미하지 않습니다.

드리프트는 선택한 레이블 기준의 속성별 Jensen–Shannon divergence (base 2, 0~1)와
이미지 RGB 히스토그램 JS를 계산합니다. 소스/도메인 차이이며 시간 순서 드리프트,
성능 저하, 통계적 유의성, 임베딩 기반 검출을 주장하지 않습니다.
GS SHOP과 무신사의 레이블 생성 방식 차이도 분포 결과에 영향을 줍니다.

## 검증

```sh
.venv/bin/python -m pytest -q
npm run typecheck
npm run build
```

데이터 상태를 복구할 때는 API/워커를 명시적으로 중지하고 SQLite 온라인 백업 또는
WAL을 포함한 일관된 스냅샷과 `.runtime/jobs`를 함께 보관합니다.
이 프로젝트는 다중 호스트 작업 스케줄러, SSO, 오브젝트 스토리지 배포를 포함하지 않습니다.

## 수동 레이블 검토

워크스페이스에서 데이터셋 버전을 고르고 이미지를 누르면 레이블 편집 화면이 열립니다.
왼쪽 이미지는 확대할 수 있고, 오른쪽에서 선택한 기준과 상품 카테고리에 맞는 속성을 선택합니다. 디자인 디테일은 복수 선택입니다.
판단할 수 없는 단일 속성은 `unknown`(판단 어려움), 적용되지 않는 속성은
허용된 경우 `not_applicable`(해당 없음)을 사용합니다. 제외한 속성은 학습 손실과 평가에서 빠집니다.

`수정본 저장`은 해당 이미지의 레이블을 바꾼 전체 데이터셋을 새 불변 버전으로 저장합니다.
원본 데이터, 다른 이미지, train/validation/test 분할, 기존 학습·평가 기록은 유지됩니다.
화면은 저장된 버전으로 전환되며 이후 학습/평가에서도 이 버전을 선택할 수 있습니다.
저장할 때마다 버전이 하나 생성됩니다. 현재 페이지의 이전·다음 이미지 이동을 지원합니다.

사람 검토 완료는 사용자가 `전체 속성을 직접 검토했습니다`를 선택했을 때만 기록합니다.
속성이나 제외 설정을 다시 바꾸면 확인 체크를 해제합니다. 저장하지 않은 변경은 닫기/이동 전에
버릴지 확인하며, 저장 실패 시 입력을 유지합니다. 원래 AI 레이블 출처와 이전 값·메모·수정 시간을
새 버전 안에 남깁니다. 로그인 없는 서비스이므로 검토자의 개인 신원은 인증하거나 기록하지 않습니다.

API: `GET /api/label-schema`, `POST /api/datasets/{dataset_id}/samples/{sample_id}/labels`.
POST에는 해당 기준의 키를 모두 가진 `target`, `unscored_fields`, `human_verified`, `note`를 보냅니다.
성공하면 새 버전의 메타데이터와 수정한 샘플을 반환합니다. 허용되지 않은 속성/값은 422,
없는 데이터셋/샘플은 404입니다. 기존 샘플을 덮어쓰는 PATCH가 아닙니다.

## 비케이브 엑셀 기준

현재 기준은 `bkave-106baf22f720`입니다. 첨부된 `비케이브_Taxonomy_공유.xlsx`의
SHA256은 `106baf22f720`로 시작하며 전체 해시는 `backend/bkave_taxonomy.json`에 있습니다.
`python scripts/extract_taxonomy.py INPUT.xlsx OUTPUT.json`으로 엑셀 세 시트를 읽습니다.
원문 카테고리 64개, 색상 코드 212개, 카테고리별 속성·공통 속성의 철자를 그대로 보존합니다.
색상군의 옐로/옐로우, 같은 이름에 여러 코드가 있는 경우도 임의로 합치지 않습니다.
카테고리 코드 표는 기준 사전으로 보존하며 새로운 상품 분류 작업을 추가하지는 않습니다.

`GET /api/taxonomy`는 기준 사전, `GET /api/label-schema?schema_id=...&category=상의`는
해당 범위의 허용값을 제공합니다. 데이터셋/학습 모델의 `schema_id`를 기준으로 UI·검증·프롬프트·평가가
같은 규칙을 사용합니다. 이전 데이터/모델은 `visual-v1`로 취급하고 계속 조회·편집·실행할 수 있습니다.
서로 다른 기준의 데이터 재구성·드리프트 비교·LoRA 모델 사용은 거절합니다. 기본 모델은 어느 기준에도
사용할 수 있습니다. 새 모델은 기준 ID, 프롬프트와 원문 사전 스냅샷을 보관합니다.

비케이브 속성 키는 `fit,length,sleeve,neckline,pattern,details,fabric,origin,color_code`입니다.
상품 카테고리는 기존 메타데이터의 아우터/상의/하의/ACC를 입력 문맥으로 사용합니다.
카테고리에 없는 속성은 시스템 값 `not_applicable`, 판단할 수 없는 값은 `unknown`으로 표시합니다.
이 둘은 비케이브가 정의한 추가 속성값이 아닙니다. UI에서는 해당 없음/판단 어려움으로 표시합니다.

`PYTHONPATH=. .venv/bin/python -m backend.migrate_taxonomy`는 이전 버전을 보존한 채
보수적 변환본을 생성합니다. 원본 버전·해시·기준·변환 정책으로 중복 생성을 방지합니다.
카테고리와 맞는 확실한 동의어만 변환하고, 이전의 작은 로고 무시 정책 때문에 확정할 수 없는
무늬는 미확인으로 둡니다. 이전 디테일은 새 전체 어휘를 검토한 결과가 아니므로 보이는 대응값을
검토용으로 보존하되 전체 필드를 학습/평가에서 제외합니다. 원단은 데님/니트/플리스처럼 근거 있는
기존 시각 레이블만 대응합니다. 생산처·세부 색상 코드는 원본 정답이 없으므로 미확인으로 두며
학습 손실과 평가에서 제외합니다. 사람 검토 완료로 자동 변경하지 않습니다.

`PYTHONPATH=. .venv/bin/python scripts/run_bkave_experiment.py`는 최초에 혼합 학습 버전을 만들고
2B/4B 각 100스텝과 동일 seed의 검증 32개 평가를 요청합니다. 실행 상태는 `.runtime/bkave-experiment.json`에
보관합니다. 기존 리포트가 있으면 그 작업을 이어 확인하며 임의로 새 실험을 중복 생성하지 않습니다.
작업 자체는 systemd 워커 큐에 영속 저장됩니다. 조정 스크립트가 중단되면 같은 명령으로 결과 확인과
평가 등록을 이어갈 수 있습니다. 기존 실행 리포트를 덮어쓰지 않고 새 실험을 하려면 별도 리포트를 지정하는
방식으로 스크립트를 확장해야 합니다. 학습 중에는 API/웹만 재시작하고 워커를 재시작하지 마세요.

`/api/label-schema`의 기본 응답은 비케이브 기준입니다. 기존 14개 속성 사전이 필요한 클라이언트는
`schema_id=visual-v1`을 명시해야 합니다. 비케이브 카테고리별 값은 `category=상의`처럼 함께 지정하세요.

## AI 재레이블링·드리프트 실험

[실행 조건·API·비교 방법](ai-relabel-drift.md)을 참고하세요. 레이블링은 학습과 같은 GPU 큐에서 순차 처리하며 원본을 보존하는 새 버전을 생성합니다.
