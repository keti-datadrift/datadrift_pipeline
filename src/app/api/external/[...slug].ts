import { NextRequest, NextResponse } from 'next/server';

const CORE_API_PORT = process.env.CORE_API_PORT || '9030';

// 전달하지 않을 헤더 목록
const EXCLUDED_REQUEST_HEADERS = [
  'host',
  'connection',
  'keep-alive',
  'upgrade',
  'te',
  'trailer',
  'transfer-encoding',
];

const EXCLUDED_RESPONSE_HEADERS = [
  'content-encoding',
  'transfer-encoding',
  'connection',
];

async function handler(
  req: NextRequest,
  { params }: { params: { slug: string[] } },
) {
  const { slug } = params;
  const path = slug.join('/');

  // 전체 대상 URL 구성
  const targetUrl = `http://api:${CORE_API_PORT}/v1/${path}`;

  // 원본 요청의 검색 파라미터(query string) 전달
  const searchParams = req.nextUrl.search;
  const urlWithParams = `${targetUrl}${searchParams}`;

  try {
    // 요청 헤더 준비 - 더 많은 헤더를 전달
    const requestHeaders = new Headers();
    req.headers.forEach((value, key) => {
      if (!EXCLUDED_REQUEST_HEADERS.includes(key.toLowerCase())) {
        requestHeaders.set(key, value);
      }
    });

    // 요청 바디 준비
    let body: any = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const contentType = req.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        try {
          body = await req.json();
          body = JSON.stringify(body);
        } catch {
          // JSON 파싱 실패 시 원본 body 사용
          body = req.body;
        }
      } else if (contentType?.includes('multipart/form-data')) {
        // FormData 처리
        body = await req.formData();
      } else {
        // 기타 바디 타입
        body = req.body;
      }
    }

    const response = await fetch(urlWithParams, {
      method: req.method,
      headers: requestHeaders,
      body,
      // @ts-ignore - Next.js fetch options
      duplex: 'half', // 스트리밍 지원
    });

    // 응답 처리
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (!EXCLUDED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // CORS 헤더 추가 (필요한 경우)
    const origin = req.headers.get('origin');
    if (origin) {
      responseHeaders.set('Access-Control-Allow-Origin', origin);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    }

    // 응답 타입에 따른 처리
    const contentType = response.headers.get('content-type');
    let responseBody;

    if (contentType?.includes('application/json')) {
      responseBody = await response.json();
      return NextResponse.json(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else if (contentType?.includes('text/event-stream')) {
      // SSE (Server-Sent Events) 지원
      return new NextResponse(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } else {
      // 기타 응답 타입
      responseBody = await response.text();
      return new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error(`[API Proxy Error] ${req.method} ${urlWithParams}:`, error);

    // 더 구체적인 에러 처리
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      return NextResponse.json(
        {
          error: 'API server unavailable',
          details: 'Could not connect to the backend API server',
          service: 'api',
          port: CORE_API_PORT,
        },
        { status: 503 }, // Service Unavailable
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: 'Proxy request failed', details: errorMessage },
      { status: 502 }, // Bad Gateway
    );
  }
}

// OPTIONS 메서드를 위한 별도 핸들러 (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = new Headers();

  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    );
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Max-Age', '86400');
  }

  return new NextResponse(null, { status: 204, headers });
}

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
