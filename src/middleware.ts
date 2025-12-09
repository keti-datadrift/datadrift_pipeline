import { NextRequest, NextResponse } from 'next/server';

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

const NON_TOKEN_REFRESH_PATHS = [
  '/user/login',
  '/user/logout',
  '/token/obtain',
  '/current-user/whoami',
];

export const config = {
  matcher: [
    // HTTP Requests
    '/next-api/external/:path*',
    // Page Routes - exclude static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  console.info('Middleware called for path:', pathname);

  const pathnameHasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (pathnameHasLocale) {
    // Already localized: only handle auth for protected routes
    return handlePageRoutes(request);
  }

  // LabelStudio API routes (include API endpoints + direct requests)
  if (pathname.startsWith('/next-api/external')) {
    return await handleHTTPRequests(request);
  }

  // Web page routes - redirect to localized version
  const locale = getLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  console.info('Redirecting to localized path:', url.pathname);
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

/**
 * Handles Label Studio API routes by adding authorization headers and managing token refresh
 *
 * @param request - This request's pathname starts with '/labelstudio/api'
 */
async function handleHTTPRequests(request: NextRequest): Promise<Response> {
  let handlingRequest = request;

  // Step 1. Rewrite external requests to actual API endpoints
  handlingRequest = rewriteExternalRequest(handlingRequest);
  console.debug('1️⃣ Rewritten request:', handlingRequest.nextUrl.pathname);

  // Step 2. Add Authorization header to the request
  const { request: newRequest, headers: newHeaders } =
    await attachAuthorizationHeader(handlingRequest);
  handlingRequest = newRequest;
  const headers = newHeaders;
  console.debug(
    '2️⃣ Added Authorization header:',
    handlingRequest.nextUrl.pathname,
  );

  // Step Final. Make fetch get the response and handle cookies
  // NextResponse.rewrite() doesn't work for SSE responses, so we need to use fetch directly

  // Prepare the body based on the request method
  let body = undefined;
  if (handlingRequest.method !== 'GET' && handlingRequest.method !== 'HEAD') {
    // Clone the request to preserve the body stream
    const clonedRequest = handlingRequest.clone();

    // Check if the content-type is form data
    const contentType = handlingRequest.headers.get('content-type') || '';

    console.debug('📝 Request Content-Type:', contentType);
    console.debug('📝 Request Method:', handlingRequest.method);
    console.debug('📝 Request URL:', handlingRequest.url);

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // For URL-encoded form data, read as text
      body = await clonedRequest.text();
      console.debug('📝 Body as URL-encoded:', body.substring(0, 200));
    } else if (contentType.includes('multipart/form-data')) {
      // For multipart form data, read as blob
      body = await clonedRequest.blob();
      console.debug('📝 Body as multipart form-data');
    } else if (contentType.includes('application/json')) {
      // For JSON, read as text
      body = await clonedRequest.text();
      console.debug('📝 Body as JSON:', body.substring(0, 200));
    } else {
      // For other content types, read as array buffer
      body = await clonedRequest.arrayBuffer();
      console.debug('📝 Body as ArrayBuffer, size:', body.byteLength);
    }
  }

  console.debug(
    '🚀 Fetching with headers:',
    Object.fromEntries(headers.entries()),
  );

  const fetchResponse = await fetch(handlingRequest.url, {
    method: handlingRequest.method,
    headers,
    body,
    redirect: 'manual', // Handle redirects manually
  });

  console.debug('📥 Response status:', fetchResponse.status);
  console.debug('📥 Response headers:', Object.fromEntries(fetchResponse.headers.entries()));

  // Handle redirects
  if (fetchResponse.status >= 300 && fetchResponse.status < 400) {
    const location = fetchResponse.headers.get('location');
    console.debug('🔄 Redirect detected to:', location);
    
    if (location) {
      // If it's a relative path, construct the full URL
      let redirectUrl: URL;
      try {
        // Try parsing as absolute URL first
        redirectUrl = new URL(location);
      } catch {
        // If it fails, treat it as a relative path
        redirectUrl = new URL(location, handlingRequest.url);
      }
      
      console.debug('🔄 Full redirect URL:', redirectUrl.toString());
      
      // For login redirects, we should follow them
      if (handlingRequest.nextUrl.pathname.includes('/user/login')) {
        // Follow the redirect
        const cleanHeaders = Object.fromEntries(headers.entries());
        // Remove content-type for GET request
        delete cleanHeaders['content-type'];
        
        const redirectResponse = await fetch(redirectUrl.toString(), {
          method: 'GET',
          headers: cleanHeaders,
          credentials: 'include',
        });
        
        return new NextResponse(redirectResponse.body, {
          status: redirectResponse.status,
          statusText: redirectResponse.statusText,
          headers: redirectResponse.headers,
        });
      }
    }
  }

  // For SSE responses, stream directly without buffering
  const contentType = fetchResponse.headers.get('content-type');
  let ResponseType = contentType?.includes('text/event-stream')
    ? Response
    : NextResponse;

  const response = new ResponseType(fetchResponse.body, {
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    headers: fetchResponse.headers,
  });

  const validAccessToken = handlingRequest.cookies.get('ls_access_token');
  if (validAccessToken) {
    response.headers.set(
      'Set-Cookie',
      `ls_access_token=${validAccessToken.value}; Path=/; Max-Age=${60 * 60 * 24}; HttpOnly; SameSite=lax`,
    );
  }

  return response;
}

/**
 * Handles authentication for protected Next.js routes.
 * This function gets the request with the locale prefix and checks if the user is trying to access protected routes.
 */
function handlePageRoutes(request: NextRequest): NextResponse {
  console.info('Handling page routes: ' + request.nextUrl.pathname);
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

/**
 * Rewrites external API requests to actual API endpoints.
 * This function updates Next.js route to match the actual API endpoint.
 */
function rewriteExternalRequest(request: NextRequest): NextRequest {
  function logRequest(request: NextRequest, verb: string) {
    console.info(
      `🚦 🛜 ${verb} HTTP request: ` +
        JSON.stringify({
          Host: request.nextUrl.host,
          Path: request.nextUrl.pathname,
          Search: request.nextUrl.search,
        }),
    );
  }

  logRequest(request, 'Given');

  let host = process.env.NEXT_PUBLIC_HOST;
  if (host && host.endsWith('/')) {
    host = host.slice(0, -1);
  }
  if (!host) {
    throw new Error('NEXT_PUBLIC_HOST environment variable is not set');
  }

  const newPathname = request.nextUrl.pathname.replace(
    '/next-api/external',
    '/labelstudio',
  );
  const targetUrl = new URL(newPathname + request.nextUrl.search, host);
  const newRequest = new NextRequest(targetUrl, request);

  logRequest(newRequest, 'Rewritten');

  return newRequest;
}

/**
 * Adds Authorization header to the request.
 *
 * If there's no access token but it should have one, it will try to refresh the token
 * using the refresh token.
 * If there's no refresh token either, error will be thrown.
 *
 * @param request - The request to add the Authorization header to.
 */
async function attachAuthorizationHeader(request: NextRequest): Promise<{
  request: NextRequest;
  headers: Headers;
}> {
  // Get access token from cookies of request
  const headers = new Headers(request.headers);
  let accessToken = request.cookies.get('ls_access_token')?.value;
  let refreshToken = request.cookies.get('ls_refresh_token')?.value;

  function shouldSkipTokenRefresh(request: NextRequest): boolean {
    if (
      NON_TOKEN_REFRESH_PATHS.some((path: string): boolean =>
        request.nextUrl.pathname.includes(path),
      )
    ) {
      console.debug('Skipping refreshing token: ', request.nextUrl.pathname);
      return true;
    }
    return false;
  }

  // If no token, try to get one using refresh token
  if (!accessToken && !shouldSkipTokenRefresh(request)) {
    // If there's no refresh token either, user should login again.
    if (!refreshToken) {
      throw new Error('Both Access and Refresh tokens are missing.');
    }
    // Get new access token using refresh token
    try {
      const { access } = await refreshAccessToken(refreshToken);
      accessToken = access;
    } catch (error) {
      throw new Error('Failed to refresh access token: ' + error);
    }
  }

  // Setup Authorization header if token is available (but not for token obtain endpoints)
  // For token obtain endpoints, preserve any existing Authorization header (like Basic Auth)
  const existingAuth = request.headers.get('Authorization');
  // If there's already Authorization header, keep it.
  // Otherwise, set Authorization header with the access token.
  if (!existingAuth && accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return {
    request,
    headers,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<{
  refresh: string;
  access: string;
}> {
  let host = process.env.NEXT_PUBLIC_HOST;
  if (host && host.endsWith('/')) {
    host = host.slice(0, -1);
  }
  if (!host) {
    throw new Error('NEXT_PUBLIC_HOST environment variable is not set');
  }

  const response = await fetch(`${host}/labelstudio/api/token/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.access || !data.refresh) {
    throw new Error('Invalid response: missing access or refresh token');
  }

  return {
    access: data.access,
    refresh: data.refresh,
  };
}
