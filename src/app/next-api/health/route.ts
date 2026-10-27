import { NextResponse } from 'next/server';

export async function GET() {
  const healthcheck = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  };

  return NextResponse.json(healthcheck, { status: 200 });
}
