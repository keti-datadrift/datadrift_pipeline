# Cypress E2E 테스트 케이스 (AAA 패턴)

## 로그인·인증 / 네비게이션

### 1. CSRF 토큰 선요청

- Arrange: `cy.clearCookies()` 후 `GET /next-api/external/user/login`을 200 응답으로 `cy.intercept`하고 `@csrf` 별칭을 부여한다.
- Act: `cy.visit('/ko/login')`으로 로그인 페이지를 연다.
- Assert: `cy.wait('@csrf')`가 한 번 완료되고 `cy.getCookie('csrftoken').should('exist')`로 쿠키 저장을 검증한다.

### 2. 필수 입력 검증

- Arrange: 로그인 페이지를 연 뒤 이메일·비밀번호 필드가 비어 있도록 유지하고 `POST /next-api/external/user/login/`을 `@login`으로 스텁한다.
- Act: 제출 버튼을 클릭한다.
- Assert: `cy.get('@login.all').should('have.length', 0)`으로 요청 미발생을 확인하고 각 입력에 `:invalid` 상태가 적용됐는지 검사한다.

### 3. 로그인 성공 / 리다이렉션

- Arrange: CSRF, 로그인, 토큰 발급, 사용자 정보 API를 모두 200으로 스텁해 `@csrf`, `@login`, `@token`, `@me` 별칭을 부여한다.
- Act: 유효한 이메일·비밀번호를 입력한 뒤 제출한다.
- Assert: 네 개 요청이 순차적으로 호출되고 `cy.location('pathname').should('eq', '/ko/dashboard')` 및 인증 쿠키 존재를 검증한다.

### 4. 로그인 실패

- Arrange: `POST /next-api/external/user/login/`를 401으로 스텁하고 `@loginFailed` 별칭을 만든다.
- Act: 잘못된 자격 증명으로 제출을 시도한다.
- Assert: `cy.wait('@loginFailed')` 후에도 URL이 `/ko/login`이며 사용자 알림 토스트가 노출되지 않는 현행 동작을 캡처한다.

### 5. 보호 레이아웃 진입 방지

- Arrange: 인증 쿠키 없이 `GET /next-api/external/users/me`를 401으로 스텁한다.
- Act: `cy.visit('/ko/dashboard/projects', { failOnStatusCode: false })`를 호출한다.
- Assert: 자동으로 `/ko/login`으로 리다이렉트되고 보호 레이아웃 DOM이 그려지지 않았음을 확인한다.

### 6. 사이드바 네비게이션

- Arrange: 인증 쿠키를 설정하고 사이드바 데이터 API를 200으로 스텁한다.
- Act: `데이터`, `모델`, `모니터링` 그룹을 순서대로 클릭하며 각 하위 메뉴 항목을 선택한다.
- Assert: 선택한 메뉴의 `aria-current` 속성과 URL 변화가 맞춰서 갱신되고 비활성 그룹은 접힌 상태를 유지한다.

### 7. 로그아웃

- Arrange: 로그인 상태로 `/dashboard/projects`를 방문하고 `POST /next-api/external/logout`을 204로 스텁해 `@logout` 별칭을 부여한다.
- Act: 사용자 아바타 메뉴를 열고 로그아웃 항목을 클릭한다.
- Assert: `cy.wait('@logout')` 완료 후 `/ko/login` 이동과 세션 관련 쿠키 삭제를 확인한다.

## 데이터 (레이블링 프로젝트)

### 1. 프로젝트 목록 조회

- Arrange: `GET /next-api/external/projects`를 지연 응답으로 스텁하고 `@projects` 별칭을 만든다.
- Act: `cy.visit('/dashboard/projects')`로 목록 페이지를 연다.
- Assert: 응답 전에는 스켈레톤 카드가, `cy.wait('@projects')` 후에는 실제 카드가 노출된다.

### 2. 프로젝트 카드 클릭 (레이블 스튜디오 진입)

- Arrange: 여러 프로젝트를 포함한 fixture를 목록 API에 주입한다.
- Act: 특정 프로젝트 카드 본문을 클릭한다.
- Assert: URL이 `/dashboard/projects/{id}`로 바뀌고 iframe `src`가 선택한 프로젝트 ID를 포함하는지 검증한다.

### 3. 프로젝트 편집 다이얼로그

