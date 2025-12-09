import 'server-only';
import type { SupportedLocales } from './i18n';

const dictionaries = {
  ko: () =>
    import('./[lang]/dictionaries/ko.json').then((module) => module.default),
  en: () =>
    import('./[lang]/dictionaries/en.json').then((module) => module.default),
};

export const getDictionary = async (locale: SupportedLocales) =>
  dictionaries[locale]();
