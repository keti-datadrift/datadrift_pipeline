# DataDrift Pipeline 프로그램 실행 및 사용 방법

## 프로그램 개요

이미지 데이터와 속성 레이블을 관리하고, 데이터를 재구성하여 모델을 학습·평가하는
DataOps·MLOps 웹 프로그램이다. 학습된 모델을 이미지 추론 API로 제공하고,
데이터 간 속성·카테고리·이미지 분포 차이를 함께 확인할 수 있다.

브라우저 화면은 Next.js, API는 FastAPI, 작업 이력은 SQLite를 사용한다.
학습·평가는 Transformers+PEFT, 모델 API 추론은 vLLM으로 실행한다.

## 실행 환경 및 준비 파일

현재 검증 환경은 Linux, Python 3.12.3, Node.js 22.14.0, Next.js 15.5.28이다.
웹·API용 Python 환경과 GPU 모델 실행용 Python 환경을 구분한다.

- 전체 프로젝트 저장소와 `package-lock.json`, `requirements.lock.txt`
- `backend/schemas/bkave_taxonomy.json` 등 저장소의 속성 사전
- 로컬 Qwen3.5-2B·4B 모델 파일 및 사용할 LoRA 어댑터
- 사용할 이미지와 레이블 데이터
- 모델 실행을 지원하는 NVIDIA GPU·드라이버 및 GPU용 Python 환경

현재 GPU 환경은 torch 2.10.0+cu128, torchvision 0.25.0,
transformers 5.18.0.dev0, peft 0.20.0, vLLM 0.19.1이다.
Transformers는 Qwen3_5ForConditionalGeneration을 지원하는 별도 환경을 사용한다.
웹·API용 의존성 설치만으로 GPU 환경이 설치되지는 않는다.
드리프트의 이미지 비교에는 ResNet18 고정 가중치도 필요하며 CPU에서 실행한다.

제출용 ZIP에는 소스와 필수 설정·의존성 목록·속성 사전을 포함한다.
아래 설치·빌드 명령은 **제출용 ZIP 또는 실행 구성 ZIP의 압축 해제 폴더**와
전체 프로젝트 저장소에서 사용할 수 있다. 모델 파일과 GPU 환경은 별도로 준비한다.
제출용 ZIP의 서비스 설정은 설치 담당자가 구성하며, 실행 구성 ZIP에는 참고용
`deploy/` 서비스 파일을 추가한다. README는 두 ZIP 모두에 포함하지 않는다.

## 설치

프로젝트 루트에서 실행한다.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
```

GPU 환경과 모델 경로를 준비하고 아래 환경변수를 설치 위치에 맞게 설정한다.
서비스 파일을 사용하는 경우 해당 파일에도 같은 설정을 적용한다.
`DATADRIFT_MODELS`를 생략하면 프로젝트의 `models/`를 사용한다.
Qwen3.5 모델과 선택 사항인 `gemma-4-12B-it` 교사 모델은 이 경로 아래에 배치한다.
기존 서버의 설정은 다음과 같다.

| 설정 | 현재 값 또는 의미 |
| --- | --- |
| 프로젝트 | `/home/hslim/Code/datadrift/datadrift_pipeline` |
| `DATADRIFT_STATE` | 프로젝트의 `.runtime` — DB·업로드·작업 산출물 |
| `DATADRIFT_MODELS` | `/data/hslim/models` — Qwen3.5-2B·4B 디렉터리 |
| `DATADRIFT_TRAIN_PYTHON` | `/data/hslim/venvs/gemma4-12b-transformers-dev/bin/python` |
| `DATADRIFT_GPU` | 학습·평가 GPU 번호, 현재 `0` |
| `DATADRIFT_EVAL_BATCH_SIZE` | 평가 배치 크기, 현재 `8` |
| `DATADRIFT_PUBLIC_ORIGIN` | `http://121.126.210.3:18091` |
| `DATADRIFT_API_URL` | 웹 빌드·개발 시 프록시 대상, 기본 `http://127.0.0.1:18092` |
| `DATADRIFT_INPUT_ROOT` | 기존 레이블 데이터 가져오기에 사용하는 원본 디렉터리 |

API 시작 시 DB와 기본 모델 항목을 초기화한다. 처음 사용하는 데이터는
화면에서 워크스페이스를 만들고 이미지를 업로드해 추가할 수 있다.
기존 무신사·GS SHOP 원본의 일괄 가져오기는 해당 원본 경로가 있을 때만 사용한다.

## 웹 빌드

