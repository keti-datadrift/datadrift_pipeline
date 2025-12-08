import { APIClient } from '../client';
import { APIError } from '../types';

export const getAccessTokenByRefresh = async (refresh: string): Promise<string> => {
  try {
    const response = await APIClient.external.post<{ access: string }>(
      '/token/refresh/',
      { data: { refresh } },
    );
    if (!response.access) throw new APIError(0, 'No access token in response');
    return response.access;
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to refresh access token');
  }
};

// Obtain access/refresh tokens using email and password (Basic Auth)
export const getTokensByCredentials = async (
  email: string,
  password: string,
): Promise<void> => {
  try {
    const basicAuth = btoa(`${email}:${password}`);
    
    await APIClient.external.post('/token/obtain/', {
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
    });
  } catch (error) {
    console.error('Failed to obtain tokens:', error);
    if (error instanceof APIError) throw error;
    throw new APIError(0, 'Failed to obtain tokens');
  }
};
