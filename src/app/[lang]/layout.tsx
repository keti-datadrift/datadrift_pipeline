import type { SupportedLocales } from '@/app/i18n';
import { AuthProvider } from '@/contexts/AuthContext';
import { I18nProvider } from '@/contexts/I18nContext';
import type { Metadata } from 'next';
import { getDictionary } from '@/app/dictionaries';
import '../globals.css';
import { JetBrains_Mono } from 'next/font/google';
import React from 'react';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

// Note: Next.js will type-check layout props via its build-time plugin.
// We keep local props simple and align `params.lang` to `string` for compatibility.

export async function generateStaticParams() {
  // Keep in sync with SupportedLocales
  return [{ lang: 'en' }, { lang: 'ko' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale: SupportedLocales = lang === 'ko' ? 'ko' : 'en';
  const dict = await getDictionary(locale);
  return {
    title: dict.app.title,
    description: dict.app.description,
  };
}

export default function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = React.use(params);
  const locale: SupportedLocales = lang === 'ko' ? 'ko' : 'en';
  return (
    <html lang={locale} className={`${jetbrainsMono.variable}`}>
      <body className={'antialiased bg-sidebar-background'}>
        <I18nProvider locale={locale}>
          <AuthProvider>
            <main className="flex-1">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
