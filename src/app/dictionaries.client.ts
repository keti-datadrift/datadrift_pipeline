import en from './[lang]/dictionaries/en.json';
import ko from './[lang]/dictionaries/ko.json';
import type { SupportedLocales } from './i18n';

export type AppDictionary = typeof en | typeof ko;

export function getClientDictionary(locale: SupportedLocales): AppDictionary {
  return locale === 'ko' ? ko : en;
}
