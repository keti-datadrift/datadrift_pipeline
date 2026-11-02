# 평가 엔진 실측 — 2026-10-29

동일한 이미지·모델·LoRA로 현재 Transformers+PEFT 순차 평가와 vLLM 순차/묶음 평가를 비교했습니다. 현재 서비스의 평가 엔진은 Transformers+PEFT 8장 배치이며, 모델 API는 별도 상주 vLLM 서버로 연결합니다.

## 조건

- NVIDIA A100-PCIE-40GB의 GPU 0에서 엔진을 순서대로 실행. 운영 vLLM 서버는 GPU 1에 구성하며 기존 다른 작업은 종료하지 않았습니다.
- 2B·4B 모두 AI 재레이블 혼합 100step LoRA. 각 엔진에 같은 어댑터 SHA256, 이미지 ID, 프롬프트, 카테고리, BF16, greedy, seed 42, 출력 최대 512토큰 적용.
- 현재 테스트 분할에서 무작위 seed 42로 출처별 12장씩, 총 24장. 별도 워밍업 1장은 처리 시간에서 제외. 이미지 최대 512px, Transformers SDPA, vLLM 0.19.1 eager, prefix cache 비활성화.
- 동일 엔진·GPU에서 각 조건 1회 측정. 프로세스 초기화와 모델/어댑터 준비 시간은 준비 시간에 포함. 커널·파일 캐시는 재부팅이나 초기화하지 않았으므로 최초 준비 시간은 반복 가능한 상수가 아닙니다.
- vLLM의 묶음 측정은 최대 동시 8개, 컨텍스트 8192, 메모리 비율 0.4입니다. 상주 API의 최저 메모리 설정 검증은 별도로 수행합니다.

## 동일한 8장 배치로 비교한 결과

후속 확인에서 TF+PEFT에도 8장 배치를 적용했습니다. 같은 입력·LoRA·정밀도·출력 한도에서 이 환경의 TF 배치가 vLLM 배치보다 빨랐습니다. 이전의 vLLM 3.24~4.29배 수치는 TF를 한 장씩 처리하던 기존 구현과 비교한 값이므로 엔진 자체의 우위로 해석하면 안 됩니다.

| 모델 | TF+PEFT 순차 | TF+PEFT 8장 배치 | vLLM 순차 | vLLM 동시 8개 | TF 배치의 vLLM 배치 대비 속도 |
|---|---:|---:|---:|---:|---:|
| qwen35_2b | 92.29초 | 16.32초 | 151.99초 | 28.50초 | 1.75배 |
| qwen35_4b | 131.87초 | 25.24초 | 200.35초 | 30.76초 | 1.22배 |

TF 배치의 GPU peak allocated는 2B 7.14GiB, 4B 14.56GiB였습니다. 현재 HF 환경의 GDN은 일부 최적화 커널 대신 PyTorch 구현을 사용합니다. 두 엔진에 추가 커널 튜닝을 한 결과가 아니라 현재 설치 환경의 측정입니다.

기동을 포함한 TF 배치의 직접 실측(프로세스 내부 타이머 시작→로딩→별도 워밍업 1장→24장 배치 완료)은 2B 32.67초, 4B 46.14초입니다. vLLM의 초기 기동과 묶음 처리는 별도 구간으로 측정했으므로 그 합계를 같은 연속 총시간의 직접 실측으로 표시하지 않습니다.

## 프로세스 시작에서 첫 결과까지

| 모델 | TF+PEFT | vLLM |
|---|---:|---:|
| qwen35_2b | 18.68초 | 246.55초 |
| qwen35_4b | 21.50초 | 95.49초 |

vLLM은 프로파일링·캐시 준비·초기 LoRA 커널 준비를 포함합니다. 특히 2B의 첫 실행에는 최초 커널 준비가 포함됐습니다. 상주 서버는 이 준비를 서버 시작 때 수행하며 매 요청마다 기본 모델을 재로딩하지 않습니다. 상주 API의 첫 어댑터 등록에는 추가 준비 시간이 생길 수 있습니다.

## 결과 확인

| 모델 | TF 8장 배치 일치도 | vLLM 동시 8개 일치도 | TF / vLLM 스키마 오류 |
|---|---:|---:|---:|
| qwen35_2b | 70.42% | 71.17% | 1 / 1 |
| qwen35_4b | 77.82% | 77.82% | 1 / 1 |

AI 레이블과의 일치도이며 사람 검증 정답 성능을 뜻하지 않습니다. 부동소수점 연산·엔진 차이로 출력이 완전히 일치하지 않으므로 속도만 보고 동일한 평가 결과라고 가정하지 않습니다. 전체 200장·80장 평가나 반복 부하 시험은 이 24장 측정에 포함하지 않았습니다.

## 재현

입력 manifest와 원시 응답은 `.runtime/engine-comparison/`에 저장합니다.
```sh
CUDA_VISIBLE_DEVICES=0 PYTHONPATH=. HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 /data/hslim/venvs/gemma4-12b-transformers-dev/bin/python scripts/benchmark-engines.py transformers .runtime/engine-comparison/qwen35_2b.json .runtime/engine-comparison/qwen35_2b-transformers.json
CUDA_VISIBLE_DEVICES=0 PYTHONPATH=. HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 /data/hslim/venvs/gemma4-12b-transformers-dev/bin/python scripts/benchmark-engines.py vllm .runtime/engine-comparison/qwen35_2b.json .runtime/engine-comparison/qwen35_2b-vllm.json
```

각 모델의 SHA256:
- qwen35_2b: `9c270fee52634cceb02eb479eacf46b6e65347913b78f77a087a53110a64439f`
- qwen35_4b: `2c1a1727d5ac1478c3573f36f71507ec85ae2594550d2c126f8748880a73b72b`

vLLM의 모델별 LoRA 등록 및 선택 방식은 [공식 LoRA 문서](https://docs.vllm.ai/en/latest/features/lora/)를 따릅니다. 모델 API 외부 인터페이스는 기존 비동기 접수·결과 조회를 유지하고, vLLM 관리 포트는 loopback에서만 사용합니다.

## 적용한 평가 동작

- 기본 8장, `DATADRIFT_EVAL_BATCH_SIZE`로 1~32 설정. 학습 배치는 기존 설정을 유지합니다.
- 좌측 패딩과 이미지별 응답 매핑을 사용하고, 마지막 남은 이미지도 평가합니다. CUDA OOM이면 아직 완료하지 않은 배치만 8→4→2→1로 줄여 다시 처리합니다.
- 2B와 4B의 실제 `backend.training` 평가를 17장씩 실행해 `[8,8,1]`, 순서·정답 매핑·테스트 전용 입력과 TF+PEFT 사용을 확인했습니다.
- 입력 묶음과 `generate()` 사용은 [Transformers의 멀티모달 템플릿 문서](https://huggingface.co/docs/transformers/main/chat_templating_multimodal)와 [Qwen3.5 배치 입력 명세](https://huggingface.co/docs/transformers/model_doc/qwen3_5)를 따릅니다.
