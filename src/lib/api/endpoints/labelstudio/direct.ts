import { getCookie } from '@/lib/utils/cookie.util';
import { APIClient, ApiError } from '../../client';

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

    const _ = await APIClient.direct.post<void>('/user/login/', {
      data: formData,
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
