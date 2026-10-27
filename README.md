# DataDrift Pipeline

속성추출 전용 DataOps·MLOps UI 및 API.

## 개발

```sh
npm ci
npm run dev
```

## 정리 기준

- 기준: ai-dq/main `59fb8219dcdc3f65463777de1a93f6e9e77ca8e1`.
- Next.js/React/Tailwind와 공통 Card, Input, Badge, Skeleton을 유지합니다.
- OCR 업무, 로그인/JWT, Label Studio 서버·프록시, 이전 배포 및 샘플을 제거합니다.
- 기존 코드는 Git 기록에서 확인할 수 있습니다. Apache-2.0 LICENSE를 유지합니다.
- 첫 단계는 빌드 가능한 기본 구조이며 데이터 API와 학습 워커는 후속 변경으로 추가합니다.

검증: `npm run typecheck`, `npm run build`.
