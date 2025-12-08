import { NextRequest, NextResponse } from 'next/server';

const NON_TOKEN_REFRESH_PATHS = [
  '/user/login',
  '/user/logout',
  '/token/obtain',
  '/current-user/whoami',
];

export const config = {
  matcher: [
    // HTTP Requests
    '/next-api/external/:function*',
    // Page Routes
    '/dashboard/:path*',
    '/services/:path*',
  ],
};

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  console.info('Middleware called for path:', pathname);

  // LabelStudio API routes (include API endpoints + direct requests)
  if (pathname.startsWith('/next-api/external')) {
    return await handleHTTPRequests(request);
  }

  // Web page routes
  return handlePageRoutes(request);
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
  const fetchResponse = await fetch(handlingRequest, {
    method: handlingRequest.method,
    headers,
    body: handlingRequest.body,
  });

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
 */
function handlePageRoutes(request: NextRequest): NextResponse {
  console.info('Handling page routes: ' + request.nextUrl.pathname);
  const { pathname } = request.nextUrl;
  const csrfToken = request.cookies.get('csrftoken')?.value;
  const sessionID = request.cookies.get('sessionid')?.value;

  // Check if user is trying to access protected routes
  const isProtectedRoute =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/services') ||
    pathname === '/';

  if (isProtectedRoute) {
    // If any of csrfToken or sessionID is missing, redirect to login
    if (!(csrfToken && sessionID)) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Now there's both csrfToken and sessionID.
    // If user is on the root path, redirect to dashboard
    if (pathname === '/') {
      const dashboardUrl = new URL('/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Allow the request to continue
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
