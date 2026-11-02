# 모델 API

`/ko/model-api`에서 기본 Qwen3.5 모델이나 현재 속성으로 학습한 LoRA 모델을 등록합니다. API마다 선택한 모델 ID를 고정합니다. 모델 파일이 없거나 보관·퇴역 처리된 모델은 등록할 수 없습니다.

기본은 이미지 접수와 결과 조회를 분리한 비동기 API입니다. `?wait=true`를 붙이면 같은 HTTP 요청에서 최대 120초 동안 결과를 기다립니다. 완료되면 HTTP 200에 결과를 담고, 시간이 지나도 처리 중이면 HTTP 202와 `result_url`을 반환합니다. 대기 종료나 연결 종료가 접수한 작업을 취소하지 않습니다. 기존 영속 큐의 워커가 등록 순서대로 GPU 1의 vLLM 서버에 요청합니다. 접수 중에는 2B·4B 기본 모델을 서버 메모리에 유지하고 선택한 LoRA를 요청마다 지정합니다. 학습·평가는 GPU 0의 Transformers+PEFT로 유지합니다. 플랫폼 큐의 직렬 디스패치는 유지하며, 상주 엔진의 최대 동시 8개 처리도 별도로 검증했습니다.

## 사용 방법

1. 화면에서 `API 등록`을 누르고 이름과 모델을 선택합니다.
2. 등록된 API를 선택하고 해당 API의 요청 주소로 이미지 한 장을 보냅니다. 상품 카테고리는 이미지에서 자동 판별합니다.
3. `?wait=true`로 호출하면 완료 응답을 바로 받습니다. HTTP 202인 경우에만 응답의 `result_url`로 이어서 조회합니다.
4. `status`가 `succeeded`이면 `result`를 읽습니다. `failed`, `cancelled`도 종료 상태입니다.

```sh
# ENDPOINT_ID는 모델 API 페이지의 요청 주소에서 확인합니다.
curl -X POST 'http://121.126.210.3:18091/api/model-endpoints/ENDPOINT_ID/predictions?wait=true' \
  -F 'file=@product.jpg'

# 120초를 넘겨 HTTP 202를 받은 경우에만 result_url로 조회합니다.
curl 'http://121.126.210.3:18091/api/predictions/REQUEST_ID'
```

화면의 상태 문구는 `서비스 실행 중`·`서비스 준비 중`처럼 표시합니다. 이미지 입력은 드래그앤드롭과 영역 클릭을 지원하며 선택만으로 요청을 접수하지 않습니다. `요청 보내기`로 실행합니다.

상단의 `등록된 API`는 접수 상태를 관리하는 목록입니다. `접수 시작`은 vLLM 서버를 기동하고, 마지막 API의 `접수 중지`는 기존 대기·실행 요청을 모두 처리한 뒤 서버를 종료해 GPU 메모리를 반환합니다. 같은 기본 모델을 쓰는 다른 API가 접수 중이면 서버를 유지합니다. 화면에 시작 대기·모델 로딩·실행·기존 요청 처리 후 종료·종료·오류 상태를 표시합니다. 로딩 중 요청은 202로 접수하고 서버 준비 후 처리합니다. 아래 `선택한 API` 영역은 선택한 이름과 모델을 표시하고 해당 API의 연결 정보·요청 테스트·요청 결과·요청 이력만 보여줍니다. API를 바꾸면 앞서 선택한 요청 결과와 이미지 입력을 초기화합니다.

`result.category`는 판별된 상품 카테고리이고 `result.attributes`는 해당 카테고리의 속성값입니다. 카테고리를 판별하지 못하면 `category=null`, `category_valid=false`, `schema_valid=false`로 반환하며 모든 속성을 판정에서 제외합니다. `excluded_attributes`에 든 속성은 판정에 사용하지 않습니다. `parse_valid`와 `schema_valid`가 false이면 원문 `raw`를 확인해야 합니다. `succeeded`는 실행이 끝났다는 뜻이며 레이블 정확성을 보장하지 않습니다. 추론 결과는 워크스페이스의 레이블을 변경하지 않습니다.

이전 클라이언트의 선택적 `category` 쿼리 지정은 호환성을 위해 유지하지만, 화면과 기본 호출 예제는 카테고리를 지정하지 않습니다.

`processing_seconds`는 해당 요청 처리의 시작부터 완료까지입니다. 서버 준비 대기나 첫 LoRA 등록이 발생하면 이를 포함하고 큐 대기는 제외합니다. 요청 전에 이미 끝난 상주 서버 기동 시간은 포함하지 않습니다. `result.engine`은 `vllm`이고 `teacher.adapter_sha256`으로 선택 가중치를 확인할 수 있습니다. `created_at`, `started_at`, `finished_at`으로 전체 소요 시간과 대기 시간을 계산할 수 있습니다. 페이지의 2.5초 응답 목표와 모델 추론 완료 시간을 구분합니다.

접수와 vLLM 준비 상태는 아래처럼 조회합니다. 등록/목록 응답의 `status_url`을 그대로 사용할 수 있습니다.

```sh
curl 'http://121.126.210.3:18091/api/model-endpoints/ENDPOINT_ID/status'
```