- Arrange: 카드 우측 더보기 메뉴 노출을 보장하고 `PATCH /next-api/external/projects/:id`를 200으로 스텁한다.
- Act: 편집 옵션을 선택 후 제목과 모델 타입을 수정하고 저장한다.
- Assert: 패치 요청이 호출되고 성공 Toast 이후 다이얼로그가 닫히며 목록 `refetch`가 일어난다.

### 4. 파일 업로드 다이얼로그

- Arrange: 업로드 버튼 클릭으로 다이얼로그를 띄우고 업로드 API를 `@upload`로 스텁한다.
- Act: 프로젝트를 선택한 뒤 `cy.selectFile`로 유효한 더미 파일을 추가하고 업로드를 실행한다.
- Assert: 검증 오류가 없고 `cy.wait('@upload')`가 성공하며 완료 후 다이얼로그와 진행 바가 초기화된다.

### 5. 레이블링 결과 다운로드 (추출)

- Arrange: 스냅샷 생성(`POST /snapshots`), 상태 폴링, 다운로드 요청을 각각 스텁하고 별칭을 부여한다.
- Act: 카드 메뉴에서 "결과 다운로드"를 선택하고 준비 완료까지 대기 후 다운로드 버튼을 누른다.
- Assert: 세 요청이 순차 호출되고 `cy.stub(window, 'showSaveFilePicker')`가 트리거되거나 a 태그 fallback이 실행되는지 확인한다.

## 모델

### 1. 모델 목록 조회

- Arrange: `GET /next-api/external/ml-models`를 지연·실패 케이스로 스텁한다.
- Act: `/dashboard/models` 페이지를 각각 방문한다.
- Assert: 지연 시 스켈레톤, 실패 시 Alert와 재시도 버튼이 노출되고 재시도 클릭 시 재요청이 발생한다.

### 2. 통계 카드 집계

- Arrange: 서로 다른 타입(OCR/Layout/Extraction)을 포함한 fixture로 목록 API를 스텁한다.
- Act: 페이지를 로드한 뒤 상단 통계 카드 텍스트를 읽는다.
- Assert: 각 카드가 fixture 데이터에서 필터링한 개수와 일치한다.

### 3. 모델 이름 검색

- Arrange: 모델 목록이 충분히 표시되는 상태에서 검색 입력 요소를 가져온다.
- Act: 특정 문자열을 입력했다가 지운다.
- Assert: 입력 시 해당 문자열을 포함한 행만 남고 지울 때 전체 목록이 복원되며 API 추가 호출이 발생하지 않는다.

### 4. 행 기반 이동 (모델 상세 조회)

- Arrange: 테이블 행에 data attribute를 부여한 fixture를 준비한다.
- Act: 임의 행을 클릭하거나 행 메뉴에서 "상세" 옵션을 선택한다.
- Assert: URL이 `/dashboard/models/{id}`로 변경되고 상세 요청(`GET /ml-models/:id`)이 호출된다.

## 모델 버저닝

### 1. 모델 버전 목록 및 metrics 조회

- Arrange: `GET /next-api/external/ml-models/:id` 상세 응답에 버전 리스트와 지표 값을 포함해 스텁한다.
- Act: 모델 상세 페이지를 방문한다.
- Assert: 버전 테이블이 응답 순서대로 표시되고 Precision, Recall 등 값이 지정 포맷으로 노출된다.

### 2. 모델 버전 Fork

- Arrange: 버전 행 컨텍스트 메뉴에 Fork 옵션이 보이도록 하고 `POST /ml-models/:id/versions/fork`를 201로 스텁한다.
- Act: Fork를 선택하고 새 버전 이름을 입력해 확인한다.
- Assert: API 호출이 성공하고 신규 버전이 상단에 추가되며 성공 Toast가 노출된다.

### 3. 모델 버전 기준 추가 학습

- Arrange: 버전 행의 "추가 학습" 버튼이 활성화된 데이터를 준비한다.
- Act: 버튼을 클릭한다.
- Assert: `/dashboard/models/train` 페이지로 이동하고 URL 쿼리에 모델·버전 정보가 포함된다.

### 4. 모델 버전 삭제

- Arrange: 삭제 권한이 있는 사용자 컨텍스트로 렌더링하고 `DELETE /ml-models/:id/versions/:versionId`를 204로 스텁한다.
- Act: 삭제 메뉴를 클릭하고 확인 다이얼로그에서 승인한다.
- Assert: 삭제 요청이 성공하고 해당 행이 테이블에서 제거된다.

