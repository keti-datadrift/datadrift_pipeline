/// <reference types="cypress" />

describe('로그인·인증 / 네비게이션', () => {
  const loginPath = '/ko/login';
  const dashboardProjectsPath = '/ko/dashboard/projects';

  beforeEach(() => {
    const whoamiStatuses: number[] = [];
    cy.wrap(whoamiStatuses, { log: false }).as('whoamiStatuses');

    cy.intercept('GET', '/next-api/external/api/current-user/whoami', (req) => {
      req.on('response', (res) => {
        whoamiStatuses.push(res?.statusCode ?? 0);
      });
    }).as('whoami');
    cy.intercept('GET', '/next-api/external/user/login').as('csrf');
  });

  it('CSRF 토큰을 선요청한다', () => {
    cy.clearCookies();

    cy.visit(loginPath);

    cy.wait('@csrf').then(({ response }) => {
      expect(response?.statusCode).to.eq(200);
      const setCookieHeader = response?.headers['set-cookie'];
      const headerString = Array.isArray(setCookieHeader)
        ? setCookieHeader.join(';')
        : (setCookieHeader ?? '');
      expect(headerString).to.match(/csrftoken=/);
    });

    cy.getCookie('csrftoken').should((cookie) => {
      expect(cookie).to.exist;
      expect(cookie?.value).to.match(/\S+/);
      expect(cookie?.httpOnly).to.eq(false);
    });
  });

  it('필수 입력이 비어 있으면 제출 요청을 보내지 않는다', () => {
    cy.intercept('POST', '/next-api/external/user/login/').as('login');

    cy.visit(loginPath);
    cy.wait('@csrf');

    cy.get('button[type="submit"]').click();

    cy.get('@login.all').should('have.length', 0);
    cy.get('#email')
      .should('have.prop', 'validationMessage')
      .and('not.be.empty');
    cy.get('#password')
      .should('have.prop', 'validationMessage')
      .and('not.be.empty');
  });

  it('로그인 성공 시 순차 요청과 대시보드 리다이렉션을 수행한다', () => {
    cy.intercept('GET', '/next-api/external/api/projects*').as('projects');
    cy.intercept('POST', '/next-api/external/user/login/').as('loginRequest');
    cy.intercept('POST', '/next-api/external/api/token/obtain/').as(
      'tokenRequest',
    );

    cy.loginViaUi({ visitPath: loginPath }).then(() => {
      cy.wait('@projects');

      cy.location('pathname').should('include', '/ko/dashboard');
      cy.getCookie('csrftoken').its('value').should('not.be.empty');
      cy.getCookie('sessionid').its('value').should('not.be.empty');

      cy.get<number[]>('@whoamiStatuses').then((statuses) => {
        expect(statuses[0], 'initial whoami status').to.eq(401);
        expect(statuses.some((status) => status === 200)).to.be.true;
      });
    });

    cy.wait('@loginRequest')
      .its('response.statusCode')
      .should('be.oneOf', [200, 204, 308]);
    cy.wait('@tokenRequest')
      .its('response.statusCode')
      .should('be.oneOf', [200, 204, 308]);
  });

  it('잘못된 자격 증명으로 로그인에 실패하면 페이지에 머문다', () => {
    cy.intercept('POST', '/next-api/external/user/login/').as('loginFailed');

    cy.visit(loginPath);
    cy.wait('@csrf');

    cy.get('#email').type('wrong@example.com');
    cy.get('#password').type('wrong-password');
    cy.get('button[type="submit"]').click();

    cy.wait('@loginFailed').then(({ response }) => {
      expect(response, 'failed login response').to.exist;

      const statusCode = response?.statusCode ?? 0;
      const allowedStatuses = [308, 401];
      expect(allowedStatuses, 'allowed proxy status codes').to.include(
        statusCode,
      );
    });
    cy.location('pathname').should('eq', loginPath);
    cy.get('body').find('[role="alert"]').should('not.exist');
  });

  it('비인증 사용자는 보호된 레이아웃으로 이동하지 못한다', () => {
    cy.intercept('GET', '/next-api/external/api/projects*', {
      statusCode: 401,
      body: { detail: 'Unauthorized' },
    }).as('projectsAttempt');

    cy.visit(dashboardProjectsPath, { failOnStatusCode: false });

    cy.wait('@whoami');
    cy.location('pathname').should('eq', loginPath);
    cy.get('[data-slot="sidebar"]').should('not.exist');
  });

  it('로그아웃 시 API 요청과 쿠키 초기화를 수행한다', () => {
    const loginEmail = Cypress.env('authEmail');
    const loginPassword = Cypress.env('authPassword');

    if (!loginEmail || !loginPassword) {
      throw new Error('Missing authEmail/authPassword in Cypress env.');
    }

    cy.intercept('GET', '/next-api/external/api/projects*').as(
      'projectsRequest',
    );
    cy.intercept('POST', '/next-api/external/logout').as('logoutRequest');

    cy.loginViaUi({ visitPath: loginPath }).then(({ userMenuLabel }) => {
      cy.wait('@projectsRequest');

      cy.location('pathname').should('include', '/ko/dashboard');

      const matcher = new RegExp(String(userMenuLabel), 'i');
      cy.contains('button', matcher).click();
    });

    cy.contains('[role="menuitem"]', '로그아웃').click();

    cy.wait('@logoutRequest').then(({ response }) => {
      expect(response, 'logout response').to.exist;

      const statusCode = response?.statusCode ?? 0;
      const allowedStatuses = [200, 204, 308, 401];
      expect(allowedStatuses, 'allowed proxy status codes').to.include(
        statusCode,
      );
    });

    cy.location('pathname').should('eq', loginPath);
    cy.getCookie('sessionid').should('not.exist');
    cy.getCookie('ls_access_token').should('not.exist');
    cy.getCookie('ls_refresh_token').should('not.exist');
  });
});
