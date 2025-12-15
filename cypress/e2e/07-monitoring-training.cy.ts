/// <reference types="cypress" />

describe('모델 학습 모니터링', () => {
  const monitoringPath = '/ko/dashboard/monitoring/train';

  beforeEach(() => {
    cy.loginViaUi({ intercepts: false });
  });

  it.skip('SSE 완료 이벤트가 학습 내역 저장을 갱신한다', () => {
    cy.log(
      'TODO: Implement SSE stub and localStorage assertions for training history persistence.',
    );
  });

  it.skip('localStorage의 학습 히스토리를 초기 렌더에서 표시한다', () => {
    cy.log(
      'TODO: Seed localStorage training history and assert table ordering.',
    );
  });

  it.skip('상태별 통계 카드는 API 스텁 값에 맞춰 합계를 보여준다', () => {
    cy.log('TODO: Stub status API and verify the four StatCard values.');
  });

  it.skip('진행 중 태스크는 스트림 업데이트에 따라 진행률을 반영한다', () => {
    cy.log(
      'TODO: Simulate RUNNING task events and assert progress bar updates.',
    );
  });
});
