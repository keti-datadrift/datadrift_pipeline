/// <reference types="cypress" />

import projectsListUpdated from '../fixtures/projects/list-updated.json';
import projectsList from '../fixtures/projects/list.json';

describe('데이터 (레이블링 프로젝트)', () => {
  const projectsPath = '/ko/dashboard/projects';

  it('프로젝트 목록을 조회하면 카드가 렌더링된다', () => {
    cy.loginViaUi();

    cy.intercept('GET', '/next-api/external/api/projects*', (req) => {
      req.reply({
        delay: 400,
        statusCode: 200,
        body: projectsList,
      });
    }).as('projects');

    cy.visit(projectsPath);

    cy.wait('@projects');
    cy.contains('레이블 프로젝트 A').should('exist');
  });

  it('프로젝트 카드를 클릭하면 상세 페이지로 이동하고 iframe이 ID를 포함한다', () => {
    cy.loginViaUi();

    cy.intercept('GET', '/next-api/external/api/projects*', {
      statusCode: 200,
      body: projectsList,
    }).as('projects');

    cy.visit(projectsPath);
    cy.wait('@projects');

    cy.contains('레이블 프로젝트 B').click();

    cy.location('pathname').should('include', '/dashboard/projects/202');
    cy.get('iframe').should('have.attr', 'src').and('include', '202');
  });

  it('프로젝트 편집 다이얼로그에서 제목과 타입을 수정한다', () => {
    cy.loginViaUi();

    let projectsRequestCount = 0;
    cy.intercept('GET', '/next-api/external/api/projects*', (req) => {
      projectsRequestCount += 1;
      req.reply({
        statusCode: 200,
        body: projectsRequestCount === 1 ? projectsList : projectsListUpdated,
      });
    }).as('projects');

    cy.intercept('PATCH', '/next-api/external/api/projects/101', {
      statusCode: 200,
      body: {
        title: '수정된 프로젝트 A',
        ml_model_type: 'ocrdet',
      },
    }).as('updateProject');

    cy.visit(projectsPath);
    cy.wait('@projects');

    cy.get('[data-testid="project-card-101"]').within(() => {
      cy.get('[data-testid="project-card-menu-101"]').click();
    });
    cy.contains('[role="menuitem"]', '편집').click();

    cy.get('[role="dialog"]').within(() => {
      cy.get('input[name="title"]').clear().type('수정된 프로젝트 A');
      cy.contains('button', 'Layout Detection').click();
    });

    cy.contains('[role="menuitemradio"]', 'OCR Detection', {
      timeout: 10000,
    })
      .should('be.visible')
      .click();

    cy.get('[role="dialog"]').within(() => {
      cy.contains('button[type="submit"]', '저장').click();
    });

    cy.wait('@updateProject');
    cy.wait('@projects');
    cy.contains('수정된 프로젝트 A').should('exist');
    cy.contains('OCR Detection').should('exist');
  });

  it('파일 업로드 다이얼로그에서 선택한 파일을 업로드한다', () => {
    cy.loginViaUi();

    cy.intercept('GET', '/next-api/external/api/projects*', {
      statusCode: 200,
      body: projectsList,
    }).as('projects');

    cy.intercept('POST', /\/next-api\/external\/api\/projects\/\d+\/import/, {
      statusCode: 200,
      body: {},
    }).as('upload');

    cy.visit(projectsPath);
    cy.wait('@projects');

    cy.contains('button', '업로드').click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains('button', '프로젝트 파일 업로드').should('exist');
      cy.get('[data-slot="select-trigger"]').click();
    });

    cy.contains('[data-slot="select-item"]', '레이블 프로젝트 A', {
      timeout: 10000,
    })
      .should('be.visible')
      .click();

    cy.get('[role="dialog"]').within(() => {
      cy.fixture('files/sample.txt', 'base64').then((content) => {
        cy.get('input[type="file"]').selectFile(
          {
            contents: Cypress.Buffer.from(content, 'base64'),
            fileName: 'sample.txt',
            mimeType: 'text/plain',
          },
          { force: true },
        );
      });

      cy.contains('button', '프로젝트 파일 업로드').click();
    });

    cy.wait('@upload');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('레이블링 결과 다운로드 요청의 전체 플로우를 수행한다', () => {
    cy.loginViaUi();

    cy.intercept('GET', '/next-api/external/api/projects*', {
      statusCode: 200,
      body: projectsList,
    }).as('projects');

    cy.intercept('POST', '/next-api/external/api/projects/101/exports/', {
      statusCode: 200,
      body: {
        id: 555,
        status: 'completed',
        title: 'export',
        created_by: {
          id: 1,
          first_name: 'Admin',
          last_name: 'User',
          email: 'admin@example.com',
          avatar: null,
        },
        created_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        md5: null,
        counters: { task_number: 1 },
        converted_formats: [],
        task_filter_options: null,
        annotation_filter_options: null,
        serialization_options: null,
      },
    }).as('snapshot');
    cy.intercept(
      'GET',
      '/next-api/external/api/projects/101/exports/555/download*',
      {
        statusCode: 200,
        headers: { 'content-type': 'application/zip' },
        body: 'ZIPDATA',
      },
    ).as('download');
    cy.intercept('DELETE', '/next-api/external/api/projects/101/exports/555', {
      statusCode: 204,
      body: {},
    }).as('cleanup');

    cy.visit(projectsPath);
    cy.wait('@projects');

    cy.window().then((win) => {
      const writable = {
        write: Cypress.sinon.stub().resolves(null),
        close: Cypress.sinon.stub().resolves(null),
      };
      const savePickerStub = Cypress.sinon
        .stub(win, 'showSaveFilePicker')
        .resolves({
          createWritable: Cypress.sinon.stub().resolves(writable),
        });

      cy.wrap(savePickerStub).as('savePicker');
    });

    cy.get('[data-testid="project-card-101"]').within(() => {
      cy.get('[data-testid="project-card-menu-101"]').click();
    });
    cy.contains('[role="menuitem"]', '다운로드').click();

    cy.wait('@snapshot');
    cy.wait('@download');
    cy.wait('@cleanup');
    cy.get('@savePicker').should('have.been.called');
  });
});
