/// <reference types="cypress" />

import modelDetail from '../fixtures/models/detail-1.json';
import modelsList from '../fixtures/models/list.json';
import modelVersions from '../fixtures/models/versions-1.json';

describe('모델 목록 페이지', () => {
  const modelsPath = '/ko/dashboard/models';

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
  });

  it('모델 목록이 정상적으로 조회된다', () => {
    cy.intercept('GET', '/next-api/external/api/ml_models*', {
      statusCode: 200,
      body: modelsList,
    }).as('models');

    cy.visit(modelsPath);
    cy.wait('@models');

    cy.get('tbody tr').should('have.length', modelsList.items.length);
    cy.contains('td', 'Layout Master').should('exist');
    cy.contains('td', 'OCR Detector').should('exist');
  });

  it('통계 카드가 모델 타입 집계를 반영한다', () => {
    cy.intercept('GET', '/next-api/external/api/ml_models*', {
      statusCode: 200,
      body: modelsList,
    }).as('models');

    cy.visit(modelsPath);
    cy.wait('@models');

    cy.contains('[data-slot="card-title"]', '레이아웃 감지')
      .closest('[data-slot="card"]')
      .find('[data-slot="card-content"] .text-2xl')
      .should('have.text', '1');
    cy.contains('[data-slot="card-title"]', 'OCR')
      .closest('[data-slot="card"]')
      .find('[data-slot="card-content"] .text-2xl')
      .should('have.text', '2');
    cy.contains('[data-slot="card-title"]', '테이블 인식')
      .closest('[data-slot="card"]')
      .find('[data-slot="card-content"] .text-2xl')
      .should('have.text', '1');
  });

  it('모델 이름 검색은 클라이언트 필터링으로 동작한다', () => {
    cy.intercept('GET', '/next-api/external/api/ml_models*', {
      statusCode: 200,
      body: modelsList,
    }).as('models');

    cy.visit(modelsPath);
    cy.wait('@models');

    cy.get('input[placeholder="모델 이름 검색..."]').type('Detector');
    cy.get('tbody tr').should('have.length', 1);
    cy.contains('td', 'OCR Detector').should('exist');

    cy.get('input[placeholder="모델 이름 검색..."]').clear();
    cy.get('tbody tr').should('have.length', modelsList.items.length);
    cy.get('@models.all').should('have.length', 1);
  });

  it('테이블 행을 클릭하면 모델 상세 페이지로 이동한다', () => {
    cy.intercept('GET', '/next-api/external/api/ml_models*', {
      statusCode: 200,
      body: modelsList,
    }).as('models');
    cy.intercept('GET', '/next-api/external/api/ml_models/1', {
      statusCode: 200,
      body: modelDetail,
    }).as('modelDetail');
    cy.intercept('GET', '/next-api/external/api/ml_models/1/versions*', {
      statusCode: 200,
      body: modelVersions,
    }).as('modelVersions');

    cy.visit(modelsPath);
    cy.wait('@models');

    cy.contains('td', 'Layout Master').closest('tr').click();

    cy.wait('@modelDetail');
    cy.wait('@modelVersions');
    cy.location('pathname').should('include', '/dashboard/models/1');
  });
});
