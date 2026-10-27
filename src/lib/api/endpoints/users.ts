import { APIClient } from '../client';
import { APIError } from '../types';

interface User {
  id: number;
  email: string;
  username: string;
  [key: string]: any;
}

/**
 * 현재 로그인된 사용자 정보를 가져옵니다.
 * 인증 쿠키가 없거나 유효하지 않으면 APIError가 발생합니다.
 */
export const getCurrentUser = async (): Promise<User> => {
  try {
    return await APIClient.external.get<User>('/current-user/whoami');
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to fetch current user');
  }
};

/**
 * 로그아웃을 수행합니다.
 * 서버 상에서만 로그아웃 처리가 진행됩니다. 클라이언트 측 로그아웃은 따로 처리가 필요합니다.
 *
 * @returns 로그아웃 후 리다이렉트 URL
 */
export const logout = async (): Promise<{ redirectTo: string }> => {
  try {
    // Request JSON response to avoid browser following redirects to HTML
    await APIClient.direct.post<void>('/logout', {
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    return { redirectTo: '/login' };
  } catch (error) {
    if (error instanceof APIError) {
      // APIClient에서 발생시킨 에러는 그대로 전달
      throw error;
    }
    // 그 외 네트워크 에러 등
    throw new APIError(0, 'Failed to logout');
  }
};