먼저 웹을 빌드하고 standalone 실행 폴더에 정적 파일을 복사한다.

```sh
npm run build
mkdir -p .next/standalone/.next
cp -R .next/static .next/standalone/.next/
```

## 직접 실행

각각 별도 터미널에서 실행할 수 있다.

```sh
# API
DATADRIFT_PUBLIC_ORIGIN=http://127.0.0.1:18091 .venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 18092

# 웹
HOSTNAME=127.0.0.1 PORT=18091 node .next/standalone/server.js

# 작업 워커: GPU Python과 모델 경로는 실제 설치 위치로 변경한다.
DATADRIFT_TRAIN_PYTHON=/path/to/gpu-env/bin/python DATADRIFT_MODELS=/path/to/models .venv/bin/python -m backend.worker
```

터미널 실행은 접속 확인용이다. 상시 운영에는 이 실행 진입점을 사용하는
systemd 서비스와 자동 재시작·부팅 설정을 설치 담당자가 구성한다.
직접 실행의 모델 작업은 기본적으로 Transformers+PEFT를 사용한다.
vLLM을 사용하려면 추론 서버와 워커의 연결 설정을 추가해야 한다.

## 상시 서비스 시작

다음 명령은 `deploy/`가 포함된 실행 구성 ZIP 또는 전체 저장소에서 사용한다.
제출용 ZIP에는 서비스 파일이 없으므로 아래 복사 명령 대신 대상 서버에 맞는
서비스를 직접 작성한다. 설치와 웹 빌드 명령은 두 ZIP 모두 같다.

```sh
mkdir -p ~/.config/systemd/user
cp deploy/datadrift-pipeline-*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user disable datadrift-pipeline-vllm-2b datadrift-pipeline-vllm-4b
systemctl --user enable --now datadrift-pipeline-api datadrift-pipeline-worker datadrift-pipeline-web datadrift-pipeline-vllm-runtime
```

사용자 서비스는 `Restart=always`로 설정한다. 로그인 종료 후에도 유지되도록
`loginctl show-user "$USER" -p Linger`가 `Linger=yes`인지 확인한다.
새 서버에서 비활성 상태라면 관리자가 `loginctl enable-linger 사용자명`으로 활성화한다.

이 서비스 구성을 사용할 때 모델 API 엔진 두 개는 자동 시작 대상으로 직접 등록하지 않는다.
vLLM 실행 관리자가 저장된 API 접수 상태에 맞춰 필요한 엔진만 올린다.
API·워커 서비스에는 `DATADRIFT_VLLM_MANAGED=1`, 워커에는
`DATADRIFT_INFERENCE_BACKEND=vllm`과 두 vLLM 주소를 설정한다.
세부 GPU·LoRA·캐시 옵션은 `deploy/datadrift-pipeline-vllm-*.service`에 있다.

## 접속과 정상 실행 확인

- 화면: `http://121.126.210.3:18091/ko/workspaces`
- API 문서: `http://121.126.210.3:18091/api/docs`
- API 내부 포트: `127.0.0.1:18092`
- vLLM 내부 포트: 2B `127.0.0.1:18093`, 4B `127.0.0.1:18094`

```sh
curl -f http://121.126.210.3:18091/api/health
systemctl --user is-active datadrift-pipeline-api datadrift-pipeline-worker datadrift-pipeline-web datadrift-pipeline-vllm-runtime
```

화면에서 워크스페이스와 모델 목록이 열리고, 상태 검사 요청이 성공하면
웹과 API가 연결된 상태다. GPU 모델 로딩 완료는 각 실행 화면이나 모델 API의
서비스 상태에서 별도로 확인한다.

## 기본 사용 순서

### 1. 이미지와 레이블 관리

워크스페이스를 생성하고 이미지 파일을 선택하거나 끌어 놓아 업로드한다.
워크스페이스의 레이블 모델을 선택한 뒤 자동 레이블링을 실행한다.
이미지를 누르면 속성과 데이터 구분을 확인·수정할 수 있다.
레이블을 저장하면 새 데이터 버전을 만들고 검토 완료로 기록한다.
목록에서는 검색, 검토 상태와 데이터 구분 필터, 여러 이미지의 이동·삭제를 지원한다.

### 2. 데이터 재구성

재구성 화면에서 사용할 원본을 선택하고 혼합 비율과 데이터 수를 지정한다.
미리보기에서 선택 수량과 분포를 확인한 뒤 새 워크스페이스에 저장한다.
학습·미지정 이미지를 후보로 사용하고 검증·테스트 이미지는 후보에서 제외한다.
속성 분포를 사용하는 선별에는 레이블이 필요하다.

