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

export async function generateStaticParams() {
  return [{ lang: 'en-US' }, { lang: 'de' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: SupportedLocales }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
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
  params: Promise<{ lang: SupportedLocales }>;
}>) {
  const { lang } = React.use(params);
  return (
    <html lang={lang} className={`${jetbrainsMono.variable}`}>
      <body className={'antialiased bg-sidebar-background'}>
        <I18nProvider locale={lang}>
          <AuthProvider>
            <main className="flex-1">{children}</main>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