## 기본 모델 (API 호출 시 사용) 선택

### 1. 현재 설정된 기본 모델 조회

- Arrange: `GET /next-api/external/ml-models/defaults`가 타입별 기본값을 포함하도록 스텁한다.
- Act: `/dashboard/models/default` 페이지를 방문한다.
- Assert: 현재 기본값으로 지정된 모델 카드가 선택 상태로 강조되고 상세 패널이 채워진다.

### 2. 모델 타입 별 모델 목록 조회

- Arrange: 각 타입에 대한 버전 API를 스텁하고 카드 데이터가 렌더링되도록 한다.
- Act: 타입 카드를 순차적으로 클릭한다.
- Assert: 선택한 타입에 맞는 모델 목록이 갱신되고 다른 타입 데이터는 숨겨진다.

### 3. 모델 타입 별 기본 모델 선택

- Arrange: 기본 모델 업데이트 API(`PUT /ml-models/defaults/:type`)를 200으로 스텁한다.
- Act: 특정 버전을 선택하고 "기본으로 설정" 버튼을 누른다.
- Assert: 요청이 성공하면 성공 메시지가 노출되고 기본 목록 재로딩 후 선택 상태가 반영된다.

### 4. 모델 목록의 모델 선택 시 간략한 metrics 정보 조회

- Arrange: 모델 목록 응답이 요약 메트릭을 포함하도록 스텁한다.
- Act: 목록에서 다른 모델을 연속 선택한다.
- Assert: 선택 즉시 우측 패널의 메트릭 카드가 해당 모델의 요약 값으로 업데이트된다.

## 모델 학습

### 1. 파라미터 기반 프리셋 적용

- Arrange: `cy.visit('/dashboard/models/train?type=layout&modelId=1&versionId=2')`로 접근한다.
- Act: 초기 렌더링이 완료될 때까지 대기한다.
- Assert: 타입, 모델, 버전 선택 컴포넌트가 쿼리 파라미터 값으로 채워진다.

### 2. 드롭다운 선택 의존성 (선 선택 항목)

- Arrange: 타입 선택 이전 상태를 유지하고 프로젝트/모델 리스트 API를 스텁한다.
- Act: 프로젝트 또는 모델 콤보박스를 연다.
- Assert: 타입 미선택 시 옵션이 비활성화되고 타입 선택 후 관련 옵션만 활성화된다.

### 3. 모델 학습 시작 조건 (필요 항목 선택 완료 시 활성화)

- Arrange: 필수 입력 항목을 순차적으로 선택한다.
- Act: 마지막 필수 항목을 선택한다.
- Assert: 모든 값이 채워지면 "훈련 시작" 버튼이 활성화되고 비활성 상태에서는 클릭이 차단된다.

### 4. 모델 학습 시작

- Arrange: `POST /next-api/external/ml-models/:id/train` SSE 엔드포인트를 200 스트림으로 스텁한다.
- Act: "훈련 시작" 버튼을 누른다.
- Assert: SSE 호출이 발생하고 버튼이 로딩 상태로 전환되며 배경 작업 인디케이터에 태스크가 추가된다.

### 5. 모델 학습 경과 조회

- Arrange: 스트림 스텁에서 numeric/stage/indeterminate 이벤트를 순차적으로 반환한다.
- Act: 이벤트를 트리거한다.
- Assert: 진행률 게이지, 현재 단계 텍스트, 메시지가 이벤트 유형에 맞게 갱신된다.

### 6. 모델 학습 취소

- Arrange: 진행 중 태스크가 존재하는 상태에서 취소 API(`POST /ml-models/train/:taskId/cancel`)를 200으로 스텁한다.
- Act: 백그라운드 작업 팝오버의 취소 버튼을 클릭한다.
- Assert: 취소 요청이 호출되고 태스크 상태가 `cancelled`로 변하며 스트림이 종료된다.

### 7. 모델 학습 백그라운드 작업 조회

- Arrange: 복수의 태스크를 포함한 백그라운드 인디케이터 컨텍스트를 스텁한다.
- Act: 헤더의 백그라운드 작업 아이콘을 클릭해 팝오버를 연다.
- Assert: 태스크가 상태별로 정렬돼 표시되고 최신 이벤트가 상단에 위치한다.

## 모델 학습 모니터링

### 1. 모델 학습 내역 저장