### 3. 모델 학습

모델과 학습 데이터를 선택하고 학습 설정을 적용한 뒤 `학습 시작`을 누른다.
모델 목록은 검색·휠·스크롤바·마우스 드래그·터치로 탐색할 수 있다.
학습 모니터링에서 대기, 모델 로딩, 학습 진행, 손실과 로그를 확인한다.
학습이 성공하면 LoRA 모델이 모델 목록에 등록된다.

### 4. 모델 평가

평가할 모델과 데이터의 테스트 또는 검증 분할을 선택하고 실행한다.
선택한 분할 전체를 평가하며 학습 데이터를 다시 고를 필요는 없다.
입력 준비·모델 로딩·가중치 적용·평가·결과 정리 단계를 표시한다.
완료 후 속성별 일치도와 이미지별 응답·파싱 결과를 확인한다.
평가는 Transformers+PEFT에서 기본 8장씩 처리한다.

### 5. 모델 API 사용

모델 API 화면에서 이름과 모델을 선택해 등록한다. vLLM 실행 관리자를 구성한 환경은
접수 시작 시 필요한 엔진을 기동하며, 준비될 때까지 서비스 로딩 상태를 표시한다.
이미지를 클릭하여 선택하거나 끌어 놓고 오른쪽 `요청 보내기`를 누른다.
결과와 요청 이력은 같은 화면에서 확인한다.

프로그램에서는 등록된 API의 ID로 요청한다.

```sh
# 접수 여부와 서비스 준비 상태
curl 'http://121.126.210.3:18091/api/model-endpoints/API_ID/status'

# 결과가 준비될 때까지 기다리는 이미지 요청
curl 'http://121.126.210.3:18091/api/model-endpoints/API_ID/predictions?wait=true' \
  -F 'file=@product.jpg'
```

준비된 결과는 바로 응답한다. 최대 120초 안에 끝나지 않으면 202 응답의
`result_url`로 결과를 이어서 조회한다. `wait=true`를 생략하면 비동기 요청이다.
JPEG·PNG·WebP 한 장, 최대 20MB를 받는다.
vLLM 관리 환경은 접수 중지 후 새 요청을 받지 않고 기존 요청을 처리한 뒤 엔진을 종료한다.
같은 기본 모델의 다른 API가 접수 중이면 해당 엔진을 유지한다.

### 6. 드리프트 확인

드리프트 화면에서 기준 데이터와 비교 데이터를 선택하고 분석을 실행한다.
상단에 `드리프트 감지됨`, `드리프트 감지되지 않음`, `드리프트 판정 보류` 중
하나를 표시하며 판정 이유와 신호별 결과를 함께 보여 준다.
상세 수치·분포를 펼치면 속성, 카테고리 구성, 같은 카테고리 안의 속성,
이미지 특징의 변화와 표본 조건을 확인할 수 있다.
이 결과는 두 데이터의 분포 차이를 뜻하며 모델 성능 저하를 직접 측정한 값은 아니다.

## 재시작·로그·자료 보관

```sh
journalctl --user -u datadrift-pipeline-api -u datadrift-pipeline-worker -u datadrift-pipeline-web -n 100
journalctl --user -u datadrift-pipeline-vllm-runtime -u datadrift-pipeline-vllm-2b -u datadrift-pipeline-vllm-4b -n 100
systemctl --user restart datadrift-pipeline-web
```

코드를 갱신한 뒤 웹은 다시 빌드하고 정적 파일을 복사한 후 재시작한다.
API 코드를 갱신하면 API 서비스를 재시작한다. 워커를 갱신할 때는 실행·대기
작업이 없는지 먼저 확인한다. 실행 중 워커를 재시작하면 해당 작업은 실패로
기록되고 부분 산출물은 보존된다. 학습 자동 이어하기는 제공하지 않는다.

DB는 `.runtime/catalog.sqlite`, 업로드는 `.runtime/uploads/`, 작업 입력·로그·결과는
`.runtime/jobs/`, 이미지 특징 캐시는 `.runtime/image-features/`에 저장된다.
백업할 때는 SQLite 온라인 백업 또는 WAL을 포함한 일관된 스냅샷과 함께
업로드·작업 산출물·외부 원본 이미지·모델 파일을 보관한다.
상세 복구와 환경 설정은 [운영 문서](operations.md)를 참고한다.
