import { NextRequest } from 'next/server';

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  request: NextRequest,
): Promise<string | null> {
  const refreshToken = request.cookies.get('ls_refresh_token')?.value;

  if (!refreshToken) {
    console.warn('No refresh token available');
    return null;
  }

  try {
    const baseURL =
      process.env.NEXT_PUBLIC_LABELSTUDIO_URL ||
      'http://121.126.210.2/labelstudio';
    const response = await fetch(`${baseURL}/api/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      console.error(
        'Token refresh failed:',
        response.status,
        response.statusText,
      );
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access;

    if (!newAccessToken) {
      console.error('No access token in refresh response');
      return null;
    }

    return newAccessToken;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    return null;
  }
}
