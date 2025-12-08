import { getCookie } from '@/lib/utils/cookie.util';
import { APIClient, ApiError } from '../../client';

export const getAuthPrerequisits = async (): Promise<string> => {
  try {
    // First, try to get CSRF token from existing cookies
    let middlewareCsrfToken = getCookie('csrftoken');

    // Only make the request if CSRF token is not already available
    if (!middlewareCsrfToken) {
      await APIClient.direct.get<void>('/user/login');
      middlewareCsrfToken = getCookie('csrftoken');
    }

    if (!middlewareCsrfToken) {
      throw new ApiError(0, 'CSRF token is not stored in browser cookie');
    }

    return middlewareCsrfToken;
  } catch (error) {
    console.error('Failed to get csrfToken on middleware: ', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to get csrfToken on middleware');
  }
};

export const directLogin = async (
  email: string,
  password: string,
): Promise<string> => {
  try {
    // Create form data for Django form submission
    const formData = new FormData();
    formData.append('csrfmiddlewaretoken', csrfMiddlewareToken);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('persist_session', 'on');

    await APIClient.direct.post<void>('/user/login/', {
      data: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const csrfToken = getCookie('csrftoken');
    if (!csrfToken) {
      throw new ApiError(
        0,
        `Failed to login, no CSRF token found from browser cookie`,
      );
    }

    return csrfToken;
  } catch (error) {
    console.error('Failed to login:', error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Failed to login');
  }
};
