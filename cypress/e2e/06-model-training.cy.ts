/// <reference types="cypress" />

import trainingPresets from '../fixtures/training/presets.json';
import trainingProjects from '../fixtures/training/projects.json';
import trainingModels from '../fixtures/training/models.json';
import trainingVersions from '../fixtures/training/versions.json';
import trainingProgress from '../fixtures/training/progress.json';
import trainingBackgroundTasks from '../fixtures/training/background-tasks.json';

describe('모델 학습 페이지', () => {
  const trainingPath = '/ko/dashboard/models/train';
  const presetsPath = '/next-api/external/api/ml_models/train-presets';
  const projectsPath = '/next-api/external/api/projects';
  const modelsPath = '/next-api/external/api/ml_models';
  const versionsPath = (modelId: number) =>
    `/next-api/external/api/ml_models/${modelId}/versions`;
  const trainingStartPath = (modelId: number) =>
    `/next-api/external/api/ml_models/${modelId}/train`;
  const backgroundTasksPath = '/next-api/external/api/background-tasks';

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

    cy.intercept('GET', backgroundTasksPath, {
      statusCode: 200,
      body: trainingBackgroundTasks.empty,
    }).as('backgroundTasks');

    cy.loginViaUi();
  });

  function stubBasics() {
    cy.intercept('GET', projectsPath, {
      statusCode: 200,
      body: trainingProjects,
    }).as('projects');

    cy.intercept('GET', modelsPath, {
      statusCode: 200,
      body: trainingModels,
    }).as('models');
  }

  function stubVersions(
    modelId: number,
    body = (trainingVersions as any)[modelId.toString()],
  ) {
    cy.intercept('GET', `${versionsPath(modelId)}*`, {
      statusCode: 200,
      body,
    }).as(`versions-${modelId}`);
  }

  it('파라미터 기반 프리셋을 적용해 필드를 자동으로 채운다', () => {
    stubBasics();
    stubVersions(1);

    cy.visit(`${trainingPath}?type=ocrrec&modelId=1&versionId=101`);
    cy.wait('@projects');
    cy.wait('@models');
    cy.wait('@versions-1');

    cy.contains('[data-slot="card-title"]', '학습 타입')
      .parent()
      .contains('OCR Recognition')
      .should('exist');
    cy.contains('[data-slot="card-title"]', '레이블링 프로젝트')
      .parent()
      .contains('OCR 레이블 프로젝트')
      .should('exist');
    cy.contains('[data-slot="card-title"]', '모델')
      .parent()
      .contains('OCR Master')
      .should('exist');
    cy.contains('[data-slot="card-title"]', '모델 버전')
      .parent()
      .contains('v3.1.0')
      .should('exist');
  });

  it('선택 의존성: 타입을 선택하면 프로젝트와 모델 드롭다운이 활성화된다', () => {
    stubBasics();

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');

    cy.get('button[role="combobox"]').as('selects');

    cy.get('@selects').eq(1).should('have.attr', 'aria-disabled', 'true');
    cy.get('@selects').eq(2).should('have.attr', 'aria-disabled', 'true');

    cy.get('@selects').first().click();
    cy.contains('[role="option"]', 'OCR Recognition').click();

    cy.get('@selects').eq(1).should('not.have.attr', 'aria-disabled');
    cy.get('@selects').eq(2).should('not.have.attr', 'aria-disabled');
  });

  it('필수 항목을 모두 선택해야 학습 버튼이 활성화된다', () => {
    stubBasics();
    stubVersions(1);

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');

    cy.contains('button', '학습 시작').should('be.disabled');

    cy.contains('[data-slot="select-field"]', '학습 타입').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'OCR Recognition').click();

    cy.contains('[data-slot="select-field"]', '레이블링 프로젝트').within(
      () => {
        cy.get('button[role="combobox"]').click();
      },
    );
    cy.contains('[role="option"]', 'OCR 레이블 프로젝트').click();

    cy.contains('[data-slot="select-field"]', '모델').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'OCR Master').click();
    cy.wait('@versions-1');

    cy.contains('[data-slot="select-field"]', '모델 버전').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'v3.1.0').click();

    cy.contains('button', '학습 시작').should('not.be.disabled');
  });

  it('학습 버튼을 누르면 백그라운드 작업이 시작되고 로딩 상태를 표시한다', () => {
    stubBasics();
    stubVersions(1);

    cy.intercept('POST', trainingStartPath(1), {
      statusCode: 200,
      body: trainingProgress.started,
    }).as('startTraining');

    cy.intercept('GET', backgroundTasksPath, {
      statusCode: 200,
      body: trainingBackgroundTasks.running,
    }).as('backgroundRunning');

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');

    cy.contains('[data-slot="select-field"]', '학습 타입').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'OCR Recognition').click();
    cy.contains('[data-slot="select-field"]', '레이블링 프로젝트').within(
      () => {
        cy.get('button[role="combobox"]').click();
      },
    );
    cy.contains('[role="option"]', 'OCR 레이블 프로젝트').click();
    cy.contains('[data-slot="select-field"]', '모델').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'OCR Master').click();
    cy.wait('@versions-1');
    cy.contains('[data-slot="select-field"]', '모델 버전').within(() => {
      cy.get('button[role="combobox"]').click();
    });
    cy.contains('[role="option"]', 'v3.1.0').click();

    cy.contains('button', '학습 시작').click();
    cy.wait('@startTraining');
    cy.wait('@backgroundRunning');

    cy.contains('[data-slot="training-status"]', '진행중').should('exist');
    cy.contains('[data-slot="training-progress"]', 'Epoch 1/10').should(
      'exist',
    );
  });

  it('진행중인 학습은 상태 패널에서 경과 정보를 표시한다', () => {
    stubBasics();
    stubVersions(1);

    cy.intercept('GET', backgroundTasksPath, {
      statusCode: 200,
      body: trainingBackgroundTasks.running,
    }).as('backgroundRunning');

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');
    cy.wait('@backgroundRunning');

    cy.contains('[data-slot="training-progress"]', 'Epoch 1/10').should(
      'exist',
    );
    cy.contains('[data-slot="training-loss"]', '0.2560').should('exist');
  });

  it('학습 진행 패널에서 취소 버튼을 누르면 백그라운드 작업이 중단된다', () => {
    stubBasics();
    stubVersions(1);

    cy.intercept('GET', backgroundTasksPath, {
      statusCode: 200,
      body: trainingBackgroundTasks.running,
    }).as('backgroundRunning');

    cy.intercept(
      'POST',
      `/next-api/external/api/background-tasks/training-1-101-cancel`,
      {
        statusCode: 200,
        body: { detail: 'Cancelled' },
      },
    ).as('cancelTraining');

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');
    cy.wait('@backgroundRunning');

    cy.contains('button', '취소').click();
    cy.wait('@cancelTraining');
  });

  it('백그라운드 학습 목록을 조회하여 최근 작업을 표시한다', () => {
    stubBasics();
    stubVersions(1);

    cy.intercept('GET', backgroundTasksPath, {
      statusCode: 200,
      body: trainingBackgroundTasks.completed,
    }).as('backgroundCompleted');

    cy.visit(trainingPath);
    cy.wait('@projects');
    cy.wait('@models');
    cy.wait('@backgroundCompleted');

    cy.contains('[data-slot="background-task"]', 'Training OCR Recognition #1')
      .should('exist')
      .within(() => {
        cy.contains('완료').should('exist');
      });
  });
});
