/// <reference types="cypress" />

import defaultsUpdated from '../fixtures/default-models/defaults-updated.json';
import defaults from '../fixtures/default-models/defaults.json';
import layoutVersions from '../fixtures/default-models/versions-layout.json';
import ocrrecVersions from '../fixtures/default-models/versions-ocrrec.json';

describe('기본 모델 관리', () => {
  const defaultsPath = '/next-api/external/api/ml_models/defaults';
  const layoutVersionsPath =
    '/next-api/external/api/ml_models/types/layout/versions';
  const ocrrecVersionsPath =
    '/next-api/external/api/ml_models/types/ocrrec/versions';
  const pagePath = '/ko/dashboard/models/default';

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

  function mockInitialDefaults() {
    cy.intercept('GET', defaultsPath, {
      statusCode: 200,
      body: defaults,
    }).as('defaults');
    cy.intercept('GET', `${layoutVersionsPath}*`, {
      statusCode: 200,
      body: layoutVersions,
    }).as('layoutVersions');
    cy.intercept('GET', `${ocrrecVersionsPath}*`, {
      statusCode: 200,
      body: ocrrecVersions,
    }).as('ocrrecVersions');
  }

  it('현재 선택된 기본 모델들이 카드에 표기된다', () => {
    mockInitialDefaults();

    cy.visit(pagePath);
    cy.wait('@defaults');
    cy.wait('@layoutVersions');

    cy.contains('[data-slot="card-title"]', 'Layout Detection')
      .closest('[data-slot="card"]')
      .should('have.class', 'ring-primary')
      .within(() => {
        cy.contains('Layout Master').should('exist');
        cy.contains('기본값').should('exist');
      });

    cy.contains('[data-slot="card-title"]', 'OCR Recognition')
      .closest('[data-slot="card"]')
      .should('not.have.class', 'ring-primary')
      .within(() => {
        cy.contains('OCR Recognizer').should('exist');
        cy.contains('기본값').should('exist');
      });
  });

  it('카드를 선택해 타입 변경 시 버전 목록이 갱신된다', () => {
    mockInitialDefaults();

    cy.visit(pagePath);
    cy.wait('@defaults');
    cy.wait('@layoutVersions');

    cy.contains('[data-slot="card-title"]', 'OCR Recognition')
      .closest('[data-slot="card"]')
      .click();
    cy.wait('@ocrrecVersions');

    cy.contains('button', '3.1.0').should('exist');
  });

  it('버전 목록에서 버전을 선택하면 메트릭 패널이 업데이트된다', () => {
    mockInitialDefaults();

    cy.visit(pagePath);
    cy.wait('@defaults');
    cy.wait('@layoutVersions');

    cy.contains('button', '1.0.0').should('exist');
    cy.contains('[data-slot="card-content"]', '버전 1.0.0').should('exist');
    cy.contains('div', '정밀도')
      .parent()
      .find('span.font-medium')
      .should('contain', '86.0%');

    cy.contains('button', '1.1.0').click();
    cy.contains('div', '정밀도')
      .parent()
      .find('span.font-medium')
      .should('contain', '90.0%');
  });

  it('기본값으로 설정 버튼을 누르면 업데이트 요청 후 카드가 갱신된다', () => {
    let defaultsCall = 0;
    cy.intercept('GET', defaultsPath, (req) => {
      defaultsCall += 1;
      req.reply({
        statusCode: 200,
        body: defaultsCall === 1 ? defaults : defaultsUpdated,
      });
    }).as('defaults');
    cy.intercept('GET', `${layoutVersionsPath}*`, {
      statusCode: 200,
      body: layoutVersions,
    }).as('layoutVersions');
    cy.intercept('GET', `${ocrrecVersionsPath}*`, {
      statusCode: 200,
      body: ocrrecVersions,
    }).as('ocrrecVersions');
    cy.intercept('PUT', '/next-api/external/api/ml_models/defaults/layout', {
      statusCode: 200,
      body: { detail: 'Default updated' },
    }).as('updateDefault');

    cy.visit(pagePath);
    cy.wait('@defaults');
    cy.wait('@layoutVersions');

    cy.contains('button', '1.1.0').click();
    cy.contains('button', '기본값으로 설정').click();

    cy.wait('@updateDefault');
    cy.wait('@defaults');

    cy.contains('[data-slot="card-content"]', '버전 1.1.0').should('exist');
  });
});
