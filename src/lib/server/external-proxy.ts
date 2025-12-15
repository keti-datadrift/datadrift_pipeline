import { NextRequest, NextResponse } from 'next/server';

import { refreshAccessToken as refreshTokenUtil } from '@/lib/api/utils/token.utils';

const isDev = process.env.NODE_ENV !== 'production';
const logInfo = (...args: unknown[]): void => {
  console.info(...args);
};
const logDebug = (...args: unknown[]): void => {
  console.debug(...args);
};

export const locales = ['ko', 'en'] as const;
export type Locale = (typeof locales)[number];

const PROXY_PREFIX = '/next-api/external';
const TARGET_PREFIX = '/labelstudio';
const NON_TOKEN_REFRESH_PATHS = [
  '/user/login',
  '/user/logout',
  '/token/obtain',
  '/current-user/whoami',
] as const;

type LocaleStripResult = {
  locale: Locale | null;
  pathname: string;
};

export function stripLocaleFromPathname(pathname: string): LocaleStripResult {
  for (const locale of locales) {
    if (pathname === `/${locale}`) {
      return { locale, pathname: '/' };
    }

    if (pathname.startsWith(`/${locale}/`)) {
      const rest = pathname.slice(locale.length + 1);
      return { locale, pathname: rest ? `/${rest}` : '/' };
    }
  }

  return { locale: null, pathname };
}