`accepting_requests=true`이면 서버 로딩 중에도 요청을 접수합니다. `ready=true`는 접수가 가능하고 vLLM 서버가 준비됐다는 뜻입니다. 첫 요청의 LoRA 등록은 별도로 발생할 수 있습니다. `runtime.state`는 `starting`, `waiting`, `ready`, `draining`, `stopping`, `stopped`, `error`, `unknown` 중 하나입니다. 중지된 API가 다른 API의 서버를 공유하는 경우에도 `accepting_requests`와 `ready`는 false이며, 공유 서버의 실제 상태는 `runtime`에 표시합니다. `runtime.active_requests`는 같은 기본 모델 서버에 남아 있는 대기·실행 요청 수입니다. 준비 여부와 개별 요청 완료 여부는 다르며 요청 결과는 기존 `GET /api/predictions/{id}`로 조회합니다.

## 관리 API

- `GET /api/model-endpoints`: 등록 목록, 접수 상태, 모델 사용 가능 여부, `runtime` 실행 상태
- `GET /api/model-endpoints/{id}/status`: 해당 API의 접수 여부(`accepting_requests`), 준비 여부(`ready`), vLLM 상태(`runtime`) 조회. `Cache-Control: no-store`로 현재 상태를 반환합니다.
- `POST /api/model-endpoints`: JSON `name`, `model_id`로 등록
- `PATCH /api/model-endpoints/{id}`: JSON `enabled`로 신규 접수와 vLLM 시작/중지 요청. 서버 준비를 기다리지 않고 응답하며 `runtime`으로 진행 상태 확인
- `POST /api/model-endpoints/{id}/predictions`: multipart `file` 한 개, 카테고리 자동 판별. 기본은 202 비동기 접수이며 `?wait=true`는 최대 120초 대기 후 완료 시 200·처리 중이면 202를 반환합니다. 성공·실패·취소는 응답 본문의 `status`로 구분합니다.
- `GET /api/predictions/{id}`: 상태, 대기열 위치, 결과
- `GET /api/model-endpoints/{id}/predictions`: 기본은 최근 20건. `offset`, `limit`(1~100)으로 이전 이력을 조회한다. `paginated=true`이면 `{items, total}`을 반환하며, 화면은 이 모드로 10건씩 조회한다. 기존 호출은 배열 응답을 유지한다.
- `POST /api/jobs/{id}/cancel`: 대기/실행 중인 요청 취소

OpenAPI 명세: `/api/openapi.json`, 대화형 문서: `/api/docs`.

접수 중지는 이미 접수한 작업을 취소하지 않습니다. 이미지 형식은 JPEG/PNG/WebP, 최대 20MB, 2,500만 화소, 단일 프레임입니다. 잘못된 입력은 422, 크기 초과는 413, 중지 또는 사용 불가 모델은 409입니다. API 추론 대기/실행 요청이 합계 32건이면 429와 `Retry-After: 30`을 반환합니다. 이 한도는 기존 학습 작업 수를 포함하지 않습니다. 대기열 순서는 학습 작업을 포함합니다.

## 운영

기존 서비스 `datadrift-pipeline-web`, `datadrift-pipeline-api`, `datadrift-pipeline-worker`와 상시 실행 관리자 `datadrift-pipeline-vllm-runtime`, 엔진 `datadrift-pipeline-vllm-2b`, `datadrift-pipeline-vllm-4b`를 사용합니다. 공개 접속 주소는 `http://121.126.210.3:18091/ko/model-api`이며 API 내부 포트는 `127.0.0.1:18092`입니다. vLLM은 loopback `18093`·`18094`에서만 실행합니다. 동시 처리·캐시 설정과 GPU 메모리 비율은 [운영 문서](operations.md#모델-api의-vllm-시작종료)를 참고하세요.

```sh
systemctl --user status datadrift-pipeline-web datadrift-pipeline-api datadrift-pipeline-worker
journalctl --user -u datadrift-pipeline-worker -n 100
systemctl --user restart datadrift-pipeline-api datadrift-pipeline-web
# 워커 재시작 전에는 실행/대기 작업이 없는지 확인합니다.
```

설정과 작업 상태는 `.runtime/catalog.sqlite`, 업로드 이미지 사본은 `.runtime/predictions/{request_id}`, vLLM 결과·단계는 카탈로그에 저장합니다. 기존 TF 추론의 `.runtime/jobs/{request_id}` 기록도 보존합니다. 기존 백업 범위에 이 경로도 포함해야 합니다. 자동 만료/보존기간 관리는 아직 없으므로 저장 공간을 모니터링합니다. 서비스 재시작 후 접수 설정과 대기 작업은 유지됩니다. 실행 관리자는 재시작·로그인 종료 후에도 접수 설정과 미처리 요청에 따라 필요한 엔진만 시작합니다. 엔진 자체의 부팅 자동 시작은 비활성화하고 실행 관리자를 활성화합니다. 실행 중 워커가 종료되면 해당 작업은 실패로 기록되며 자동 재시도하지 않습니다.

현재 플랫폼과 동일한 내부망 접근 정책입니다. 새 로그인이나 API 키를 추가하지 않았으며 외부 공개용 인증, 호출자별 제한은 별도 작업입니다.
