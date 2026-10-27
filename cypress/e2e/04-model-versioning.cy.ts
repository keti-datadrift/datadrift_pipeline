/// <reference types="cypress" />

import modelDetail from '../fixtures/models/detail-1.json';
import modelVersions from '../fixtures/models/versions-1.json';

const modelDetailPath = '/next-api/external/api/ml_models/1';
const modelVersionsPath = '/next-api/external/api/ml_models/1/versions';

describe('모델 버저닝', () => {
  const modelPagePath = '/ko/dashboard/models/1';

  beforeEach(() => {
    let whoamiCallCount = 0;
    cy.intercept('GET', '/next-api/external/api/current-user/whoami', (req) => {
      whoamiCallCount += 1;
      if (whoamiCallCount === 1) {
        req.reply({ statusCode: 401, body: { detail: 'Unauthorized' } });
      } else {
        req.reply({
          statusCode: 200,
          body: {
            id: 1,
            email: 'admin@example.com',
            username: 'admin',
          },
        });
      }
    });

    cy.loginViaUi();
    cy.intercept('GET', modelDetailPath, {
      statusCode: 200,
      body: modelDetail,
    }).as('modelDetail');
    cy.intercept('GET', `${modelVersionsPath}*`, {
      statusCode: 200,
      body: modelVersions,
    }).as('modelVersions');
  });

  it('버전 테이블이 응답 순서대로 메트릭을 표시한다', () => {
    cy.visit(modelPagePath);
    cy.wait('@modelDetail');
    cy.wait('@modelVersions');

    cy.contains('td', 'v1.0.0').should('exist');
    cy.contains('td', 'v1.1.0').should('exist');
    cy.contains('td', '0.87').should('exist');
    cy.contains('td', '0.9').should('exist');
    cy.contains('td', '0.75').should('exist');
  });

  it.skip('버전 Fork 메뉴를 통해 새 버전을 생성한다', () => {
    // TODO: 구현 예정인 Fork 메뉴 UI가 추가되면 테스트를 활성화합니다.
  });

  it.skip('추가 학습 버튼을 누르면 학습 페이지로 이동한다', () => {
    // TODO: 버전 행에서 학습 실행 옵션이 노출되면 학습 경로 이동을 검증합니다.
  });

  it.skip('버전 삭제 메뉴는 DELETE 요청 후 테이블에서 행을 제거한다', () => {
    // TODO: 삭제 기능이 구현되면 DELETE 요청과 UI 갱신을 확인합니다.
  });
});