export async function proxyExternalRequest(
  request: NextRequest,
): Promise<Response> {
  const rewritten = rewriteExternalRequest(request);
  if (rewritten instanceof NextResponse) {
    return rewritten;
  }

  let handlingRequest = rewritten;
  logDebug('1️⃣ Rewritten request:', handlingRequest.nextUrl.pathname);

  const { request: newRequest, headers } =
    await attachAuthorizationHeader(handlingRequest);
  handlingRequest = newRequest;
  logDebug(
    '2️⃣ Added Authorization header:',
    handlingRequest.nextUrl.pathname,
    handlingRequest.headers,
  );

  const body = await readRequestBody(handlingRequest);

  for (const [key, value] of headers.entries()) {
    logDebug(`Fetching with headers: ${key} - ${value}`);
  }

  let fetchResponse: Response;
  try {
    fetchResponse = await fetch(handlingRequest.url, {
      method: handlingRequest.method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (error: any) {
    logInfo('❌ Upstream fetch failed:', {
      url: handlingRequest.url,
      method: handlingRequest.method,
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      cause: String(error?.cause || ''),
    });

    return NextResponse.json(
      {
        error: 'Upstream connection failed',
        detail: {
          url: handlingRequest.url,
          code: error?.code,
          message: error?.message,
        },
      },
      { status: 502 },
    );
  }

  logDebug('📥 Response status:', fetchResponse.status);
  for (const [key, value] of fetchResponse.headers.entries()) {
    logDebug(`Fetch Response Headers: ${key} - ${value}`);
  }

  if (fetchResponse.status >= 300 && fetchResponse.status < 400) {
    const location = fetchResponse.headers.get('location');
    logDebug('🔄 Redirect detected to:', location);

    if (location) {
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location);
      } catch {
        redirectUrl = new URL(location, handlingRequest.url);
      }

      logDebug('🔄 Full redirect URL:', redirectUrl.toString());

      // Let the browser follow redirects (especially for login) so it can store
      // any new session cookies that arrived with the 3xx response.
    }
  }

  const responseHeaders = new Headers(fetchResponse.headers);
  rewriteSetCookieHeaders(responseHeaders);

  const contentType = responseHeaders.get('content-type');
  const ResponseType = contentType?.includes('text/event-stream')
    ? Response
    : NextResponse;

  const response = new ResponseType(fetchResponse.body, {
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    headers: responseHeaders,
  });

  const validAccessToken = handlingRequest.cookies.get('ls_access_token');
  if (validAccessToken) {
    response.headers.append(
      'Set-Cookie',
      `ls_access_token=${validAccessToken.value}; Path=/; Max-Age=${60 * 60 * 24}; HttpOnly; SameSite=Lax`,
    );
  }

  return response;
}

function rewriteSetCookieHeaders(headers: Headers): void {
  const setCookieValues = getSetCookieHeaders(headers);
  if (setCookieValues.length === 0) return;

  headers.delete('set-cookie');
  for (const value of setCookieValues) {
    headers.append('Set-Cookie', enforceRootPath(value));
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const anyHeaders = headers as unknown as {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };

  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie();
  }

  const rawHeaders = anyHeaders.raw?.();
  if (rawHeaders && Array.isArray(rawHeaders['set-cookie'])) {
    return rawHeaders['set-cookie'];
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? [singleHeader] : [];
}

function enforceRootPath(setCookieValue: string): string {
  const pathRegex = /path=([^;]+)/i;
  if (pathRegex.test(setCookieValue)) {
    return setCookieValue.replace(pathRegex, 'Path=/');
  }

  return `${setCookieValue}; Path=/`;
}

function rewriteExternalRequest(
  request: NextRequest,
): NextRequest | NextResponse {
  logRequest('🚦 🛜 Given HTTP request:', request);

  let host = process.env.NEXT_PUBLIC_HOST;
  if (host && host.endsWith('/')) {
    host = host.slice(0, -1);
  }

  if (!host) {
    logInfo(
      'Missing NEXT_PUBLIC_HOST environment variable; blocking proxied request.',
    );
    return NextResponse.json(
      {
        error: 'Server is not configured for external API proxying.',
      },
      { status: 500 },
    );
  }

  const { pathname: normalizedPathname } = stripLocaleFromPathname(
    request.nextUrl.pathname,
  );

  if (!normalizedPathname.startsWith(PROXY_PREFIX)) {
    logInfo('Request path does not match proxy prefix:', normalizedPathname);
    return NextResponse.next();
  }

  const newPathname = normalizedPathname.replace(PROXY_PREFIX, TARGET_PREFIX);
  const targetUrl = new URL(newPathname + request.nextUrl.search, host);
  const newRequest = new NextRequest(targetUrl, request);

  logRequest('🚦 🛜 Rewritten HTTP request:', newRequest);
  logInfo('Sending request to: ', newRequest.url);

  return newRequest;
}

function logRequest(prefix: string, request: NextRequest): void {
  logInfo(
    `${prefix} ${JSON.stringify({
      Host: request.nextUrl.host,
      Path: request.nextUrl.pathname,
      Search: request.nextUrl.search,
    })}`,
  );
}

async function readRequestBody(
  handlingRequest: NextRequest,
): Promise<BodyInit | undefined> {
  if (handlingRequest.method === 'GET' || handlingRequest.method === 'HEAD') {
    return undefined;
  }

  const clonedRequest = handlingRequest.clone();
  const contentType = handlingRequest.headers.get('content-type') || '';

  logDebug('📝 Request Content-Type:', contentType);
  logDebug('📝 Request Method:', handlingRequest.method);
  logDebug('📝 Request URL:', handlingRequest.url);

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await clonedRequest.text();
    logDebug('📝 Body as URL-encoded:', body.substring(0, 200));
    return body;
  }

  if (contentType.includes('multipart/form-data')) {
    logDebug('📝 Body as multipart form-data');
    return await clonedRequest.blob();
  }

  if (contentType.includes('application/json')) {
    const body = await clonedRequest.text();
    logDebug('📝 Body as JSON:', body.substring(0, 200));
    return body;
  }

  const body = await clonedRequest.arrayBuffer();
  logDebug('📝 Body as ArrayBuffer, size:', body.byteLength);
  return body;
}

async function attachAuthorizationHeader(request: NextRequest): Promise<{
  request: NextRequest;
  headers: Headers;
}> {
  const headers = new Headers(request.headers);
  let accessToken = request.cookies.get('ls_access_token')?.value;
  const refreshToken = request.cookies.get('ls_refresh_token')?.value;

  const shouldSkipTokenRefresh = NON_TOKEN_REFRESH_PATHS.some((path) =>
    request.nextUrl.pathname.includes(path),
  );

  if (!accessToken && !shouldSkipTokenRefresh) {
    if (!refreshToken) {
      throw new Error('Both Access and Refresh tokens are missing.');
    }

    try {
      const refreshed = await refreshTokenUtil(request);
      if (!refreshed) throw new Error('No access token returned');
      accessToken = refreshed;
    } catch (error) {
      throw new Error('Failed to refresh access token: ' + error);
    }
  }

  const existingAuth = request.headers.get('Authorization');
  if (!existingAuth && accessToken && !shouldSkipTokenRefresh) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return {
    request,
    headers,
  };
}
