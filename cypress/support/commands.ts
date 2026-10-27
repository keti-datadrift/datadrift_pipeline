export {}; // Ensure this file is treated as a module for type augmentation

const AUTH_WHOAMI_PATH = '/next-api/external/api/current-user/whoami';
const DIRECT_LOGIN_PATH = '/next-api/external/user/login/';
const CSRF_PATH = '/next-api/external/user/login';
const TOKEN_OBTAIN_PATH = '/next-api/external/api/token/obtain/';

const LOGIN_ALIAS_PREFIX = 'loginViaUi';
const WHOAMI_ALLOWED_STATUSES = [200, 204, 308, 401] as const;
const LOGIN_ALLOWED_STATUSES = [200, 204, 308] as const;

const makeAlias = (suffix: string): string =>
  `${LOGIN_ALIAS_PREFIX}__${suffix}`;

type WhoAmIBody = {
  display_name?: string;
  username?: string;
  email?: string;
};

declare global {
  namespace Cypress {
    interface Chainable {
      loginViaUi(options?: {
        email?: string;
        password?: string;
        visitPath?: string;
        intercepts?: boolean;
      }): Chainable<{
        email: string;
        userMenuLabel: string;
      }>;
    }
  }
}

Cypress.Commands.add(
  'loginViaUi',
  ({
    email = Cypress.env('authEmail'),
    password = Cypress.env('authPassword'),
    visitPath = '/ko/login',
    intercepts = true,
  }: {
    email?: string;
    password?: string;
    visitPath?: string;
    intercepts?: boolean;
  } = {}) => {
    if (!email || !password) {
      throw new Error('Missing authEmail/authPassword in Cypress env.');
    }

    let resolvedUserLabel: string | undefined;

    const whoamiAlias = makeAlias('whoami');
    const csrfAlias = makeAlias('csrf');
    const loginAlias = makeAlias('login');
    const tokenAlias = makeAlias('token');

    if (intercepts) {
      cy.intercept('GET', AUTH_WHOAMI_PATH, (req) => {
        req.on('response', (res) => {
          const statusCode = res?.statusCode ?? 0;
          if (!WHOAMI_ALLOWED_STATUSES.includes(statusCode as any)) {
            return;
          }

          const body = res?.body as WhoAmIBody | undefined;
          const label = body?.display_name || body?.username || body?.email;
          if (label) {
            resolvedUserLabel = label;
          }
        });
      }).as(whoamiAlias);

      cy.intercept('GET', CSRF_PATH).as(csrfAlias);
      cy.intercept('POST', DIRECT_LOGIN_PATH).as(loginAlias);
      cy.intercept('POST', TOKEN_OBTAIN_PATH).as(tokenAlias);
    }

    cy.visit(visitPath);

    if (intercepts) {
      cy.wait(`@${whoamiAlias}`, { timeout: 10000 })
        .its('response.statusCode')
        .should('be.oneOf', [...WHOAMI_ALLOWED_STATUSES]);

      cy.wait(`@${csrfAlias}`)
        .its('response.statusCode')
        .should('be.oneOf', [200, 204, 308]);
    }

    cy.get('#email').type(email);
    cy.get('#password').type(password, { log: false });
    cy.get('button[type="submit"]').click();

    if (intercepts) {
      cy.wait(`@${loginAlias}`).then((interception) => {
        const statusCode = interception?.response?.statusCode ?? 0;
        expect(
          LOGIN_ALLOWED_STATUSES,
          'allowed login proxy status codes',
        ).to.include(statusCode);
      });

      cy.wait(`@${tokenAlias}`).then((interception) => {
        const statusCode = interception?.response?.statusCode ?? 0;
        expect(
          LOGIN_ALLOWED_STATUSES,
          'allowed token proxy status codes',
        ).to.include(statusCode);
      });

      cy.wait(`@${whoamiAlias}`, { timeout: 10000 }).then((interception) => {
        const statusCode = interception?.response?.statusCode ?? 0;
        expect(WHOAMI_ALLOWED_STATUSES, 'post-login whoami status').to.include(
          statusCode,
        );
      });
    }

    return cy.wrap({
      email,
      userMenuLabel: resolvedUserLabel ?? email,
    });
  },
);
