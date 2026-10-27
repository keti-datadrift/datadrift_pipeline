import type { NextRequest } from 'next/server';

import { proxyExternalRequest } from '@/lib/server/external-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  return proxyExternalRequest(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
