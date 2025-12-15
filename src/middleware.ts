import {
  locales,
  proxyExternalRequest,
  stripLocaleFromPathname,
} from '@/lib/server/external-proxy';
import { NextRequest, NextResponse } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';
const logInfo = (...args: any[]) => {
  if (isDev) console.info(...args);
};
// Locales used in route prefixes must match the app route segment: src/app/[lang]
// Our app uses short codes ('ko', 'en'), not region codes ('ko-KR', 'en-US').
let locales = ['ko', 'en'];

let protectedRoutes = ['/dashboard', '/services'];

let requiredCookies = [
  'csrftoken',
  'sessionid',
  'ls_access_token',
  'ls_refresh_token',
];

export const config = {
  matcher: [
    // Page Routes - exclude static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  logInfo('Middleware called for path:', pathname);

  const normalizedPathname = stripLocaleFromPathname(pathname);
  if (normalizedPathname.startsWith('/next-api/external')) {
    console.debug('Skipping request to external API');
    return NextResponse.next();
  }

  const pathnameHasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (isNextApiRoute) {
    if (hasLocalePrefix) {
      const url = request.nextUrl.clone();
      url.pathname = normalizedPathname;
      logInfo('Redirecting localized next-api path to:', url.pathname);
      return NextResponse.redirect(url);
    }
    return await proxyExternalRequest(request);
  }

  if (hasLocalePrefix) {
    // Already localized: only handle auth for protected routes
    return handlePageRoutes(request);
  }

  // Web page routes - redirect to localized version
  const locale = getLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  logInfo('Redirecting to localized path:', url.pathname);
  return NextResponse.redirect(url);
}

/**
 * Get the locale from the request headers.
 *
 * @param request - This request's pathname starts with '/dashboard' or '/services''
 */
function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language');

  if (acceptLanguage) {
    if (acceptLanguage.includes('ko')) {
      return 'ko';
    }
  }

  return 'en';
}

function stripLocaleFromPathname(pathname: string): string {
  for (const locale of locales) {
    if (pathname === `/${locale}`) {
      return '/';
    }

    if (pathname.startsWith(`/${locale}/`)) {
      const rest = pathname.slice(locale.length + 1);
      return rest ? `/${rest}` : '/';
    }
  }

  return pathname;
}

/**
 * Handles authentication for protected Next.js routes.
 * This function gets the request with the locale prefix and checks if the user is trying to access protected routes.
 */
function handlePageRoutes(request: NextRequest): NextResponse {
  logInfo('Handling page routes: ' + request.nextUrl.pathname);
  const { pathname } = request.nextUrl;

  // Check if user is trying to access protected routes (accounting for locale prefix)
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.includes(route),
  );

  if (isProtectedRoute) {
    // If any of required cookies is missing, redirect to login
    if (requiredCookies.some((cookieKey) => !request.cookies.get(cookieKey))) {
      const currentLocale =
        locales.find(
          (locale) =>
            pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
        ) || 'ko';
      const loginUrl = new URL(`/${currentLocale}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // User is not trying to access protected routes, so continue with the request
  return NextResponse.next();
}
