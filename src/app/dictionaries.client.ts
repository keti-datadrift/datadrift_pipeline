import type { SupportedLocales } from './i18n';
import ko from './[lang]/dictionaries/ko.json';
import en from './[lang]/dictionaries/en.json';

export type AppDictionary = typeof en;

export function getClientDictionary(locale: SupportedLocales): AppDictionary {
  return locale === 'ko' ? ko : en;
}
