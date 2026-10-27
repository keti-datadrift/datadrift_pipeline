# DataDrift Pipeline

속성추출 전용 DataOps·MLOps 웹 애플리케이션입니다.
기존 Q-OCR의 Next.js/React/Tailwind와 공통 UI 요소를 바탕으로 로그인 없이
데이터 조회·재구성, 모델 관리·학습·평가, 실행 상태와 분포 차이 탐지를 제공합니다.

- [웹페이지](http://121.126.210.3:18091/ko/workspaces)
- [API 문서](http://121.126.210.3:18091/api/docs)
- [운영·설치·데이터 해석](docs/operations.md)
- [검증 결과](docs/verification.md)

## 포함 기능

- 레이블 데이터 가져오기: 무신사 1,000개, GS SHOP 651개. 이미지 해시, 원본 분할,
  AI 레이블 출처와 평가 제외 속성을 보존하며 중복 가져오기를 방지합니다.
- 워크스페이스 생성, 이미지·레이블 조회, 검색, 분할 필터, JSONL 내보내기.
- 출처 균형/무작위 재구성 미리보기·불변 버전 저장. 검증/테스트는 학습에서 제외합니다.
- Qwen3.5-2B/4B 모델 레지스트리, 이름 변경·보관, SFT+LoRA 학습과 어댑터 등록.
- 검증/테스트 이미지의 실제 생성 평가, 속성별 일치도와 원문 응답 조회.
- 영속 작업 큐, 단일 GPU 워커, 진행률·손실·로그, 취소와 재시작 실패 복구, SSE API.
- 속성 및 이미지 RGB 히스토그램의 Jensen–Shannon 분포 비교.

## 로컬 개발

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock.txt
DATADRIFT_INPUT_ROOT=/home/hslim/Code/datadrift .venv/bin/python -m backend.catalog
.venv/bin/uvicorn backend.api:app --host 127.0.0.1 --port 18092
# 별도 터미널
npm run dev -- --port 18091 --hostname 121.126.210.3
# GPU Python 경로를 지정한 별도 워커
DATADRIFT_TRAIN_PYTHON=/path/to/gpu-env/bin/python .venv/bin/python -m backend.worker
```

상시 실행에는 `deploy/`의 systemd 사용자 서비스를 사용합니다.
이미지, 모델, 토큰, 실행 데이터베이스와 개인 검증 스크린샷은 Git에 포함하지 않습니다.

## 범위

레이블은 사람 검증 정답이 아닙니다. 작은 GPU 실행 검증은 전체 학습이나 품질 평가를 의미하지 않습니다.
분포 탐지는 소스/도메인 비교이며 시간 경과나 정확도 저하를 단정하지 않습니다.
현재는 SQLite WAL을 쓰는 단일 호스트 구성입니다. 다중 호스트 스케줄링, SSO,
오브젝트 스토리지, 임베딩 기반 검출은 후속 범위입니다.

## 변경 기반

ai-dq/main `59fb8219dcdc3f65463777de1a93f6e9e77ca8e1`에서 시작해
OCR/Label Studio/로그인 도메인을 정리했습니다. 기존 구현은 Git 기록에 남으며
Apache-2.0 LICENSE를 유지합니다.

비케이브 제공 엑셀 기준의 속성·색상 사전과 버전별 학습/평가를 지원합니다.
기존 레이블의 변환 범위와 미확인 값 처리 방식은 [비케이브 기준 적용](docs/bkave-taxonomy.md)을 참고하세요.
