'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { SupportedLocales } from '@/app/i18n';
import type { AppDictionary } from '@/app/dictionaries.client';
import { getClientDictionary } from '@/app/dictionaries.client';

type I18nContextValue = {
  locale: SupportedLocales;
  dict: AppDictionary;
  t: (path: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function get(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : undefined), obj);
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return Object.keys(params).reduce(
    (s, k) => s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k])),
    str,
  );
}

export function I18nProvider({
  locale,
  children,
}: {
  locale: SupportedLocales;
  children: React.ReactNode;
}) {
  const dict = useMemo(() => getClientDictionary(locale), [locale]);

  const t = useMemo(() => {
    return (path: string, params?: Record<string, string | number>) => {
      const value = get(dict, path);
      if (typeof value === 'string') return interpolate(value, params);
      return path; // fallback to key if missing
    };
  }, [dict]);

  const value = useMemo(() => ({ locale, dict, t }), [locale, dict, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