- Arrange: SSE 완료 이벤트가 로컬 저장소 저장 로직을 호출하도록 스텁한다.
- Act: 훈련 완료 이벤트를 전송한다.
- Assert: `cy.window().its('localStorage')`를 통해 요약 데이터가 저장됐는지 확인한다.

### 2. 모델 학습 내역 조회

- Arrange: `localStorage`에 완료된 태스크 히스토리를 미리 주입한다.
- Act: `/dashboard/monitoring/train` 페이지를 처음 연다.
- Assert: 히스토리 테이블이 저장된 항목을 최신순으로 표시한다.

### 3. 모델 학습 통계 카드 조회

- Arrange: 상태별 태스크 통계를 반환하는 API를 스텁한다.
- Act: 페이지 상단 카드 영역을 확인한다.
- Assert: Running/Completed/Failed/Pending 카드 값이 스텁 데이터와 일치한다.

### 4. 모델 학습 진행 상황 조회

- Arrange: RUNNING 상태 태스크가 존재하는 fixture를 준비한다.
- Act: 페이지를 새로 고친다.
- Assert: 상단 카드와 상세 행에서 경과 시간과 진행률이 스트림 이벤트에 따라 갱신된다.

## 컨테이너 로그 모니터링

### 1. 컨테이너 목록 조회 및 선택

- Arrange: `GET /next-api/external/logs/containers`를 200으로 스텁해 목록 데이터를 제공한다.
- Act: `/dashboard/monitoring/logs`에 진입해 컨테이너 드롭다운을 연다.
- Assert: 스켈레톤 후 실제 컨테이너 옵션이 노출되고 선택 시 입력이 갱신된다.

### 2. 로그 조회 옵션 선택

- Arrange: 로그 옵션 패널이 렌더링되도록 하고 로그 조회 API를 스텁한다.
- Act: 시간 범위, 필터 등을 조정한 뒤 적용 버튼을 누른다.
- Assert: 선택한 옵션이 UI에 유지되고 이후 로그 요청에서도 동일 파라미터가 사용된다.

### 3. 로그 조회 스트리밍 컨트롤 (시작 / 중단)

- Arrange: 유효한 컨테이너와 스트림 데이터를 제공하는 SSE 스텁을 구성한다.
- Act: 스트리밍 시작 버튼을 누르고 일정 시간 후 중단 버튼을 클릭한다.
- Assert: 시작 시 로그가 실시간으로 누적되고 상태 표시가 "스트리밍 중"으로 바뀌며, 중단 후 isStreaming 상태가 false로 전환된다.

### 4. 로그 클리어

- Arrange: 로그 목록이 누적된 상태를 fixture로 주입한다.
- Act: "로그 비우기" 버튼을 클릭한다.
- Assert: 화면상의 로그 리스트와 내부 배열이 모두 초기화된다.

### 5. 로그 저장

- Arrange: 다운로드 API 또는 클라이언트 생성 로직을 스텁하고 `cy.stub(window, 'showSaveFilePicker')`를 설정한다.
- Act: "다운로드" 버튼을 누른다.
- Assert: 저장 다이얼로그 호출 또는 a 태그 다운로드 fallback이 실행되고 export 요청이 발생한다.

## 데모 (그라디오)

### 1. 그라디오 데모 페이지 조회

- Arrange: `Cypress.env('NEXT_PUBLIC_CORE_DEMO_URL')` 값을 설정하고 해당 URL의 `cy.intercept`를 200 HTML로 스텁한다.
- Act: `/dashboard/services/gradio` 페이지를 연다.
- Assert: iframe의 `src`가 환경 변수 값으로 지정되고 로딩 스켈레톤이 사라진다.

### 2. 모델 및 모델 버전 선택

- Arrange: 데모 내 모델/버전 선택 API를 fixture로 스텁한다.
- Act: 모델과 모델 버전을 차례로 선택한다.
- Assert: 선택 이벤트마다 `postMessage`나 쿼리 파라미터가 iframe으로 전달되어 UI가 갱신된다.

### 3. 레이아웃 인식 결과 출력

- Arrange: 샘플 문서 업로드를 위해 `cy.fixture`와 `cy.selectFile`을 준비하고 추론 API를 스텁한다.
- Act: 파일을 업로드하고 "추론" 버튼을 클릭한다.
- Assert: 응답이 도착하면 그라디오 결과 패널에 레이아웃 인식 출력이 표시되고 에러 없이 완료된다.
