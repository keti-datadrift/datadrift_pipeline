/// <reference types="cypress" />

describe('데모 (그라디오)', () => {
  const gradioPath = '/ko/dashboard/services/gradio';

  beforeEach(() => {
    cy.loginViaUi({ intercepts: false });
  });

  it.skip('환경 변수로 주입된 Gradio URL을 iframe에 설정한다', () => {
    cy.log('TODO: Stub NEXT_PUBLIC_CORE_DEMO_URL and assert iframe src.');
  });

  it.skip('모델과 버전 선택 이벤트가 iframe으로 전달된다', () => {
    cy.log('TODO: Stub model/version API and intercept postMessage to iframe.');
  });

  it.skip('샘플 문서 업로드 후 추론 결과가 패널에 표시된다', () => {
    cy.log('TODO: Stub inference API and assert UI updates without errors.');
  });
});
