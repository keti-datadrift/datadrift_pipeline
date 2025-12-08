'use client';

import { getTokensByCredentials, logout } from '@/api/endpoints';
import { directLogin } from '@/api/endpoints/labelstudio/direct';
import { getCurrentUser } from '@/lib/api/endpoints/users';
import { TrainingHistoryStorage } from '@/lib/training-history';
import { useRouter } from 'next/navigation';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  /**
   * `undefined` = checking, `false` = not auth, `true` = authenticated
   */
  isAuthenticated?: boolean;
  isLoading: boolean;
  loginAction: (
    email: string,
    password: string,
    csrfToken: string,
    e?: React.FormEvent,
  ) => Promise<void>;
  logoutAction: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  return { isAuthenticated, setIsAuthenticated, isLoading, setIsLoading };
}

function useAuthRedirect(isAuthenticated: boolean | undefined) {
  const router = useRouter();

  const handleAuthRedirect = useCallback(() => {
    console.info(`Auth redirect triggered: ${isAuthenticated}`);
    if (isAuthenticated === undefined) return;

    const currentPath = window.location.pathname;
    const isPublicRoute = ['/', '/login'].some((path) => {
      return currentPath === path;
    });

    if (isAuthenticated && isPublicRoute) {
      router.replace('/dashboard');
    } else if (!isAuthenticated) {
      if (!isPublicRoute || currentPath === '/') {
        router.replace('/login');
      }
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    handleAuthRedirect();
  }, [handleAuthRedirect]);
}

function useAuthActions(
  setIsAuthenticated: (value: boolean) => void,
  setIsLoading: (value: boolean) => void,
) {
  const router = useRouter();

  const checkAuthStatus = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      await getCurrentUser();
      setIsAuthenticated(true);
    } catch (error) {
      console.warn('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, [setIsAuthenticated, setIsLoading]);

  const performLogin = useCallback(
    async (email: string, password: string, csrfToken: string) => {
      await directLogin(email, password, csrfToken);
      await getTokensByCredentials(email, password);
      await checkAuthStatus();
    },
    [checkAuthStatus],
  );

  const loginAction = useCallback(
    async (
      email: string,
      password: string,
      csrfToken: string,
      e?: React.FormEvent,
    ) => {
      if (e) e.preventDefault();
      if (!csrfToken) {
        console.warn('CSRF middleware token is missing');
        return;
      }

      try {
        await performLogin(email, password, csrfToken);
      } catch (err) {
        console.error(err);
        setIsAuthenticated(false);
      }
    },
    [performLogin, setIsAuthenticated],
  );

  const clearClientStorage = useCallback(() => {
    try {
      TrainingHistoryStorage.clearTrainingHistory();
    } catch (e) {
      console.warn('Failed to clear local storage on logout', e);
    }
  }, []);

  const performServerLogout = useCallback(async () => {
    const { redirectTo } = await logout();
    setIsAuthenticated(false);

    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [router, setIsAuthenticated]);

  const logoutAction = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      await performServerLogout();
    } catch (err) {
      console.error(
        'Logout request failed, continuing with client cleanup',
        err,
      );
    } finally {
      clearClientStorage();
      setIsLoading(false);
    }
  }, [performServerLogout, clearClientStorage, setIsLoading]);

  useEffect(() => {
    checkAuthStatus().catch(console.error);
  }, [checkAuthStatus]);

  return { checkAuthStatus, loginAction, logoutAction };
}

/**
 * 로그인, 인증과 관련된 상태와 로직들을 제공하는 Context 제공자입니다.
 * 해당 제공자의 children 컴포넌트들은 {@link useAuthContext}를 통해 정보들을 제공받을 수 있습니다.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { isAuthenticated, setIsAuthenticated, isLoading, setIsLoading } =
    useAuthState();
  const { checkAuthStatus, loginAction, logoutAction } = useAuthActions(
    setIsAuthenticated,
    setIsLoading,
  );

  useAuthRedirect(isAuthenticated);

  const value = {
    isAuthenticated,
    isLoading,
    loginAction,
    logoutAction,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * {@link AuthProvider}를 통해 Context를 제공받은 컴포넌트에서 해당 값들을 사용하기 위한 Hook
 *
 * @returns AuthContextType
 * -  `isAuthenticated`: 사용자 인증 상태
 * -  `isLoading`: 로딩 중 여부
 */
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within a AuthProvider');
  }
  return context;
}
