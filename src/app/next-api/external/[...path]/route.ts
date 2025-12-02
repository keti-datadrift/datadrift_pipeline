import { NextRequest, NextResponse } from 'next/server';

// 프록시 대상 URL
const TARGET_URL = process.env.NEXT_PUBLIC_LABELSTUDIO_URL || 'http://121.126.210.2/labelstudio';

// GET 요청 핸들러
export async function GET(request: NextRequest) {
  return handleProxy(request);
}

// POST 요청 핸들러
export async function POST(request: NextRequest) {
  return handleProxy(request);
}

// PUT 요청 핸들러
export async function PUT(request: NextRequest) {
  return handleProxy(request);
}

// DELETE 요청 핸들러
export async function DELETE(request: NextRequest) {
  return handleProxy(request);
}

// PATCH 요청 핸들러
export async function PATCH(request: NextRequest) {
  return handleProxy(request);
}

// 공통 프록시 핸들러
async function handleProxy(request: NextRequest) {
  try {
    const { pathname, search } = request.nextUrl;
    
    // /next-api/external 제거하고 실제 경로 추출
    const targetPath = pathname.replace('/next-api/external', '');
    const targetUrl = `${TARGET_URL}${targetPath}${search}`;
    
    console.log(`[PROXY] ${request.method} ${pathname} -> ${targetUrl}`);
    
    // 요청 헤더 준비
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      // 일부 헤더는 제외 (프록시에서 자동 처리)
      if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    });
    
    // 요청 본문 처리
    let body: any = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        const contentType = request.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          body = JSON.stringify(await request.json());
        } else {
          // FormData, form-urlencoded, 기타 모든 경우
          body = await request.arrayBuffer();
        }
      } catch (error) {
        console.warn('[PROXY] Body parsing error:', error);
        // body를 undefined로 유지
      }
    }
    
    // fetch로 프록시 요청
    const proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // credentials를 포함하여 쿠키 전달
      credentials: 'include',
    });
    
    // 응답 헤더 복사
    const responseHeaders = new Headers();
    proxyResponse.headers.forEach((value, key) => {
      // Set-Cookie 헤더는 별도 처리
      if (key.toLowerCase() !== 'set-cookie') {
        responseHeaders.set(key, value);
      }
    });
    
    // Set-Cookie 헤더 특별 처리
    const setCookieHeader = proxyResponse.headers.get('set-cookie');
    if (setCookieHeader) {
      console.log('[PROXY] Set-Cookie found:', setCookieHeader);
      responseHeaders.set('set-cookie', setCookieHeader);
    }

    // 응답 본문 처리 - SSE 스트림을 위해 조건부 처리
    const contentType = proxyResponse.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // SSE 스트림인 경우 응답 본문을 직접 스트리밍
      console.log('[PROXY] SSE stream detected, passing through response body');
      return new NextResponse(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: responseHeaders,
      });
    } else {
      // 일반 응답인 경우 기존 방식 사용
      const responseBody = await proxyResponse.arrayBuffer();
      return new NextResponse(responseBody, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error('[PROXY] Error:', error);
    return NextResponse.json(
      { error: 'Proxy error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
